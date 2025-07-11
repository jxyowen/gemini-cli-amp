/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content, SchemaUnion, Type } from '@google/genai';
import { GeminiClient } from '../core/client.js';
import { GeminiChat } from '../core/geminiChat.js';
import { isFunctionResponse } from './messageInspectors.js';
import { isQwenModel } from '../config/models.js';

const CHECK_PROMPT = `Analyze *only* the content and structure of your immediately preceding response (your last turn in the conversation history). Based *strictly* on that response, determine who should logically speak next: the 'user' or the 'model' (you).
**Decision Rules (apply in order):**
1.  **Model Continues:** If your last response explicitly states an immediate next action *you* intend to take (e.g., "Next, I will...", "Now I'll process...", "Moving on to analyze...", indicates an intended tool call that didn't execute), OR if the response seems clearly incomplete (cut off mid-thought without a natural conclusion), then the **'model'** should speak next.
2.  **Question to User:** If your last response ends with a direct question specifically addressed *to the user*, then the **'user'** should speak next.
3.  **Waiting for User:** If your last response completed a thought, statement, or task *and* does not meet the criteria for Rule 1 (Model Continues) or Rule 2 (Question to User), it implies a pause expecting user input or reaction. In this case, the **'user'** should speak next.
**Output Format:**
Respond *only* in JSON format according to the following schema. Do not include any text outside the JSON structure.
\`\`\`json
{
  "type": "object",
  "properties": {
    "reasoning": {
        "type": "string",
        "description": "Brief explanation justifying the 'next_speaker' choice based *strictly* on the applicable rule and the content/structure of the preceding turn."
    },
    "next_speaker": {
      "type": "string",
      "enum": ["user", "model"],
      "description": "Who should speak next based *only* on the preceding turn and the decision rules."
    }
  },
  "required": ["next_speaker", "reasoning"]
}
\`\`\`
`;

const RESPONSE_SCHEMA: SchemaUnion = {
  type: Type.OBJECT,
  properties: {
    reasoning: {
      type: Type.STRING,
      description:
        "Brief explanation justifying the 'next_speaker' choice based *strictly* on the applicable rule and the content/structure of the preceding turn.",
    },
    next_speaker: {
      type: Type.STRING,
      enum: ['user', 'model'],
      description:
        'Who should speak next based *only* on the preceding turn and the decision rules',
    },
  },
  required: ['reasoning', 'next_speaker'],
};

export interface NextSpeakerResponse {
  reasoning: string;
  next_speaker: 'user' | 'model';
}

