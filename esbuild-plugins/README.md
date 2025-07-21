# ESBuild 插件

这个目录包含了用于esbuild的自定义插件。

## text-loader.js

一个esbuild插件，用于将文本文件（如`.md`、`.txt`等）作为字符串导入到JavaScript/TypeScript模块中。

### 功能

- 支持导入`.md`文件作为字符串
- 支持导入`.txt`文件作为字符串
- 自动将文件内容转换为ES模块格式
- 提供错误处理

### 使用方法

1. 在esbuild配置中引入插件：

```javascript
import { textLoaderPlugin } from './esbuild-plugins/text-loader.js';

esbuild.build({
  // 其他配置...
  plugins: [
    textLoaderPlugin(),
  ],
  // 其他配置...
});
```

2. 在TypeScript代码中导入文本文件：

```typescript
// 直接导入
import rulesContent from './path/to/rules.md';

// 使用导入的内容
console.log(rulesContent); // 这将是文件的完整文本内容
```

3. 为了TypeScript类型支持，确保包含类型声明：

```typescript
// 在.d.ts文件中
declare module '*.md' {
  const content: string;
  export default content;
}
```

### 示例

查看`packages/core/src/resource/`目录中的示例，了解如何使用这个插件来打包Markdown文档作为资源文件。 