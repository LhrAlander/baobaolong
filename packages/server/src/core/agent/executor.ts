import { ILLMProvider } from '../llm/interfaces.js';
import { ChatMessage, ChatOptions } from '../llm/types.js';
import { SkillRegistry } from '../skills/registry.js';
import { ISkill } from '../skills/types.js';

export interface AgentExecuteOptions extends ChatOptions {
    /** 本次执行最多允许大模型连续挂起并调用的次数，防止陷入无限死循环 */
    maxSteps?: number;
    /** 用户或当前会话标识，用于工具层穿透使用 */
    sessionId?: string;
}

export class AgentExecutor {
    constructor(
        private readonly llm: ILLMProvider,
        private readonly skillRegistry: SkillRegistry
    ) { }

    /**
     * 将原始消息数组切分成一个个“事务块(Block)”。
     * 这个设计的核心是保护大模型 Tool 调用的一致性：
     * Assistant 发出的 tool_calls 和随后填充的 tool 返回必须同生共死，不可切断。
     */
    private chunkMessagesIntoBlocks(messages: ChatMessage[]): ChatMessage[][] {
        const blocks: ChatMessage[][] = [];
        let currentTransaction: ChatMessage[] = [];

        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];

            if (msg.role === 'system') {
                if (currentTransaction.length > 0) {
                    blocks.push(currentTransaction);
                    currentTransaction = [];
                }
                blocks.push([msg]);
                continue;
            }

