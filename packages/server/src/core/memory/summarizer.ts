import { ILLMProvider } from '../llm/interfaces.js';
import { ChatMessage } from '../llm/types.js';
import { IMemoryStorage } from './interfaces.js';

export class MemorySummarizer {
    constructor(
        private readonly assistant: ILLMProvider,
        private readonly storage: IMemoryStorage
    ) { }

    /**
     * 将给定的连续对话历史压缩为 Markdown 格式的长期记忆摘要，并写入 daily 冷数据库中
     * @param messages 历史对话列表
     */
    public async summarizeAndArchive(messages: ChatMessage[]): Promise<void> {
        console.log(`[MemorySummarizer] 启动后台静默线程，准备压缩 ${messages.length} 条历史对话...`);

        // 过滤掉其中涉及内部 Tool 调用的复杂报文，提取纯人类和纯回复的核心语料
        const cleanMessages = messages.filter(m => !m.tool_calls && m.role !== 'tool');

        const systemPrompt: ChatMessage = {
            role: 'user', // 因为很多模型不原生支持 system 独立 role，使用 user 作为指令引导
            content: `
你是一个极为严谨的"记忆文档整理员"。以下是我与AI助理的今日交流原纪录。
请你以客观的第三人称视角，将我们的对话提纯并总结出重点事件、知识点或讨论进展。
不需要任何客套话，直接用 Markdown 列表或段落格式输出摘要。

交流记录如下：
${JSON.stringify(cleanMessages, null, 2)}
`
        };

        try {
            // 开辟独立的无流式（非打扰）调用进行总结提炼
            const response = await this.assistant.chat([systemPrompt], {
                temperature: 0.1, // 低温度以保证事实提纯不开脑洞
            });

            // 以当天的日期作为文件名，追加到 daily 区块
            const todayKey = new Date().toISOString().split('T')[0]; // 例如 2026-02-26

            await this.storage.save('daily', todayKey, response.content, true);

            console.log(`[MemorySummarizer] 归档完成。精华内容已追加写入 daily/${todayKey}.md。`);
        } catch (error) {
            console.error(`[MemorySummarizer] 归档压缩作业失败:`, error);
        }
    }

    /**
     * 将给定的连续对话压缩为一段纯内容摘要。
     * 用于在 AgentExecutor 发现上下文即将超载时，主动替换中间的冗长记录。
     * @param messages 需要被压缩的中间对话段落
     * @returns 浓缩后的字符串
     */
    public async compactContext(messages: ChatMessage[]): Promise<string> {
        const cleanMessages = messages.filter(m => !m.tool_calls && m.role !== 'tool');
        if (cleanMessages.length === 0) return "这段对话主要是一些系统工具互相调用的记录，没有实质交流内容。";

        const systemPrompt: ChatMessage = {
            role: 'user',
            content: `
你是一个极为严谨的"记忆压缩器"。因为系统的上下文窗口即将被填满，请严格总结下面这段对话的核心事实和各方已经解决达成的结论。

[关键指令]
1. 请输出极其精炼的摘要（字数上限 400 字）。
2. 不需要任何多余的开场白或客套话。
3. 如果在这段对话中你发现双方只是在随意闲扯或者系统循环报文，不具备任何以后值得被翻阅的价值和业务干货，请直接且仅返回："[无关键事实留存]"，不要强行总结。

交流记录如下：
${JSON.stringify(cleanMessages, null, 2)}
`
        };

        try {
            const response = await this.assistant.chat([systemPrompt], { temperature: 0.1 });
            return response.content;
        } catch (error) {
            console.error(`[MemorySummarizer] 上下文压缩失败:`, error);
            return "[系统过载，早期上下文压缩失败，已被丢弃]";
        }
    }

    /**
     * 将现成的摘要或任意文本直接追加归档到今日冷库中
     */
    public async archiveRawContent(content: string): Promise<void> {
        try {
            const todayKey = new Date().toISOString().split('T')[0];
            await this.storage.save('daily', todayKey, content, true);
        } catch (error) {
            console.error(`[MemorySummarizer] 归档直接写入失败:`, error);
        }
    }
}
