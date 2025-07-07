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
  ToolEditConfirmationDetails,
  FileDiff,
} from './tools.js';
import { getErrorMessage } from '../utils/errors.js';
import { Config, ApprovalMode } from '../config/config.js';
import { fetchWithTimeout } from '../utils/fetch.js';
import { DEFAULT_DIFF_OPTIONS } from './diffOptions.js';

const API_TIMEOUT_MS = 10000;
const API_BASE_URL = 'http://127.0.0.1:7001';

/**
 * 通用API管理工具参数
 */
export interface ApiManagementToolParams {
  action: 'get' | 'edit' | 'update' | 'publish';
  apiName: string;
  changeDescription?: string;
  apiMeta?: string;
}

/**
 * API管理工具实现
 */
export class ApiManagementTool extends BaseTool<ApiManagementToolParams, ToolResult> {
  static readonly Name: string = 'api_management';

  constructor(private readonly config: Config) {
    super(
      ApiManagementTool.Name,
      'API Management',
      'Manage API lifecycle including design, implementation, and publishing. Supports getting, editing, updating, and publishing API definitions.',
      {
        properties: {
          action: {
            description: 'The action to perform: get (获取API), edit (修改API), update (更新API), or publish (发布API)',
            type: 'string',
            enum: ['get', 'edit', 'update', 'publish'],
          },
          apiName: {
            description: 'The name of the API to manage',
            type: 'string',
          },
          changeDescription: {
            description: 'Description of changes to make when editing API (required for edit action)',
            type: 'string',
          },
          apiMeta: {
            description: 'API metadata for update action (required for update action)',
            type: 'string',
          },
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

    if (params.action === 'update' && (!params.apiMeta || params.apiMeta.trim() === '')) {
      return "The 'apiMeta' parameter is required for update action.";
    }

    return null;
  }

  getDescription(params: ApiManagementToolParams): string {
    switch (params.action) {
      case 'get':
        return `获取API定义: ${params.apiName}`;
      case 'edit':
        return `修改API定义: ${params.apiName} - ${params.changeDescription}`;
      case 'update':
        return `更新API定义: ${params.apiName}`;
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

    const actionDescriptions = {
      get: '获取API定义',
      edit: '修改API定义',
      update: '更新API定义',
      publish: '发布API到网关'
    };

    // 对于edit操作，提供更详细的确认信息
    if (params.action === 'edit') {
      return {
        type: 'info',
        title: `确认API修改: ${params.apiName}`,
        prompt: `即将修改API定义：\n\nAPI名称: ${params.apiName}\n修改描述: ${params.changeDescription}\n\n修改后将显示详细的diff对比。\n\n是否继续？`,
        onConfirm: async (outcome: ToolConfirmationOutcome) => {
          if (outcome === ToolConfirmationOutcome.ProceedAlways) {
            this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
          }
          if (outcome === ToolConfirmationOutcome.Cancel) {
            throw new Error('用户取消了API修改操作');
          }
        },
      };
    }

    return {
      type: 'info',
      title: `确认API管理操作`,
      prompt: `即将执行${actionDescriptions[params.action]}操作：\n\nAPI名称: ${params.apiName}\n${params.changeDescription ? `修改描述: ${params.changeDescription}\n` : ''}${params.apiMeta ? `API元数据: ${params.apiMeta}\n` : ''}\n是否继续？`,
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
          try {
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
            
            // 使用after字段的内容调用update接口来持久化修改
            const updateResult = await this.updateApi(params.apiName, JSON.stringify(afterData), signal);
            
            // 使用update的结果作为最终结果
            result = updateResult;
            displayMessage = `成功修改并更新API定义: ${params.apiName}`;
            
            // 使用before和after字段生成diff显示
            const beforeContent = JSON.stringify(beforeData, null, 2);
            const afterContent = JSON.stringify(afterData, null, 2);
            const fileName = `${params.apiName}-api.json`;
            const fileDiff = Diff.createPatch(
              fileName,
              beforeContent,
              afterContent,
              'Before',
              'After',
              DEFAULT_DIFF_OPTIONS,
            );
            
            displayResult = { fileDiff, fileName };
          } catch (error) {
            // 如果获取diff失败，仍然尝试执行edit和update操作，但不显示diff
            try {
              const editResult = await this.editApi(params.apiName, params.changeDescription!, signal);
              
              // 处理返回的数据结构
              let afterData: any;
              if (editResult.data && editResult.data.after) {
                afterData = editResult.data.after;
              } else if (editResult.after) {
                afterData = editResult.after;
              } else {
                throw new Error('edit_api返回的数据格式不正确，缺少after字段');
              }
              
              const updateResult = await this.updateApi(params.apiName, JSON.stringify(afterData), signal);
              result = updateResult;
              displayMessage = `成功修改并更新API定义: ${params.apiName}`;
              displayResult = `${displayMessage}\n\n${JSON.stringify(result, null, 2)}`;
            } catch (editError) {
              // 如果edit操作也失败，抛出原始错误
              throw error;
            }
          }
          break;
        case 'update':
          result = await this.updateApi(params.apiName, params.apiMeta!, signal);
          displayMessage = `成功更新API定义: ${params.apiName}`;
          displayResult = `${displayMessage}\n\n${JSON.stringify(result, null, 2)}`;
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
    const url = `${API_BASE_URL}/test/edit_api`;
    const params = new URLSearchParams({ apiName, changeDescription });
    
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

  private async updateApi(apiName: string, apiMeta: string, signal: AbortSignal): Promise<any> {
    const url = `${API_BASE_URL}/test/update_api`;
    const params = new URLSearchParams({ apiName, apiMeta });
    
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
} 