            // 如果遇到带有 tool_calls 的 assistant 消息，说明这是一个 Tool 事务的开端
            if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
                if (currentTransaction.length > 0) {
                    blocks.push(currentTransaction);
                }
                currentTransaction = [msg];
            }
            // 如果遇到 tool 角色，它属于当前挂着的事务
            else if (msg.role === 'tool') {
                currentTransaction.push(msg);
                // 通常一段并发的 tool 结束后，紧接着会是一条总结的 assistant 或新的 user
                // 但我们无法在这预判 tool 到底有几个。所以我们先攒在 currentTransaction 里。
            }
            // 普通的 user 或 assistant(无工具调用)
            else {
                if (currentTransaction.length > 0) {
                    blocks.push(currentTransaction);
                    currentTransaction = [];
                }
                blocks.push([msg]);
            }
        }

        if (currentTransaction.length > 0) {
            blocks.push(currentTransaction);
        }

        return blocks;
    }

    /**
     * 获取指定消息列表的 Token 数量。如果 provider 未实现估算方法，采用极简粗估算法。
     */
    private getTokenCount(messages: ChatMessage[]): number {
        if (this.llm.estimateTokenCount) {
            return this.llm.estimateTokenCount(messages);
        }
        // 粗俗估算兜底
        return messages.reduce((acc, msg) => {
            const contentLen = msg.content ? msg.content.length : 0;
            const toolLen = msg.tool_calls ? JSON.stringify(msg.tool_calls).length : 0;
            return acc + contentLen + toolLen + 10;
        }, 0);
    }

    /**
     * 智能滑动截断：在发送给 LLM 前，严格核查 Token 上限，截断安全视窗之外的长尾历史
     */
    private buildContextWindow(rawMessages: ChatMessage[]): ChatMessage[] {
        const config = this.llm.getModelConfig();
        const maxAllowedTokens = config.contextWindow - config.maxOutputTokens - (config.safetyBuffer || 1000);
        let currentTokens = 0;

        const blocks = this.chunkMessagesIntoBlocks(rawMessages);
        const windowBlocks: ChatMessage[][] = [];

        // 1. 无脑保留所有 system prompt (放最前面)
        const systemBlocks = blocks.filter(b => b[0].role === 'system');
        const nonSystemBlocks = blocks.filter(b => b[0].role !== 'system');

        for (const sys of systemBlocks) {
            currentTokens += this.getTokenCount(sys);
            windowBlocks.push(sys);
        }

        // 2. 倒序装填剩余非 System 对话块，直到装满
        const temporaryHistoryBlocks: ChatMessage[][] = [];
        for (let i = nonSystemBlocks.length - 1; i >= 0; i--) {
            const block = nonSystemBlocks[i];
            const blockTokens = this.getTokenCount(block);

            if (currentTokens + blockTokens > maxAllowedTokens) {
                console.warn(`[Agent Executor] ⚠️ 滑动窗口触发边缘截断：历史过长，放弃加载前面的 ${i + 1} 个对话块。`);
                break; // 容量见底，放弃往前装填
            }

            currentTokens += blockTokens;
            temporaryHistoryBlocks.unshift(block); // 因为是倒序遍历，所以用 unshift 塞入头部保证顺寻
        }

        // 3. 组装最终发包的 messages
        windowBlocks.push(...temporaryHistoryBlocks);
        return windowBlocks.flat();
    }

    /**
     * 执行完整的智能体推理与行动循环 (ReAct Loop)
     * 
     * @param initialMessages 初始的一手会话历史（会完全保留，新进度在原数组尾部原地追加）
     * @param options 配置参数，包括可用的 tools 字典等
     * @returns 最终总结好的口语化回答文本
     */
    public async execute(initialMessages: ChatMessage[], options?: AgentExecuteOptions): Promise<string> {
        const maxSteps = options?.maxSteps || 100;
        let currentStep = 0;

        // 加载当前全部可用工具
        const tools: ISkill[] = options?.tools || this.skillRegistry.getAllSkills();
        const executionOptions: ChatOptions = { ...options, tools };

        while (currentStep < maxSteps) {
            currentStep++;
            console.log(`\n[Agent Executor] --- 第 ${currentStep} 轮思考开始 ---`);

            // 1. 构建安全的上下文视窗（切割掉超出阈值的上文）
            const safeContextWindow = this.buildContextWindow(initialMessages);

            // 2. 发起 LLM 思考
            const response = await this.llm.chat(safeContextWindow, executionOptions);

            // 如果大模型认为思考完毕，吐出直接回复，关闭循环
            if (!response.toolCalls || response.toolCalls.length === 0) {
                console.log(`[Agent Executor] 思考完毕，得出最终结论。`);
                const finalReply = response.content;
                // 原地追加记录！遵循 Rule 2.1：完全无损地维系外部数组
                initialMessages.push({ role: 'assistant', content: finalReply });
                return finalReply;
            }

            console.log(`[Agent Executor] 决定挂起并执行动作 (Action) -> 工具数: ${response.toolCalls.length}`);

            // 将大模型呼出工具的请求也无损追加进历史
            initialMessages.push({
                role: 'assistant',
                content: response.content || '',
                tool_calls: response.toolCalls
            });

            // 3. 拦截并并发执行所有的 toolCalls
            for (const call of response.toolCalls) {
                console.log(`  -> 正在调起系统能力: ${call.name}(${JSON.stringify(call.args)})`);

                // ✨ 【核心穿透点】: 将当前外层的 sessionId 等系统私货静默塞入工具入参中，提供给需要上下文读取的特定 Skill
                const enhancedArgs = {
                    ...call.args,
                    __sessionId: options?.sessionId
                };

                let toolResultStr = '';
                try {
                    const result = await this.skillRegistry.executeToolCall(call.name, enhancedArgs);
                    toolResultStr = typeof result === 'string' ? result : JSON.stringify(result);
                } catch (error) {
                    toolResultStr = String(error);
                }

                console.log(`     [返回结果体积]: ${toolResultStr.length} 字符。`);

                // 追加 tool 执行的结果
                initialMessages.push({
                    role: 'tool',
                    name: call.name,
                    tool_call_id: call.id,
                    content: toolResultStr
                });
            }
        }

        console.warn(`[Agent Executor] 达到最大死循环保护次数 (${maxSteps})，强制中止！`);
        return "非常抱歉，我尝试了多次探索依旧无法获得足够解答您的信息，系统中止了我的思考流程。";
    }
}
