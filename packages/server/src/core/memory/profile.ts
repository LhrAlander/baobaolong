import * as fs from 'fs';
import * as path from 'path';

export interface UserProfile {
    name?: string;
}

export interface AgentProfile {
    name?: string;
}

export class ProfileManager {
    private dir: string;

    constructor() {
        this.dir = path.join(process.cwd(), 'data', 'profiles');
        if (!fs.existsSync(this.dir)) {
            fs.mkdirSync(this.dir, { recursive: true });
        }
    }

    public async getUserProfile(userId: string): Promise<UserProfile> {
        const filePath = path.join(this.dir, `user_${userId}.json`);
        if (fs.existsSync(filePath)) {
            try {
                return JSON.parse(await fs.promises.readFile(filePath, 'utf-8'));
            } catch (e) {
                console.error(`解析用户 ${userId} 的 Profile JSON 失败:`, e);
            }
        }
        return {};
    }

    public async getAgentProfile(agentId: string): Promise<AgentProfile> {
        const filePath = path.join(this.dir, `agent_${agentId}.json`);
        if (fs.existsSync(filePath)) {
            try {
                return JSON.parse(await fs.promises.readFile(filePath, 'utf-8'));
            } catch (e) {
                console.error(`解析助理 ${agentId} 的 Profile JSON 失败:`, e);
            }
        }
        return {};
    }

    public async saveUserProfile(userId: string, profile: UserProfile): Promise<void> {
        const filePath = path.join(this.dir, `user_${userId}.json`);
        await fs.promises.writeFile(filePath, JSON.stringify(profile, null, 2), 'utf-8');
    }

    public async saveAgentProfile(agentId: string, profile: AgentProfile): Promise<void> {
        const filePath = path.join(this.dir, `agent_${agentId}.json`);
        await fs.promises.writeFile(filePath, JSON.stringify(profile, null, 2), 'utf-8');
    }
}

export const globalProfileManager = new ProfileManager();
