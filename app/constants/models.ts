export interface ModelConfig {
    id: string;
    name: string;
    size: string;
    quantization: '4-bit' | '8-bit';
    contextWindow: number;
    downloadUrl: string;
    minRAM: number; // in GB
    description: string;
}

export const AVAILABLE_MODELS: ModelConfig[] = [
    {
        id: 'tinyllama-1.1b-4bit',
        name: 'TinyLlama 1.1B (4-bit)',
        size: '600MB',
        quantization: '4-bit',
        contextWindow: 2048,
        downloadUrl: 'https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
        minRAM: 2,
        description: 'Optimized for older devices, fastest inference',
    },
    {
        id: 'tinyllama-1.1b-8bit',
        name: 'TinyLlama 1.1B (8-bit)',
        size: '1.1GB',
        quantization: '8-bit',
        contextWindow: 2048,
        downloadUrl: 'https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q8_0.gguf',
        minRAM: 4,
        description: 'Better quality responses for modern devices',
    },
];

export const MODEL_CONSTANTS = {
    MAX_CONTEXT_TOKENS: 2048,
    SLIDING_WINDOW_SIZE: 10, // Keep last 10 messages
    ARCHIVED_MESSAGES_TO_RETRIEVE: 3, // Semantic retrieval count
    AVERAGE_TOKENS_PER_MESSAGE: 50,
} as const;
