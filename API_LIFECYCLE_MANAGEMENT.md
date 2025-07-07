# API全生命周期管理Agent

## 功能概述
这个Agent专注于API的全生命周期管理，包括：
- API设计和修改
- API实现代码生成
- API发布到网关

## 新增工具

### 1. api_management - API管理工具
基础API管理功能，包含API设计能力：
- **get**: 获取API定义
- **edit**: 修改API定义（支持自然语言描述修改需求，会显示美观的diff对比，并自动持久化修改）
- **update**: 更新API定义
- **publish**: 发布API到网关

**edit操作流程**：
1. 调用edit_api接口获取修改结果（包含before和after字段）
2. 使用before和after字段生成diff对比
3. 显示修改前后的diff对比给用户确认
4. 用户确认后，自动调用update_api接口，传递after字段内容来持久化修改
5. 返回最终的更新结果

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

### 3. api_publish - API发布工具
发布API到网关：
- 支持多环境发布（dev/test/prod）
- 发布前检查API存在性
- 验证发布状态

## 后端API接口

### 1. `/test/get_api` - 获取API
- **Method**: POST
- **Query Parameters**: `apiName` (string) - API名称
- **Response**: API定义JSON

### 2. `/test/edit_api` - 修改API
- **Method**: POST  
- **Query Parameters**: 
  - `apiName` (string) - API名称
  - `changeDescription` (string) - 修改描述
- **Response**: 包含before和after字段的JSON对象，支持两种格式：
  
  **格式1（直接格式）**：
  ```json
  {
    "before": { /* 修改前的API定义 */ },
    "after": { /* 修改后的API定义 */ }
  }
  ```
  
  **格式2（嵌套格式）**：
  ```json
  {
    "data": {
      "before": { /* 修改前的API定义 */ },
      "after": { /* 修改后的API定义 */ }
    }
  }
  ```

### 3. `/test/update_api` - 更新API
- **Method**: POST
- **Query Parameters**:
  - `apiName` (string) - API名称  
  - `apiMeta` (string) - API元数据
- **Response**: 更新结果JSON

### 4. `/test/publish_api` - 发布API
- **Method**: POST
- **Query Parameters**: `apiName` (string) - API名称
- **Response**: 发布结果JSON

## 使用示例

### API设计和修改
```
Agent: 我需要修改用户API，添加一个年龄字段
```

Agent会：
1. 调用edit_api接口获取修改结果（包含before和after字段）
2. 使用before和after字段生成diff对比（统一的diff格式）
3. 显示修改前后的diff对比给用户确认
4. 用户确认后自动调用update_api接口，传递after字段内容持久化修改
5. 返回最终的更新结果和diff展示

### API实现
```
Agent: 根据用户API定义生成Spring Boot Controller代码
```

Agent会：
1. 分析API定义
2. 检测项目使用的Java+Spring框架
3. 生成对应的Controller代码
4. 保存到项目中

### API发布
```
Agent: 将用户API发布到测试环境
```

Agent会：
1. 检查API是否存在
2. 发布到指定环境
3. 验证发布状态

## 技术特性

### Diff展示优化
- **统一格式**: 使用与EditTool和WriteFileTool相同的diff格式
- **上下文信息**: 包含文件名、修改标记、行号等完整信息
- **可读性**: 清晰的+/-标记，易于理解修改内容
- **容错性**: 如果diff生成失败，自动回退到JSON格式显示

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
├── api-management.ts     # API管理工具（包含设计功能）
├── api-implementation.ts # API实现代码生成
└── api-publish.ts       # API发布工具
```

## 配置说明

在`packages/core/src/config/config.ts`中已注册所有工具：
- ApiManagementTool
- ApiImplementationTool  
- ApiPublishTool

现在Agent可以处理完整的API生命周期管理任务。 