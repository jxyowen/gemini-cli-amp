// 测试 Qwen API 修复
const { toQwenGenerateRequest } = require('./packages/core/src/qwen/converter.js');

// 模拟 GenerateContentParameters
const mockParams = {
  model: 'qwen3-235b-a22b',
  contents: [
    {
      role: 'user',
      parts: [{ text: 'Hello, how are you?' }]
    }
  ],
  config: {
    temperature: 0.7,
    topP: 0.9,
    maxOutputTokens: 2048,
    // 模拟 thinkingConfig（这是导致问题的配置）
    thinkingConfig: {
      includeThoughts: true,
    },
  },
};

console.log('测试非流式调用：');
const nonStreamRequest = toQwenGenerateRequest(mockParams, false);
console.log('enable_thinking 参数:', nonStreamRequest.enable_thinking);
console.log('应该为 undefined（不传递）\n');

console.log('测试流式调用：');
const streamRequest = toQwenGenerateRequest(mockParams, true);
console.log('enable_thinking 参数:', streamRequest.enable_thinking);
console.log('应该为 true（因为有 thinkingConfig）\n');

// 测试没有 thinkingConfig 的情况
const mockParamsNoThinking = {
  ...mockParams,
  config: {
    temperature: 0.7,
    topP: 0.9,
    maxOutputTokens: 2048,
    // 没有 thinkingConfig
  },
};

console.log('测试流式调用（无 thinkingConfig）：');
const streamRequestNoThinking = toQwenGenerateRequest(mockParamsNoThinking, true);
console.log('enable_thinking 参数:', streamRequestNoThinking.enable_thinking);
console.log('应该为 undefined（不传递）'); 