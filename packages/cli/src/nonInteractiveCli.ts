/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Config,
  ToolCallRequestInfo,
  executeToolCall,
  ToolRegistry,
  shutdownTelemetry,
  isTelemetrySdkInitialized,
} from '@google/gemini-cli-core';
import {
  Content,
  Part,
  FunctionCall,
  GenerateContentResponse,
} from '@google/genai';

import { parseAndFormatApiError } from './ui/utils/errorParsing.js';

function getResponseText(response: GenerateContentResponse): string | null {
  if (response.candidates && response.candidates.length > 0) {
    const candidate = response.candidates[0];
    if (
      candidate.content &&
      candidate.content.parts &&
      candidate.content.parts.length > 0
    ) {
      // We are running in headless mode so we don't need to return thoughts to STDOUT.
      const thoughtPart = candidate.content.parts[0];
      if (thoughtPart?.thought) {
        return null;
      }
      return candidate.content.parts
        .filter((part) => part.text)
        .map((part) => part.text)
        .join('');
    }
  }
  return null;
}

export async function runNonInteractive(
  config: Config,
  input: string,
  prompt_id: string,
): Promise<void> {
  await config.initialize();
  // Handle EPIPE errors when the output is piped to a command that closes early.
  process.stdout.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') {
      // Exit gracefully if the pipe is closed.
      process.exit(0);
    }
  });

  const geminiClient = config.getGeminiClient();
  const toolRegistry: ToolRegistry = await config.getToolRegistry();

  // 添加调试信息：显示可用工具
  const availableTools = toolRegistry.getFunctionDeclarations();
  console.debug(`[DEBUG] 初始化完成，可用工具数量: ${availableTools.length}`);
  console.debug(`[DEBUG] 可用工具列表: ${availableTools.map((tool) => tool.name).join(', ')}`);

  const chat = await geminiClient.getChat();
  const abortController = new AbortController();
  let currentMessages: Content[] = [{ role: 'user', parts: [{ text: input }] }];
  let iterationCount = 0;

  try {
    while (true) {
      iterationCount++;
      console.debug(`[DEBUG] 开始第 ${iterationCount} 轮对话`);
      
      const functionCalls: FunctionCall[] = [];

      console.debug(`[DEBUG] 发送消息到模型，当前消息数: ${currentMessages.length}`);
      console.debug(`[DEBUG] 当前消息角色: ${currentMessages.map((msg) => msg.role).join(', ')}`);

      const responseStream = await chat.sendMessageStream(
        {
          message: currentMessages[0]?.parts || [], // Ensure parts are always provided
          config: {
            abortSignal: abortController.signal,
            tools: [
              { functionDeclarations: toolRegistry.getFunctionDeclarations() },
            ],
          },
        },
        prompt_id,
      );

      console.debug(`[DEBUG] 开始处理流式响应`);
      let responseCount = 0;

      for await (const resp of responseStream) {
        responseCount++;
        
        if (abortController.signal.aborted) {
          console.error('Operation cancelled.');
          return;
        }
        
        // 简化的调试日志：只在有重要信息时输出
        const hasText = !!getResponseText(resp);
        const hasFunctionCalls = !!resp.functionCalls;
        const hasFinishReason = !!resp.candidates?.[0]?.finishReason;
        
        if (hasText || hasFunctionCalls || hasFinishReason) {
          console.debug(`[DEBUG] 响应 #${responseCount}: 文本=${hasText}, 工具调用=${hasFunctionCalls}, 结束原因=${hasFinishReason}`);
        }
        
        const textPart = getResponseText(resp);
        if (textPart) {
          process.stdout.write(textPart);
        }
        
        if (resp.functionCalls) {
          console.debug(`[DEBUG] 检测到工具调用: ${resp.functionCalls.length} 个`);
          for (const fc of resp.functionCalls) {
            console.debug(`[DEBUG] 工具调用详情: 名称=${fc.name}, ID=${fc.id}, 参数键=[${Object.keys(fc.args || {}).join(', ')}]`);
          }
          functionCalls.push(...resp.functionCalls);
        }
      }

      console.debug(`[DEBUG] 流式响应处理完毕，总计收到 ${responseCount} 个响应片段`);

      if (functionCalls.length > 0) {
        console.debug(`[DEBUG] 累计收到 ${functionCalls.length} 个工具调用，开始执行`);
        
        const toolResponseParts: Part[] = [];

        for (let i = 0; i < functionCalls.length; i++) {
          const fc = functionCalls[i];
          console.debug(`[DEBUG] 执行工具调用 ${i + 1}/${functionCalls.length}: ${fc.name}`);
          
          const callId = fc.id ?? `${fc.name}-${Date.now()}`;
          const requestInfo: ToolCallRequestInfo = {
            callId,
            name: fc.name as string,
            args: (fc.args ?? {}) as Record<string, unknown>,
            isClientInitiated: false,
            prompt_id,
          };

          const startTime = Date.now();
          const toolResponse = await executeToolCall(
            config,
            requestInfo,
            toolRegistry,
            abortController.signal,
          );
          const duration = Date.now() - startTime;

          console.debug(`[DEBUG] 工具 ${fc.name} 执行完成 (${duration}ms): 成功=${!toolResponse.error}, 有响应=${!!toolResponse.responseParts}`);

          if (toolResponse.error) {
            const isToolNotFound = toolResponse.error.message.includes(
              'not found in registry',
            );
            console.error(
              `Error executing tool ${fc.name}: ${toolResponse.resultDisplay || toolResponse.error.message}`,
            );
            if (!isToolNotFound) {
              process.exit(1);
            }
          }

          if (toolResponse.responseParts) {
            const parts = Array.isArray(toolResponse.responseParts)
              ? toolResponse.responseParts
              : [toolResponse.responseParts];
            for (const part of parts) {
              if (typeof part === 'string') {
                toolResponseParts.push({ text: part });
              } else if (part) {
                toolResponseParts.push(part);
              }
            }
          }
        }
        
        console.debug(`[DEBUG] 所有工具调用执行完毕，生成 ${toolResponseParts.length} 个响应部分`);
        currentMessages = [{ role: 'user', parts: toolResponseParts }];
      } else {
        console.debug(`[DEBUG] 没有工具调用，对话结束`);
        process.stdout.write('\n'); // Ensure a final newline
        return;
      }
    }
  } catch (error) {
    console.error(
      parseAndFormatApiError(
        error,
        config.getContentGeneratorConfig().authType,
      ),
    );
    process.exit(1);
  } finally {
    if (isTelemetrySdkInitialized()) {
      await shutdownTelemetry();
    }
  }
}
