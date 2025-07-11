/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  fromQwenGenerateResponse,
  fromQwenStreamResponse,
  toQwenGenerateRequest,
  QwenGenerateResponse
} from './converter.js';
import { GenerateContentParameters } from '@google/genai';

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

    it('should handle regular responses without tool_calls', () => {
      const qwenResponse: QwenGenerateResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Hello, how can I help you?'
            },
            finish_reason: 'stop',
            index: 0
          }
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 8,
          total_tokens: 18
        },
        id: 'test-id-2',
        object: 'chat.completion',
        created: Date.now(),
        model: 'qwen-plus'
      };

      const result = fromQwenGenerateResponse(qwenResponse);

      expect(result.candidates).toBeDefined();
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates?.[0]?.content?.parts).toEqual([
        { text: 'Hello, how can I help you?' }
      ]);
      expect((result as any).functionCalls).toBeUndefined();
    });

    it('should handle JSON responses correctly', () => {
      const qwenResponse: QwenGenerateResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: '{"next_speaker": "user", "reasoning": "Model completed the task"}'
            },
            finish_reason: 'stop',
            index: 0
          }
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 15,
          total_tokens: 35
        },
        id: 'test-json-id',
        object: 'chat.completion',
        created: Date.now(),
        model: 'qwen-plus'
      };

      const result = fromQwenGenerateResponse(qwenResponse);

      expect(result.candidates).toBeDefined();
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates?.[0]?.content?.parts).toEqual([
        { text: '{"next_speaker": "user", "reasoning": "Model completed the task"}' }
      ]);
    });
  });

  describe('toQwenGenerateRequest JSON schema support', () => {
    it('should add JSON format instructions and response_format when responseSchema is provided', () => {
      const params: GenerateContentParameters = {
        model: 'qwen-plus',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'What is the weather like?' }]
          }
        ],
        config: {
          responseSchema: {
            type: 'object',
            properties: {
              next_speaker: { type: 'string' },
              reasoning: { type: 'string' }
            }
          },
          responseMimeType: 'application/json'
        }
      };

      const result = toQwenGenerateRequest(params);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toContain('Please respond in JSON format');
      expect(result.messages[0].content).toContain('Your JSON response must conform to this schema');
      expect(result.messages[0].content).toContain('"next_speaker"');
      expect(result.messages[0].content).toContain('"reasoning"');
      expect(result.response_format).toEqual({ type: 'json_object' });
    });

    it('should add basic JSON instruction and response_format when only responseMimeType is provided', () => {
      const params: GenerateContentParameters = {
        model: 'qwen-plus',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Generate a response' }]
          }
        ],
        config: {
          responseMimeType: 'application/json'
        }
      };

      const result = toQwenGenerateRequest(params);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toContain('Please respond in JSON format');
      expect(result.messages[0].content).not.toContain('schema');
      expect(result.response_format).toEqual({ type: 'json_object' });
    });

    it('should not modify content or set response_format when no JSON response is requested', () => {
      const params: GenerateContentParameters = {
        model: 'qwen-plus',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'What is the weather like?' }]
          }
        ],
        config: {}
      };

      const result = toQwenGenerateRequest(params);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toBe('What is the weather like?');
      expect(result.messages[0].content).not.toContain('JSON');
      expect(result.response_format).toBeUndefined();
    });

    it('should handle complex JSON schema correctly', () => {
      const complexSchema = {
        type: 'object',
        properties: {
          temperature: { type: 'number' },
          humidity: { type: 'number' },
          weather: { type: 'string' },
          location: {
            type: 'object',
            properties: {
              city: { type: 'string' },
              country: { type: 'string' }
            }
          }
        },
        required: ['temperature', 'weather']
      };

      const params: GenerateContentParameters = {
        model: 'qwen-plus',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Get current weather' }]
          }
        ],
        config: {
          responseSchema: complexSchema,
          responseMimeType: 'application/json'
        }
      };

      const result = toQwenGenerateRequest(params);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toContain('Please respond in JSON format');
      expect(result.messages[0].content).toContain('Your JSON response must conform to this schema');
      expect(result.messages[0].content).toContain('"temperature"');
      expect(result.messages[0].content).toContain('"weather"');
      expect(result.messages[0].content).toContain('"location"');
      expect(result.response_format).toEqual({ type: 'json_object' });
    });
  });

  describe('fromQwenStreamResponse', () => {
    it('should handle streaming text responses', () => {
      const chunk = {
        choices: [
          {
            delta: {
              content: 'Hello '
            },
            finish_reason: null,
            index: 0
          }
        ]
      };

      const result = fromQwenStreamResponse(chunk);

      expect(result.candidates).toBeDefined();
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates?.[0]?.content?.parts).toEqual([
        { text: 'Hello ' }
      ]);
    });

    it('should handle streaming JSON responses', () => {
      const chunk = {
        choices: [
          {
            delta: {
              content: '{"status": "success"'
            },
            finish_reason: null,
            index: 0
          }
        ]
      };

      const result = fromQwenStreamResponse(chunk);

      expect(result.candidates).toBeDefined();
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates?.[0]?.content?.parts).toEqual([
        { text: '{"status": "success"' }
      ]);
    });
  });
}); 