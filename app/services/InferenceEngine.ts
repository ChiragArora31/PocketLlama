import { Platform } from 'react-native';
import { logger } from '../utils/logger';

export interface InferenceOptions {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
    repeatPenalty?: number;
    stopSequences?: string[];
}

export interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

// Default system prompt for TinyLlama
const DEFAULT_SYSTEM_PROMPT = 'You are a helpful, harmless, and honest assistant.';

// TinyLlama chat template tokens
const TOKENS = {
    SYSTEM_START: '<|system|>',
    USER_START: '<|user|>',
    ASSISTANT_START: '<|assistant|>',
    END: '</s>',
    EOT: '<|endoftext|>',
};

let initLlama: any = null;
if (Platform.OS !== 'web') {
    try {
        initLlama = require('llama.rn').initLlama;
        logger.log('[InferenceEngine] llama.rn loaded');
    } catch (e) {
        logger.warn('[InferenceEngine] llama.rn unavailable');
    }
}

class InferenceEngine {
    private context: any = null;
    private modelPath: string | null = null;
    private isInitialized = false;
    private isGenerating = false;
    private readonly DEFAULT_TIMEOUT_MS = 60000; // 60 seconds timeout
    private readonly DEFAULT_MAX_TOKENS = 128; // Reduced for shorter, more focused responses
    private readonly DEFAULT_TEMPERATURE = 0.7;
    private readonly DEFAULT_TOP_P = 0.9;
    private readonly DEFAULT_TOP_K = 40;
    private readonly DEFAULT_REPEAT_PENALTY = 1.1;

    /**
     * Initialize the inference engine with a model
     */
    async initialize(modelPath: string): Promise<void> {
        if (this.isInitialized && this.modelPath === modelPath) {
            logger.log('[InferenceEngine] Already initialized with this model');
            return;
        }

        // Clean up previous model if exists
        if (this.context && this.modelPath !== 'mock') {
            await this.cleanup();
        }

        if (modelPath === 'mock' || Platform.OS === 'web' || !initLlama) {
            await new Promise(r => setTimeout(r, 500));
            this.modelPath = 'mock';
            this.isInitialized = true;
            logger.warn('[InferenceEngine] Running in mock mode');
            return;
        }

        try {
            logger.log('[InferenceEngine] Initializing with model:', modelPath);
            
            if (!modelPath || typeof modelPath !== 'string') {
                throw new Error('Invalid model path provided');
            }

            this.context = await initLlama({
                model: modelPath,
                n_ctx: 2048,
                n_batch: 512,
                n_threads: 4,
                use_mlock: true,
                n_gpu_layers: 0,
                verbose: false,
            });

            this.modelPath = modelPath;
            this.isInitialized = true;
            logger.log('[InferenceEngine] Model loaded successfully');
        } catch (error: any) {
            console.error('[InferenceEngine] Init failed:', error);
            this.isInitialized = false;
            this.context = null;
            this.modelPath = null;
            
            // Provide helpful error messages
            const errorMessage = error?.message || String(error);
            if (errorMessage.includes('file') || errorMessage.includes('path')) {
                throw new Error(`Model file not found or invalid: ${modelPath}`);
            } else if (errorMessage.includes('memory')) {
                throw new Error('Insufficient memory to load model');
            } else {
                throw new Error(`Failed to initialize model: ${errorMessage}`);
            }
        }
    }

