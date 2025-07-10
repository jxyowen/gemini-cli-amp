/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  fromQwenGenerateResponse,
  fromQwenStreamResponse,
  QwenGenerateResponse
} from './converter.js';

describe('Qwen Converter tool_calls support', () => {
  describe('fromQwenGenerateResponse', () => {
    it('should handle tool_calls correctly', () => {
      const qwenResponse: QwenGenerateResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_abc123',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{"location": "北京"}'
                  }
                }
              ]
            },
            finish_reason: 'tool_calls',
            index: 0
          }
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 25,
          total_tokens: 75
        },
        id: 'test-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'qwen-plus'
      };

      const result = fromQwenGenerateResponse(qwenResponse);

      expect((result as any).functionCalls).toBeDefined();
      expect((result as any).functionCalls).toHaveLength(1);
      expect((result as any).functionCalls[0]).toEqual({
        id: 'call_abc123',
        name: 'get_weather',
        args: { location: '北京' }
      });
    });

    it('should handle multiple tool_calls correctly', () => {
      const qwenResponse: QwenGenerateResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{"location": "北京"}'
                  }
                },
                {
                  id: 'call_2',
                  type: 'function',
                  function: {
                    name: 'get_time',
                    arguments: '{}'
                  }
                }
              ]
            },
            finish_reason: 'tool_calls',
            index: 0
          }
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 25,
          total_tokens: 75
        },
        id: 'test-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'qwen-plus'
      };

      const result = fromQwenGenerateResponse(qwenResponse);

      expect((result as any).functionCalls).toBeDefined();
      expect((result as any).functionCalls).toHaveLength(2);
      expect((result as any).functionCalls[0]).toEqual({
        id: 'call_1',
        name: 'get_weather',
        args: { location: '北京' }
      });
      expect((result as any).functionCalls[1]).toEqual({
        id: 'call_2',
        name: 'get_time',
        args: {}
      });
    });

    it('should handle response without tool_calls', () => {
      const qwenResponse: QwenGenerateResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: '你好！我是通义千问。'
            },
            finish_reason: 'stop',
            index: 0
          }
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 15,
          total_tokens: 25
        },
        id: 'test-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'qwen-plus'
      };

      const result = fromQwenGenerateResponse(qwenResponse);

      expect((result as any).functionCalls).toBeUndefined();
      expect(result.candidates?.[0]?.content?.parts).toEqual([
        { text: '你好！我是通义千问。' }
      ]);
    });
  });

  describe('fromQwenStreamResponse', () => {
    it('should handle tool_calls in streaming response', () => {
      const qwenChunk = {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  id: 'call_stream_123',
                  type: 'function',
                  function: {
                    name: 'search_web',
                    arguments: '{"query": "OpenAI tool calling"}'
                  }
                }
              ]
            },
            finish_reason: 'tool_calls',
            index: 0
          }
        ]
      };

      const result = fromQwenStreamResponse(qwenChunk);

      expect((result as any).functionCalls).toBeDefined();
      expect((result as any).functionCalls).toHaveLength(1);
      expect((result as any).functionCalls[0]).toEqual({
        id: 'call_stream_123',
        name: 'search_web',
        args: { query: 'OpenAI tool calling' }
      });
    });

    it('should handle streaming response without tool_calls', () => {
      const qwenChunk = {
        choices: [
          {
            delta: {
              content: '这是流式响应的内容。'
            },
            finish_reason: null,
            index: 0
          }
        ]
      };

      const result = fromQwenStreamResponse(qwenChunk);

      expect((result as any).functionCalls).toBeUndefined();
      expect(result.candidates?.[0]?.content?.parts).toEqual([
        { text: '这是流式响应的内容。' }
      ]);
    });
  });
}); 