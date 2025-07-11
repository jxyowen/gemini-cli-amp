/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, Mock, afterEach } from 'vitest';
import { Content, GoogleGenAI, Models } from '@google/genai';
import { GeminiClient } from '../core/client.js';
import { Config } from '../config/config.js';
import { checkNextSpeaker, NextSpeakerResponse } from './nextSpeakerChecker.js';
import { GeminiChat } from '../core/geminiChat.js';
import { QwenContentGenerator } from '../qwen/qwenContentGenerator.js';

// Mock GeminiClient and Config constructor
vi.mock('../core/client.js');

// Define mocks for GoogleGenAI and Models instances that will be used across tests
const mockModelsInstance = {
  generateContent: vi.fn(),
  generateContentStream: vi.fn(),
  countTokens: vi.fn(),
  embedContent: vi.fn(),
  batchEmbedContents: vi.fn(),
} as unknown as Models;

const mockGoogleGenAIInstance = {
  getGenerativeModel: vi.fn().mockReturnValue(mockModelsInstance),
  // Add other methods of GoogleGenAI if they are directly used by GeminiChat constructor or its methods
} as unknown as GoogleGenAI;

vi.mock('@google/genai', async () => {
  const actualGenAI =
    await vi.importActual<typeof import('@google/genai')>('@google/genai');
  return {
    ...actualGenAI,
    GoogleGenAI: vi.fn(() => mockGoogleGenAIInstance), // Mock constructor to return the predefined instance
    // If Models is instantiated directly in GeminiChat, mock its constructor too
    // For now, assuming Models instance is obtained via getGenerativeModel
  };
});

