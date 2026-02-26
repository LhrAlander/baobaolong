import { ILLMProvider } from '../llm/interfaces.js';
import { ChatMessage, ChatOptions } from '../llm/types.js';
import { SkillRegistry } from '../skills/registry.js';
import { ISkill } from '../skills/types.js';
import { MemorySummarizer } from '../memory/summarizer.js';

export interface AgentExecuteOptions extends ChatOptions {
    /** 本次执行最多允许大模型连续挂起并调用的次数，防止陷入由于参数错误导致的无限请求死循环 */
    maxSteps?: number;
    /** 上下文安全红线：如果 messages 的粗略字符串长度超过此值，将限制本地 Tool 执行结果的返回长度 */
    maxContextLengthThreshold?: number;
}

export class AgentExecutor {
    constructor(
        private readonly llm: ILLMProvider,
        private readonly skillRegistry: SkillRegistry,
        private readonly summarizer?: MemorySummarizer
    ) { }

    /**
     * 粗略估算当前上下文的容量占用
     * 采用极其低成本的字符估摸法：JSON序列化后看长度
     */
    private estimateContextLength(messages: ChatMessage[]): number {
        return JSON.stringify(messages).length;
    }

    /**
     * 截断超长字符串
     */
    private truncateString(str: string, maxLength: number): string {
        if (str.length <= maxLength) return str;
        return str.substring(0, maxLength) + '\n... (Data truncated due to system length limit protection)';
    }

