import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ISkill } from '../../core/skills/types.js';

export class MCP2SkillAdapter {
    private client: Client;

    /**
     * 构造函数：基于 StdIO 的进程间通信 MCP Client
     */
    constructor(
        private readonly serverName: string,
        private readonly command: string,
        private readonly args: string[] = [],
        private readonly env?: Record<string, string> // 支持透传局部环境变量
    ) {
        this.client = new Client(
            { name: 'baobaolong-agent', version: '1.0.0' },
            { capabilities: {} }
        );
    }

    /**
     * 启动子进程并连入该 MCP Server
     */
    public async connect(): Promise<void> {
        // 如果给定了独立的 env，我们在继承主进程 process.env 的基础上合并自定义的局部变量
        const transportEnv = this.env ? { ...process.env, ...this.env } : undefined;

        const transport = new StdioClientTransport({
            command: this.command,
            args: this.args,
            env: transportEnv as Record<string, string>, // 环境变量透传给底层 SDK 拉起应用
        });

        await this.client.connect(transport);
        console.log(`[MCP Adapter] 已成功连接至远端 Server: ${this.serverName}`);
    }

    /**
     * 获取远程的工具列表，并在本地转换为兼容系统中 AgentExecutor 认得的 ISkill 格式
     */
    public async getSkills(): Promise<ISkill[]> {
        const listResponse = await this.client.listTools();
        const mcpTools = listResponse.tools;
        console.log(`[MCP Adapter] 从 ${this.serverName} 探测到 ${mcpTools.length} 个原生工具`);

        return mcpTools.map((mcpTool) => {
            // 1. 无缝桥接映射：MCP 给过来的 name, description, inputSchema 完美的对应我们的规范
            const skill: ISkill = {
                name: `${this.serverName}_${mcpTool.name}`, // 防止不同 MCP 加载同名方法冲突，加前缀
                description: mcpTool.description || '',
                parameters: mcpTool.inputSchema as any,

                // 2. 闭包代执行：真正的网络执行在这里拦截
                execute: async (args: any) => {
                    console.log(`[MCP Runner] 准备请求 ${this.serverName} 执行远端动作 ${mcpTool.name} ...`);
                    const response = await this.client.callTool({
                        name: mcpTool.name,
                        arguments: args
                    });

                    // 提取 MCP 响应体里所有文本段落
                    if (response.content && Array.isArray(response.content)) {
                        return response.content
                            .filter(c => c.type === 'text')
                            // @ts-ignore
                            .map(c => c.text)
                            .join('\n');
                    }
                    return JSON.stringify(response);
                }
            };

            return skill;
        });
    }
}
