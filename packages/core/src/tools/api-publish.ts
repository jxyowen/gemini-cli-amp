/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SchemaValidator } from '../utils/schemaValidator.js';
import {
  BaseTool,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
} from './tools.js';
import { getErrorMessage } from '../utils/errors.js';
import { Config, ApprovalMode } from '../config/config.js';
import { Type } from '@google/genai';

const API_TIMEOUT_MS = 10000;
const API_BASE_URL = 'http://127.0.0.1:7001';

/**
 * API发布工具参数
 */
export interface ApiPublishToolParams {
  apiName: string;
  environment?: 'dev' | 'test' | 'prod';
}

/**
 * API发布工具，将API定义发布到API网关
 */
export class ApiPublishTool extends BaseTool<ApiPublishToolParams, ToolResult> {
  static readonly Name: string = 'api_publish';

  constructor(private readonly config: Config) {
    super(
      ApiPublishTool.Name,
      'API Publish',
      'Publish API definitions to the API gateway to make them effective.',
      {
        properties: {
          apiName: {
            description: 'The name of the API to publish',
            type: Type.STRING,
          },
          environment: {
            description: 'The target environment for deployment',
            type: Type.STRING,
            enum: ['dev', 'test', 'prod'],
          },
        },
        required: ['apiName'],
        type: Type.OBJECT,
      },
    );
  }

  validateToolParams(params: ApiPublishToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }

    if (!params.apiName || params.apiName.trim() === '') {
      return "The 'apiName' parameter cannot be empty.";
    }

    return null;
  }

  getDescription(params: ApiPublishToolParams): string {
    const env = params.environment || 'default';
    return `发布API到网关: ${params.apiName} (环境: ${env})`;
  }

  async shouldConfirmExecute(
    params: ApiPublishToolParams,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    const validationError = this.validateToolParams(params);
    if (validationError) {
      return false;
    }

    const environment = params.environment || 'default';
    
    return {
      type: 'info',
      title: `确认发布API到网关`,
      prompt: `即将发布API "${params.apiName}" 到API网关：\n\n目标环境: ${environment}\n\n⚠️ 注意：发布后API将立即生效，请确保API定义正确。\n\n是否继续发布？`,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.Cancel) {
          throw new Error('用户取消了API发布操作');
        }
      },
    };
  }

  async execute(
    params: ApiPublishToolParams,
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
      // 1. 检查API是否存在
      const apiExists = await this.checkApiExists(params.apiName, signal);
      if (!apiExists) {
        return {
          llmContent: `Error: API "${params.apiName}" 不存在，无法发布`,
          returnDisplay: `Error: API "${params.apiName}" 不存在，无法发布`,
        };
      }

      // 2. 发布API到网关
      const publishResult = await this.publishApi(params.apiName, signal);

      // 3. 验证发布状态
      const publishStatus = await this.verifyPublishStatus(params.apiName, signal);

      const environment = params.environment || 'default';
      
      return {
        llmContent: `成功发布API到网关:\n- API名称: ${params.apiName}\n- 目标环境: ${environment}\n- 发布状态: ${publishStatus}\n\n发布结果:\n${JSON.stringify(publishResult, null, 2)}`,
        returnDisplay: `✅ 成功发布API: ${params.apiName} (${environment})`,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `❌ 发布失败: ${errorMessage}`,
      };
    }
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

  private async checkApiExists(apiName: string, signal: AbortSignal): Promise<boolean> {
    try {
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

      return response.ok;
    } catch (error) {
      console.warn(`检查API存在性时发生错误: ${getErrorMessage(error)}`);
      return false;
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
      throw new Error(`API发布失败: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  private async verifyPublishStatus(apiName: string, signal: AbortSignal): Promise<string> {
    try {
      // 简单的状态验证，实际实现中可能需要更复杂的逻辑
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

      if (response.ok) {
        const result = await response.json();
        // 假设返回的数据中包含发布状态信息
        return result.data?.status || 'published';
      }
      
      return 'unknown';
    } catch (error) {
      console.warn(`验证发布状态时发生错误: ${getErrorMessage(error)}`);
      return 'verification_failed';
    }
  }
} 