class GeoLocator {
    constructor() {
        this.currentPosition = null;
        this.watchId = null;
        this.isWatching = false;
        this.map = null;
        this.marker = null;
        this.geocodingCache = new Map();
        this.geocodingAPI = 'https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lon}';
        this.searchAPI = 'https://nominatim.openstreetmap.org/search?format=json&q={query}&limit=5';
        this.options = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000 // 5 minutes
        };
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkBrowserSupport();
    }

    checkBrowserSupport() {
        if (!navigator.geolocation) {
            console.warn('Geolocation not supported');
            eventBus.emit('geo:error', {
                message: 'Your browser does not support geolocation'
            });
            return false;
        }
        return true;
    }

    setupEventListeners() {
        eventBus.on('form:media:location', () => {
            this.getCurrentLocation();
        });

        eventBus.on('geo:get-current', () => {
            this.getCurrentLocation();
        });

        eventBus.on('geo:search', ({ query }) => {
            this.searchLocation(query);
        });

        eventBus.on('geo:watch-start', () => {
            this.startWatching();
        });

        eventBus.on('geo:watch-stop', () => {
            this.stopWatching();
        });

        eventBus.on('geo:reverse', ({ lat, lon }) => {
            this.reverseGeocode(lat, lon);
        });

        eventBus.on('map:init', ({ containerId }) => {
            this.initializeMap(containerId);
        });
    }

    async getCurrentLocation() {
        if (!this.checkBrowserSupport()) {
            return;
        }

        try {
            eventBus.emit('geo:getting-location');
            
            const position = await this.getPosition();
            this.currentPosition = {
                lat: position.coords.latitude,
                lon: position.coords.longitude,
                accuracy: position.coords.accuracy,
                altitude: position.coords.altitude,
                altitudeAccuracy: position.coords.altitudeAccuracy,
                heading: position.coords.heading,
                speed: position.coords.speed,
                timestamp: position.timestamp
            };

            const locationInfo = await this.reverseGeocode(
                this.currentPosition.lat, 
                this.currentPosition.lon
            );

            const result = {
                coordinates: this.currentPosition,
                address: locationInfo,
                timestamp: new Date().toISOString()
            };

            eventBus.emit('geo:location-found', result);
            eventBus.emit('media:processed', {
                type: 'location',
                data: result
            });

            return result;

        } catch (error) {
            console.error('Failed to get current location:', error);
            
            let errorMessage = 'Failed to get current location';
            if (error.code === error.PERMISSION_DENIED) {
                errorMessage = 'Location access denied';
            } else if (error.code === error.POSITION_UNAVAILABLE) {
                errorMessage = 'Location unavailable';
            } else if (error.code === error.TIMEOUT) {
                errorMessage = 'Location request timed out';
            }

            eventBus.emit('geo:error', { message: errorMessage });
            throw error;
        }
    }

    getPosition() {
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, this.options);
        });
    }

    async searchLocation(query) {
        if (!query || query.trim().length === 0) {
            eventBus.emit('geo:search-results', { query, results: [] });
            return;
        }

        try {
            eventBus.emit('geo:searching', { query });

            const url = this.searchAPI.replace('{query}', encodeURIComponent(query));
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'KnowledgeVault/1.0'
                }
            });

            if (!response.ok) {
                throw new Error(`Search failed: ${response.status}`);
            }

            const data = await response.json();
            const results = data.map(item => ({
                name: item.display_name,
                lat: parseFloat(item.lat),
                lon: parseFloat(item.lon),
                type: item.type,
                importance: item.importance,
                boundingbox: item.boundingbox
            }));

            eventBus.emit('geo:search-results', {
                query,
                results,
                total: results.length
            });

            return results;

        } catch (error) {
            console.error('Location search failed:', error);
            eventBus.emit('geo:error', {
                message: 'Location search failed: ' + error.message
            });
            throw error;
        }
    }

    async reverseGeocode(lat, lon) {
        const cacheKey = `${lat.toFixed(6)},${lon.toFixed(6)}`;
        
        if (this.geocodingCache.has(cacheKey)) {
            return this.geocodingCache.get(cacheKey);
        }

        try {
            const url = this.geocodingAPI
                .replace('{lat}', lat.toString())
                .replace('{lon}', lon.toString());

            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'KnowledgeVault/1.0'
                }
            });

            if (!response.ok) {
                throw new Error(`Geocoding failed: ${response.status}`);
            }

            const data = await response.json();
            
            const locationInfo = {
                displayName: data.display_name || `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
                address: {
                    house_number: data.address?.house_number,
                    road: data.address?.road,
                    suburb: data.address?.suburb,
                    city: data.address?.city || data.address?.town || data.address?.village,
                    state: data.address?.state,
                    country: data.address?.country,
                    postcode: data.address?.postcode
                },
                raw: data
            };

            this.geocodingCache.set(cacheKey, locationInfo);
            
            if (this.geocodingCache.size > 100) {
                const firstKey = this.geocodingCache.keys().next().value;
                this.geocodingCache.delete(firstKey);
            }

            return locationInfo;

        } catch (error) {
            console.warn('Reverse geocoding failed:', error);
            return {
                displayName: `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
                address: {},
                raw: null
            };
        }
    }

    startWatching() {
        if (!this.checkBrowserSupport() || this.isWatching) {
            return;
        }

        try {
            this.watchId = navigator.geolocation.watchPosition(
                (position) => {
                    this.currentPosition = {
                        lat: position.coords.latitude,
                        lon: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        timestamp: position.timestamp
                    };

                    eventBus.emit('geo:position-updated', this.currentPosition);
                },
                (error) => {
                    console.error('Watch position error:', error);
                    eventBus.emit('geo:watch-error', { 
                        message: error.message 
                    });
                },
                {
                    ...this.options,
                    maximumAge: 60000 // 1 minute for watching
                }
            );

            this.isWatching = true;
            eventBus.emit('geo:watch-started');

        } catch (error) {
            console.error('Failed to start watching position:', error);
            eventBus.emit('geo:error', {
                message: 'Failed to start location tracking'
            });
        }
    }

    stopWatching() {
        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
        
        this.isWatching = false;
        eventBus.emit('geo:watch-stopped');
    }

    initializeMap(containerId, options = {}) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error('Map container not found:', containerId);
            return;
        }

        try {
            const defaultCenter = [40.7128, -74.0060]; // New York as default
            const defaultZoom = 13;

            this.map = L.map(containerId).setView(
                options.center || defaultCenter,
                options.zoom || defaultZoom
            );

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19
            }).addTo(this.map);

            this.map.on('click', (event) => {
                this.addMarker(event.latlng.lat, event.latlng.lng);
                eventBus.emit('map:click', {
                    lat: event.latlng.lat,
                    lon: event.latlng.lng
                });
            });

            eventBus.emit('map:initialized', {
                containerId,
                map: this.map
            });

            if (this.currentPosition) {
                this.addMarker(this.currentPosition.lat, this.currentPosition.lon);
                this.map.setView([this.currentPosition.lat, this.currentPosition.lon], 15);
            }

        } catch (error) {
            console.error('Failed to initialize map:', error);
            eventBus.emit('geo:error', {
                message: 'Failed to initialize map'
            });
        }
    }

    addMarker(lat, lon, options = {}) {
        if (!this.map) {
            console.warn('Map not initialized');
            return;
        }

        if (this.marker) {
            this.map.removeLayer(this.marker);
        }

        this.marker = L.marker([lat, lon], {
            draggable: options.draggable !== false,
            title: options.title || `${lat.toFixed(6)}, ${lon.toFixed(6)}`
        }).addTo(this.map);

        if (options.popup) {
            this.marker.bindPopup(options.popup);
        }

        if (options.draggable !== false) {
            this.marker.on('dragend', (event) => {
                const position = event.target.getLatLng();
                eventBus.emit('marker:moved', {
                    lat: position.lat,
                    lon: position.lng
                });
            });
        }

        eventBus.emit('marker:added', {
            lat: lat,
            lon: lon,
            marker: this.marker
        });

        return this.marker;
    }

    async setMapLocation(lat, lon) {
        if (!this.map) {
            console.warn('Map not initialized');
            return;
        }

        this.map.setView([lat, lon], 15);
        this.addMarker(lat, lon);

        try {
            const locationInfo = await this.reverseGeocode(lat, lon);
            
            if (this.marker) {
                this.marker.bindPopup(locationInfo.displayName).openPopup();
            }

            eventBus.emit('map:location-set', {
                lat,
                lon,
                address: locationInfo
            });

        } catch (error) {
            console.warn('Failed to get address for map location:', error);
        }
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in kilometers
        const dLat = this.toRadians(lat2 - lat1);
        const dLon = this.toRadians(lon2 - lon1);
        
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;
        
        return distance;
    }

    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    formatLocation(location) {
        if (!location) return 'Unknown location';

        if (location.address && location.address.displayName) {
            return location.address.displayName;
        }

        if (location.coordinates) {
            return `${location.coordinates.lat.toFixed(6)}, ${location.coordinates.lon.toFixed(6)}`;
        }

        if (typeof location.lat === 'number' && typeof location.lon === 'number') {
            return `${location.lat.toFixed(6)}, ${location.lon.toFixed(6)}`;
        }

        return 'Invalid location data';
    }

    generateMapUrl(lat, lon, zoom = 15) {
        return `https://www.openstreetmap.org/#map=${zoom}/${lat}/${lon}`;
    }

    async getLocationPermission() {
        if (!navigator.permissions) {
            return 'unsupported';
        }

        try {
            const permission = await navigator.permissions.query({ name: 'geolocation' });
            return permission.state; // 'granted', 'denied', or 'prompt'
        } catch (error) {
            console.warn('Failed to check geolocation permission:', error);
            return 'unknown';
        }
    }

    getCurrentLocationInfo() {
        return {
            hasCurrentPosition: !!this.currentPosition,
            isWatching: this.isWatching,
            isSupported: this.checkBrowserSupport(),
            currentPosition: this.currentPosition
        };
    }

    setOptions(options) {
        this.options = { ...this.options, ...options };
        eventBus.emit('geo:options-updated', this.options);
    }

    clearCache() {
        this.geocodingCache.clear();
        eventBus.emit('geo:cache-cleared');
    }

    destroy() {
        this.stopWatching();
        
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
        
        this.clearCache();
        this.currentPosition = null;
        this.marker = null;
    }
}