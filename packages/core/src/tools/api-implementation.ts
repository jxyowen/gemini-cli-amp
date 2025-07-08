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
import { WriteFileTool } from './write-file.js';
import { EditTool } from './edit.js';
import { getResponseText } from '../utils/generateContentResponseUtilities.js';
import { Type } from '@google/genai';
import path from 'path';
import fs from 'fs';

const API_TIMEOUT_MS = 10000;
const API_BASE_URL = 'http://127.0.0.1:7001';

/**
 * API实现工具参数
 */
export interface ApiImplementationToolParams {
  apiName: string;
  outputPath?: string;
  language?: 'java' | 'javascript' | 'typescript' | 'python';
  framework?: 'spring' | 'express' | 'fastapi' | 'auto';
}

/**
 * API实现工具，根据API定义生成Controller代码
 */
export class ApiImplementationTool extends BaseTool<ApiImplementationToolParams, ToolResult> {
  static readonly Name: string = 'api_implementation';

  private writeFileTool: WriteFileTool;
  private editTool: EditTool;

  constructor(private readonly config: Config) {
    super(
      ApiImplementationTool.Name,
      'API Implementation',
      'Generate Controller code based on API definitions. Supports multiple languages and frameworks.',
      {
        properties: {
          apiName: {
            description: 'The name of the API to implement',
            type: Type.STRING,
          },
          outputPath: {
            description: 'The output directory path for generated files (optional, defaults to current directory)',
            type: Type.STRING,
          },
          language: {
            description: 'The programming language for code generation',
            type: Type.STRING,
            enum: ['java', 'javascript', 'typescript', 'python'],
          },
          framework: {
            description: 'The framework to use for code generation',
            type: Type.STRING,
            enum: ['spring', 'express', 'fastapi', 'auto'],
          },
        },
        required: ['apiName'],
        type: Type.OBJECT,
      },
    );
    this.writeFileTool = new WriteFileTool(config);
    this.editTool = new EditTool(config);
  }

  validateToolParams(params: ApiImplementationToolParams): string | null {
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

    return null;
  }

  getDescription(params: ApiImplementationToolParams): string {
    const lang = params.language || 'auto';
    const framework = params.framework || 'auto';
    return `生成API实现代码: ${params.apiName} (${lang}/${framework})`;
  }

