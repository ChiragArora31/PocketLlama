import { Message } from '../store/appStore';
import { MODEL_CONSTANTS } from '../constants/models';
import { logger } from '../utils/logger';

/**
 * Context Window Manager
 * Implements sliding window with semantic chunking
 * Manages what context stays in the window vs what gets archived
 */

export interface ContextWindow {
    activeMessages: Message[];
    archivedMessages: Message[];
    totalTokens: number;
}

export interface EmbeddingResult {
    messageId: string;
    embedding: number[];
}

class ContextWindowManager {
    private activeWindow: Message[] = [];
    private archivedMessages: Message[] = [];

    /**
     * Add a new message to the context window
     * Automatically manages sliding window and archiving
     */
    addMessage(message: Message): void {
        this.activeWindow.push(message);
        this.manageWindow();
    }

    /**
     * Manage the sliding window
     * Keep most recent messages, archive oldest if exceeding window size
     */
    private manageWindow(): void {
        const maxMessages = MODEL_CONSTANTS.SLIDING_WINDOW_SIZE;

        if (this.activeWindow.length > maxMessages) {
            // Archive oldest messages beyond the window
            const messagesToArchive = this.activeWindow.splice(
                0,
                this.activeWindow.length - maxMessages
            );

            this.archivedMessages.push(...messagesToArchive);
            logger.log(`[ContextWindowManager] Archived ${messagesToArchive.length} messages`);
        }
    }

    /**
     * Get current context window
     */
    getActiveWindow(): Message[] {
        return [...this.activeWindow];
    }

    /**
     * Get archived messages
     */
    getArchivedMessages(): Message[] {
        return [...this.archivedMessages];
    }

    /**
     * Calculate cosine similarity between two embeddings
     */
    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            throw new Error('Embeddings must have the same length');
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    /**
     * Retrieve most relevant archived messages based on semantic similarity
     * @param queryEmbedding - Embedding of the current query
     * @param topK - Number of messages to retrieve
     * @returns Array of most relevant archived messages
     */
    retrieveRelevantContext(queryEmbedding: number[], topK: number = MODEL_CONSTANTS.ARCHIVED_MESSAGES_TO_RETRIEVE): Message[] {
        if (this.archivedMessages.length === 0) {
            return [];
        }

        // Filter messages that have embeddings
        const messagesWithEmbeddings = this.archivedMessages.filter(m => m.embedding);

        if (messagesWithEmbeddings.length === 0) {
            return [];
        }

        // Calculate similarity scores
        const scoredMessages = messagesWithEmbeddings.map(message => ({
            message,
            score: this.cosineSimilarity(queryEmbedding, message.embedding!),
        }));

        // Sort by similarity and take top K
        scoredMessages.sort((a, b) => b.score - a.score);
        return scoredMessages.slice(0, topK).map(item => item.message);
    }

    /**
     * Build context for inference
     * Combines active window with relevant archived messages
     */
    buildContext(currentQuery: string, queryEmbedding?: number[]): Message[] {
        const context: Message[] = [];

        // Add relevant archived messages if we have embedding for the query
        if (queryEmbedding && queryEmbedding.length > 0) {
            const relevantArchived = this.retrieveRelevantContext(queryEmbedding);
            context.push(...relevantArchived);
        }

        // Add active window messages
        context.push(...this.activeWindow);

        return context;
    }

    /**
     * Estimate token count for messages
     * Simple heuristic: ~4 chars per token for English text
     */
    estimateTokens(messages: Message[]): number {
        const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
        return Math.ceil(totalChars / 4);
    }

    /**
     * Check if context is within token limit
     */
    isWithinTokenLimit(messages: Message[]): boolean {
        const tokens = this.estimateTokens(messages);
        return tokens <= MODEL_CONSTANTS.MAX_CONTEXT_TOKENS;
    }

    /**
     * Generate simple embedding for a message
     * This is a placeholder - in production, use TensorFlow Lite or similar
     */
    generateEmbedding(text: string): number[] {
        // Simple bag-of-words style embedding (very basic placeholder)
        // In production, use a proper embedding model
        const words = text.toLowerCase().split(/\s+/);
        const embedding = new Array(128).fill(0);

        words.forEach((word, idx) => {
            const hash = this.simpleHash(word);
            const index = hash % 128;
            embedding[index] += 1;
        });

        // Normalize
        const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
        return embedding.map(val => val / (norm || 1));
    }

    /**
     * Simple string hash function
     */
    private simpleHash(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }

    /**
     * Clear all context
     */
    clear(): void {
        this.activeWindow = [];
        this.archivedMessages = [];
    }

    /**
     * Get context statistics
     */
    getStats(): ContextWindow {
        return {
            activeMessages: this.activeWindow,
            archivedMessages: this.archivedMessages,
            totalTokens: this.estimateTokens([...this.activeWindow, ...this.archivedMessages]),
        };
    }
}

// Singleton instance
export const contextWindowManager = new ContextWindowManager();
