/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from '../tools.js';
import { Config } from '../../config/config.js';
import { ApiPlatformClient } from './platform-client.js';
import { SwaggerParser } from './swagger-parser.js';
import { WriteFileTool } from '../write-file.js';
import { EditTool } from '../edit.js';
import * as path from 'node:path';

export interface ApiDefinitionParams {
  action: 'create' | 'read' | 'update' | 'delete' | 'list' | 'export' | 'import';
  apiId?: string;
  swaggerContent?: string;
  swaggerFile?: string;
  outputFile?: string;
  name?: string;
  version?: string;
  description?: string;
  tags?: string[];
  format?: 'yaml' | 'json';
}

export class ApiDefinitionCrudTool extends BaseTool<ApiDefinitionParams, ToolResult> {
  private platformClient: ApiPlatformClient;
  private swaggerParser: SwaggerParser;
  private writeFileTool: WriteFileTool;
  private editTool: EditTool;

  constructor(config: Config) {
    super(
      'api_definition_crud',
      'API Definition CRUD',
      'Manage API definitions in the API management platform. Supports CRUD operations on Swagger/OpenAPI specifications and file operations.',
      {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'read', 'update', 'delete', 'list', 'export', 'import'],
            description: 'The CRUD operation to perform'
          },
          apiId: {
            type: 'string',
            description: 'API identifier for read, update, delete, and export operations'
          },
          swaggerContent: {
            type: 'string',
            description: 'Swagger/OpenAPI specification content (YAML or JSON)'
          },
          swaggerFile: {
            type: 'string',
            description: 'Path to Swagger/OpenAPI specification file for import'
          },
          outputFile: {
            type: 'string',
            description: 'Output file path for export operations'
          },
          name: {
            type: 'string',
            description: 'API name for create and update operations'
          },
          version: {
            type: 'string',
            description: 'API version'
          },
          description: {
            type: 'string',
            description: 'API description'
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'API tags for categorization'
          },
          format: {
            type: 'string',
            enum: ['yaml', 'json'],
            description: 'Output format for export operations',
            default: 'yaml'
          }
        },
        required: ['action']
      },
      true, // isOutputMarkdown
      false  // canUpdateOutput
    );

    this.platformClient = new ApiPlatformClient(config);
    this.swaggerParser = new SwaggerParser();
    this.writeFileTool = new WriteFileTool(config);
    this.editTool = new EditTool(config);
  }

  validateToolParams(params: ApiDefinitionParams): string | null {
    if (!params.action) {
      return 'Action is required';
    }

    switch (params.action) {
      case 'create':
        if (!params.swaggerContent && !params.swaggerFile) {
          return 'Either swaggerContent or swaggerFile is required for create operation';
        }
        if (!params.name) {
          return 'Name is required for create operation';
        }
        break;
      case 'read':
      case 'update':
      case 'delete':
      case 'export':
        if (!params.apiId) {
          return 'API ID is required for read, update, delete, and export operations';
        }
        break;
      case 'list':
        // No additional validation needed
        break;
      case 'import':
        if (!params.swaggerFile) {
          return 'swaggerFile is required for import operation';
        }
        break;
      default:
        return `Invalid action: ${params.action}`;
    }

    return null;
  }

  getDescription(params: ApiDefinitionParams): string {
    switch (params.action) {
      case 'create':
        return `Create new API definition "${params.name}" with version ${params.version || '1.0.0'}`;
      case 'read':
        return `Read API definition with ID: ${params.apiId}`;
      case 'update':
        return `Update API definition with ID: ${params.apiId}`;
      case 'delete':
        return `Delete API definition with ID: ${params.apiId}`;
      case 'list':
        return 'List all API definitions';
      case 'export':
        return `Export API definition ${params.apiId} to ${params.outputFile || 'file'}`;
      case 'import':
        return `Import API definition from ${params.swaggerFile}`;
      default:
        return `Perform ${params.action} operation on API definition`;
    }
  }

  async execute(params: ApiDefinitionParams, signal: AbortSignal): Promise<ToolResult> {
    try {
      let result: any;

      switch (params.action) {
        case 'create':
          result = await this.createApiDefinition(params);
          break;
        case 'read':
          result = await this.readApiDefinition(params);
          break;
        case 'update':
          result = await this.updateApiDefinition(params);
          break;
        case 'delete':
          result = await this.deleteApiDefinition(params);
          break;
        case 'list':
          result = await this.listApiDefinitions(params);
          break;
        case 'export':
          result = await this.exportApiDefinition(params, signal);
          break;
        case 'import':
          result = await this.importApiDefinition(params);
          break;
        default:
          throw new Error(`Unsupported action: ${params.action}`);
      }

      return {
        llmContent: JSON.stringify(result),
        returnDisplay: this.formatResult(params.action, result, params)
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `❌ **Error**: ${errorMessage}`
      };
    }
  }

  private async createApiDefinition(params: ApiDefinitionParams): Promise<any> {
    let swaggerContent = params.swaggerContent;
    
    if (params.swaggerFile) {
      const fs = await import('node:fs/promises');
      swaggerContent = await fs.readFile(params.swaggerFile, 'utf-8');
    }

    if (!swaggerContent) {
      throw new Error('Swagger content is required');
    }

    // Parse and validate Swagger content
    const parsedSwagger = this.swaggerParser.parse(swaggerContent);
    
    const apiDefinition = {
      name: params.name!,
      version: params.version || '1.0.0',
      description: params.description || parsedSwagger.info?.description,
      tags: params.tags || parsedSwagger.tags?.map((t: any) => t.name) || [],
      swagger: parsedSwagger
    };

    return await this.platformClient.createApiDefinition(apiDefinition);
  }

  private async readApiDefinition(params: ApiDefinitionParams): Promise<any> {
    if (!params.apiId) {
      throw new Error('API ID is required');
    }
    return await this.platformClient.getApiDefinition(params.apiId);
  }

  private async updateApiDefinition(params: ApiDefinitionParams): Promise<any> {
    if (!params.apiId) {
      throw new Error('API ID is required');
    }

    let swaggerContent = params.swaggerContent;
    
    if (params.swaggerFile) {
      const fs = await import('node:fs/promises');
      swaggerContent = await fs.readFile(params.swaggerFile, 'utf-8');
    }

    const updateData: any = {};
    
    if (swaggerContent) {
      updateData.swagger = this.swaggerParser.parse(swaggerContent);
    }
    if (params.name) updateData.name = params.name;
    if (params.version) updateData.version = params.version;
    if (params.description) updateData.description = params.description;
    if (params.tags) updateData.tags = params.tags;

    return await this.platformClient.updateApiDefinition(params.apiId, updateData);
  }

  private async deleteApiDefinition(params: ApiDefinitionParams): Promise<any> {
    if (!params.apiId) {
      throw new Error('API ID is required');
    }
    return await this.platformClient.deleteApiDefinition(params.apiId);
  }

  private async listApiDefinitions(params: ApiDefinitionParams): Promise<any> {
    return await this.platformClient.listApiDefinitions();
  }

  private async exportApiDefinition(params: ApiDefinitionParams, signal: AbortSignal): Promise<any> {
    if (!params.apiId) {
      throw new Error('API ID is required');
    }

    const apiDefinition = await this.platformClient.getApiDefinition(params.apiId);
    const outputFile = params.outputFile || `${apiDefinition.name}-${apiDefinition.version}.${params.format || 'yaml'}`;
    
    // Convert to the requested format
    let content: string;
    if (params.format === 'json') {
      content = this.swaggerParser.toJson(apiDefinition.swagger);
    } else {
      content = this.swaggerParser.toYaml(apiDefinition.swagger);
    }

    // Use the existing WriteFileTool to write the file
    const writeResult = await this.writeFileTool.execute({
      file_path: path.resolve(outputFile),
      content: content
    }, signal);

    return {
      ...apiDefinition,
      exportedTo: outputFile,
      writeResult: writeResult.llmContent
    };
  }

  private async importApiDefinition(params: ApiDefinitionParams): Promise<any> {
    if (!params.swaggerFile) {
      throw new Error('swaggerFile is required');
    }

    const fs = await import('node:fs/promises');
    const swaggerContent = await fs.readFile(params.swaggerFile, 'utf-8');
    
    // Parse and validate the imported content
    const parsedSwagger = this.swaggerParser.parse(swaggerContent);
    
    // Extract name from swagger or use filename
    const name = params.name || parsedSwagger.info?.title || path.basename(params.swaggerFile, path.extname(params.swaggerFile));
    
    const apiDefinition = {
      name: name,
      version: params.version || parsedSwagger.info?.version || '1.0.0',
      description: params.description || parsedSwagger.info?.description,
      tags: params.tags || parsedSwagger.tags?.map((t: any) => t.name) || [],
      swagger: parsedSwagger
    };

    return await this.platformClient.createApiDefinition(apiDefinition);
  }

  private formatResult(action: string, result: any, params: ApiDefinitionParams): string {
    switch (action) {
      case 'create':
        return `✅ **API Definition Created**\n\n` +
               `- **ID**: ${result.id}\n` +
               `- **Name**: ${result.name}\n` +
               `- **Version**: ${result.version}\n` +
               `- **Status**: ${result.status}`;
      
      case 'read':
        return `📖 **API Definition**\n\n` +
               `- **ID**: ${result.id}\n` +
               `- **Name**: ${result.name}\n` +
               `- **Version**: ${result.version}\n` +
               `- **Description**: ${result.description}\n` +
               `- **Endpoints**: ${result.swagger?.paths ? Object.keys(result.swagger.paths).length : 0}`;
      
      case 'update':
        return `✅ **API Definition Updated**\n\n` +
               `- **ID**: ${result.id}\n` +
               `- **Name**: ${result.name}\n` +
               `- **Version**: ${result.version}\n` +
               `- **Updated At**: ${result.updatedAt}`;
      
      case 'delete':
        return `🗑️ **API Definition Deleted**\n\n` +
               `- **ID**: ${result.id}\n` +
               `- **Status**: Deleted successfully`;
      
      case 'list':
        const apis = Array.isArray(result) ? result : result.apis || [];
        if (apis.length === 0) {
          return `📋 **No API Definitions Found**`;
        }
        
        return `📋 **API Definitions (${apis.length})**\n\n` +
               apis.map((api: any) => 
                 `- **${api.name}** (v${api.version}) - ${api.description || 'No description'}`
               ).join('\n');
      
      case 'export':
        return `📤 **API Definition Exported**\n\n` +
               `- **ID**: ${result.id}\n` +
               `- **Name**: ${result.name}\n` +
               `- **Exported To**: ${result.exportedTo}\n` +
               `- **Format**: ${params.format || 'yaml'}`;
      
      case 'import':
        return `📥 **API Definition Imported**\n\n` +
               `- **ID**: ${result.id}\n` +
               `- **Name**: ${result.name}\n` +
               `- **Version**: ${result.version}\n` +
               `- **Source**: ${params.swaggerFile}`;
      
      default:
        return JSON.stringify(result, null, 2);
    }
  }
} 