    /**
     * Check if the engine is initialized and ready
     */
    isLoaded(): boolean {
        return this.isInitialized && (this.modelPath === 'mock' || this.context !== null);
    }

/**
 * Format messages using proper TinyLlama-1.1b-Chat template
     * Template format:
     * <|system|>\nSYSTEM_PROMPT</s>\n<|user|>\nUSER_MESSAGE</s>\n<|assistant|>\nASSISTANT_RESPONSE</s>
     */
    private formatMessages(messages: Message[], systemPrompt?: string): string {
        if (!messages || messages.length === 0) {
            throw new Error('Cannot format empty message array');
        }

        const parts: string[] = [];
        const system = systemPrompt || DEFAULT_SYSTEM_PROMPT;

        // Add system prompt if provided
        if (system) {
            parts.push(`${TOKENS.SYSTEM_START}\n${system}${TOKENS.END}`);
        }

        // Process conversation messages
        for (const message of messages) {
            if (!message.content || typeof message.content !== 'string') {
                logger.warn('[InferenceEngine] Skipping invalid message:', message);
                continue;
            }

            const content = message.content.trim();
            if (!content) continue;

            switch (message.role) {
                case 'user':
                    parts.push(`${TOKENS.USER_START}\n${content}${TOKENS.END}`);
                    break;
                case 'assistant':
                    parts.push(`${TOKENS.ASSISTANT_START}\n${content}${TOKENS.END}`);
                    break;
                case 'system':
                    // System messages in conversation override default
                    parts.push(`${TOKENS.SYSTEM_START}\n${content}${TOKENS.END}`);
                    break;
            }
        }

        // Always end with assistant start token for completion
        if (parts.length > 0 && !parts[parts.length - 1].includes(TOKENS.ASSISTANT_START)) {
            parts.push(`${TOKENS.ASSISTANT_START}\n`);
        }

        return parts.join('\n');
    }

    /**
     * Format a simple prompt string for completion (backward compatibility)
     */
    private formatPrompt(prompt: string, systemPrompt?: string): string {
        const system = systemPrompt || DEFAULT_SYSTEM_PROMPT;
        return `${TOKENS.SYSTEM_START}\n${system}${TOKENS.END}\n${TOKENS.USER_START}\n${prompt}${TOKENS.END}\n${TOKENS.ASSISTANT_START}\n`;
    }

