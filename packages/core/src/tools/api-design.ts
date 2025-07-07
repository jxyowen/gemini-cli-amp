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
  ToolEditConfirmationDetails,
  FileDiff,
} from './tools.js';
import { getErrorMessage } from '../utils/errors.js';
import { Config, ApprovalMode } from '../config/config.js';

const API_TIMEOUT_MS = 10000;
const API_BASE_URL = 'http://127.0.0.1:7001';

/**
 * API设计工具参数
 */
export interface ApiDesignToolParams {
  apiName: string;
  changeDescription: string;
}

/**
 * API设计工具实现
 */
export class ApiDesignTool extends BaseTool<ApiDesignToolParams, ToolResult> {
  static readonly Name: string = 'api_design';

  constructor(private readonly config: Config) {
    super(
      ApiDesignTool.Name,
      'API Design',
      'Design and modify API definitions using natural language. Shows diff before and after changes, requires user confirmation.',
      {
        properties: {
          apiName: {
            description: 'The name of the API to design or modify',
            type: 'string',
          },
          changeDescription: {
            description: 'Natural language description of the changes to make to the API',
            type: 'string',
          },
        },
        required: ['apiName', 'changeDescription'],
        type: 'object',
      },
    );
  }

  validateToolParams(params: ApiDesignToolParams): string | null {
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

    if (!params.changeDescription || params.changeDescription.trim() === '') {
      return "The 'changeDescription' parameter cannot be empty.";
    }

    return null;
  }

  getDescription(params: ApiDesignToolParams): string {
    return `设计API: ${params.apiName} - ${params.changeDescription}`;
  }

  async shouldConfirmExecute(
    params: ApiDesignToolParams,
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return false;
    }

    try {
      // 获取修改前后的API定义
      const editResult = await this.editApi(params.apiName, params.changeDescription, abortSignal);
      
      if (!editResult.data || !editResult.data.before || !editResult.data.after) {
        return false;
      }

      const beforeApi = JSON.stringify(editResult.data.before, null, 2);
      const afterApi = JSON.stringify(editResult.data.after, null, 2);
      
      // 生成diff
      const diff = this.generateDiff(beforeApi, afterApi);

      const confirmation: ToolEditConfirmationDetails = {
        type: 'edit',
        title: `API设计确认: ${params.apiName}`,
        fileName: `${params.apiName}.json`,
        fileDiff: diff,
        isModifying: true,
        onConfirm: async (outcome: ToolConfirmationOutcome) => {
          if (outcome === ToolConfirmationOutcome.Cancel) {
            throw new Error('用户取消了API设计操作');
          }
          
          if (outcome === ToolConfirmationOutcome.ProceedOnce ||
              outcome === ToolConfirmationOutcome.ProceedAlways) {
            // 用户确认后，更新API定义
            await this.updateApi(params.apiName, JSON.stringify(editResult.data.after), abortSignal);
          }
        },
      };

      return confirmation;
    } catch (error) {
      console.error('Error getting API diff:', error);
      return false;
    }
  }

  async execute(
    params: ApiDesignToolParams,
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
      // 获取修改结果
      const editResult = await this.editApi(params.apiName, params.changeDescription, signal);
      
      if (!editResult.data || !editResult.data.before || !editResult.data.after) {
        return {
          llmContent: 'Error: Invalid API edit response format',
          returnDisplay: 'Error: Invalid API edit response format',
        };
      }

      const beforeApi = JSON.stringify(editResult.data.before, null, 2);
      const afterApi = JSON.stringify(editResult.data.after, null, 2);
      
      // 生成diff显示
      const diff = this.generateDiff(beforeApi, afterApi);

      const resultDisplay: FileDiff = {
        fileName: `${params.apiName}.json`,
        fileDiff: diff,
      };

      return {
        llmContent: `API设计完成: ${params.apiName}\n\n修改前:\n${beforeApi}\n\n修改后:\n${afterApi}`,
        returnDisplay: resultDisplay,
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
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

  private generateDiff(before: string, after: string): string {
    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');
    
    const maxLines = Math.max(beforeLines.length, afterLines.length);
    const diff: string[] = [];
    
    for (let i = 0; i < maxLines; i++) {
      const beforeLine = beforeLines[i] || '';
      const afterLine = afterLines[i] || '';
      
      if (beforeLine !== afterLine) {
        if (beforeLine && !afterLine) {
          diff.push(`- ${beforeLine}`);
        } else if (!beforeLine && afterLine) {
          diff.push(`+ ${afterLine}`);
        } else if (beforeLine && afterLine) {
          diff.push(`- ${beforeLine}`);
          diff.push(`+ ${afterLine}`);
        }
      } else if (beforeLine === afterLine && beforeLine) {
        diff.push(`  ${beforeLine}`);
      }
    }
    
    return diff.join('\n');
  }
} 