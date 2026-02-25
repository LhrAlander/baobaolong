import { ILLMProvider } from './interfaces.js';

export class LLMFactory {
    // 单例模式注册表：存储各个 Provider 的实例化对象
    private static providers: Map<string, ILLMProvider> = new Map();

    /**
     * 注册一个新的 LLM 提供商实体
     * @param name - 名称标识 (如 'gemini', 'ollama')
     * @param provider - 实现了 ILLMProvider 的实例
     */
    static register(name: string, provider: ILLMProvider): void {
        console.log(`[LLMFactory] 注册 Provider 模型适配器: ${name}`);
        this.providers.set(name, provider);
    }

    /**
     * 获取指定的 LLM 提供商
     * @param name - 名称标识
     */
    static get(name: string): ILLMProvider {
        const provider = this.providers.get(name);
        if (!provider) {
            throw new Error(`[LLMFactory] 未找到名为 '${name}' 的 Provider，请检查是否已注册！`);
        }
        return provider;
    }

    /**
     * 判断是否存在某 Provider
     */
    static has(name: string): boolean {
        return this.providers.has(name);
    }
}