    /**
     * Generate a response from the model
     * Supports both message array and simple string prompt
     */
    async generate(
        input: string | Message[],
        options: InferenceOptions = {}
    ): Promise<string> {
        // Validate initialization
        if (!this.isInitialized) {
            throw new Error('InferenceEngine not initialized. Call initialize() first.');
        }

        // Prevent concurrent generation
        if (this.isGenerating) {
            throw new Error('Generation already in progress. Please wait for current generation to complete.');
        }

        this.isGenerating = true;

        try {
            // Validate input
            if (!input) {
                throw new Error('Input cannot be empty');
            }

            // Normalize options with defaults
            // Enhanced stop sequences for natural sentence endings
            const defaultStopSequences = [
                TOKENS.END,
                TOKENS.EOT,
                '\n\n', // Double newline often indicates end of thought
                '.\n',  // Period followed by newline
                '?\n', // Question mark followed by newline
                '!\n', // Exclamation followed by newline
            ];

            const opts: Required<InferenceOptions> = {
                maxTokens: options.maxTokens ?? this.DEFAULT_MAX_TOKENS,
                temperature: Math.max(0.1, Math.min(2.0, options.temperature ?? this.DEFAULT_TEMPERATURE)),
                topP: Math.max(0.1, Math.min(1.0, options.topP ?? this.DEFAULT_TOP_P)),
                topK: options.topK ?? this.DEFAULT_TOP_K,
                repeatPenalty: Math.max(1.0, options.repeatPenalty ?? this.DEFAULT_REPEAT_PENALTY),
                stopSequences: options.stopSequences || defaultStopSequences,
            };

            // Handle mock mode
            if (this.modelPath === 'mock') {
                return this.generateMockResponse(input, opts);
            }

            // Validate context exists
            if (!this.context) {
                throw new Error('Model context not available. Reinitialize the engine.');
            }

            // Prepare messages for llama.rn
            // llama.rn expects messages array directly, not formatted string
            let messagesForInference: Message[];
            if (Array.isArray(input)) {
                messagesForInference = input;
            } else {
                // Convert string prompt to messages array
                messagesForInference = [
                    { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
                    { role: 'user', content: input }
                ];
            }

            // Validate messages
            if (!messagesForInference || messagesForInference.length === 0) {
                throw new Error('Messages array cannot be empty');
            }

            // Ensure we have at least a user message
            const hasUserMessage = messagesForInference.some(m => m.role === 'user');
            if (!hasUserMessage) {
                throw new Error('Messages must contain at least one user message');
            }

            // Ensure system message is first (llama.rn convention)
            if (messagesForInference[0].role !== 'system') {
                messagesForInference = [
                    { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
                    ...messagesForInference
                ];
            }

            // Filter out empty messages
            messagesForInference = messagesForInference.filter(
                msg => msg.content && msg.content.trim().length > 0
            );

            logger.log(`[InferenceEngine] Generating with ${opts.maxTokens} max tokens, temp=${opts.temperature}`);
            logger.log(`[InferenceEngine] Messages count: ${messagesForInference.length}`);

            // Generate with timeout
            const response = await this.generateWithTimeout(
                messagesForInference,
                opts,
                this.DEFAULT_TIMEOUT_MS
            );

            let cleanedResponse = this.cleanResponse(response);
            
            if (!cleanedResponse || cleanedResponse.trim().length === 0) {
                logger.warn('[InferenceEngine] Empty response after cleaning');
                if (response && response.trim().length > 0) {
                    cleanedResponse = response.trim();
                } else {
                    logger.warn('[InferenceEngine] Both cleaned and original are empty, using fallback');
                    return this.generateMockResponse(input, opts);
                }
            }

            // Apply smart truncation to ensure natural sentence endings
            const truncatedResponse = this.truncateAtSentenceBoundary(cleanedResponse, opts.maxTokens);
            
            return truncatedResponse;

        } catch (error: any) {
            console.error('[InferenceEngine] Generation error:', error);
            
            // If in mock mode or error occurs, fall back to mock response
            if (this.modelPath === 'mock') {
                return this.generateMockResponse(input, options);
            }

            // Provide helpful error messages
            const errorMessage = error?.message || String(error);
            if (errorMessage.includes('timeout')) {
                throw new Error('Generation timed out. The model may be too slow or the prompt too long.');
            } else if (errorMessage.includes('memory')) {
                throw new Error('Insufficient memory for generation. Try reducing maxTokens.');
            } else {
                throw new Error(`Generation failed: ${errorMessage}`);
            }
        } finally {
            this.isGenerating = false;
        }
    }

    /**
     * Generate response with timeout protection
     * llama.rn uses completion() method with messages array
     */
    private async generateWithTimeout(
        messages: Message[],
        options: Required<InferenceOptions>,
        timeoutMs: number
    ): Promise<string> {
        return new Promise(async (resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Generation timeout'));
            }, timeoutMs);

            try {
                const contextMethods = Object.keys(this.context || {});
                logger.log('[InferenceEngine] Context methods:', contextMethods);

                let result: any;
                
                if (typeof this.context.completion === 'function') {
                    logger.log('[InferenceEngine] Using completion() method');
                    
                    const completionOptions: any = {
                        messages: messages,
                        max_tokens: options.maxTokens,
                        temperature: options.temperature,
                        top_p: options.topP,
                        stop: options.stopSequences || [],
                    };

                    if (options.topK !== undefined) {
                        completionOptions.top_k = options.topK;
                    }
                    if (options.repeatPenalty !== undefined) {
                        completionOptions.repeat_penalty = options.repeatPenalty;
                    }
                    
                    result = this.context.completion(completionOptions);
                } 
                else if (typeof this.context.prompt === 'function') {
                    logger.log('[InferenceEngine] Using prompt() method (fallback)');
                    const formattedPrompt = this.formatMessages(messages);
                    
                    result = this.context.prompt(formattedPrompt, {
                        n_predict: options.maxTokens,
                        temperature: options.temperature,
                        top_p: options.topP,
                        top_k: options.topK,
                        repeat_penalty: options.repeatPenalty,
                        stop: options.stopSequences,
                    });
                } 
                else {
                    logger.error('[InferenceEngine] Available context methods:', contextMethods);
                    throw new Error(`No valid generation method found. Available methods: ${contextMethods.join(', ')}`);
                }

                if (result instanceof Promise) {
                    result = await result;
                }

                clearTimeout(timer);
                
                if (typeof result === 'string') {
                    if (result.trim().length === 0) {
                        throw new Error('Model returned empty string');
                    }
                    resolve(result);
                } else if (result && typeof result.text === 'string') {
                    if (result.text.trim().length === 0) {
                        throw new Error('Model returned empty text');
                    }
                    resolve(result.text);
                } else if (result && typeof result.content === 'string') {
                    if (result.content.trim().length === 0) {
                        throw new Error('Model returned empty content');
                    }
                    resolve(result.content);
                } else if (result && result.response && typeof result.response === 'string') {
                    if (result.response.trim().length === 0) {
                        throw new Error('Model returned empty response');
                    }
                    resolve(result.response);
                } else if (result && result.message && typeof result.message === 'string') {
                    if (result.message.trim().length === 0) {
                        throw new Error('Model returned empty message');
                    }
                    resolve(result.message);
                } else {
                    const stringResult = String(result);
                    if (stringResult && stringResult !== '[object Object]' && stringResult.length > 0 && stringResult.trim().length > 0) {
                        resolve(stringResult);
                    } else {
                        logger.error('[InferenceEngine] Invalid response format:', result);
                        reject(new Error(`Invalid response format from model. Got: ${JSON.stringify(result)}`));
                    }
                }
            } catch (error: any) {
                clearTimeout(timer);
                console.error('[InferenceEngine] Generation error details:', {
                    message: error?.message,
                    stack: error?.stack,
                    error: String(error),
                    errorType: error?.constructor?.name,
                });
                reject(error);
            }
        });
    }

