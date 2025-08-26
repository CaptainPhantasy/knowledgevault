class SearchEngine {
    constructor() {
        this.searchIndex = new Map();
        this.invertedIndex = new Map();
        this.searchWorker = null;
        this.minSearchLength = 1;
        this.maxResults = 100;
        this.fuzzyThreshold = 0.8;
        this.stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'
        ]);
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.initializeSearchWorker();
        this.loadExistingData();
    }

    setupEventListeners() {
        eventBus.on('search:query', ({ query, filters }) => {
            this.performSearch(query, filters);
        });

        eventBus.on('search:index', (item) => {
            this.indexItem(item);
        });

        eventBus.on('search:remove', (id) => {
            this.removeFromIndex(id);
        });

        eventBus.on('storage:save:complete', ({ item }) => {
            this.indexItem(item);
        });

        eventBus.on('storage:delete:complete', ({ id }) => {
            this.removeFromIndex(id);
        });

        eventBus.on('search:reindex', () => {
            this.reindexAll();
        });
    }

    initializeSearchWorker() {
        if (typeof Worker !== 'undefined') {
            try {
                const workerCode = this.generateWorkerCode();
                const blob = new Blob([workerCode], { type: 'application/javascript' });
                this.searchWorker = new Worker(URL.createObjectURL(blob));
                
                this.searchWorker.onmessage = (event) => {
                    const { type, results, query, executionTime } = event.data;
                    if (type === 'searchComplete') {
                        eventBus.emit('search:results', {
                            query,
                            results,
                            executionTime,
                            total: results.length
                        });
                    }
                };

                this.searchWorker.onerror = (error) => {
                    console.error('Search worker error:', error);
                    this.searchWorker = null;
                };

            } catch (error) {
                console.warn('Failed to create search worker:', error);
                this.searchWorker = null;
            }
        }
    }

    generateWorkerCode() {
        return `
            class WorkerSearchEngine {
                constructor() {
                    this.fuzzyThreshold = 0.8;
                    this.stopWords = new Set([
                        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'
                    ]);
                }

                search(items, query, filters = {}) {
                    const startTime = performance.now();
                    
                    if (!query || query.trim().length === 0) {
                        return {
                            results: this.applyFilters(items, filters).slice(0, 100),
                            executionTime: performance.now() - startTime
                        };
                    }

                    const searchTerms = this.tokenize(query.toLowerCase());
                    let results = this.applyFilters(items, filters);
                    
                    results = results.filter(item => {
                        const searchableText = this.getSearchableText(item);
                        return searchTerms.every(term => 
                            searchableText.includes(term) || 
                            this.fuzzyMatch(term, searchableText)
                        );
                    });

                    results = results.map(item => ({
                        ...item,
                        relevanceScore: this.calculateRelevance(item, searchTerms)
                    }));

                    results.sort((a, b) => b.relevanceScore - a.relevanceScore);

                    return {
                        results: results.slice(0, 100),
                        executionTime: performance.now() - startTime
                    };
                }

                tokenize(text) {
                    return text.toLowerCase()
                        .replace(/[^\\w\\s]/g, ' ')
                        .split(/\\s+/)
                        .filter(term => term.length > 0 && !this.stopWords.has(term));
                }

                getSearchableText(item) {
                    return [
                        item.title || '',
                        item.content || '',
                        ...(item.tags || [])
                    ].join(' ').toLowerCase();
                }

                fuzzyMatch(term, text) {
                    const words = text.split(' ');
                    return words.some(word => {
                        if (word.length === 0 || term.length === 0) return false;
                        const distance = this.levenshteinDistance(term, word);
                        const maxLength = Math.max(term.length, word.length);
                        const similarity = 1 - (distance / maxLength);
                        return similarity >= this.fuzzyThreshold;
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

                calculateRelevance(item, searchTerms) {
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

                applyFilters(items, filters) {
                    let filtered = [...items];

                    if (filters.category) {
                        filtered = filtered.filter(item => item.category === filters.category);
                    }

                    if (filters.language) {
                        filtered = filtered.filter(item => item.language === filters.language);
                    }

                    if (filters.dateFrom) {
                        const fromDate = new Date(filters.dateFrom);
                        filtered = filtered.filter(item => new Date(item.created) >= fromDate);
                    }

                    if (filters.dateTo) {
                        const toDate = new Date(filters.dateTo);
                        toDate.setHours(23, 59, 59, 999);
                        filtered = filtered.filter(item => new Date(item.created) <= toDate);
                    }

                    if (filters.tags && filters.tags.length > 0) {
                        filtered = filtered.filter(item => 
                            filters.tags.some(tag => 
                                (item.tags || []).includes(tag)
                            )
                        );
                    }

                    return filtered;
                }
            }

            const searchEngine = new WorkerSearchEngine();

            self.onmessage = function(event) {
                const { type, items, query, filters } = event.data;
                
                if (type === 'search') {
                    const result = searchEngine.search(items, query, filters);
                    self.postMessage({
                        type: 'searchComplete',
                        query: query,
                        results: result.results,
                        executionTime: result.executionTime
                    });
                }
            };
        `;
    }

    async loadExistingData() {
        try {
            if (window.storageManager) {
                const items = await window.storageManager.getAllKnowledge();
                items.forEach(item => this.indexItem(item));
                eventBus.emit('search:indexed', { count: items.length });
            }
        } catch (error) {
            console.error('Failed to load existing data for search:', error);
        }
    }

    async performSearch(query, filters = {}) {
        const startTime = performance.now();

        try {
            if (this.searchWorker) {
                const allItems = await this.getAllItems();
                this.searchWorker.postMessage({
                    type: 'search',
                    items: allItems,
                    query: query,
                    filters: filters
                });
                return;
            }

            const results = await this.searchSync(query, filters);
            const executionTime = performance.now() - startTime;

            eventBus.emit('search:results', {
                query,
                results,
                executionTime,
                total: results.length
            });

        } catch (error) {
            console.error('Search failed:', error);
            eventBus.emit('search:error', {
                query,
                message: error.message
            });
        }
    }

    async searchSync(query, filters = {}) {
        const allItems = await this.getAllItems();

        if (!query || query.trim().length < this.minSearchLength) {
            return this.applyFilters(allItems, filters).slice(0, this.maxResults);
        }

        const searchTerms = this.tokenize(query.toLowerCase());
        let results = this.applyFilters(allItems, filters);

        results = results.filter(item => {
            const searchableText = this.getSearchableText(item);
            return searchTerms.every(term => 
                searchableText.includes(term) || 
                this.fuzzyMatch(term, searchableText)
            );
        });

        results = results.map(item => ({
            ...item,
            relevanceScore: this.calculateRelevance(item, searchTerms),
            matchedTerms: this.findMatchedTerms(item, searchTerms)
        }));

        results.sort((a, b) => b.relevanceScore - a.relevanceScore);

        return results.slice(0, this.maxResults);
    }

    async getAllItems() {
        if (window.storageManager) {
            return await window.storageManager.getAllKnowledge();
        }
        return Array.from(this.searchIndex.values());
    }

    applyFilters(items, filters) {
        let filtered = [...items];

        if (filters.category) {
            filtered = filtered.filter(item => item.category === filters.category);
        }

        if (filters.language) {
            filtered = filtered.filter(item => item.language === filters.language);
        }

        if (filters.dateFrom) {
            const fromDate = new Date(filters.dateFrom);
            filtered = filtered.filter(item => new Date(item.created) >= fromDate);
        }

        if (filters.dateTo) {
            const toDate = new Date(filters.dateTo);
            toDate.setHours(23, 59, 59, 999);
            filtered = filtered.filter(item => new Date(item.created) <= toDate);
        }

        if (filters.tags && filters.tags.length > 0) {
            filtered = filtered.filter(item => 
                filters.tags.some(tag => 
                    (item.tags || []).includes(tag)
                )
            );
        }

        if (filters.hasMedia) {
            filtered = filtered.filter(item => 
                (item.media && item.media.length > 0) ||
                (item.images && item.images.length > 0) ||
                (item.audio && item.audio.length > 0)
            );
        }

        if (filters.hasLocation) {
            filtered = filtered.filter(item => 
                item.location && (item.location.lat || item.location.coordinates)
            );
        }

        return filtered;
    }

    tokenize(text) {
        return text.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(term => term.length > 0 && !this.stopWords.has(term));
    }

    getSearchableText(item) {
        return [
            item.title || '',
            item.content || '',
            ...(item.tags || [])
        ].join(' ').toLowerCase();
    }

    fuzzyMatch(term, text) {
        const words = text.split(' ');
        return words.some(word => {
            if (word.length === 0 || term.length === 0) return false;
            const distance = this.levenshteinDistance(term, word);
            const maxLength = Math.max(term.length, word.length);
            const similarity = 1 - (distance / maxLength);
            return similarity >= this.fuzzyThreshold;
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

    calculateRelevance(item, searchTerms) {
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
            
            if (title === term) score += 15;
            if (tags.split(' ').includes(term)) score += 12;
        });

        const recencyBonus = this.calculateRecencyBonus(item);
        score += recencyBonus;

        return score;
    }

    calculateRecencyBonus(item) {
        if (!item.created) return 0;
        
        const now = Date.now();
        const created = new Date(item.created).getTime();
        const daysSince = (now - created) / (1000 * 60 * 60 * 24);
        
        if (daysSince < 1) return 3;
        if (daysSince < 7) return 2;
        if (daysSince < 30) return 1;
        return 0;
    }

    findMatchedTerms(item, searchTerms) {
        const searchableText = this.getSearchableText(item);
        return searchTerms.filter(term => 
            searchableText.includes(term) || 
            this.fuzzyMatch(term, searchableText)
        );
    }

    indexItem(item) {
        if (!item || !item.id) return;

        this.searchIndex.set(item.id, item);
        this.buildInvertedIndex(item);
        
        eventBus.emit('search:item-indexed', { id: item.id });
    }

    buildInvertedIndex(item) {
        const text = this.getSearchableText(item);
        const terms = this.tokenize(text);
        
        terms.forEach(term => {
            if (!this.invertedIndex.has(term)) {
                this.invertedIndex.set(term, new Set());
            }
            this.invertedIndex.get(term).add(item.id);
        });
    }

    removeFromIndex(id) {
        const item = this.searchIndex.get(id);
        if (item) {
            const text = this.getSearchableText(item);
            const terms = this.tokenize(text);
            
            terms.forEach(term => {
                if (this.invertedIndex.has(term)) {
                    this.invertedIndex.get(term).delete(id);
                    if (this.invertedIndex.get(term).size === 0) {
                        this.invertedIndex.delete(term);
                    }
                }
            });
            
            this.searchIndex.delete(id);
            eventBus.emit('search:item-removed', { id });
        }
    }

    async reindexAll() {
        try {
            this.searchIndex.clear();
            this.invertedIndex.clear();
            
            const items = await this.getAllItems();
            items.forEach(item => this.indexItem(item));
            
            eventBus.emit('search:reindexed', { count: items.length });
        } catch (error) {
            console.error('Failed to reindex:', error);
            eventBus.emit('search:error', { message: 'Failed to reindex search data' });
        }
    }

    async getSuggestions(query, limit = 5) {
        if (!query || query.length < 2) return [];

        const terms = this.tokenize(query.toLowerCase());
        const lastTerm = terms[terms.length - 1] || query.toLowerCase();
        
        const suggestions = [];
        
        for (const [term, itemIds] of this.invertedIndex.entries()) {
            if (term.startsWith(lastTerm) && term !== lastTerm) {
                suggestions.push({
                    term: term,
                    count: itemIds.size
                });
            }
        }

        suggestions.sort((a, b) => b.count - a.count);
        return suggestions.slice(0, limit).map(s => s.term);
    }

    getSearchStats() {
        return {
            indexedItems: this.searchIndex.size,
            indexedTerms: this.invertedIndex.size,
            workerSupported: !!this.searchWorker
        };
    }

    highlightMatches(text, searchTerms, className = 'search-highlight') {
        if (!searchTerms || searchTerms.length === 0) return text;

        let highlightedText = text;
        
        searchTerms.forEach(term => {
            const regex = new RegExp(`\\b(${term})`, 'gi');
            highlightedText = highlightedText.replace(regex, `<span class="${className}">$1</span>`);
        });

        return highlightedText;
    }

    setFuzzyThreshold(threshold) {
        if (threshold >= 0 && threshold <= 1) {
            this.fuzzyThreshold = threshold;
            eventBus.emit('search:config-updated', {
                fuzzyThreshold: this.fuzzyThreshold
            });
        }
    }

    setMaxResults(max) {
        if (max > 0 && max <= 1000) {
            this.maxResults = max;
            eventBus.emit('search:config-updated', {
                maxResults: this.maxResults
            });
        }
    }

    destroy() {
        if (this.searchWorker) {
            this.searchWorker.terminate();
            this.searchWorker = null;
        }
        
        this.searchIndex.clear();
        this.invertedIndex.clear();
    }
}