// 负责加载基础的全局 .env 并汇总子模块配置
// 实际运行中可配合 dotenv 库进行加载
import * as dotenv from 'dotenv';
import * as path from 'path';

// 根据运行环境设定读取不同的 .env 文件
const nodeEnv = process.env.NODE_ENV || 'development';
const envFile = `.env.${nodeEnv}`;

// 由于 server/src/config/env.ts 的执行路径基于 server/，我们取 server 根目录的 .env 文件
const envPath = path.resolve(process.cwd(), envFile);

console.log(`[Config] 加载环境变量文件: ${envFile} (Path: ${envPath})`);
dotenv.config({ path: envPath });

// 这里可以统一对外暴露一些非特定 LLM 的系统级配置
export const sysConfig = {
    port: process.env.PORT || 3000,
    nodeEnv
};
