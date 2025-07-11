/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Diff from 'diff';
import { SchemaValidator } from '../utils/schemaValidator.js';
import {
  BaseTool,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  FileDiff,
} from './tools.js';
import { getErrorMessage } from '../utils/errors.js';
import { Config, ApprovalMode } from '../config/config.js';
import { fetchWithTimeout } from '../utils/fetch.js';
import { DEFAULT_DIFF_OPTIONS } from './diffOptions.js';
import { getResponseText } from '../utils/generateContentResponseUtilities.js';
import { Type } from '@google/genai';
import { apiJsonSchema } from '../core/apiJsonSchema.js';

const API_TIMEOUT_MS = 10000;
const API_BASE_URL = 'https://pre-cs.api.aliyun-inc.com';

/**
 * 通用API管理工具参数
 */
export interface ApiManagementToolParams {
  action: 'get' | 'edit' | 'publish' | 'list';
  apiName?: string;
  changeDescription?: string;
}

/**
 * API管理工具实现
 */
export class ApiManagementTool extends BaseTool<ApiManagementToolParams, ToolResult> {
  static readonly Name: string = 'api_management';

  constructor(
    private readonly config: Config,
  ) {
    super(
      ApiManagementTool.Name,
      '镇元(阿里云) API 管理',
      '本工具专用于管理镇元API、阿里云API等接口的全生命周期，包括API获取、修改、发布、列表查询等。',
      {
        properties: {
          action: {
            description: '要执行的操作类型：get（获取API）、edit（修改API定义和参数）、publish（发布API）、list（获取API名称列表）',
            type: Type.STRING,
            enum: ['get', 'edit', 'publish', 'list'],
          },
          apiName: {
            description: '需要管理的API名称（如：CreateInstance、ListUsers 等），list操作时可选',
            type: Type.STRING,
          },
          changeDescription: {
            description: '修改描述，用于edit操作时描述需要进行的具体修改',
            type: Type.STRING,
          }
        },
        required: ['action'],
        type: Type.OBJECT,
      },
    );
  }

  validateToolParams(params: ApiManagementToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }

