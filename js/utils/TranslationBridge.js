/**
 * TranslationBridge - Internationalization system for KnowledgeVault
 * Handles loading and switching between different languages
 */
class TranslationBridge {
    constructor() {
        this.currentLanguage = 'en';
        this.translations = {};
        this.supportedLanguages = ['en', 'es', 'zh', 'ar', 'hi'];
        this.rtlLanguages = ['ar'];
        this.loadedLanguages = new Set();
        this.fallbackLanguage = 'en';
        this.dateFormats = {
            'en': { locale: 'en-US', options: { year: 'numeric', month: 'short', day: 'numeric' } },
            'es': { locale: 'es-ES', options: { year: 'numeric', month: 'short', day: 'numeric' } },
            'zh': { locale: 'zh-CN', options: { year: 'numeric', month: 'short', day: 'numeric' } },
            'ar': { locale: 'ar-SA', options: { year: 'numeric', month: 'short', day: 'numeric' } },
            'hi': { locale: 'hi-IN', options: { year: 'numeric', month: 'short', day: 'numeric' } }
        };
        this.numberFormats = {
            'en': 'en-US',
            'es': 'es-ES',
            'zh': 'zh-CN',
            'ar': 'ar-SA',
            'hi': 'hi-IN'
        };
    }

    /**
     * Initialize translation system
     */
    async init(language = 'en') {
        try {
            // Detect user's preferred language
            const detectedLanguage = this.detectUserLanguage();
            const initialLanguage = this.supportedLanguages.includes(language) ? language : detectedLanguage;

            // Load the initial language
            await this.loadLanguage(initialLanguage);
            await this.setLanguage(initialLanguage);

            // Preload English as fallback if not already loaded
            if (initialLanguage !== 'en') {
                await this.loadLanguage('en');
            }

            return true;
        } catch (error) {
            console.error('Failed to initialize translation system:', error);
            // Fall back to English
            this.currentLanguage = 'en';
            this.translations['en'] = this.getDefaultEnglishTranslations();
            this.loadedLanguages.add('en');
            return false;
        }
    }

    /**
     * Detect user's preferred language from browser settings
     */
    detectUserLanguage() {
        const browserLanguage = navigator.language || navigator.userLanguage;
        const languageCode = browserLanguage.split('-')[0].toLowerCase();
        
        return this.supportedLanguages.includes(languageCode) ? languageCode : this.fallbackLanguage;
    }

    /**
     * Load translations for a specific language
     */
    async loadLanguage(language) {
        if (this.loadedLanguages.has(language)) {
            return true;
        }

        try {
            const response = await fetch(`locales/${language}.json`);
            if (!response.ok) {
                throw new Error(`Failed to load translations for ${language}: ${response.status}`);
            }

            const translations = await response.json();
            this.translations[language] = translations;
            this.loadedLanguages.add(language);
            
            return true;
        } catch (error) {
            console.error(`Could not load language ${language}:`, error);
            
            // Use default translations as fallback
            if (language === 'en') {
                this.translations['en'] = this.getDefaultEnglishTranslations();
                this.loadedLanguages.add('en');
                return true;
            }
            
            return false;
        }
    }

    /**
     * Set current language and update UI
     */
    async setLanguage(language) {
        if (!this.supportedLanguages.includes(language)) {
            console.warn(`Unsupported language: ${language}`);
            return false;
        }

        // Load language if not already loaded
        if (!this.loadedLanguages.has(language)) {
            const loaded = await this.loadLanguage(language);
            if (!loaded) {
                return false;
            }
        }

        const previousLanguage = this.currentLanguage;
        this.currentLanguage = language;

        // Update document language
        document.documentElement.lang = language;

        // Update text direction for RTL languages
        if (this.rtlLanguages.includes(language)) {
            document.documentElement.dir = 'rtl';
            document.body.classList.add('rtl');
        } else {
            document.documentElement.dir = 'ltr';
            document.body.classList.remove('rtl');
        }

        // Update all translatable elements
        this.updateTranslatableElements();

        // Update language selector if it exists
        this.updateLanguageSelector();

        // Emit language change event
        if (window.eventBus) {
            window.eventBus.emit('language:changed', {
                current: language,
                previous: previousLanguage,
                isRTL: this.rtlLanguages.includes(language)
            });
        }

        return true;
    }

    /**
     * Get translated text for a key
     */
    t(key, params = {}) {
        const translation = this.getTranslation(key);
        
        // Replace parameters in translation
        return this.interpolate(translation, params);
    }

    /**
     * Get translation for a key with fallback
     */
    getTranslation(key) {
        const keys = key.split('.');
        let translation = this.translations[this.currentLanguage];
        
        // Navigate through nested keys
        for (const k of keys) {
            if (translation && typeof translation === 'object' && k in translation) {
                translation = translation[k];
            } else {
                translation = null;
                break;
            }
        }

        // Fall back to English if translation not found
        if (translation === null && this.currentLanguage !== this.fallbackLanguage) {
            let fallback = this.translations[this.fallbackLanguage];
            for (const k of keys) {
                if (fallback && typeof fallback === 'object' && k in fallback) {
                    fallback = fallback[k];
                } else {
                    fallback = null;
                    break;
                }
            }
            translation = fallback;
        }

        // Return key if no translation found
        return translation || key;
    }

