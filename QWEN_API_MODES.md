# 通义千问 API 模式说明

本项目支持通义千问（Qwen）的两种 API 调用模式：

## 🌟 当前模式：OpenAI 兼容模式（推荐）

### 默认配置
- **Base URL**: `https://dashscope.aliyuncs.com/compatible-mode/v1`
- **端点**: `/chat/completions`
- **格式**: 标准 OpenAI API 格式

### 优势
✅ **标准化**: 使用行业标准的 OpenAI API 格式  
✅ **兼容性**: 与现有 OpenAI SDK 和工具无缝集成  
✅ **易用性**: 更简洁的请求和响应格式  
✅ **生态系统**: 支持更多第三方工具和库  

### 请求格式示例
```json
{
  "model": "qwen-max",
  "messages": [
    {"role": "user", "content": "你好"}
  ],
  "temperature": 0.7,
  "max_tokens": 1000
}
```

## 🔧 DashScope 原生模式

### 配置
- **Base URL**: `https://dashscope.aliyuncs.com/api/v1`
- **端点**: `/services/aigc/text-generation/generation`
- **格式**: DashScope 原生 API 格式

### 请求格式示例
```json
{
  "model": "qwen-max",
  "input": {
    "messages": [
      {"role": "user", "content": "你好"}
    ]
  },
  "parameters": {
    "temperature": 0.7,
    "max_tokens": 1000,
    "result_format": "message"
  }
}
```

## 🔄 模式切换

### 切换到 DashScope 原生模式
设置环境变量：
```bash
export QWEN_BASE_URL="https://dashscope.aliyuncs.com/api/v1"
```

### 切换回 OpenAI 兼容模式（默认）
删除或注释环境变量：
```bash
# unset QWEN_BASE_URL
# 或者显式设置
export QWEN_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
```

## 📝 环境变量配置

在您的 `.env` 文件中添加：

```env
# 必需：API Key
QWEN_API_KEY=your_api_key_here

# 可选：自定义 Base URL（不设置则使用 OpenAI 兼容模式）
# QWEN_BASE_URL=https://dashscope.aliyuncs.com/api/v1  # 原生模式
# QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1  # OpenAI 兼容模式

# 可选：阿里云区域
# QWEN_REGION=cn-beijing
```

## ⚠️ 注意事项

### Token 计数
- **OpenAI 兼容模式**: Token 使用量在 API 响应中返回，不支持单独的 token 计数接口
- **DashScope 原生模式**: 支持专门的 token 计数接口

### 兼容性
- 两种模式支持相同的模型列表：`qwen-max`, `qwen-plus`, `qwen-turbo`, `qwen-long`
- 功能特性基本一致，主要区别在于请求/响应格式

## 🚀 快速验证配置

重启应用程序后，当前配置会在启动时显示在日志中。您也可以通过 API 响应的格式来确认使用的是哪种模式。

## 📚 相关文档

- [阿里云 DashScope OpenAI 兼容文档](https://help.aliyun.com/zh/model-studio/developer-reference/use-qwen-by-calling-api)
- [通义千问模型列表](https://help.aliyun.com/zh/model-studio/getting-started/models) 