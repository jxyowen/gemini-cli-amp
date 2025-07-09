# API全生命周期管理Agent

## 功能概述
这个Agent专注于API的全生命周期管理，包括：
- API设计和修改
- API实现代码生成

## 新增工具

### 1. api_management - API管理工具
基础API管理功能，包含API设计能力：
- **get**: 获取API定义
- **edit**: 修改API定义（支持自然语言描述修改需求，会显示美观的diff对比，并自动持久化修改）
- **update**: 更新API定义

**edit操作流程**：
1. 调用get_api接口获取当前API定义
2. 读取apiJsonSchema.yml文件获取API规范
3. 使用大模型基于schema和用户修改描述直接修改API定义
4. 生成包含before和after字段的修改结果
5. 显示修改前后的diff对比给用户进行二次确认
6. 用户确认后，需要手动调用update操作来持久化修改
7. 返回最终的更新结果

**diff展示优化**：
- 修改API时，会在确认阶段说明将显示diff对比
- 执行后显示详细的diff对比，采用与代码文件相同的diff格式
- 使用标准的unified diff格式，包含文件名、行号、上下文等信息
- 如果获取diff失败，会回退到简单的JSON格式显示

### 2. api_implementation - API实现代码生成
根据API定义生成Controller代码：
- 支持多种编程语言（Java、TypeScript、JavaScript、Python）
- 支持多种框架（Spring、Express、FastAPI等）
- 自动检测项目语言和框架
- 复用现有的代码生成能力

## 后端API接口

### 1. `/test/get_api` - 获取API
- **Method**: POST
- **Query Parameters**: `apiName` (string) - API名称
- **Response**: API定义JSON

### 2. `/test/update_api` - 更新API
- **Method**: POST
- **Query Parameters**:
  - `apiName` (string) - API名称  
  - `apiMeta` (string) - API元数据
- **Response**: 更新结果JSON

**注意**: edit操作现在使用大模型本地修改API定义，不再调用后端edit_api接口。

## 使用示例

### API设计和修改
```
Agent: 我需要修改用户API，添加一个年龄字段
```

Agent会：
1. 调用get_api接口获取当前API定义
2. 读取apiJsonSchema.yml文件获取API规范
3. 使用大模型基于schema和用户修改描述直接修改API定义
4. 生成包含before和after字段的修改结果
5. 显示修改前后的diff对比给用户进行二次确认
6. 用户确认后，需要手动调用update操作来持久化修改
7. 返回最终的更新结果和diff展示

### API实现
```
Agent: 根据用户API定义生成Spring Boot Controller代码
```

Agent会：
1. 分析API定义
2. 检测项目使用的Java+Spring框架
3. 生成对应的Controller代码
4. 保存到项目中

## 技术特性

### Diff展示优化
- **统一格式**: 使用与EditTool和WriteFileTool相同的diff格式
- **上下文信息**: 包含文件名、修改标记、行号等完整信息
- **可读性**: 清晰的+/-标记，易于理解修改内容
- **容错性**: 如果diff生成失败，自动回退到JSON格式显示

### 大模型本地修改
- **Schema驱动**: 基于apiJsonSchema.yml规范进行API修改
- **智能生成**: 使用GeminiClient智能理解用户需求并修改API
- **格式验证**: 确保修改后的API定义格式正确
- **错误处理**: 完善的错误检测和提示机制

### 构建配置
- **文件复制**: 构建脚本已配置复制.yml和.yaml文件到dist目录
- **路径解析**: 使用ES模块兼容的fileURLToPath和path.dirname获取文件路径
- **错误处理**: 如果schema文件不存在，会回退到基本修改逻辑

### 二次确认机制
- **编辑确认**: edit操作会显示diff对比，要求用户二次确认修改内容
- **职责分离**: edit操作只负责生成修改建议，update操作负责持久化
- **用户控制**: 用户可以在确认前查看完整的修改内容
- **安全机制**: 避免意外修改，确保用户对每个修改都有明确确认

### 错误处理
- 网络超时处理（10秒超时）
- 参数验证和错误提示
- 优雅的错误回退机制

### 工具集成
- 复用现有的代码生成能力
- 遵循统一的工具接口规范
- 支持用户确认流程

## 文件结构

```
packages/core/src/tools/
├── api-management.ts     # API管理工具（使用大模型修改）

```

## 配置说明

在`packages/core/src/config/config.ts`中已注册所有工具：
- ApiManagementTool（传递config和geminiClient参数）


现在Agent可以处理完整的API生命周期管理任务。