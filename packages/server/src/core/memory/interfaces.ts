export interface IMemoryStorage {
    /**
     * 保存或追加记忆内容
     * @param category 存储分区 (比如 'core', 'daily', 'knowledge')
     * @param key 标识符或文件名 (不带后缀)
     * @param content 具体要存储的内容
     * @param append 是否在原有记录上追加 (默认 false，即覆盖)
     */
    save(category: string, key: string, content: string, append?: boolean): Promise<void>;

    /**
     * 提取指定的记忆内容
     * @param category 存储分区 (比如 'core', 'daily')
     * @param key 标识符或文件名 (不带后缀)
     */
    get(category: string, key: string): Promise<string | null>;

    /**
     * 在全局或指定分区进行模糊内容检索 (针对日后 RAG 改造预留的拓展点)
     * @param query 检索关键字
     * @param category 限定搜索哪个分区，不传查所有
     */
    search(query: string, category?: string): Promise<string[]>;

    /**
     * 读取指定分区下所有的记忆建名列表
     */
    listKeys(category: string): Promise<string[]>;
}
