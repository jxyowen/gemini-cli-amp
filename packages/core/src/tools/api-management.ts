/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Diff from 'diff';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { SchemaValidator } from '../utils/schemaValidator.js';
import {
  BaseTool,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolEditConfirmationDetails,
  FileDiff,
} from './tools.js';
import { getErrorMessage } from '../utils/errors.js';
import { Config, ApprovalMode } from '../config/config.js';
import { fetchWithTimeout } from '../utils/fetch.js';
import { DEFAULT_DIFF_OPTIONS } from './diffOptions.js';
import { GeminiClient } from '../core/client.js';
import { getResponseText } from '../utils/generateContentResponseUtilities.js';

const API_TIMEOUT_MS = 10000;
const API_BASE_URL = 'http://127.0.0.1:7001';

/**
 * 通用API管理工具参数
 */
export interface ApiManagementToolParams {
  action: 'get' | 'edit' | 'publish';
  apiName: string;
  changeDescription?: string;
}

/**
 * API管理工具实现
 */
export class ApiManagementTool extends BaseTool<ApiManagementToolParams, ToolResult> {
  static readonly Name: string = 'api_management';

  constructor(
    private readonly config: Config,
    private readonly geminiClient: GeminiClient,
  ) {
    super(
      ApiManagementTool.Name,
      '镇元(阿里云) API 管理',
      '本工具专用于管理镇元API、阿里云API等接口的全生命周期，包括API修改、发布等。',
      {
        properties: {
          action: {
            description: '要执行的操作类型：get（获取API）、edit（修改API定义和参数）、publish（发布API）',
            type: 'string',
            enum: ['get', 'edit', 'publish'],
          },
          apiName: {
            description: '需要管理的API名称（如：CreateInstance、ListUsers 等）',
            type: 'string',
          }
        },
        required: ['action', 'apiName'],
        type: 'object',
      },
    );
  }

  validateToolParams(params: ApiManagementToolParams): string | null {
    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      return 'Parameters failed schema validation.';
    }

    if (!params.apiName || params.apiName.trim() === '') {
      return "The 'apiName' parameter cannot be empty.";
    }

    if (params.action === 'edit' && (!params.changeDescription || params.changeDescription.trim() === '')) {
      return "The 'changeDescription' parameter is required for edit action.";
    }

