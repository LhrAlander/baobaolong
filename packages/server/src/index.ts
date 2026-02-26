// 优先加载环境变量
import './config/env.js';
import { LLMFactory } from './core/llm/factory.js';
import { GeminiProvider } from './providers/llm/gemini/index.js';
import { GLMProvider } from './providers/llm/glm/index.js';
import { globalSkillRegistry } from './core/skills/registry.js';
import { memorizeCoreFactSkill, recallPastContextSkill, memoryAdapter } from './skills/memory/index.js';
import { ChatMessage } from './core/llm/types.js';
import { AgentExecutor } from './core/agent/executor.js';
import { MCPManager } from './core/mcp/manager.js';
import { MemorySummarizer } from './core/memory/summarizer.js';
import { FileSessionAdapter } from './core/session/adapters/file.js';
import { SessionManager } from './core/session/manager.js';
import * as path from 'path';

import { setupWebSocketServer } from './api/ws.js';
import { createServer } from 'http';

async function main() {
    try {
        LLMFactory.register('gemini', new GeminiProvider());
        LLMFactory.register('glm', new GLMProvider());

        globalSkillRegistry.register(memorizeCoreFactSkill);
        globalSkillRegistry.register(recallPastContextSkill);

        console.log('[系统] 正在读取 mcp.config.json 并在本地组装远端技能桥接层...');
        const mcpManager = new MCPManager();
        const mcpSkillsConfigured = await mcpManager.loadFromConfig(path.join(process.cwd(), 'mcp.config.json'));

        mcpSkillsConfigured.forEach(skill => globalSkillRegistry.register(skill));

        const assistant = LLMFactory.get('glm');

        const summarizer = new MemorySummarizer(assistant, memoryAdapter);
        const agent = new AgentExecutor(assistant, globalSkillRegistry, summarizer);

        const sessionAdapter = new FileSessionAdapter();
        const sessionManager = new SessionManager(sessionAdapter, agent, summarizer, memoryAdapter);

        // --- 第十一阶段: 启动 HTTP 与 WebSocket 混合网关 ---
        const httpServer = createServer((req, res) => {
            res.writeHead(200);
            res.end('Antigravity Private Assistant API Server is running...\n');
        });

        setupWebSocketServer(httpServer, sessionManager, sessionAdapter, memoryAdapter);

        const PORT = process.env.PORT || 3000;
        httpServer.listen(PORT, () => {
            console.log(`\n🚀 [Server] 私人助手服务端内核已全速启动！`);
            console.log(`📡 [Network] HTTP & WebSocket 监听端口: http://localhost:${PORT}\n`);
        });

    } catch (error) {
        console.error('❌ 服务端运行异常:', error);
        process.exit(1);
    }
}

main();
