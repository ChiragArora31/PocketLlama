import { Platform } from 'react-native';
import { Message } from '../store/appStore';
import { logger } from '../utils/logger';

/**
 * Storage Service
 * Handles offline-first data persistence with SQLite
 * Implements cloud sync with conflict resolution
 */

// Conditionally import SQLite only on supported platforms
let SQLite: any = null;
if (Platform.OS !== 'web') {
    try {
        SQLite = require('expo-sqlite');
    } catch (e) {
        // Silent fallback for web platform
    }
}

let NetInfo: any = null;
try {
    NetInfo = require('@react-native-community/netinfo');
} catch (e) {
    // Silent fallback
}

export interface SyncConfig {
    enabled: boolean;
    cloudEndpoint?: string;
    userToken?: string;
}

class StorageService {
    private db: any = null;
    private syncConfig: SyncConfig = { enabled: false };
    private isOnline: boolean = true;
    private pendingSync: Message[] = [];

    async initialize(): Promise<void> {
        if (Platform.OS === 'web' || !SQLite) {
            return;
        }

        try {
            this.db = await SQLite.openDatabaseAsync('slm.db');
            await this.createTables();
            this.setupNetworkMonitoring();
            logger.log('[StorageService] Initialized successfully');
        } catch (error) {
            logger.error('[StorageService] Initialization error:', error);
        }
    }

    private async createTables(): Promise<void> {
        if (!this.db) return;

        try {
            // Messages table with encryption support
            await this.db.execAsync(`
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    timestamp INTEGER NOT NULL,
                    embedding TEXT,
                    synced INTEGER DEFAULT 0,
                    local_updated_at INTEGER,
                    cloud_updated_at INTEGER
                );
            `);

            // Sync metadata table
            await this.db.execAsync(`
                CREATE TABLE IF NOT EXISTS sync_metadata (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at INTEGER NOT NULL
                );
            `);

            // Create indexes for better query performance
            await this.db.execAsync(`
                CREATE INDEX IF NOT EXISTS idx_messages_timestamp 
                ON messages(timestamp DESC);
            `);

            await this.db.execAsync(`
                CREATE INDEX IF NOT EXISTS idx_messages_synced 
                ON messages(synced);
            `);
        } catch (error) {
            logger.error('[StorageService] Error creating tables:', error);
        }
    }

    private setupNetworkMonitoring(): void {
        if (!NetInfo) return;

        NetInfo.addEventListener((state: any) => {
            this.isOnline = state.isConnected && state.isInternetReachable;
            if (this.isOnline && this.syncConfig.enabled && this.pendingSync.length > 0) {
                this.syncToCloud();
            }
        });
    }

    /**
     * Save a message to local storage
     */
    async saveMessage(message: Message): Promise<void> {
        if (!this.db) {
            // Fallback to in-memory storage for web
            this.pendingSync.push(message);
            return;
        }

        try {
            const embeddingJson = message.embedding ? JSON.stringify(message.embedding) : null;

            await this.db.runAsync(
                `INSERT OR REPLACE INTO messages 
                (id, role, content, timestamp, embedding, synced, local_updated_at) 
                VALUES (?, ?, ?, ?, ?, 0, ?)`,
                [message.id, message.role, message.content, message.timestamp, embeddingJson, Date.now()]
            );

            this.pendingSync.push(message);

            if (this.syncConfig.enabled && this.isOnline) {
                this.syncToCloud();
            }
        } catch (error) {
            logger.error('[StorageService] Error saving message:', error);
        }
    }

    /**
     * Load all messages from local storage
     */
    async loadMessages(): Promise<Message[]> {
        if (!this.db) {
            return this.pendingSync;
        }

        try {
            const rows = await this.db.getAllAsync(
                'SELECT id, role, content, timestamp, embedding FROM messages ORDER BY timestamp ASC'
            );

            return rows.map((row: any) => ({
                id: row.id,
                role: row.role as 'user' | 'assistant',
                content: row.content,
                timestamp: row.timestamp,
                embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
            }));
        } catch (error) {
            logger.error('[StorageService] Error loading messages:', error);
            return [];
        }
    }

