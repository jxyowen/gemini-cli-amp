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
    
    // 合并所有文本部分
    const textParts = content.parts
      ?.filter((part): part is Part & { text: string } => 'text' in part)
      .map(part => part.text) || [];
    
    if (textParts.length > 0) {
      messages.push({
        role,
        content: textParts.join('\n'),
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
  
  const response = new GenerateContentResponse();
  response.candidates = [
    {
      content: {
        role: 'model',
        parts: [{ text }],
      },
      finishReason: (choice?.finish_reason || 'STOP') as FinishReason,
      index: 0,
    },
  ];
  response.usageMetadata = {
    promptTokenCount: qwenResponse.usage.prompt_tokens,
    candidatesTokenCount: qwenResponse.usage.completion_tokens,
    totalTokenCount: qwenResponse.usage.total_tokens,
  };
  return response;
}

/**
 * 将 Qwen 流式响应转换为 Gemini 格式
 */
export function fromQwenStreamResponse(qwenChunk: any): GenerateContentResponse {
  const choice = qwenChunk.choices?.[0];
  const delta = choice?.delta || {};
  const content = delta.content || '';
  
  const response = new GenerateContentResponse();
  response.candidates = [
    {
      content: {
        role: 'model',
        parts: [{ text: content }],
      },
      finishReason: choice?.finish_reason as FinishReason,
      index: 0,
    },
  ];
  return response;
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