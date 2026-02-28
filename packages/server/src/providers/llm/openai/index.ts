import { ILLMProvider } from '../../../core/llm/interfaces.js';
import { ChatMessage, ChatOptions, ChatResponse, ModelConfig } from '../../../core/llm/types.js';
import { openaiConfig } from './config.js';

export class OpenAIProvider implements ILLMProvider {
    constructor() {
        console.log(`[OpenAI] Provider 初始化完成，基地址: ${openaiConfig.baseUrl}`);
    }

    async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
        const model = options?.model || openaiConfig.model;
        console.log(`[OpenAI] 调用兼容协议模型 ${model}...`);

        return {
            content: "Hello! This is a mock response from the OpenAI compatible provider.",
            usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 }
        };
    }

    async *stream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string> {
        const words = ["This ", "is ", "OpenAI ", "stream ", "mock."];
        for (const w of words) {
            await new Promise(r => setTimeout(r, 100));
            yield w;
        }
    }
    getModelConfig(): ModelConfig {
        return {
            contextWindow: 128000,
            maxOutputTokens: 4096,
            safetyBuffer: 1000
        };
    }

    estimateTokenCount(messages: ChatMessage[]): number {
        return messages.reduce((acc, msg) => {
            const contentLen = msg.content ? msg.content.length : 0;
            const toolLen = msg.tool_calls ? JSON.stringify(msg.tool_calls).length : 0;
            return acc + contentLen + toolLen + 10;
        }, 0);
    }
}
