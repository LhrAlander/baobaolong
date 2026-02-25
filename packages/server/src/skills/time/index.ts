import { ISkill } from '../../core/skills/types.js';

export const timeSkill: ISkill = {
    name: 'get_current_time',
    description: '获取当前系统时间。当需要推算日期（如“今天”、“明天”）或者了解当前时间点时调用。返回格式为 YYYY-MM-DD HH:mm:ss。',
    parameters: {
        type: 'object',
        properties: {}, // 这个接口不需要入参
        required: [],
    },
    execute: async () => {
        const now = new Date();

        // 格式化为 YYYY-MM-DD HH:mm:ss，并且以当前的服务器本地时区输出
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');

        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        const timeString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

        console.log(`[TimeSkill] 已被调用，返回当前时间: ${timeString}`);

        return {
            currentTime: timeString
        };
    }
};
