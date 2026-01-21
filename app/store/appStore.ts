import { create } from 'zustand';

export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    embedding?: number[]; // For semantic search
}

export interface AppState {
    // Chat state
    messages: Message[];
    isLoading: boolean;

    // Model state
    currentModelId: string | null;
    isModelLoaded: boolean;
    isDownloading: boolean;
    downloadProgress: number;

    // Device state
    deviceRAM: number;
    recommendedQuantization: '4-bit' | '8-bit';

    // Actions
    addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
    setLoading: (isLoading: boolean) => void;
    setModelLoaded: (isLoaded: boolean) => void;
    setCurrentModel: (modelId: string) => void;
    setDownloadProgress: (progress: number) => void;
    setDeviceCapabilities: (ram: number, quantization: '4-bit' | '8-bit') => void;
    clearMessages: () => void;
}

export const useAppStore = create<AppState>((set) => ({
    // Initial state
    messages: [],
    isLoading: false,
    currentModelId: null,
    isModelLoaded: false,
    isDownloading: false,
    downloadProgress: 0,
    deviceRAM: 4,
    recommendedQuantization: '4-bit',

    // Actions
    addMessage: (message) =>
        set((state) => ({
            messages: [
                ...state.messages,
                {
                    ...message,
                    id: Date.now().toString() + Math.random(),
                    timestamp: Date.now(),
                },
            ],
        })),

    setLoading: (isLoading) => set({ isLoading }),

    setModelLoaded: (isLoaded) => set({ isModelLoaded: isLoaded }),

    setCurrentModel: (modelId) => set({ currentModelId: modelId }),

    setDownloadProgress: (progress) =>
        set({ downloadProgress: progress, isDownloading: progress < 100 }),

    setDeviceCapabilities: (ram, quantization) =>
        set({ deviceRAM: ram, recommendedQuantization: quantization }),

    clearMessages: () => set({ messages: [] }),
}));
