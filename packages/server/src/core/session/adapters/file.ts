import * as fs from 'fs';
import * as path from 'path';
import { ISessionStorage, SessionData } from '../interfaces.js';

export class FileSessionAdapter implements ISessionStorage {
    private readonly sessionDir: string;

    constructor(basePath: string = path.join(process.cwd(), 'data', 'sessions')) {
        this.sessionDir = basePath;
        if (!fs.existsSync(this.sessionDir)) {
            fs.mkdirSync(this.sessionDir, { recursive: true });
        }
    }

    private getFilePath(sessionId: string): string {
        // 使用一个极简的规范化防止跨目录攻击注入
        const safeSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '');
        return path.join(this.sessionDir, `${safeSessionId}.json`);
    }

    public async loadSession(sessionId: string): Promise<SessionData | null> {
        const filePath = this.getFilePath(sessionId);
        if (fs.existsSync(filePath)) {
            try {
                const fileContent = await fs.promises.readFile(filePath, 'utf-8');
                return JSON.parse(fileContent) as SessionData;
            } catch (error) {
                console.error(`[FileSessionAdapter] 从磁盘解析会话 ${sessionId} 失败:`, error);
                return null;
            }
        }
        return null;
    }

    public async saveSession(sessionId: string, data: SessionData): Promise<void> {
        const filePath = this.getFilePath(sessionId);
        try {
            // 每次直接全量覆写，因为底层 JSON 在前期测试中即便是 20MB 也只是一瞬间的 I/O。
            await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
        } catch (error) {
            console.error(`[FileSessionAdapter] 写入保存会话 ${sessionId} 失败:`, error);
        }
    }

    public async deleteSession(sessionId: string): Promise<void> {
        const filePath = this.getFilePath(sessionId);
        if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
        }
    }

    public async listSessionIds(): Promise<string[]> {
        if (!fs.existsSync(this.sessionDir)) {
            return [];
        }

        const files = await fs.promises.readdir(this.sessionDir);
        return files
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace('.json', ''));
    }
}
