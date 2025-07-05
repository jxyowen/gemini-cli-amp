/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../../config/config.js';
import { Gaxios } from 'gaxios';

// 创建 gaxios 实例
const gaxios = new Gaxios();

export interface ApiDefinition {
  id?: string;
  name: string;
  version: string;
  description?: string;
  tags?: string[];
  swagger: any;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ApiPlatformConfig {
  baseUrl: string;
  apiKey: string;
  projectId: string;
}

export class ApiPlatformClient {
  private config: ApiPlatformConfig;
  private baseUrl: string;

  constructor(config: Config) {
    // 从环境变量获取 API 管理平台配置
    const apiConfig = {
      baseUrl: process.env.API_PLATFORM_BASE_URL || 'https://api.example.com',
      apiKey: process.env.API_PLATFORM_KEY || '',
      projectId: process.env.API_PLATFORM_PROJECT_ID || ''
    };

    this.config = apiConfig;
    this.baseUrl = `${this.config.baseUrl}/api/v1/projects/${this.config.projectId}`;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  async createApiDefinition(definition: ApiDefinition): Promise<ApiDefinition> {
    try {
      const response = await gaxios.request({
        method: 'POST',
        url: `${this.baseUrl}/apis`,
        headers: this.getHeaders(),
        data: definition
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to create API definition: ${this.getErrorMessage(error)}`);
    }
  }

  async getApiDefinition(apiId: string): Promise<ApiDefinition> {
    try {
      const response = await gaxios.request({
        method: 'GET',
        url: `${this.baseUrl}/apis/${apiId}`,
        headers: this.getHeaders()
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to get API definition: ${this.getErrorMessage(error)}`);
    }
  }

  async updateApiDefinition(apiId: string, updateData: Partial<ApiDefinition>): Promise<ApiDefinition> {
    try {
      const response = await gaxios.request({
        method: 'PUT',
        url: `${this.baseUrl}/apis/${apiId}`,
        headers: this.getHeaders(),
        data: updateData
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to update API definition: ${this.getErrorMessage(error)}`);
    }
  }

  async deleteApiDefinition(apiId: string): Promise<{ id: string; status: string }> {
    try {
      await gaxios.request({
        method: 'DELETE',
        url: `${this.baseUrl}/apis/${apiId}`,
        headers: this.getHeaders()
      });

      return { id: apiId, status: 'deleted' };
    } catch (error) {
      throw new Error(`Failed to delete API definition: ${this.getErrorMessage(error)}`);
    }
  }

  async listApiDefinitions(): Promise<{ apis: ApiDefinition[] }> {
    try {
      const response = await gaxios.request({
        method: 'GET',
        url: `${this.baseUrl}/apis`,
        headers: this.getHeaders()
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to list API definitions: ${this.getErrorMessage(error)}`);
    }
  }

  async validateApiDefinition(swaggerContent: any): Promise<{ valid: boolean; errors?: string[] }> {
    try {
      const response = await gaxios.request({
        method: 'POST',
        url: `${this.baseUrl}/validate`,
        headers: this.getHeaders(),
        data: { swagger: swaggerContent }
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to validate API definition: ${this.getErrorMessage(error)}`);
    }
  }

  private getErrorMessage(error: any): string {
    if (error.response?.data?.message) {
      return error.response.data.message;
    }
    if (error.message) {
      return error.message;
    }
    return 'Unknown error occurred';
  }
} 