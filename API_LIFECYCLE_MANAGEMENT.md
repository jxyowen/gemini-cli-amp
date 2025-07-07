# API全生命周期管理功能

本文档描述了新增的API全生命周期管理功能，该功能将原有的代码Agent扩展为支持API设计、实现和发布的完整生命周期管理Agent。

## 功能概述

API全生命周期管理涵盖以下三大核心环节：

1. **API设计** - 通过api_management工具的edit操作进行自然语言修改API定义
2. **API实现** - 根据API定义生成对应的Controller代码，复用现有代码生成能力
3. **API发布** - 将API定义发布到API网关使其生效

## 新增工具

### 1. API管理工具 (api_management)
基础API管理工具，提供与后端API的HTTP通信功能，包含API设计功能。

**功能：**
- 获取API定义 (get)
- 修改API定义 (edit) - 支持自然语言描述修改API，返回修改前后的diff
- 更新API定义 (update)
- 发布API (publish)

**参数：**
- `action`: 操作类型 (get/edit/update/publish)
- `apiName`: API名称
- `changeDescription`: 修改描述 (edit操作必需)
- `apiMeta`: API元数据 (update操作必需)

### 2. API实现工具 (api_implementation)
根据API定义生成Controller代码，支持多种语言和框架。

**功能：**
- 自动检测项目语言和框架
- 根据API定义生成Controller代码
- 支持多种编程语言 (Java, TypeScript, JavaScript, Python)
- 支持多种框架 (Spring, Express, FastAPI)

**参数：**
- `apiName`: API名称
- `outputPath`: 输出路径 (可选)
- `language`: 编程语言 (可选，支持自动检测)
- `framework`: 框架 (可选，支持自动选择)

### 3. API发布工具 (api_publish)
将API定义发布到API网关。

**功能：**
- 检查API存在性
- 发布API到网关
- 验证发布状态
- 支持多环境发布

**参数：**
- `apiName`: API名称
- `environment`: 目标环境 (dev/test/prod，可选)

## 后端API接口

工具与以下后端API接口集成：

### 获取API
```
POST /test/get_api?apiName={apiName}
```

### 修改API
```
POST /test/edit_api?apiName={apiName}&changeDescription={changeDescription}
```
返回修改前后的API元数据用于diff显示。

### 更新API
```
POST /test/update_api?apiName={apiName}&apiMeta={apiMeta}
```

### 发布API
```
POST /test/publish_api?apiName={apiName}
```

## 使用示例

### 1. 设计API
```
使用api_management工具修改用户管理API：编辑API添加用户头像字段
```

### 2. 实现API
```
使用api_implementation工具为UserManagement API生成TypeScript/Express Controller代码
```

### 3. 发布API
```
使用api_publish工具将UserManagement API发布到测试环境
```

## 系统集成

### 提示词更新
在`packages/core/src/core/prompts.ts`中更新了系统提示词，新增了API全生命周期管理的工作流程和原则。

### 工具注册
在`packages/core/src/config/config.ts`中注册了所有新的API管理工具：
- ApiManagementTool
- ApiImplementationTool
- ApiPublishTool

## 技术特性

1. **安全性** - 所有修改操作都需要用户确认
2. **复用性** - 复用现有的WriteFileTool和EditTool进行代码生成
3. **智能检测** - 自动检测项目语言和框架
4. **多语言支持** - 支持Java、TypeScript、JavaScript、Python
5. **多框架支持** - 支持Spring、Express、FastAPI等主流框架
6. **错误处理** - 完善的错误处理和用户友好的错误信息

## 文件结构

```
packages/core/src/tools/
├── api-management.ts      # 基础API管理工具（包含API设计功能）
├── api-implementation.ts  # API实现工具
└── api-publish.ts         # API发布工具
```

## 下一步扩展

1. 支持更多编程语言和框架
2. 添加API测试功能
3. 支持API版本管理
4. 集成API文档生成
5. 添加API监控和分析功能 