class FormController {
    constructor() {
        this.eventBus = window.eventBus;
        this.storageManager = null;
        this.dataValidator = null;
        this.currentDraft = null;
        this.autoSaveInterval = null;
        this.mediaAttachments = new Map();
        
        this.eventBus.on('app:ready', () => this.init());
    }

    init() {
        this.storageManager = window.storageManager;
        this.dataValidator = window.dataValidator;
        this.bindEvents();
        this.setupAutoSave();
        this.loadLastDraft();
    }

    bindEvents() {
        const form = document.getElementById('knowledge-form');
        const saveDraftBtn = document.getElementById('save-draft');
        const mediaButtons = document.querySelectorAll('.media-btn');
        const charCounters = document.querySelectorAll('[data-target]');
        
        if (form) {
            form.addEventListener('submit', (e) => this.handleSubmit(e));
            form.addEventListener('input', (e) => this.handleInputChange(e));
        }

        if (saveDraftBtn) {
            saveDraftBtn.addEventListener('click', () => this.saveDraft());
        }

        mediaButtons.forEach(btn => {
            btn.addEventListener('click', (e) => this.handleMediaButton(e));
        });

        charCounters.forEach(counter => {
            const targetId = counter.dataset.target;
            const targetInput = document.getElementById(targetId);
            if (targetInput) {
                targetInput.addEventListener('input', () => this.updateCharCounter(targetInput, counter));
            }
        });

        this.eventBus.on('storage:ready', () => {
            this.enableForm();
        });

        this.eventBus.on('form:reset', () => this.resetForm());
        this.eventBus.on('form:load', (data) => this.loadFormData(data));
    }

    handleSubmit(event) {
        event.preventDefault();
        
        const formData = this.collectFormData();
        const validation = this.dataValidator?.validate(formData, 'knowledge');
        
        if (validation && !validation.isValid) {
            this.displayValidationErrors(validation.errors);
            return;
        }

        this.saveKnowledge(formData);
    }

    async saveKnowledge(formData) {
        try {
            this.setFormState('saving');
            
            const knowledgeItem = {
                ...formData,
                id: formData.id || this.generateId(),
                created: formData.created || new Date().toISOString(),
                modified: new Date().toISOString(),
                attachments: Array.from(this.mediaAttachments.values())
            };

            await this.storageManager.saveKnowledge(knowledgeItem);
            
            this.clearDraft();
            this.resetForm();
            this.showSuccess('Knowledge saved successfully!');
            
            this.eventBus.emit('knowledge:saved', knowledgeItem);
            
        } catch (error) {
            console.error('Error saving knowledge:', error);
            this.showError('Failed to save knowledge. Please try again.');
            this.setFormState('error');
        } finally {
            this.setFormState('ready');
        }
    }

    async saveDraft(showMessage = true) {
        try {
            const formData = this.collectFormData();
            
            if (!formData.title && !formData.content) {
                return;
            }

            const draft = {
                ...formData,
                id: this.currentDraft?.id || this.generateId(),
                isDraft: true,
                saved: new Date().toISOString()
            };

            await this.storageManager.saveDraft(draft);
            this.currentDraft = draft;
            
            if (showMessage) {
                this.showInfo('Draft saved');
            }
            
        } catch (error) {
            console.error('Error saving draft:', error);
            if (showMessage) {
                this.showError('Failed to save draft');
            }
        }
    }

    collectFormData() {
        const form = document.getElementById('knowledge-form');
        const formData = new FormData(form);
        
        return {
            title: formData.get('title')?.trim() || '',
            content: formData.get('content')?.trim() || '',
            category: formData.get('category') || '',
            language: formData.get('language') || 'en',
            tags: this.processTags(formData.get('tags') || ''),
            location: this.getLocationData()
        };
    }

    processTags(tagsString) {
        return tagsString
            .split(',')
            .map(tag => tag.trim())
            .filter(tag => tag.length > 0)
            .slice(0, 20); // Limit to 20 tags
    }

    getLocationData() {
        const locationInfo = document.getElementById('location-info');
        if (locationInfo && locationInfo.dataset.lat && locationInfo.dataset.lng) {
            return {
                lat: parseFloat(locationInfo.dataset.lat),
                lng: parseFloat(locationInfo.dataset.lng),
                address: locationInfo.dataset.address || ''
            };
        }
        return null;
    }

