/**
 * PerformanceManager - Handles performance optimizations for KnowledgeVault
 * Implements lazy loading, caching, and resource optimization
 */
class PerformanceManager {
    constructor() {
        this.cache = new Map();
        this.loadedModules = new Set();
        this.intersectionObserver = null;
        this.lazyElements = new Set();
        this.preloadQueue = [];
        this.performanceData = {
            loadTime: 0,
            memoryUsage: 0,
            cacheHits: 0,
            cacheMisses: 0,
            lazyLoaded: 0
        };
        this.init();
    }

    init() {
        this.setupIntersectionObserver();
        this.setupPerformanceMonitoring();
        this.optimizeImages();
        this.preloadCriticalResources();
        this.setupServiceWorkerOptimizations();
    }

    /**
     * Set up intersection observer for lazy loading
     */
    setupIntersectionObserver() {
        if ('IntersectionObserver' in window) {
            this.intersectionObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        this.loadLazyElement(entry.target);
                        this.intersectionObserver.unobserve(entry.target);
                    }
                });
            }, {
                rootMargin: '50px',
                threshold: 0.1
            });
        }
    }

    /**
     * Setup performance monitoring
     */
    setupPerformanceMonitoring() {
        // Monitor memory usage
        if ('memory' in performance) {
            this.performanceData.memoryUsage = performance.memory.usedJSHeapSize;
        }

        // Track load time
        if ('timing' in performance) {
            const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;
            this.performanceData.loadTime = loadTime;
        }

        // Setup periodic monitoring
        setInterval(() => {
            this.collectPerformanceMetrics();
        }, 30000); // Every 30 seconds
    }

    /**
     * Collect performance metrics
     */
    collectPerformanceMetrics() {
        if ('memory' in performance) {
            this.performanceData.memoryUsage = performance.memory.usedJSHeapSize;
        }

        // Emit performance data
        if (window.eventBus) {
            window.eventBus.emit('performance:metrics', this.performanceData);
        }
    }

    /**
     * Optimize image loading
     */
    optimizeImages() {
        const images = document.querySelectorAll('img[data-src]');
        images.forEach(img => {
            this.lazyElements.add(img);
            this.intersectionObserver?.observe(img);
        });
    }

    /**
     * Load lazy element
     */
    loadLazyElement(element) {
        if (element.tagName === 'IMG') {
            const src = element.getAttribute('data-src');
            if (src) {
                element.src = src;
                element.removeAttribute('data-src');
                this.performanceData.lazyLoaded++;
            }
        }
        
        this.lazyElements.delete(element);
    }

    /**
     * Preload critical resources
     */
    preloadCriticalResources() {
        const criticalResources = [
            'locales/en.json',
            'css/components.css'
        ];

        criticalResources.forEach(resource => {
            this.preloadResource(resource);
        });
    }

    /**
     * Preload a resource
     */
    preloadResource(url) {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = url;
        document.head.appendChild(link);
    }

    /**
     * Setup service worker optimizations
     */
    setupServiceWorkerOptimizations() {
        if ('serviceWorker' in navigator) {
            // Listen for service worker updates
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                // Reload page for updates
                if (this.shouldReloadForUpdate()) {
                    window.location.reload();
                }
            });
        }
    }

    /**
     * Check if should reload for update
     */
    shouldReloadForUpdate() {
        // Only reload if user hasn't made changes
        return !document.querySelector('#knowledge-form input[value], #knowledge-form textarea')?.value;
    }

    /**
     * Cache management
     */
    setCache(key, value, ttl = 3600000) { // 1 hour default
        this.cache.set(key, {
            value,
            expiry: Date.now() + ttl
        });
    }

    getCache(key) {
        const cached = this.cache.get(key);
        if (!cached) {
            this.performanceData.cacheMisses++;
            return null;
        }

        if (cached.expiry < Date.now()) {
            this.cache.delete(key);
            this.performanceData.cacheMisses++;
            return null;
        }

        this.performanceData.cacheHits++;
        return cached.value;
    }

    clearExpiredCache() {
        const now = Date.now();
        for (const [key, cached] of this.cache.entries()) {
            if (cached.expiry < now) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Dynamic import with caching
     */
    async importModule(modulePath) {
        if (this.loadedModules.has(modulePath)) {
            return this.getCache(modulePath);
        }

        try {
            const module = await import(modulePath);
            this.loadedModules.add(modulePath);
            this.setCache(modulePath, module);
            return module;
        } catch (error) {
            console.error(`Failed to load module: ${modulePath}`, error);
            throw error;
        }
    }

    /**
     * Optimize DOM operations
     */
    batchDOMUpdates(updates) {
        return new Promise((resolve) => {
            requestAnimationFrame(() => {
                updates.forEach(update => {
                    if (typeof update === 'function') {
                        update();
                    }
                });
                resolve();
            });
        });
    }

    /**
     * Debounce function calls
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Throttle function calls
     */
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    /**
     * Optimize search operations
     */
    optimizeSearch(searchFunction) {
        const debouncedSearch = this.debounce(searchFunction, 300);
        return (query, filters) => {
            if (query.length < 2) return;

            const cacheKey = `search:${query}:${JSON.stringify(filters)}`;
            const cached = this.getCache(cacheKey);
            
            if (cached) {
                return Promise.resolve(cached);
            }

            return debouncedSearch(query, filters).then(results => {
                this.setCache(cacheKey, results, 600000); // 10 minutes
                return results;
            });
        };
    }

    /**
     * Virtual scrolling for large lists
     */
    setupVirtualScrolling(container, items, renderItem, itemHeight = 60) {
        const viewportHeight = container.clientHeight;
        const visibleCount = Math.ceil(viewportHeight / itemHeight) + 2;
        let scrollTop = 0;
        
        const scrollHandler = this.throttle(() => {
            scrollTop = container.scrollTop;
            this.renderVisibleItems(container, items, renderItem, itemHeight, scrollTop, visibleCount);
        }, 16); // ~60fps

        container.addEventListener('scroll', scrollHandler);
        
        // Initial render
        this.renderVisibleItems(container, items, renderItem, itemHeight, scrollTop, visibleCount);
        
        return scrollHandler;
    }

    renderVisibleItems(container, items, renderItem, itemHeight, scrollTop, visibleCount) {
        const startIndex = Math.floor(scrollTop / itemHeight);
        const endIndex = Math.min(startIndex + visibleCount, items.length);
        
        container.innerHTML = '';
        container.style.height = `${items.length * itemHeight}px`;
        
        for (let i = startIndex; i < endIndex; i++) {
            const item = renderItem(items[i], i);
            item.style.transform = `translateY(${i * itemHeight}px)`;
            item.style.position = 'absolute';
            item.style.width = '100%';
            item.style.height = `${itemHeight}px`;
            container.appendChild(item);
        }
    }

    /**
     * Preload next likely resources
     */
    preloadNextResources(currentView) {
        const nextResources = {
            'create': ['js/features/AudioRecorder.js', 'js/features/ImageProcessor.js'],
            'search': ['js/features/SearchEngine.js'],
            'explore': ['js/features/GeoLocator.js'],
            'export': ['js/utils/ExportManager.js']
        };

        const resources = nextResources[currentView];
        if (resources) {
            resources.forEach(resource => this.preloadResource(resource));
        }
    }

    /**
     * Optimize bundle loading
     */
    async loadCriticalBundle() {
        const criticalModules = [
            './js/core/EventBus.js',
            './js/core/StorageManager.js',
            './js/utils/TranslationBridge.js'
        ];

        const loadPromises = criticalModules.map(module => this.importModule(module));
        return Promise.all(loadPromises);
    }

    /**
     * Compress large text content
     */
    compressText(text) {
        if (text.length < 1000) return text;
        
        // Simple compression - remove extra whitespace
        return text
            .replace(/\s+/g, ' ')
            .replace(/\n\s*\n/g, '\n')
            .trim();
    }

    /**
     * Get performance summary
     */
    getPerformanceReport() {
        return {
            ...this.performanceData,
            cacheSize: this.cache.size,
            loadedModules: this.loadedModules.size,
            lazyElementsRemaining: this.lazyElements.size,
            cacheHitRatio: this.performanceData.cacheHits / 
                (this.performanceData.cacheHits + this.performanceData.cacheMisses) || 0
        };
    }

    /**
     * Clean up resources
     */
    cleanup() {
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
        }
        
        this.clearExpiredCache();
        this.lazyElements.clear();
        this.preloadQueue.length = 0;
    }

    /**
     * Optimize localStorage usage
     */
    optimizeLocalStorage() {
        try {
            // Clean up old data
            const keys = Object.keys(localStorage);
            const oldKeys = keys.filter(key => {
                if (key.startsWith('knowledgevault_')) {
                    const item = localStorage.getItem(key);
                    try {
                        const data = JSON.parse(item);
                        const age = Date.now() - new Date(data.timestamp || 0).getTime();
                        return age > 7 * 24 * 60 * 60 * 1000; // 7 days
                    } catch {
                        return true; // Remove invalid items
                    }
                }
                return false;
            });

            oldKeys.forEach(key => localStorage.removeItem(key));
            
            return { cleaned: oldKeys.length };
        } catch (error) {
            console.warn('Failed to optimize localStorage:', error);
            return { cleaned: 0 };
        }
    }
}