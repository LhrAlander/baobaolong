// 优先加载环境变量
import './config/env.js';
import { bootstrapApp } from './app.js';
import { LLMFactory } from './core/llm/factory.js';
import { GeminiProvider } from './providers/llm/gemini/index.js';
import { OllamaProvider } from './providers/llm/ollama/index.js';
import { GLMProvider } from './providers/llm/glm/index.js';
import { globalSkillRegistry } from './core/skills/registry.js';
import { weatherSkill } from './skills/weather/index.js';
import { timeSkill } from './skills/time/index.js';
import { ChatMessage } from './core/llm/types.js';
import { AgentExecutor } from './core/agent/executor.js';
import { MCPManager } from './core/mcp/manager.js';
import * as path from 'path';

async function main() {
    try {
        const app = await bootstrapApp();

        // =========== 初始化基础架构 ===========
        LLMFactory.register('gemini', new GeminiProvider());
        LLMFactory.register('glm', new GLMProvider());

        // =========== 测试 Tool Call (Skill) 体系 ===========
        console.log('\n--- 开始 Tool Call / Skill 框架测试 ---');
        globalSkillRegistry.register(weatherSkill);
        globalSkillRegistry.register(timeSkill);

        // --- 🎉 第八阶段: MCP 动态配置发现与技能接管 ---
        console.log('[系统] 正在读取 mcp.config.json 并在本地组装远端技能桥接层...');
        const mcpManager = new MCPManager();
        const mcpSkillsConfigured = await mcpManager.loadFromConfig(path.join(process.cwd(), 'mcp.config.json'));

        mcpSkillsConfigured.forEach(skill => globalSkillRegistry.register(skill));

        const assistant = LLMFactory.get('glm');

        let messages: ChatMessage[] = [
            { role: 'user', content: '告诉我现在目录下的文件或者文件夹，只要第一层不深入，并告诉我是否存在可执行文件' }
        ];

        console.log(`[👤 User]: ${messages[0].content}`);

        // 组装顶级 Agent 调度器 (控制中枢)
        const agent = new AgentExecutor(assistant, globalSkillRegistry);

        // 【核心大杀器】直接执行无限智能循环，业务层完全脱离“发夹、塞回历史等脏活”
        const finalAnswer = await agent.execute(messages, {
            // maxContextLengthThreshold: 50 // 如果在这里设为50，即可观察长尾截断护盾激活
        });

        console.log(`\n[🤖 最终回复]:`);
        console.log(finalAnswer);
        console.log('\n--- Agent Executor 框架跑通测试完毕 ---');
        // =====================================

    } catch (error) {
        console.error('❌ 服务端运行异常:', error);
        process.exit(1);
    }
}

main();
