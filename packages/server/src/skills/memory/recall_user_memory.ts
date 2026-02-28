import { ISkill } from '../../core/skills/types.js';
import { globalMemoryService } from '../../core/memory/index.js';

export const recallUserMemorySkill: ISkill = {
    name: 'recall_user_memory',
    description: '【全局冷库检索 / 备选项】🚨强制底线规则：在调用本技能之前，你必须**先**调用 `local_session_recall` 技能检索当前会话。只有当那个技能明确返回没有结果，并建议你调用本技能时，你才能使用本技能去探寻用户跨会话的长期图谱、喜好、设定等。绝对禁止在未检索当前会话的情况下直接跳过来盲目查冷库！',
    parameters: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: '你希望去长期记忆提取中心搜索的语义句或疑问句，比如“用户的开发语言偏好是什么？” 或 “我们上周讨论的业务架构方案是什么”'
            }
        },
        required: ['query']
    },
    execute: async (args: any) => {
        try {
            const { query } = args;

            if (!query) {
                return '缺少必填参数 query';
            }

            console.log(`[记忆中枢] LLM 主动探测全局冷存储图谱: "${query}" ...`);

            const memResults = await globalMemoryService.searchRelatedMemories({
                query: query,
                user_id: 'default_user'
            });

            if (!memResults || (memResults.results.length === 0 && memResults.relations.length === 0)) {
                return '检索结果为空：冷存储图谱和全局记忆中均未发现与此相关的情报。您可以停止盲目搜索了。';
            }

            let resultStr = '[以下是根据您搜索的关键词，从记忆库提取出的长期情报]\n';

            if (memResults.results.length > 0) {
                resultStr += `【核心事实与事件回忆】：\n- ${memResults.results.map(r => r.memory).join('\n- ')}\n`;
            }

            if (memResults.relations.length > 0) {
                resultStr += `【关联的知识图谱实体】：\n- ${memResults.relations.map(r => `${r.source} ${r.relationship} ${r.target}`).join('\n- ')}\n`;
            }

            return resultStr;

        } catch (error: any) {
            console.error('[记忆中枢] 回忆全局冷存储技能执行错误:', error);
            return `后台图谱数据库检索失败: ${error.message}`;
        }
    }
};
