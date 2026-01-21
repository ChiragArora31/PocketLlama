import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    FlatList,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native';
import { useAppStore } from '../store/appStore';
import { ChatBubble } from '../components/ChatBubble';
import { modelManager } from '../services/ModelManager';
import { inferenceEngine } from '../services/InferenceEngine';
import { detectDeviceCapabilities, getRecommendedModelId } from '../utils/quantization';
import { batteryOptimizationService } from '../services/BatteryOptimizationService';
import { contextWindowManager } from '../services/ContextWindowManager';
import { storageService } from '../services/StorageService';
import { AVAILABLE_MODELS } from '../constants/models';
import { logger } from '../utils/logger';

export default function ChatScreen() {
    const [inputText, setInputText] = useState('');
    const {
        messages,
        isLoading,
        isModelLoaded,
        currentModelId,
        downloadProgress,
        addMessage,
        setLoading,
        setModelLoaded,
        setCurrentModel,
        setDeviceCapabilities,
        setDownloadProgress,
    } = useAppStore();

    // Initialize device capabilities and model on mount
    useEffect(() => {
        initializeApp();
    }, []);

    const initializeApp = async () => {
        try {
            // Initialize services
            await batteryOptimizationService.initialize();
            await storageService.initialize();

            // Detect device capabilities
            const capabilities = await detectDeviceCapabilities();
            setDeviceCapabilities(capabilities.totalRAM, capabilities.recommendedQuantization);

            const recommendedModelId = getRecommendedModelId(capabilities);
            logger.log('[ChatScreen] Recommended model:', recommendedModelId);

            // Check if model is downloaded
            const isDownloaded = await modelManager.isModelDownloaded(recommendedModelId);

            if (!isDownloaded && Platform.OS !== 'web') {
                // On native platforms, offer to download the model
                Alert.alert(
                    'Download AI Model',
                    `To enable offline AI, download TinyLlama model (${capabilities.recommendedQuantization})?\n\nSize: ${AVAILABLE_MODELS.find(m => m.id === recommendedModelId)?.size}\n\nThis enables real AI responses without internet.`,
                    [
                        { text: 'Later', style: 'cancel' },
                        {
                            text: 'Download',
                            onPress: async () => {
                                try {
                                    setLoading(true);
                                    await modelManager.downloadModel(
                                        recommendedModelId,
                                        (progress) => {
                                            setDownloadProgress(progress);
                                        }
                                    );
                                    Alert.alert('Success', 'Model downloaded! You can now use offline AI.');
                                    setDownloadProgress(0);
                                } catch (error) {
                                    logger.error('[ChatScreen] Download error:', error);
                                    Alert.alert('Error', 'Failed to download model. You can try again later.');
                                } finally {
                                    setLoading(false);
                                }
                            }
                        }
                    ]
                );
            } else if (!isDownloaded && Platform.OS === 'web') {
                // On web, explain limitation
                Alert.alert(
                    'Web Platform',
                    'Real AI models cannot run in web browsers.\n\nTo get real offline AI:\n1. Build development client (see NATIVE_BUILD_GUIDE.md)\n2. Download TinyLlama model\n3. Chat works 100% offline!',
                    [{ text: 'OK' }]
                );
            }

            setCurrentModel(recommendedModelId);

            const savedMessages = await storageService.loadMessages();
            if (savedMessages.length > 0) {
                logger.log(`[ChatScreen] Loaded ${savedMessages.length} messages from storage`);
                savedMessages.forEach(msg => {
                    contextWindowManager.addMessage(msg);
                });
            }
        } catch (error) {
            logger.error('[ChatScreen] Initialization error:', error);
        }
    };

    const handleSend = async () => {
        if (!inputText.trim()) return;

        const userMessage = inputText.trim();
        setInputText('');

        // Create user message with embedding
        const userMsg = {
            role: 'user' as const,
            content: userMessage,
        };

        // Add user message to store and context manager
        addMessage(userMsg);
        const userMsgWithId = messages[messages.length] || {
            ...userMsg,
            id: Date.now().toString(),
            timestamp: Date.now()
        };

        // Generate embedding and add to context window
        const embedding = contextWindowManager.generateEmbedding(userMessage);
        const userMsgComplete = { ...userMsgWithId, embedding };
        contextWindowManager.addMessage(userMsgComplete);

        // Save to storage
        await storageService.saveMessage(userMsgComplete);

        setLoading(true);

        try {
            if (!isModelLoaded && currentModelId) {
                const isDownloaded = await modelManager.isModelDownloaded(currentModelId);

                if (isDownloaded) {
                    const modelFile = modelManager.getModelFile(currentModelId);
                    const modelPath = modelFile.uri;

                    try {
                        await inferenceEngine.initialize(modelPath);
                        if (!inferenceEngine.isLoaded()) {
                            throw new Error('Model initialization completed but engine reports not loaded');
                        }
                        setModelLoaded(true);
                    } catch (initError: any) {
                        logger.error('[ChatScreen] Model initialization failed:', initError);
                        await inferenceEngine.initialize('mock');
                        setModelLoaded(true);
                    }
                } else {
                    await inferenceEngine.initialize('mock');
                    setModelLoaded(true);
                }
            }

            // Double-check that engine is loaded before generating
            if (!inferenceEngine.isLoaded()) {
                throw new Error('Inference engine is not loaded. Please wait for initialization.');
            }

            const userEmbedding = contextWindowManager.generateEmbedding(userMessage);
            const contextMessages = contextWindowManager.buildContext(userMessage, userEmbedding);
            
            const inferenceMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = 
                contextMessages
                    .filter(msg => msg && msg.content && msg.content.trim().length > 0)
                    .map(msg => ({
                        role: msg.role,
                        content: msg.content.trim()
                    }));

            const hasCurrentUserMessage = inferenceMessages.some(
                msg => msg.role === 'user' && msg.content === userMessage.trim()
            );
            
            if (!hasCurrentUserMessage) {
                inferenceMessages.push({
                    role: 'user',
                    content: userMessage.trim()
                });
            }

            const shouldThrottle = batteryOptimizationService.shouldThrottleInference();
            if (shouldThrottle) {
                const delay = batteryOptimizationService.getRecommendedDelay();
                await new Promise(r => setTimeout(r, delay));
            }

            const response = await inferenceEngine.generate(inferenceMessages, {
                maxTokens: 120,
                temperature: 0.7,
                topP: 0.9,
                repeatPenalty: 1.1
            });

            // Create assistant message with embedding
            const assistantMsg = {
                role: 'assistant' as const,
                content: response,
            };

            addMessage(assistantMsg);
            const assistantMsgWithId = {
                ...assistantMsg,
                id: (Date.now() + 1).toString(),
                timestamp: Date.now() + 1
            };

            // Generate embedding and add to context window
            const responseEmbedding = contextWindowManager.generateEmbedding(response);
            const assistantMsgComplete = { ...assistantMsgWithId, embedding: responseEmbedding };
            contextWindowManager.addMessage(assistantMsgComplete);

            // Save to storage
            await storageService.saveMessage(assistantMsgComplete);

        } catch (error: any) {
            logger.error('[ChatScreen] Error generating response:', error);

            const errorMessage = error?.message || String(error);
            let userMessage = 'Sorry, I encountered an error. Please try again.';

            // Provide specific error messages based on error type
            if (errorMessage.includes('development build') || errorMessage.includes('Expo Go')) {
                userMessage = '⚠️ Real AI requires a development build.\n\nYou\'re using Expo Go which doesn\'t support llama.rn.\n\nSee NATIVE_BUILD_GUIDE.md or run:\nnpx expo prebuild && npx expo run:ios';
            } else if (errorMessage.includes('not initialized') || errorMessage.includes('not loaded')) {
                userMessage = '⚠️ Model not loaded. Please wait for the model to initialize, or restart the app.';
            } else if (errorMessage.includes('timeout')) {
                userMessage = '⏱️ Request timed out. The model may be processing slowly. Please try again with a shorter message.';
            } else if (errorMessage.includes('memory')) {
                userMessage = '💾 Insufficient memory. Try closing other apps or restarting your device.';
            } else if (errorMessage.includes('empty') || errorMessage.includes('Invalid response')) {
                userMessage = '⚠️ Model returned an empty response. This might be a model issue. Please try again or check if the model is properly loaded.';
            } else {
                // Include error details for debugging (in development)
                if (__DEV__) {
                    userMessage = `Error: ${errorMessage.substring(0, 200)}`;
                }
            }

            const errorMsg = {
                role: 'assistant' as const,
                content: userMessage,
            };
            addMessage(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>TinyLlama Chat</Text>
                    <Text style={styles.headerSubtitle}>
                        {currentModelId ? `Model: ${currentModelId}` : 'Initializing...'}
                    </Text>
                </View>

                {/* Messages */}
                <FlatList
                    data={messages}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => <ChatBubble message={item} />}
                    contentContainerStyle={styles.messagesList}
                    inverted={false}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyText}>
                                Welcome! Start chatting with TinyLlama.
                            </Text>
                            <Text style={styles.emptySubtext}>
                                Start a conversation to begin chatting
                            </Text>
                        </View>
                    }
                />

                {/* Input */}
                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        value={inputText}
                        onChangeText={setInputText}
                        placeholder="Type a message..."
                        placeholderTextColor="#999"
                        multiline
                        maxLength={500}
                        editable={!isLoading}
                    />
                    <TouchableOpacity
                        style={[styles.sendButton, isLoading && styles.sendButtonDisabled]}
                        onPress={handleSend}
                        disabled={isLoading || !inputText.trim()}
                    >
                        {isLoading ? (
                            <ActivityIndicator color="#FFF" size="small" />
                        ) : (
                            <Text style={styles.sendButtonText}>Send</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8F9FA',
    },
    header: {
        backgroundColor: '#007AFF',
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#FFF',
    },
    headerSubtitle: {
        fontSize: 12,
        color: '#FFF',
        opacity: 0.8,
        marginTop: 2,
    },
    messagesList: {
        paddingVertical: 12,
        flexGrow: 1,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
        marginTop: 100,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: '500',
        color: '#333',
        textAlign: 'center',
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        lineHeight: 20,
    },
    inputContainer: {
        flexDirection: 'row',
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: '#FFF',
        borderTopWidth: 1,
        borderTopColor: '#E0E0E0',
        alignItems: 'center',
    },
    input: {
        flex: 1,
        backgroundColor: '#F0F0F0',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
        fontSize: 16,
        maxHeight: 100,
        marginRight: 8,
    },
    sendButton: {
        backgroundColor: '#007AFF',
        borderRadius: 20,
        paddingHorizontal: 20,
        paddingVertical: 10,
        justifyContent: 'center',
        alignItems: 'center',
        minWidth: 70,
    },
    sendButtonDisabled: {
        opacity: 0.5,
    },
    sendButtonText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '600',
    },
});
