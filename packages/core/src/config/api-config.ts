/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ApiManagementConfig {
  platform: {
    baseUrl: string;
    apiKey: string;
    projectId: string;
  };
  templates: {
    backend: string[];
    frontend: string[];
  };
  frameworks: {
    supported: string[];
    default: string;
  };
  codeGeneration: {
    defaultLanguage: string;
    defaultFramework: string;
    outputDirectory: string;
    generateTests: boolean;
    generateDocs: boolean;
  };
}

export const DEFAULT_API_MANAGEMENT_CONFIG: ApiManagementConfig = {
  platform: {
    baseUrl: process.env.API_PLATFORM_BASE_URL || 'https://api.example.com',
    apiKey: process.env.API_PLATFORM_KEY || '',
    projectId: process.env.API_PLATFORM_PROJECT_ID || ''
  },
  templates: {
    backend: ['express', 'fastapi', 'spring', 'aspnet'],
    frontend: ['react', 'vue', 'angular']
  },
  frameworks: {
    supported: ['express', 'fastapi', 'spring', 'aspnet', 'django', 'flask'],
    default: 'express'
  },
  codeGeneration: {
    defaultLanguage: 'typescript',
    defaultFramework: 'express',
    outputDirectory: './generated',
    generateTests: true,
    generateDocs: true
  }
}; 