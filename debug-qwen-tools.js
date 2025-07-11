/**
 * Qwen 工具调用诊断脚本
 * 
 * 运行方式：
 * DEBUG=1 node debug-qwen-tools.js
 */

import { QwenContentGenerator } from './packages/core/src/qwen/qwenContentGenerator.js';
import { toQwenGenerateRequest, fromQwenGenerateResponse } from './packages/core/src/qwen/converter.js';

// 模拟工具声明（类似 read_file）
const mockToolDeclarations = [
  {
    name: 'read_file',
    description: 'Read content from a file',
    parameters: {
      type: 'object',
      properties: {
        absolute_path: {
          type: 'string',
          description: 'The absolute path to the file to read'
        }
      },
      required: ['absolute_path']
    }
  }
];

// 模拟 GenerateContentParameters
const testRequest = {
  model: 'qwen-plus',
  contents: [
    {
      role: 'user',
      parts: [{ text: '请读取文件 /etc/hosts 的内容' }]
    }
  ],
  config: {
    tools: [
      { functionDeclarations: mockToolDeclarations }
    ]
  }
};

console.log('=== Qwen 工具调用诊断开始 ===\n');

// 1. 测试工具声明转换
console.log('1. 测试工具声明转换...');
const qwenRequest = toQwenGenerateRequest(testRequest);
console.log('转换后的 Qwen 请求:');
console.log(JSON.stringify(qwenRequest, null, 2));

if (qwenRequest.tools && qwenRequest.tools.length > 0) {
  console.log('✅ 工具声明转换成功');
  console.log(`   - 工具数量: ${qwenRequest.tools.length}`);
  console.log(`   - 工具名称: ${qwenRequest.tools.map(t => t.function.name).join(', ')}`);
} else {
  console.log('❌ 工具声明转换失败 - 未找到 tools');
}

console.log('\n');

// 2. 测试响应转换
console.log('2. 测试响应转换...');

// 模拟 Qwen API 的工具调用响应
const mockQwenResponse = {
  choices: [
    {
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_abc123',
            type: 'function',
            function: {
              name: 'read_file',
              arguments: '{"absolute_path": "/etc/hosts"}'
            }
          }
        ]
      },
      finish_reason: 'tool_calls',
      index: 0
    }
  ],
  usage: {
    prompt_tokens: 50,
    completion_tokens: 25,
    total_tokens: 75
  },
  id: 'test-id',
  object: 'chat.completion',
  created: Date.now(),
  model: 'qwen-plus'
};

console.log('模拟的 Qwen 响应:');
console.log(JSON.stringify(mockQwenResponse, null, 2));

const geminiResponse = fromQwenGenerateResponse(mockQwenResponse);
console.log('\n转换后的 Gemini 响应:');
console.log(JSON.stringify(geminiResponse, null, 2));

if (geminiResponse.functionCalls && geminiResponse.functionCalls.length > 0) {
  console.log('✅ 响应转换成功');
  console.log(`   - 工具调用数量: ${geminiResponse.functionCalls.length}`);
  console.log(`   - 工具调用详情:`);
  geminiResponse.functionCalls.forEach((fc, index) => {
    console.log(`     ${index + 1}. ${fc.name} (ID: ${fc.id})`);
    console.log(`        参数: ${JSON.stringify(fc.args)}`);
  });
} else {
  console.log('❌ 响应转换失败 - 未找到 functionCalls');
}

console.log('\n=== 诊断完成 ===');

// 3. 环境检查
console.log('\n3. 环境变量检查:');
console.log(`   QWEN_API_KEY: ${process.env.QWEN_API_KEY ? '已设置' : '未设置'}`);
console.log(`   QWEN_BASE_URL: ${process.env.QWEN_BASE_URL || '默认 (OpenAI 兼容模式)'}`);
console.log(`   DEBUG: ${process.env.DEBUG || '未设置'}`);
console.log(`   DEBUG_MODE: ${process.env.DEBUG_MODE || '未设置'}`);

console.log('\n建议:');
console.log('1. 如果看不到详细日志，请设置 DEBUG=1 或 DEBUG_MODE=1');
console.log('2. 确认 QWEN_API_KEY 已正确设置');
console.log('3. 如果使用原生模式，确认 QWEN_BASE_URL 设置正确');
console.log('4. 在实际调用中开启调试模式：DEBUG=1 npx @google/gemini-cli ...'); 