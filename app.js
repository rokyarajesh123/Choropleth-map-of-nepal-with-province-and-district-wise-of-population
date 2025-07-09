
class NepalGeoApp {
    constructor() {
        this.map = null;
        this.layers = {
            province: null,
            district: null,
            local: null
        };
        this.baseMaps = {};
        this.currentBasemap = 'osm';
        this.selectedFeature = null;
        this.currentLegend = null;
        
        // Province ID to name mapping based on your data structure
        this.provinceMapping = {
            0: "Province 1",
            1: "Province 2", 
            2: "Bagmati",
            3: "Gandaki",
            4: "Province 5",
            5: "Karnali",
            6: "Sudurpaschim"
        };
    }

    async init() {
        try {
            console.log('Initializing Nepal Application...');

            // Initialize map
            this.initMap();

            // Initialize base maps
            this.initBaseMaps();

            // Load administrative layers
            await this.loadLayers();

            // Setup event listeners
            this.setupEventListeners();

            // Fit map to data
            this.fitMapToData();

            console.log('✓ Application initialized successfully');
            this.updateInfoPanel('Application loaded. Click on boundaries or use choropleth buttons.');

        } catch (error) {
            console.error('✗ Failed to initialize application:', error);
            this.updateInfoPanel('Error loading application. Check console for details.');
        }
    }

    initMap() {
        this.map = L.map('map', {
            center: [28.3949, 84.1240],
            zoom: 7,
            zoomControl: true,
            attributionControl: true
        });

        L.control.scale({
            position: 'bottomleft',
            metric: true,
            imperial: false
        }).addTo(this.map);

        this.map.attributionControl.addAttribution('Nepal Administrative Boundaries');
    }