    /**
     * 执行完整的智能体推理与行动循环 (ReAct Loop)
     * 
     * @param initialMessages 初始的一手会话历史（会在此基础上原地 Push 修改以维系状态）
     * @param options 配置参数，包括可用的 tools 字典等
     * @returns 最终总结好的口语化回答文本
     */
    public async execute(initialMessages: ChatMessage[], options?: AgentExecuteOptions): Promise<string> {
        const maxSteps = options?.maxSteps || 5;
        let currentStep = 0;

        // 如果没有传入工具限定，默认赋予所有已注册全局工具供其选择
        const tools: ISkill[] = options?.tools || this.skillRegistry.getAllSkills();
        // 强制复写工具参数
        const executionOptions: ChatOptions = { ...options, tools };

        // 取得安全阈值，默认粗估 20000 字符为黄线（大概对应几千个 token，视模型极其保守而定）
        const threshold = options?.maxContextLengthThreshold || 20000;

        while (currentStep < maxSteps) {
            currentStep++;
            console.log(`\n[Agent Executor] --- 第 ${currentStep} 轮思考开始 ---`);

            const response = await this.llm.chat(initialMessages, executionOptions);

            // 如果没有返回 toolCalls，代表大模型认为思考完毕，直接输出总结
            if (!response.toolCalls || response.toolCalls.length === 0) {
                console.log(`[Agent Executor] 思考完毕，得出最终结论。`);

                const finalReply = response.content;
                // 将最终回复也压入栈（保证后台总结能吃到完整的来回上下文）
                initialMessages.push({ role: 'assistant', content: finalReply });

                // --- 触发生命周期挂钩: Strategy B (Out-of-Band) 无感记笔记阶段 ---
                // 不使用 await 阻塞返回！让他在后台默默压缩整段回忆 (只对具备一定长度的闲聊归档)
                if (this.summarizer && initialMessages.length >= 4) {
                    this.summarizer.summarizeAndArchive([...initialMessages]).catch(err => {
                        console.error('[AgentExecutor] 后台归档记录流水账失败', err.message);
                    });
                }

                return finalReply;
            }

            console.log(`[Agent Executor] 决定挂起并执行动作 (Action) -> 工具数: ${response.toolCalls.length}`);

            // 注意：必须将模型的原始指令回填，否则下一次发送时它会忘记自己抛出了 function
            initialMessages.push({
                role: 'assistant',
                content: '', // 通常为空
                tool_calls: response.toolCalls
            });

            // 检测当前总大小是否逼近红线
            const currentLength = this.estimateContextLength(initialMessages);
            let isApproachingLimit = currentLength > threshold;

            // --- 动态滑动窗口压缩机制 (Context Compaction) ---
            // 如果即将要涨破上限，并且配置了 summarizer 且记录条数足量，就不光截断，还把历史缩写
            if (isApproachingLimit && this.summarizer) {
                console.warn(`[Agent Executor] ⚠️ 警告：当前上下文长度 ${currentLength} 触达安全红线 (${threshold})。开启滑动窗口浓缩机制以自救...`);
                // 1. 保留最前面 1 条 (或者是 system prompt / 起点) 和最后面 1 条 (最新的 user query)
                const keepersStart = 1;
                const keepersEnd = 1;
                const sliceToCompact = initialMessages.slice(keepersStart, initialMessages.length - keepersEnd);

                // 2. 执行强力压缩！
                let compactedSummary = await this.summarizer.compactContext(sliceToCompact);
                console.log(`[Agent Executor] 压缩完成！分析结果: ${compactedSummary.substring(0, 50)}...`);

                // 3. 抹除中间的历史记录，用一段极简的代理记忆代替
                if (compactedSummary.includes('[无关键事实留存]')) {
                    compactedSummary = '检测到这段记录为闲扯或系统循环报文，已自动清退释放内存。';
                }

                initialMessages.splice(keepersStart, sliceToCompact.length, {
                    role: 'assistant', // 以系统助理的身份留下前情提要
                    content: `[系统内存保护自动折叠]: 前面的交流内容已被压缩收拢如下:\n${compactedSummary}`
                });

                // 重新评估状态：压缩完之后可能完全恢复绿线，不再需要走硬截断
                const newLength = this.estimateContextLength(initialMessages);
                console.log(`[Agent Executor] 危机解除，Token 量从 ${currentLength} 下拉至 ${newLength}。`);
                isApproachingLimit = newLength > threshold;
            } else if (isApproachingLimit) {
                console.warn(`[Agent Executor] ⚠️ 警告：检测到当前上下文长度为 ${currentLength} 逼近上限。将开启 Tool 返回值截断机制保护模型不死。`);
            }

            // 执行所有的并行 toolCalls (标准情况模型通常会下发一个，并发版本支持多个)
            for (const call of response.toolCalls) {
                console.log(`  -> 正在调起系统能力: ${call.name}(${JSON.stringify(call.args)})`);

                let toolResultStr = '';
                try {
                    const result = await this.skillRegistry.executeToolCall(call.name, call.args);
                    // 统一序列化为标准文本记录存入历史
                    toolResultStr = typeof result === 'string' ? result : JSON.stringify(result);
                } catch (error) {
                    toolResultStr = String(error);
                }

                // --- 核心防溢出逻辑：对 JSON / String 结果执行“硬截断” ---
                if (isApproachingLimit) {
                    // 如果已经被逼近极限，每个 Tool 强行只给带最多 1000 个字回去，防止彻底打爆
                    const maxToolLengthInSafeMode = 1000;
                    toolResultStr = this.truncateString(toolResultStr, maxToolLengthInSafeMode);
                } else {
                    // 常规态也给个绝对上限兜底（比如某些网页爬虫一次返回 50万 字，直接拦截）
                    const maxAbsoluteLimit = 8000;
                    toolResultStr = this.truncateString(toolResultStr, maxAbsoluteLimit);
                }

                console.log(`     [返回结果体积]: ${toolResultStr.length} 字符。`);

                initialMessages.push({
                    role: 'tool',
                    name: call.name,
                    tool_call_id: call.id,
                    content: toolResultStr
                });
            }
        }

        // 触达强行终止保护底线
        console.warn(`[Agent Executor] 达到最大死循环保护次数 (${maxSteps})，强制中止！`);

        // 即便死循环失败，有价值的前置探索部分我们也尝试归档
        if (this.summarizer && initialMessages.length >= 4) {
            this.summarizer.summarizeAndArchive([...initialMessages]).catch(err => {
                console.error('[AgentExecutor] 后台归档探索失败的记录异常', err.message);
            });
        }

        return "非常抱歉，我尝试了多次探索依旧无法获得足够解答您的信息，系统中止了我的思考流程。";
    }
}
