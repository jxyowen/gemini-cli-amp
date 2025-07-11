/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Content,
  Part,
  GenerateContentParameters,
  GenerateContentResponse,
  CountTokensParameters,
  CountTokensResponse,
  Tool,
  FinishReason,
  ContentListUnion,
} from '@google/genai';

// 通义千问 API 类型定义
export interface QwenMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface QwenGenerateRequest {
  model: string;
  messages: QwenMessage[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stop?: string[];
  tools?: QwenTool[];
  response_format?: {
    type: 'json_object';
  };
  enable_thinking?: boolean;
}

export interface QwenGenerateResponse {
  // OpenAI 兼容格式
  choices: Array<{
    message: QwenMessage;
    finish_reason: string;
    index: number;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  id: string;
  object: string;
  created: number;
  model: string;
}

export interface QwenTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, any>;
  };
}

/**
 * 将 ContentListUnion 转换为 Content[]
 */
function toContents(contents: ContentListUnion): Content[] {
  if (Array.isArray(contents)) {
    return contents.map(toContent);
  }
  return [toContent(contents)];
}

/**
 * 将单个 ContentUnion 转换为 Content
 */
function toContent(content: any): Content {
  if (Array.isArray(content)) {
    return {
      role: 'user',
      parts: content.map((part: any) => 
        typeof part === 'string' ? { text: part } : part
      ),
    };
  }
  if (typeof content === 'string') {
    return {
      role: 'user',
      parts: [{ text: content }],
    };
  }
  if ('parts' in content) {
    return content;
  }
  return {
    role: 'user',
    parts: [content as Part],
  };
}

/**
 * 将 Gemini Content 转换为 Qwen Messages
 */
export function convertContentToQwenMessages(contents: Content[]): QwenMessage[] {
  const messages: QwenMessage[] = [];
  
  for (const content of contents) {
    const role = content.role === 'model' ? 'assistant' : content.role as 'user' | 'system';
    
    // 处理文本部分
    const textParts = content.parts
      ?.filter((part): part is Part & { text: string } => 'text' in part)
      .map(part => part.text) || [];
    
    // 处理functionResponse部分（工具响应）
    const functionResponseParts = content.parts
      ?.filter((part): part is Part & { functionResponse: any } => 'functionResponse' in part)
      .map(part => {
        const response = part.functionResponse;
        if (response) {
          // 格式化工具响应为可读文本
          const responseText = typeof response.response === 'object' 
            ? JSON.stringify(response.response, null, 2)
            : String(response.response || '');
          
          return `Tool ${response.name || 'unknown'} (${response.id || 'no-id'}) executed successfully:\n${responseText}`;
        }
        return '';
      }) || [];
    
    // 处理functionCall部分（工具调用请求）
    const functionCallParts = content.parts
      ?.filter((part): part is Part & { functionCall: any } => 'functionCall' in part)
      .map(part => {
        const functionCall = part.functionCall;
        if (functionCall) {
          // 这部分通常在assistant消息中，表示模型要调用工具
          return `[Tool Call: ${functionCall.name || 'unknown'}]`;
        }
        return '';
      }) || [];
    
    // 合并所有内容
    const allParts = [...textParts, ...functionResponseParts, ...functionCallParts].filter(Boolean);
    
    if (allParts.length > 0) {
      messages.push({
        role,
        content: allParts.join('\n'),
      });
    }
  }
  
  return messages;
}

/**
 * 将 Gemini GenerateContentParameters 转换为 Qwen 请求
 */
export function toQwenGenerateRequest(
  params: GenerateContentParameters,
  stream = false
): QwenGenerateRequest {
  const messages = convertContentToQwenMessages(toContents(params.contents));
  
  // 检查是否需要JSON响应格式
  const needsJsonResponse = params.config?.responseMimeType === 'application/json' || 
                           params.config?.responseSchema;
  
  // 如果需要JSON响应，根据阿里云文档要求处理
  if (needsJsonResponse && messages.length > 0) {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'user') {
      // 确保提示词中包含"json"关键词（阿里云文档要求）
      let jsonInstruction = '\n\nPlease respond in JSON format.';
      
      if (params.config?.responseSchema) {
        jsonInstruction += `\n\nYour JSON response must conform to this schema:\n${JSON.stringify(params.config.responseSchema, null, 2)}`;
      }
      
      lastMessage.content += jsonInstruction;
    }
  }
  
  const request: QwenGenerateRequest = {
    model: params.model,
    messages,
    stream,
  };

  // 设置JSON响应格式（根据阿里云文档）
  if (needsJsonResponse) {
    request.response_format = {
      type: 'json_object'
    };
  }

  // 转换生成配置
  if (params.config) {
    if (params.config.temperature !== undefined) {
      request.temperature = params.config.temperature;
    }
    if (params.config.topP !== undefined) {
      request.top_p = params.config.topP;
    }
    if (params.config.maxOutputTokens !== undefined) {
      request.max_tokens = params.config.maxOutputTokens;
    }
    if (params.config.stopSequences !== undefined) {
      request.stop = params.config.stopSequences;
    }
    
    // 始终显式设置 enable_thinking 为 false
    // 根据用户要求，所有 Qwen API 调用都应该禁用 thinking 模式
    request.enable_thinking = false;
  }

  // 转换工具定义
  if (params.config?.tools) {
    request.tools = params.config.tools.flatMap((tool: any) => 
      tool.functionDeclarations?.map((func: any) => ({
        type: 'function' as const,
        function: {
          name: func.name,
          description: func.description,
          parameters: func.parameters,
        },
      })) || []
    );
  }

  return request;
}