    loadFormData(data) {
        const form = document.getElementById('knowledge-form');
        if (!form) return;

        form.title.value = data.title || '';
        form.content.value = data.content || '';
        form.category.value = data.category || '';
        form.language.value = data.language || 'en';
        form.tags.value = (data.tags || []).join(', ');

        this.updateAllCharCounters();
        
        if (data.location) {
            this.displayLocation(data.location);
        }

        if (data.attachments) {
            data.attachments.forEach(attachment => {
                this.displayMediaPreview(attachment);
            });
        }
    }

    async loadLastDraft() {
        try {
            const drafts = await this.storageManager.getDrafts();
            if (drafts && drafts.length > 0) {
                const lastDraft = drafts[0];
                this.currentDraft = lastDraft;
                
                const shouldLoad = confirm('Continue working on your last draft?');
                if (shouldLoad) {
                    this.loadFormData(lastDraft);
                }
            }
        } catch (error) {
            console.error('Error loading draft:', error);
        }
    }

    resetForm() {
        const form = document.getElementById('knowledge-form');
        if (form) {
            form.reset();
        }
        
        this.clearMediaPreviews();
        this.clearLocation();
        this.updateAllCharCounters();
        this.currentDraft = null;
        this.mediaAttachments.clear();
        
        this.eventBus.emit('form:reset:complete');
    }

    setupAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }
        
        this.autoSaveInterval = setInterval(() => {
            this.saveDraft(false);
        }, 10000); // Auto-save every 10 seconds
    }

    handleInputChange(event) {
        const target = event.target;
        
        // Real-time validation
        if (this.dataValidator) {
            const validation = this.dataValidator.validateField(target.name, target.value);
            this.displayFieldValidation(target, validation);
        }

        // Character counters
        const counter = document.querySelector(`[data-target="${target.id}"]`);
        if (counter) {
            this.updateCharCounter(target, counter);
        }

        this.eventBus.emit('form:changed', {
            field: target.name,
            value: target.value
        });
    }

    updateCharCounter(input, counter) {
        const current = input.value.length;
        const max = input.maxLength || Infinity;
        counter.textContent = `${current}${max !== Infinity ? ' / ' + max : ''}`;
        
        if (max !== Infinity) {
            counter.classList.toggle('near-limit', current > max * 0.8);
            counter.classList.toggle('at-limit', current >= max);
        }
    }

    updateAllCharCounters() {
        document.querySelectorAll('[data-target]').forEach(counter => {
            const targetId = counter.dataset.target;
            const targetInput = document.getElementById(targetId);
            if (targetInput) {
                this.updateCharCounter(targetInput, counter);
            }
        });
    }

    handleMediaButton(event) {
        const button = event.target.closest('.media-btn');
        const action = button.id;
        
        switch (action) {
            case 'add-image':
                this.addImage();
                break;
            case 'add-audio':
                this.recordAudio();
                break;
            case 'add-location':
                this.addLocation();
                break;
            case 'add-qr':
                this.generateQR();
                break;
        }
    }

    addImage() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;
        
        input.onchange = (e) => {
            Array.from(e.target.files).forEach(file => {
                this.processImage(file);
            });
        };
        
        input.click();
    }

    async processImage(file) {
        if (window.imageProcessor) {
            try {
                const processedImage = await window.imageProcessor.processImage(file);
                const attachment = {
                    id: this.generateId(),
                    type: 'image',
                    name: file.name,
                    size: file.size,
                    data: processedImage,
                    created: new Date().toISOString()
                };
                
                this.mediaAttachments.set(attachment.id, attachment);
                this.displayMediaPreview(attachment);
                
            } catch (error) {
                console.error('Error processing image:', error);
                this.showError('Failed to process image');
            }
        } else {
            this.showError('Image processing not available');
        }
    }

    recordAudio() {
        if (window.audioRecorder) {
            this.eventBus.emit('audio:record:start', {
                callback: (audioData) => {
                    const attachment = {
                        id: this.generateId(),
                        type: 'audio',
                        name: 'Recording ' + new Date().toLocaleString(),
                        data: audioData,
                        created: new Date().toISOString()
                    };
                    
                    this.mediaAttachments.set(attachment.id, attachment);
                    this.displayMediaPreview(attachment);
                }
            });
        } else {
            this.showError('Audio recording not available');
        }
    }

    addLocation() {
        const locationSection = document.getElementById('location-section');
        if (locationSection) {
            locationSection.style.display = 'block';
            
            if (window.geoLocator) {
                this.eventBus.emit('location:request');
            }
        }
    }

    generateQR() {
        const formData = this.collectFormData();
        if (!formData.title || !formData.content) {
            this.showError('Please add title and content first');
            return;
        }

        this.eventBus.emit('qr:generate', {
            data: formData,
            callback: (qrData) => {
                const attachment = {
                    id: this.generateId(),
                    type: 'qr',
                    name: 'QR Code for ' + formData.title,
                    data: qrData,
                    created: new Date().toISOString()
                };
                
                this.mediaAttachments.set(attachment.id, attachment);
                this.displayMediaPreview(attachment);
            }
        });
    }

    displayMediaPreview(attachment) {
        const container = document.getElementById('media-previews');
        if (!container) return;

        const preview = document.createElement('div');
        preview.className = 'media-preview';
        preview.dataset.id = attachment.id;
        
        let content = '';
        switch (attachment.type) {
            case 'image':
                content = `<img src="${attachment.data}" alt="${attachment.name}" class="preview-image">`;
                break;
            case 'audio':
                content = `<audio controls class="preview-audio"><source src="${attachment.data}"></audio>`;
                break;
            case 'qr':
                content = `<img src="${attachment.data}" alt="QR Code" class="preview-qr">`;
                break;
        }
        
        preview.innerHTML = `
            ${content}
            <div class="preview-info">
                <span class="preview-name">${attachment.name}</span>
                <button class="preview-remove" onclick="window.formController.removeAttachment('${attachment.id}')">Remove</button>
            </div>
        `;
        
        container.appendChild(preview);
    }

    removeAttachment(id) {
        this.mediaAttachments.delete(id);
        const preview = document.querySelector(`[data-id="${id}"]`);
        if (preview) {
            preview.remove();
        }
    }

    clearMediaPreviews() {
        const container = document.getElementById('media-previews');
        if (container) {
            container.innerHTML = '';
        }
    }

    displayLocation(location) {
        const locationInfo = document.getElementById('location-info');
        if (locationInfo) {
            locationInfo.innerHTML = `
                <div class="location-display">
                    <strong>Location:</strong> ${location.address || `${location.lat}, ${location.lng}`}
                    <button onclick="window.formController.clearLocation()">Remove</button>
                </div>
            `;
            locationInfo.dataset.lat = location.lat;
            locationInfo.dataset.lng = location.lng;
            locationInfo.dataset.address = location.address || '';
        }
    }

    clearLocation() {
        const locationSection = document.getElementById('location-section');
        const locationInfo = document.getElementById('location-info');
        
        if (locationSection) {
            locationSection.style.display = 'none';
        }
        
        if (locationInfo) {
            locationInfo.innerHTML = '';
            delete locationInfo.dataset.lat;
            delete locationInfo.dataset.lng;
            delete locationInfo.dataset.address;
        }
    }

    displayValidationErrors(errors) {
        errors.forEach(error => {
            const field = document.querySelector(`[name="${error.field}"]`);
            if (field) {
                this.displayFieldValidation(field, { isValid: false, message: error.message });
            }
        });
    }

    displayFieldValidation(field, validation) {
        const container = field.closest('.form-group');
        if (!container) return;

        let errorMsg = container.querySelector('.field-error');
        
        if (!validation.isValid) {
            if (!errorMsg) {
                errorMsg = document.createElement('div');
                errorMsg.className = 'field-error';
                container.appendChild(errorMsg);
            }
            errorMsg.textContent = validation.message;
            field.classList.add('error');
        } else {
            if (errorMsg) {
                errorMsg.remove();
            }
            field.classList.remove('error');
        }
    }

    setFormState(state) {
        const form = document.getElementById('knowledge-form');
        const submitBtn = form?.querySelector('[type="submit"]');
        
        switch (state) {
            case 'saving':
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Saving...';
                }
                break;
            case 'ready':
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Save Knowledge';
                }
                break;
            case 'error':
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Try Again';
                }
                break;
        }
    }

    enableForm() {
        const form = document.getElementById('knowledge-form');
        if (form) {
            const inputs = form.querySelectorAll('input, textarea, select, button');
            inputs.forEach(input => {
                input.disabled = false;
            });
        }
    }

    async clearDraft() {
        if (this.currentDraft) {
            try {
                // Note: Would need deleteDraft method in StorageManager
                this.currentDraft = null;
            } catch (error) {
                console.error('Error clearing draft:', error);
            }
        }
    }

    generateId() {
        return 'kv_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
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

    showInfo(message) {
        if (window.showToast) {
            window.showToast(message, 'info');
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FormController;
}