    /**
     * Replace parameters in translation strings
     */
    interpolate(text, params) {
        if (!text || typeof text !== 'string' || Object.keys(params).length === 0) {
            return text;
        }

        return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            return params[key] !== undefined ? params[key] : match;
        });
    }

    /**
     * Update all elements with data-translate attribute
     */
    updateTranslatableElements() {
        const elements = document.querySelectorAll('[data-translate]');
        
        elements.forEach(element => {
            const key = element.getAttribute('data-translate');
            const params = element.getAttribute('data-translate-params');
            
            let translationParams = {};
            if (params) {
                try {
                    translationParams = JSON.parse(params);
                } catch (error) {
                    console.warn('Invalid translation parameters:', params);
                }
            }

            const translation = this.t(key, translationParams);
            
            // Update text content or placeholder based on element type
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                if (element.type === 'submit' || element.type === 'button') {
                    element.value = translation;
                } else {
                    element.placeholder = translation;
                }
            } else if (element.tagName === 'OPTION') {
                element.textContent = translation;
            } else {
                element.textContent = translation;
            }
        });
    }

    /**
     * Update language selector dropdown
     */
    updateLanguageSelector() {
        const selector = document.getElementById('language');
        if (selector) {
            selector.value = this.currentLanguage;
            
            // Update option text with translated language names
            const options = selector.querySelectorAll('option');
            options.forEach(option => {
                const lang = option.value;
                const translationKey = `languages.${lang}`;
                if (this.getTranslation(translationKey) !== translationKey) {
                    option.textContent = this.t(translationKey);
                }
            });
        }
    }

    /**
     * Format date according to current language settings
     */
    formatDate(date, options = {}) {
        if (!(date instanceof Date)) {
            date = new Date(date);
        }

        const format = this.dateFormats[this.currentLanguage] || this.dateFormats[this.fallbackLanguage];
        const mergedOptions = { ...format.options, ...options };

        try {
            return new Intl.DateTimeFormat(format.locale, mergedOptions).format(date);
        } catch (error) {
            console.warn('Date formatting error:', error);
            return date.toLocaleDateString();
        }
    }

    /**
     * Format number according to current language settings
     */
    formatNumber(number, options = {}) {
        const locale = this.numberFormats[this.currentLanguage] || this.numberFormats[this.fallbackLanguage];

        try {
            return new Intl.NumberFormat(locale, options).format(number);
        } catch (error) {
            console.warn('Number formatting error:', error);
            return number.toString();
        }
    }

    /**
     * Get list of supported languages
     */
    getSupportedLanguages() {
        return [...this.supportedLanguages];
    }

    /**
     * Get current language
     */
    getCurrentLanguage() {
        return this.currentLanguage;
    }

    /**
     * Check if current language is RTL
     */
    isRTL() {
        return this.rtlLanguages.includes(this.currentLanguage);
    }

    /**
     * Get language name in its native form
     */
    getLanguageName(languageCode) {
        const nativeNames = {
            'en': 'English',
            'es': 'Español',
            'zh': '中文',
            'ar': 'العربية',
            'hi': 'हिंदी'
        };
        return nativeNames[languageCode] || languageCode.toUpperCase();
    }

    /**
     * Default English translations (fallback)
     */
    getDefaultEnglishTranslations() {
        return {
            "app": {
                "title": "KnowledgeVault",
                "subtitle": "Preserve Knowledge Forever",
                "loading": "Initializing KnowledgeVault..."
            },
            "nav": {
                "create": "Create",
                "search": "Search",
                "explore": "Explore",
                "export": "Export",
                "install": "Install"
            },
            "form": {
                "title": "Title",
                "content": "Content",
                "category": "Category",
                "language": "Language",
                "tags": "Tags",
                "save": "Save Knowledge",
                "saveDraft": "Save Draft",
                "required": "Required field"
            },
            "categories": {
                "personal": "Personal",
                "education": "Education",
                "research": "Research",
                "tutorial": "Tutorial",
                "documentation": "Documentation",
                "recipe": "Recipe",
                "memory": "Memory",
                "other": "Other"
            },
            "languages": {
                "en": "English",
                "es": "Español",
                "zh": "中文",
                "ar": "العربية",
                "hi": "हिंदी"
            },
            "status": {
                "online": "Online",
                "offline": "Offline"
            },
            "actions": {
                "edit": "Edit",
                "delete": "Delete",
                "export": "Export",
                "search": "Search",
                "close": "Close"
            },
            "messages": {
                "saved": "Knowledge saved successfully!",
                "updated": "Knowledge updated successfully!",
                "deleted": "Knowledge deleted",
                "draftSaved": "Draft saved automatically",
                "error": "An error occurred",
                "noResults": "No knowledge entries found matching your search."
            }
        };
    }
}