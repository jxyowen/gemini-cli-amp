/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
} from '@google/genai';
import { ContentGenerator, ContentGeneratorConfig } from '../core/contentGenerator.js';
import {
  toQwenGenerateRequest,
  fromQwenGenerateResponse,
  fromQwenStreamResponse,
  toQwenCountTokensRequest,
  fromQwenCountTokensResponse,
  QwenGenerateResponse,
} from './converter.js';

/**
 * HTTP选项接口
 */
export interface HttpOptions {
  headers?: Record<string, string>;
}

/**
 * 通义千问 ContentGenerator 实现
 */
export class QwenContentGenerator implements ContentGenerator {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly httpOptions: HttpOptions;

  constructor(
    config: ContentGeneratorConfig,
    httpOptions: HttpOptions = {}
  ) {
    if (!config.apiKey) {
      throw new Error('API key is required for Qwen API');
    }
    
    this.apiKey = config.apiKey;
    this.baseUrl = config.qwenConfig?.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    this.httpOptions = httpOptions;
  }

  /**
   * 生成内容 - 同步调用
   */
  async generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    const qwenRequest = toQwenGenerateRequest(request, false);
    
    const response = await this.makeApiCall('/chat/completions', {
      model: qwenRequest.model,
      messages: qwenRequest.messages,
      temperature: qwenRequest.temperature,
      top_p: qwenRequest.top_p,
      max_tokens: qwenRequest.max_tokens,
      stop: qwenRequest.stop,
      tools: qwenRequest.tools,
      response_format: qwenRequest.response_format,
      stream: false,
      // 根据用户要求，显式设置 enable_thinking 为 false
      enable_thinking: false,
    }, request.config?.abortSignal);

