/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * esbuild插件：将文本文件（如.md）作为字符串导入
 */
export function textLoaderPlugin() {
  return {
    name: 'text-loader',
    setup(build) {
      // 处理 .md 文件
      build.onLoad({ filter: /\.md$/ }, async (args) => {
        try {
          const text = await fs.promises.readFile(args.path, 'utf8');
          return {
            contents: `export default ${JSON.stringify(text)};`,
            loader: 'js',
          };
        } catch (error) {
          return {
            errors: [
              {
                text: `Failed to read file: ${error.message}`,
                location: null,
              },
            ],
          };
        }
      });

      // 处理 .txt 文件（如果需要的话）
      build.onLoad({ filter: /\.txt$/ }, async (args) => {
        try {
          const text = await fs.promises.readFile(args.path, 'utf8');
          return {
            contents: `export default ${JSON.stringify(text)};`,
            loader: 'js',
          };
        } catch (error) {
          return {
            errors: [
              {
                text: `Failed to read file: ${error.message}`,
                location: null,
              },
            ],
          };
        }
      });
    },
  };
} 