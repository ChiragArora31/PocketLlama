# PocketLlama

Privacy-first mobile AI chat application powered by TinyLlama, enabling completely offline inference on iOS and Android devices.

## Overview

PocketLlama is a mobile application that runs Small Language Models (SLMs) directly on device, providing AI-powered chat capabilities without requiring internet connectivity or cloud services. Built with React Native and leveraging llama.cpp through the llama.rn library, it demonstrates efficient on-device inference with quantized models.

**Key Features:**
- Complete offline operation after initial model download
- Zero API costs and complete data privacy
- Optimized for mobile constraints (battery, memory, storage)
- Support for 4-bit and 8-bit quantized models
- Intelligent context window management
- Battery-aware inference throttling

## Technical Architecture

**Core Technologies:**
- **Runtime:** React Native with Expo
- **Inference Engine:** llama.cpp via llama.rn bindings
- **Model:** TinyLlama 1.1B (GGUF format)
- **State Management:** Zustand
- **Storage:** expo-sqlite (native), in-memory fallback (web)
- **Language:** TypeScript

**Platform Support:**
- iOS (native inference)
- Android (native inference)  
- Web (UI testing only, mock responses)

## Model Information

The application uses TinyLlama 1.1B, a compact language model optimized for resource-constrained environments:

| Variant | Size | Precision | Recommended RAM | Use Case |
|---------|------|-----------|-----------------|----------|
| Q4_K_M | 600MB | 4-bit | 2-4GB | Older devices, faster inference |
| Q8_0 | 1.1GB | 8-bit | 6-8GB+ | Modern devices, better quality |

Models are in GGUF format and downloaded on first launch. The application automatically selects the appropriate variant based on device capabilities.

## Installation

### Prerequisites

- Node.js 18+ and npm
- Expo CLI
- For iOS development: macOS with Xcode
- For Android development: Android Studio and SDK

### Setup

```bash
# Clone the repository
git clone https://github.com/ChiragArora31/PocketLlama.git
cd PocketLlama

# Install dependencies
npm install

# Start development server
npm start
```

### Platform-Specific Commands

```bash
# iOS (requires macOS and Xcode)
npm run ios

# Android (requires Android Studio)
npm run android

# Web (for UI testing only)
npm run web
```

## Project Structure

```
PocketLlama/
├── app/
│   ├── (tabs)/              # Screen components
│   ├── components/          # Reusable UI components
│   ├── constants/           # Model configurations
│   ├── services/            # Core business logic
│   │   ├── InferenceEngine.ts
│   │   ├── ModelManager.ts
│   │   ├── ContextWindowManager.ts
│   │   ├── BatteryOptimizationService.ts
│   │   └── StorageService.ts
│   ├── store/               # Global state management
│   └── utils/               # Helper functions
├── models/                  # Downloaded model files (gitignored)
└── native/                  # Native module configurations
```

## Key Components

### InferenceEngine
Manages llama.cpp integration and inference execution. Handles:
- Model initialization with llama.rn
- Chat template formatting
- Token generation with configurable parameters
- Response post-processing

### ModelManager
Controls model lifecycle:
- Device capability detection
- Model download with progress tracking
- Lazy loading and memory management
- Automatic cleanup on memory pressure

### ContextWindowManager
Implements sliding window context management:
- 2048 token limit enforcement
- Message archival and retrieval
- Semantic similarity search for relevant context

### BatteryOptimizationService
Battery-aware inference management:
- Adaptive batching based on battery level
- Inference throttling in low-power mode
- Configurable processing delays

## Configuration

Model configurations are defined in `app/constants/models.ts`:

```typescript
{
  id: 'tinyllama-1.1b-4bit',
  name: 'TinyLlama 1.1B (4-bit)',
  quantization: '4-bit',
  contextWindow: 2048,
  downloadUrl: 'https://huggingface.co/TheBloke/...',
  minRAM: 2
}
```

## Development

### Running Tests

The application includes comprehensive testing for UI components and core services. Web platform can be used for rapid UI iteration.

### Building for Production

```bash
# iOS
eas build --platform ios

# Android
eas build --platform android
```

Refer to `eas.json` for build configuration.

## Technical Considerations

**Memory Management:**
- Implements memory pressure monitoring
- Automatic model unloading at 85% memory usage
- Optimized for devices with 2-8GB RAM

**Battery Optimization:**
- Dynamic inference batching
- Low-power mode detection
- Configurable throttling thresholds

**Platform Differences:**
- Native platforms: Full llama.cpp inference
- Web platform: Mock responses for UI testing

## Contributing

Contributions are welcome. Please ensure:
- Code follows TypeScript best practices
- Changes maintain cross-platform compatibility
- New features include appropriate error handling

## License

MIT License - See LICENSE file for details

## Acknowledgments

- llama.cpp by Georgi Gerganov
- TinyLlama model by TinyLlama team
- llama.rn React Native bindings

---

**Note:** This is an educational project demonstrating on-device AI inference on mobile platforms. Model capabilities are limited compared to cloud-based LLMs.
