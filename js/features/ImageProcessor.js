class ImageProcessor {
    constructor() {
        this.maxWidth = 800;
        this.maxFileSize = 204800; // 200KB
        this.thumbnailSize = 150;
        this.quality = 0.8;
        this.supportedFormats = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.createCanvas();
    }

    setupEventListeners() {
        eventBus.on('form:media:image', (file) => {
            if (file instanceof File) {
                this.processImage(file);
            }
        });

        eventBus.on('image:process', (file) => {
            this.processImage(file);
        });

        eventBus.on('image:resize', ({ file, maxWidth, maxHeight }) => {
            this.resizeImage(file, maxWidth, maxHeight);
        });

        eventBus.on('image:compress', ({ file, quality }) => {
            this.compressImage(file, quality);
        });
    }

    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.thumbnailCanvas = document.createElement('canvas');
        this.thumbnailCtx = this.thumbnailCanvas.getContext('2d');
    }

    async processImage(file) {
        try {
            if (!this.isValidImageFile(file)) {
                eventBus.emit('image:error', {
                    message: 'Invalid image file format'
                });
                return;
            }

            eventBus.emit('image:processing', {
                fileName: file.name,
                originalSize: file.size
            });

            const imageData = await this.loadImage(file);
            const processedImage = await this.optimizeImage(imageData, file);
            const thumbnail = await this.generateThumbnail(imageData);
            const exifData = await this.extractEXIF(file);

            const result = {
                type: 'image',
                original: {
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    lastModified: file.lastModified
                },
                processed: processedImage,
                thumbnail: thumbnail,
                exif: exifData,
                timestamp: new Date().toISOString()
            };

            eventBus.emit('media:processed', result);
            eventBus.emit('image:processed', result);

        } catch (error) {
            console.error('Image processing failed:', error);
            eventBus.emit('image:error', {
                message: 'Failed to process image: ' + error.message
            });
        }
    }

    isValidImageFile(file) {
        return file && 
               file instanceof File && 
               this.supportedFormats.includes(file.type) &&
               file.size > 0 &&
               file.size <= 50 * 1024 * 1024; // 50MB max
    }

    loadImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);

            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve({
                    image: img,
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                    aspectRatio: img.naturalWidth / img.naturalHeight
                });
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to load image'));
            };

            img.src = url;
        });
    }

    async optimizeImage(imageData, originalFile) {
        const { image, width, height, aspectRatio } = imageData;
        
        let targetWidth = width;
        let targetHeight = height;

        if (width > this.maxWidth) {
            targetWidth = this.maxWidth;
            targetHeight = this.maxWidth / aspectRatio;
        }

        this.canvas.width = targetWidth;
        this.canvas.height = targetHeight;

        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';

        this.ctx.clearRect(0, 0, targetWidth, targetHeight);
        this.ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

        let quality = this.quality;
        let blob = await this.canvasToBlob(this.canvas, 'image/jpeg', quality);

        while (blob.size > this.maxFileSize && quality > 0.1) {
            quality -= 0.1;
            blob = await this.canvasToBlob(this.canvas, 'image/jpeg', quality);
        }

        if (blob.size > this.maxFileSize) {
            const scaleFactor = Math.sqrt(this.maxFileSize / blob.size);
            const newWidth = Math.floor(targetWidth * scaleFactor);
            const newHeight = Math.floor(targetHeight * scaleFactor);

            this.canvas.width = newWidth;
            this.canvas.height = newHeight;

            this.ctx.clearRect(0, 0, newWidth, newHeight);
            this.ctx.drawImage(image, 0, 0, newWidth, newHeight);

            blob = await this.canvasToBlob(this.canvas, 'image/jpeg', 0.8);
        }

        const dataUrl = await this.blobToDataUrl(blob);
        const url = URL.createObjectURL(blob);

        return {
            data: dataUrl,
            url: url,
            blob: blob,
            width: this.canvas.width,
            height: this.canvas.height,
            size: blob.size,
            quality: quality,
            type: 'image/jpeg',
            compressionRatio: ((originalFile.size - blob.size) / originalFile.size * 100).toFixed(1)
        };
    }

    async generateThumbnail(imageData) {
        const { image } = imageData;
        
        this.thumbnailCanvas.width = this.thumbnailSize;
        this.thumbnailCanvas.height = this.thumbnailSize;

        const size = Math.min(image.naturalWidth, image.naturalHeight);
        const x = (image.naturalWidth - size) / 2;
        const y = (image.naturalHeight - size) / 2;

        this.thumbnailCtx.imageSmoothingEnabled = true;
        this.thumbnailCtx.imageSmoothingQuality = 'high';

        this.thumbnailCtx.clearRect(0, 0, this.thumbnailSize, this.thumbnailSize);
        
        this.thumbnailCtx.drawImage(
            image,
            x, y, size, size,
            0, 0, this.thumbnailSize, this.thumbnailSize
        );

        const blob = await this.canvasToBlob(this.thumbnailCanvas, 'image/jpeg', 0.7);
        const dataUrl = await this.blobToDataUrl(blob);
        const url = URL.createObjectURL(blob);

        return {
            data: dataUrl,
            url: url,
            blob: blob,
            size: blob.size,
            width: this.thumbnailSize,
            height: this.thumbnailSize
        };
    }

    async extractEXIF(file) {
        const exifData = {
            hasExif: false,
            location: null,
            datetime: null,
            camera: null,
            technical: null
        };

        try {
            if (file.type !== 'image/jpeg') {
                return exifData;
            }

            const arrayBuffer = await file.arrayBuffer();
            const dataView = new DataView(arrayBuffer);

            if (dataView.getUint16(0) !== 0xFFD8) {
                return exifData;
            }

            const exif = this.parseEXIF(dataView);
            if (exif) {
                exifData.hasExif = true;
                exifData.location = this.extractGPS(exif);
                exifData.datetime = this.extractDateTime(exif);
                exifData.camera = this.extractCameraInfo(exif);
                exifData.technical = this.extractTechnicalInfo(exif);
            }

        } catch (error) {
            console.warn('Failed to extract EXIF data:', error);
        }

        return exifData;
    }

    parseEXIF(dataView) {
        let offset = 2;
        let marker;

        while (offset < dataView.byteLength) {
            marker = dataView.getUint16(offset);
            
            if (marker === 0xFFE1) { // APP1 marker
                const exifLength = dataView.getUint16(offset + 2);
                const exifStart = offset + 4;
                
                if (dataView.getUint32(exifStart) === 0x45786966) { // "Exif"
                    return this.parseEXIFData(dataView, exifStart + 4);
                }
            }
            
            if ((marker & 0xFF00) !== 0xFF00) break;
            offset += 2 + dataView.getUint16(offset + 2);
        }

        return null;
    }

    parseEXIFData(dataView, offset) {
        const tags = {};
        
        try {
            const byteOrder = dataView.getUint16(offset);
            const littleEndian = byteOrder === 0x4949;
            
            const tiffOffset = offset + dataView.getUint32(offset + 4, littleEndian);
            const dirEntries = dataView.getUint16(tiffOffset, littleEndian);

            for (let i = 0; i < dirEntries; i++) {
                const entryOffset = tiffOffset + 2 + (i * 12);
                const tag = dataView.getUint16(entryOffset, littleEndian);
                const type = dataView.getUint16(entryOffset + 2, littleEndian);
                const count = dataView.getUint32(entryOffset + 4, littleEndian);
                const valueOffset = dataView.getUint32(entryOffset + 8, littleEndian);

                tags[tag] = {
                    type: type,
                    count: count,
                    value: this.getEXIFValue(dataView, offset, valueOffset, type, count, littleEndian)
                };
            }
        } catch (error) {
            console.warn('Error parsing EXIF data:', error);
        }

        return tags;
    }

    getEXIFValue(dataView, baseOffset, valueOffset, type, count, littleEndian) {
        try {
            if (count <= 4) {
                valueOffset = baseOffset + valueOffset;
            } else {
                valueOffset = baseOffset + valueOffset;
            }

            switch (type) {
                case 2: // ASCII string
                    let str = '';
                    for (let i = 0; i < count - 1; i++) {
                        str += String.fromCharCode(dataView.getUint8(valueOffset + i));
                    }
                    return str;
                case 3: // Short
                    return dataView.getUint16(valueOffset, littleEndian);
                case 4: // Long
                    return dataView.getUint32(valueOffset, littleEndian);
                case 5: // Rational
                    const numerator = dataView.getUint32(valueOffset, littleEndian);
                    const denominator = dataView.getUint32(valueOffset + 4, littleEndian);
                    return denominator !== 0 ? numerator / denominator : 0;
                default:
                    return null;
            }
        } catch (error) {
            return null;
        }
    }

    extractGPS(exif) {
        const gpsInfo = {};
        
        if (exif[0x8825]) { // GPS Info IFD
            // This is a simplified GPS extraction
            // In a real implementation, you'd need to parse the GPS IFD
            gpsInfo.hasGPS = true;
        }

        return Object.keys(gpsInfo).length > 0 ? gpsInfo : null;
    }

    extractDateTime(exif) {
        if (exif[0x0132]) { // DateTime
            return exif[0x0132].value;
        }
        if (exif[0x9003]) { // DateTimeOriginal
            return exif[0x9003].value;
        }
        return null;
    }

    extractCameraInfo(exif) {
        const camera = {};
        
        if (exif[0x010F]) camera.make = exif[0x010F].value; // Make
        if (exif[0x0110]) camera.model = exif[0x0110].value; // Model
        if (exif[0x0131]) camera.software = exif[0x0131].value; // Software

        return Object.keys(camera).length > 0 ? camera : null;
    }

    extractTechnicalInfo(exif) {
        const technical = {};
        
        if (exif[0x829A]) technical.exposureTime = exif[0x829A].value; // ExposureTime
        if (exif[0x829D]) technical.fNumber = exif[0x829D].value; // FNumber
        if (exif[0x8827]) technical.iso = exif[0x8827].value; // ISO
        if (exif[0x920A]) technical.focalLength = exif[0x920A].value; // FocalLength

        return Object.keys(technical).length > 0 ? technical : null;
    }

    canvasToBlob(canvas, type = 'image/jpeg', quality = 0.8) {
        return new Promise((resolve) => {
            canvas.toBlob(resolve, type, quality);
        });
    }

    blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    async resizeImage(file, maxWidth, maxHeight) {
        try {
            const imageData = await this.loadImage(file);
            const { image, aspectRatio } = imageData;

            let targetWidth = maxWidth;
            let targetHeight = maxHeight;

            if (maxWidth / maxHeight > aspectRatio) {
                targetWidth = maxHeight * aspectRatio;
            } else {
                targetHeight = maxWidth / aspectRatio;
            }

            this.canvas.width = targetWidth;
            this.canvas.height = targetHeight;

            this.ctx.clearRect(0, 0, targetWidth, targetHeight);
            this.ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

            const blob = await this.canvasToBlob(this.canvas);
            const dataUrl = await this.blobToDataUrl(blob);

            return {
                data: dataUrl,
                blob: blob,
                width: targetWidth,
                height: targetHeight,
                size: blob.size
            };

        } catch (error) {
            throw new Error('Failed to resize image: ' + error.message);
        }
    }

    async compressImage(file, quality = 0.8) {
        try {
            const imageData = await this.loadImage(file);
            const { image, width, height } = imageData;

            this.canvas.width = width;
            this.canvas.height = height;

            this.ctx.clearRect(0, 0, width, height);
            this.ctx.drawImage(image, 0, 0, width, height);

            const blob = await this.canvasToBlob(this.canvas, 'image/jpeg', quality);
            const dataUrl = await this.blobToDataUrl(blob);

            return {
                data: dataUrl,
                blob: blob,
                width: width,
                height: height,
                size: blob.size,
                quality: quality,
                compressionRatio: ((file.size - blob.size) / file.size * 100).toFixed(1)
            };

        } catch (error) {
            throw new Error('Failed to compress image: ' + error.message);
        }
    }

    createImageElement(imageData) {
        const img = document.createElement('img');
        img.src = imageData.processed.url;
        img.alt = imageData.original.name;
        img.loading = 'lazy';
        
        img.style.maxWidth = '100%';
        img.style.height = 'auto';

        img.addEventListener('load', () => {
            eventBus.emit('image:element-ready', {
                element: img,
                data: imageData
            });
        });

        return img;
    }

    getImageDimensions(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);

            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve({
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                    aspectRatio: img.naturalWidth / img.naturalHeight
                });
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to get image dimensions'));
            };

            img.src = url;
        });
    }

    setQuality(quality) {
        if (quality >= 0.1 && quality <= 1.0) {
            this.quality = quality;
            eventBus.emit('image:config-updated', {
                quality: this.quality
            });
        }
    }

    setMaxSize(maxWidth, maxFileSize) {
        if (maxWidth > 0) {
            this.maxWidth = maxWidth;
        }
        if (maxFileSize > 0) {
            this.maxFileSize = maxFileSize;
        }
        
        eventBus.emit('image:config-updated', {
            maxWidth: this.maxWidth,
            maxFileSize: this.maxFileSize
        });
    }

    getSupportedFormats() {
        return [...this.supportedFormats];
    }

    getProcessingStats() {
        return {
            maxWidth: this.maxWidth,
            maxFileSize: this.maxFileSize,
            thumbnailSize: this.thumbnailSize,
            quality: this.quality,
            supportedFormats: this.supportedFormats
        };
    }
}