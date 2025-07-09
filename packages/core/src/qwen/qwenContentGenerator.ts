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
              return;
            }
            
            try {
              const chunk = JSON.parse(data);
              // 检查是否有choices数组，这是OpenAI兼容格式的标准字段
              if (chunk.choices && chunk.choices.length > 0) {
                const choice = chunk.choices[0];
                
                // 如果有finish_reason，说明流已结束
                if (choice.finish_reason) {
                  // 如果还有最后的内容，先yield它
                  if (choice.delta?.content && choice.delta.content.trim()) {
                    yield fromQwenStreamResponse(chunk);
                  }
                  return;
                }
                
                // 只处理有非空内容的块
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
} 