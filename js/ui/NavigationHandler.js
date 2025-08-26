class NavigationHandler {
    constructor() {
        this.eventBus = window.eventBus;
        this.currentView = 'create';
        this.viewHistory = [];
        this.maxHistoryLength = 20;
        this.views = new Map();
        this.isInitialized = false;
        
        this.eventBus.on('app:ready', () => this.init());
    }

    init() {
        if (this.isInitialized) return;
        
        this.setupViewMap();
        this.bindEvents();
        this.handleInitialRoute();
        this.isInitialized = true;
        
        this.eventBus.emit('navigation:ready');
    }

    setupViewMap() {
        this.views.set('create', {
            element: document.getElementById('create-view'),
            navButton: document.querySelector('[data-view="create"]'),
            title: 'Create Knowledge',
            requires: []
        });

        this.views.set('search', {
            element: document.getElementById('search-view'),
            navButton: document.querySelector('[data-view="search"]'),
            title: 'Search Knowledge',
            requires: ['storage']
        });

        this.views.set('explore', {
            element: document.getElementById('explore-view'),
            navButton: document.querySelector('[data-view="explore"]'),
            title: 'Explore Knowledge',
            requires: ['storage', 'geo']
        });

        this.views.set('export', {
            element: document.getElementById('export-view'),
            navButton: document.querySelector('[data-view="export"]'),
            title: 'Export Knowledge',
            requires: ['storage']
        });
    }

    bindEvents() {
        window.addEventListener('hashchange', () => this.handleHashChange());
        window.addEventListener('popstate', (e) => this.handlePopState(e));
        
        document.addEventListener('click', (e) => {
            const navButton = e.target.closest('[data-view]');
            if (navButton) {
                e.preventDefault();
                const targetView = navButton.dataset.view;
                this.navigateTo(targetView);
            }
        });

        document.addEventListener('keydown', (e) => this.handleKeyboardNavigation(e));

        this.eventBus.on('navigation:goto', (data) => {
            this.navigateTo(data.view, data.params);
        });

        this.eventBus.on('navigation:back', () => this.goBack());
        this.eventBus.on('navigation:forward', () => this.goForward());
    }

    handleInitialRoute() {
        const hash = window.location.hash.slice(1);
        const initialView = this.isValidView(hash) ? hash : 'create';
        
        this.navigateTo(initialView, {}, false);
    }

    handleHashChange() {
        const hash = window.location.hash.slice(1);
        if (this.isValidView(hash) && hash !== this.currentView) {
            this.switchToView(hash);
        }
    }

    handlePopState(event) {
        if (event.state && event.state.view) {
            this.switchToView(event.state.view, event.state.params || {}, false);
        }
    }

    navigateTo(viewName, params = {}, updateHistory = true) {
        if (!this.isValidView(viewName)) {
            console.warn(`Invalid view: ${viewName}`);
            return false;
        }

        const view = this.views.get(viewName);
        
        if (!this.checkViewRequirements(view)) {
            this.showRequirementError(view);
            return false;
        }

        if (updateHistory) {
            this.addToHistory(this.currentView);
            const url = `#${viewName}`;
            window.history.pushState(
                { view: viewName, params },
                view.title,
                url
            );
        }

        this.switchToView(viewName, params, updateHistory);
        return true;
    }

    switchToView(viewName, params = {}, updateHistory = true) {
        if (viewName === this.currentView) return;

        const previousView = this.currentView;
        const view = this.views.get(viewName);
        
        if (!view) {
            console.error(`View not found: ${viewName}`);
            return;
        }

        this.eventBus.emit('view:before-change', {
            from: previousView,
            to: viewName,
            params
        });

        this.hideCurrentView();
        this.showView(viewName, params);
        this.updateNavigation(viewName);
        this.updatePageTitle(view.title);
        this.currentView = viewName;

        this.eventBus.emit('view:changed', {
            from: previousView,
            to: viewName,
            params
        });

        this.eventBus.emit(`view:${viewName}:activated`, params);
    }

    hideCurrentView() {
        this.views.forEach((view, name) => {
            if (view.element) {
                view.element.classList.remove('active');
                view.element.setAttribute('aria-hidden', 'true');
            }
            if (view.navButton) {
                view.navButton.classList.remove('active');
                view.navButton.setAttribute('aria-selected', 'false');
            }
        });
    }

    showView(viewName, params = {}) {
        const view = this.views.get(viewName);
        if (!view || !view.element) return;

        view.element.classList.add('active');
        view.element.setAttribute('aria-hidden', 'false');
        
        if (view.navButton) {
            view.navButton.classList.add('active');
            view.navButton.setAttribute('aria-selected', 'true');
        }

        this.focusFirstElement(view.element);
        this.initializeViewContent(viewName, params);
    }

    updateNavigation(activeView) {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
            btn.setAttribute('aria-selected', 'false');
        });

        const activeBtn = document.querySelector(`[data-view="${activeView}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
            activeBtn.setAttribute('aria-selected', 'true');
        }
    }

    updatePageTitle(viewTitle) {
        document.title = `${viewTitle} - KnowledgeVault`;
    }

    focusFirstElement(container) {
        const focusableElements = container.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        
        if (focusableElements.length > 0) {
            focusableElements[0].focus();
        }
    }

    initializeViewContent(viewName, params) {
        switch (viewName) {
            case 'search':
                this.initializeSearchView(params);
                break;
            case 'explore':
                this.initializeExploreView(params);
                break;
            case 'export':
                this.initializeExportView(params);
                break;
        }
    }

    initializeSearchView(params) {
        if (params.query) {
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.value = params.query;
                this.eventBus.emit('search:query', { query: params.query });
            }
        }

        if (params.category) {
            const categoryFilter = document.getElementById('filter-category');
            if (categoryFilter) {
                categoryFilter.value = params.category;
            }
        }

        this.eventBus.emit('search:view:ready', params);
    }

    initializeExploreView(params) {
        const mode = params.mode || 'map';
        this.switchExploreMode(mode);
        
        this.eventBus.emit('explore:view:ready', params);
    }

    initializeExportView(params) {
        this.eventBus.emit('export:view:ready', params);
    }

    switchExploreMode(mode) {
        const modes = ['map', 'timeline', 'stats'];
        if (!modes.includes(mode)) {
            mode = 'map';
        }

        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        const modeBtn = document.querySelector(`[data-mode="${mode}"]`);
        if (modeBtn) {
            modeBtn.classList.add('active');
        }

        document.querySelectorAll('.explore-content > div').forEach(container => {
            container.style.display = 'none';
        });

        const container = document.getElementById(`${mode}-container`);
        if (container) {
            container.style.display = 'block';
        }

        this.eventBus.emit('explore:mode:changed', { mode });
    }

    addToHistory(viewName) {
        if (viewName && viewName !== this.viewHistory[this.viewHistory.length - 1]) {
            this.viewHistory.push(viewName);
            
            if (this.viewHistory.length > this.maxHistoryLength) {
                this.viewHistory.shift();
            }
        }
    }

    goBack() {
        if (this.viewHistory.length > 0) {
            const previousView = this.viewHistory.pop();
            this.navigateTo(previousView);
            return true;
        }
        return false;
    }

    goForward() {
        if (window.history.state && window.history.state.view) {
            window.history.forward();
            return true;
        }
        return false;
    }

    isValidView(viewName) {
        return this.views.has(viewName);
    }

    checkViewRequirements(view) {
        if (!view.requires || view.requires.length === 0) {
            return true;
        }

        return view.requires.every(requirement => {
            switch (requirement) {
                case 'storage':
                    return window.storageManager && window.storageManager.db;
                case 'geo':
                    return 'geolocation' in navigator;
                default:
                    return true;
            }
        });
    }

    showRequirementError(view) {
        const missingRequirements = view.requires.filter(req => !this.checkViewRequirements({ requires: [req] }));
        
        let message = 'This feature requires: ';
        const reqMessages = {
            'storage': 'local storage support',
            'geo': 'location services'
        };

        const descriptions = missingRequirements.map(req => reqMessages[req] || req);
        message += descriptions.join(', ');

        if (window.showToast) {
            window.showToast(message, 'warning');
        }
    }

    handleKeyboardNavigation(event) {
        if (event.ctrlKey || event.metaKey) {
            const key = event.key;
            
            switch (key) {
                case '1':
                    event.preventDefault();
                    this.navigateTo('create');
                    break;
                case '2':
                    event.preventDefault();
                    this.navigateTo('search');
                    break;
                case '3':
                    event.preventDefault();
                    this.navigateTo('explore');
                    break;
                case '4':
                    event.preventDefault();
                    this.navigateTo('export');
                    break;
            }
        }

        if (event.altKey) {
            switch (event.key) {
                case 'ArrowLeft':
                    event.preventDefault();
                    this.goBack();
                    break;
                case 'ArrowRight':
                    event.preventDefault();
                    this.goForward();
                    break;
            }
        }
    }

    getCurrentView() {
        return this.currentView;
    }

    getViewHistory() {
        return [...this.viewHistory];
    }

    canGoBack() {
        return this.viewHistory.length > 0;
    }

    canGoForward() {
        return window.history.state && window.history.state.view !== this.currentView;
    }

    getViewTitle(viewName) {
        const view = this.views.get(viewName);
        return view ? view.title : viewName;
    }

    getAllViews() {
        return Array.from(this.views.keys());
    }

    setViewTitle(viewName, title) {
        const view = this.views.get(viewName);
        if (view) {
            view.title = title;
            
            if (viewName === this.currentView) {
                this.updatePageTitle(title);
            }
        }
    }

    refreshCurrentView() {
        const params = window.history.state ? window.history.state.params : {};
        this.initializeViewContent(this.currentView, params);
        this.eventBus.emit(`view:${this.currentView}:refreshed`, params);
    }

    isViewActive(viewName) {
        return this.currentView === viewName;
    }

    buildViewUrl(viewName, params = {}) {
        let url = `#${viewName}`;
        
        const queryParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                queryParams.set(key, value);
            }
        });
        
        const queryString = queryParams.toString();
        if (queryString) {
            url += `?${queryString}`;
        }
        
        return url;
    }

    parseCurrentUrl() {
        const hash = window.location.hash.slice(1);
        const [viewName, queryString] = hash.split('?');
        const params = {};
        
        if (queryString) {
            const urlParams = new URLSearchParams(queryString);
            for (const [key, value] of urlParams) {
                params[key] = value;
            }
        }
        
        return { view: viewName || 'create', params };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NavigationHandler;
}