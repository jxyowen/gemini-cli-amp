/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ApiManagementTool } from './api-management.js';
import { Config } from '../config/config.js';
import { GeminiClient } from '../core/client.js';

// Mock getResponseText function
vi.mock('../utils/generateContentResponseUtilities.js', () => ({
  getResponseText: vi.fn(),
}));

import { getResponseText } from '../utils/generateContentResponseUtilities.js';

describe('ApiManagementTool edit functionality', () => {
  let tool: ApiManagementTool;
  let mockConfig: Config;
  let mockGeminiClient: GeminiClient;

  beforeEach(() => {
    mockGeminiClient = {
      generateContent: vi.fn(),
    } as any;

    mockConfig = {
      getApprovalMode: vi.fn().mockReturnValue('default'),
      getTargetDir: vi.fn().mockReturnValue('/test/dir'),
      getGeminiClient: vi.fn().mockReturnValue(mockGeminiClient),
    } as any;

    tool = new ApiManagementTool(mockConfig);
  });

  it('should use AI model to edit API definition', async () => {
    const mockApiData = {
      summary: 'Test API',
      methods: ['post'],
      schemes: ['https'],
      parameters: []
    };

    const mockModifiedApiData = {
      summary: 'Test API',
      methods: ['post'],
      schemes: ['https'],
      parameters: [
        {
          name: 'Age',
          in: 'query',
          schema: {
            type: 'integer',
            backendName: 'age'
          }
        }
      ]
    };

    // Mock get_api call
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue(mockApiData),
    } as any);

    // Mock generateContent call
    const mockResponse = { /* mock GenerateContentResponse */ };
    (mockGeminiClient.generateContent as any).mockResolvedValue(mockResponse);
    
    // Mock getResponseText to return the JSON string
    (getResponseText as any).mockReturnValue(JSON.stringify(mockModifiedApiData));

    const result = await (tool as any).editApi('TestApi', '添加年龄参数', new AbortController().signal);

    expect(result).toEqual({
      before: mockApiData,
      after: mockModifiedApiData
    });

    expect(mockGeminiClient.generateContent).toHaveBeenCalledWith(
      expect.arrayContaining([{
        parts: [{ text: expect.stringContaining('API设计专家') }],
        role: 'user'
      }]),
      {},
      expect.any(AbortSignal)
    );

    expect(getResponseText).toHaveBeenCalledWith(mockResponse);
  });

  it('should handle schema file reading correctly', async () => {
    // Mock get_api call
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ summary: 'Test API' }),
    } as any);

    // Mock generateContent call
    const mockResponse = { /* mock GenerateContentResponse */ };
    (mockGeminiClient.generateContent as any).mockResolvedValue(mockResponse);
    
    // Mock getResponseText to return the JSON string
    (getResponseText as any).mockReturnValue(JSON.stringify({ summary: 'Modified API' }));

    const result = await (tool as any).editApi('TestApi', '修改API描述', new AbortController().signal);

    expect(result).toEqual({
      before: { summary: 'Test API' },
      after: { summary: 'Modified API' }
    });

    // Verify that the schema path is constructed correctly
    expect(mockGeminiClient.generateContent).toHaveBeenCalledWith(
      expect.arrayContaining([{
        parts: [{ text: expect.stringContaining('API设计专家') }],
        role: 'user'
      }]),
      {},
      expect.any(AbortSignal)
    );
  });

  it('should return edit confirmation details from shouldConfirmExecute', async () => {
    // Mock get_api call
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ summary: 'Test API' }),
    } as any);

    // Mock generateContent call
    const mockResponse = { /* mock GenerateContentResponse */ };
    (mockGeminiClient.generateContent as any).mockResolvedValue(mockResponse);
    
    // Mock getResponseText to return the JSON string
    (getResponseText as any).mockReturnValue(JSON.stringify({ summary: 'Modified API' }));

    const confirmationResult = await tool.shouldConfirmExecute({
      action: 'edit',
      apiName: 'TestApi',
      changeDescription: '修改API描述'
    }, new AbortController().signal);

    expect(confirmationResult).not.toBe(false);
    expect(confirmationResult).toHaveProperty('type', 'info');
    expect(confirmationResult).toHaveProperty('title', '确认API修改: TestApi');
    expect(confirmationResult).toHaveProperty('prompt');
    expect(confirmationResult).toHaveProperty('onConfirm');
  });

  it('should not require confirmation for getApi action', async () => {
    const confirmationResult = await tool.shouldConfirmExecute({
      action: 'get',
      apiName: 'TestApi'
    }, new AbortController().signal);

    expect(confirmationResult).toBe(false);
  });

  it('should require confirmation for editApi action', async () => {
    // Mock get_api call
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ summary: 'Test API' }),
    } as any);

    // Mock generateContent call
    const mockResponse = { /* mock GenerateContentResponse */ };
    (mockGeminiClient.generateContent as any).mockResolvedValue(mockResponse);
    
    // Mock getResponseText to return the JSON string
    (getResponseText as any).mockReturnValue(JSON.stringify({ summary: 'Modified API' }));

    const confirmationResult = await tool.shouldConfirmExecute({
      action: 'edit',
      apiName: 'TestApi',
      changeDescription: '修改API描述'
    }, new AbortController().signal);

    expect(confirmationResult).not.toBe(false);
    expect(confirmationResult).toHaveProperty('type', 'info');
  });

  it('should require confirmation for publishApi action', async () => {
    const confirmationResult = await tool.shouldConfirmExecute({
      action: 'publish',
      apiName: 'TestApi'
    }, new AbortController().signal);

    expect(confirmationResult).not.toBe(false);
    expect(confirmationResult).toHaveProperty('type', 'info');
    expect(confirmationResult).toHaveProperty('title', '确认API管理操作');
  });

  it('should execute edit action using cached result from shouldConfirmExecute', async () => {
    // Mock get_api call
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ summary: 'Test API' }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true }),
      } as any);

    // Mock generateContent call
    const mockResponse = { /* mock GenerateContentResponse */ };
    (mockGeminiClient.generateContent as any).mockResolvedValue(mockResponse);
    
    // Mock getResponseText to return the JSON string
    (getResponseText as any).mockReturnValue(JSON.stringify({ summary: 'Modified API' }));

    // First call shouldConfirmExecute to cache the result
    await tool.shouldConfirmExecute({
      action: 'edit',
      apiName: 'TestApi',
      changeDescription: '修改API描述'
    }, new AbortController().signal);

    // Then execute with the same parameters
    const result = await tool.execute({
      action: 'edit',
      apiName: 'TestApi',
      changeDescription: '修改API描述'
    }, new AbortController().signal);

    expect(result.returnDisplay).toContain('成功修改API: TestApi');
    expect(result.returnDisplay).toContain('修改前后对比');
    expect(result.llmContent).toContain('success');
  });

  it('should not require confirmation in AUTO_EDIT mode', async () => {
    (mockConfig.getApprovalMode as any).mockReturnValue('autoEdit');

    const confirmationResult = await tool.shouldConfirmExecute({
      action: 'edit',
      apiName: 'TestApi',
      changeDescription: '修改API描述'
    }, new AbortController().signal);

    expect(confirmationResult).toBe(false);
  });
}); 