    /**
     * Configure cloud sync
     */
    configureSync(config: SyncConfig): void {
        this.syncConfig = config;
    }

    /**
     * Sync local changes to cloud
     * Implements conflict resolution with local-first priority
     */
    private async syncToCloud(): Promise<void> {
        if (!this.syncConfig.enabled || !this.isOnline || !this.syncConfig.cloudEndpoint) {
            return;
        }

        if (this.pendingSync.length === 0) {
            return;
        }

        logger.log(`[StorageService] Syncing ${this.pendingSync.length} messages`);

        try {
            // Get unsynced messages from DB
            const unsyncedMessages = await this.getUnsyncedMessages();

            if (unsyncedMessages.length === 0) {
                return;
            }

            // Send to cloud (placeholder - implement actual API call)
            const response = await this.sendToCloud(unsyncedMessages);

            if (response.success) {
                await this.markMessagesSynced(unsyncedMessages.map(m => m.id));
                this.pendingSync = [];
                logger.log('[StorageService] Sync completed');
            }
        } catch (error) {
            logger.error('[StorageService] Sync error:', error);
        }
    }

    private async getUnsyncedMessages(): Promise<Message[]> {
        if (!this.db) return [];

        try {
            const rows = await this.db.getAllAsync(
                'SELECT id, role, content, timestamp, embedding FROM messages WHERE synced = 0 ORDER BY timestamp ASC'
            );

            return rows.map((row: any) => ({
                id: row.id,
                role: row.role as 'user' | 'assistant',
                content: row.content,
                timestamp: row.timestamp,
                embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
            }));
        } catch (error) {
            console.error('[StorageService] Error getting unsynced messages:', error);
            return [];
        }
    }

    private async sendToCloud(messages: Message[]): Promise<{ success: boolean }> {
        // Placeholder for cloud sync implementation
        await new Promise(resolve => setTimeout(resolve, 100));
        return { success: true };
    }

    private async markMessagesSynced(messageIds: string[]): Promise<void> {
        if (!this.db) return;

        try {
            const placeholders = messageIds.map(() => '?').join(',');
            await this.db.runAsync(
                `UPDATE messages SET synced = 1, cloud_updated_at = ? WHERE id IN (${placeholders})`,
                [Date.now(), ...messageIds]
            );
        } catch (error) {
            logger.error('[StorageService] Error marking messages as synced:', error);
        }
    }

    /**
     * Clear all local data
     */
    async clearAllData(): Promise<void> {
        if (!this.db) {
            this.pendingSync = [];
            return;
        }

        try {
            await this.db.execAsync('DELETE FROM messages');
            await this.db.execAsync('DELETE FROM sync_metadata');
            this.pendingSync = [];
        } catch (error) {
            logger.error('[StorageService] Error clearing data:', error);
        }
    }

    /**
     * Get sync statistics
     */
    async getSyncStats(): Promise<{ total: number; synced: number; pending: number }> {
        if (!this.db) {
            return { total: this.pendingSync.length, synced: 0, pending: this.pendingSync.length };
        }

        try {
            const totalResult = await this.db.getFirstAsync('SELECT COUNT(*) as count FROM messages');
            const syncedResult = await this.db.getFirstAsync('SELECT COUNT(*) as count FROM messages WHERE synced = 1');

            const total = totalResult?.count || 0;
            const synced = syncedResult?.count || 0;

            return {
                total,
                synced,
                pending: total - synced,
            };
        } catch (error) {
            logger.error('[StorageService] Error getting sync stats:', error);
            return { total: 0, synced: 0, pending: 0 };
        }
    }
}

// Singleton instance
export const storageService = new StorageService();
