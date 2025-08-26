class DataValidator {
    constructor() {
        this.eventBus = window.eventBus;
        this.rules = new Map();
        this.customValidators = new Map();
        this.messages = new Map();
        
        this.initializeDefaultRules();
        this.initializeDefaultMessages();
        
        this.eventBus?.on('app:ready', () => this.init());
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.eventBus?.on('validate:field', (data) => {
            this.validateField(data.field, data.value, data.rules);
        });

        this.eventBus?.on('validate:form', (data) => {
            this.validateForm(data.form, data.rules);
        });
    }

    initializeDefaultRules() {
        this.rules.set('knowledge', {
            title: {
                required: true,
                minLength: 3,
                maxLength: 200,
                pattern: /^[^<>]*$/
            },
            content: {
                required: true,
                minLength: 10,
                maxLength: 10000
            },
            category: {
                enum: ['personal', 'education', 'research', 'tutorial', 'documentation', 'recipe', 'memory', 'other']
            },
            language: {
                enum: ['en', 'es', 'zh', 'ar', 'hi']
            },
            tags: {
                array: true,
                maxItems: 20,
                itemPattern: /^[a-zA-Z0-9\s\-_]+$/,
                itemMaxLength: 30
            }
        });

        this.rules.set('search', {
            query: {
                minLength: 1,
                maxLength: 200,
                pattern: /^[^<>]*$/
            },
            category: {
                enum: ['', 'personal', 'education', 'research', 'tutorial', 'documentation', 'recipe', 'memory', 'other']
            },
            language: {
                enum: ['', 'en', 'es', 'zh', 'ar', 'hi']
            },
            dateFrom: {
                type: 'date',
                maxDate: 'today'
            },
            dateTo: {
                type: 'date',
                maxDate: 'today'
            }
        });

        this.rules.set('export', {
            format: {
                required: true,
                enum: ['json', 'csv', 'html', 'xml']
            },
            includeMedia: {
                type: 'boolean'
            },
            dateRange: {
                type: 'dateRange'
            }
        });
    }

    initializeDefaultMessages() {
        this.messages.set('required', 'This field is required');
        this.messages.set('minLength', 'Must be at least {min} characters long');
        this.messages.set('maxLength', 'Must be no more than {max} characters long');
        this.messages.set('pattern', 'Invalid format');
        this.messages.set('enum', 'Invalid selection');
        this.messages.set('type', 'Invalid type');
        this.messages.set('array', 'Must be an array');
        this.messages.set('maxItems', 'Too many items (maximum {max})');
        this.messages.set('itemPattern', 'Invalid item format');
        this.messages.set('itemMaxLength', 'Item too long (maximum {max} characters)');
        this.messages.set('email', 'Invalid email address');
        this.messages.set('url', 'Invalid URL');
        this.messages.set('date', 'Invalid date');
        this.messages.set('dateRange', 'Invalid date range');
        this.messages.set('maxDate', 'Date cannot be in the future');
        this.messages.set('minDate', 'Date is too far in the past');
    }

    validate(data, ruleset = 'knowledge') {
        const rules = this.rules.get(ruleset);
        if (!rules) {
            return { isValid: true, errors: [] };
        }

        const errors = [];
        const sanitizedData = {};

        for (const [field, fieldRules] of Object.entries(rules)) {
            const value = data[field];
            const fieldValidation = this.validateField(field, value, fieldRules);
            
            if (!fieldValidation.isValid) {
                errors.push(...fieldValidation.errors);
            }
            
            sanitizedData[field] = fieldValidation.sanitizedValue;
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitizedData
        };
    }

    validateField(field, value, rules) {
        const errors = [];
        let sanitizedValue = value;

        if (rules.required && this.isEmpty(value)) {
            errors.push({
                field,
                rule: 'required',
                message: this.getMessage('required', { field })
            });
            return { isValid: false, errors, sanitizedValue };
        }

        if (this.isEmpty(value)) {
            return { isValid: true, errors: [], sanitizedValue };
        }

        sanitizedValue = this.sanitizeValue(value, rules);

        if (rules.type) {
            const typeValidation = this.validateType(sanitizedValue, rules.type);
            if (!typeValidation.isValid) {
                errors.push({
                    field,
                    rule: 'type',
                    message: this.getMessage('type', { field, type: rules.type })
                });
            }
        }

        if (rules.minLength && String(sanitizedValue).length < rules.minLength) {
            errors.push({
                field,
                rule: 'minLength',
                message: this.getMessage('minLength', { field, min: rules.minLength })
            });
        }

        if (rules.maxLength && String(sanitizedValue).length > rules.maxLength) {
            errors.push({
                field,
                rule: 'maxLength',
                message: this.getMessage('maxLength', { field, max: rules.maxLength })
            });
        }

        if (rules.pattern && !rules.pattern.test(String(sanitizedValue))) {
            errors.push({
                field,
                rule: 'pattern',
                message: this.getMessage('pattern', { field })
            });
        }

        if (rules.enum && !rules.enum.includes(sanitizedValue)) {
            errors.push({
                field,
                rule: 'enum',
                message: this.getMessage('enum', { field, options: rules.enum.join(', ') })
            });
        }

        if (rules.array) {
            const arrayValidation = this.validateArray(sanitizedValue, rules);
            if (!arrayValidation.isValid) {
                errors.push(...arrayValidation.errors.map(error => ({
                    ...error,
                    field
                })));
            }
            sanitizedValue = arrayValidation.sanitizedValue;
        }

        if (rules.custom) {
            const customValidation = this.runCustomValidation(sanitizedValue, rules.custom, field);
            if (!customValidation.isValid) {
                errors.push(...customValidation.errors);
            }
        }

        if (rules.email && !this.isValidEmail(sanitizedValue)) {
            errors.push({
                field,
                rule: 'email',
                message: this.getMessage('email', { field })
            });
        }

        if (rules.url && !this.isValidUrl(sanitizedValue)) {
            errors.push({
                field,
                rule: 'url',
                message: this.getMessage('url', { field })
            });
        }

        if (rules.date) {
            const dateValidation = this.validateDate(sanitizedValue, rules);
            if (!dateValidation.isValid) {
                errors.push({
                    field,
                    rule: 'date',
                    message: dateValidation.message
                });
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            sanitizedValue
        };
    }

    validateType(value, type) {
        switch (type) {
            case 'string':
                return { isValid: typeof value === 'string' };
            case 'number':
                return { isValid: typeof value === 'number' && !isNaN(value) };
            case 'boolean':
                return { isValid: typeof value === 'boolean' };
            case 'date':
                return { isValid: value instanceof Date || this.isValidDateString(value) };
            case 'array':
                return { isValid: Array.isArray(value) };
            case 'object':
                return { isValid: typeof value === 'object' && value !== null && !Array.isArray(value) };
            case 'dateRange':
                return this.validateDateRange(value);
            default:
                return { isValid: true };
        }
    }

    validateArray(value, rules) {
        if (!Array.isArray(value)) {
            if (typeof value === 'string') {
                value = value.split(',').map(item => item.trim()).filter(item => item);
            } else {
                return {
                    isValid: false,
                    errors: [{ rule: 'array', message: this.getMessage('array') }],
                    sanitizedValue: []
                };
            }
        }

        const errors = [];
        const sanitizedItems = [];

        if (rules.maxItems && value.length > rules.maxItems) {
            errors.push({
                rule: 'maxItems',
                message: this.getMessage('maxItems', { max: rules.maxItems })
            });
        }

        value.forEach((item, index) => {
            let sanitizedItem = this.sanitizeString(item);
            
            if (rules.itemPattern && !rules.itemPattern.test(sanitizedItem)) {
                errors.push({
                    rule: 'itemPattern',
                    message: this.getMessage('itemPattern', { index })
                });
            }

            if (rules.itemMaxLength && sanitizedItem.length > rules.itemMaxLength) {
                errors.push({
                    rule: 'itemMaxLength',
                    message: this.getMessage('itemMaxLength', { index, max: rules.itemMaxLength })
                });
            }

            if (sanitizedItem) {
                sanitizedItems.push(sanitizedItem);
            }
        });

        return {
            isValid: errors.length === 0,
            errors,
            sanitizedValue: sanitizedItems
        };
    }

    validateDate(value, rules) {
        if (!this.isValidDateString(value) && !(value instanceof Date)) {
            return {
                isValid: false,
                message: this.getMessage('date')
            };
        }

        const date = value instanceof Date ? value : new Date(value);
        
        if (isNaN(date.getTime())) {
            return {
                isValid: false,
                message: this.getMessage('date')
            };
        }

        const now = new Date();
        
        if (rules.maxDate === 'today' && date > now) {
            return {
                isValid: false,
                message: this.getMessage('maxDate')
            };
        }

        if (rules.minDate) {
            const minDate = rules.minDate === 'today' ? now : new Date(rules.minDate);
            if (date < minDate) {
                return {
                    isValid: false,
                    message: this.getMessage('minDate')
                };
            }
        }

        return { isValid: true };
    }

    validateDateRange(value) {
        if (!value || typeof value !== 'object') {
            return { isValid: false };
        }

        const { start, end } = value;
        
        if (!start || !end) {
            return { isValid: false };
        }

        const startDate = new Date(start);
        const endDate = new Date(end);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            return { isValid: false };
        }

        if (startDate >= endDate) {
            return { isValid: false };
        }

        return { isValid: true };
    }

    sanitizeValue(value, rules) {
        if (rules.type === 'string' || typeof value === 'string') {
            return this.sanitizeString(value);
        }
        
        if (rules.type === 'number') {
            return this.sanitizeNumber(value);
        }

        if (rules.array && Array.isArray(value)) {
            return value.map(item => this.sanitizeString(item));
        }

        return value;
    }

    sanitizeString(value) {
        if (typeof value !== 'string') {
            value = String(value);
        }

        return value
            .trim()
            .replace(/[<>]/g, '')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#x27;/g, "'")
            .replace(/&#x2F;/g, '/')
            .replace(/\s+/g, ' ');
    }

    sanitizeNumber(value) {
        const num = Number(value);
        return isNaN(num) ? 0 : num;
    }

    runCustomValidation(value, customRules, field) {
        const errors = [];

        if (Array.isArray(customRules)) {
            customRules.forEach(rule => {
                const validator = this.customValidators.get(rule);
                if (validator) {
                    const result = validator(value, field);
                    if (!result.isValid) {
                        errors.push({
                            field,
                            rule: rule,
                            message: result.message
                        });
                    }
                }
            });
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    addCustomValidator(name, validator) {
        this.customValidators.set(name, validator);
    }

    removeCustomValidator(name) {
        this.customValidators.delete(name);
    }

    addRuleset(name, rules) {
        this.rules.set(name, rules);
    }

    updateRuleset(name, updates) {
        const existing = this.rules.get(name) || {};
        this.rules.set(name, { ...existing, ...updates });
    }

    isEmpty(value) {
        if (value === null || value === undefined) {
            return true;
        }
        
        if (typeof value === 'string') {
            return value.trim() === '';
        }
        
        if (Array.isArray(value)) {
            return value.length === 0;
        }
        
        if (typeof value === 'object') {
            return Object.keys(value).length === 0;
        }
        
        return false;
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    isValidDateString(dateString) {
        if (typeof dateString !== 'string') return false;
        const date = new Date(dateString);
        return !isNaN(date.getTime());
    }

    getMessage(rule, params = {}) {
        let message = this.messages.get(rule) || `Validation failed for rule: ${rule}`;
        
        Object.entries(params).forEach(([key, value]) => {
            message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
        });
        
        return message;
    }

    setMessage(rule, message) {
        this.messages.set(rule, message);
    }

    validateForm(formElement, ruleset = 'knowledge') {
        if (!formElement) {
            return { isValid: false, errors: ['Form element not found'] };
        }

        const formData = new FormData(formElement);
        const data = {};
        
        for (const [key, value] of formData.entries()) {
            data[key] = value;
        }

        return this.validate(data, ruleset);
    }

    validateFileUpload(file, rules = {}) {
        const errors = [];
        
        if (rules.required && !file) {
            errors.push({
                field: 'file',
                rule: 'required',
                message: 'File is required'
            });
            return { isValid: false, errors };
        }

        if (!file) {
            return { isValid: true, errors: [] };
        }

        if (rules.maxSize && file.size > rules.maxSize) {
            errors.push({
                field: 'file',
                rule: 'maxSize',
                message: `File too large (maximum ${this.formatFileSize(rules.maxSize)})`
            });
        }

        if (rules.allowedTypes && !rules.allowedTypes.includes(file.type)) {
            errors.push({
                field: 'file',
                rule: 'fileType',
                message: `Invalid file type (allowed: ${rules.allowedTypes.join(', ')})`
            });
        }

        if (rules.allowedExtensions) {
            const extension = file.name.split('.').pop()?.toLowerCase();
            if (!rules.allowedExtensions.includes(extension)) {
                errors.push({
                    field: 'file',
                    rule: 'fileExtension',
                    message: `Invalid file extension (allowed: ${rules.allowedExtensions.join(', ')})`
                });
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    createFieldValidator(field, rules) {
        return (value) => this.validateField(field, value, rules);
    }

    getRules(ruleset) {
        return this.rules.get(ruleset);
    }

    getAllRulesets() {
        return Array.from(this.rules.keys());
    }

    clearErrors(container) {
        if (!container) return;
        
        const errorElements = container.querySelectorAll('.field-error, .validation-error');
        errorElements.forEach(element => element.remove());
        
        const invalidFields = container.querySelectorAll('.error, .invalid');
        invalidFields.forEach(field => {
            field.classList.remove('error', 'invalid');
        });
    }

    displayErrors(container, errors) {
        if (!container || !errors.length) return;
        
        this.clearErrors(container);
        
        errors.forEach(error => {
            const field = container.querySelector(`[name="${error.field}"]`);
            if (field) {
                field.classList.add('error');
                
                const errorElement = document.createElement('div');
                errorElement.className = 'field-error';
                errorElement.textContent = error.message;
                
                const fieldContainer = field.closest('.form-group') || field.parentElement;
                fieldContainer.appendChild(errorElement);
            }
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataValidator;
}