describe('ApiManagementTool publish and debug functionality', () => {
  let tool: ApiManagementTool;
  let mockConfig: Config;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // 保存原始环境变量
    originalEnv = { ...process.env };

    mockConfig = {
      getApprovalMode: vi.fn().mockReturnValue('default'),
      getTargetDir: vi.fn().mockReturnValue('/test/dir'),
      getGeminiClient: vi.fn().mockReturnValue(null),
    } as any;

    tool = new ApiManagementTool(mockConfig);

    // 设置测试用的环境变量
    process.env.AMP_CLI_TOKEN = 'test-token';
    process.env.AMP_CLI_PROJECT = 'test-project-uuid';
    process.env.AMP_CLI_ENV = 'test';
  });

  afterEach(() => {
    // 恢复原始环境变量
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('publishApi', () => {
    it('should successfully publish API with correct URL and parameters', async () => {
      const mockResponseData = {
        data: {
          publishId: 'pub-123',
          status: 'success',
          message: 'API published successfully'
        }
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponseData),
      } as any);

      const result = await tool.execute({
        action: 'publish',
        apiName: 'TestApi'
      }, new AbortController().signal);

      // 验证fetch被正确调用
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v2/idea_plugin/apis/TestApi/publish'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'amp_plugin_token': 'test-token'
          }),
          signal: expect.any(AbortSignal)
        })
      );

      // 验证URL包含正确的查询参数
      const fetchCall = (global.fetch as any).mock.calls[0];
      const url = fetchCall[0];
      expect(url).toContain('projectUuid=test-project-uuid');
      expect(url).toContain('env=test');

      // 验证返回结果
      expect(result.llmContent).toContain('"publishId": "pub-123"');
      expect(result.returnDisplay).toContain('成功发布API到网关: TestApi');
    });

    it('should handle publish API failure', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as any);

      const result = await tool.execute({
        action: 'publish',
        apiName: 'TestApi'
      }, new AbortController().signal);

      expect(result.llmContent).toContain('Error: API调用失败: 500 Internal Server Error');
      expect(result.returnDisplay).toContain('Error: API调用失败: 500 Internal Server Error');
    });

    it('should use default environment when AMP_CLI_ENV is not set', async () => {
      delete process.env.AMP_CLI_ENV;

      const mockResponseData = { data: { status: 'success' } };
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponseData),
      } as any);

      await tool.execute({
        action: 'publish',
        apiName: 'TestApi'
      }, new AbortController().signal);

      const fetchCall = (global.fetch as any).mock.calls[0];
      const url = fetchCall[0];
      expect(url).toContain('env=daily'); // 默认环境
    });

    it('should work without project UUID when not set', async () => {
      delete process.env.AMP_CLI_PROJECT;

      const mockResponseData = { data: { status: 'success' } };
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponseData),
      } as any);

      await tool.execute({
        action: 'publish',
        apiName: 'TestApi'
      }, new AbortController().signal);

      const fetchCall = (global.fetch as any).mock.calls[0];
      const url = fetchCall[0];
      expect(url).not.toContain('projectUuid=');
    });
  });

  describe('debugApi', () => {
    it('should successfully debug API with correct URL and parameters', async () => {
      const mockResponseData = {
        data: {
          debugId: 'debug-456',
          result: 'success',
          output: 'Debug completed successfully',
          logs: ['Step 1: OK', 'Step 2: OK']
        }
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponseData),
      } as any);

      const result = await tool.execute({
        action: 'debug',
        apiName: 'TestApi'
      }, new AbortController().signal);

      // 验证fetch被正确调用
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v2/idea_plugin/apis/TestApi/debug'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'amp_plugin_token': 'test-token'
          }),
          signal: expect.any(AbortSignal)
        })
      );

      // 验证URL包含正确的查询参数
      const fetchCall = (global.fetch as any).mock.calls[0];
      const url = fetchCall[0];
      expect(url).toContain('projectUuid=test-project-uuid');
      expect(url).toContain('env=test');

      // 验证返回结果
      expect(result.llmContent).toContain('"debugId": "debug-456"');
      expect(result.returnDisplay).toContain('成功调试API: TestApi');
      expect(result.returnDisplay).toContain('Debug completed successfully');
    });

    it('should handle debug API failure', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as any);

      const result = await tool.execute({
        action: 'debug',
        apiName: 'NonExistentApi'
      }, new AbortController().signal);

      expect(result.llmContent).toContain('Error: API调用失败: 404 Not Found');
      expect(result.returnDisplay).toContain('Error: API调用失败: 404 Not Found');
    });

    it('should use default environment when AMP_CLI_ENV is not set', async () => {
      delete process.env.AMP_CLI_ENV;

      const mockResponseData = { data: { result: 'success' } };
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponseData),
      } as any);

      await tool.execute({
        action: 'debug',
        apiName: 'TestApi'
      }, new AbortController().signal);

      const fetchCall = (global.fetch as any).mock.calls[0];
      const url = fetchCall[0];
      expect(url).toContain('env=daily'); // 默认环境
    });

    it('should work without authentication token when not set', async () => {
      delete process.env.AMP_CLI_TOKEN;

      const mockResponseData = { data: { result: 'success' } };
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponseData),
      } as any);

      await tool.execute({
        action: 'debug',
        apiName: 'TestApi'
      }, new AbortController().signal);

      const fetchCall = (global.fetch as any).mock.calls[0];
      const options = fetchCall[1];
      expect(options.headers).not.toHaveProperty('amp_plugin_token');
    });
  });

  describe('shouldConfirmExecute for publish and debug', () => {
    it('should not require confirmation for debug action', async () => {
      const confirmationResult = await tool.shouldConfirmExecute({
        action: 'debug',
        apiName: 'TestApi'
      }, new AbortController().signal);

      expect(confirmationResult).toBe(false);
    });

    it('should require confirmation for publish action', async () => {
      const confirmationResult = await tool.shouldConfirmExecute({
        action: 'publish',
        apiName: 'TestApi'
      }, new AbortController().signal);

      expect(confirmationResult).not.toBe(false);
      expect(confirmationResult).toHaveProperty('type', 'info');
      expect(confirmationResult).toHaveProperty('title', '确认API管理操作');
      expect(confirmationResult).toHaveProperty('prompt');
      expect((confirmationResult as any).prompt).toContain('发布API到网关');
      expect((confirmationResult as any).prompt).toContain('TestApi');
    });
  });

  describe('validation', () => {
    it('should require apiName for publish action', async () => {
      const result = await tool.execute({
        action: 'publish'
      } as any, new AbortController().signal);

      expect(result.llmContent).toContain("Error: The 'apiName' parameter cannot be empty");
      expect(result.returnDisplay).toContain("Error: The 'apiName' parameter cannot be empty");
    });

    it('should require apiName for debug action', async () => {
      const result = await tool.execute({
        action: 'debug'
      } as any, new AbortController().signal);

      expect(result.llmContent).toContain("Error: The 'apiName' parameter cannot be empty");
      expect(result.returnDisplay).toContain("Error: The 'apiName' parameter cannot be empty");
    });
  });

  describe('timeout handling', () => {
    it('should handle timeout for publish API', async () => {
      // Mock fetch to simulate timeout
      global.fetch = vi.fn().mockImplementation(() => 
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('AbortError')), 100);
        })
      );

      const result = await tool.execute({
        action: 'publish',
        apiName: 'TestApi'
      }, new AbortController().signal);

      expect(result.llmContent).toContain('Error:');
      expect(result.returnDisplay).toContain('Error:');
    });

    it('should handle timeout for debug API', async () => {
      // Mock fetch to simulate timeout
      global.fetch = vi.fn().mockImplementation(() => 
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('AbortError')), 100);
        })
      );

      const result = await tool.execute({
        action: 'debug',
        apiName: 'TestApi'
      }, new AbortController().signal);

      expect(result.llmContent).toContain('Error:');
      expect(result.returnDisplay).toContain('Error:');
    });
  });
}); 