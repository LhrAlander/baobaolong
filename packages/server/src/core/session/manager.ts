import { AgentExecuteOptions, AgentExecutor } from '../agent/executor.js';
import { ChatMessage, ChatOptions } from '../llm/types.js';
import { ISessionStorage, SessionData } from './interfaces.js';
import { MemoryService, globalMemoryService } from '../memory/index.js';
import { globalProfileManager } from '../memory/profile.js';

export class SessionManager {
    constructor(
        private readonly storage: ISessionStorage,
        private readonly executor: AgentExecutor,
        private readonly memoryService: MemoryService = globalMemoryService
    ) { }

    public async handleMessage(sessionId: string, userText: string, options?: AgentExecuteOptions): Promise<string> {
        // 1. 获取原汁原味的生切历史字典
        let session = await this.storage.loadSession(sessionId);
        let isNewSession = !session || session.messages.length === 0;

        if (!session) {
            isNewSession = true;
            session = {
                sessionId,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                messages: []
            };
        }

        // 2. 将用户最新说的话追加进入 Raw Data
        session.messages.push({ role: 'user', content: userText });
        session.updatedAt = Date.now();

        // 3. 构建临时发包视窗：抽出包含动态人设的组装数组 (不污染数据库的 messages)
        let contextWindow: ChatMessage[] = [];
        try {
            contextWindow = await this.assembleContextWindow(session, isNewSession);
        } catch (e: any) {
            // 如果是因为空人设被主动拦截的，直接拦截下来并将特殊话语作为大模型的正常回答返回
            if (e.message === 'REQUIRE_USER_PROFILE') {
                await this.storage.saveSession(sessionId, session);
                const requireGreeting = "您好！我是您的私人智能助理。这似乎是我们第一次深入交流，在正式为您服务之前，请详细描述一下：您是谁？您目前所在的行业和日常关注的领域是什么？以及您对我接下来的服务有什么特定的要求或忌讳？\n\n（您的这些设定我将永久牢记并在后续为您量身定制每一次答复）";
                session.messages.push({ role: 'assistant', content: requireGreeting });
                return requireGreeting;
            }
            throw e; // 其他真正因网络断开等问题的错误继续往外抛出
        }

        // 确保将最新组装出的 System Prompt 写入原始 session 数据中，避免丢失
        const systemMsg = contextWindow.find(m => m.role === 'system');
        if (systemMsg) {
            // 剔除可能存在的旧版 system，保证首位是最新的系统设定
            session.messages = session.messages.filter(m => m.role !== 'system');
            session.messages.unshift(systemMsg);
        }

        const originalRefs = new Set(contextWindow);

        // 4. 将纯净的数组抛给 Agent Executor 进行运算，它会在内部自动截断滑窗，并在此数组尾部追加新副产品
        console.log(`[Session Manager] 向智能体投入包含了 System Prompt 强设定的总历史：${contextWindow.length} 条。`);

        let finalAnswer = "";
        try {
            const executeOptions: AgentExecuteOptions = {
                ...options,
                sessionId: sessionId
            };
            finalAnswer = await this.executor.execute(contextWindow, executeOptions);
        } catch (error: any) {
            console.error(`[Session Manager] Executor 执行崩溃:`, error);
            finalAnswer = "系统处理您的请求时遭遇了错误，请稍后再试。";
            contextWindow.push({ role: 'assistant', content: finalAnswer }); // 补上异常回复
        }

        // 5. 将 Agent 在思考途中新生成的 Tool Call 和 回答分离出来同步给持久化字典
        this.syncNewContextToSessionRow(session, contextWindow, originalRefs);

        // 6. 落盘写数据库/JSON 文件
        await this.storage.saveSession(sessionId, session);

        return finalAnswer;
    }

