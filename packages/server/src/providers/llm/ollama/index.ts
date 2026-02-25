import { ILLMProvider } from '../../../core/llm/interfaces.js';
import { ChatMessage, ChatOptions, ChatResponse } from '../../../core/llm/types.js';
import { ollamaConfig } from './config.js';

export class OllamaProvider implements ILLMProvider {
    constructor() {
        console.log(`[Ollama] Provider 初始化完成，指向服务: ${ollamaConfig.host}`);
    }

    async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
        const model = options?.model || ollamaConfig.model;
        console.log(`[Ollama] 借助本地引擎使用 ${model} 模型计算中...`);

        return {
            content: "Hello from local Ollama endpoint! （这是一个基于网络模拟的数据）",
        };
    }

    async *stream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string> {
        const chars = "Ollama Local Stream Test...".split('');
        for (const char of chars) {
            await new Promise(r => setTimeout(r, 50));
            yield char;
        }
    }
}
