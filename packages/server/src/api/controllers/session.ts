import { Socket } from 'socket.io';
import { ISessionStorage } from '../../core/session/interfaces.js';

export class SessionController {
    constructor(private readonly sessionStorage: ISessionStorage) { }

    public registerEvents(socket: Socket) {
        socket.on('create_session', async (payload: { title?: string }, callback) => {
            const newId = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
            await this.sessionStorage.saveSession(newId, {
                sessionId: newId,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                messages: [],
                rollingSummaries: [],
                metadata: { title: payload?.title || "新的对话" }
            });
            console.log(`[WS API] 显式创建会话: ${newId}`);
            if (callback) callback({ sessionId: newId, title: payload?.title || "新的对话", createdAt: Date.now() });
        });

        socket.on('get_session_list', async (_, callback) => {
            try {
                const ids = await this.sessionStorage.listSessionIds();
                const sessions = [];
                for (const id of ids) {
                    const row = await this.sessionStorage.loadSession(id);
                    if (row) {
                        sessions.push({
                            sessionId: row.sessionId,
                            createdAt: row.createdAt,
                            updatedAt: row.updatedAt,
                            title: row.metadata?.title || '新的聊天',
                            messageCount: row.messages.length
                        });
                    }
                }
                sessions.sort((a, b) => b.updatedAt - a.updatedAt);
                if (callback) callback({ sessions });
            } catch (e) {
                if (callback) callback({ error: 'Failed to fetch sessions' });
            }
        });

        socket.on('get_session_history', async (payload: { sessionId: string }, callback) => {
            try {
                const row = await this.sessionStorage.loadSession(payload.sessionId);
                if (callback) callback({ session: row || null });
            } catch (e) {
                if (callback) callback({ error: 'Failed to fetch history' });
            }
        });

        socket.on('clear_session', async (payload: { sessionId: string }, callback) => {
            try {
                await this.sessionStorage.deleteSession(payload.sessionId);
                if (callback) callback({ success: true });
            } catch (e) {
                if (callback) callback({ success: false });
            }
        });
    }
}
