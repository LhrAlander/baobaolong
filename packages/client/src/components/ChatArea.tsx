import React, { useEffect, useState, useRef } from 'react';
import { Menu, User, Bot, Sun, Moon } from 'lucide-react';
import { ChatInput } from './ChatInput';
import { socketService, type ChatMessage } from '../services/socket';
import './ChatArea.css';

interface ChatAreaProps {
    sessionId: string;
    onToggleSidebar: () => void;
    isSidebarOpen: boolean;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ sessionId, onToggleSidebar, isSidebarOpen }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(t => t === 'dark' ? 'light' : 'dark');
    };

    useEffect(() => {
        // Scroll to bottom
        scrollToBottom();
    }, [messages, isTyping]);

    useEffect(() => {
        if (!sessionId) return;

        // Fetch History
        const fetchHistory = async () => {
            try {
                const history = await socketService.getSessionHistory(sessionId);
                if (history) {
                    setMessages(history.messages);
                }
            } catch (err) {
                console.error("Failed to load history", err);
            }
        };
        fetchHistory();

        // Listeners
        const offReplyDone = socketService.onChatReplyDone((payload) => {
            if (payload.sessionId === sessionId) {
                setMessages(prev => [...prev, { role: 'assistant', content: payload.content }]);
                setIsTyping(false);
            }
        });

        const offChatError = socketService.onChatError((payload) => {
            if (payload.sessionId === sessionId) {
                setIsTyping(false);
                // Error handling Toast could be added here
                console.error("Chat error:", payload.message);
            }
        });

        return () => {
            offReplyDone();
            offChatError();
        };
    }, [sessionId]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleSendMessage = (text: string) => {
        if (!text.trim() || !sessionId) return;

        // Optimistic UI update
        setMessages(prev => [...prev, { role: 'user', content: text }]);
        socketService.sendMessageStream(sessionId, text);
        setIsTyping(true);
    };

    return (
        <div className="chat-area">
            <header className="chat-header">
                {!isSidebarOpen && (
                    <button className="icon-btn header-menu-btn" onClick={onToggleSidebar}>
                        <Menu size={20} />
                    </button>
                )}
                <div className="model-selector">
                    <h2>BaobaoLong</h2>
                </div>
                <div style={{ flex: 1 }} />
                <button className="icon-btn" onClick={toggleTheme} title="Toggle Theme">
                    {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                </button>
            </header>

            <div className="messages-container">
                {messages.length === 0 ? (
                    <div className="empty-chat-hero animate-fade-in">
                        <div className="hero-icon">
                            <span className="sparkle">✨</span>
                        </div>
                        <h1>你好，我是宝宝龙</h1>
                        <p>准备好开始一段对话吧</p>
                    </div>
                ) : (
                    <div className="messages-list">
                        {messages.filter(msg => msg.role !== 'tool').map((msg, index) => (
                            <div key={index} className={`message-row ${msg.role}`}>
                                <div className="avatar">
                                    {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
                                </div>
                                <div className="message-content animate-fade-in">
                                    {/* Basic text rendering. Could use react-markdown here for richness */}
                                    <div className="message-bubble">
                                        {msg.content.split('\\n').map((line, i) => (
                                            <p key={i}>{line}</p>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {isTyping && (
                            <div className="message-row assistant typing-indicator">
                                <div className="avatar">
                                    <Bot size={20} />
                                </div>
                                <div className="message-content">
                                    <div className="spinner-dots">
                                        <div className="dot"></div>
                                        <div className="dot"></div>
                                        <div className="dot"></div>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>

            <div className="chat-input-wrapper">
                <ChatInput onSend={handleSendMessage} disabled={isTyping} />
                <div className="disclaimer">
                    宝宝龙可能会提供不准确的信息，请独立判断。
                </div>
            </div>
        </div>
    );
};
