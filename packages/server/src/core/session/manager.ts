import { AgentExecuteOptions, AgentExecutor } from '../agent/executor.js';
import { ChatMessage, ChatOptions } from '../llm/types.js';
import { MemorySummarizer } from '../memory/summarizer.js';
import { ISessionStorage, SessionData } from './interfaces.js';
import { IMemoryStorage } from '../memory/interfaces.js';

export class SessionManager {
    // 设置触发新一轮滚动的阈值 (比如当新增了 10 条对话，且 Token 压力大时触发组装压缩)
    private readonly NEW_MESSAGES_ROLLING_THRESHOLD = 10;

    constructor(
        private readonly storage: ISessionStorage,
        private readonly executor: AgentExecutor,
        private readonly summarizer: MemorySummarizer,
        private readonly memoryStorage: IMemoryStorage
    ) { }

    /**
     * 接管外层网络请求的核心入口：处理一条来自用户的新消息
     */
    public async handleMessage(sessionId: string, userText: string, options?: AgentExecuteOptions): Promise<string> {
        // 1. 获取原汁原味的生切历史字典
        let session = await this.storage.loadSession(sessionId);
        if (!session) {
            session = {
                sessionId,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                messages: [],
                rollingSummaries: []
            };
        }

        // 2. 将用户最新说的话追加进入 Raw Data (持久化字典)
        session.messages.push({ role: 'user', content: userText });
        session.updatedAt = Date.now();

        // 3. 构建临时视窗上下文 (Context Assembling)
        const contextWindow = await this.assembleContextWindow(session);
        const originalRefs = new Set(contextWindow);

        // 4. 将极度纯净且处于安全体积内的临时视窗抛给 Agent Executor 进行地狱思考
        console.log(`[Session Manager] 拼装完毕，向主力模型喂入 ${contextWindow.length} 条有效上下文 (已包含被折叠的纪元记忆)。`);

        let finalAnswer = "";
        try {
            // Executor 的 execute 是原地修改数组并将 finalAnswer 作为返回值的
            finalAnswer = await this.executor.execute(contextWindow, options);
        } catch (error: any) {
            console.error(`[Session Manager] Executor 执行崩溃:`, error);
            finalAnswer = "系统处理您的请求时遭遇了错误，请稍后再试。";
            contextWindow.push({ role: 'assistant', content: finalAnswer }); // 补上异常回复
        }

        // 5. 剥离并归档新产生的副产品 (Tool 调用日志 和 Final Answer)
        this.syncNewContextToSessionRow(session, contextWindow, originalRefs);

        // 6. 落盘写数据库/JSON 文件
        await this.storage.saveSession(sessionId, session);

        return finalAnswer;
    }

