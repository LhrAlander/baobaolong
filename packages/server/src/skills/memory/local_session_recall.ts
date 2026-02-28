import { ISkill } from '../../core/skills/types.js';
import { FileSessionAdapter } from '../../core/session/adapters/file.js';
import { Ollama } from 'ollama';

// 采用 npm 包的默认余弦函数或者简单手写一个 (A·B) / (|A|*|B|)
function cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

const ollama = new Ollama({ host: 'http://127.0.0.1:11434' });
const EMBEDDING_MODEL = 'hf.co/Qwen/Qwen3-Embedding-0.6B-GGUF:F16';

export const recallSessionContextSkill: ISkill = {
    name: 'recall_session_context',
    description: '【记忆检索第一步/必选项】当你需要回溯或检索任何记忆、历史设定、聊过的细节时，你必须**优先且首先**调用本技能来查阅当前会话历史。注意，这仅仅能捞取本次聊过的内容；如果本技能查无结果，它自然会指导你去调用全局冷存储找寻。绝对禁止跳过本技能直接去查冷存储！',
    parameters: {
        type: 'object',
        properties: {
            keywords: {
                type: 'array',
                description: '你希望去原会话中检索的中心语义词组，例如 ["用户需求", "预算报价", "部署架构"]',
                items: { type: 'string' }
            },
            retriveCount: {
                type: 'number',
                description: '对于每一个独立 keyword 期望召回的相关对话记录条数，建议 5 到 10 条'
            }
        },
        required: ['keywords', 'retriveCount']
    },
    execute: async (args: any) => {
        try {
            // 目前由于架构上不能从全局获取 sessionId，必须由框架传递或者写死一个机制
            // 但用户要求“根据 sessionId 去找本地存储”，因此假设外部（如下游包装层）已注入
            const { keywords, retriveCount, __sessionId } = args;

            if (!__sessionId) {
                return '检索失败：环境上下文中缺少 __sessionId 信息';
            }

            const adapter = new FileSessionAdapter();
            const sessionData = await adapter.loadSession(__sessionId);

            if (!sessionData || sessionData.messages.length === 0) {
                return '检索结果为空：当前会话没有发现任何历史消息';
            }

            console.log(`[回忆技能] 开始提取超长会话(${__sessionId})特征，准备 Embedding ${sessionData.messages.length} 条数据`);

            // 1. 生成语料库的 Embedding 向量列表 (耗时操作，可考虑缓存，此处为了简单每次计算)
            // 将每条 message 的内容化作向量
            const corpusEmbeddings = await Promise.all(
                sessionData.messages.map(async (msg, index) => {
                    const text = `[${msg.role}] ${msg.content || JSON.stringify(msg.tool_calls || '')}`;
                    try {
                        const response = await ollama.embeddings({
                            model: EMBEDDING_MODEL,
                            prompt: text
                        });
                        return { index, message: msg, vector: response.embedding };
                    } catch (e) {
                        // 抛空或零向量忽略
                        return { index, message: msg, vector: [] };
                    }
                })
            );

            // 过滤有效向量
            const validCorpus = corpusEmbeddings.filter(item => item.vector && item.vector.length > 0);

            let searchResults: Record<string, any> = {};

            // 2. 遍历大模型提供的多个探测关键字
            for (const keyword of keywords) {
                console.log(`[回忆技能] 正在使用 Qwen Embedding 为特征关键字计算向量: "${keyword}" ...`);

                try {
                    const keywordRes = await ollama.embeddings({
                        model: EMBEDDING_MODEL,
                        prompt: keyword
                    });
                    const keywordVector = keywordRes.embedding;

                    // 计算与预料库中所有句子的相似度
                    const scoredList = validCorpus.map(item => ({
                        message: item.message,
                        score: cosineSimilarity(keywordVector, item.vector)
                    }));

                    // 排序并捞出最相似的前 N 条记录
                    scoredList.sort((a, b) => b.score - a.score);
                    const topResults = scoredList.slice(0, Number(retriveCount) || 5);

                    searchResults[keyword] = topResults.map(r => r.message);
                } catch (e: any) {
                    console.error(`[回忆技能] 提取查询关键字 "${keyword}" 的向量失败:`, e.message);
                    searchResults[keyword] = [];
                }
            }

            // 3. 判断是否什么都没搜出来，给予 LLM 明确诱导以便进行下钻查询
            let hasAnyResult = false;
            for (const records of Object.values(searchResults)) {
                if (records && records.length > 0) {
                    hasAnyResult = true;
                    break;
                }
            }

            if (!hasAnyResult) {
                return '检索结果为空：当前会话历史中没有提及过这个主题。这可能是因为相关设定和聊天记录发生在【以前的旧会话】中。请立刻调用 `recall_user_memory` (全局记忆捞取技能) 去冷存储或长期图谱中搜索。';
            }

            return searchResults;

        } catch (error: any) {
            console.error('[回忆技能] 发生灾难性错误:', error);
            return { error: `执行检索时发生报错: ${error.message}` };
        }
    }
};
