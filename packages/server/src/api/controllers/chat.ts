import { Socket } from 'socket.io';
import { SessionManager } from '../../core/session/manager.js';

export class ChatController {
    constructor(private readonly sessionManager: SessionManager) { }

    public registerEvents(socket: Socket) {
        socket.on('chat_message_stream', async (payload: { sessionId: string; content: string }) => {
            const { sessionId, content } = payload;
            if (!sessionId || !content) return;

            console.log(`[WS API] 收到聊天消息 -> SessionId: ${sessionId}, Content: ${content.substring(0, 50)}...`);

            try {
                // TODO: 下一步会改造 AgentExecutor 支持 'chat_reply_chunk' 推送打字机
                const finalAnswer = await this.sessionManager.handleMessage(sessionId, content);

                socket.emit('chat_reply_done', {
                    sessionId,
                    role: 'assistant',
                    content: finalAnswer
                });

            } catch (error: any) {
                console.error(`[WS API] 对话执行失败:`, error);
                socket.emit('chat_error', { sessionId, message: error.message || 'Server Internal Error' });
            }
        });
    }
}
