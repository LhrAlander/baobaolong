import { GoogleGenAI } from '@google/genai';
import { ILLMProvider } from '../../../core/llm/interfaces.js';
import { ChatMessage, ChatOptions, ChatResponse, ModelConfig } from '../../../core/llm/types.js';
import { ISkill } from '../../../core/skills/types.js';
import { geminiConfig } from './config.js';

export class GeminiProvider implements ILLMProvider {
    private client: GoogleGenAI;

    constructor() {
        this.client = new GoogleGenAI({ apiKey: geminiConfig.apiKey });
        console.log(`[Gemini] @google/genai SDK 初始化完成`);
    }

    // 将通用的 ChatMessage 转换为 Gemini 需要的 Content 对象
    private mapMessages(messages: ChatMessage[]) {
        return messages.map(msg => {
            // 如果 role 是 tool，表示这是我们执行完本地函数给大模型的返回
            if (msg.role === 'tool') {
                return {
                    role: 'user', // gemini sdk 生成内容通常要求轮流，tool_response 使用 functionResponse 类型封装在 parts 里（部分版本兼容简化为 functionResponse）
                    parts: [{
                        functionResponse: {
                            name: msg.name || 'unknown_tool',
                            response: JSON.parse(msg.content)
                        }
                    }]
                };
            }

            // 如果 role 是 assistant 并且带有 tool_calls，表示此条记录是大模型此前要求呼出的调用记录
            if (msg.role === 'assistant' && msg.tool_calls) {
                return {
                    role: 'model',
                    parts: msg.tool_calls.map(tc => ({
                        functionCall: {
                            name: tc.name,
                            args: tc.args
                        }
                    }))
                };
            }

            return {
                role: msg.role === 'assistant' ? 'model' : msg.role,
                parts: [{ text: msg.content }]
            };
        });
    }

    // 将抽象的通用 Tool 转化为 Gemini 的 FunctionDeclaration
    private mapTools(tools?: ISkill[]) {
        if (!tools || tools.length === 0) return undefined;

        // Gemini SDK 对 JSON Schema 校验极度严格，不支持 empty object 或 anyOf/default 等高级特征
        // 在这加一层递归清洗，专为拔掉从 MCP 动态传过来的那些“过于庞大或前卫”但不影响实际调用签名的标注
        const cleanSchema = (schema: any): any => {
            if (typeof schema !== 'object' || schema === null) return schema;
            if (Array.isArray(schema)) return schema.map(cleanSchema);

            const cleaned: any = {};
            for (const [key, value] of Object.entries(schema)) {
                // 剔除所有引发 Gemini SDK schema_validator 崩溃的字段
                if (['anyOf', 'default', 'const', '$schema'].includes(key)) continue;

                // 处理 properties
                if (key === 'properties') {
                    if (Object.keys(value as any).length === 0) {
                        continue; // 空 properties 也会引发崩溃
                    }
                    cleaned[key] = cleanSchema(value);
                    continue;
                }

                cleaned[key] = cleanSchema(value);
            }

            // 如果清洗完是个空对象并且 type 为 object，我们得给一个合法的最简表示，或者直接干掉
            if (cleaned.type === 'object' && !cleaned.properties) {
                cleaned.properties = {};
            }
            return cleaned;
        };

        return [{
            functionDeclarations: tools.map(t => ({
                name: t.name.replace(/[^a-zA-Z0-9_]/g, '_'), // functionName format fix
                description: t.description,
                parameters: cleanSchema(t.parameters),
            }))
        }];
    }

    async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
        const modelTarget = options?.model || geminiConfig.model;
        const contents = this.mapMessages(messages);
        const mappedTools = this.mapTools(options?.tools);

        if (!geminiConfig.apiKey || geminiConfig.apiKey.includes('test_')) {
            console.log(`[Gemini] 检测到未配置真实 API Key，退回 Mock 响应。`);
            return {
                content: "你好！这是来自 Gemini 模拟实现的回应。请在 .env.development 填写真实 KEY 即可激活真实调用！",
            };
        }

        console.log(`[Gemini] 开始真实调用模型 ${modelTarget}...`);
        const response = await this.client.models.generateContent({
            model: modelTarget,
            contents,
            config: {
                temperature: options?.temperature,
                maxOutputTokens: options?.maxTokens,
                topP: options?.topP,
                tools: mappedTools,
            }
        });

        // 检查是不是回传了 functionCalls
        if (response.functionCalls && response.functionCalls.length > 0) {
            return {
                content: '',
                toolCalls: response.functionCalls.map(fc => ({
                    id: Math.random().toString(36).substring(7), // gemini 此前版本不提供独立 ID，自己生成一个占位
                    type: 'tool_call',
                    name: fc.name || 'unknown_tool',
                    args: fc.args as Record<string, any>
                })),
            };
        }

        return {
            content: response.text || '',
            usage: response.usageMetadata ? {
                promptTokens: response.usageMetadata.promptTokenCount || 0,
                completionTokens: response.usageMetadata.candidatesTokenCount || 0,
                totalTokens: response.usageMetadata.totalTokenCount || 0
            } : undefined
        };
    }

    async *stream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string> {
        const modelTarget = options?.model || geminiConfig.model;
        const contents = this.mapMessages(messages);
        const mappedTools = this.mapTools(options?.tools);

        if (!geminiConfig.apiKey || geminiConfig.apiKey.includes('test_')) {
            yield "请"; yield "填"; yield "写"; yield "真"; yield "实"; yield "Key。";
            return;
        }

        // 注意：目前某些模型的 stream 中如果触发 function call，SDK行为会有异同，暂且按简化逻辑抓取纯文本。
        const streamResponse = await this.client.models.generateContentStream({
            model: modelTarget,
            contents,
            config: {
                temperature: options?.temperature,
                maxOutputTokens: options?.maxTokens,
                topP: options?.topP,
                tools: mappedTools,
            }
        });

        for await (const chunk of streamResponse) {
            // 如果流中返回了 functionCall，目前简版中我们可以提示不支持直接流式解析，建议业务走非流式用于路由
            if (chunk.functionCalls && chunk.functionCalls.length > 0) {
                yield `[ToolCall挂起] 模型尝试在此处调用系统功能: ${chunk.functionCalls[0].name}，需退出流式以继续处理...`;
                break;
            }
            if (chunk.text) {
                yield chunk.text;
            }
        }
    }
    getModelConfig(): ModelConfig {
        return {
            contextWindow: 1048576, // Gemini 1.5 Pro 有 1M 上下文
            maxOutputTokens: 8192,
            safetyBuffer: 2000
        };
    }

    estimateTokenCount(messages: ChatMessage[]): number {
        return messages.reduce((acc, msg) => {
            const contentLen = msg.content ? msg.content.length : 0;
            const toolLen = msg.tool_calls ? JSON.stringify(msg.tool_calls).length : 0;
            return acc + contentLen + toolLen + 10;
        }, 0);
    }
}
