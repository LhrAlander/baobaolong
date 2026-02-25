import * as fs from 'fs';
import * as path from 'path';
import { MCP2SkillAdapter } from './client.js';
import { ISkill } from '../skills/types.js';

export interface MCPServerConfig {
    command: string;
    args: string[];
    env?: Record<string, string>;
}

export interface MCPsConfigRoot {
    mcpServers: Record<string, MCPServerConfig>;
}

export class MCPManager {
    private adapters: MCP2SkillAdapter[] = [];

    /**
     * 根据本地配置文件动态装载所有声明的 MCP Server
     * @param configPath 绝对路径
     * @returns 聚合所有 Adapter 在远端拉取桥接完的综合 ISkill[] 数组
     */
    public async loadFromConfig(configPath: string): Promise<ISkill[]> {
        if (!fs.existsSync(configPath)) {
            console.warn(`[MCPManager] 配置文件未找到，将跳过 MCP 动态挂载: ${configPath}`);
            return [];
        }

        try {
            const raw = fs.readFileSync(configPath, 'utf8');
            const configData: MCPsConfigRoot = JSON.parse(raw);
            const servers = configData.mcpServers || {};

            let allConfiguredSkills: ISkill[] = [];

            for (const [serverName, srvConfig] of Object.entries(servers)) {
                console.log(`[MCPManager] 解析到远端插件节点: ${serverName}`);

                const adapter = new MCP2SkillAdapter(
                    serverName,
                    srvConfig.command,
                    srvConfig.args || [],
                    srvConfig.env
                );

                this.adapters.push(adapter);

                try {
                    await adapter.connect();
                    const skills = await adapter.getSkills();
                    allConfiguredSkills = allConfiguredSkills.concat(skills);
                } catch (err) {
                    console.error(`[MCPManager] 挂载节点 ${serverName} 失败，已跳过。报错信息:`, err);
                }
            }

            console.log(`[MCPManager] 总计成功从配置文件反序列化了 ${allConfiguredSkills.length} 个人工智能动作`);
            return allConfiguredSkills;

        } catch (error) {
            console.error(`[MCPManager] 解析配置文件失败: ${configPath}`, error);
            return [];
        }
    }
}
