import React, { useState, useRef, useEffect } from 'react';
import { Send, Image as ImageIcon, Mic } from 'lucide-react';
import './ChatInput.css';

interface ChatInputProps {
    onSend: (text: string) => void;
    disabled?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSend, disabled }) => {
    const [text, setText] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const autoResize = () => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
        }
    };

    useEffect(() => {
        autoResize();
    }, [text]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleSend = () => {
        if (text.trim() && !disabled) {
            onSend(text.trim());
            setText('');
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
            }
        }
    };

    return (
        <div className={`chat-input-container ${disabled ? 'disabled' : ''}`}>
            <div className="input-actions-left">
                <button className="icon-btn-small" title="Upload image (Demo)">
                    <ImageIcon size={20} />
                </button>
            </div>

            <div className="textarea-wrapper">
                <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="给宝宝龙发送消息..."
                    rows={1}
                    disabled={disabled}
                />
            </div>

            <div className="input-actions-right">
                {text.trim() ? (
                    <button
                        className="send-btn show"
                        onClick={handleSend}
                        disabled={disabled}
                        title="Send message"
                    >
                        <Send size={18} />
                    </button>
                ) : (
                    <button className="icon-btn-small mic-btn" title="Voice input (Demo)" disabled={disabled}>
                        <Mic size={20} />
                    </button>
                )}
            </div>
        </div>
    );
};
