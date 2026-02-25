export interface ISkillParameterProperties {
    [key: string]: {
        type: 'string' | 'number' | 'boolean' | 'object' | 'array';
        description: string;
        enum?: string[];
        items?: any; // 用于 type 为 array 时的元素说明
        properties?: ISkillParameterProperties; // 用于 type 为 object 时
    };
}

export interface ISkillParameters {
    type: 'object';
    properties: ISkillParameterProperties;
    required?: string[];
}

export interface ISkill {
    /** 技能全局唯一名称标识，受限于大部分模型规范，请使用 /^[a-zA-Z0-9_]+$/ 格式 */
    name: string;
    /** 给大模型看的技能描述：解释什么情况下应该调用这个技能，以及各个参数的含义 */
    description: string;
    /** JSON Schema 格式的参数描述 */
    parameters: ISkillParameters;
    /** 真实的业务执行代码 */
    execute(args: any): Promise<any> | any;
}

/** LLM 遇到需要调用工具时，返回的数据结构封装 */
export interface ToolCallRequest {
    /** 唯一标识本次调用的 ID，用于后续返回结果时匹配对应 (部分模型强制要求如 OpenAI) */
    id: string;
    type: 'tool_call';
    name: string;
    /** JSON 格式的字符串参数，或者直接转化好的对象，取决于不同框架的默认设计，这里约定为对象 */
    args: Record<string, any>;
}

export interface ToolCallResult {
    /** 对应发送过来的目标 toolCall Id */
    toolCallId: string;
    /** 技能名字 */
    name: string;
    /** 真实执行完毕后拿到的结构，准备重新抛给模型 */
    result: any;
}
