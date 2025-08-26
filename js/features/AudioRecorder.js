class AudioRecorder {
    constructor() {
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
        this.maxDuration = 10000; // 10 seconds max
        this.recordingTimer = null;
        this.recordingStartTime = null;
        this.visualizer = null;
        this.audioContext = null;
        this.analyser = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkBrowserSupport();
    }

    checkBrowserSupport() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn('getUserMedia not supported');
            eventBus.emit('audio:error', { 
                message: 'Your browser does not support audio recording' 
            });
            return false;
        }

        if (!window.MediaRecorder) {
            console.warn('MediaRecorder not supported');
            eventBus.emit('audio:error', { 
                message: 'Your browser does not support media recording' 
            });
            return false;
        }

        return true;
    }

    setupEventListeners() {
        eventBus.on('form:media:audio', () => {
            if (this.isRecording) {
                this.stopRecording();
            } else {
                this.startRecording();
            }
        });

        eventBus.on('audio:start', () => this.startRecording());
        eventBus.on('audio:stop', () => this.stopRecording());
        eventBus.on('audio:cancel', () => this.cancelRecording());
    }

    async startRecording() {
        if (!this.checkBrowserSupport()) {
            return;
        }

        try {
            eventBus.emit('audio:starting');
            
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 44100,
                    channelCount: 1
                } 
            });

            const mimeType = this.getSupportedMimeType();
            
            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType: mimeType,
                audioBitsPerSecond: 128000
            });

            this.audioChunks = [];
            this.recordingStartTime = Date.now();

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.processRecording();
            };

            this.mediaRecorder.onerror = (event) => {
                console.error('MediaRecorder error:', event);
                eventBus.emit('audio:error', { 
                    message: 'Recording failed: ' + event.error 
                });
            };

            this.mediaRecorder.start(100);
            this.isRecording = true;
            
            this.setupVisualizer();
            this.startTimer();
            
            eventBus.emit('audio:started', {
                maxDuration: this.maxDuration,
                startTime: this.recordingStartTime
            });

        } catch (error) {
            console.error('Failed to start recording:', error);
            let errorMessage = 'Failed to start recording';
            
            if (error.name === 'NotAllowedError') {
                errorMessage = 'Microphone permission denied';
            } else if (error.name === 'NotFoundError') {
                errorMessage = 'No microphone found';
            } else if (error.name === 'NotReadableError') {
                errorMessage = 'Microphone is being used by another application';
            }

            eventBus.emit('audio:error', { message: errorMessage });
        }
    }

    stopRecording() {
        if (!this.isRecording || !this.mediaRecorder) {
            return;
        }

        try {
            this.isRecording = false;
            this.mediaRecorder.stop();
            this.cleanup();
            
            eventBus.emit('audio:stopping');
            
        } catch (error) {
            console.error('Failed to stop recording:', error);
            eventBus.emit('audio:error', { message: 'Failed to stop recording' });
        }
    }

    cancelRecording() {
        if (!this.isRecording) {
            return;
        }

        try {
            this.isRecording = false;
            this.audioChunks = [];
            
            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.stop();
            }
            
            this.cleanup();
            eventBus.emit('audio:cancelled');
            
        } catch (error) {
            console.error('Failed to cancel recording:', error);
        }
    }

    async processRecording() {
        try {
            if (this.audioChunks.length === 0) {
                eventBus.emit('audio:error', { message: 'No audio data recorded' });
                return;
            }

            const audioBlob = new Blob(this.audioChunks, { 
                type: this.getSupportedMimeType() 
            });

            const duration = Date.now() - this.recordingStartTime;
            
            if (duration < 500) {
                eventBus.emit('audio:error', { 
                    message: 'Recording too short (minimum 0.5 seconds)' 
                });
                return;
            }

            const audioData = await this.convertToBase64(audioBlob);
            const audioUrl = URL.createObjectURL(audioBlob);

            const result = {
                type: 'audio',
                data: audioData,
                url: audioUrl,
                duration: duration,
                mimeType: this.getSupportedMimeType(),
                size: audioBlob.size,
                timestamp: new Date().toISOString()
            };

            eventBus.emit('media:processed', result);
            eventBus.emit('audio:recorded', result);

        } catch (error) {
            console.error('Failed to process recording:', error);
            eventBus.emit('audio:error', { message: 'Failed to process recording' });
        }
    }

    convertToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    getSupportedMimeType() {
        const types = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4',
            'audio/mpeg',
            'audio/wav'
        ];

        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }

        return 'audio/webm';
    }

    setupVisualizer() {
        if (!this.stream) return;

        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            const source = this.audioContext.createMediaStreamSource(this.stream);
            
            source.connect(this.analyser);
            this.analyser.fftSize = 256;
            
            const bufferLength = this.analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            this.visualizer = {
                bufferLength,
                dataArray,
                isRunning: true
            };

            this.updateVisualizer();

        } catch (error) {
            console.warn('Failed to setup audio visualizer:', error);
        }
    }

    updateVisualizer() {
        if (!this.visualizer || !this.visualizer.isRunning) return;

        this.analyser.getByteFrequencyData(this.visualizer.dataArray);
        
        const average = this.visualizer.dataArray.reduce((sum, value) => sum + value, 0) / this.visualizer.bufferLength;
        
        eventBus.emit('audio:visualizer', {
            level: Math.round((average / 255) * 100),
            data: Array.from(this.visualizer.dataArray)
        });

        requestAnimationFrame(() => this.updateVisualizer());
    }

    startTimer() {
        this.recordingTimer = setTimeout(() => {
            if (this.isRecording) {
                this.stopRecording();
                eventBus.emit('audio:max-duration-reached');
            }
        }, this.maxDuration);

        const interval = setInterval(() => {
            if (!this.isRecording) {
                clearInterval(interval);
                return;
            }

            const elapsed = Date.now() - this.recordingStartTime;
            const remaining = this.maxDuration - elapsed;

            eventBus.emit('audio:timer', {
                elapsed,
                remaining,
                progress: (elapsed / this.maxDuration) * 100
            });
        }, 100);
    }

    cleanup() {
        if (this.recordingTimer) {
            clearTimeout(this.recordingTimer);
            this.recordingTimer = null;
        }

        if (this.visualizer) {
            this.visualizer.isRunning = false;
            this.visualizer = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        this.analyser = null;
    }

    getCurrentState() {
        return {
            isRecording: this.isRecording,
            isSupported: this.checkBrowserSupport(),
            maxDuration: this.maxDuration,
            supportedMimeTypes: this.getSupportedMimeTypes()
        };
    }

    getSupportedMimeTypes() {
        const types = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4',
            'audio/mpeg',
            'audio/wav'
        ];

        return types.filter(type => MediaRecorder.isTypeSupported(type));
    }

    setMaxDuration(duration) {
        if (duration > 0 && duration <= 30000) { // Max 30 seconds
            this.maxDuration = duration;
            eventBus.emit('audio:config-updated', {
                maxDuration: this.maxDuration
            });
        }
    }

    async getAudioPermissions() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            return true;
        } catch (error) {
            return false;
        }
    }

    createAudioElement(audioData) {
        const audio = document.createElement('audio');
        audio.src = audioData.url;
        audio.controls = true;
        audio.preload = 'metadata';
        
        audio.addEventListener('loadedmetadata', () => {
            eventBus.emit('audio:element-ready', {
                element: audio,
                duration: audio.duration
            });
        });

        return audio;
    }
}