    return fromQwenGenerateResponse(response);
  }

  /**
   * 生成内容 - 流式调用
   */
  async generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const qwenRequest = toQwenGenerateRequest(request, true);
    
    const streamResponse = await this.makeStreamApiCall('/chat/completions', {
      model: qwenRequest.model,
      messages: qwenRequest.messages,
      temperature: qwenRequest.temperature,
      top_p: qwenRequest.top_p,
      max_tokens: qwenRequest.max_tokens,
      stop: qwenRequest.stop,
      tools: qwenRequest.tools,
      response_format: qwenRequest.response_format,
      stream: true,
      // 根据用户要求，显式设置 enable_thinking 为 false
      enable_thinking: false,
    }, request.config?.abortSignal);

    return this.processStreamResponse(streamResponse);
  }

  /**
   * 计算token数量
   */
  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // OpenAI 兼容模式下暂不支持专门的 token 计算接口
    // 返回估算值或在实际调用时获取真实的 token 使用量
    return {
      totalTokens: 0,
      cachedContentTokenCount: 0
    };
  }

  /**
   * 嵌入内容（通义千问不直接支持，抛出错误）
   */
  async embedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    throw new Error('Embedding is not supported by Qwen API. Please use a different provider for embedding functionality.');
  }

  /**
   * 发起 HTTP API 调用
   */
  private async makeApiCall(
    endpoint: string,
    body: any,
    signal?: AbortSignal
  ): Promise<QwenGenerateResponse> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'X-DashScope-SSE': 'disable',
        ...this.httpOptions.headers,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Qwen API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    
    if (result.code && result.code !== '200') {
      throw new Error(`Qwen API error: ${result.message || 'Unknown error'}`);
    }

    return result;
  }

  /**
   * 发起流式 HTTP API 调用
   */
  private async makeStreamApiCall(
    endpoint: string,
    body: any,
    signal?: AbortSignal
  ): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'text/event-stream',
        'X-DashScope-SSE': 'enable',
        ...this.httpOptions.headers,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Qwen API error (${response.status}): ${errorText}`);
    }

    return response;
  }

  /**
   * 处理流式响应
   */
  private async *processStreamResponse(
    response: Response
  ): AsyncGenerator<GenerateContentResponse> {
    const reader = response.body?.getReader();  
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    
    // 累积tool_calls的状态
    const accumulatedToolCalls = new Map<string, {
      id: string;
      type: string;
      function: {
        name?: string;
        arguments?: string;
      };
    }>();
    
    let hasOutputToolCalls = false; // 跟踪是否已经输出了工具调用

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // 流正常结束，如果有累积的tool_calls且未输出，立即输出
          if (accumulatedToolCalls.size > 0 && !hasOutputToolCalls) {
            console.debug('[DEBUG] 流结束时输出累积的tool_calls');
            yield this.createToolCallResponse(accumulatedToolCalls);
            hasOutputToolCalls = true;
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim(); 
            if (data === '[DONE]') {
              // 流结束，如果有累积的tool_calls且未输出，输出最终结果
              if (accumulatedToolCalls.size > 0 && !hasOutputToolCalls) {
                console.debug('[DEBUG] [DONE]时输出累积的tool_calls');
                yield this.createToolCallResponse(accumulatedToolCalls);
                hasOutputToolCalls = true;
              }
              return;
            }
            
            try {
              const chunk = JSON.parse(data);
              // 检查是否有choices数组，这是OpenAI兼容格式的标准字段
              if (chunk.choices && chunk.choices.length > 0) {
                const choice = chunk.choices[0];
                
                // 处理tool_calls累积
                if (choice.delta?.tool_calls && choice.delta.tool_calls.length > 0) {
                  // 仅在调试模式下输出详细日志
                  if (process.env.DEBUG || process.env.DEBUG_MODE) {
                    console.error('[DEBUG] 接收到tool_calls片段:', choice.delta.tool_calls.length, '个');
                  }
                  
                  for (const toolCall of choice.delta.tool_calls) {
                    // 使用index作为主要标识符（OpenAI流式格式），id作为备选
                    const toolCallId = toolCall.index !== undefined ? 
                      `tool_${toolCall.index}` : 
                      (toolCall.id || `tool_${Date.now()}`);
                    
                    if (process.env.DEBUG || process.env.DEBUG_MODE) {
                      console.error('[DEBUG] 处理tool_call片段:', JSON.stringify(toolCall, null, 2));
                    }
                    
                    if (!accumulatedToolCalls.has(toolCallId)) {
                      if (process.env.DEBUG || process.env.DEBUG_MODE) {
                        console.error('[DEBUG] 创建新的tool_call累积器:', toolCallId);
                      }
                      accumulatedToolCalls.set(toolCallId, {
                        id: toolCall.id || toolCallId,  // 保存原始id或使用生成的id
                        type: toolCall.type || 'function',
                        function: {}
                      });
                    }
                    
                    const accumulated = accumulatedToolCalls.get(toolCallId)!;
                    
                    // 累积function name（通常只在第一个片段中出现）
                    if (toolCall.function?.name) {
                      if (process.env.DEBUG || process.env.DEBUG_MODE) {
                        console.error('[DEBUG] 设置function name:', toolCall.function.name);
                      }
                      accumulated.function.name = toolCall.function.name;
                    }
                    
                    // 累积function arguments（每个片段可能都有部分内容）
                    if (toolCall.function?.arguments) {
                      const beforeArgs = accumulated.function.arguments || '';
                      accumulated.function.arguments = beforeArgs + toolCall.function.arguments;
                      if (process.env.DEBUG || process.env.DEBUG_MODE) {
                        console.error('[DEBUG] 累积arguments:', {
                          toolCallId,
                          thisChunk: toolCall.function.arguments,
                          beforeLength: beforeArgs.length,
                          afterLength: accumulated.function.arguments.length,
                          totalToolCalls: accumulatedToolCalls.size,
                          accumulatedSoFar: accumulated.function.arguments
                        });
                      }
                    }
                    
                    if (process.env.DEBUG || process.env.DEBUG_MODE) {
                      console.error('[DEBUG] 当前累积状态:', JSON.stringify(accumulated, null, 2));
                    }
                  }
                  
                  // 检查是否所有工具调用都完整了（有name和完整的arguments）
                  const allToolCallsComplete = Array.from(accumulatedToolCalls.values()).every(toolCall => {
                    return toolCall.function.name && 
                           toolCall.function.arguments && 
                           this.isValidJson(toolCall.function.arguments);
                  });
                  
                  // 如果所有工具调用都完整了，立即输出
                  if (allToolCallsComplete && accumulatedToolCalls.size > 0 && !hasOutputToolCalls) {
                    console.debug('[DEBUG] 所有工具调用完整，立即输出');
                    yield this.createToolCallResponse(accumulatedToolCalls);
                    hasOutputToolCalls = true;
                  }
                  
                  // 对于tool_calls，不立即输出普通内容，继续累积
                  continue;
                }
                
                // 如果有finish_reason，说明流已结束
                if (choice.finish_reason) {
                  // 输出最后的内容（如果有）
                  if (choice.delta?.content && choice.delta.content.trim()) {
                    yield fromQwenStreamResponse(chunk);
                  }
                  
                  // 输出累积的tool_calls（如果有且未输出）
                  if (accumulatedToolCalls.size > 0 && !hasOutputToolCalls) {
                    console.debug('[DEBUG] finish_reason时输出累积的tool_calls');
                    yield this.createToolCallResponse(accumulatedToolCalls);
                    hasOutputToolCalls = true;
                  }
                  return;
                }
                
                // 处理普通文本内容（立即流式输出）
                if (choice.delta?.content && choice.delta.content.trim()) {
                  yield fromQwenStreamResponse(chunk);
                }
              }
            } catch (error) {
              console.warn('Failed to parse SSE chunk:', error);
            }
          }
        }
      }
    } catch (error) {
      // 异常情况下，确保工具调用被输出
      if (accumulatedToolCalls.size > 0 && !hasOutputToolCalls) {
        console.debug('[DEBUG] 异常情况下输出累积的tool_calls');
        try {
          yield this.createToolCallResponse(accumulatedToolCalls);
        } catch (outputError) {
          console.error('[DEBUG] 输出工具调用时发生错误:', outputError);
        }
      }
      throw error;
    } finally {
      reader.releaseLock();
    }
  }
  
  /**
   * 检查字符串是否为有效的JSON
   */
  private isValidJson(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * 检查工具调用是否足够完整可以执行
   */
  private isToolCallReady(toolCall: any): boolean {
    // 必须有function name
    if (!toolCall.function?.name) {
      return false;
    }
    
    // 如果没有arguments，认为是无参数调用，也是完整的
    if (!toolCall.function.arguments) {
      return true;
    }
    
    // 如果有arguments，必须是有效的JSON
    return this.isValidJson(toolCall.function.arguments);
  }

  /**
   * 创建tool call响应
   */
  private createToolCallResponse(
    accumulatedToolCalls: Map<string, any>
  ): GenerateContentResponse {
    const parts: any[] = [];
    const functionCalls: any[] = [];
    
    console.debug(`[DEBUG] 开始处理累积的tool_calls: ${accumulatedToolCalls.size} 个`);
    
    // 过滤出足够完整的工具调用
    const readyToolCalls = Array.from(accumulatedToolCalls.values()).filter(toolCall => {
      const isReady = this.isToolCallReady(toolCall);
      if (!isReady) {
        console.warn(`[WARN] 工具调用不完整，跳过: ${JSON.stringify({
          id: toolCall.id,
          name: toolCall.function?.name || 'unknown',
          hasArguments: !!toolCall.function?.arguments,
          argumentsLength: toolCall.function?.arguments?.length || 0
        })}`);
      }
      return isReady;
    });
    
    if (readyToolCalls.length === 0) {
      console.warn('[WARN] 没有完整的工具调用可以处理');
      // 返回一个空的响应，而不是抛出错误
      return {
        candidates: [{
          content: {
            role: 'model',
            parts: [{ text: '' }],
          },
          finishReason: 'STOP',
          index: 0,
        }],
      } as GenerateContentResponse;
    }
    
    console.debug(`[DEBUG] 处理 ${readyToolCalls.length} 个完整的工具调用`);
    
    for (const toolCall of readyToolCalls) {
      console.debug(`[DEBUG] 处理工具调用: ${JSON.stringify({
        id: toolCall.id,
        name: toolCall.function?.name,
        argumentsLength: toolCall.function?.arguments?.length || 0
      })}`);
      
      let args = {};
      
      // 处理arguments
      if (toolCall.function.arguments) {
        try {
          console.debug(`[DEBUG] 尝试解析arguments: ${toolCall.function.arguments.substring(0, 100)}${toolCall.function.arguments.length > 100 ? '...' : ''}`);
          args = JSON.parse(toolCall.function.arguments);
          console.debug(`[DEBUG] 成功解析tool_call参数: ${JSON.stringify(args)}`);
        } catch (error) {
          console.error(`[ERROR] 解析tool call参数失败: ${toolCall.function.arguments}`, error);
          
          // 尝试修复常见的JSON格式问题
          let fixedArgs = toolCall.function.arguments.trim();
          
          // 尝试移除可能的不完整结尾
          if (fixedArgs.endsWith(',') || fixedArgs.endsWith('",')) {
            fixedArgs = fixedArgs.replace(/,\s*$/, '');
          }
          
          // 尝试补全不完整的JSON
          if (fixedArgs.startsWith('{') && !fixedArgs.endsWith('}')) {
            fixedArgs += '}';
          }
          if (fixedArgs.startsWith('[') && !fixedArgs.endsWith(']')) {
            fixedArgs += ']';
          }
          
          try {
            args = JSON.parse(fixedArgs);
            console.debug(`[DEBUG] 修复后成功解析参数: ${JSON.stringify(args)}`);
          } catch (fixError) {
            console.error(`[ERROR] 修复后仍无法解析参数: ${fixedArgs}`, fixError);
            // 最后的fallback：将原始字符串作为单个参数
            if (toolCall.function.arguments.trim()) {
              args = { _raw_arguments: toolCall.function.arguments };
            } else {
              args = {};
            }
          }
        }
      } else {
        // 无参数的工具调用
        console.debug(`[DEBUG] 无参数工具调用: ${toolCall.function.name}`);
        args = {};
      }
      
      // 确保有有效的function name
      const functionName = toolCall.function?.name || 'unknown_function';
      
      const functionCall = {
        id: toolCall.id || `${functionName}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        name: functionName,
        args,
      };
      
      console.debug(`[DEBUG] 生成的最终functionCall: ${JSON.stringify({
        id: functionCall.id,
        name: functionCall.name,
        argsKeys: Object.keys(functionCall.args)
      })}`);
      
      // 添加到parts数组中（用于GenerateContentResponse的标准格式）
      parts.push({ functionCall });
      
      // 添加到functionCalls数组中（用于响应级别属性）
      functionCalls.push(functionCall);
    }

    const candidate: any = {
      content: {
        role: 'model',
        parts,
      },
      finishReason: 'STOP',
      index: 0,
    };

    // 构建最终响应
    const response: any = {
      candidates: [candidate],
    };
    
    // 设置functionCalls属性（这是关键！）
    if (functionCalls.length > 0) {
      response.functionCalls = functionCalls;
      console.debug(`[DEBUG] 设置响应的functionCalls属性，包含 ${functionCalls.length} 个工具调用`);
    }
    
    console.debug(`[DEBUG] 最终生成的响应结构: ${JSON.stringify({
      candidateCount: response.candidates?.length,
      functionCallCount: response.functionCalls?.length,
      partsCount: response.candidates?.[0]?.content?.parts?.length
    })}`);
    
    return response as GenerateContentResponse;
  }
} 