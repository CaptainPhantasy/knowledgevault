class StorageManager {
    constructor() {
        this.dbName = 'KnowledgeVault';
        this.dbVersion = 1;
        this.db = null;
        this.searchIndex = new Map();
        this.ipfsConfig = {
            enabled: false,
            gateway: 'https://w3s.link/ipfs',
            uploadEndpoint: 'https://api.web3.storage',
            apiKey: null, // User needs to provide this
            autoBackup: false,
            maxFileSize: 10 * 1024 * 1024, // 10MB
            backupQueue: new Set(),
            lastBackup: null
        };
        this.init();
    }

    async init() {
        try {
            this.db = await this.openDatabase();
            await this.loadSearchIndex();
            await this.initIPFS();
            eventBus.emit('storage:ready');
        } catch (error) {
            console.error('StorageManager initialization failed:', error);
            eventBus.emit('storage:error', error);
        }
    }

    openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains('knowledge')) {
                    const store = db.createObjectStore('knowledge', { keyPath: 'id' });
                    store.createIndex('title', 'title', { unique: false });
                    store.createIndex('category', 'category', { unique: false });
                    store.createIndex('language', 'language', { unique: false });
                    store.createIndex('tags', 'tags', { unique: false, multiEntry: true });
                    store.createIndex('created', 'created', { unique: false });
                    store.createIndex('modified', 'modified', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('drafts')) {
                    db.createObjectStore('drafts', { keyPath: 'id' });
                }
                
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    }

    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    async saveKnowledge(item) {
        try {
            const transaction = this.db.transaction(['knowledge'], 'readwrite');
            const store = transaction.objectStore('knowledge');
            
            if (!item.id) {
                item.id = this.generateUUID();
                item.created = new Date().toISOString();
            }
            
            item.modified = new Date().toISOString();
            
            if (!item.title || !item.content) {
                throw new Error('Title and content are required');
            }
            
            if (typeof item.tags === 'string') {
                item.tags = item.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
            }
            
            const result = await new Promise((resolve, reject) => {
                const request = store.put(item);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            
            this.updateSearchIndex(item);
            
            eventBus.emit('storage:save:complete', {
                id: item.id,
                item: item
            });
            
            return result;
            
        } catch (error) {
            console.error('Failed to save knowledge:', error);
            eventBus.emit('storage:error', error);
            throw error;
        }
    }

    async getKnowledge(id) {
        try {
            const transaction = this.db.transaction(['knowledge'], 'readonly');
            const store = transaction.objectStore('knowledge');
            
            const result = await new Promise((resolve, reject) => {
                const request = store.get(id);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            
            return result;
            
        } catch (error) {
            console.error('Failed to get knowledge:', error);
            throw error;
        }
    }

    async getAllKnowledge() {
        try {
            const transaction = this.db.transaction(['knowledge'], 'readonly');
            const store = transaction.objectStore('knowledge');
            const index = store.index('created');
            
            const result = await new Promise((resolve, reject) => {
                const request = index.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            
            return result.sort((a, b) => new Date(b.created) - new Date(a.created));
            
        } catch (error) {
            console.error('Failed to get all knowledge:', error);
            throw error;
        }
    }

    async searchKnowledge(query, filters = {}) {
        try {
            const startTime = performance.now();
            
            const allItems = await this.getAllKnowledge();
            let results = allItems;
            
            if (filters.category) {
                results = results.filter(item => item.category === filters.category);
            }
            
            if (filters.language) {
                results = results.filter(item => item.language === filters.language);
            }
            
            if (filters.dateFrom) {
                const fromDate = new Date(filters.dateFrom);
                results = results.filter(item => new Date(item.created) >= fromDate);
            }
            
            if (filters.dateTo) {
                const toDate = new Date(filters.dateTo);
                toDate.setHours(23, 59, 59, 999);
                results = results.filter(item => new Date(item.created) <= toDate);
            }
            
            if (query && query.trim()) {
                const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 0);
                
                results = results.filter(item => {
                    const searchableText = [
                        item.title || '',
                        item.content || '',
                        ...(item.tags || [])
                    ].join(' ').toLowerCase();
                    
                    return searchTerms.every(term => {
                        return searchableText.includes(term) || 
                               this.fuzzyMatch(term, searchableText);
                    });
                });
                
                results.sort((a, b) => {
                    const aScore = this.calculateRelevanceScore(a, searchTerms);
                    const bScore = this.calculateRelevanceScore(b, searchTerms);
                    return bScore - aScore;
                });
            }
            
            const endTime = performance.now();
            console.log(`Search completed in ${endTime - startTime}ms`);
            
            return results;
            
        } catch (error) {
            console.error('Search failed:', error);
            throw error;
        }
    }

    fuzzyMatch(term, text) {
        const threshold = 0.8;
        const words = text.split(' ');
        
        return words.some(word => {
            if (word.length === 0 || term.length === 0) return false;
            
            const distance = this.levenshteinDistance(term, word);
            const maxLength = Math.max(term.length, word.length);
            const similarity = 1 - (distance / maxLength);
            
            return similarity >= threshold;
        });
    }

    levenshteinDistance(a, b) {
        const matrix = [];
        
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[b.length][a.length];
    }

    calculateRelevanceScore(item, searchTerms) {
        let score = 0;
        const title = (item.title || '').toLowerCase();
        const content = (item.content || '').toLowerCase();
        const tags = (item.tags || []).join(' ').toLowerCase();
        
        searchTerms.forEach(term => {
            if (title.includes(term)) score += 10;
            if (tags.includes(term)) score += 8;
            if (content.includes(term)) score += 5;
            
            const titleWords = title.split(' ');
            const contentWords = content.split(' ');
            
            if (titleWords.some(word => word.startsWith(term))) score += 7;
            if (contentWords.some(word => word.startsWith(term))) score += 3;
        });
        
        return score;
    }

    async deleteKnowledge(id) {
        try {
            const transaction = this.db.transaction(['knowledge'], 'readwrite');
            const store = transaction.objectStore('knowledge');
            
            await new Promise((resolve, reject) => {
                const request = store.delete(id);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
            
            this.searchIndex.delete(id);
            
            eventBus.emit('storage:delete:complete', { id });
            
        } catch (error) {
            console.error('Failed to delete knowledge:', error);
            throw error;
        }
    }

    async saveDraft(draft) {
        try {
            const transaction = this.db.transaction(['drafts'], 'readwrite');
            const store = transaction.objectStore('drafts');
            
            if (!draft.id) {
                draft.id = this.generateUUID();
            }
            
            draft.modified = new Date().toISOString();
            
            await new Promise((resolve, reject) => {
                const request = store.put(draft);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
            
            eventBus.emit('storage:draft:saved', draft);
            
        } catch (error) {
            console.error('Failed to save draft:', error);
            throw error;
        }
    }

    async getDrafts() {
        try {
            const transaction = this.db.transaction(['drafts'], 'readonly');
            const store = transaction.objectStore('drafts');
            
            const result = await new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            
            return result.sort((a, b) => new Date(b.modified) - new Date(a.modified));
            
        } catch (error) {
            console.error('Failed to get drafts:', error);
            throw error;
        }
    }

    async getStats() {
        try {
            const allItems = await this.getAllKnowledge();
            const categories = new Set();
            const languages = new Set();
            const currentMonth = new Date().getMonth();
            const currentYear = new Date().getFullYear();
            let monthCount = 0;
            
            allItems.forEach(item => {
                if (item.category) categories.add(item.category);
                if (item.language) languages.add(item.language);
                
                const itemDate = new Date(item.created);
                if (itemDate.getMonth() === currentMonth && itemDate.getFullYear() === currentYear) {
                    monthCount++;
                }
            });
            
            return {
                total: allItems.length,
                categories: categories.size,
                languages: languages.size,
                thisMonth: monthCount,
                categoryBreakdown: this.getCategoryBreakdown(allItems),
                monthlyData: this.getMonthlyData(allItems)
            };
            
        } catch (error) {
            console.error('Failed to get stats:', error);
            throw error;
        }
    }

    getCategoryBreakdown(items) {
        const breakdown = {};
        items.forEach(item => {
            const category = item.category || 'uncategorized';
            breakdown[category] = (breakdown[category] || 0) + 1;
        });
        return breakdown;
    }

    getMonthlyData(items) {
        const monthlyData = {};
        items.forEach(item => {
            const date = new Date(item.created);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            monthlyData[monthKey] = (monthlyData[monthKey] || 0) + 1;
        });
        return monthlyData;
    }

    updateSearchIndex(item) {
        const searchableText = [
            item.title || '',
            item.content || '',
            ...(item.tags || [])
        ].join(' ').toLowerCase();
        
        this.searchIndex.set(item.id, {
            id: item.id,
            text: searchableText,
            title: (item.title || '').toLowerCase(),
            category: item.category,
            language: item.language,
            created: item.created
        });
    }

    async loadSearchIndex() {
        try {
            const allItems = await this.getAllKnowledge();
            allItems.forEach(item => this.updateSearchIndex(item));
        } catch (error) {
            console.error('Failed to load search index:', error);
        }
    }

    async clearAllData() {
        try {
            const transaction = this.db.transaction(['knowledge', 'drafts'], 'readwrite');
            
            await Promise.all([
                new Promise((resolve, reject) => {
                    const request = transaction.objectStore('knowledge').clear();
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                }),
                new Promise((resolve, reject) => {
                    const request = transaction.objectStore('drafts').clear();
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                })
            ]);
            
            this.searchIndex.clear();
            eventBus.emit('storage:cleared');
            
        } catch (error) {
            console.error('Failed to clear data:', error);
            throw error;
        }
    }

    async importData(data) {
        try {
            if (!Array.isArray(data)) {
                throw new Error('Import data must be an array');
            }
            
            const transaction = this.db.transaction(['knowledge'], 'readwrite');
            const store = transaction.objectStore('knowledge');
            
            for (const item of data) {
                if (!item.id) {
                    item.id = this.generateUUID();
                }
                if (!item.created) {
                    item.created = new Date().toISOString();
                }
                item.modified = new Date().toISOString();
                
                await new Promise((resolve, reject) => {
                    const request = store.put(item);
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
                
                this.updateSearchIndex(item);
            }
            
            eventBus.emit('storage:import:complete', { count: data.length });
            
        } catch (error) {
            console.error('Failed to import data:', error);
            throw error;
        }
    }

    isOnline() {
        return navigator.onLine;
    }

    getStorageQuota() {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            return navigator.storage.estimate();
        }
        return Promise.resolve({ usage: 0, quota: 0 });
    }

    // IPFS Integration Methods
    async initIPFS() {
        try {
            // Load IPFS configuration from settings
            const ipfsSettings = await this.getSetting('ipfs_config');
            if (ipfsSettings) {
                this.ipfsConfig = { ...this.ipfsConfig, ...ipfsSettings };
            }
            
            // Initialize IPFS if enabled and configured
            if (this.ipfsConfig.enabled && this.ipfsConfig.apiKey) {
                console.log('IPFS backup system initialized');
                eventBus.emit('ipfs:ready');
            }
        } catch (error) {
            console.warn('Failed to initialize IPFS:', error);
        }
    }

    async enableIPFS(apiKey, options = {}) {
        try {
            if (!apiKey) {
                throw new Error('Web3.Storage API key is required');
            }

            this.ipfsConfig = {
                ...this.ipfsConfig,
                enabled: true,
                apiKey: apiKey,
                autoBackup: options.autoBackup || false
            };

            // Save configuration
            await this.saveSetting('ipfs_config', this.ipfsConfig);
            
            // Test connection
            const testResult = await this.testIPFSConnection();
            if (!testResult.success) {
                throw new Error('IPFS connection test failed: ' + testResult.error);
            }

            eventBus.emit('ipfs:enabled', { autoBackup: this.ipfsConfig.autoBackup });
            return { success: true, message: 'IPFS backup enabled successfully' };

        } catch (error) {
            console.error('Failed to enable IPFS:', error);
            this.ipfsConfig.enabled = false;
            return { success: false, error: error.message };
        }
    }

    async disableIPFS() {
        try {
            this.ipfsConfig.enabled = false;
            this.ipfsConfig.apiKey = null;
            this.ipfsConfig.autoBackup = false;

            await this.saveSetting('ipfs_config', this.ipfsConfig);
            eventBus.emit('ipfs:disabled');

            return { success: true, message: 'IPFS backup disabled' };
        } catch (error) {
            console.error('Failed to disable IPFS:', error);
            return { success: false, error: error.message };
        }
    }

    async testIPFSConnection() {
        try {
            if (!this.ipfsConfig.enabled || !this.ipfsConfig.apiKey) {
                return { success: false, error: 'IPFS not configured' };
            }

            // Create a test file to verify connection
            const testData = {
                test: true,
                timestamp: new Date().toISOString(),
                app: 'KnowledgeVault'
            };

            const result = await this.uploadToIPFS(testData, 'connection-test.json');
            
            if (result.success) {
                return { 
                    success: true, 
                    cid: result.cid,
                    gateway_url: `${this.ipfsConfig.gateway}/${result.cid}`
                };
            } else {
                return { success: false, error: result.error };
            }

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async saveToIPFS(item) {
        try {
            if (!this.ipfsConfig.enabled) {
                return { success: false, error: 'IPFS not enabled' };
            }

            // Prepare data for IPFS storage
            const ipfsData = {
                id: item.id,
                title: item.title,
                content: item.content,
                category: item.category,
                tags: item.tags,
                language: item.language,
                created: item.created,
                modified: item.modified,
                ipfs_backup_date: new Date().toISOString(),
                app_version: '1.0.0'
            };

            // Upload to IPFS
            const filename = `knowledge-${item.id}.json`;
            const result = await this.uploadToIPFS(ipfsData, filename);

            if (result.success) {
                // Store IPFS reference in local item
                item.ipfs_cid = result.cid;
                item.ipfs_gateway_url = `${this.ipfsConfig.gateway}/${result.cid}`;
                item.ipfs_backup_date = ipfsData.ipfs_backup_date;

                // Update local storage with IPFS info
                await this.saveKnowledge(item);

                eventBus.emit('ipfs:backup:complete', {
                    id: item.id,
                    cid: result.cid,
                    gateway_url: item.ipfs_gateway_url
                });

                return { 
                    success: true, 
                    cid: result.cid,
                    gateway_url: item.ipfs_gateway_url 
                };
            } else {
                return result;
            }

        } catch (error) {
            console.error('Failed to save to IPFS:', error);
            eventBus.emit('ipfs:backup:error', { id: item.id, error: error.message });
            return { success: false, error: error.message };
        }
    }

    async uploadToIPFS(data, filename) {
        try {
            if (!this.ipfsConfig.apiKey) {
                throw new Error('No API key configured for Web3.Storage');
            }

            // Convert data to blob
            const jsonData = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonData], { type: 'application/json' });

            // Create FormData for upload
            const formData = new FormData();
            formData.append('file', blob, filename);

            // Upload to Web3.Storage
            const response = await fetch(this.ipfsConfig.uploadEndpoint + '/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.ipfsConfig.apiKey}`
                },
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Upload failed: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            return {
                success: true,
                cid: result.cid,
                size: blob.size,
                filename: filename
            };

        } catch (error) {
            console.error('IPFS upload error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async backupAllToIPFS() {
        try {
            if (!this.ipfsConfig.enabled) {
                return { success: false, error: 'IPFS not enabled' };
            }

            const allItems = await this.getAllKnowledge();
            const results = {
                total: allItems.length,
                successful: 0,
                failed: 0,
                errors: []
            };

            eventBus.emit('ipfs:backup:started', { total: allItems.length });

            for (let i = 0; i < allItems.length; i++) {
                const item = allItems[i];
                
                try {
                    const result = await this.saveToIPFS(item);
                    
                    if (result.success) {
                        results.successful++;
                        eventBus.emit('ipfs:backup:progress', {
                            current: i + 1,
                            total: allItems.length,
                            item: item.title
                        });
                    } else {
                        results.failed++;
                        results.errors.push({
                            id: item.id,
                            title: item.title,
                            error: result.error
                        });
                    }

                    // Rate limiting - wait a bit between uploads
                    if (i < allItems.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }

                } catch (error) {
                    results.failed++;
                    results.errors.push({
                        id: item.id,
                        title: item.title,
                        error: error.message
                    });
                }
            }

            // Update last backup timestamp
            this.ipfsConfig.lastBackup = new Date().toISOString();
            await this.saveSetting('ipfs_config', this.ipfsConfig);

            eventBus.emit('ipfs:backup:completed', results);

            return {
                success: true,
                results: results
            };

        } catch (error) {
            console.error('Failed to backup all to IPFS:', error);
            eventBus.emit('ipfs:backup:error', { error: error.message });
            return { success: false, error: error.message };
        }
    }

    async retrieveFromIPFS(cid) {
        try {
            if (!cid) {
                throw new Error('CID is required');
            }

            const url = `${this.ipfsConfig.gateway}/${cid}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Failed to retrieve from IPFS: ${response.status}`);
            }

            const data = await response.json();
            return {
                success: true,
                data: data
            };

        } catch (error) {
            console.error('Failed to retrieve from IPFS:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getSetting(key) {
        try {
            const transaction = this.db.transaction(['settings'], 'readonly');
            const store = transaction.objectStore('settings');

            const result = await new Promise((resolve, reject) => {
                const request = store.get(key);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            return result ? result.value : null;

        } catch (error) {
            console.error('Failed to get setting:', error);
            return null;
        }
    }

    async saveSetting(key, value) {
        try {
            const transaction = this.db.transaction(['settings'], 'readwrite');
            const store = transaction.objectStore('settings');

            await new Promise((resolve, reject) => {
                const request = store.put({ key, value });
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });

        } catch (error) {
            console.error('Failed to save setting:', error);
            throw error;
        }
    }

    getIPFSStatus() {
        return {
            enabled: this.ipfsConfig.enabled,
            configured: !!this.ipfsConfig.apiKey,
            autoBackup: this.ipfsConfig.autoBackup,
            lastBackup: this.ipfsConfig.lastBackup,
            gateway: this.ipfsConfig.gateway
        };
    }

    async autoBackupToIPFS(item) {
        if (this.ipfsConfig.enabled && this.ipfsConfig.autoBackup) {
            try {
                // Add to backup queue to avoid overwhelming the service
                this.ipfsConfig.backupQueue.add(item.id);
                
                // Process backup queue with delay
                setTimeout(async () => {
                    if (this.ipfsConfig.backupQueue.has(item.id)) {
                        await this.saveToIPFS(item);
                        this.ipfsConfig.backupQueue.delete(item.id);
                    }
                }, 2000); // 2 second delay

            } catch (error) {
                console.warn('Auto-backup to IPFS failed:', error);
            }
        }
    }
}