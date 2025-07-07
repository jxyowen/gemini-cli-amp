/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
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
    mockConfig = {
      getApprovalMode: vi.fn().mockReturnValue('default'),
      getTargetDir: vi.fn().mockReturnValue('/test/dir'),
    } as any;

    mockGeminiClient = {
      generateContent: vi.fn(),
    } as any;

    tool = new ApiManagementTool(mockConfig, mockGeminiClient);
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
    expect(confirmationResult).toHaveProperty('type', 'edit');
    expect(confirmationResult).toHaveProperty('title', '确认API修改: TestApi');
    expect(confirmationResult).toHaveProperty('fileName', 'TestApi-api.json');
    expect(confirmationResult).toHaveProperty('fileDiff');
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
    expect(confirmationResult).toHaveProperty('type', 'edit');
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
    (mockConfig.getApprovalMode as any).mockReturnValue('auto_edit');

    const confirmationResult = await tool.shouldConfirmExecute({
      action: 'edit',
      apiName: 'TestApi',
      changeDescription: '修改API描述'
    }, new AbortController().signal);

    expect(confirmationResult).toBe(false);
  });
}); 