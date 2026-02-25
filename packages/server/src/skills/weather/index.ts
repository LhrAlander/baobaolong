import { ISkill } from '../../core/skills/types.js';

export const weatherSkill: ISkill = {
    name: 'get_weather_info',
    description: '当用户询问有关天气信息时调用此技能，可获取指定城市的实时天气。\n注意：如果用户没有提供城市，不可随意编造城市去调用此技能。',
    parameters: {
        type: 'object',
        properties: {
            city: {
                type: 'string',
                description: '被查询天气的城市名称，例如 "杭州", "北京"',
            },
            time: {
                type: 'string',
                description: '查询的日期。由于不支持模糊时间，这里必须是具体的日期格式（例如 "2023-10-25"）。如果用户说今天或明天，你需要结合当前真实时间自行推算出具体的日期 YYYY-MM-DD。可选。',
            },
        },
        required: ['city', 'time'],
    },
    execute: async (args: any) => {
        // 这里模拟真实的查询 API，可替换为去和风天气等第三方调用的 http request
        const city = args.city;
        const time = args.time;

        console.log(`[WeatherSkill] 接收到查询请求: 城市=${city}, 时间=${time}`);

        // 模拟一段网络延迟
        await new Promise(r => setTimeout(r, 800));

        // 根据城市简单模拟数据返回
        if (city.includes('杭州')) {
            return { city, temperature: 22, condition: '多云转晴', wind: '微风', time };
        } else if (city.includes('北京')) {
            return { city, temperature: 15, condition: '大风降温', wind: '西北风4级', time };
        } else {
            return { city, temperature: 20, condition: '晴', wind: '无', time };
        }
    }
};