    return null;
  }

  getDescription(params: ApiManagementToolParams): string {
    switch (params.action) {
      case 'get':
        return `获取API定义: ${params.apiName}`;
      case 'edit':
        return `修改API定义: ${params.apiName} - ${params.changeDescription}`;
      case 'publish':
        return `发布API到网关: ${params.apiName}`;
      default:
        return `API管理操作: ${params.action}`;
    }
  }

  async shouldConfirmExecute(
    params: ApiManagementToolParams,
    signal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    const validationError = this.validateToolParams(params);
    if (validationError) {
      return false;
    }

    // getApi和editApi操作不需要人工确认
    if (params.action === 'get' || params.action === 'edit') {
      return false;
    }

    const actionDescriptions = {
      publish: '发布API到网关'
    };

    return {
      type: 'info',
      title: `确认API管理操作`,
      prompt: `即将执行${actionDescriptions[params.action]}操作：\n\nAPI名称: ${params.apiName}\n${params.changeDescription ? `修改描述: ${params.changeDescription}\n` : ''}\n是否继续？`,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.Cancel) {
          throw new Error('用户取消了API管理操作');
        }
      },
    };
  }

  async execute(
    params: ApiManagementToolParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    try {
      let result: any;
      let displayMessage: string;
      let displayResult: string | FileDiff;

      switch (params.action) {
        case 'get':
          result = await this.getApi(params.apiName, signal);
          displayMessage = `成功获取API定义: ${params.apiName}`;
          displayResult = `${displayMessage}\n\n${JSON.stringify(result, null, 2)}`;
          break;
        case 'edit':
          // 执行API修改，获取包含before和after字段的结果
          const editResult = await this.editApi(params.apiName, params.changeDescription!, signal);
          
          // 处理返回的数据结构，支持直接的before/after字段和嵌套在data中的字段
          let beforeData: any;
          let afterData: any;
          
          if (editResult.data && editResult.data.before && editResult.data.after) {
            // 数据嵌套在data字段中
            beforeData = editResult.data.before;
            afterData = editResult.data.after;
          } else if (editResult.before && editResult.after) {
            // 数据直接在根级别
            beforeData = editResult.before;
            afterData = editResult.after;
          } else {
            throw new Error('edit_api返回的数据格式不正确，缺少before或after字段');
          }
          
          // 生成diff显示用于二次确认
          let fileDiff: string;
          let fileName: string;
          try {
            const beforeContent = JSON.stringify(beforeData, null, 2);
            const afterContent = JSON.stringify(afterData, null, 2);
            fileName = `${params.apiName}-api.json`;
            fileDiff = Diff.createPatch(
              fileName,
              beforeContent,
              afterContent,
              'Before',
              'After',
              DEFAULT_DIFF_OPTIONS,
            );
          } catch (diffError) {
            // 如果diff生成失败，使用JSON格式
            console.warn('Diff生成失败，使用JSON格式显示:', getErrorMessage(diffError));
            fileName = `${params.apiName}-api.json`;
            const beforeContent = JSON.stringify(beforeData, null, 2);
            const afterContent = JSON.stringify(afterData, null, 2);
            fileDiff = `--- ${fileName} (Before)\n+++ ${fileName} (After)\n@@ -1,1 +1,1 @@\n-${beforeContent}\n+${afterContent}`;
          }
          
          // 返回需要二次确认的编辑结果
          return {
            llmContent: JSON.stringify({ before: beforeData, after: afterData }, null, 2),
            returnDisplay: {
              type: 'edit',
              title: `确认API修改: ${params.apiName}`,
              fileName,
              fileDiff,
              onConfirm: async (outcome: ToolConfirmationOutcome) => {
                if (outcome === ToolConfirmationOutcome.Cancel) {
                  throw new Error('用户取消了API修改操作');
                }
                
                // 用户确认后，自动执行update操作
                try {
                  const updateResult = await this.updateApi(params.apiName, JSON.stringify(afterData), signal);
                  console.log(`API修改已确认并自动更新: ${params.apiName}`);
                } catch (updateError) {
                  console.error(`API更新失败: ${getErrorMessage(updateError)}`);
                  throw new Error(`API修改确认成功，但更新失败: ${getErrorMessage(updateError)}`);
                }
              },
            } as ToolEditConfirmationDetails,
          };
          break;
        case 'publish':
          result = await this.publishApi(params.apiName, signal);
          displayMessage = `成功发布API到网关: ${params.apiName}`;
          displayResult = `${displayMessage}\n\n${JSON.stringify(result, null, 2)}`;
          break;
        default:
          throw new Error(`不支持的操作: ${params.action}`);
      }

      return {
        llmContent: JSON.stringify(result, null, 2),
        returnDisplay: displayResult,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
      };
    }
  }

  private async getApi(apiName: string, signal: AbortSignal): Promise<any> {
    const url = `${API_BASE_URL}/test/get_api`;
    const params = new URLSearchParams({ apiName });
    
    const response = await this.fetchWithTimeoutAndOptions(
      `${url}?${params.toString()}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal,
      }
    );

    if (!response.ok) {
      throw new Error(`API调用失败: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  private async fetchWithTimeoutAndOptions(
    url: string,
    options: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: options.signal || controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async editApi(apiName: string, changeDescription: string, signal: AbortSignal): Promise<any> {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const schemaPath = path.join(__dirname, '../core/apiJsonSchema.yml');
    try {
      // 1. 获取当前API定义
      const currentApiData = await this.getApi(apiName, signal);
      
      // 2. 读取API JSON Schema
      let apiSchema = '';
      try {
        apiSchema = fs.readFileSync(schemaPath, 'utf8');
      } catch (error) {
        console.warn('无法读取apiJsonSchema.yml文件，将继续使用基本的修改逻辑');
        apiSchema = '# API Schema not available';
      }
      
      // 3. 构建提示词
      const prompt = `你是一个阿里云API设计专家。请根据以下API JSON Schema规范和用户的修改要求，修改给定的API定义。

API JSON Schema规范：
\`\`\`yaml
${apiSchema}
\`\`\`

当前API定义：
\`\`\`json
${JSON.stringify(currentApiData, null, 2)}
\`\`\`

用户修改要求：
${changeDescription}

请按照以下要求修改API定义：
1. 严格遵循API JSON Schema规范
2. 保持API的基本结构和重要属性不变
3. 只修改与用户要求相关的部分
4. 确保修改后的API定义是完整且有效的
5. 如果需要添加新的参数，请按照schema规范正确设置backendName等必要字段
6. 参数名称使用大驼峰命名（如RegionId、InstanceId）
7. backendName使用小驼峰命名（如regionId、instanceId）

请直接返回修改后的完整API定义（JSON格式），不要包含任何解释或额外文本。`;

      // 4. 调用大模型进行修改
      const contents = [{
        parts: [{ text: prompt }],
        role: 'user' as const
      }];
      
      const response = await this.geminiClient.generateContent(contents, {}, signal);

      const modifiedApiText = getResponseText(response);
      if (!modifiedApiText) {
        throw new Error('大模型返回结果为空');
      }
      
      // 5. 解析修改后的API定义
      let modifiedApiData: any;
      try {
        // 移除可能的markdown代码块标记
        const cleanedText = modifiedApiText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        modifiedApiData = JSON.parse(cleanedText);
      } catch (parseError) {
        throw new Error(`无法解析大模型返回的API定义: ${getErrorMessage(parseError)}`);
      }

      // 6. 返回包含before和after的结果
      return {
        before: currentApiData,
        after: modifiedApiData
      };
      
    } catch (error) {
      throw new Error(`API修改失败: ${getErrorMessage(error)}`);
    }
  }

  private async publishApi(apiName: string, signal: AbortSignal): Promise<any> {
    const url = `${API_BASE_URL}/test/publish_api`;
    const params = new URLSearchParams({ apiName });
    
    const response = await this.fetchWithTimeoutAndOptions(
      `${url}?${params.toString()}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal,
      }
    );

    if (!response.ok) {
      throw new Error(`API调用失败: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  private async updateApi(apiName: string, updatedApiJson: string, signal: AbortSignal): Promise<any> {
    const url = `${API_BASE_URL}/test/update_api`;
    const params = new URLSearchParams({ apiName });
    
    const response = await this.fetchWithTimeoutAndOptions(
      `${url}?${params.toString()}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: updatedApiJson,
        signal,
      }
    );

    if (!response.ok) {
      throw new Error(`API调用失败: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }
} 