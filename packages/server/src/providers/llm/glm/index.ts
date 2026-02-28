import { ZhipuAI } from 'zhipuai';
import fetch from 'node-fetch';
import { ILLMProvider } from '../../../core/llm/interfaces.js';
import { ChatMessage, ChatOptions, ChatResponse, ModelConfig } from '../../../core/llm/types.js';
import { ISkill } from '../../../core/skills/types.js';
import { glmConfig, glmModelDict } from './config.js';

export class GLMProvider implements ILLMProvider {
    private client: ZhipuAI;
    private readonly currentModel: string;
    private readonly currentConfig: ModelConfig;

    constructor(model?: string) {
        this.currentModel = model || glmConfig.model;
        this.currentConfig = glmModelDict[this.currentModel] || glmModelDict['default'];

        this.client = new ZhipuAI({
            apiKey: glmConfig.apiKey,
            fetch: fetch as any
        });
        console.log(`[GLM] zhipuai SDK 初始化完成, 已绑定模型: ${this.currentModel} (Win: ${this.currentConfig.contextWindow})`);
    }

    exactTokenCount?(messages: ChatMessage[]): Promise<number> {
        throw new Error('Method not implemented.');
    }

    // 将通用的 ChatMessage 转换为 智谱 需要的 messages 对象
    private mapMessages(messages: ChatMessage[]) {
        return messages.map(msg => {
            if (msg.role === 'tool') {
                return {
                    role: 'tool',
                    tool_call_id: msg.tool_call_id,
                    content: msg.content
                };
            }
            if (msg.role === 'assistant' && msg.tool_calls) {
                return {
                    role: 'assistant',
                    content: msg.content || '',
                    tool_calls: msg.tool_calls.map(tc => ({
                        id: tc.id,
                        type: 'function',
                        function: {
                            name: tc.name,
                            arguments: JSON.stringify(tc.args) // 智谱/OpenAI 期望这里的 args 是字符串化的
                        }
                    }))
                };
            }
            return {
                role: msg.role,
                content: msg.content
            };
        });
    }

    private mapTools(tools?: ISkill[]) {
        if (!tools || tools.length === 0) return undefined;
        return tools.map(t => ({
            type: 'function',
            function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters as any
            }
        }));
    }

    async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
        const modelTarget = options?.model || this.currentModel;
        const reqMessages = this.mapMessages(messages);
        const mappedTools = this.mapTools(options?.tools);

        // Fallback Mock 保护，防止没填 KEY 时崩溃
        if (!glmConfig.apiKey || glmConfig.apiKey.includes('test_')) {
            console.log(`[GLM] 检测到未配置真实 API Key，退回 Mock 响应。`);
            return {
                content: "你好！这是来自智谱 GLM 模拟实现的回应。请在 .env.development 填写真实 GLM_API_KEY 即可激活调用！",
            };
        }

        console.log(`[GLM] 开始使用模型 ${modelTarget} 思考...`);
        const response = await this.client.chat.completions.create({
            model: modelTarget,
            messages: reqMessages as any,
            temperature: options?.temperature,
            top_p: options?.topP,
            stream: false,
            tools: mappedTools as any,
        });

        const choice = response.choices?.[0];
        const message = choice?.message;

        if (message?.tool_calls && message.tool_calls.length > 0) {
            return {
                content: message.content || '',
                toolCalls: message.tool_calls.map((tc: any) => ({
                    id: tc.id,
                    type: 'tool_call',
                    name: tc.function.name,
                    args: JSON.parse(tc.function.arguments) // 接收到的通常是序列化的 json
                }))
            };
        }

        return {
            content: message?.content || '',
            usage: response.usage ? {
                promptTokens: response.usage.prompt_tokens || 0,
                completionTokens: response.usage.completion_tokens || 0,
                totalTokens: response.usage.total_tokens || 0
            } : undefined
        };
    }

    async *stream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string> {
        console.log('[GLM] stream');
        const modelTarget = options?.model || this.currentModel;
        const reqMessages = this.mapMessages(messages);
        const mappedTools = this.mapTools(options?.tools);

        if (!glmConfig.apiKey || glmConfig.apiKey.includes('test_')) {
            yield "请"; yield "填"; yield "写"; yield "智"; yield "谱"; yield "GLM"; yield " "; yield "真"; yield "实"; yield "Key。";
            return;
        }

        const streamResponse = await this.client.chat.completions.create({
            model: modelTarget,
            messages: reqMessages as any,
            temperature: options?.temperature,
            top_p: options?.topP,
            stream: true,
            tools: mappedTools as any,
        });

        for await (const chunk of streamResponse) {
            const delta = chunk.choices[0]?.delta as any;
            if (delta?.tool_calls && delta.tool_calls.length > 0) {
                yield `[ToolCall挂起] 模型尝试调用工具，当前流式暂不支持挂起转发，请降级为 chat() 模式路由。`;
                break;
            }
            const text = delta?.content;
            if (text) {
                yield text;
            }
        }
    }

    getModelConfig(): ModelConfig {
        return this.currentConfig;
    }

    estimateTokenCount(messages: ChatMessage[]): number {
        return messages.reduce((acc, msg) => {
            const contentLen = msg.content ? msg.content.length : 0;
            const toolLen = msg.tool_calls ? JSON.stringify(msg.tool_calls).length : 0;
            return acc + contentLen + toolLen + 10;
        }, 0);
    }
}
