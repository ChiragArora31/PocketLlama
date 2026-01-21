import { Platform } from 'react-native';

export interface DeviceCapabilities {
    totalRAM: number; // in GB
    isModern: boolean; // 2020+
    recommendedQuantization: '4-bit' | '8-bit';
}

// Conditionally import expo-device only on native platforms
let Device: any = {
    deviceYearClass: 2022,
    totalMemory: null,
};

if (Platform.OS !== 'web') {
    try {
        Device = require('expo-device');
    } catch (e) {
        // Silent fallback for web platform
    }
}

/**
 * Detects device capabilities and recommends quantization level
 */
export async function detectDeviceCapabilities(): Promise<DeviceCapabilities> {
    // Get device year (rough estimate based on model)
    const deviceYear = Device.deviceYearClass || 2022; // Default to modern device on web
    const isModern = deviceYear >= 2020;

    // Estimate RAM based on device year and model
    // This is a rough heuristic since expo-device doesn't expose RAM directly
    let estimatedRAM = 6; // Default assumption (web gets good default)

    if (Device.totalMemory) {
        // totalMemory is in bytes
        estimatedRAM = Math.round(Device.totalMemory / (1024 * 1024 * 1024));
    } else {
        // Fallback estimation based on device year
        if (deviceYear >= 2022) estimatedRAM = 8;
        else if (deviceYear >= 2020) estimatedRAM = 6;
        else if (deviceYear >= 2018) estimatedRAM = 4;
        else estimatedRAM = 3;
    }

    // Recommend quantization based on RAM
    const recommendedQuantization: '4-bit' | '8-bit' = estimatedRAM >= 6 ? '8-bit' : '4-bit';

    return {
        totalRAM: estimatedRAM,
        isModern,
        recommendedQuantization,
    };
}

/**
 * Returns recommended model ID based on device capabilities
 */
export function getRecommendedModelId(capabilities: DeviceCapabilities): string {
    return capabilities.recommendedQuantization === '8-bit'
        ? 'tinyllama-1.1b-8bit'
        : 'tinyllama-1.1b-4bit';
}
