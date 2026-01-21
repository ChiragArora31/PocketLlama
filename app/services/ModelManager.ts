import { Platform } from 'react-native';
import { AVAILABLE_MODELS } from '../constants/models';
import { inferenceEngine } from './InferenceEngine';
import { getMemoryStats, registerMemoryWarningCallback } from '../utils/memoryMonitor';
import { logger } from '../utils/logger';

// Web-compatible dummy classes for paths/files
class DummyDirectory {
    constructor(...args: any[]) { }
    get exists() { return false; }
    create() { }
}

class DummyFile {
    constructor(...args: any[]) { }
    get exists() { return false; }
    get uri() { return 'mock://file'; }
    delete() { }
}

// Conditionally import expo-file-system only on native platforms
let Paths: any = { document: new DummyDirectory() };
let File: any = DummyFile;
let Directory: any = DummyDirectory;

if (Platform.OS !== 'web') {
    try {
        const FileSystem = require('expo-file-system');
        Paths = FileSystem.Paths;
        File = FileSystem.File;
        Directory = FileSystem.Directory;
    } catch (e) {
        // Silent fallback for web platform
    }
}

/**
 * ModelManager - Handles lazy loading, unloading, and lifecycle of SLM models
 */

class ModelManager {
    private loadedModelId: string | null = null;
    private memoryCleanup: (() => void) | null = null;
    private modelsDir: any;

    constructor() {
        // Create models directory reference
        this.modelsDir = new Directory(Paths.document, 'models');
    }

    /**
     * Get the File reference for a model
     */
    public getModelFile(modelId: string): any {
        return new File(this.modelsDir, `${modelId}.gguf`);
    }

    /**
     * Check if model is already downloaded
     */
    async isModelDownloaded(modelId: string): Promise<boolean> {
        const file = this.getModelFile(modelId);
        return file.exists;
    }

    /**
     * Download a model with progress tracking
     * Using legacy API for reliable downloads with progress callbacks
     */
    async downloadModel(
        modelId: string,
        onProgress?: (progress: number) => void
    ): Promise<void> {
        if (Platform.OS === 'web') {
            throw new Error('Model download is not supported on web. Please use iOS or Android for offline AI.');
        }

        const model = AVAILABLE_MODELS.find(m => m.id === modelId);
        if (!model) {
            throw new Error(`Model ${modelId} not found`);
        }

        const file = this.getModelFile(modelId);

        // Ensure models directory exists
        if (!this.modelsDir.exists) {
            this.modelsDir.create();
        }

        logger.log(`[ModelManager] Downloading ${model.name} (${model.size})`);

        try {
            // Use legacy FileSystem API for downloads with progress
            // Import from expo-file-system/legacy as recommended by Expo
            const FileSystem = require('expo-file-system/legacy');

            const downloadResumable = FileSystem.createDownloadResumable(
                model.downloadUrl,
                file.uri,
                {},
                (downloadProgress: any) => {
                    const progress = (downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite) * 100;
                    logger.log(`[ModelManager] Download progress: ${progress.toFixed(1)}%`);
                    if (onProgress) {
                        onProgress(progress);
                    }
                }
            );

            const result = await downloadResumable.downloadAsync();

            if (!result || !result.uri) {
                throw new Error('Download failed - no result returned');
            }

            if (!file.exists) {
                throw new Error('Download completed but file not found');
            }

            logger.log('[ModelManager] Download verified successfully');
        } catch (error) {
            logger.error('[ModelManager] Download error:', error);
            try {
                if (file.exists) {
                    file.delete();
                    logger.log('[ModelManager] Cleaned up partial download');
                }
            } catch (cleanupError) {
                logger.error('[ModelManager] Cleanup error:', cleanupError);
            }
            throw error;
        }
    }

    /**
     * Lazy load a model (only loads when needed)
     */
    async loadModel(modelId: string): Promise<void> {
        if (this.loadedModelId === modelId && inferenceEngine.isLoaded()) {
            logger.log(`[ModelManager] Model ${modelId} already loaded`);
            return;
        }

        if (this.loadedModelId) {
            await this.unloadModel();
        }

        const file = this.getModelFile(modelId);
        logger.log(`[ModelManager] Loading model from ${file.uri}`);

        await inferenceEngine.initialize(file.uri);
        this.loadedModelId = modelId;
        this.setupMemoryMonitoring();

        logger.log(`[ModelManager] Model ${modelId} loaded successfully`);
    }

    /**
     * Unload the current model from memory
     */
    async unloadModel(): Promise<void> {
        if (!this.loadedModelId) {
            return;
        }

        logger.log(`[ModelManager] Unloading model ${this.loadedModelId}`);
        await inferenceEngine.cleanup();
        this.loadedModelId = null;

        if (this.memoryCleanup) {
            this.memoryCleanup();
            this.memoryCleanup = null;
        }

        logger.log('[ModelManager] Model unloaded');
    }

    /**
     * Setup memory pressure monitoring
     */
    private setupMemoryMonitoring(): void {
        this.memoryCleanup = registerMemoryWarningCallback(async () => {
            const stats = getMemoryStats();
            logger.warn(`[ModelManager] Memory warning: ${stats.percentageUsed.toFixed(1)}%`);

            if (stats.percentageUsed > 85) {
                logger.warn('[ModelManager] Severe memory pressure - unloading model');
                await this.unloadModel();
            }
        });
    }

    /**
     * Preload model during idle time (when battery is not critical)
     */
    async preloadModel(modelId: string): Promise<void> {
        logger.log(`[ModelManager] Preloading model ${modelId}...`);
        await this.loadModel(modelId);
    }

    /**
     * Get currently loaded model ID
     */
    getCurrentModelId(): string | null {
        return this.loadedModelId;
    }

    /**
     * Delete a downloaded model
     */
    async deleteModel(modelId: string): Promise<void> {
        // Unload if currently loaded
        if (this.loadedModelId === modelId) {
            await this.unloadModel();
        }

        const file = this.getModelFile(modelId);
        if (file.exists) {
            file.delete();
            logger.log(`[ModelManager] Deleted model ${modelId}`);
        }
    }
}

// Singleton instance
export const modelManager = new ModelManager();
