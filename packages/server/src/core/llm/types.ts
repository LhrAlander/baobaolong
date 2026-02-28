import { ISkill, ToolCallRequest } from '../skills/types.js';

/**
 * 角色定义：兼容各大模型的标准角色命名
 * tool: 用于提交工具调用结果的角色
 */
export type Role = 'system' | 'user' | 'assistant' | 'tool';

/**
 * 标准化的对话消息体内结构
 */
export interface ChatMessage {
    role: Role;
    content: string;
    name?: string; // 用于 tool call 或某些特定角色区分

    // 如果 role 是 tool，通常需要携带对此哪一次 tool_call 的回应对应的 ID
    tool_call_id?: string;

    // 如果 role 是 assistant 并且想调用工具，会在此字段携带要调用的详细列表
    tool_calls?: ToolCallRequest[];
}

/**
 * 统一的对话参数选项 (可选，不同大模型会择其所用)
 */
export interface ChatOptions {
    model?: string; // 如果不传，由 Provider 自己的 config 决定默认模型
    temperature?: number; // 0.0 - 1.0/2.0
    maxTokens?: number;
    topP?: number;
    stream?: boolean;     // 显式流式声明，虽然我们直接定义了 stream 方法

    /** 注入可供大模型使用的当前所有合法技能 (Tools) */
    tools?: ISkill[];
}

/**
 * 统一的纯文本响应或者挂起响应(包含 toolCalls)
 */
export interface ChatResponse {
    content: string;

    /** 如果模型没有回复文本而是挂起要求调用系统函数，会返回该集合 */
    toolCalls?: ToolCallRequest[];
    // 后续可追加 meta 信息，如消耗 token 数等
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

/**
 * 模型的元计算配置信息
 */
export interface ModelConfig {
    /** 模型的绝对最大上下文窗口长度 (如 128000) */
    contextWindow: number;
    /** 为模型生成预留的安全输出空间 (如 4096) */
    maxOutputTokens: number;
    /** 算法允许的安全偏移量 (如 1000) */
    safetyBuffer?: number;
}
