import { io, Socket } from 'socket.io-client';

// Define expected interfaces based on backend server implementation
export interface Session {
    sessionId: string;
    createdAt: number;
    updatedAt: number;
    title: string;
    messageCount: number;
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
}

export interface SessionHistory {
    sessionId: string;
    createdAt: number;
    updatedAt: number;
    messages: ChatMessage[];
    title?: string;
}

class SocketService {
    private socket: Socket;

    constructor() {
        // Assuming backend server is running on localhost:3000 by default. Adjust if needed.
        this.socket = io('http://localhost:3000', {
            autoConnect: true,
        });

        this.socket.on('connect', () => {
            console.log('Connected to WebSocket server:', this.socket.id);
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from WebSocket server');
        });
    }

    getSocket(): Socket {
        return this.socket;
    }

    // Session API Wrappers
    createSession(title?: string): Promise<Session> {
        return new Promise((resolve) => {
            this.socket.emit('create_session', { title }, (response: Session) => {
                resolve(response);
            });
        });
    }

    getSessionList(): Promise<Session[]> {
        return new Promise((resolve, reject) => {
            this.socket.emit('get_session_list', {}, (response: { sessions?: Session[], error?: string }) => {
                if (response.error) reject(new Error(response.error));
                else resolve(response.sessions || []);
            });
        });
    }

    getSessionHistory(sessionId: string): Promise<SessionHistory | null> {
        return new Promise((resolve, reject) => {
            this.socket.emit('get_session_history', { sessionId }, (response: { session?: SessionHistory, error?: string }) => {
                if (response.error) reject(new Error(response.error));
                else resolve(response.session || null);
            });
        });
    }

    // Optional: clear session
    clearSession(sessionId: string): Promise<boolean> {
        return new Promise((resolve) => {
            this.socket.emit('clear_session', { sessionId }, (response: { success: boolean }) => {
                resolve(response.success);
            });
        });
    }

    // Chat API
    sendMessageStream(sessionId: string, content: string) {
        this.socket.emit('chat_message_stream', { sessionId, content });
    }

    // Listeners
    onChatReplyDone(callback: (payload: { sessionId: string, role: string, content: string }) => void) {
        this.socket.on('chat_reply_done', callback);
        return () => this.socket.off('chat_reply_done', callback);
    }

    onChatError(callback: (payload: { sessionId: string, message: string }) => void) {
        this.socket.on('chat_error', callback);
        return () => this.socket.off('chat_error', callback);
    }
}

export const socketService = new SocketService();
