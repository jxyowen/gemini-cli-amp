/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro';
export const DEFAULT_GEMINI_FLASH_MODEL = 'gemini-2.5-flash';
export const DEFAULT_GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';

// 通义千问模型配置
export const DEFAULT_QWEN_MODEL = 'qwen-max';
export const QWEN_MODELS = [
  'qwen-max',
  'qwen-plus', 
  'qwen-turbo',
  'qwen-long',
] as const;

export const GEMINI_MODELS = [
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.0-flash', 
  'gemini-1.5-pro',
  'gemini-1.5-flash',
] as const;

/**
 * 检测是否为通义千问模型
 */
export function isQwenModel(model: string): boolean {
  return QWEN_MODELS.includes(model as any) || model.startsWith('qwen-');
}

/**
 * 检测是否为 Gemini 模型  
 */
export function isGeminiModel(model: string): boolean {
  return GEMINI_MODELS.includes(model as any) || model.startsWith('gemini-');
}

/**
 * 获取模型提供商类型
 */
export function getModelProvider(model: string): 'qwen' | 'gemini' | 'unknown' {
  if (isQwenModel(model)) return 'qwen';
  if (isGeminiModel(model)) return 'gemini';
  return 'unknown';
}