export async function checkNextSpeaker(
  chat: GeminiChat,
  geminiClient: GeminiClient,
  abortSignal: AbortSignal,
): Promise<NextSpeakerResponse | null> {
  // We need to capture the curated history because there are many moments when the model will return invalid turns
  // that when passed back up to the endpoint will break subsequent calls. An example of this is when the model decides
  // to respond with an empty part collection if you were to send that message back to the server it will respond with
  // a 400 indicating that model part collections MUST have content.
  const curatedHistory = chat.getHistory(/* curated */ true);

  // Ensure there's a model response to analyze
  if (curatedHistory.length === 0) {
    // Cannot determine next speaker if history is empty.
    return null;
  }

  const comprehensiveHistory = chat.getHistory();
  // If comprehensiveHistory is empty, there is no last message to check.
  // This case should ideally be caught by the curatedHistory.length check earlier,
  // but as a safeguard:
  if (comprehensiveHistory.length === 0) {
    return null;
  }
  const lastComprehensiveMessage =
    comprehensiveHistory[comprehensiveHistory.length - 1];

  // If the last message is a user message containing only function_responses,
  // then the model should speak next.
  if (
    lastComprehensiveMessage &&
    isFunctionResponse(lastComprehensiveMessage)
  ) {
    return {
      reasoning:
        'The last message was a function response, so the model should speak next.',
      next_speaker: 'model',
    };
  }

  if (
    lastComprehensiveMessage &&
    lastComprehensiveMessage.role === 'model' &&
    lastComprehensiveMessage.parts &&
    lastComprehensiveMessage.parts.length === 0
  ) {
    lastComprehensiveMessage.parts.push({ text: '' });
    return {
      reasoning:
        'The last message was a filler model message with no content (nothing for user to act on), model should speak next.',
      next_speaker: 'model',
    };
  }

  // Things checked out. Let's proceed to potentially making an LLM request.

  const lastMessage = curatedHistory[curatedHistory.length - 1];
  if (!lastMessage || lastMessage.role !== 'model') {
    // Cannot determine next speaker if the last turn wasn't from the model
    // or if history is empty.
    return null;
  }

  // 获取当前模型并检查是否为Qwen模型
  const currentModel = geminiClient.getContentGenerator().constructor.name;
  const configModel = (geminiClient as any).config?.getModel?.() || '';
  
  console.debug('[DEBUG] checkNextSpeaker: Current model:', currentModel, 'Config model:', configModel);
  
  // 为Qwen模型提供简化的逻辑，避免JSON调用
  if (isQwenModel(configModel) || currentModel.includes('Qwen')) {
    console.debug('[DEBUG] checkNextSpeaker: Using simplified logic for Qwen model');
    
    // 简化的规则：检查最后一条模型消息的内容
    const lastModelContent = lastMessage.parts
      ?.map(part => 'text' in part ? part.text : '')
      .join(' ')
      .trim() || '';
    
    // 如果消息以问号结尾，让用户回答
    if (lastModelContent.endsWith('?')) {
      return {
        reasoning: 'Last model message ended with a question, user should respond',
        next_speaker: 'user',
      };
    }
    
    // 如果消息包含明确的继续指示词
    const continueIndicators = [
      'Next, I will',
      'Now I\'ll',
      'Moving on to',
      'Let me',
      'I\'ll now',
      'I will now',
      'Continuing',
      'Processing',
    ];
    
    if (continueIndicators.some(indicator => 
      lastModelContent.includes(indicator)
    )) {
      return {
        reasoning: 'Model message indicates continuation, model should speak next',
        next_speaker: 'model',
      };
    }
    
    // 如果消息看起来不完整（没有结束标点符号）
    if (lastModelContent.length > 0 && 
        !lastModelContent.match(/[.!?。！？]$/)) {
      return {
        reasoning: 'Model message appears incomplete, model should continue',
        next_speaker: 'model',
      };
    }
    
    // 默认情况下，让用户继续对话
    return {
      reasoning: 'Model message completed, user should speak next',
      next_speaker: 'user',
    };
  }

  // 对于Gemini模型，继续使用原来的JSON调用逻辑
  const contents: Content[] = [
    ...curatedHistory,
    { role: 'user', parts: [{ text: CHECK_PROMPT }] },
  ];

  try {
    console.debug('[DEBUG] checkNextSpeaker: Attempting to call generateJson for Gemini model');
    
    const parsedResponse = (await geminiClient.generateJson(
      contents,
      RESPONSE_SCHEMA,
      abortSignal,
    )) as unknown as NextSpeakerResponse;

    console.debug('[DEBUG] checkNextSpeaker: Received response:', parsedResponse);

    if (
      parsedResponse &&
      parsedResponse.next_speaker &&
      ['user', 'model'].includes(parsedResponse.next_speaker)
    ) {
      return parsedResponse;
    }
    
    console.warn('[DEBUG] checkNextSpeaker: Invalid response format:', parsedResponse);
    return null;
  } catch (error) {
    console.warn(
      'Failed to talk to API endpoint when seeing if conversation should continue.',
      error,
    );
    
    // 为Gemini模型也提供fallback
    console.debug('[DEBUG] checkNextSpeaker: Using fallback - defaulting to user speaker');
    return {
      reasoning: 'API call failed, defaulting to user turn for safety',
      next_speaker: 'user',
    };
  }
}
