# 🔍 functionCalls 结构调试指南

## 问题概述

你遇到的错误表明：
1. `Error: params must have required property 'action'` - API管理工具缺少必需的 action 参数
2. `Tool "undefined_tool_name" not found in registry` - 工具名称为 undefined

## 🚀 快速开始

### 1. 环境准备

**第一步：设置API密钥**
```bash
# 选择其中一种方式设置API密钥

# 方式A：使用Gemini API
export GEMINI_API_KEY="your_gemini_api_key_here"

# 方式B：使用通义千问API
export QWEN_API_KEY="your_qwen_api_key_here"

# 可选：指定模型
export GEMINI_MODEL="gemini-1.5-flash"  # 或 "qwen-max"
```

**第二步：验证环境**
```bash
# 检查API密钥是否设置
echo "GEMINI_API_KEY: ${GEMINI_API_KEY:0:10}..."
echo "QWEN_API_KEY: ${QWEN_API_KEY:0:10}..."
echo "模型: ${GEMINI_MODEL:-默认}"
```

### 2. 运行调试脚本

```bash
# 在项目根目录运行
node debug-functioncalls.js "请帮我获取API列表"
```

或者测试其他会触发工具调用的查询：

```bash
node debug-functioncalls.js "帮我修改用户API，添加一个年龄字段"
node debug-functioncalls.js "请发布CreateUser这个API"
```

### 3. 理解输出

调试脚本会显示：
- ⚙️ 配置初始化状态
- 🔐 认证过程
- ✅ 可用工具列表
- 📦 每个响应的原始结构
- 🔍 functionCalls 的详细分析
- ⚠️ 发现的问题

## 🔧 常见问题和解决方案

### 问题1：认证失败
**现象**: 
```
⚠️ API Key认证失败，尝试其他认证方式: [错误信息]
❌ 所有认证方式都失败了，请检查API配置
```

**解决方法**:
```bash
# 1. 检查API密钥格式
echo $GEMINI_API_KEY | wc -c  # Gemini密钥通常是39字符
echo $QWEN_API_KEY | wc -c    # Qwen密钥长度不同

# 2. 重新设置API密钥（移除多余的引号或空格）
export GEMINI_API_KEY="your_actual_key"

# 3. 尝试手动认证
npm run cli -- --auth
```

### 问题2：工具名称为 undefined
**现象**: 
```
Function Call #1:
  ID: call_abc123
  Name: ❌ undefined
  Args: {}
```

**可能原因**:
- Qwen API 响应格式异常
- 转换器解析错误
- 大模型没有正确生成工具名称

**解决方法**:
```bash
# 1. 切换到Gemini模型
export GEMINI_MODEL="gemini-1.5-flash"
unset QWEN_API_KEY

# 2. 或切换到通义千问模型
export GEMINI_MODEL="qwen-max"
export QWEN_API_KEY="your_qwen_key"

# 3. 检查模型响应
node debug-functioncalls.js "请获取API列表" 2>&1 | grep -A 10 "原始响应结构"
```

### 问题3：缺少 action 参数
**现象**: 
```
Function Call #1:
  ID: call_abc123
  Name: api_management
  Args: {"apiName": "UserAPI"}
  ⚠️ 问题: 缺少必需的 action 参数!
```

**可能原因**:
- 大模型没有理解工具的 schema
- 提示词不够清晰
- 工具 schema 定义问题

**解决方法**:
```bash
# 1. 使用更明确的查询
node debug-functioncalls.js "使用api_management工具，action为list，获取所有API名称"

# 2. 检查工具schema
node debug-functioncalls.js "test" 2>&1 | grep -A 5 "api_management"

# 3. 尝试更具体的指令
node debug-functioncalls.js "请执行以下操作：调用api_management工具，设置action参数为list"
```

### 问题4：完全没有 functionCalls
**现象**: 
```
❌ 没有收到任何 functionCalls - 这可能是问题所在!
```

**可能原因**:
- 查询没有触发工具调用
- 工具注册失败
- 模型配置问题

**解决方法**:
```bash
# 1. 检查工具是否注册成功
node debug-functioncalls.js "test" 2>&1 | grep "可用工具列表" -A 20

# 2. 使用强制工具调用的查询
node debug-functioncalls.js "我需要使用工具来获取API信息，请调用相关工具"

# 3. 尝试其他模型
export GEMINI_MODEL="gemini-1.5-pro"
node debug-functioncalls.js "请帮我获取API列表"
```

## 🔬 深度调试

### 启用详细日志

如果基本调试无法定位问题，启用详细日志：

```bash
# 方法1：环境变量
export DEBUG=1
export GEMINI_DEBUG=1
node debug-functioncalls.js "你的查询"

# 方法2：查看特定日志
node debug-functioncalls.js "你的查询" 2>&1 | grep -E "\[DEBUG\]|functionCall"
```

### 检查特定组件

1. **Qwen转换器日志**:
   - 查看 `[DEBUG] Qwen原始响应`
   - 查看 `[DEBUG] 生成的functionCall`

2. **工具调用处理日志**:
   - 查看 `[DEBUG] 收到响应`
   - 查看 `[DEBUG] 处理工具调用`

### 手动测试工具

```bash
# 直接测试CLI工具调用
npm run cli "请使用api_management工具获取API列表"

# 检查工具注册
npm run cli "/tools"  # 如果有这个命令
```

## 📊 输出分析

### 正常输出示例
```
✅ 找到 1 个 functionCalls:
  Function Call #1:
    ID: call_abc123
    Name: api_management
    Args: {
        "action": "list"
    }
    ✅ 结构完整
```

### 问题输出示例
```
✅ 找到 1 个 functionCalls:
  Function Call #1:
    ID: call_abc123
    Name: ❌ undefined
    Args: {}
    ⚠️ 问题: name 为 undefined!
    ⚠️ 问题: args 为空或 undefined!
```

## 🆘 获取帮助

如果调试脚本显示了具体的问题，请提供：
1. 🔍 调试脚本的完整输出
2. 📝 你使用的具体查询
3. 🔧 你的环境配置：
   ```bash
   echo "模型: $GEMINI_MODEL"
   echo "Gemini API: ${GEMINI_API_KEY:+已设置}"
   echo "Qwen API: ${QWEN_API_KEY:+已设置}"
   echo "Node版本: $(node --version)"
   echo "操作系统: $(uname -a)"
   ```
4. 📊 任何错误日志

这将帮助我们更精确地定位和解决问题。 