  async shouldConfirmExecute(
    params: ApiImplementationToolParams,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    const validationError = this.validateToolParams(params);
    if (validationError) {
      return false;
    }

    return {
      type: 'info',
      title: `确认生成API实现代码`,
      prompt: `即将为API "${params.apiName}" 生成Controller代码：\n\n语言: ${params.language || 'auto'}\n框架: ${params.framework || 'auto'}\n输出路径: ${params.outputPath || '当前目录'}\n\n是否继续？`,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.Cancel) {
          throw new Error('用户取消了API实现代码生成');
        }
      },
    };
  }

  async execute(
    params: ApiImplementationToolParams,
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
      // 1. 获取API定义
      const apiDefinition = await this.getApiDefinition(params.apiName, signal);

      // 2. 确定语言和框架
      const detectedConfig = this.detectLanguageAndFramework(params);

      // 3. 生成Controller代码
      const generatedCode = await this.generateControllerCode(
        apiDefinition,
        detectedConfig,
        signal
      );

      // 4. 确定输出文件路径
      const outputFilePath = this.determineOutputFilePath(
        params.apiName,
        detectedConfig,
        params.outputPath
      );

      // 5. 写入文件
      await this.writeGeneratedCode(outputFilePath, generatedCode, signal);

      return {
        llmContent: `成功生成API实现代码:\n- API名称: ${params.apiName}\n- 语言: ${detectedConfig.language}\n- 框架: ${detectedConfig.framework}\n- 输出文件: ${outputFilePath}\n\n生成的代码:\n${generatedCode}`,
        returnDisplay: `成功生成API实现代码: ${path.basename(outputFilePath)}`,
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

  private async getApiDefinition(apiName: string, signal: AbortSignal): Promise<any> {
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
      throw new Error(`获取API定义失败: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    return result.data;
  }

  private detectLanguageAndFramework(params: ApiImplementationToolParams): { language: string; framework: string } {
    let language = params.language;
    let framework = params.framework;

    // 如果未指定语言，尝试从项目文件中检测
    if (!language) {
      const rootDir = this.config.getTargetDir();
      
      if (fs.existsSync(path.join(rootDir, 'package.json'))) {
        // 检测是否是TypeScript项目
        if (fs.existsSync(path.join(rootDir, 'tsconfig.json'))) {
          language = 'typescript';
        } else {
          language = 'javascript';
        }
      } else if (fs.existsSync(path.join(rootDir, 'pom.xml')) || fs.existsSync(path.join(rootDir, 'build.gradle'))) {
        language = 'java';
      } else if (fs.existsSync(path.join(rootDir, 'requirements.txt')) || fs.existsSync(path.join(rootDir, 'pyproject.toml'))) {
        language = 'python';
      } else {
        // 默认使用TypeScript
        language = 'typescript';
      }
    }

    // 如果未指定框架，根据语言选择默认框架
    if (!framework) {
      switch (language) {
        case 'java':
          framework = 'spring';
          break;
        case 'javascript':
        case 'typescript':
          framework = 'express';
          break;
        case 'python':
          framework = 'fastapi';
          break;
        default:
          framework = 'express';
      }
    }

    return { language, framework };
  }

  private async generateControllerCode(
    apiDefinition: any,
    config: { language: string; framework: string },
    signal: AbortSignal
  ): Promise<string> {
    // 基于API定义和配置生成代码
    const template = this.getCodeTemplate(config.language, config.framework);
    
    // 使用Gemini来生成具体的代码
    const geminiClient = this.config.getGeminiClient();
    const prompt = `
根据以下API定义生成${config.language}/${config.framework}的Controller代码:

API定义:
${JSON.stringify(apiDefinition, null, 2)}

代码模板:
${template}

请生成完整的Controller代码，包括：
1. 必要的导入语句
2. 类定义和注解
3. 所有API端点的实现方法
4. 适当的错误处理
5. 符合${config.framework}框架的最佳实践

只返回代码，不需要其他解释。
`;

    const result = await geminiClient.generateContent(
      [{ role: 'user', parts: [{ text: prompt }] }],
      {},
      signal,
    );

    const generatedCode = getResponseText(result);
    if (!generatedCode) {
      throw new Error('生成代码失败');
    }

    return generatedCode;
  }

  private getCodeTemplate(language: string, framework: string): string {
    const templates: Record<string, Record<string, string>> = {
      java: {
        spring: `@RestController
@RequestMapping("/api")
public class {ClassName}Controller {
    // Controller implementation
}`,
      },
      typescript: {
        express: `import { Request, Response, Router } from 'express';

const router = Router();

// API implementations

export default router;`,
      },
      javascript: {
        express: `const express = require('express');
const router = express.Router();

// API implementations

module.exports = router;`,
      },
      python: {
        fastapi: `from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

# API implementations`,
      },
    };

    return templates[language]?.[framework] || templates.typescript.express;
  }

  private determineOutputFilePath(
    apiName: string,
    config: { language: string; framework: string },
    outputPath?: string
  ): string {
    const rootDir = this.config.getTargetDir();
    const baseDir = outputPath ? path.resolve(rootDir, outputPath) : rootDir;

    // 根据语言确定文件扩展名
    const extensions: Record<string, string> = {
      java: '.java',
      typescript: '.ts',
      javascript: '.js',
      python: '.py',
    };

    const extension = extensions[config.language] || '.ts';
    const fileName = `${apiName}Controller${extension}`;

    // 根据框架确定目录结构
    let subDir = '';
    switch (config.framework) {
      case 'spring':
        subDir = 'src/main/java/controller';
        break;
      case 'express':
        subDir = 'src/controllers';
        break;
      case 'fastapi':
        subDir = 'app/controllers';
        break;
    }

    return path.join(baseDir, subDir, fileName);
  }

  private async writeGeneratedCode(
    filePath: string,
    code: string,
    signal: AbortSignal
  ): Promise<void> {
    // 确保目录存在
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 使用WriteFileTool来写入文件
    await this.writeFileTool.execute(
      {
        file_path: filePath,
        content: code,
      },
      signal
    );
  }
} 