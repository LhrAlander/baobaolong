import { Socket } from 'socket.io';
import { IMemoryStorage } from '../../core/memory/interfaces.js';

export class MemoryController {
    constructor(private readonly memoryStorage: IMemoryStorage) { }

    public registerEvents(socket: Socket) {
        socket.on('get_core_memory', async (_, callback) => {
            const userProfile = await this.memoryStorage.get('core', 'user_profile') || "";
            const systemInst = await this.memoryStorage.get('core', 'system_instructions') || "";
            if (callback) callback({
                profile: userProfile,
                systemPrompt: systemInst
            });
        });

        socket.on('update_core_memory', async (payload: { key: string, content: string }, callback) => {
            try {
                await this.memoryStorage.save('core', payload.key, payload.content, false);
                if (callback) callback({ success: true });
            } catch (e) {
                if (callback) callback({ success: false });
            }
        });

        socket.on('search_daily_memory', async (payload: { keyword: string }, callback) => {
            try {
                const results = await this.memoryStorage.search(payload.keyword, 'daily');
                if (callback) callback({ results });
            } catch (e) {
                if (callback) callback({ results: [] });
            }
        });
    }
}
