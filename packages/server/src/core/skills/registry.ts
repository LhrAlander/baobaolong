import { ISkill } from './types.js';

export class SkillRegistry {
    private static instance: SkillRegistry;
    private skills: Map<string, ISkill> = new Map();

    private constructor() { }

    public static getInstance(): SkillRegistry {
        if (!SkillRegistry.instance) {
            SkillRegistry.instance = new SkillRegistry();
        }
        return SkillRegistry.instance;
    }

    /**
     * 注册一个技能
     */
    public register(skill: ISkill): void {
        if (this.skills.has(skill.name)) {
            console.warn(`[SkillRegistry] 覆盖了已存在的技能: ${skill.name}`);
        }
        this.skills.set(skill.name, skill);
        console.log(`[SkillRegistry] 已注册技能: ${skill.name}`);
    }

    /**
     * 批量注册技能
     */
    public registerAll(skills: ISkill[]): void {
        for (const skill of skills) {
            this.register(skill);
        }
    }

    /**
     * 获取指定名称的技能
     */
    public getSkill(name: string): ISkill | undefined {
        return this.skills.get(name);
    }

    /**
     * 获取所有已挂载的技能列表 (通常用于自动传给 LLM)
     */
    public getAllSkills(): ISkill[] {
        return Array.from(this.skills.values());
    }

    /**
     * 处理工具调用并返回结果
     */
    public async executeToolCall(name: string, args: any): Promise<any> {
        const skill = this.skills.get(name);
        if (!skill) {
            throw new Error(`[SkillRegistry] 找不到对应的技能实现: ${name}`);
        }

        try {
            console.log(`[SkillRegistry] 正在执行技能 [${name}] ... 参数:`, args);
            const result = await skill.execute(args);
            return result;
        } catch (error) {
            console.error(`[SkillRegistry] 执行技能 [${name}] 时发生错误:`, error);
            // 将异常返回给模型知道，让它可能尝试换个参数重新调用
            return { error: String(error) };
        }
    }
}

// 导出一个默认实例作为全局单例中心
export const globalSkillRegistry = SkillRegistry.getInstance();