    /**
     * 智能组装视窗：从成百上千条长对话中提取缓存的 "上片回忆录" 并合并新消息
     */
    private async assembleContextWindow(session: SessionData): Promise<ChatMessage[]> {
        const rawMessages = session.messages;
        if (rawMessages.length === 0) return [];

        if (!session.rollingSummaries) {
            session.rollingSummaries = [];
        }

        // 找出已被压缩过的最大的下标
        const lastIncludedIndex = session.rollingSummaries.length > 0
            ? session.rollingSummaries[session.rollingSummaries.length - 1].endIndex
            : -1;

        // 我们当前还没被压进 "纪元回忆录" 里的新孤儿聊天数量
        const uncompressedCount = rawMessages.length - 1 - lastIncludedIndex;

        // 如果孤儿消息堆积太多，立刻呼叫 Summarizer 触发增量纪元生成
        if (uncompressedCount > this.NEW_MESSAGES_ROLLING_THRESHOLD && lastIncludedIndex < rawMessages.length - 2) {
            console.log(`[Session Manager] 探测到大量的新增口水流未压缩 (${uncompressedCount}条)，开始生成第 ${session.rollingSummaries.length + 1} 纪元...`);

            // 抽出这批等待被压缩的新增流（除开最新的一句）
            const targetSlice = rawMessages.slice(lastIncludedIndex + 1, rawMessages.length - 1);

            let priorContext = "";
            if (session.rollingSummaries.length > 0) {
                priorContext = `(前情提要：${session.rollingSummaries.map(r => r.content).join('\n')})\n\n`;
            }

            // 我们构造一段强力 Prompt 丢给 summarizer
            const pseudoSlice = [...targetSlice];
            pseudoSlice.unshift({
                role: 'system',
                content: `请结合我们的前情提要，总结接下来的这段新进展：\n${priorContext}`
            });

            const newContent = await this.summarizer.compactContext(pseudoSlice);
            if (!newContent.includes('[无关键事实留存]')) {
                session.rollingSummaries.push({
                    content: newContent,
                    startIndex: lastIncludedIndex + 1,
                    endIndex: rawMessages.length - 2
                });
                console.log(`[Session Manager] 纪元记录生成完毕。`);
            } else {
                session.rollingSummaries.push({
                    content: "该时间段内系统进行了例行互动或无意义闲聊，无关键决策跃进。",
                    startIndex: lastIncludedIndex + 1,
                    endIndex: rawMessages.length - 2
                });
            }
        }

        // --- 组装最终向 LLM 发送的窗户 ---
        const assembledWindow: ChatMessage[] = [];

        // 1. 前置读取用户的长期记忆档案 (Core Memory) 并作为最顶层 System Prompt
        let coreSystemPrompt = "你是私人智能助理，请严格依据以下主人的核心偏好进行服务：\n\n";

        let hasCoreMemory = false;
        try {
            const userProfile = await this.memoryStorage.get('core', 'user_profile');
            const systemInst = await this.memoryStorage.get('core', 'system_instructions');

            if (userProfile) {
                coreSystemPrompt += `[用户画像与偏好]:\n${userProfile}\n\n`;
                hasCoreMemory = true;
            }
            if (systemInst) {
                coreSystemPrompt += `[系统铁律]:\n${systemInst}\n\n`;
                hasCoreMemory = true;
            }
        } catch (e) {
            console.error('[Session Manager] 提取 Core Memory 失败', e);
        }

        if (hasCoreMemory) {
            assembledWindow.push({ role: 'system', content: coreSystemPrompt.trim() });
        }

        // 1.5 补上数组里的默认防挂提示词 (如果你最初始有设置 system 角色的话)
        if (rawMessages[0]?.role === 'system') {
            assembledWindow.push(rawMessages[0]);
        }

        // 2. 将前面所有已经生成的连环回忆录，折叠成一句话插入中间
        if (session.rollingSummaries && session.rollingSummaries.length > 0) {
            const fusedStory = session.rollingSummaries.map((s, idx) => `[往事纪元 ${idx + 1}卷]：\n${s.content}`).join('\n\n');
            assembledWindow.push({
                role: 'assistant',
                content: `[系统内存保护折叠区] 以下是本会话开启以来的所有历史提要：\n\n${fusedStory}`
            });
        }

        // 3. 将尾部那几个还没熟的新对话原样塞入
        const activeEndIndex = session.rollingSummaries.length > 0
            ? session.rollingSummaries[session.rollingSummaries.length - 1].endIndex
            : (rawMessages[0]?.role === 'system' ? 0 : -1);

        const activeTails = rawMessages.slice(activeEndIndex + 1);
        assembledWindow.push(...activeTails);

        return assembledWindow;
    }

    /**
     * 将 Agent 运行期间向视窗中新写入的历史，安全剥离出并推向原纪录文件
     */
    private syncNewContextToSessionRow(session: SessionData, finishedWindow: ChatMessage[], originalRefs: Set<ChatMessage>) {
        // 利用对象引用的唯一性：所有没在 originalRefs 里出现过的 ChatMessage
        // 必定是 AgentExecutor 在执行 execute 的这段时间里 newly pushed 的产物！
        // （包括 ToolCalls、ToolReplies、中间可能出现的折叠占位符以及最后的 FinalAnswer）

        const newProduced = finishedWindow.filter(msg => !originalRefs.has(msg));

        if (newProduced.length > 0) {
            session.messages.push(...newProduced);
            console.log(`[Session Manager] 成功从临时视窗中剥离出 ${newProduced.length} 条增量线索并完成归档。`);
        }
    }
}
