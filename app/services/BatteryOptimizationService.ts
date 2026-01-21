import { Platform } from 'react-native';
import { logger } from '../utils/logger';

/**
 * Battery Optimization Service
 * Handles inference throttling based on battery status
 * Implements batching and deferral strategies
 */

export interface BatteryStatus {
    level: number; // 0-1
    isCharging: boolean;
    isLowPowerMode: boolean;
}

export interface BatchConfig {
    maxBatchSize: number;
    maxWaitTimeMs: number;
}

// Conditionally import expo-battery only on native platforms
let Battery: any = null;
if (Platform.OS !== 'web') {
    try {
        Battery = require('expo-battery');
    } catch (e) {
        // Silent fallback for web platform
    }
}

class BatteryOptimizationService {
    private currentBatteryLevel: number = 1.0;
    private isCharging: boolean = false;
    private isLowPowerMode: boolean = false;
    private pendingInferenceQueue: Array<{
        prompt: string;
        resolve: (value: string) => void;
        reject: (reason: any) => void;
        timestamp: number;
    }> = [];
    private batchInterval: NodeJS.Timeout | null = null;

    async initialize(): Promise<void> {
        if (Platform.OS === 'web' || !Battery) {
            return;
        }

        await this.updateBatteryStatus();

        Battery.addBatteryLevelListener(({ batteryLevel }: any) => {
            this.currentBatteryLevel = batteryLevel;
        });

        Battery.addBatteryStateListener(({ batteryState }: any) => {
            this.isCharging = batteryState === Battery.BatteryState.CHARGING || batteryState === Battery.BatteryState.FULL;
        });

        Battery.addLowPowerModeListener(({ lowPowerMode }: any) => {
            this.isLowPowerMode = lowPowerMode;
        });
    }

    private async updateBatteryStatus(): Promise<void> {
        if (!Battery) return;

        try {
            this.currentBatteryLevel = await Battery.getBatteryLevelAsync();
            const batteryState = await Battery.getBatteryStateAsync();
            this.isCharging = batteryState === Battery.BatteryState.CHARGING || batteryState === Battery.BatteryState.FULL;
            this.isLowPowerMode = await Battery.isLowPowerModeEnabledAsync();
        } catch (error) {
            console.error('[BatteryOptimization] Error updating battery status:', error);
        }
    }

    getBatteryStatus(): BatteryStatus {
        return {
            level: this.currentBatteryLevel,
            isCharging: this.isCharging,
            isLowPowerMode: this.isLowPowerMode,
        };
    }

    /**
     * Check if inference should be throttled based on battery status
     */
    shouldThrottleInference(): boolean {
        // Don't throttle if charging
        if (this.isCharging) {
            return false;
        }

        if (this.currentBatteryLevel < 0.20 || this.isLowPowerMode) {
            logger.log('[BatteryOptimization] Throttling inference due to low battery');
            return true;
        }

        return false;
    }

    /**
     * Check if non-critical processing should be deferred
     */
    shouldDeferNonCritical(): boolean {
        // Defer if battery is below 15% or in low power mode
        if (this.currentBatteryLevel < 0.15 || this.isLowPowerMode) {
            return true;
        }

        return false;
    }

    /**
     * Get recommended batch configuration based on battery status
     */
    getBatchConfig(): BatchConfig {
        if (this.isCharging) {
            // When charging, process quickly with smaller batches
            return {
                maxBatchSize: 1,
                maxWaitTimeMs: 100,
            };
        }

        if (this.currentBatteryLevel < 0.20 || this.isLowPowerMode) {
            // Low battery: larger batches, longer wait
            return {
                maxBatchSize: 5,
                maxWaitTimeMs: 5000, // Wait up to 5 seconds
            };
        }

        if (this.currentBatteryLevel < 0.50) {
            // Medium battery: moderate batching
            return {
                maxBatchSize: 3,
                maxWaitTimeMs: 2000,
            };
        }

        // High battery: minimal batching
        return {
            maxBatchSize: 2,
            maxWaitTimeMs: 1000,
        };
    }

    /**
     * Add inference request to batch queue
     * Returns a promise that resolves when the inference is processed
     */
    async queueInference(
        prompt: string,
        inferenceCallback: (prompts: string[]) => Promise<string[]>
    ): Promise<string> {
        const config = this.getBatchConfig();

        return new Promise<string>((resolve, reject) => {
            this.pendingInferenceQueue.push({
                prompt,
                resolve,
                reject,
                timestamp: Date.now(),
            });

            // If batch is full, process immediately
            if (this.pendingInferenceQueue.length >= config.maxBatchSize) {
                this.processBatch(inferenceCallback);
            } else if (!this.batchInterval) {
                // Start timer to process batch after maxWaitTimeMs
                this.batchInterval = setTimeout(() => {
                    this.processBatch(inferenceCallback);
                }, config.maxWaitTimeMs);
            }
        });
    }

    /**
     * Process pending inference batch
     */
    private async processBatch(
        inferenceCallback: (prompts: string[]) => Promise<string[]>
    ): Promise<void> {
        if (this.batchInterval) {
            clearTimeout(this.batchInterval);
            this.batchInterval = null;
        }

        if (this.pendingInferenceQueue.length === 0) {
            return;
        }

        const batch = [...this.pendingInferenceQueue];
        this.pendingInferenceQueue = [];
        logger.log(`[BatteryOptimization] Processing batch of ${batch.length} requests`);

        try {
            const prompts = batch.map(item => item.prompt);
            const results = await inferenceCallback(prompts);

            // Resolve all promises with their respective results
            batch.forEach((item, index) => {
                item.resolve(results[index]);
            });
        } catch (error) {
            // Reject all promises on error
            batch.forEach(item => {
                item.reject(error);
            });
        }
    }

    /**
     * Get recommended delay before processing based on battery status
     */
    getRecommendedDelay(): number {
        if (this.isCharging) return 0;
        if (this.currentBatteryLevel < 0.15) return 5000; // 5s delay on critical battery
        if (this.currentBatteryLevel < 0.30) return 2000; // 2s delay on low battery
        return 0;
    }

    cleanup(): void {
        if (this.batchInterval) {
            clearTimeout(this.batchInterval);
            this.batchInterval = null;
        }
    }
}

// Singleton instance
export const batteryOptimizationService = new BatteryOptimizationService();