/**
 * 将 Qwen 响应转换为 Gemini 格式
 */
export function fromQwenGenerateResponse(qwenResponse: QwenGenerateResponse): GenerateContentResponse {
  const choice = qwenResponse.choices?.[0];
  const text = choice?.message?.content || '';
  
  // 添加调试日志：输出原始Qwen响应（简化版本）
  console.debug(`[DEBUG] Qwen非流式响应: choices=${qwenResponse.choices?.length}, hasToolCalls=${!!choice?.message?.tool_calls?.length}`);
  
  // 处理基本响应
  const parts: any[] = text ? [{ text }] : [];
  const functionCalls: any[] = [];
  
  // 处理tool_calls
  if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
    console.debug(`[DEBUG] 检测到${choice.message.tool_calls.length}个tool_calls`);
    
    for (const toolCall of choice.message.tool_calls) {
      console.debug(`[DEBUG] 处理tool_call: ${JSON.stringify({
        id: toolCall.id,
        name: toolCall.function.name,
        argumentsLength: toolCall.function.arguments?.length || 0
      })}`);
      
      let args = {};
      
      // 处理arguments（使用与流式版本相同的逻辑）
      if (toolCall.function.arguments) {
        try {
          console.debug(`[DEBUG] 尝试解析arguments: ${toolCall.function.arguments.substring(0, 100)}${toolCall.function.arguments.length > 100 ? '...' : ''}`);
          args = JSON.parse(toolCall.function.arguments);
          console.debug(`[DEBUG] 成功解析tool_call参数: ${JSON.stringify(args)}`);
        } catch (error) {
          console.error(`[ERROR] 解析tool call参数失败: ${toolCall.function.arguments}`, error);
          
          // 尝试修复常见的JSON格式问题（与流式版本相同的逻辑）
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
      const functionName = toolCall.function.name || 'unknown_function';
      
      const functionCall = {
        id: toolCall.id || `${functionName}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        name: functionName,
        args,
      };
      
      console.debug(`[DEBUG] 生成的functionCall: ${JSON.stringify({
        id: functionCall.id,
        name: functionCall.name,
        argsKeys: Object.keys(functionCall.args)
      })}`);
      
      // 添加到parts数组中（用于GenerateContentResponse的标准格式）
      parts.push({ functionCall });
      
      // 添加到functionCalls数组中（用于响应级别属性）
      functionCalls.push(functionCall);
    }
  }

  const candidate: any = {
    content: {
      role: 'model',
      parts,
    },
    finishReason: (choice?.finish_reason || 'STOP') as FinishReason,
    index: 0,
  };

  // 构建响应对象
  const response: any = {
    candidates: [candidate],
    usageMetadata: {
      promptTokenCount: qwenResponse.usage?.prompt_tokens || 0,
      candidatesTokenCount: qwenResponse.usage?.completion_tokens || 0,
      totalTokenCount: qwenResponse.usage?.total_tokens || 0,
    },
  };
  
  // 设置functionCalls属性（这是关键！）
  if (functionCalls.length > 0) {
    response.functionCalls = functionCalls;
    console.debug(`[DEBUG] 设置非流式响应的functionCalls属性，包含 ${functionCalls.length} 个工具调用`);
  }
  
  console.debug(`[DEBUG] 非流式转换后的响应结构: ${JSON.stringify({
    candidateCount: response.candidates?.length,
    functionCallCount: response.functionCalls?.length,
    partsCount: response.candidates?.[0]?.content?.parts?.length,
    usageTotal: response.usageMetadata?.totalTokenCount
  })}`);
  
  return response as GenerateContentResponse;
}

/**
 * 将 Qwen 流式响应转换为 Gemini 格式（仅用于文本内容，tool_calls通过累积机制处理）
 */
export function fromQwenStreamResponse(qwenChunk: any): GenerateContentResponse {
  const choice = qwenChunk.choices?.[0];
  const delta = choice?.delta || {};
  const content = delta.content || '';
  
  // 添加调试日志：输出原始流式响应块
  console.debug('[DEBUG] Qwen流式文本响应块:', JSON.stringify(qwenChunk, null, 2));
  
  // 只处理文本内容，tool_calls由累积机制处理
  const parts: any[] = content ? [{ text: content }] : [];

  const candidate: any = {
    content: {
      role: 'model',
      parts,
    },
    finishReason: choice?.finish_reason as FinishReason,
    index: 0,
  };

  const response: any = {
    candidates: [candidate],
  };
  
  return response as GenerateContentResponse;
}

/**
 * 转换 token 计数请求
 */
export function toQwenCountTokensRequest(params: CountTokensParameters) {
  return {
    model: params.model,
    messages: convertContentToQwenMessages(toContents(params.contents)),
  };
}

/**
 * 转换 token 计数响应
 */
export function fromQwenCountTokensResponse(qwenResponse: any): CountTokensResponse {
  return {
    totalTokens: qwenResponse.usage?.total_tokens || qwenResponse.tokens || 0,
  };
} 