    /**
     * 组装带前置 Prompt 的临时上下文
     */
    private async assembleContextWindow(session: SessionData, isNewSession: boolean): Promise<ChatMessage[]> {
        const assembledWindow: ChatMessage[] = [];

        if (isNewSession) {

            // 从 JSON 提取硬性名字设定
            const userProfile = await globalProfileManager.getUserProfile('default_user');
            const agentProfile = await globalProfileManager.getAgentProfile('default_agent');

            const userName = userProfile.name || '用户(暂未知姓名)';
            const agentName = agentProfile.name || 'AI助理(暂未知姓名)';

            // 1. 尝试动态访问 Mem0 核心记忆拼装 System Prompt 人设
            let coreSystemPrompt = `作为一个极其专业的私人助理，你需要清晰地划清身份边界，避免在使用外部记忆库时产生代词混淆。
【当前会话身份确立】
- 当你在交流中看到用户自称“我”时，请自动将其替换为用户的硬性设定姓名：[ ${userName} ]。
- 当用户在交流中称呼“你”时，指的是你本人，你的硬性设定姓名是：[ ${agentName} ]。

【记忆库交互铁律】
外部记忆图谱是一个没有上下文、无法理解“你/我”是谁的独立盲盒系统。
当你调用任何带有 "存储" 或 "检索" 记忆性质的工具时，**你必须站在上帝般的第三方观察者视角**去构建参数：
❌ 错误搜索/写入参数："我想去北京旅游" 或 "你以后都要用全小写字母"。
✅ 正确搜索/写入参数："[ ${userName} ]计划去北京旅游" 或 "${userName}要求[ ${agentName} ]以后回复需要用全小写字母"。
绝对禁止在调用存储与检索记忆的引擎中出现“我”、“你”、“他”等主观指代词汇！

`;
            let hasCoreMemory = false;

            try {
                // 目前默认获取全局关于该用户的偏好设定（可以通过预先设定的 query 如 'user profiles' 来抽取）
                const memResults = await this.memoryService.searchRelatedMemories({
                    query: "用户的性格、职业、喜好等基本核心画像是什么？",
                    user_id: 'default_user'
                });

                if (memResults && (memResults.results.length > 0 || memResults.relations.length > 0)) {

                    // 去除可能完全跑偏或者太弱关联的记忆（可选过滤），这里直接拼接
                    const facts = memResults.results.map(r => r.memory).join('\n- ');
                    const relations = memResults.relations.map(r => `${r.source} ${r.relationship} ${r.target}`).join('\n- ');
                    if (facts || relations) {
                        coreSystemPrompt += `请依据以下系统为您预先检索到的历史核心画像进行服务：\n`;
                    }
                    if (facts) {
                        hasCoreMemory = true;
                        coreSystemPrompt += `[检索到的关于主人的偏好、身份与事实记忆]:\n- ${facts}\n\n`;
                    }

                    // 2. 检查：如果是新会话，而且连一丢丢 Core Memory 结果都没搜刮出来说明是新号
                    if (isNewSession && !hasCoreMemory) {
                        throw new Error("REQUIRE_USER_PROFILE");
                    }

                    if (relations) {
                        coreSystemPrompt += `[关联的人物物件知识图谱]:\n- ${relations}\n\n`;
                    }
                } else {
                    // 如果后端服务连空壳数组都没给，或者网络异常导致拿不到，也抛锚
                    throw new Error("REQUIRE_USER_PROFILE");
                }
            } catch (e: any) {
                // 将上面主动 throw 的特殊标签冒泡出去，其余的普通错误打印吞吐
                console.error('[Session Manager] 提取 Mem0 记忆失败:', e);
                if (e.message === "REQUIRE_USER_PROFILE") throw e;
            }

            // 如果真的什么也没拉到，塞一个保底兜底人设
            if (!hasCoreMemory) {
                // coreSystemPrompt = "你是私人智能助理，请保持耐心、礼貌、以及极致的技术专业度进行回答。";
            }

            assembledWindow.push({ role: 'system', content: coreSystemPrompt.trim() });
        }
        assembledWindow.push(...session.messages);

        return assembledWindow;
    }

    /**
     * 将 Agent 运行期间向视窗中新写入的历史，安全剥离出并推向原纪录文件
     */
    private syncNewContextToSessionRow(session: SessionData, finishedWindow: ChatMessage[], originalRefs: Set<ChatMessage>) {
        const newProduced = finishedWindow.filter(msg => !originalRefs.has(msg));

        if (newProduced.length > 0) {
            session.messages.push(...newProduced);
            console.log(`[Session Manager] 成功从临时视窗中提取 ${newProduced.length} 条增量记录并归档。`);

            // 提取对话中含金量较高的部分（纯用户和助手的问答）异步上报给 Mem0 以供图谱萃取
            const lastUserMsg = session.messages.slice().reverse().find(m => m.role === 'user');
            const pureAssistantMsgs = newProduced.filter(m => m.role === 'assistant' && !m.tool_calls);

            if (lastUserMsg && pureAssistantMsgs.length > 0) {
                this.memoryService.storeMessages({
                    messages: [lastUserMsg, ...pureAssistantMsgs],
                    user_id: 'default_user'
                }).catch(e => console.error('[Session Manager] 异步存储记忆至 Mem0 失败:', e));
            }
        }
    }
}