    initBaseMaps() {
        this.baseMaps = {
            osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19
            }),
            satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: '© Esri World Imagery',
                maxZoom: 19
            }),
            terrain: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenTopoMap contributors',
                maxZoom: 17
            })
        };

        this.baseMaps.osm.addTo(this.map);
    }

    async loadLayers() {
        const layerConfigs = [
            { name: 'province', url: 'data/province.geojson' },
            { name: 'district', url: 'data/district.geojson' },
            { name: 'local', url: 'data/local-level.geojson' }
        ];

        for (const config of layerConfigs) {
            try {
                const layer = await this.loadGeoJSONLayer(config.url, config.name);
                if (layer) {
                    this.layers[config.name] = layer;
                    layer.addTo(this.map);
                    console.log(`✓ ${config.name} layer loaded with ${layer.getLayers().length} features`);
                }
            } catch (error) {
                console.error(`✗ Failed to load ${config.name}:`, error);
            }
        }
    }

    async loadGeoJSONLayer(url, layerName) {
        try {
            console.log(`Loading ${layerName}...`);
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const geojsonData = await response.json();
            
            if (!geojsonData.type || geojsonData.type !== 'FeatureCollection') {
                throw new Error('Invalid GeoJSON format');
            }

            const layer = L.geoJSON(geojsonData, {
                style: this.getLayerStyle(layerName),
                onEachFeature: (feature, layer) => this.onEachFeature(feature, layer, layerName)
            });
            
            return layer;
            
        } catch (error) {
            console.error(`Error loading ${layerName}:`, error);
            return null;
        }
    }

    getLayerStyle(layerName) {
        const styles = {
            province: {
                fillColor: '#ff6b6b',
                weight: 4,
                opacity: 1,
                color: '#d63031',
                fillOpacity: 0.3
            },
            district: {
                fillColor: '#4ecdc4',
                weight: 2,
                opacity: 1,
                color: '#00b894',
                fillOpacity: 0.3
            },
            local: {
                fillColor: '#74b9ff',
                weight: 1,
                opacity: 1,
                color: '#0984e3',
                fillOpacity: 0.4
            }
        };
        return styles[layerName] || styles.local;
    }

    onEachFeature(feature, layer, levelType) {
        const props = feature.properties || {};
        const name = this.extractFeatureName(feature, levelType);
        const population = this.getPopulationForFeature(feature, levelType);

        // Create popup
        const popupContent = this.createPopupContent(name, levelType, population);
        layer.bindPopup(popupContent);

        // Click event
        layer.on('click', (e) => {
            this.selectFeature(feature, layer, levelType, name, population);
            L.DomEvent.stopPropagation(e);
        });

        // Hover effects
        layer.on('mouseover', () => {
            layer.setStyle({ weight: 4, fillOpacity: 0.7 });
            this.map.getContainer().style.cursor = 'pointer';
        });

        layer.on('mouseout', () => {
            if (this.selectedFeature !== layer) {
                layer.setStyle(this.getLayerStyle(levelType));
            }
            this.map.getContainer().style.cursor = '';
        });
    }

    extractFeatureName(feature, levelType) {
        const props = feature.properties || {};
        
        // For provinces, use the ID to map to province names
        if (levelType === 'province') {
            const provinceId = feature.id;
            if (provinceId !== undefined && this.provinceMapping[provinceId]) {
                return this.provinceMapping[provinceId];
            }
            // Fallback to checking properties
            const nameFields = ['PROVINCE', 'Province', 'province', 'NAME', 'name'];
            for (const field of nameFields) {
                if (props[field]) {
                    return props[field];
                }
            }
            return `Province ${provinceId || 'Unknown'}`;
        }
        
        // For districts and local levels
        const nameFields = {
            district: ['DISTRICT', 'District', 'district', 'NAME', 'name'],
            local: ['LOCAL', 'Local', 'local', 'MUNICIPALITY', 'Municipality', 'NAME', 'name']
        };

        const fields = nameFields[levelType] || nameFields.local;

        for (const field of fields) {
            if (props[field]) {
                return props[field];
            }
        }

        return `${levelType.charAt(0).toUpperCase() + levelType.slice(1)} Feature`;
    }

    createPopupContent(name, levelType, population) {
        let content = `<strong>${name}</strong><br>`;
        content += `Level: ${levelType.charAt(0).toUpperCase() + levelType.slice(1)}<br>`;
        
        if (population > 0) {
            content += `<strong>Population: ${population.toLocaleString()}</strong><br>`;
        }
        
        return content;
    }

    selectFeature(feature, layer, levelType, name, population) {
        // Reset previous selection
        if (this.selectedFeature) {
            this.selectedFeature.layer.setStyle(this.getLayerStyle(this.selectedFeature.levelType));
        }

        // Highlight new selection
        layer.setStyle({
            weight: 5,
            color: '#ff0000',
            fillOpacity: 0.8
        });
        
        this.selectedFeature = { layer, levelType, feature, name, population };
        this.displayFeatureInfo(name, levelType, population);
    }

    displayFeatureInfo(name, levelType, population) {
        let info = `<div class="feature-details">`;
        info += `<h4>📍 ${name}</h4>`;
        info += `<p><strong>Level:</strong> ${levelType.charAt(0).toUpperCase() + levelType.slice(1)}</p>`;
        
        if (population > 0) {
            info += `<p><strong>Population:</strong> ${population.toLocaleString()}</p>`;
        }
        
        info += `</div>`;
        this.updateInfoPanel(info);
    }

    // Choropleth Functions
    createDistrictChoropleth() {
        this.removeLegend();
        
        const districtLayer = this.layers.district;
        if (!districtLayer) {
            alert('District layer not found');
            return;
        }

        // Get population data for districts
        let populations = [];
        districtLayer.eachLayer(feature => {
            const pop = this.getPopulationForFeature(feature.feature, 'district');
            if (pop > 0) populations.push(pop);
        });

        if (populations.length === 0) {
            alert('No population data found for districts');
            return;
        }

        const minPop = Math.min(...populations);
        const maxPop = Math.max(...populations);

        // Apply choropleth colors
        districtLayer.eachLayer(feature => {
            const population = this.getPopulationForFeature(feature.feature, 'district');
            const color = this.getColorForPopulation(population, minPop, maxPop);
            
            feature.setStyle({
                fillColor: color,
                fillOpacity: 0.8,
                color: '#000',
                weight: 1
            });
        });

        this.createLegend('District Population', minPop, maxPop);
        this.updateInfoPanel(`
            <div class="choropleth-info">
                <h4>🗺️ District Population Map</h4>
                <p><strong>Highest:</strong> ${maxPop.toLocaleString()}</p>
                <p><strong>Lowest:</strong> ${minPop.toLocaleString()}</p>
                <p>Dark Red = High Population, Yellow = Low Population</p>
            </div>
        `);
    }

    createProvinceChoropleth() {
        this.removeLegend();
        
        const provinceLayer = this.layers.province;
        if (!provinceLayer) {
            alert('Province layer not found');
            return;
        }

        // Get population data for provinces
        let populations = [];
        provinceLayer.eachLayer(feature => {
            const pop = this.getPopulationForFeature(feature.feature, 'province');
            if (pop > 0) populations.push(pop);
        });

        if (populations.length === 0) {
            alert('No population data found for provinces');
            return;
        }

        const minPop = Math.min(...populations);
        const maxPop = Math.max(...populations);

        // Apply choropleth colors
        provinceLayer.eachLayer(feature => {
            const population = this.getPopulationForFeature(feature.feature, 'province');
            const color = this.getColorForPopulation(population, minPop, maxPop);
            
            feature.setStyle({
                fillColor: color,
                fillOpacity: 0.8,
                color: '#000',
                weight: 2
            });
        });

        this.createLegend('Province Population', minPop, maxPop);
        this.updateInfoPanel(`
            <div class="choropleth-info">
                <h4>🗺️ Province Population Map</h4>
                <p><strong>Highest:</strong> ${maxPop.toLocaleString()}</p>
                <p><strong>Lowest:</strong> ${minPop.toLocaleString()}</p>
                <p>Dark Red = High Population, Yellow = Low Population</p>
            </div>
        `);
    }

    getColorForPopulation(population, min, max) {
        if (population === 0) return '#cccccc'; // Gray for no data
        
        // Normalize to 0-1 range
        const normalized = (population - min) / (max - min);
        
        // Dark red to yellow gradient
        const colors = [
            '#8B0000', // Dark red (highest)
            '#B22222',
            '#DC143C',
            '#FF4500',
            '#FF6347',
            '#FFA500',
            '#FFD700',
            '#FFFF00'  // Yellow (lowest)
        ];
        
        // Invert normalized value so high population = dark red
        const index = Math.floor((1 - normalized) * (colors.length - 1));
        return colors[Math.min(index, colors.length - 1)];
    }

    createLegend(title, min, max) {
        this.removeLegend();
        
        const legend = L.control({position: 'bottomright'});
        
        legend.onAdd = () => {
            const div = L.DomUtil.create('div', 'choropleth-legend');
            
            const colors = ['#8B0000', '#B22222', '#DC143C', '#FF4500', '#FF6347', '#FFA500', '#FFD700', '#FFFF00'];
            
            div.innerHTML = `<h4>${title}</h4><div class="legend-scale">`;
            
            for (let i = 0; i < colors.length; i++) {
                const value = i === 0 ? max : i === colors.length - 1 ? min : 
                    Math.round(max - (i / (colors.length - 1)) * (max - min));
                
                div.innerHTML += `
                    <div class="legend-item">
                        <span class="legend-color" style="background: ${colors[i]}; width: 20px; height: 15px; display: inline-block; margin-right: 8px; border: 1px solid #999;"></span>
                        ${value.toLocaleString()}
                    </div>
                `;
            }
            
            div.innerHTML += '</div>';
            return div;
        };
        
        legend.addTo(this.map);
        this.currentLegend = legend;
    }

    removeLegend() {
        if (this.currentLegend) {
            this.map.removeControl(this.currentLegend);
            this.currentLegend = null;
        }
    }

    resetColors() {
        this.removeLegend();
        
        // Reset all layers to original styles
        Object.entries(this.layers).forEach(([levelType, layer]) => {
            if (layer) {
                layer.eachLayer(feature => {
                    feature.setStyle(this.getLayerStyle(levelType));
                });
            }
        });
        
        this.updateInfoPanel('Colors reset to original styling.');
    }

    getPopulationForFeature(feature, levelType) {
        // Check if NEPAL_POPULATION_DATA exists
        if (typeof NEPAL_POPULATION_DATA === 'undefined') {
            console.warn('Population data not loaded');
            return 0;
        }

        const name = this.extractFeatureName(feature, levelType);
        
        if (levelType === 'district') {
            for (const province of NEPAL_POPULATION_DATA) {
                const district = province.districts.find(d => 
                    d.name.toLowerCase() === name.toLowerCase()
                );
                if (district) return district.population;
            }
        } else if (levelType === 'province') {
            // Enhanced province matching using the mapping
            const province = NEPAL_POPULATION_DATA.find(p => {
                // Direct name matching
                if (name.toLowerCase() === 'province 1' && p.province === 1) return true;
                if (name.toLowerCase() === 'province 2' && p.province === 2) return true;
                if (name.toLowerCase() === 'bagmati' && p.province === 'Bagmati') return true;
                if (name.toLowerCase() === 'gandaki' && p.province === 'Gandaki') return true;
                if (name.toLowerCase() === 'province 5' && p.province === 5) return true;
                if (name.toLowerCase() === 'karnali' && p.province === 'Karnali') return true;
                if (name.toLowerCase() === 'sudurpaschim' && p.province === 'Sudurpaschim') return true;
                
                // Fallback matching
                return p.headquarter.toLowerCase() === name.toLowerCase() ||
                       p.province.toString() === name ||
                       p.province === name;
            });
            
            if (province) {
                console.log(`Found province: ${name} -> ${province.province} with population: ${province.population}`);
                return province.population;
            } else {
                console.warn(`No population data found for province: "${name}"`);
            }
        }
        
        return 0;
    }

    setupEventListeners() {
        // Basemap controls
        document.getElementById('osm-btn').addEventListener('click', () => this.switchBasemap('osm'));
        document.getElementById('satellite-btn').addEventListener('click', () => this.switchBasemap('satellite'));
        document.getElementById('terrain-btn').addEventListener('click', () => this.switchBasemap('terrain'));

        // Layer controls
        document.getElementById('province-layer').addEventListener('change', (e) => {
            this.toggleLayer('province', e.target.checked);
        });
        document.getElementById('district-layer').addEventListener('change', (e) => {
            this.toggleLayer('district', e.target.checked);
        });
        document.getElementById('local-layer').addEventListener('change', (e) => {
            this.toggleLayer('local', e.target.checked);
        });

        // Choropleth controls
        document.getElementById('district-choropleth-btn').addEventListener('click', () => {
            this.createDistrictChoropleth();
        });
        document.getElementById('province-choropleth-btn').addEventListener('click', () => {
            this.createProvinceChoropleth();
        });
        document.getElementById('reset-colors-btn').addEventListener('click', () => {
            this.resetColors();
        });

        // Reset button
        document.getElementById('reset-btn').addEventListener('click', () => this.resetView());

        // Map click to deselect
        this.map.on('click', () => {
            if (this.selectedFeature) {
                this.selectedFeature.layer.setStyle(this.getLayerStyle(this.selectedFeature.levelType));
                this.selectedFeature = null;
                this.updateInfoPanel('Click on any boundary to see information.');
            }
        });
    }

    switchBasemap(basemapName) {
        this.map.removeLayer(this.baseMaps[this.currentBasemap]);
        this.baseMaps[basemapName].addTo(this.map);
        this.currentBasemap = basemapName;
        
        document.querySelectorAll('.basemap-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`${basemapName}-btn`).classList.add('active');
    }

    toggleLayer(layerName, visible) {
        const layer = this.layers[layerName];
        if (layer) {
            if (visible) {
                this.map.addLayer(layer);
            } else {
                this.map.removeLayer(layer);
            }
        }
    }

    resetView() {
        this.fitMapToData();
        if (this.selectedFeature) {
            this.selectedFeature.layer.setStyle(this.getLayerStyle(this.selectedFeature.levelType));
            this.selectedFeature = null;
        }
        this.updateInfoPanel('View reset.');
    }

    fitMapToData() {
        const group = new L.featureGroup();
        Object.values(this.layers).forEach(layer => {
            if (layer) {
                group.addLayer(layer);
            }
        });
        
        if (group.getLayers().length > 0) {
            this.map.fitBounds(group.getBounds(), { padding: [20, 20] });
        } else {
            this.map.setView([28.3949, 84.1240], 7);
        }
    }

    updateInfoPanel(content) {
        document.getElementById('feature-info').innerHTML = content;
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const app = new NepalGeoApp();
    app.init();
});

