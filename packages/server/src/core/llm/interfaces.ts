import { ChatMessage, ChatOptions, ChatResponse } from './types.js';

/**
 * 核心：大语言模型提供商 (LLM Provider) 必须实现的通用访问接口。
 * 业务层只认识这个接口，而不认识具体的 Gemini/OpenAI
 */
export interface ILLMProvider {
    /**
     * 普通对话 (非流式，一次性返回全部结果)
     * @param messages 历史消息数组
     * @param options 通用模型选项
     */
    chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;

    /**
     * 流式对话 (返回异步迭代器供外层消费 SSE)
     * @param messages 历史消息数组
     * @param options 通用模型选项
     */
    stream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string>;
}
