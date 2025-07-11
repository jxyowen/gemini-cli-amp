# Qwen 工具调用问题诊断指南

## 问题描述
Qwen 大模型虽然输出要调用工具（如 `readFile`），但没有真正执行。

## 工具调用链路分析

### 1. 正常的工具调用流程
```
用户输入 → Qwen API → 返回 tool_calls → 转换为 functionCalls → 执行工具 → 返回结果
```

### 2. 链路关键组件
- **工具声明转换**：`toQwenGenerateRequest()` 将 Gemini 工具声明转换为 Qwen 格式
- **响应处理**：`fromQwenGenerateResponse()` 将 Qwen 的 `tool_calls` 转换为 `functionCalls`
- **工具执行**：`executeToolCall()` 实际执行工具并返回结果

## 诊断步骤

### 第一步：运行诊断脚本
```bash
# 开启调试模式运行诊断脚本
DEBUG=1 node debug-qwen-tools.js
```

这个脚本会测试：
- ✅ 工具声明是否正确转换为 Qwen 格式
- ✅ Qwen 响应是否正确转换为 functionCalls
- ✅ 环境变量配置是否正确

### 第二步：检查调试日志
在实际使用中开启详细日志：

```bash
# 方法1：通过环境变量
DEBUG=1 npx @google/gemini-cli "请读取 package.json 文件"

# 方法2：临时设置
export DEBUG_MODE=1
npx @google/gemini-cli "请读取 package.json 文件"
```

### 第三步：查看关键日志输出

#### 期望看到的日志：
```
[DEBUG] 初始化完成，可用工具数量: X
[DEBUG] 可用工具列表: read_file, write_file, ...
[DEBUG] 检测到工具调用: 1 个
[DEBUG] 工具调用详情: 名称=read_file, ID=call_xxx, 参数键=[absolute_path]
[DEBUG] 工具 read_file 执行完成 (XXXms): 成功=true, 有响应=true
```

#### 如果缺少这些日志，说明问题在：
- **无工具检测日志** → Qwen API 没有返回 tool_calls
- **有检测但无执行日志** → 工具注册或执行环节有问题

## 可能的问题和解决方案

### 问题1：Qwen API 不返回 tool_calls

#### 原因：
- API Key 权限不够
- 模型版本不支持工具调用
- 工具声明格式错误

#### 解决方案：
```bash
# 1. 确认 API Key 有效且支持工具调用
export QWEN_API_KEY="your_valid_api_key"

# 2. 使用支持工具调用的模型
# 在配置中设置：qwen-plus, qwen-max, qwen2.5-72b-instruct 等

# 3. 检查工具声明格式
DEBUG=1 node debug-qwen-tools.js
```

### 问题2：工具注册失败

#### 检查方法：
```bash
# 查看工具注册日志
DEBUG=1 npx @google/gemini-cli --help
# 应该看到：[DEBUG] 可用工具数量: X
```

#### 解决方案：
- 确认工具注册代码正常执行
- 检查 ToolRegistry 初始化

### 问题3：响应转换失败

#### 检查方法：
查看是否有这些错误日志：
```
[ERROR] 解析tool call参数失败
[WARN] 工具调用不完整，跳过
```

#### 解决方案：
- 通常代码已包含修复逻辑，会自动处理
- 如果仍有问题，检查 Qwen API 响应格式

### 问题4：流式响应中工具调用被分片

#### 症状：
- 在流式模式下工具调用不完整
- 看到 `[DEBUG] 接收到tool_calls片段` 但没有最终执行

#### 解决方案：
代码已实现累积机制，但如果仍有问题：
```javascript
// 在 qwenContentGenerator.ts 中调整累积逻辑
// 可能需要增加延迟或改进完整性检查
```

## 环境配置检查

### 必需的环境变量：
```bash
# 必需
export QWEN_API_KEY="your_api_key"

# 可选（选择 API 模式）
export QWEN_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"  # OpenAI 兼容模式（推荐）
# 或
export QWEN_BASE_URL="https://dashscope.aliyuncs.com/api/v1"  # 原生模式
```

### 调试模式：
```bash
export DEBUG=1
# 或
export DEBUG_MODE=1
```

## 模型特定注意事项

### 支持工具调用的 Qwen 模型：
- ✅ `qwen-plus`
- ✅ `qwen-max`  
- ✅ `qwen2.5-72b-instruct`
- ✅ `qwen2.5-32b-instruct`
- ❌ 较老版本的模型可能不支持

### 提示词优化：
有时需要明确的提示词来触发工具调用：
```
明确要求：请使用 read_file 工具读取文件内容
而不是：请读取文件
```

## 常见解决方案总结

1. **首先运行诊断脚本**确认转换逻辑正常
2. **开启调试模式**查看详细执行流程
3. **检查 API Key 和模型版本**
4. **确认工具声明格式**正确
5. **使用明确的提示词**请求工具调用

## 快速验证命令

```bash
# 1. 运行诊断
DEBUG=1 node debug-qwen-tools.js

# 2. 测试实际工具调用
DEBUG=1 npx @google/gemini-cli "请使用 read_file 工具读取当前目录下的 package.json 文件内容"

# 3. 检查环境
echo "QWEN_API_KEY: ${QWEN_API_KEY:0:10}..."
echo "QWEN_BASE_URL: ${QWEN_BASE_URL:-default}"
```

如果按照以上步骤仍无法解决问题，请提供详细的调试日志输出以便进一步分析。 