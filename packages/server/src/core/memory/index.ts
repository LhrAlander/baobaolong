import fetch from 'node-fetch';
import { ChatMessage } from '../llm/types.js';

export interface StoreMemoryParams {
    messages: string | ChatMessage[];
    user_id?: string;
    agent_id?: string;
    run_id?: string;
    metadata?: Record<string, any>;
}

export interface SearchMemoryParams {
    query: string;
    user_id?: string;
    agent_id?: string;
    run_id?: string;
    limit?: number;
    filters?: Record<string, any>;
}

export interface SearchMemoryResult {
    results: Array<{
        id: string;
        memory: string;
        score: number;
    }>;
    relations: Array<{
        source: string;
        relationship: string;
        target: string;
    }>;
}

export class MemoryService {
    private readonly baseUrl: string;

    constructor(baseUrl: string = 'http://127.0.0.1:3899') {
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }

    /**
     * 存储消息并提取为知识图谱和向量记忆
     */
    async storeMessages(params: StoreMemoryParams): Promise<any> {
        try {
            const response = await fetch(`${this.baseUrl}/api/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(params),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to store messages: ${response.status} ${errorText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('[MemoryService] storeMessages 写入失败:', error);
            // 这里吞吐错误避免主流程崩溃
            return null;
        }
    }

    /**
     * 语义搜索相关的记忆和知识图谱关系
     */
    async searchRelatedMemories(params: SearchMemoryParams): Promise<SearchMemoryResult | null> {
        try {
            const response = await fetch(`${this.baseUrl}/api/messages/related`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(params),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to search memory: ${response.status} ${errorText}`);
            }

            const data: any = await response.json();
            if (data && data.status === 'success' && data.results) {
                return data.results;
            }
            return null;
        } catch (error) {
            console.error('[MemoryService] searchRelatedMemories 检索失败:', error);
            return null;
        }
    }
}

// 导出一个全局默认单例供外部快速连接
export const globalMemoryService = new MemoryService();
