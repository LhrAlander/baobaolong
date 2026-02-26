import { MarkdownMemoryAdapter } from "../../core/memory/adapters/markdown";
import { ISkill } from "../../core/skills/types";

// 为了防止重复构造读盘对象，我们将 MemoryAdapter 作为单例在这里初始化提供给周边技能使用
export const memoryAdapter = new MarkdownMemoryAdapter();

export const memorizeCoreFactSkill: ISkill = {
    name: 'memorize_core_fact',
    description: '当你在对话中了解到了用户的姓名、长期喜好、或者是让你绝对不能触碰的铁律时，必须立刻调用此工具将这些高价值碎片转存。',
    parameters: {
        type: 'object',
        properties: {
            fact_content: {
                type: 'string',
                description: '这段长期事实的简短描述，例如："用户喜欢喝不加糖的拿铁" 或 "以后称呼用户为林先生"'
            }
        },
        required: ['fact_content']
    },
    execute: async (args: { fact_content: string }) => {
        try {
            // core 级别的档案我们先固定存放到 user_profile 身上并永远选择 append 追加模式
            await memoryAdapter.save('core', 'user_profile', `- ${args.fact_content}`, true);
            return `[系统提示] 成功保存核心事实：${args.fact_content}`;
        } catch (e: any) {
            return `[核心记忆故障] 写入 user_profile 失败: ${e.message}`;
        }
    }
};

export const recallPastContextSkill: ISkill = {
    name: 'recall_past_context',
    description: '当你发现用户在询问过去某一天或者某一个历史项目的背景，并且当前记录中没有时，调用本工具搜索过去的备份知识和归档记忆。',
    parameters: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: '搜索的模糊意图或关键字，如 "过去做的那个房产项目" 或者 "2月26日的记录"'
            }
        },
        required: ['query']
    },
    execute: async (args: { query: string }) => {
        try {
            const results = await memoryAdapter.search(args.query);
            if (results.length === 0) {
                return `未在记忆库中找到跟 "${args.query}" 相关的历史记载。`;
            }
            return `[历史追溯网络返回以下片段]:\n${results.join('\n\n')}\n(请根据上面的背景自行加工再回复用户)`;
        } catch (e: any) {
            return `[历史追溯网络故障]: ${e.message}`;
        }
    }
};
