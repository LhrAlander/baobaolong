import { Server, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { SessionManager } from '../core/session/manager.js';
import { ISessionStorage } from '../core/session/interfaces.js';
import { ChatController } from './controllers/chat.js';
import { SessionController } from './controllers/session.js';

/**
 * 启动 WebSocket 服务器，向前端暴露系统核心能力
 */
export function setupWebSocketServer(
    httpServer: HttpServer,
    sessionManager: SessionManager,
    sessionStorage: ISessionStorage
) {
    // 允许跨域以便分离的前端方便调试
    const io = new Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    // 实例化各业务领域的 Controller
    const chatController = new ChatController(sessionManager);
    const sessionController = new SessionController(sessionStorage);

    io.on('connection', (socket: Socket) => {
        console.log(`[WebSocket] 新的客户终端已连接: ${socket.id}`);

        // 分发注册各模块的具体事件与路由
        chatController.registerEvents(socket);
        sessionController.registerEvents(socket);


        socket.on('disconnect', () => {
            console.log(`[WebSocket] 客户终端连接断开: ${socket.id}`);
        });
    });

    console.log('[WebSocket] Socket.IO 服务已挂载并开始监听。');
}
