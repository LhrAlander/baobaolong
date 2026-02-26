import { ChatMessage } from '../llm/types.js';

/**
 * 标准化的会话数据接口 (屏蔽底层差异)
 */
export interface SessionData {
    sessionId: string;
    createdAt: number;
    updatedAt: number;
    messages: ChatMessage[];  // 包含 assistant, user, system, tool的完整阵列

    // 🔥 【性能杀器】滚动多级摘要链 (Rolling Summaries)
    // 面对可能重叠上万条历史的长会话，每次只压缩定长条数，并将之前已经压缩好的“上片”一并作为给 LLM 的入参，
    // 从而形成一段段不断被定格的历史脉络，极大地节省 Token 并保证万字长征不丢失伏笔。
    rollingSummaries?: Array<{
        content: string;    // 本次滚动窗口压缩出的这段历史梗概
        startIndex: number; // 这段梗概涵盖的具体消息下标起
        endIndex: number;   // 这段梗概涵盖的具体消息下标止
    }>;

    metadata?: Record<string, any>; // 预留存放用户的登录态信息等拓展字段
}

/**
 * 跨介质的上下文存储接口
 * 实现者可以是：FileSessionAdapter(JSON), SQLiteSessionAdapter, RedisSessionAdapter
 */
export interface ISessionStorage {
    /**
     * 根据会话 ID 拉取完整的上下文存储结构
     */
    loadSession(sessionId: string): Promise<SessionData | null>;

    /**
     * 覆盖 / 更新保存上下文结构
     */
    saveSession(sessionId: string, data: SessionData): Promise<void>;

    /**
     * 彻底清理某个闲置过期的会话
     */
    deleteSession(sessionId: string): Promise<void>;

    /**
     * 辅助方法：获取列表用于侧边栏之类的展示
     */
    listSessionIds(): Promise<string[]>;
}
