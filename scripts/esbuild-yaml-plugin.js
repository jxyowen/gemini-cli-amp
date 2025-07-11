/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

/**
 * esbuild 插件：将 YAML 文件转换为 JS 模块
 */
export function yamlPlugin() {
  return {
    name: 'yaml',
    setup(build) {
      // 处理 .yml 和 .yaml 文件
      build.onResolve({ filter: /\.(yml|yaml)$/ }, (args) => {
        return {
          path: path.resolve(args.resolveDir, args.path),
          namespace: 'yaml',
        };
      });

      build.onLoad({ filter: /.*/, namespace: 'yaml' }, (args) => {
        try {
          // 读取 YAML 文件内容
          const yamlContent = fs.readFileSync(args.path, 'utf8');
          
          // 解析 YAML 为 JS 对象
          const jsObject = yaml.load(yamlContent);
          
          // 生成 ES 模块代码
          const jsCode = `export default ${JSON.stringify(jsObject, null, 2)};`;
          
          return {
            contents: jsCode,
            loader: 'js',
          };
        } catch (error) {
          return {
            errors: [{
              text: `Failed to load YAML file: ${error.message}`,
              location: { file: args.path },
            }],
          };
        }
      });
    },
  };
} 