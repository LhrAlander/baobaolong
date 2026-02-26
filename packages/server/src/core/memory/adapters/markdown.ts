import * as fs from 'fs';
import * as path from 'path';
import { IMemoryStorage } from '../interfaces.js';

export class MarkdownMemoryAdapter implements IMemoryStorage {
    private readonly basePath: string;

    constructor(basePath: string = path.join(process.cwd(), 'data', 'memory')) {
        this.basePath = basePath;
        // 自动初始化顶级数据目录
        if (!fs.existsSync(this.basePath)) {
            fs.mkdirSync(this.basePath, { recursive: true });
        }
    }

    private getFilePath(category: string, key: string): string {
        return path.join(this.basePath, category, `${key}.md`);
    }

    private ensureDirectoryExistence(filePath: string) {
        const dirname = path.dirname(filePath);
        if (!fs.existsSync(dirname)) {
            fs.mkdirSync(dirname, { recursive: true });
        }
    }

    async save(category: string, key: string, content: string, append: boolean = false): Promise<void> {
        const filePath = this.getFilePath(category, key);
        this.ensureDirectoryExistence(filePath);

        // 如果明确不是追加并且文件存在，就覆盖，如果追加的话用追加写入
        if (append && fs.existsSync(filePath)) {
            // 用户要求 core 分类的格式不要太繁琐，不带更新时间
            let formattedAppend = `\n${content}`;
            if (category !== 'core') {
                formattedAppend = `\n\n---\n*更新时间: ${new Date().toLocaleString()}*\n\n${content}`;
            }
            await fs.promises.appendFile(filePath, formattedAppend, 'utf-8');
        } else {
            await fs.promises.writeFile(filePath, content, 'utf-8');
        }
    }

    async get(category: string, key: string): Promise<string | null> {
        const filePath = this.getFilePath(category, key);
        if (fs.existsSync(filePath)) {
            return await fs.promises.readFile(filePath, 'utf-8');
        }
        return null;
    }

    async search(query: string, category?: string): Promise<string[]> {
        // 第一阶段的 Markdown 轻检索：如果不接入外接的索引库，我们可以采取暴力的 Node 遍历找子串
        console.warn(`[MarkdownMemoryAdapter] 当前处在开发测试阶段，search 为简版全文遍历。海量数据请接入向量适配器。`);
        const results: string[] = [];

        const categories = category ? [category] : ['core', 'daily', 'knowledge'];

        for (const cat of categories) {
            const catPath = path.join(this.basePath, cat);
            if (!fs.existsSync(catPath)) continue;

            const files = await this.listAllFilesRecursive(catPath);
            for (const file of files) {
                if (!file.endsWith('.md')) continue;

                const content = await fs.promises.readFile(file, 'utf-8');
                if (content.toLowerCase().includes(query.toLowerCase())) {
                    // 只把相关的截断内容返回而不是直接塞满
                    const preview = content.substring(0, 300) + '...';
                    results.push(`[来源: ${path.relative(this.basePath, file)}]\n${preview}`);
                }
            }
        }

        return results;
    }

    async listKeys(category: string): Promise<string[]> {
        const catPath = path.join(this.basePath, category);
        if (!fs.existsSync(catPath)) return [];

        const files = await this.listAllFilesRecursive(catPath);
        return files
            .filter(f => f.endsWith('.md'))
            // 反向处理：将绝对路径剥离为相对 category 的 key
            .map(f => {
                const relativePath = path.relative(catPath, f);
                return relativePath.replace(/\.md$/, ''); // 把 .md 切掉作为抽象 key
            });
    }

    // 内部私有工具函数：用来寻找所有的底层嵌套文件（对付 daily 里的年份打平）
    private async listAllFilesRecursive(dir: string): Promise<string[]> {
        let results: string[] = [];
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                const subResults = await this.listAllFilesRecursive(fullPath);
                results = results.concat(subResults);
            } else {
                results.push(fullPath);
            }
        }
        return results;
    }
}
