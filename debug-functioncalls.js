#!/usr/bin/env node

/**
 * 调试脚本：检查大模型返回的 functionCalls 结构
 * 使用方法：node debug-functioncalls.js "你的查询"
 */

import { Config, ApprovalMode } from '@google/gemini-cli-core';

async function debugFunctionCalls(query) {
  console.log('🔍 开始调试 functionCalls 结构...');
  console.log(`📝 查询: ${query}`);
  console.log('=' .repeat(80));

  try {
    // 初始化配置 - 提供完整的ConfigParameters
    const config = new Config({
      sessionId: `debug-${Date.now()}`,
      cwd: process.cwd(),
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
      embeddingModel: 'text-embedding-004',
      targetDir: process.cwd(),
      debugMode: true,
      approvalMode: ApprovalMode.YOLO,
      userMemory: '',
      geminiMdFileCount: 0,
      showMemoryUsage: false,
      usageStatisticsEnabled: false,
      checkpointing: false,
      fullContext: false,
      fileFiltering: {
        respectGitIgnore: true,
        enableRecursiveFileSearch: true,
      },
      telemetry: {
        enabled: false,
      },
      accessibility: {},
      extensionContextFilePaths: [],
      listExtensions: false,
      activeExtensions: [],
    });

    console.log('⚙️ 正在初始化配置...');
    await config.initialize();
    
    console.log('🔐 正在设置认证...');
    // 尝试使用不同的认证方式
    try {
      await config.refreshAuth('apiKey');
    } catch (authError) {
      console.log('⚠️ API Key认证失败，尝试其他认证方式:', authError.message);
      try {
        await config.refreshAuth('oAuth');
      } catch (oauthError) {
        console.log('⚠️ OAuth认证也失败:', oauthError.message);
        throw new Error('所有认证方式都失败了，请检查API配置');
      }
    }
    
    const geminiClient = config.getGeminiClient();
    if (!geminiClient) {
      throw new Error('GeminiClient 初始化失败');
    }
    
    const toolRegistry = await config.getToolRegistry();
    const chat = await geminiClient.getChat();

    console.log('📋 可用工具列表:');
    const functionDeclarations = toolRegistry.getFunctionDeclarations();
    functionDeclarations.forEach((tool, index) => {
      console.log(`  ${index + 1}. ${tool.name} - ${tool.description}`);
    });
    console.log('=' .repeat(80));

    // 发送消息并收集响应
    const responseStream = await chat.sendMessageStream(
      {
        message: [{ text: query }],
        config: {
          tools: [{ functionDeclarations }],
        },
      },
      `debug-${Date.now()}`,
    );

    let responseCount = 0;
    let totalFunctionCalls = [];

    console.log('📡 开始接收响应...\n');

    for await (const resp of responseStream) {
      responseCount++;
      console.log(`📦 响应 #${responseCount}:`);
      console.log('原始响应结构:');
      console.log(JSON.stringify(resp, null, 2));
      console.log('-'.repeat(60));

      // 检查 functionCalls
      if (resp.functionCalls) {
        console.log(`✅ 找到 ${resp.functionCalls.length} 个 functionCalls:`);
        resp.functionCalls.forEach((fc, index) => {
          console.log(`  Function Call #${index + 1}:`);
          console.log(`    ID: ${fc.id || '❌ undefined'}`);
          console.log(`    Name: ${fc.name || '❌ undefined'}`);
          console.log(`    Args: ${JSON.stringify(fc.args || {}, null, 4)}`);
          
          // 检查问题
          if (!fc.name) {
            console.log('    ⚠️  问题: name 为 undefined!');
          }
          if (!fc.args || Object.keys(fc.args).length === 0) {
            console.log('    ⚠️  问题: args 为空或 undefined!');
          }
          if (!fc.args?.action) {
            console.log('    ⚠️  问题: 缺少必需的 action 参数!');
          }
        });
        totalFunctionCalls.push(...resp.functionCalls);
      } else {
        console.log('❌ 此响应中没有 functionCalls');
      }

      // 检查文本内容
      const textContent = resp.candidates?.[0]?.content?.parts
        ?.filter(part => part.text)
        ?.map(part => part.text)
        ?.join('') || '';
      
      if (textContent) {
        console.log(`📝 文本内容: ${textContent.substring(0, 100)}${textContent.length > 100 ? '...' : ''}`);
      }

      console.log('=' .repeat(80));
    }

    // 总结
    console.log('\n📊 调试总结:');
    console.log(`总响应数: ${responseCount}`);
    console.log(`总 functionCalls: ${totalFunctionCalls.length}`);
    
    if (totalFunctionCalls.length > 0) {
      console.log('\n🔍 详细分析:');
      totalFunctionCalls.forEach((fc, index) => {
        console.log(`\nFunction Call #${index + 1}:`);
        console.log(`  ✓ 完整结构: ${JSON.stringify(fc, null, 2)}`);
        
        // 问题诊断
        const issues = [];
        if (!fc.id) issues.push('ID 为 undefined');
        if (!fc.name) issues.push('Name 为 undefined');
        if (!fc.args) issues.push('Args 为 undefined');
        if (fc.args && !fc.args.action) issues.push('缺少 action 参数');
        
        if (issues.length > 0) {
          console.log(`  ❌ 发现问题: ${issues.join(', ')}`);
        } else {
          console.log(`  ✅ 结构完整`);
        }
      });
    } else {
      console.log('❌ 没有收到任何 functionCalls - 这可能是问题所在!');
    }

  } catch (error) {
    console.error('❌ 调试过程中出错:', error.message);
    console.error('堆栈信息:', error.stack);
    
    // 提供更详细的错误诊断
    console.log('\n🔧 错误诊断:');
    
    if (error.message.includes('Cannot read properties of undefined')) {
      console.log('  - 这通常是配置初始化失败导致的');
      console.log('  - 请检查你的API密钥配置:');
      console.log(`    GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '已设置' : '❌ 未设置'}`);
      console.log(`    QWEN_API_KEY: ${process.env.QWEN_API_KEY ? '已设置' : '❌ 未设置'}`);
      console.log(`    使用的模型: ${process.env.GEMINI_MODEL || 'gemini-1.5-flash'}`);
    }
    
    if (error.message.includes('认证') || error.message.includes('auth')) {
      console.log('  - 认证相关错误，建议:');
      console.log('    1. 检查API密钥是否有效');
      console.log('    2. 尝试重新运行: npm run cli -- --auth');
      console.log('    3. 检查网络连接');
    }
  }
}

// 从命令行参数获取查询
const query = process.argv[2] || '请帮我获取API列表';

debugFunctionCalls(query).then(() => {
  console.log('\n🏁 调试完成');
  process.exit(0);
}).catch(error => {
  console.error('❌ 脚本执行失败:', error.message);
  process.exit(1);
}); 