    /**
     * Clean and normalize model response
     * Be careful not to remove valid content
     */
    private cleanResponse(response: string): string {
        if (!response || typeof response !== 'string') {
            return '';
        }

        let cleaned = response.trim();

        // Only remove stop sequences if they appear at the very end (not in the middle)
        // This preserves content that might legitimately contain these tokens
        cleaned = cleaned.replace(new RegExp(`${TOKENS.END}\\s*$`, 'g'), '');
        cleaned = cleaned.replace(new RegExp(`${TOKENS.EOT}\\s*$`, 'g'), '');
        
        // Remove assistant start token only if it's at the beginning (leftover from prompt)
        if (cleaned.startsWith(TOKENS.ASSISTANT_START)) {
            cleaned = cleaned.substring(TOKENS.ASSISTANT_START.length).trim();
        }
        
        // Remove template tokens only if they appear as standalone tokens (not part of content)
        // Be more conservative - only remove if they're clearly template artifacts
        // Don't remove if they might be part of the actual response content
        
        // Clean up excessive whitespace (but preserve intentional line breaks)
        cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n'); // Max 3 consecutive newlines
        cleaned = cleaned.replace(/[ \t]{3,}/g, '  '); // Max 2 consecutive spaces
        
        // Final trim
        cleaned = cleaned.trim();

        return cleaned;
    }

