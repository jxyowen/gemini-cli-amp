# API 生命周期 CLI Agent 改造方案

## 概述

将现有的 Gemini CLI 改造为专注于 API 全生命周期管理的 CLI Agent，支持基于自然语言的 API 定义管理，并复用现有的代码生成能力。

## 改造目标

1. **API 定义 CRUDL 操作**：基于 Swagger/OpenAPI 规范的 API 定义管理
2. **API 实现代码生成**：复用现有的 `EditTool` 和 `WriteFileTool` 进行代码生成
3. **自然语言交互**：用户可以通过自然语言描述需求，AI 自动理解和执行相应操作

## 架构设计

### 1. 核心组件扩展

#### A. 新增 API 管理工具集 (`packages/core/src/tools/api/`)

```
api/
├── api-definition-crud.ts    # API 定义 CRUD 操作
├── platform-client.ts        # API 管理平台客户端
├── swagger-parser.ts         # Swagger 解析和验证
└── index.ts                  # 工具集入口
```

#### B. 配置系统扩展 (`packages/core/src/config/`)

- `api-config.ts` - API 管理配置
- 扩展现有 `config.ts` 以支持 API 管理配置

#### C. 工具注册扩展

修改 `packages/core/src/config/config.ts` 中的 `createToolRegistry` 函数，注册新的 API 管理工具。

### 2. 工具功能设计

#### A. API 定义 CRUD 工具 (`ApiDefinitionCrudTool`)

**功能**：
- 创建 API 定义（从 Swagger 文件或内容）
- 读取 API 定义详情
- 更新 API 定义
- 删除 API 定义
- 列出所有 API 定义
- 导出 API 定义到文件
- 从文件导入 API 定义

**参数**：
```typescript
{
  action: 'create' | 'read' | 'update' | 'delete' | 'list' | 'export' | 'import',
  apiId?: string,
  swaggerContent?: string,
  swaggerFile?: string,
  outputFile?: string,
  name?: string,
  version?: string,
  description?: string,
  tags?: string[],
  format?: 'yaml' | 'json'
}
```

**使用示例**：
```bash
# 创建 API 定义
> Create a new API definition from swagger.yaml with name "User Management API"

# 列出所有 API 定义
> List all API definitions

# 更新 API 定义
> Update the User Management API with the latest swagger specification

# 导出 API 定义
> Export the User Management API to user-api.yaml

# 导入 API 定义
> Import API definition from petstore.yaml
```

#### B. 代码生成（复用现有工具）

**复用现有工具**：
- `EditTool` - 用于修改现有文件或创建新文件
- `WriteFileTool` - 用于创建新文件
- `ReadFileTool` - 用于读取文件内容

**代码生成流程**：
1. AI 分析 API 定义
2. 使用 `WriteFileTool` 创建新的实现文件
3. 使用 `EditTool` 修改现有文件或添加新功能
4. 生成测试文件和文档

**使用示例**：
```bash
# 生成 Express.js 代码
> Generate Express.js backend code for the User Management API

# 生成 Python FastAPI 代码
> Create a FastAPI implementation for the API with Python

# 生成带测试的代码
> Generate Spring Boot code with unit tests and documentation
```

### 3. 自然语言交互设计

#### A. 意图识别

AI 需要理解以下类型的用户意图：

1. **API 管理意图**：
   - "创建新的 API 定义"
   - "查看所有 API"
   - "更新 API 规范"
   - "删除 API 定义"
   - "导出 API 定义"
   - "导入 API 定义"

2. **代码生成意图**：
   - "生成后端代码"
   - "创建 API 实现"
   - "生成测试代码"
   - "创建文档"

#### B. 参数提取

AI 需要从自然语言中提取关键参数：

- **框架选择**：从描述中识别目标框架
- **语言选择**：识别编程语言偏好
- **文件路径**：识别输入和输出路径
- **API 标识**：识别特定的 API ID 或名称

### 4. 配置管理

#### A. 环境变量配置

```bash
# API 管理平台配置
API_PLATFORM_BASE_URL=https://api.example.com
API_PLATFORM_KEY=your-api-key
API_PLATFORM_PROJECT_ID=your-project-id
```

#### B. 配置文件扩展

在现有的配置文件中添加 API 管理部分：

```json
{
  "apiManagement": {
    "platform": {
      "baseUrl": "https://api.example.com",
      "apiKey": "your-api-key",
      "projectId": "your-project-id"
    }
  }
}
```

## 实现步骤

### 阶段 1：基础架构搭建

1. **创建 API 工具目录结构**
   - 创建 `packages/core/src/tools/api/` 目录
   - 实现基础的工具类框架

2. **实现 Swagger 解析器**
   - 支持 JSON 和 YAML 格式解析
   - 实现 Swagger 规范验证
   - 提供端点提取功能

3. **实现 API 平台客户端**
   - 封装 API 管理平台的 HTTP 调用
   - 实现错误处理和重试机制
   - 支持认证和授权

### 阶段 2：核心工具实现

1. **实现 API 定义 CRUD 工具**
   - 完成所有 CRUD 操作
   - 实现参数验证和错误处理
   - 添加用户确认机制
   - 集成现有的文件操作工具

2. **集成到工具注册系统**
   - 修改 `createToolRegistry` 函数
   - 注册新的 API 管理工具
   - 更新工具发现机制

### 阶段 3：配置和优化

