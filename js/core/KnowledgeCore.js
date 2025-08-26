/**
 * KnowledgeCore - Main application controller
 * Initializes and coordinates all app components
 */
class KnowledgeCore {
    constructor() {
        this.version = '1.0.0';
        this.initialized = false;
        this.config = {
            storageKey: 'knowledgevault_data',
            maxFileSize: 10 * 1024 * 1024, // 10MB
            supportedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
            supportedAudioTypes: ['audio/wav', 'audio/mp3', 'audio/webm'],
            maxAudioDuration: 300, // 5 minutes
            autoSaveInterval: 30000 // 30 seconds
        };
        this.state = {
            currentLanguage: 'en',
            offlineMode: false,
            knowledgeCount: 0,
            drafts: new Map()
        };
    }

    /**
     * Initialize the application in correct order
     */
    async init() {
        try {
            // 1. Check browser support
            if (!this.checkBrowserSupport()) {
                this.showError('Browser not supported. Please use a modern browser.');
                return false;
            }

            // 2. Initialize StorageManager
            await window.storageManager.init();
            
            // 3. Load user preferences
            await this.loadUserPreferences();

            // 4. Initialize translation system
            await window.translationBridge.init(this.state.currentLanguage);

            // 5. Initialize UI components
            this.initializeUIComponents();

            // 6. Setup event listeners
            this.setupEventListeners();

            // 7. Load demo content if first visit
            await this.loadDemoContentIfNeeded();

            // 8. Setup auto-save for drafts
            this.setupAutoSave();

            // 9. Check online/offline status
            this.updateOnlineStatus();

            this.initialized = true;
            window.eventBus.emit('app:ready', { version: this.version });
            
            return true;
        } catch (error) {
            console.error('Failed to initialize KnowledgeCore:', error);
            this.showError('Failed to initialize application. Please refresh the page.');
            return false;
        }
    }

    /**
     * Check if browser supports required features
     */
    checkBrowserSupport() {
        const required = [
            'localStorage' in window,
            'indexedDB' in window,
            'navigator' in window && 'geolocation' in navigator,
            'URL' in window && 'createObjectURL' in URL,
            'FileReader' in window
        ];

        return required.every(feature => feature);
    }

    /**
     * Load user preferences from storage
     */
    async loadUserPreferences() {
        try {
            const prefs = await window.storageManager.get('user_preferences');
            if (prefs) {
                this.state.currentLanguage = prefs.language || 'en';
                // Apply other preferences
                if (prefs.theme) {
                    document.body.className = prefs.theme;
                }
            }
        } catch (error) {
            console.warn('Could not load user preferences:', error);
        }
    }

    /**
     * Initialize UI components
     */
    initializeUIComponents() {
        // Initialize navigation
        window.navigationHandler.init();
        
        // Initialize form controller
        window.formController.init();
        
        // Initialize view renderer
        window.viewRenderer.init();

        // Initialize feature components
        if (window.audioRecorder) window.audioRecorder.init();
        if (window.geoLocator) window.geoLocator.init();
        if (window.imageProcessor) window.imageProcessor.init();
        if (window.searchEngine) window.searchEngine.init();
        if (window.exportManager) window.exportManager.init();
    }

    /**
     * Setup global event listeners
     */
    setupEventListeners() {
        // Online/offline detection
        window.addEventListener('online', () => this.updateOnlineStatus(true));
        window.addEventListener('offline', () => this.updateOnlineStatus(false));

        // Knowledge entry events
        window.eventBus.on('knowledge:created', (data) => this.handleKnowledgeCreated(data));
        window.eventBus.on('knowledge:updated', (data) => this.handleKnowledgeUpdated(data));
        window.eventBus.on('knowledge:deleted', (data) => this.handleKnowledgeDeleted(data));

        // Storage events
        window.eventBus.on('storage:ready', () => this.updateKnowledgeCount());
        window.eventBus.on('storage:error', (error) => this.handleStorageError(error));

        // Form events
        window.eventBus.on('form:draft:saved', (data) => this.handleDraftSaved(data));
        window.eventBus.on('form:validation:error', (errors) => this.handleValidationErrors(errors));

        // Language change events
        window.eventBus.on('language:changed', (lang) => this.handleLanguageChange(lang));
    }