    /**
     * Truncate response at sentence boundary to avoid abrupt endings
     * Ensures response ends naturally at a complete sentence
     */
    private truncateAtSentenceBoundary(response: string, maxTokens: number): string {
        if (!response || response.length === 0) {
            return response;
        }

        // Estimate token count (rough approximation: ~4 characters per token)
        const estimatedTokens = Math.ceil(response.length / 4);
        
        // If response is already within limits, return as-is
        if (estimatedTokens <= maxTokens) {
            return response;
        }

        // Calculate approximate max character length (with some buffer)
        const maxChars = maxTokens * 4;
        
        // If response exceeds max length, truncate intelligently
        if (response.length > maxChars) {
            // Find the last complete sentence before the limit
            // Look for sentence endings: . ! ? followed by space or newline
            const sentenceEndPattern = /[.!?][\s\n]/g;
            let lastMatch: RegExpMatchArray | null = null;
            let match: RegExpMatchArray | null;
            
            // Find all sentence endings
            while ((match = sentenceEndPattern.exec(response)) !== null) {
                // Only consider matches before maxChars
                if (match.index !== undefined && match.index + match[0].length <= maxChars) {
                    lastMatch = match;
                } else {
                    break;
                }
            }
            
            // If we found a sentence boundary, truncate there
            if (lastMatch && lastMatch.index !== undefined) {
                const truncateIndex = lastMatch.index + lastMatch[0].length;
                const truncated = response.substring(0, truncateIndex).trim();
                logger.log(`[InferenceEngine] Truncated at sentence boundary: ${truncated.length} chars`);
                return truncated;
            }
            
            const wordBoundaryIndex = response.lastIndexOf(' ', maxChars);
            if (wordBoundaryIndex > maxChars * 0.7) {
                const truncated = response.substring(0, wordBoundaryIndex).trim();
                if (!/[.!?]$/.test(truncated)) {
                    logger.log(`[InferenceEngine] Truncated at word boundary: ${truncated.length} chars`);
                    return truncated;
                }
                return truncated;
            }
            
            const hardTruncated = response.substring(0, maxChars).trim();
            const finalTruncated = hardTruncated.replace(/\s+\S+$/, '');
            logger.log(`[InferenceEngine] Hard truncated: ${finalTruncated.length} chars`);
            return finalTruncated;
        }

        return response;
    }

    /**
     * Generate a mock response for testing/fallback
     */
    private generateMockResponse(
        input: string | Message[],
        options: InferenceOptions
    ): string {
        // Extract user message
        let userMessage = '';
        if (Array.isArray(input)) {
            const lastUserMessage = input
                .filter(m => m.role === 'user')
                .pop();
            userMessage = lastUserMessage?.content || 'Hello';
        } else {
            userMessage = input;
        }

        // Simple mock responses based on input
        const mockResponses = [
            `I understand you're asking about "${userMessage.substring(0, 50)}...". This is a mock response. To get real AI responses, please download the model.`,
            `That's an interesting question! In mock mode, I can't provide detailed answers. Please download the TinyLlama model for real AI responses.`,
            `I'd love to help with that! However, I'm currently running in mock mode. Download the model to enable real AI capabilities.`,
        ];

        // Simulate some delay
        const delay = Math.min(options.maxTokens || 50, 200);
        
        // Return a contextual mock response
        const response = mockResponses[Math.floor(Math.random() * mockResponses.length)];
        
        // Truncate to maxTokens if specified
        if (options.maxTokens && response.length > options.maxTokens * 4) {
            return response.substring(0, options.maxTokens * 4) + '...';
        }

        return response;
    }

    /**
     * Clean up resources and unload model
     */
    async cleanup(): Promise<void> {
        if (this.isGenerating) {
            logger.warn('[InferenceEngine] Cleanup called during generation, waiting...');
            const startTime = Date.now();
            while (this.isGenerating && Date.now() - startTime < 5000) {
                await new Promise(r => setTimeout(r, 100));
            }
        }

        try {
            if (this.context && typeof this.context.release === 'function') {
                this.context.release();
            } else if (this.context && typeof this.context.free === 'function') {
                this.context.free();
            }
        } catch (error) {
            logger.warn('[InferenceEngine] Error during cleanup:', error);
        } finally {
            this.context = null;
            this.modelPath = null;
            this.isInitialized = false;
            this.isGenerating = false;
            logger.log('[InferenceEngine] Cleanup complete');
        }
    }

    /**
     * Get current model path
     */
    getModelPath(): string | null {
        return this.modelPath;
    }

    /**
     * Check if generation is in progress
     */
    isGeneratingResponse(): boolean {
        return this.isGenerating;
    }
}

// Export singleton instance
export const inferenceEngine = new InferenceEngine();