1. **扩展配置系统**
   - 添加 API 管理配置
   - 实现环境变量支持
   - 提供配置验证

2. **优化用户体验**
   - 改进错误消息
   - 添加进度指示器
   - 实现结果格式化

3. **添加测试和文档**
   - 编写单元测试
   - 创建集成测试
   - 更新用户文档

## 使用场景示例

### 场景 1：创建新的 API 定义

**用户输入**：
```
Create a new API definition for a user management system with endpoints for CRUD operations
```

**AI 理解**：
- 意图：创建 API 定义
- 类型：用户管理系统
- 功能：CRUD 操作

**AI 执行**：
1. 生成 Swagger 规范
2. 调用 `ApiDefinitionCrudTool` 创建 API 定义
3. 返回创建结果

### 场景 2：生成后端代码

**用户输入**：
```
Generate a Node.js Express backend for the user management API with TypeScript and unit tests
```

**AI 理解**：
- 意图：代码生成
- 框架：Express.js
- 语言：TypeScript
- 功能：包含测试

**AI 执行**：
1. 获取 API 定义
2. 使用 `WriteFileTool` 创建主文件
3. 使用 `WriteFileTool` 创建模型文件
4. 使用 `WriteFileTool` 创建测试文件
5. 使用 `WriteFileTool` 创建配置文件
6. 返回生成的文件列表

### 场景 3：更新 API 定义

**用户输入**：
```
Update the user API to include password reset functionality
```

**AI 理解**：
- 意图：更新 API 定义
- 目标：用户 API
- 新增功能：密码重置

**AI 执行**：
1. 查找现有的用户 API
2. 生成新的 Swagger 规范
3. 调用 `ApiDefinitionCrudTool` 更新定义

### 场景 4：导出和导入 API 定义

**用户输入**：
```
Export the User Management API to a YAML file and then import it to another project
```

**AI 理解**：
- 意图：导出和导入
- 目标：用户管理 API
- 格式：YAML

**AI 执行**：
1. 调用 `ApiDefinitionCrudTool` 导出 API 定义
2. 使用 `WriteFileTool` 保存到文件
3. 调用 `ApiDefinitionCrudTool` 导入到新项目

## 技术考虑

### 1. 依赖管理

需要添加以下依赖：

```json
{
  "dependencies": {
    "js-yaml": "^4.1.0"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.9"
  }
}
```

### 2. 错误处理

- 实现统一的错误处理机制
- 提供用户友好的错误消息
- 支持错误恢复和重试

### 3. 安全性

- 验证 API 密钥和权限
- 实现输入验证和清理
- 支持沙箱环境

### 4. 性能优化

- 实现缓存机制
- 支持异步操作
- 优化大文件处理

## 复用现有能力的优势

### 1. 代码生成能力

**现有工具**：
- `EditTool` - 强大的文件编辑能力，支持精确的文本替换
- `WriteFileTool` - 完整的文件写入功能，包括内容验证和用户确认
- `ReadFileTool` - 文件读取和内容分析

**优势**：
- 无需重新实现文件操作逻辑
- 复用现有的用户确认机制
- 利用现有的错误处理和验证
- 保持一致的用户体验

### 2. 工具集成

**现有架构**：
- 工具注册系统
- 参数验证机制
- 用户确认流程
- 错误处理框架

**优势**：
- 新工具无缝集成到现有系统
- 复用现有的配置管理
- 利用现有的遥测和日志系统

### 3. 自然语言处理

**现有能力**：
- AI 模型已经理解如何调用工具
- 现有的提示词工程
- 工具参数提取机制

**优势**：
- AI 可以直接使用新的 API 管理工具
- 无需重新训练或调整模型
- 保持一致的交互模式

## 扩展性设计

### 1. 平台集成扩展

支持多种 API 管理平台：

```typescript
interface ApiPlatform {
  createApiDefinition(definition: ApiDefinition): Promise<ApiDefinition>;
  getApiDefinition(id: string): Promise<ApiDefinition>;
  updateApiDefinition(id: string, data: any): Promise<ApiDefinition>;
  deleteApiDefinition(id: string): Promise<void>;
  listApiDefinitions(): Promise<ApiDefinition[]>;
}
```

### 2. 格式支持扩展

支持更多 API 规范格式：

```typescript
interface ApiParser {
  parse(content: string): ApiSpec;
  validate(spec: ApiSpec): ValidationResult;
  convert(spec: ApiSpec, format: string): string;
}
```

### 3. 代码生成模板扩展

通过现有的文件操作工具支持自定义模板：

```typescript
// 使用 WriteFileTool 创建模板文件
await writeFileTool.execute({
  file_path: '/path/to/template.ts',
  content: templateContent
});

// 使用 EditTool 修改模板
await editTool.execute({
  file_path: '/path/to/template.ts',
  old_string: '{{API_NAME}}',
  new_string: 'UserManagementAPI'
});
```

## 总结

这个改造方案将 Gemini CLI 转变为一个强大的 API 生命周期管理工具，通过自然语言交互简化 API 开发和管理的复杂性。通过复用现有的代码生成能力，我们避免了重复开发，同时保持了系统的一致性和可靠性。

**关键优势**：
1. **最小化开发工作量** - 复用现有的文件操作工具
2. **保持一致性** - 新工具与现有工具使用相同的架构
3. **快速集成** - 利用现有的工具注册和执行机制
4. **用户体验一致** - 保持相同的交互模式和确认流程 