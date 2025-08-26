class EventBus {
    constructor() {
        this.listeners = new Map();
        this.eventHistory = [];
        this.maxHistorySize = 100;
    }

    on(eventName, callback, options = {}) {
        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, []);
        }
        
        const listener = {
            callback,
            once: options.once || false,
            priority: options.priority || 0,
            id: this._generateId()
        };
        
        this.listeners.get(eventName).push(listener);
        
        if (options.priority) {
            this.listeners.get(eventName).sort((a, b) => b.priority - a.priority);
        }
        
        return listener.id;
    }

    off(eventName, callbackOrId) {
        if (!this.listeners.has(eventName)) return;
        
        const listeners = this.listeners.get(eventName);
        const index = typeof callbackOrId === 'string' 
            ? listeners.findIndex(l => l.id === callbackOrId)
            : listeners.findIndex(l => l.callback === callbackOrId);
            
        if (index !== -1) {
            listeners.splice(index, 1);
        }
        
        if (listeners.length === 0) {
            this.listeners.delete(eventName);
        }
    }

    once(eventName, callback, options = {}) {
        return this.on(eventName, callback, { ...options, once: true });
    }

    emit(eventName, data = null, options = {}) {
        const eventData = {
            name: eventName,
            data,
            timestamp: Date.now(),
            source: options.source || 'unknown',
            id: this._generateId()
        };
        
        this._addToHistory(eventData);
        
        if (!this.listeners.has(eventName)) {
            return Promise.resolve([]);
        }
        
        const listeners = [...this.listeners.get(eventName)];
        const promises = [];
        
        for (let i = listeners.length - 1; i >= 0; i--) {
            const listener = listeners[i];
            
            try {
                const result = listener.callback(data, eventData);
                if (result instanceof Promise) {
                    promises.push(result);
                }
                
                if (listener.once) {
                    this.listeners.get(eventName).splice(
                        this.listeners.get(eventName).indexOf(listener), 1
                    );
                }
            } catch (error) {
                console.error(`Error in event listener for "${eventName}":`, error);
                this.emit('error', { 
                    event: eventName, 
                    error: error.message,
                    listener: listener.id 
                });
            }
        }
        
        return Promise.all(promises);
    }

    emitAsync(eventName, data = null, options = {}) {
        return new Promise((resolve, reject) => {
            try {
                const result = this.emit(eventName, data, options);
                resolve(result);
            } catch (error) {
                reject(error);
            }
        });
    }

    clear(eventName = null) {
        if (eventName) {
            this.listeners.delete(eventName);
        } else {
            this.listeners.clear();
        }
    }

    getListeners(eventName) {
        return this.listeners.get(eventName) || [];
    }

    getEventHistory(eventName = null, limit = 50) {
        let history = [...this.eventHistory];
        
        if (eventName) {
            history = history.filter(event => event.name === eventName);
        }
        
        return history.slice(-limit);
    }

    debug() {
        return {
            listeners: Object.fromEntries(
                Array.from(this.listeners.entries()).map(([name, listeners]) => [
                    name, 
                    listeners.map(l => ({ id: l.id, priority: l.priority, once: l.once }))
                ])
            ),
            recentEvents: this.getEventHistory(null, 10)
        };
    }

    _generateId() {
        return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    }

    _addToHistory(eventData) {
        this.eventHistory.push(eventData);
        
        if (this.eventHistory.length > this.maxHistorySize) {
            this.eventHistory.shift();
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventBus;
}