    // list操作不需要apiName参数
    if (params.action !== 'list' && (!params.apiName || params.apiName.trim() === '')) {
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
      case 'list':
        return `获取API名称列表`;
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

    // 只有get和list操作不需要人工确认，edit和publish都需要确认
    if (params.action === 'get' || params.action === 'list') {
      return false;
    }

    // 对于edit操作，生成确认详情
    if (params.action === 'edit') {
      if (!params.apiName) {
        return false;
      }
      try {
        // 预先计算edit结果用于展示diff
        const editResult = await this.editApi(params.apiName, params.changeDescription!, signal);
        
        let beforeData: any;
        let afterData: any;
        
        if (editResult.data && editResult.data.before && editResult.data.after) {
          beforeData = editResult.data.before;
          afterData = editResult.data.after;
        } else if (editResult.before && editResult.after) {
          beforeData = editResult.before;
          afterData = editResult.after;
        } else {
          throw new Error('edit_api返回的数据格式不正确，缺少before或after字段');
        }
        
        const fileName = `${params.apiName}-api.json`;
        const beforeContent = JSON.stringify(beforeData, null, 2);
        const afterContent = JSON.stringify(afterData, null, 2);
        const fileDiff = Diff.createPatch(
          fileName,
          beforeContent,
          afterContent,
          'Before',
          'After',
          DEFAULT_DIFF_OPTIONS,
        );

        const confirmationDetails: ToolCallConfirmationDetails = {
          type: 'info',
          title: `确认API修改: ${params.apiName}`,
          prompt: `即将修改API定义：\n\nAPI名称: ${params.apiName}\n修改描述: ${params.changeDescription}\n\n修改前后对比:\n${fileDiff}\n\n是否继续？`,
          onConfirm: async (outcome: ToolConfirmationOutcome) => {
            if (outcome === ToolConfirmationOutcome.ProceedAlways) {
              this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
            }
          },
        };
        
        // 将计算的结果缓存起来，避免在execute中重复计算
        (this as any)._cachedEditResult = { beforeData, afterData, params };
        
        return confirmationDetails;
      } catch (error) {
        console.error(`准备API编辑确认时出错: ${getErrorMessage(error)}`);
        return false;
      }
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
          if (!params.apiName) {
            throw new Error('apiName参数是必需的');
          }
          result = await this.getApi(params.apiName, signal);
          displayMessage = `成功获取API定义: ${params.apiName}`;
          displayResult = `${displayMessage}\n\n${JSON.stringify(result, null, 2)}`;
          break;
        case 'edit':
          if (!params.apiName) {
            throw new Error('apiName参数是必需的');
          }
          // 检查是否有缓存的编辑结果（来自shouldConfirmExecute）
          const cachedResult = (this as any)._cachedEditResult;
          let beforeData: any;
          let afterData: any;
          
          if (cachedResult && cachedResult.params.apiName === params.apiName && 
              cachedResult.params.changeDescription === params.changeDescription) {
            // 使用缓存的结果
            beforeData = cachedResult.beforeData;
            afterData = cachedResult.afterData;
            // 清除缓存
            delete (this as any)._cachedEditResult;
          } else {
            // 如果没有缓存（比如自动批准模式），重新执行edit
            const editResult = await this.editApi(params.apiName, params.changeDescription!, signal);
            
            if (editResult.data && editResult.data.before && editResult.data.after) {
              beforeData = editResult.data.before;
              afterData = editResult.data.after;
            } else if (editResult.before && editResult.after) {
              beforeData = editResult.before;
              afterData = editResult.after;
            } else {
              throw new Error('edit_api返回的数据格式不正确，缺少before或after字段');
            }
          }
          
          // 执行update操作
          try {
            result = await this.updateApi(params.apiName, JSON.stringify(afterData), signal);
            displayMessage = `成功修改API: ${params.apiName}`;
            displayResult = `${displayMessage}\n\n修改前后对比:\n\nBefore:\n${JSON.stringify(beforeData, null, 2)}\n\nAfter:\n${JSON.stringify(afterData, null, 2)}\n\n更新结果:\n${JSON.stringify(result, null, 2)}`;
          } catch (updateError) {
            throw new Error(`API更新失败: ${getErrorMessage(updateError)}`);
          }
          break;
        case 'publish':
          if (!params.apiName) {
            throw new Error('apiName参数是必需的');
          }
          result = await this.publishApi(params.apiName, signal);
          displayMessage = `成功发布API到网关: ${params.apiName}`;
          displayResult = `${displayMessage}\n\n${JSON.stringify(result, null, 2)}`;
          break;
        case 'list':
          result = await this.listApiNames(signal);
          displayMessage = `成功获取API名称列表`;
          displayResult = `${displayMessage}\n\n可用的API:\n${result.map((name: string) => `- ${name}`).join('\n')}`;
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
    const url = `${API_BASE_URL}/api/v2/idea_plugin/apis/${apiName}`;
    
    const response = await this.fetchWithTimeoutAndOptions(
      url,
      {
        method: 'GET',
        signal,
      }
    );

    if (!response.ok) {
      throw new Error(`API调用失败: ${response.status} ${response.statusText}`);
    }

    const responseData = await response.json();
    return responseData.data || responseData;
  }

  private async listApiNames(signal: AbortSignal): Promise<string[]> {
    const url = `${API_BASE_URL}/api/v2/idea_plugin/apis`;
    
    const response = await this.fetchWithTimeoutAndOptions(
      url,
      {
        method: 'GET',
        signal,
      }
    );

    if (!response.ok) {
      throw new Error(`API调用失败: ${response.status} ${response.statusText}`);
    }

    const responseData = await response.json();
    return responseData.data || [];
  }

  private async fetchWithTimeoutAndOptions(
    url: string,
    options: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    // 从环境变量获取token并添加到headers中
    const ampToken = process.env.AMP_CLI_TOKEN;
    const headers = {
      ...options.headers,
      ...(ampToken && { 'amp_plugin_token': ampToken })
    };

    // 从环境变量获取projectUuid并添加到查询参数中
    const projectUuid = process.env.AMP_CLI_PROJECT;
    let finalUrl = url;
    if (projectUuid) {
      const urlObj = new URL(url);
      urlObj.searchParams.append('projectUuid', projectUuid);
      finalUrl = urlObj.toString();
    }

    try {
      const response = await fetch(finalUrl, {
        ...options,
        headers,
        signal: options.signal || controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async editApi(apiName: string, changeDescription: string, signal: AbortSignal): Promise<any> {
    try {
      // 1. 获取当前API定义
      const currentApiData = await this.getApi(apiName, signal);
      
      // 2. 获取API JSON Schema（直接从导入的对象中获取）
      const apiSchemaJson = JSON.stringify(apiJsonSchema, null, 2);
      
      // 3. 构建提示词
      const prompt = `你是一个阿里云API设计专家。请根据以下API JSON Schema规范和用户的修改要求，修改给定的API定义。

API JSON Schema规范：
\`\`\`json
${apiSchemaJson}
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
      
      const geminiClient = this.config.getGeminiClient();
      if (!geminiClient) {
        throw new Error('Gemini客户端未初始化，请检查身份验证状态');
      }
      
      const response = await geminiClient.generateContent(contents, {}, signal);

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

    const responseData = await response.json();
    return responseData.data || responseData;
  }

  private async updateApi(apiName: string, updatedApiJson: string, signal: AbortSignal): Promise<any> {
    const url = `${API_BASE_URL}/api/v2/idea_plugin/apis/${apiName}`;
    
    const response = await this.fetchWithTimeoutAndOptions(
      url,
      {
        method: 'PUT',
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

    const responseData = await response.json();
    return responseData.data || responseData;
  }
} 