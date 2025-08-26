class ViewRenderer {
    constructor() {
        this.eventBus = window.eventBus;
        this.storageManager = null;
        this.templates = new Map();
        this.renderedViews = new Map();
        this.isInitialized = false;
        
        this.eventBus.on('app:ready', () => this.init());
    }

    init() {
        if (this.isInitialized) return;
        
        this.storageManager = window.storageManager;
        this.initializeTemplates();
        this.bindEvents();
        this.isInitialized = true;
        
        this.eventBus.emit('renderer:ready');
    }

    initializeTemplates() {
        this.templates.set('knowledgeCard', this.getKnowledgeCardTemplate());
        this.templates.set('knowledgeList', this.getKnowledgeListTemplate());
        this.templates.set('knowledgeDetail', this.getKnowledgeDetailTemplate());
        this.templates.set('searchResults', this.getSearchResultsTemplate());
        this.templates.set('timeline', this.getTimelineTemplate());
        this.templates.set('statsCard', this.getStatsCardTemplate());
    }

    bindEvents() {
        this.eventBus.on('search:results', (data) => this.renderSearchResults(data));
        this.eventBus.on('knowledge:display', (data) => this.displayKnowledgeDetail(data));
        this.eventBus.on('stats:display', (data) => this.renderStats(data));
        this.eventBus.on('timeline:display', (data) => this.renderTimeline(data));
        this.eventBus.on('view:search:activated', () => this.loadSearchView());
        this.eventBus.on('view:explore:activated', (params) => this.loadExploreView(params));
        this.eventBus.on('storage:save:complete', () => this.refreshCurrentView());
        this.eventBus.on('storage:delete:complete', () => this.refreshCurrentView());
    }

    async loadSearchView() {
        try {
            const allKnowledge = await this.storageManager.getAllKnowledge();
            this.renderSearchResults({
                results: allKnowledge,
                total: allKnowledge.length,
                query: ''
            });
        } catch (error) {
            console.error('Failed to load search view:', error);
            this.showError('Failed to load knowledge entries');
        }
    }

    async loadExploreView(params = {}) {
        try {
            const stats = await this.storageManager.getStats();
            this.renderStats(stats);
            
            if (params.mode === 'timeline') {
                const allKnowledge = await this.storageManager.getAllKnowledge();
                this.renderTimeline({ entries: allKnowledge });
            }
        } catch (error) {
            console.error('Failed to load explore view:', error);
            this.showError('Failed to load exploration data');
        }
    }

    renderSearchResults(data) {
        const container = document.getElementById('search-results');
        const noResults = document.getElementById('no-results');
        
        if (!container) return;

        if (!data.results || data.results.length === 0) {
            container.innerHTML = '';
            if (noResults) {
                noResults.style.display = 'block';
            }
            return;
        }

        if (noResults) {
            noResults.style.display = 'none';
        }

        const html = this.templates.get('searchResults')({
            results: data.results,
            total: data.total,
            query: data.query
        });
        
        container.innerHTML = html;
        this.attachSearchResultsEvents(container);
        this.eventBus.emit('search:results:rendered', data);
    }

    attachSearchResultsEvents(container) {
        container.addEventListener('click', (e) => {
            const card = e.target.closest('.knowledge-card');
            if (card) {
                const id = card.dataset.id;
                this.displayKnowledgeDetail({ id });
            }
        });
    }

    async displayKnowledgeDetail(data) {
        try {
            const knowledge = await this.storageManager.getKnowledge(data.id);
            if (!knowledge) {
                this.showError('Knowledge entry not found');
                return;
            }

            const modal = document.getElementById('knowledge-modal');
            const modalTitle = document.getElementById('modal-title');
            const modalBody = document.getElementById('modal-body');
            
            if (!modal || !modalTitle || !modalBody) return;

            modalTitle.textContent = knowledge.title;
            modalBody.innerHTML = this.templates.get('knowledgeDetail')(knowledge);
            
            modal.style.display = 'block';
            this.attachDetailEvents(modal, knowledge);
            
            modal.focus();
            this.eventBus.emit('knowledge:detail:displayed', knowledge);
            
        } catch (error) {
            console.error('Failed to display knowledge detail:', error);
            this.showError('Failed to load knowledge details');
        }
    }

    attachDetailEvents(modal, knowledge) {
        const editBtn = modal.querySelector('#edit-knowledge');
        const deleteBtn = modal.querySelector('#delete-knowledge');
        
        if (editBtn) {
            editBtn.onclick = () => this.editKnowledge(knowledge);
        }
        
        if (deleteBtn) {
            deleteBtn.onclick = () => this.deleteKnowledge(knowledge);
        }

        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
    }

    editKnowledge(knowledge) {
        this.closeModal();
        this.eventBus.emit('form:load', knowledge);
        this.eventBus.emit('navigation:goto', { view: 'create' });
    }

    async deleteKnowledge(knowledge) {
        const confirmed = confirm(`Are you sure you want to delete "${knowledge.title}"?`);
        if (!confirmed) return;

        try {
            await this.storageManager.deleteKnowledge(knowledge.id);
            this.closeModal();
            this.showSuccess('Knowledge deleted successfully');
            this.eventBus.emit('knowledge:deleted', knowledge);
        } catch (error) {
            console.error('Failed to delete knowledge:', error);
            this.showError('Failed to delete knowledge');
        }
    }

    closeModal() {
        const modal = document.getElementById('knowledge-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    renderStats(stats) {
        const totalElement = document.getElementById('total-entries');
        const categoriesElement = document.getElementById('total-categories');
        const languagesElement = document.getElementById('total-languages');
        const monthElement = document.getElementById('month-entries');
        
        if (totalElement) totalElement.textContent = stats.total || 0;
        if (categoriesElement) categoriesElement.textContent = stats.categories || 0;
        if (languagesElement) languagesElement.textContent = stats.languages || 0;
        if (monthElement) monthElement.textContent = stats.thisMonth || 0;

        this.renderChart(stats);
        this.eventBus.emit('stats:rendered', stats);
    }

    renderChart(stats) {
        const canvas = document.getElementById('knowledge-chart');
        if (!canvas || !stats.categoryBreakdown) return;

        const ctx = canvas.getContext('2d');
        const categories = Object.keys(stats.categoryBreakdown);
        const values = Object.values(stats.categoryBreakdown);
        
        if (categories.length === 0) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const colors = [
            '#3b82f6', '#ef4444', '#10b981', '#f59e0b', 
            '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'
        ];

        const total = values.reduce((sum, val) => sum + val, 0);
        let currentAngle = -Math.PI / 2;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY) - 10;

        values.forEach((value, index) => {
            const sliceAngle = (value / total) * 2 * Math.PI;
            
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
            ctx.lineTo(centerX, centerY);
            ctx.fillStyle = colors[index % colors.length];
            ctx.fill();
            
            currentAngle += sliceAngle;
        });

        this.renderChartLegend(categories, colors, values, total);
    }

    renderChartLegend(categories, colors, values, total) {
        const container = document.querySelector('.chart-container');
        if (!container) return;

        let legend = container.querySelector('.chart-legend');
        if (!legend) {
            legend = document.createElement('div');
            legend.className = 'chart-legend';
            container.appendChild(legend);
        }

        const legendItems = categories.map((category, index) => {
            const percentage = ((values[index] / total) * 100).toFixed(1);
            return `
                <div class="legend-item">
                    <span class="legend-color" style="background-color: ${colors[index % colors.length]}"></span>
                    <span class="legend-text">${category}</span>
                    <span class="legend-value">${values[index]} (${percentage}%)</span>
                </div>
            `;
        }).join('');

        legend.innerHTML = legendItems;
    }

    renderTimeline(data) {
        const container = document.getElementById('knowledge-timeline');
        if (!container) return;

        const timelineData = this.processTimelineData(data.entries);
        const html = this.templates.get('timeline')(timelineData);
        
        container.innerHTML = html;
        this.attachTimelineEvents(container);
        this.eventBus.emit('timeline:rendered', timelineData);
    }

    processTimelineData(entries) {
        const grouped = {};
        
        entries.forEach(entry => {
            const date = new Date(entry.created);
            const dateKey = date.toDateString();
            
            if (!grouped[dateKey]) {
                grouped[dateKey] = {
                    date: dateKey,
                    entries: []
                };
            }
            
            grouped[dateKey].entries.push(entry);
        });

        return Object.values(grouped).sort((a, b) => 
            new Date(b.date) - new Date(a.date)
        );
    }

    attachTimelineEvents(container) {
        container.addEventListener('click', (e) => {
            const entry = e.target.closest('.timeline-entry');
            if (entry) {
                const id = entry.dataset.id;
                this.displayKnowledgeDetail({ id });
            }
        });
    }

    async refreshCurrentView() {
        const currentView = window.navigationHandler?.getCurrentView();
        
        switch (currentView) {
            case 'search':
                await this.loadSearchView();
                break;
            case 'explore':
                await this.loadExploreView();
                break;
        }
    }

    showSuccess(message) {
        if (window.showToast) {
            window.showToast(message, 'success');
        }
    }

    showError(message) {
        if (window.showToast) {
            window.showToast(message, 'error');
        }
    }

    getKnowledgeCardTemplate() {
        return (knowledge) => `
            <div class="knowledge-card" data-id="${knowledge.id}">
                <div class="card-header">
                    <h3 class="card-title">${this.escapeHtml(knowledge.title)}</h3>
                    <span class="card-category">${knowledge.category || 'uncategorized'}</span>
                </div>
                <div class="card-content">
                    <p class="card-description">${this.truncateText(this.escapeHtml(knowledge.content), 150)}</p>
                </div>
                <div class="card-footer">
                    <div class="card-tags">
                        ${(knowledge.tags || []).slice(0, 3).map(tag => 
                            `<span class="tag">${this.escapeHtml(tag)}</span>`
                        ).join('')}
                    </div>
                    <div class="card-meta">
                        <span class="card-date">${this.formatDate(knowledge.created)}</span>
                        <span class="card-language">${knowledge.language || 'en'}</span>
                    </div>
                </div>
            </div>
        `;
    }

    getKnowledgeListTemplate() {
        return (data) => `
            <div class="knowledge-list">
                ${data.results.map(item => this.getKnowledgeCardTemplate()(item)).join('')}
            </div>
        `;
    }

    getKnowledgeDetailTemplate() {
        return (knowledge) => `
            <div class="knowledge-detail">
                <div class="detail-meta">
                    <span class="detail-category">${knowledge.category || 'uncategorized'}</span>
                    <span class="detail-language">${knowledge.language || 'en'}</span>
                    <span class="detail-date">Created: ${this.formatDate(knowledge.created)}</span>
                    ${knowledge.modified !== knowledge.created ? 
                        `<span class="detail-date">Modified: ${this.formatDate(knowledge.modified)}</span>` : ''
                    }
                </div>
                
                <div class="detail-content">
                    <div class="detail-description">
                        ${this.formatContent(knowledge.content)}
                    </div>
                </div>

                ${knowledge.tags && knowledge.tags.length > 0 ? `
                    <div class="detail-tags">
                        <h4>Tags</h4>
                        <div class="tag-list">
                            ${knowledge.tags.map(tag => 
                                `<span class="tag">${this.escapeHtml(tag)}</span>`
                            ).join('')}
                        </div>
                    </div>
                ` : ''}

                ${knowledge.location ? `
                    <div class="detail-location">
                        <h4>Location</h4>
                        <p>${knowledge.location.address || `${knowledge.location.lat}, ${knowledge.location.lng}`}</p>
                    </div>
                ` : ''}

                ${knowledge.attachments && knowledge.attachments.length > 0 ? `
                    <div class="detail-attachments">
                        <h4>Attachments</h4>
                        <div class="attachments-list">
                            ${knowledge.attachments.map(attachment => 
                                this.renderAttachment(attachment)
                            ).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    getSearchResultsTemplate() {
        return (data) => `
            <div class="search-results-header">
                <h3>Search Results</h3>
                <p class="results-count">${data.total} ${data.total === 1 ? 'result' : 'results'}${
                    data.query ? ` for "${data.query}"` : ''
                }</p>
            </div>
            <div class="knowledge-grid">
                ${data.results.map(item => this.getKnowledgeCardTemplate()(item)).join('')}
            </div>
        `;
    }

    getTimelineTemplate() {
        return (timelineData) => `
            <div class="timeline">
                ${timelineData.map(group => `
                    <div class="timeline-group">
                        <h3 class="timeline-date">${this.formatDate(group.date)}</h3>
                        <div class="timeline-entries">
                            ${group.entries.map(entry => `
                                <div class="timeline-entry" data-id="${entry.id}">
                                    <div class="timeline-marker"></div>
                                    <div class="timeline-content">
                                        <h4 class="timeline-title">${this.escapeHtml(entry.title)}</h4>
                                        <p class="timeline-description">${this.truncateText(this.escapeHtml(entry.content), 100)}</p>
                                        <div class="timeline-meta">
                                            <span class="timeline-category">${entry.category || 'uncategorized'}</span>
                                            <span class="timeline-time">${this.formatTime(entry.created)}</span>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    getStatsCardTemplate() {
        return (stats) => `
            <div class="stats-card">
                <h3>${stats.title}</h3>
                <div class="stats-value">${stats.value}</div>
                <div class="stats-description">${stats.description}</div>
            </div>
        `;
    }

    renderAttachment(attachment) {
        switch (attachment.type) {
            case 'image':
                return `
                    <div class="attachment attachment-image">
                        <img src="${attachment.data}" alt="${attachment.name}" loading="lazy">
                        <div class="attachment-info">
                            <span class="attachment-name">${this.escapeHtml(attachment.name)}</span>
                        </div>
                    </div>
                `;
            case 'audio':
                return `
                    <div class="attachment attachment-audio">
                        <audio controls>
                            <source src="${attachment.data}">
                            Your browser does not support audio playback.
                        </audio>
                        <div class="attachment-info">
                            <span class="attachment-name">${this.escapeHtml(attachment.name)}</span>
                        </div>
                    </div>
                `;
            case 'qr':
                return `
                    <div class="attachment attachment-qr">
                        <img src="${attachment.data}" alt="QR Code" class="qr-code">
                        <div class="attachment-info">
                            <span class="attachment-name">${this.escapeHtml(attachment.name)}</span>
                        </div>
                    </div>
                `;
            default:
                return `
                    <div class="attachment attachment-unknown">
                        <div class="attachment-info">
                            <span class="attachment-name">${this.escapeHtml(attachment.name)}</span>
                            <span class="attachment-type">${attachment.type}</span>
                        </div>
                    </div>
                `;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substr(0, maxLength).trim() + '...';
    }

    formatContent(content) {
        return content.split('\n').map(line => 
            `<p>${this.escapeHtml(line)}</p>`
        ).join('');
    }

    formatDate(dateString) {
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch (error) {
            return dateString;
        }
    }

    formatTime(dateString) {
        try {
            const date = new Date(dateString);
            return date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return dateString;
        }
    }

    getTemplate(name) {
        return this.templates.get(name);
    }

    setTemplate(name, template) {
        this.templates.set(name, template);
    }

    clearRenderedViews() {
        this.renderedViews.clear();
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ViewRenderer;
}