describe('checkNextSpeaker', () => {
  let chatInstance: GeminiChat;
  let mockGeminiClient: GeminiClient;
  let MockConfig: Mock;
  const abortSignal = new AbortController().signal;

  beforeEach(() => {
    MockConfig = vi.mocked(Config);
    const mockConfigInstance = new MockConfig({
      sessionId: 'test-session',
      targetDir: '/test',
      debugMode: false,
      cwd: '/test',
      model: 'gemini-pro',
    });

    mockGeminiClient = new GeminiClient(mockConfigInstance);
    
    // 默认mock getContentGenerator to return a generic generator
    (mockGeminiClient.getContentGenerator as Mock) = vi.fn().mockReturnValue({
      constructor: { name: 'GeminiContentGenerator' }
    });
    
    // 默认mock config
    (mockGeminiClient as any).config = {
      getModel: vi.fn().mockReturnValue('gemini-pro')
    };

    // Reset mocks before each test to ensure test isolation
    vi.mocked(mockModelsInstance.generateContent).mockReset();
    vi.mocked(mockModelsInstance.generateContentStream).mockReset();

    // GeminiChat will receive the mocked instances via the mocked GoogleGenAI constructor
    chatInstance = new GeminiChat(
      mockConfigInstance,
      mockModelsInstance, // This is the instance returned by mockGoogleGenAIInstance.getGenerativeModel
      {},
      [], // initial history
    );

    // Spy on getHistory for chatInstance
    vi.spyOn(chatInstance, 'getHistory');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return null if history is empty', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([]);
    const result = await checkNextSpeaker(
      chatInstance,
      mockGeminiClient,
      abortSignal,
    );
    expect(result).toBeNull();
  });

  it('should return null if the last speaker was the user', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'user', parts: [{ text: 'Hello' }] },
    ] as Content[]);
    const result = await checkNextSpeaker(
      chatInstance,
      mockGeminiClient,
      abortSignal,
    );
    expect(result).toBeNull();
  });

  describe('Qwen model special handling', () => {
    beforeEach(() => {
      // Mock Qwen model detection
      const mockQwenContentGenerator = new QwenContentGenerator(
        { apiKey: 'test-key', model: 'qwen-plus' },
        {}
      );
      (mockGeminiClient.getContentGenerator as Mock).mockReturnValue(mockQwenContentGenerator);
      
      // Mock config.getModel to return Qwen model
      (mockGeminiClient as any).config = {
        getModel: vi.fn().mockReturnValue('qwen-plus')
      };
    });

    it('should use simplified logic for Qwen model with question', async () => {
      (chatInstance.getHistory as Mock).mockReturnValue([
        { role: 'model', parts: [{ text: 'What would you like to do?' }] },
      ] as Content[]);

      const result = await checkNextSpeaker(
        chatInstance,
        mockGeminiClient,
        abortSignal,
      );

      expect(result).toEqual({
        reasoning: 'Last model message ended with a question, user should respond',
        next_speaker: 'user',
      });
    });

    it('should detect continuation indicators for Qwen model', async () => {
      (chatInstance.getHistory as Mock).mockReturnValue([
        { role: 'model', parts: [{ text: 'I will now process the data...' }] },
      ] as Content[]);

      const result = await checkNextSpeaker(
        chatInstance,
        mockGeminiClient,
        abortSignal,
      );

      expect(result).toEqual({
        reasoning: 'Model message indicates continuation, model should speak next',
        next_speaker: 'model',
      });
    });

    it('should detect incomplete messages for Qwen model', async () => {
      (chatInstance.getHistory as Mock).mockReturnValue([
        { role: 'model', parts: [{ text: 'Working on the task' }] },
      ] as Content[]);

      const result = await checkNextSpeaker(
        chatInstance,
        mockGeminiClient,
        abortSignal,
      );

      expect(result).toEqual({
        reasoning: 'Model message appears incomplete, model should continue',
        next_speaker: 'model',
      });
    });

    it('should default to user for completed Qwen model messages', async () => {
      (chatInstance.getHistory as Mock).mockReturnValue([
        { role: 'model', parts: [{ text: 'Task completed successfully.' }] },
      ] as Content[]);

      const result = await checkNextSpeaker(
        chatInstance,
        mockGeminiClient,
        abortSignal,
      );

      expect(result).toEqual({
        reasoning: 'Model message completed, user should speak next',
        next_speaker: 'user',
      });
    });
  });

  describe('Gemini model JSON handling', () => {
    beforeEach(() => {
      // Mock Gemini model detection
      (mockGeminiClient as any).config = {
        getModel: vi.fn().mockReturnValue('gemini-pro')
      };
      
      // Mock getContentGenerator to return non-Qwen generator
      (mockGeminiClient.getContentGenerator as Mock).mockReturnValue({
        constructor: { name: 'GeminiContentGenerator' }
      });
      
      // Mock generateJson method
      (mockGeminiClient.generateJson as Mock) = vi.fn();
    });

    it("should return { next_speaker: 'model' } when model intends to continue", async () => {
      (chatInstance.getHistory as Mock).mockReturnValue([
        { role: 'model', parts: [{ text: 'I will now do something.' }] },
      ] as Content[]);
      const mockApiResponse: NextSpeakerResponse = {
        reasoning: 'Model stated it will do something.',
        next_speaker: 'model',
      };
      (mockGeminiClient.generateJson as Mock).mockResolvedValue(mockApiResponse);

      const result = await checkNextSpeaker(
        chatInstance,
        mockGeminiClient,
        abortSignal,
      );
      expect(result).toEqual(mockApiResponse);
      expect(mockGeminiClient.generateJson).toHaveBeenCalledTimes(1);
    });

    it("should return { next_speaker: 'user' } when model asks a question", async () => {
      (chatInstance.getHistory as Mock).mockReturnValue([
        { role: 'model', parts: [{ text: 'What would you like to do?' }] },
      ] as Content[]);
      const mockApiResponse: NextSpeakerResponse = {
        reasoning: 'Model asked a question.',
        next_speaker: 'user',
      };
      (mockGeminiClient.generateJson as Mock).mockResolvedValue(mockApiResponse);

      const result = await checkNextSpeaker(
        chatInstance,
        mockGeminiClient,
        abortSignal,
      );
      expect(result).toEqual(mockApiResponse);
    });

    it('should return fallback response if generateJson throws an error', async () => {
      (chatInstance.getHistory as Mock).mockReturnValue([
        { role: 'model', parts: [{ text: 'Some model output.' }] },
      ] as Content[]);
      (mockGeminiClient.generateJson as Mock).mockRejectedValue(
        new Error('API Error'),
      );

      const result = await checkNextSpeaker(
        chatInstance,
        mockGeminiClient,
        abortSignal,
      );
      
      expect(result).toEqual({
        reasoning: 'API call failed, defaulting to user turn for safety',
        next_speaker: 'user',
      });
    });
  });

  it("should return { next_speaker: 'user' } when model makes a statement", async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'This is a statement.' }] },
    ] as Content[]);
    const mockApiResponse: NextSpeakerResponse = {
      reasoning: 'Model made a statement, awaiting user input.',
      next_speaker: 'user',
    };
    (mockGeminiClient.generateJson as Mock) = vi.fn().mockResolvedValue(mockApiResponse);

    const result = await checkNextSpeaker(
      chatInstance,
      mockGeminiClient,
      abortSignal,
    );
    expect(result).toEqual(mockApiResponse);
  });

  it('should return null if geminiClient.generateJson returns invalid JSON (missing next_speaker)', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'Some model output.' }] },
    ] as Content[]);
    (mockGeminiClient.generateJson as Mock) = vi.fn().mockResolvedValue({
      reasoning: 'This is incomplete.',
    } as unknown as NextSpeakerResponse); // Type assertion to simulate invalid response

    const result = await checkNextSpeaker(
      chatInstance,
      mockGeminiClient,
      abortSignal,
    );
    expect(result).toBeNull();
  });

  it('should return null if geminiClient.generateJson returns a non-string next_speaker', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'Some model output.' }] },
    ] as Content[]);
    (mockGeminiClient.generateJson as Mock) = vi.fn().mockResolvedValue({
      reasoning: 'Model made a statement, awaiting user input.',
      next_speaker: 123, // Invalid type
    } as unknown as NextSpeakerResponse);

    const result = await checkNextSpeaker(
      chatInstance,
      mockGeminiClient,
      abortSignal,
    );
    expect(result).toBeNull();
  });

  it('should return null if geminiClient.generateJson returns an invalid next_speaker string value', async () => {
    (chatInstance.getHistory as Mock).mockReturnValue([
      { role: 'model', parts: [{ text: 'Some model output.' }] },
    ] as Content[]);
    (mockGeminiClient.generateJson as Mock) = vi.fn().mockResolvedValue({
      reasoning: 'Model made a statement, awaiting user input.',
      next_speaker: 'neither', // Invalid enum value
    } as unknown as NextSpeakerResponse);

    const result = await checkNextSpeaker(
      chatInstance,
      mockGeminiClient,
      abortSignal,
    );
    expect(result).toBeNull();
  });
});
