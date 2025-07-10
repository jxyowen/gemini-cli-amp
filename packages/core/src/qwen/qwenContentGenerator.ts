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
      stream: false,
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
      stream: true,
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

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim(); 
            if (data === '[DONE]') {
              // 流结束，如果有累积的tool_calls，输出最终结果
              if (accumulatedToolCalls.size > 0) {
                yield this.createToolCallResponse(accumulatedToolCalls);
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
                  for (const toolCall of choice.delta.tool_calls) {
                    const toolCallId = toolCall.id || `tool_${toolCall.index || 0}`;
                    
                    if (!accumulatedToolCalls.has(toolCallId)) {
                      accumulatedToolCalls.set(toolCallId, {
                        id: toolCallId,
                        type: toolCall.type || 'function',
                        function: {}
                      });
                    }
                    
                    const accumulated = accumulatedToolCalls.get(toolCallId)!;
                    
                    // 累积function name
                    if (toolCall.function?.name) {
                      accumulated.function.name = toolCall.function.name;
                    }
                    
                    // 累积function arguments
                    if (toolCall.function?.arguments) {
                      accumulated.function.arguments = (accumulated.function.arguments || '') + toolCall.function.arguments;
                    }
                  }
                  
                  // 对于tool_calls，不立即输出，继续累积
                  continue;
                }
                
                // 如果有finish_reason，说明流已结束
                if (choice.finish_reason) {
                  // 输出最后的内容（如果有）
                  if (choice.delta?.content && choice.delta.content.trim()) {
                    yield fromQwenStreamResponse(chunk);
                  }
                  
                  // 输出累积的tool_calls（如果有）
                  if (accumulatedToolCalls.size > 0) {
                    yield this.createToolCallResponse(accumulatedToolCalls);
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
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 创建tool call响应
   */
  private createToolCallResponse(
    accumulatedToolCalls: Map<string, any>
  ): GenerateContentResponse {
    const toolCallsArray = Array.from(accumulatedToolCalls.values());
    
    // 创建模拟的Qwen响应格式
    const mockQwenResponse = {
      choices: [{
        delta: {
          tool_calls: toolCallsArray.map(toolCall => ({
            id: toolCall.id,
            type: toolCall.type,
            function: {
              name: toolCall.function.name,
              arguments: toolCall.function.arguments
            }
          }))
        }
      }]
    };
    
    return fromQwenStreamResponse(mockQwenResponse);
  }
} 