/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiDefinitionCrudTool } from './api-definition-crud.js';
import { Config } from '../../config/config.js';

// Mock the platform client
vi.mock('./platform-client.js', () => ({
  ApiPlatformClient: vi.fn().mockImplementation(() => ({
    createApiDefinition: vi.fn().mockResolvedValue({
      id: 'test-api-123',
      name: 'Test API',
      version: '1.0.0',
      status: 'active'
    }),
    getApiDefinition: vi.fn().mockResolvedValue({
      id: 'test-api-123',
      name: 'Test API',
      version: '1.0.0',
      description: 'A test API'
    }),
    listApiDefinitions: vi.fn().mockResolvedValue({
      apis: [
        { id: 'api-1', name: 'API 1', version: '1.0.0' },
        { id: 'api-2', name: 'API 2', version: '2.0.0' }
      ]
    })
  }))
}));

describe('ApiDefinitionCrudTool', () => {
  let tool: ApiDefinitionCrudTool;

  beforeEach(() => {
    const mockConfig = {
      getTargetDir: () => '/test/dir',
      getProjectRoot: () => '/test/dir',
      getGeminiClient: () => ({} as any),
      getContentGeneratorConfig: () => ({} as any),
      getModel: () => 'test-model',
      getSessionId: () => 'test-session',
      getEmbeddingModel: () => 'test-embedding',
      getSandbox: () => undefined,
      getDebugMode: () => false,
      getQuestion: () => undefined,
      getFullContext: () => false,
      getCoreTools: () => undefined,
      getExcludeTools: () => undefined,
      getToolDiscoveryCommand: () => undefined,
      getToolCallCommand: () => undefined,
      getMcpServerCommand: () => undefined,
      getMcpServers: () => undefined,
      getUserMemory: () => '',
      setUserMemory: () => {},
      getGeminiMdFileCount: () => 0,
      setGeminiMdFileCount: () => {},
      getApprovalMode: () => 'default' as any,
      setApprovalMode: () => {},
      getShowMemoryUsage: () => false,
      getAccessibility: () => ({}),
      getTelemetryEnabled: () => false,
      getTelemetryLogPromptsEnabled: () => true,
      getTelemetryOtlpEndpoint: () => 'test-endpoint',
      getTelemetryTarget: () => 'test-target',
      getGeminiDir: () => '/test/dir/.gemini',
      getProjectTempDir: () => '/test/temp',
      getEnableRecursiveFileSearch: () => false,
      getFileFilteringRespectGitIgnore: () => true,
      getCheckpointingEnabled: () => false,
      getProxy: () => undefined,
      getWorkingDir: () => '/test/dir',
      getBugCommand: () => undefined,
      getFileService: () => ({} as any),
      getUsageStatisticsEnabled: () => true,
      getExtensionContextFilePaths: () => [],
      getGitService: () => Promise.resolve({} as any),
      refreshAuth: () => Promise.resolve(),
      setModel: () => {},
      isModelSwitchedDuringSession: () => false,
      resetModelToDefault: () => {},
      setFlashFallbackHandler: () => {},
      getToolRegistry: () => Promise.resolve({} as any)
    } as unknown as Config;
    tool = new ApiDefinitionCrudTool(mockConfig);
  });

  describe('validation', () => {
    it('should validate required parameters for create action', () => {
      const result = tool.validateToolParams({
        action: 'create'
      });
      expect(result).toBe('Either swaggerContent or swaggerFile is required for create operation');
    });

    it('should validate required parameters for read action', () => {
      const result = tool.validateToolParams({
        action: 'read'
      });
      expect(result).toBe('API ID is required for read, update, delete, and export operations');
    });

    it('should pass validation for valid list action', () => {
      const result = tool.validateToolParams({
        action: 'list'
      });
      expect(result).toBeNull();
    });
  });

  describe('description generation', () => {
    it('should generate correct description for create action', () => {
      const description = tool.getDescription({
        action: 'create',
        name: 'Test API',
        version: '1.0.0'
      });
      expect(description).toBe('Create new API definition "Test API" with version 1.0.0');
    });

    it('should generate correct description for read action', () => {
      const description = tool.getDescription({
        action: 'read',
        apiId: 'test-123'
      });
      expect(description).toBe('Read API definition with ID: test-123');
    });
  });

  describe('tool properties', () => {
    it('should have correct tool name and description', () => {
      expect(tool.name).toBe('api_definition_crud');
      expect(tool.description).toContain('Manage API definitions');
    });
  });
}); 