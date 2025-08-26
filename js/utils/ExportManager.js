class ExportManager {
    constructor() {
        this.supportedFormats = ['json', 'csv', 'html', 'xml', 'markdown'];
        this.exportHistory = [];
        this.maxHistorySize = 50;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadExportHistory();
    }

    setupEventListeners() {
        eventBus.on('export:json', () => {
            this.exportJSON();
        });

        eventBus.on('export:csv', () => {
            this.exportCSV();
        });

        eventBus.on('export:html', () => {
            this.exportHTML();
        });

        eventBus.on('export:xml', () => {
            this.exportXML();
        });

        eventBus.on('export:markdown', () => {
            this.exportMarkdown();
        });

        eventBus.on('export:single', ({ id, format }) => {
            this.exportSingle(id, format);
        });

        eventBus.on('export:filtered', ({ query, filters, format }) => {
            this.exportFiltered(query, filters, format);
        });

        eventBus.on('import:json', ({ file }) => {
            this.importJSON(file);
        });
    }

    async exportJSON() {
        try {
            eventBus.emit('export:starting', { format: 'json' });

            const data = await this.getAllKnowledgeData();
            const exportData = {
                metadata: {
                    exportedAt: new Date().toISOString(),
                    version: '1.0.0',
                    totalItems: data.length,
                    application: 'KnowledgeVault'
                },
                knowledge: data
            };

            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            
            this.downloadFile(blob, `knowledgevault-export-${this.getDateString()}.json`);
            
            this.addToHistory({
                format: 'json',
                itemCount: data.length,
                fileSize: blob.size
            });

            eventBus.emit('export:completed', {
                format: 'json',
                itemCount: data.length,
                fileSize: blob.size
            });

        } catch (error) {
            console.error('JSON export failed:', error);
            eventBus.emit('export:error', {
                format: 'json',
                message: error.message
            });
        }
    }

    async exportCSV() {
        try {
            eventBus.emit('export:starting', { format: 'csv' });

            const data = await this.getAllKnowledgeData();
            const csvContent = this.convertToCSV(data);
            
            const blob = new Blob([csvContent], { type: 'text/csv' });
            this.downloadFile(blob, `knowledgevault-export-${this.getDateString()}.csv`);
            
            this.addToHistory({
                format: 'csv',
                itemCount: data.length,
                fileSize: blob.size
            });

            eventBus.emit('export:completed', {
                format: 'csv',
                itemCount: data.length,
                fileSize: blob.size
            });

        } catch (error) {
            console.error('CSV export failed:', error);
            eventBus.emit('export:error', {
                format: 'csv',
                message: error.message
            });
        }
    }

    async exportHTML() {
        try {
            eventBus.emit('export:starting', { format: 'html' });

            const data = await this.getAllKnowledgeData();
            const htmlContent = this.convertToHTML(data);
            
            const blob = new Blob([htmlContent], { type: 'text/html' });
            this.downloadFile(blob, `knowledgevault-export-${this.getDateString()}.html`);
            
            this.addToHistory({
                format: 'html',
                itemCount: data.length,
                fileSize: blob.size
            });

            eventBus.emit('export:completed', {
                format: 'html',
                itemCount: data.length,
                fileSize: blob.size
            });

        } catch (error) {
            console.error('HTML export failed:', error);
            eventBus.emit('export:error', {
                format: 'html',
                message: error.message
            });
        }
    }

    async exportXML() {
        try {
            eventBus.emit('export:starting', { format: 'xml' });

            const data = await this.getAllKnowledgeData();
            const xmlContent = this.convertToXML(data);
            
            const blob = new Blob([xmlContent], { type: 'application/xml' });
            this.downloadFile(blob, `knowledgevault-export-${this.getDateString()}.xml`);
            
            this.addToHistory({
                format: 'xml',
                itemCount: data.length,
                fileSize: blob.size
            });

            eventBus.emit('export:completed', {
                format: 'xml',
                itemCount: data.length,
                fileSize: blob.size
            });

        } catch (error) {
            console.error('XML export failed:', error);
            eventBus.emit('export:error', {
                format: 'xml',
                message: error.message
            });
        }
    }

    async exportMarkdown() {
        try {
            eventBus.emit('export:starting', { format: 'markdown' });

            const data = await this.getAllKnowledgeData();
            const markdownContent = this.convertToMarkdown(data);
            
            const blob = new Blob([markdownContent], { type: 'text/markdown' });
            this.downloadFile(blob, `knowledgevault-export-${this.getDateString()}.md`);
            
            this.addToHistory({
                format: 'markdown',
                itemCount: data.length,
                fileSize: blob.size
            });

            eventBus.emit('export:completed', {
                format: 'markdown',
                itemCount: data.length,
                fileSize: blob.size
            });

        } catch (error) {
            console.error('Markdown export failed:', error);
            eventBus.emit('export:error', {
                format: 'markdown',
                message: error.message
            });
        }
    }

    async exportSingle(id, format) {
        try {
            if (!window.storageManager) {
                throw new Error('Storage manager not available');
            }

            const item = await window.storageManager.getKnowledge(id);
            if (!item) {
                throw new Error('Knowledge item not found');
            }

            let content;
            let mimeType;
            let extension;

            switch (format.toLowerCase()) {
                case 'json':
                    content = JSON.stringify(item, null, 2);
                    mimeType = 'application/json';
                    extension = 'json';
                    break;
                case 'html':
                    content = this.convertSingleToHTML(item);
                    mimeType = 'text/html';
                    extension = 'html';
                    break;
                case 'markdown':
                    content = this.convertSingleToMarkdown(item);
                    mimeType = 'text/markdown';
                    extension = 'md';
                    break;
                case 'txt':
                    content = this.convertSingleToText(item);
                    mimeType = 'text/plain';
                    extension = 'txt';
                    break;
                default:
                    throw new Error(`Unsupported format: ${format}`);
            }

            const blob = new Blob([content], { type: mimeType });
            const fileName = `${this.sanitizeFileName(item.title)}-${this.getDateString()}.${extension}`;
            
            this.downloadFile(blob, fileName);

            eventBus.emit('export:single:completed', {
                id,
                format,
                title: item.title,
                fileSize: blob.size
            });

        } catch (error) {
            console.error('Single export failed:', error);
            eventBus.emit('export:error', {
                format: `single-${format}`,
                message: error.message
            });
        }
    }

    async exportFiltered(query, filters, format) {
        try {
            if (!window.storageManager) {
                throw new Error('Storage manager not available');
            }

            const results = await window.storageManager.searchKnowledge(query, filters);
            
            if (results.length === 0) {
                eventBus.emit('export:error', {
                    format: `filtered-${format}`,
                    message: 'No results found for the specified criteria'
                });
                return;
            }

            let content;
            let mimeType;
            let extension;

            switch (format.toLowerCase()) {
                case 'json':
                    content = JSON.stringify({
                        metadata: {
                            exportedAt: new Date().toISOString(),
                            query,
                            filters,
                            totalItems: results.length
                        },
                        knowledge: results
                    }, null, 2);
                    mimeType = 'application/json';
                    extension = 'json';
                    break;
                case 'csv':
                    content = this.convertToCSV(results);
                    mimeType = 'text/csv';
                    extension = 'csv';
                    break;
                case 'html':
                    content = this.convertToHTML(results, { query, filters });
                    mimeType = 'text/html';
                    extension = 'html';
                    break;
                default:
                    throw new Error(`Unsupported format: ${format}`);
            }

            const blob = new Blob([content], { type: mimeType });
            const fileName = `knowledgevault-filtered-${this.getDateString()}.${extension}`;
            
            this.downloadFile(blob, fileName);

            eventBus.emit('export:filtered:completed', {
                query,
                filters,
                format,
                itemCount: results.length,
                fileSize: blob.size
            });

        } catch (error) {
            console.error('Filtered export failed:', error);
            eventBus.emit('export:error', {
                format: `filtered-${format}`,
                message: error.message
            });
        }
    }

    async importJSON(file) {
        try {
            if (!file || file.type !== 'application/json') {
                throw new Error('Invalid file type. Please select a JSON file.');
            }

            eventBus.emit('import:starting', { fileName: file.name });

            const content = await this.readFileContent(file);
            const data = JSON.parse(content);

            let items = [];
            if (data.knowledge && Array.isArray(data.knowledge)) {
                items = data.knowledge;
            } else if (Array.isArray(data)) {
                items = data;
            } else {
                throw new Error('Invalid JSON structure');
            }

            if (!window.storageManager) {
                throw new Error('Storage manager not available');
            }

            let imported = 0;
            let errors = [];

            for (const item of items) {
                try {
                    delete item.id;
                    await window.storageManager.saveKnowledge(item);
                    imported++;
                } catch (error) {
                    errors.push({
                        title: item.title || 'Unknown',
                        error: error.message
                    });
                }
            }

            eventBus.emit('import:completed', {
                fileName: file.name,
                totalItems: items.length,
                imported,
                errors: errors.length,
                errorDetails: errors
            });

        } catch (error) {
            console.error('Import failed:', error);
            eventBus.emit('import:error', {
                fileName: file?.name || 'unknown',
                message: error.message
            });
        }
    }

    async getAllKnowledgeData() {
        if (!window.storageManager) {
            throw new Error('Storage manager not available');
        }
        
        return await window.storageManager.getAllKnowledge();
    }

    convertToCSV(data) {
        if (!data || data.length === 0) {
            return 'No data to export';
        }

        const headers = [
            'ID', 'Title', 'Content', 'Category', 'Language', 'Tags', 
            'Created', 'Modified', 'Location', 'Media Count'
        ];

        const csvRows = [headers.join(',')];

        data.forEach(item => {
            const row = [
                this.escapeCsvField(item.id || ''),
                this.escapeCsvField(item.title || ''),
                this.escapeCsvField(item.content || ''),
                this.escapeCsvField(item.category || ''),
                this.escapeCsvField(item.language || ''),
                this.escapeCsvField((item.tags || []).join('; ')),
                this.escapeCsvField(item.created || ''),
                this.escapeCsvField(item.modified || ''),
                this.escapeCsvField(item.location ? 
                    `${item.location.coordinates?.lat || ''}, ${item.location.coordinates?.lon || ''}` : ''),
                this.escapeCsvField(((item.media || []).length + (item.images || []).length + (item.audio || []).length).toString())
            ];
            csvRows.push(row.join(','));
        });

        return csvRows.join('\n');
    }

    convertToHTML(data, metadata = {}) {
        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KnowledgeVault Export</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 1200px; 
            margin: 0 auto; 
            padding: 20px;
            line-height: 1.6;
            color: #333;
        }
        .header { 
            background: #f8f9fa; 
            padding: 20px; 
            border-radius: 8px; 
            margin-bottom: 30px;
            text-align: center;
        }
        .metadata {
            background: #e9ecef;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 30px;
            font-size: 0.9em;
        }
        .knowledge-item { 
            border: 1px solid #dee2e6; 
            padding: 20px; 
            margin-bottom: 20px; 
            border-radius: 8px;
            background: white;
        }
        .knowledge-title { 
            color: #2c3e50; 
            margin-bottom: 10px;
            font-size: 1.3em;
            font-weight: 600;
        }
        .knowledge-meta {
            color: #6c757d;
            font-size: 0.9em;
            margin-bottom: 15px;
        }
        .knowledge-content { 
            margin-bottom: 15px;
            white-space: pre-wrap;
        }
        .tags { 
            margin-top: 10px; 
        }
        .tag { 
            background: #007bff; 
            color: white; 
            padding: 3px 8px; 
            border-radius: 3px; 
            font-size: 0.8em;
            margin-right: 5px;
            display: inline-block;
        }
        .location {
            color: #28a745;
            font-weight: 500;
        }
        @media (max-width: 768px) {
            body { padding: 10px; }
            .knowledge-item { padding: 15px; }
        }
        @media print {
            .knowledge-item { break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>>à KnowledgeVault Export</h1>
        <p>Exported on ${new Date().toLocaleDateString()}</p>
    </div>
    
    ${metadata.query || metadata.filters ? `
    <div class="metadata">
        <h3>Export Criteria</h3>
        ${metadata.query ? `<p><strong>Search Query:</strong> ${metadata.query}</p>` : ''}
        ${metadata.filters ? `<p><strong>Filters:</strong> ${JSON.stringify(metadata.filters)}</p>` : ''}
    </div>
    ` : ''}
    
    <div class="stats">
        <p><strong>Total Items:</strong> ${data.length}</p>
    </div>
    
    ${data.map(item => `
        <div class="knowledge-item">
            <h2 class="knowledge-title">${this.escapeHtml(item.title || 'Untitled')}</h2>
            <div class="knowledge-meta">
                <strong>Category:</strong> ${this.escapeHtml(item.category || 'None')} | 
                <strong>Language:</strong> ${this.escapeHtml(item.language || 'Unknown')} | 
                <strong>Created:</strong> ${new Date(item.created).toLocaleDateString()}
                ${item.location ? `| <span class="location">=Í Location: ${this.escapeHtml(item.location.address?.displayName || 'Coordinates available')}</span>` : ''}
            </div>
            <div class="knowledge-content">${this.escapeHtml(item.content || '')}</div>
            ${(item.tags && item.tags.length > 0) ? `
                <div class="tags">
                    ${item.tags.map(tag => `<span class="tag">${this.escapeHtml(tag)}</span>`).join('')}
                </div>
            ` : ''}
        </div>
    `).join('')}
    
    <div class="header" style="margin-top: 40px;">
        <p>Generated by <a href="#" style="color: #007bff; text-decoration: none;">KnowledgeVault</a></p>
    </div>
</body>
</html>`;

        return html;
    }

    convertToXML(data) {
        const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>\n';
        const xmlContent = `<knowledgevault exported="${new Date().toISOString()}" version="1.0">
    <metadata>
        <totalItems>${data.length}</totalItems>
        <application>KnowledgeVault</application>
    </metadata>
    <knowledge>
${data.map(item => `        <item id="${this.escapeXml(item.id || '')}">
            <title>${this.escapeXml(item.title || '')}</title>
            <content>${this.escapeXml(item.content || '')}</content>
            <category>${this.escapeXml(item.category || '')}</category>
            <language>${this.escapeXml(item.language || '')}</language>
            <tags>
${(item.tags || []).map(tag => `                <tag>${this.escapeXml(tag)}</tag>`).join('\n')}
            </tags>
            <created>${this.escapeXml(item.created || '')}</created>
            <modified>${this.escapeXml(item.modified || '')}</modified>
            ${item.location ? `<location>
                <coordinates>
                    <lat>${item.location.coordinates?.lat || ''}</lat>
                    <lon>${item.location.coordinates?.lon || ''}</lon>
                </coordinates>
                <address>${this.escapeXml(item.location.address?.displayName || '')}</address>
            </location>` : ''}
        </item>`).join('\n')}
    </knowledge>
</knowledgevault>`;

        return xmlHeader + xmlContent;
    }

    convertToMarkdown(data) {
        let markdown = `# >à KnowledgeVault Export\n\n`;
        markdown += `**Exported:** ${new Date().toLocaleDateString()}\n`;
        markdown += `**Total Items:** ${data.length}\n\n`;
        markdown += `---\n\n`;

        data.forEach((item, index) => {
            markdown += `## ${index + 1}. ${item.title || 'Untitled'}\n\n`;
            
            markdown += `**Category:** ${item.category || 'None'} | `;
            markdown += `**Language:** ${item.language || 'Unknown'} | `;
            markdown += `**Created:** ${new Date(item.created).toLocaleDateString()}\n\n`;
            
            if (item.tags && item.tags.length > 0) {
                markdown += `**Tags:** ${item.tags.join(', ')}\n\n`;
            }
            
            if (item.location) {
                markdown += `**Location:** =Í ${item.location.address?.displayName || 'Coordinates available'}\n\n`;
            }
            
            markdown += `${item.content || ''}\n\n`;
            markdown += `---\n\n`;
        });

        markdown += `*Generated by KnowledgeVault*\n`;
        return markdown;
    }

    convertSingleToHTML(item) {
        return this.convertToHTML([item]);
    }

    convertSingleToMarkdown(item) {
        let markdown = `# ${item.title || 'Untitled'}\n\n`;
        
        markdown += `**Category:** ${item.category || 'None'}\n`;
        markdown += `**Language:** ${item.language || 'Unknown'}\n`;
        markdown += `**Created:** ${new Date(item.created).toLocaleDateString()}\n\n`;
        
        if (item.tags && item.tags.length > 0) {
            markdown += `**Tags:** ${item.tags.join(', ')}\n\n`;
        }
        
        if (item.location) {
            markdown += `**Location:** =Í ${item.location.address?.displayName || 'Coordinates available'}\n\n`;
        }
        
        markdown += `${item.content || ''}\n\n`;
        markdown += `*Generated by KnowledgeVault*\n`;
        
        return markdown;
    }

    convertSingleToText(item) {
        let text = `${item.title || 'Untitled'}\n`;
        text += `${'='.repeat((item.title || 'Untitled').length)}\n\n`;
        
        text += `Category: ${item.category || 'None'}\n`;
        text += `Language: ${item.language || 'Unknown'}\n`;
        text += `Created: ${new Date(item.created).toLocaleDateString()}\n`;
        
        if (item.tags && item.tags.length > 0) {
            text += `Tags: ${item.tags.join(', ')}\n`;
        }
        
        if (item.location) {
            text += `Location: ${item.location.address?.displayName || 'Coordinates available'}\n`;
        }
        
        text += `\n${item.content || ''}\n\n`;
        text += `Generated by KnowledgeVault\n`;
        
        return text;
    }

    readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result);
            reader.onerror = (error) => reject(error);
            reader.readAsText(file);
        });
    }

    downloadFile(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    escapeCsvField(field) {
        if (typeof field !== 'string') return '';
        if (field.includes(',') || field.includes('"') || field.includes('\n')) {
            return '"' + field.replace(/"/g, '""') + '"';
        }
        return field;
    }

    escapeHtml(text) {
        if (typeof text !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    escapeXml(text) {
        if (typeof text !== 'string') return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    sanitizeFileName(fileName) {
        if (typeof fileName !== 'string') return 'untitled';
        return fileName
            .replace(/[^a-zA-Z0-9\s\-_]/g, '')
            .replace(/\s+/g, '-')
            .substring(0, 50);
    }

    getDateString() {
        const now = new Date();
        return now.toISOString().split('T')[0];
    }

    addToHistory(exportInfo) {
        const historyItem = {
            ...exportInfo,
            timestamp: new Date().toISOString()
        };

        this.exportHistory.unshift(historyItem);
        
        if (this.exportHistory.length > this.maxHistorySize) {
            this.exportHistory = this.exportHistory.slice(0, this.maxHistorySize);
        }

        this.saveExportHistory();
        eventBus.emit('export:history-updated', this.exportHistory);
    }

    loadExportHistory() {
        try {
            const stored = localStorage.getItem('kv_export_history');
            if (stored) {
                this.exportHistory = JSON.parse(stored);
            }
        } catch (error) {
            console.warn('Failed to load export history:', error);
            this.exportHistory = [];
        }
    }

    saveExportHistory() {
        try {
            localStorage.setItem('kv_export_history', JSON.stringify(this.exportHistory));
        } catch (error) {
            console.warn('Failed to save export history:', error);
        }
    }

    getExportHistory() {
        return [...this.exportHistory];
    }

    clearHistory() {
        this.exportHistory = [];
        this.saveExportHistory();
        eventBus.emit('export:history-cleared');
    }

    getSupportedFormats() {
        return [...this.supportedFormats];
    }

    getExportStats() {
        const stats = {
            totalExports: this.exportHistory.length,
            formatBreakdown: {},
            totalSize: 0,
            lastExport: null
        };

        this.exportHistory.forEach(item => {
            stats.formatBreakdown[item.format] = (stats.formatBreakdown[item.format] || 0) + 1;
            stats.totalSize += item.fileSize || 0;
            
            if (!stats.lastExport || item.timestamp > stats.lastExport) {
                stats.lastExport = item.timestamp;
            }
        });

        return stats;
    }
}