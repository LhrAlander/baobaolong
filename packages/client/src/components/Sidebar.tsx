import React from 'react';
import { Menu, Plus, MessageSquare, MoreVertical, Trash2 } from 'lucide-react';
import type { Session } from '../services/socket';
import './Sidebar.css';

interface SidebarProps {
    sessions: Session[];
    activeSessionId: string | null;
    onSelectSession: (id: string) => void;
    onCreateSession: () => void;
    isOpen: boolean;
    onToggle: () => void;
    onDeleteSession: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
    sessions,
    activeSessionId,
    onSelectSession,
    onCreateSession,
    isOpen,
    onToggle,
    onDeleteSession
}) => {
    return (
        <>
            <div className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
                <div className="sidebar-header">
                    <button className="icon-btn toggle-btn" onClick={onToggle}>
                        <Menu size={20} />
                    </button>
                </div>

                <div className="sidebar-new-chat">
                    <button className="new-chat-btn" onClick={onCreateSession}>
                        <Plus size={20} />
                        {isOpen && <span>New chat</span>}
                    </button>
                </div>

                {isOpen && (
                    <div className="sidebar-content animate-fade-in">
                        <div className="section-title">Recent</div>
                        <div className="session-list">
                            {sessions.map(session => (
                                <button
                                    key={session.sessionId}
                                    className={`session-item ${activeSessionId === session.sessionId ? 'active' : ''}`}
                                    onClick={() => onSelectSession(session.sessionId)}
                                    title={session.title}
                                >
                                    <MessageSquare size={16} className="session-icon" />
                                    <span className="session-title">{session.title}</span>
                                    <div className="session-actions">
                                        <button
                                            className="icon-btn-small"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDeleteSession(session.sessionId);
                                            }}
                                            title="Delete Chat"
                                            style={{ color: 'inherit' }}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                        <MoreVertical size={16} />
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Mobile overlay */}
            {isOpen && <div className="sidebar-overlay" onClick={onToggle}></div>}
        </>
    );
};