    /**
     * Load demo content on first visit
     */
    async loadDemoContentIfNeeded() {
        try {
            const hasExistingData = await window.storageManager.count() > 0;
            const hasSeenDemo = localStorage.getItem('knowledgevault_demo_loaded');

            if (!hasExistingData && !hasSeenDemo) {
                await this.loadDemoContent();
                localStorage.setItem('knowledgevault_demo_loaded', 'true');
            }

            await this.updateKnowledgeCount();
        } catch (error) {
            console.warn('Could not load demo content:', error);
        }
    }

    /**
     * Load demo knowledge items
     */
    async loadDemoContent() {
        const demoItems = [
            {
                id: 'demo-001',
                type: 'recipe',
                title: 'Grandmother\'s Healing Tea',
                content: 'Boil water with fresh ginger slices for 10 minutes. Add honey and lemon juice. This traditional remedy helps with cold symptoms and digestion. My grandmother taught me this recipe during winter evenings.',
                category: 'recipe',
                tags: ['traditional', 'medicine', 'tea', 'healing', 'family'],
                language: 'en',
                created: new Date().toISOString(),
                updated: new Date().toISOString()
            },
            {
                id: 'demo-002',
                type: 'skill',
                title: 'Reading Weather from Cloud Patterns',
                content: 'Cumulus clouds indicate fair weather. Cumulonimbus clouds signal storms approaching. Cirrus clouds mean weather change in 24-48 hours. Watch cloud movement and height to predict weather patterns. This ancient skill saved many travelers.',
                category: 'education',
                tags: ['weather', 'survival', 'traditional', 'clouds', 'prediction'],
                language: 'en',
                created: new Date(Date.now() - 86400000).toISOString(), // Yesterday
                updated: new Date(Date.now() - 86400000).toISOString()
            },
            {
                id: 'demo-003',
                type: 'emergency',
                title: 'Finding Water in Desert',
                content: 'Look for vegetation - plants indicate nearby water. Dig at the lowest point of dry river beds. Collect dew with cloth at dawn. Follow animal trails, especially at dawn and dusk. Look for bird flight patterns pointing to water sources.',
                category: 'education',
                tags: ['survival', 'emergency', 'water', 'desert', 'safety'],
                language: 'en',
                created: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
                updated: new Date(Date.now() - 172800000).toISOString()
            },
            {
                id: 'demo-004',
                type: 'memory',
                title: 'Mom\'s Secret Pancake Recipe',
                content: 'Mix 2 cups flour, 2 tbsp sugar, 2 tsp baking powder, 1 tsp salt. In another bowl: 2 eggs, 1.5 cups milk, 4 tbsp melted butter. The secret: let batter rest 5 minutes and add a pinch of vanilla. Cook on medium heat.',
                category: 'recipe',
                tags: ['family', 'cooking', 'breakfast', 'secret', 'pancakes'],
                language: 'en',
                created: new Date(Date.now() - 259200000).toISOString(), // 3 days ago
                updated: new Date(Date.now() - 259200000).toISOString()
            },
            {
                id: 'demo-005',
                type: 'tutorial',
                title: 'Fire Starting Without Matches',
                content: 'Gather tinder (dry grass, bark), kindling (pencil-thin dry wood), and fuel wood (progressively larger pieces). Create bow drill set with dry softwood. Make tinder nest. Generate ember with bow drill technique. Transfer ember to tinder nest and blow gently.',
                category: 'education',
                tags: ['survival', 'fire', 'bushcraft', 'emergency', 'skills'],
                language: 'en',
                created: new Date(Date.now() - 345600000).toISOString(), // 4 days ago
                updated: new Date(Date.now() - 345600000).toISOString()
            }
        ];

        for (const item of demoItems) {
            await window.storageManager.save(item);
        }

        // Initialize search index with demo data
        if (window.searchEngine) {
            await window.searchEngine.rebuildIndex();
        }
    }

    /**
     * Setup auto-save for drafts
     */
    setupAutoSave() {
        setInterval(() => {
            this.autoSaveDraft();
        }, this.config.autoSaveInterval);
    }

