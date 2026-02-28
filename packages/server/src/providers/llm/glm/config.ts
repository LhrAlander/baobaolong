import { ModelConfig } from '../../../core/llm/types.js';

// 维护智谱各个模型的上下文参数
export const glmModelDict: Record<string, ModelConfig> = {
    'glm-4-plus': { contextWindow: 128000, maxOutputTokens: 4096, safetyBuffer: 1000 },
    'glm-4-0520': { contextWindow: 128000, maxOutputTokens: 4096, safetyBuffer: 1000 },
    'glm-4': { contextWindow: 128000, maxOutputTokens: 4096, safetyBuffer: 1000 },
    'glm-4-air': { contextWindow: 128000, maxOutputTokens: 4096, safetyBuffer: 1000 },
    'glm-4-airx': { contextWindow: 8192, maxOutputTokens: 4096, safetyBuffer: 500 },
    'glm-4-long': { contextWindow: 1000000, maxOutputTokens: 4096, safetyBuffer: 2000 },
    'glm-4-flashx': { contextWindow: 128000, maxOutputTokens: 4096, safetyBuffer: 1000 },
    'glm-4-flash': { contextWindow: 128000, maxOutputTokens: 4096, safetyBuffer: 1000 },
    'default': { contextWindow: 128000, maxOutputTokens: 4096, safetyBuffer: 1000 }
};

export const glmConfig = {
    apiKey: process.env.GLM_API_KEY || '',
    model: process.env.GLM_MODEL || 'glm-4-flash',
};
