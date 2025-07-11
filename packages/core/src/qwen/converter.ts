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
  
  const request: QwenGenerateRequest = {
    model: params.model,
    messages,
    stream,
  };

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
  
  // 添加调试日志：输出原始Qwen响应
  console.debug('[DEBUG] Qwen原始响应:', JSON.stringify(qwenResponse, null, 2));
  
  // 处理基本响应
  const parts: any[] = text ? [{ text }] : [];
  const functionCalls: any[] = [];
  
  // 处理tool_calls
  if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
    console.debug('[DEBUG] 检测到tool_calls:', choice.message.tool_calls.length, '个');
    
    for (const toolCall of choice.message.tool_calls) {
      console.debug('[DEBUG] 处理tool_call:', JSON.stringify(toolCall, null, 2));
      
      let args = {};
      if (toolCall.function.arguments) {
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch (error) {
          console.warn(`Failed to parse tool call arguments: ${toolCall.function.arguments}`, error);
          args = {}; // 使用空对象作为fallback
        }
      }
      
      const functionCall = {
        id: toolCall.id || `${toolCall.function.name}-${Date.now()}`,
        name: toolCall.function.name,
        args,
      };
      
      console.debug('[DEBUG] 生成的functionCall:', JSON.stringify(functionCall, null, 2));
      
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

  // 使用对象字面量创建响应，这样可以设置functionCalls属性
  const response: any = {
    candidates: [candidate],
    usageMetadata: {
      promptTokenCount: qwenResponse.usage.prompt_tokens,
      candidatesTokenCount: qwenResponse.usage.completion_tokens,
      totalTokenCount: qwenResponse.usage.total_tokens,
    },
  };
  
  // 如果有function calls，设置functionCalls属性
  if (functionCalls.length > 0) {
    response.functionCalls = functionCalls;
    console.debug('[DEBUG] 最终响应中的functionCalls:', JSON.stringify(functionCalls, null, 2));
  }
  
  console.debug('[DEBUG] 转换后的完整响应:', JSON.stringify(response, null, 2));
  
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