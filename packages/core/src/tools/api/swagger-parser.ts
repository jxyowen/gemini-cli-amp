/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as yaml from 'js-yaml';

export interface SwaggerInfo {
  title: string;
  version: string;
  description?: string;
  contact?: {
    name?: string;
    email?: string;
    url?: string;
  };
  license?: {
    name: string;
    url?: string;
  };
}

export interface SwaggerTag {
  name: string;
  description?: string;
}

export interface SwaggerPath {
  [method: string]: {
    summary?: string;
    description?: string;
    parameters?: any[];
    responses?: any;
    tags?: string[];
  };
}

export interface SwaggerSpec {
  swagger?: string;
  openapi?: string;
  info: SwaggerInfo;
  host?: string;
  basePath?: string;
  schemes?: string[];
  consumes?: string[];
  produces?: string[];
  paths: { [path: string]: SwaggerPath };
  definitions?: any;
  parameters?: any;
  responses?: any;
  securityDefinitions?: any;
  security?: any[];
  tags?: SwaggerTag[];
  externalDocs?: {
    description?: string;
    url: string;
  };
}

export class SwaggerParser {
  parse(content: string): SwaggerSpec {
    try {
      // 检测内容格式（JSON 或 YAML）
      const isJson = this.isJsonContent(content);
      
      if (isJson) {
        return this.parseJson(content);
      } else {
        return this.parseYaml(content);
      }
    } catch (error) {
      throw new Error(`Failed to parse Swagger content: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private isJsonContent(content: string): boolean {
    const trimmed = content.trim();
    return trimmed.startsWith('{') || trimmed.startsWith('[');
  }

  private parseJson(content: string): SwaggerSpec {
    try {
      const parsed = JSON.parse(content);
      this.validateSwaggerSpec(parsed);
      return parsed;
    } catch (error) {
      throw new Error(`Invalid JSON format: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private parseYaml(content: string): SwaggerSpec {
    try {
      const parsed = yaml.load(content) as SwaggerSpec;
      this.validateSwaggerSpec(parsed);
      return parsed;
    } catch (error) {
      throw new Error(`Invalid YAML format: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private validateSwaggerSpec(spec: any): void {
    if (!spec.info) {
      throw new Error('Swagger spec must contain info section');
    }

    if (!spec.info.title) {
      throw new Error('Swagger spec info must contain title');
    }

    if (!spec.info.version) {
      throw new Error('Swagger spec info must contain version');
    }

    if (!spec.paths) {
      throw new Error('Swagger spec must contain paths section');
    }

    // 验证版本
    if (!spec.swagger && !spec.openapi) {
      throw new Error('Swagger spec must specify swagger or openapi version');
    }

    // 验证路径格式
    for (const path in spec.paths) {
      if (!path.startsWith('/')) {
        throw new Error(`Path must start with '/': ${path}`);
      }
    }
  }

  validate(spec: SwaggerSpec): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      this.validateSwaggerSpec(spec);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    // 检查是否有至少一个端点
    if (spec.paths && Object.keys(spec.paths).length === 0) {
      errors.push('Swagger spec must contain at least one endpoint');
    }

    // 检查每个端点的响应定义
    for (const path in spec.paths) {
      const pathObj = spec.paths[path];
      for (const method in pathObj) {
        const methodObj = pathObj[method];
        if (!methodObj.responses) {
          errors.push(`Endpoint ${method.toUpperCase()} ${path} must have responses defined`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  getEndpoints(spec: SwaggerSpec): Array<{ path: string; method: string; summary?: string }> {
    const endpoints: Array<{ path: string; method: string; summary?: string }> = [];

    for (const path in spec.paths) {
      const pathObj = spec.paths[path];
      for (const method in pathObj) {
        if (['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(method.toLowerCase())) {
          endpoints.push({
            path,
            method: method.toUpperCase(),
            summary: pathObj[method].summary
          });
        }
      }
    }

    return endpoints;
  }

  getTags(spec: SwaggerSpec): string[] {
    const tags = new Set<string>();

    // 从 tags 定义中获取
    if (spec.tags) {
      spec.tags.forEach(tag => tags.add(tag.name));
    }

    // 从端点中获取
    for (const path in spec.paths) {
      const pathObj = spec.paths[path];
      for (const method in pathObj) {
        const methodObj = pathObj[method];
        if (methodObj.tags) {
          methodObj.tags.forEach(tag => tags.add(tag));
        }
      }
    }

    return Array.from(tags);
  }

  // 新增：将 Swagger 规范转换为 YAML 字符串
  toYaml(spec: SwaggerSpec): string {
    try {
      return yaml.dump(spec, {
        indent: 2,
        lineWidth: 120,
        noRefs: true
      });
    } catch (error) {
      throw new Error(`Failed to convert to YAML: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // 新增：将 Swagger 规范转换为 JSON 字符串
  toJson(spec: SwaggerSpec): string {
    try {
      return JSON.stringify(spec, null, 2);
    } catch (error) {
      throw new Error(`Failed to convert to JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} 