    /**
     * Auto-save current form as draft
     */
    async autoSaveDraft() {
        try {
            const form = document.getElementById('knowledge-form');
            if (!form) return;

            const formData = new FormData(form);
            const title = formData.get('title');
            const content = formData.get('content');

            // Only save if there's meaningful content
            if (!title && !content) return;
            if (title.length < 3 && content.length < 10) return;

            const draftId = 'auto-draft-' + Date.now();
            const draft = {
                id: draftId,
                title: title || 'Untitled Draft',
                content: content || '',
                category: formData.get('category') || '',
                tags: formData.get('tags') || '',
                language: formData.get('language') || this.state.currentLanguage,
                isDraft: true,
                created: new Date().toISOString(),
                updated: new Date().toISOString()
            };

            this.state.drafts.set(draftId, draft);
            await window.storageManager.saveDraft(draft);
            
            // Show subtle indication
            this.showToast('Draft saved automatically', 'info', 2000);
        } catch (error) {
            console.warn('Auto-save failed:', error);
        }
    }

    /**
     * Update online/offline status
     */
    updateOnlineStatus(isOnline = navigator.onLine) {
        this.state.offlineMode = !isOnline;
        
        const statusIndicator = document.getElementById('status-indicator');
        if (statusIndicator) {
            const dot = statusIndicator.querySelector('.status-dot');
            const text = statusIndicator.querySelector('.status-text');
            
            if (isOnline) {
                dot.className = 'status-dot online';
                text.textContent = window.translationBridge.t('status.online') || 'Online';
            } else {
                dot.className = 'status-dot offline';
                text.textContent = window.translationBridge.t('status.offline') || 'Offline';
            }
        }

        window.eventBus.emit('network:status', { online: isOnline });
    }

    /**
     * Update knowledge count display
     */
    async updateKnowledgeCount() {
        try {
            this.state.knowledgeCount = await window.storageManager.count();
            
            // Update statistics display
            const totalElement = document.getElementById('total-entries');
            if (totalElement) {
                totalElement.textContent = this.state.knowledgeCount;
            }

            window.eventBus.emit('stats:updated', { totalEntries: this.state.knowledgeCount });
        } catch (error) {
            console.warn('Could not update knowledge count:', error);
        }
    }

    /**
     * Handle knowledge entry created
     */
    handleKnowledgeCreated(data) {
        this.showToast('Knowledge saved successfully!', 'success');
        this.updateKnowledgeCount();
        
        // Clear any drafts if this was created from a draft
        if (data.fromDraft) {
            this.clearDraft(data.draftId);
        }
    }

    /**
     * Handle knowledge entry updated
     */
    handleKnowledgeUpdated(data) {
        this.showToast('Knowledge updated successfully!', 'success');
    }

    /**
     * Handle knowledge entry deleted
     */
    handleKnowledgeDeleted(data) {
        this.showToast('Knowledge deleted', 'info');
        this.updateKnowledgeCount();
    }

    /**
     * Handle storage errors
     */
    handleStorageError(error) {
        console.error('Storage error:', error);
        this.showToast('Storage error: ' + error.message, 'error');
    }

    /**
     * Handle draft saved
     */
    handleDraftSaved(data) {
        this.state.drafts.set(data.id, data);
    }

    /**
     * Handle validation errors
     */
    handleValidationErrors(errors) {
        const errorMessage = errors.map(e => e.message).join(', ');
        this.showToast('Please fix: ' + errorMessage, 'error');
    }

    /**
     * Handle language change
     */
    async handleLanguageChange(language) {
        this.state.currentLanguage = language;
        
        // Save preference
        try {
            const prefs = await window.storageManager.get('user_preferences') || {};
            prefs.language = language;
            await window.storageManager.save(prefs, 'user_preferences');
        } catch (error) {
            console.warn('Could not save language preference:', error);
        }

        // Update UI
        this.updateOnlineStatus();
    }

    /**
     * Clear a draft
     */
    async clearDraft(draftId) {
        this.state.drafts.delete(draftId);
        await window.storageManager.deleteDraft(draftId);
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info', duration = 3000) {
        if (window.showToast) {
            window.showToast(message, type);
        } else {
            // Fallback for when global showToast is not available
            console.log(`${type.toUpperCase()}: ${message}`);
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        this.showToast(message, 'error');
        
        // Also log to console for debugging
        console.error('KnowledgeCore Error:', message);
    }

    /**
     * Get current application state
     */
    getState() {
        return { ...this.state };
    }

    /**
     * Check if app is initialized
     */
    isInitialized() {
        return this.initialized;
    }

    /**
     * Get app configuration
     */
    getConfig() {
        return { ...this.config };
    }
}