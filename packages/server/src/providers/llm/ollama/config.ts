export const ollamaConfig = {
    host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
    model: process.env.OLLAMA_MODEL || 'llama3',
};
