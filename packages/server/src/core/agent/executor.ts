import { ILLMProvider } from '../llm/interfaces.js';
import { ChatMessage, ChatOptions } from '../llm/types.js';
import { SkillRegistry } from '../skills/registry.js';
import { ISkill } from '../skills/types.js';

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
                // 可选：将最终回复也压入栈（如果要支持多轮连续聊天记忆的话），目前由于通常在最外层上层服务合并，这里可选
                return response.content;
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
            const isApproachingLimit = currentLength > threshold;
            if (isApproachingLimit) {
                console.warn(`[Agent Executor] ⚠️ 警告：检测到当前上下文长度为 ${currentLength}，即将触达设定的高压红线 (${threshold})。开启 Tool 返回值截断机制！`);
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
        return "非常抱歉，我尝试了多次探索依旧无法获得足够解答您的信息，系统中止了我的思考流程。";
    }
}
