import { ISkill } from '../../core/skills/types.js';
import { globalMemoryService } from '../../core/memory/index.js';
import { globalProfileManager } from '../../core/memory/profile.js';

export const memorizeUserFactSkill: ISkill = {
    name: 'memorize_user_fact',
    description: `当你在一场对话中，察觉到用户透露了关于他个人的设定、规矩、或者对你（助理）提出了特定的长期要求时，请调用本技能。
    🚨【注意分工】：
    - 如果用户明确告诉你他的“名字/昵称”，请将 factType 设为 'user_name'。
    - 如果用户明确给你（助理）起了一个“名字/代号”，请将 factType 设为 'agent_name'。
    - 如果是除了名字之外的其他所有事实、偏好、忌讳、纪律要求，请将 factType 设为 'general_memory'。
    
    ⚠️【极度重要】：由于 general_memory 记忆将交由专门的知识图谱引擎进行孤立解析，你必须遵循“绝对第三方视角的客观描述”原则。
    1. 绝对禁止在 content 中使用主观代词（如“我”、“你”、“他”）。必须使用双方在会话中约定的真实名字或“用户”、“助理”代替。
    2. 本操作在后台静默完成，不影响你的正常回复。`,
    parameters: {
        type: 'object',
        properties: {
            factType: {
                type: 'string',
                enum: ['user_name', 'agent_name', 'general_memory'],
                description: '你要存储的记忆类型分类。如果是名字则填写对应枚举，其余事实或规则一律填 general_memory。'
            },
            content: {
                type: 'string',
                description: `你要记录的内容。
                - 如果 factType 是 user_name 或 agent_name，这里只需要填写裸的【名字字符串】即可（如 "爆爆龙" 或 "贾不了"）。
                - 如果 factType 是 general_memory，则这里填写提炼出的客观陈述句（禁止代词）。例如：“助理的名字是贾不了，用户的昵称是爆爆龙，助理是用户的私人助理和密友”。`
            }
        },
        required: ['factType', 'content']
    },
    execute: async (args: any) => {
        const { factType, content } = args;

        if (!factType || !content) {
            return '缺少必填参数 factType 或 content';
        }

        try {
            if (factType === 'user_name') {
                const profile = await globalProfileManager.getUserProfile('default_user');
                profile.name = content;
                await globalProfileManager.saveUserProfile('default_user', profile);
                console.log(`[记忆中枢] 已将用户名固化为: ${content}`);
            } else if (factType === 'agent_name') {
                const profile = await globalProfileManager.getAgentProfile('default_agent');
                profile.name = content;
                await globalProfileManager.saveAgentProfile('default_agent', profile);
                console.log(`[记忆中枢] 已将助理名固化为: ${content}`);
            } else {
                // 异步丢入后台队列执行长时存储与知识图谱结构化
                globalMemoryService.storeMessages({
                    messages: [{ role: 'assistant', content: content }],
                    user_id: 'default_user'
                }).then(() => {
                    console.log(`[记忆中枢] 已在后台成功接管并凝练冷存储了事实: "${content.substring(0, 30)}..."`);
                }).catch(e => {
                    console.error('[记忆中枢] 后台异步存储错误:', e);
                });
            }

            return '记忆写入执行完毕！请立刻根据上下文内容自然地继续回复用户，不要专门播报“我已经记住了”，请保持聊天连贯性。';
        } catch (error: any) {
            return `记忆存储失败: ${error.message}`;
        }
    }
};
