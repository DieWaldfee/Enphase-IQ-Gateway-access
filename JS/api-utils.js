/**
 * API Utility Module for Enphase IQ Gateway Communication
 * 
 * This module handles all API communication with the IQ Gateway
 */

// Node.js modules (available in ioBroker)
const https = require('https');
const http = require('http');

/**
 * API Client class for Enphase IQ Gateway
 */
class EnphaseAPIClient {
    constructor(config) {
        this.config = config;
        this.baseURL = `https://${config.gatewayIP}`;
        this.timeout = config.timeout || 10000;
        this.retryCount = 0;
        this.maxRetries = config.maxRetries || 3;
        
        // Create HTTPS agent that ignores certificate errors for local connections
        this.httpsAgent = new https.Agent({
            rejectUnauthorized: false,
            timeout: this.timeout
        });
    }
    
    /**
     * Log messages with appropriate level
     */
    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const logMsg = `[${timestamp}] [API Client] ${message}`;
        
        switch (level) {
            case 'error':
                console.error(logMsg);
                break;
            case 'warn':
                console.warn(logMsg);
                break;
            case 'debug':
                if (this.config.logLevel === 'debug') console.log(`[DEBUG] ${logMsg}`);
                break;
            default:
                console.log(logMsg);
        }
    }
    
    /**
     * Make HTTP request with retry logic
     */
    async makeRequest(endpoint, retryAttempt = 0) {
        const url = `${this.baseURL}${endpoint}`;
        
        return new Promise((resolve, reject) => {
            this.log(`Making request to: ${endpoint}`, 'debug');
            
            const options = {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.config.authToken}`,
                    'Accept': 'application/json',
                    'User-Agent': 'ioBroker-Enphase-Integration/1.0',
                    'Connection': 'keep-alive'
                },
                timeout: this.timeout,
                agent: this.httpsAgent
            };
            
            const request = https.request(url, options, (response) => {
                let data = '';
                
                response.on('data', chunk => {
                    data += chunk;
                });
                
                response.on('end', () => {
                    try {
                        if (response.statusCode === 200) {
                            const jsonData = JSON.parse(data);
                            this.log(`Successfully received data from ${endpoint}`, 'debug');
                            resolve(jsonData);
                        } else if (response.statusCode === 401) {
                            reject(new Error('Authentication failed. Please check your token.'));
                        } else if (response.statusCode === 404) {
                            reject(new Error(`Endpoint not found: ${endpoint}. Check if your gateway supports this API.`));
                        } else {
                            reject(new Error(`HTTP ${response.statusCode}: ${response.statusText}`));
                        }
                    } catch (parseError) {
                        reject(new Error(`Failed to parse response: ${parseError.message}`));
                    }
                });
            });
            
            request.on('error', async (error) => {
                this.log(`Request error for ${endpoint}: ${error.message}`, 'error');
                
                // Retry logic
                if (retryAttempt < this.maxRetries) {
                    this.log(`Retrying request to ${endpoint} (attempt ${retryAttempt + 1}/${this.maxRetries})`, 'warn');
                    
                    setTimeout(async () => {
                        try {
                            const result = await this.makeRequest(endpoint, retryAttempt + 1);
                            resolve(result);
                        } catch (retryError) {
                            reject(retryError);
                        }
                    }, this.config.retryDelay || 5000);
                } else {
                    reject(error);
                }
            });
            
            request.on('timeout', () => {
                request.destroy();
                reject(new Error(`Request timeout after ${this.timeout}ms`));
            });
            
            request.end();
        });
    }
    
    /**
     * Test connection to the gateway
     */
    async testConnection() {
        try {
            await this.makeRequest('/info.xml');
            this.log('Connection test successful');
            return true;
        } catch (error) {
            this.log(`Connection test failed: ${error.message}`, 'error');
            return false;
        }
    }
    
    /**
     * Get production data
     */
    async getProduction() {
        return this.makeRequest('/api/v1/production');
    }
    
    /**
     * Get consumption data
     */
    async getConsumption() {
        return this.makeRequest('/api/v1/consumption');
    }
    
    /**
     * Get inverter inventory
     */
    async getInventory() {
        return this.makeRequest('/api/v1/production/inverters');
    }
    
    /**
     * Get system information
     */
    async getSystemInfo() {
        return this.makeRequest('/info');
    }
    
    /**
     * Get production meters (newer firmware)
     */
    async getProductionMeters() {
        return this.makeRequest('/api/v1/production/meters');
    }
    
    /**
     * Get grid profile
     */
    async getGridProfile() {
        return this.makeRequest('/api/v1/grid_profile');
    }
    
    /**
     * Get all available data based on enabled features
     */
    async getAllData() {
        const results = {};
        const features = this.config.features || {};
        
        // Fetch data for enabled features
        const promises = [];
        
        if (features.production) {
            promises.push(
                this.getProduction()
                    .then(data => results.production = data)
                    .catch(error => {
                        this.log(`Failed to fetch production data: ${error.message}`, 'error');
                        results.production = null;
                    })
            );
        }
        
        if (features.consumption) {
            promises.push(
                this.getConsumption()
                    .then(data => results.consumption = data)
                    .catch(error => {
                        this.log(`Failed to fetch consumption data: ${error.message}`, 'error');
                        results.consumption = null;
                    })
            );
        }
        
        if (features.inverters) {
            promises.push(
                this.getInventory()
                    .then(data => results.inventory = data)
                    .catch(error => {
                        this.log(`Failed to fetch inventory data: ${error.message}`, 'error');
                        results.inventory = null;
                    })
            );
        }
        
        if (features.systemInfo) {
            promises.push(
                this.getSystemInfo()
                    .then(data => results.systemInfo = data)
                    .catch(error => {
                        this.log(`Failed to fetch system info: ${error.message}`, 'error');
                        results.systemInfo = null;
                    })
            );
        }
        
        if (features.meters) {
            promises.push(
                this.getProductionMeters()
                    .then(data => results.meters = data)
                    .catch(error => {
                        this.log(`Failed to fetch meters data: ${error.message}`, 'error');
                        results.meters = null;
                    })
            );
        }
        
        if (features.gridProfile) {
            promises.push(
                this.getGridProfile()
                    .then(data => results.gridProfile = data)
                    .catch(error => {
                        this.log(`Failed to fetch grid profile: ${error.message}`, 'error');
                        results.gridProfile = null;
                    })
            );
        }
        
        // Wait for all requests to complete
        await Promise.all(promises);
        
        return results;
    }
}

/**
 * Data processing utilities
 */
class DataProcessor {
    constructor(config) {
        this.config = config;
        this.statePrefix = config.statePrefix || 'javascript.0.enphase.';
    }
    
    /**
     * Log messages
     */
    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const logMsg = `[${timestamp}] [Data Processor] ${message}`;
        
        switch (level) {
            case 'error':
                console.error(logMsg);
                break;
            case 'warn':
                console.warn(logMsg);
                break;
            case 'debug':
                if (this.config.logLevel === 'debug') console.log(`[DEBUG] ${logMsg}`);
                break;
            default:
                console.log(logMsg);
        }
    }
    
    /**
     * Create or update ioBroker state
     */
    async updateState(stateId, value, name, unit = '', role = 'value') {
        const fullStateId = this.statePrefix + stateId;
        
        try {
            // Check if state exists, if not create it
            if (!existsState(fullStateId)) {
                await createStateAsync(fullStateId, {
                    name: name,
                    type: typeof value,
                    role: role,
                    unit: unit,
                    read: true,
                    write: false
                });
                this.log(`Created new state: ${fullStateId}`, 'debug');
            }
            
            // Set the value
            await setStateAsync(fullStateId, value);
            this.log(`Updated ${fullStateId} = ${value} ${unit}`, 'debug');
            
        } catch (error) {
            this.log(`Error updating state ${fullStateId}: ${error.message}`, 'error');
        }
    }
    
    /**
     * Process all fetched data
     */
    async processAllData(data) {
        const promises = [];
        
        if (data.production) {
            promises.push(this.processProduction(data.production));
        }
        
        if (data.consumption) {
            promises.push(this.processConsumption(data.consumption));
        }
        
        if (data.inventory) {
            promises.push(this.processInventory(data.inventory));
        }
        
        if (data.systemInfo) {
            promises.push(this.processSystemInfo(data.systemInfo));
        }
        
        if (data.meters) {
            promises.push(this.processMeters(data.meters));
        }
        
        // Always update last fetch timestamp
        promises.push(this.updateState('system.last_update', new Date().toISOString(), 'Last Update', '', 'value.datetime'));
        
        await Promise.all(promises);
    }
    
    /**
     * Process production data
     */
    async processProduction(data) {
        if (!data || !data.production) return;
        
        const production = data.production[0]; // Current production
        const productionToday = data.production[1]; // Today's production
        
        const promises = [];
        
        if (production) {
            promises.push(this.updateState('production.current.power', production.wNow || 0, 'Current Production Power', 'W', 'value.power'));
            promises.push(this.updateState('production.current.energy_today', production.whToday || 0, 'Production Energy Today', 'Wh', 'value.power.consumption'));
            promises.push(this.updateState('production.current.energy_lifetime', production.whLifetime || 0, 'Production Energy Lifetime', 'Wh', 'value.power.consumption'));
        }
        
        if (productionToday) {
            promises.push(this.updateState('production.today.energy', productionToday.whToday || 0, 'Production Energy Today Total', 'Wh', 'value.power.consumption'));
        }
        
        await Promise.all(promises);
        this.log(`Production: ${production?.wNow || 0}W current, ${production?.whToday || 0}Wh today`);
    }
    
    /**
     * Process consumption data
     */
    async processConsumption(data) {
        if (!data || !data.consumption) return;
        
        const consumption = data.consumption[0];
        const promises = [];
        
        if (consumption) {
            promises.push(this.updateState('consumption.current.power', consumption.wNow || 0, 'Current Consumption Power', 'W', 'value.power'));
            promises.push(this.updateState('consumption.current.energy_today', consumption.whToday || 0, 'Consumption Energy Today', 'Wh', 'value.power.consumption'));
            promises.push(this.updateState('consumption.current.energy_lifetime', consumption.whLifetime || 0, 'Consumption Energy Lifetime', 'Wh', 'value.power.consumption'));
        }
        
        await Promise.all(promises);
        this.log(`Consumption: ${consumption?.wNow || 0}W current, ${consumption?.whToday || 0}Wh today`);
    }
    
    /**
     * Process inverter inventory
     */
    async processInventory(data) {
        if (!data || !Array.isArray(data)) return;
        
        const promises = [];
        let totalPower = 0;
        let activeCount = 0;
        
        promises.push(this.updateState('inverters.count', data.length, 'Number of Inverters', '', 'value'));
        
        for (const inverter of data) {
            const serialNumber = inverter.serialNumber;
            const power = inverter.lastReportWatts || 0;
            const lastReport = new Date(inverter.lastReportDate * 1000);
            
            promises.push(this.updateState(`inverters.${serialNumber}.power`, power, `Inverter ${serialNumber} Power`, 'W', 'value.power'));
            promises.push(this.updateState(`inverters.${serialNumber}.last_report`, lastReport.toISOString(), `Inverter ${serialNumber} Last Report`, '', 'value.datetime'));
            promises.push(this.updateState(`inverters.${serialNumber}.producing`, inverter.producing ? 1 : 0, `Inverter ${serialNumber} Producing`, '', 'indicator'));
            
            totalPower += power;
            if (inverter.producing) activeCount++;
        }
        
        promises.push(this.updateState('inverters.total_power', totalPower, 'Total Inverter Power', 'W', 'value.power'));
        promises.push(this.updateState('inverters.active_count', activeCount, 'Active Inverters Count', '', 'value'));
        
        await Promise.all(promises);
        this.log(`Inverters: ${activeCount}/${data.length} active, ${totalPower}W total`);
    }
    
    /**
     * Process system info
     */
    async processSystemInfo(data) {
        if (!data) return;
        
        const promises = [];
        
        if (data.device) {
            promises.push(this.updateState('system.device_type', data.device.type || 'unknown', 'Device Type', '', 'text'));
            promises.push(this.updateState('system.part_number', data.device.pn || 'unknown', 'Part Number', '', 'text'));
            promises.push(this.updateState('system.software_version', data.device.software || 'unknown', 'Software Version', '', 'text'));
        }
        
        if (data.build_info) {
            promises.push(this.updateState('system.build_date', data.build_info.build_date || 'unknown', 'Build Date', '', 'text'));
        }
        
        await Promise.all(promises);
        this.log('System info updated');
    }
    
    /**
     * Process meters data
     */
    async processMeters(data) {
        if (!data || !Array.isArray(data)) return;
        
        const promises = [];
        
        for (const meter of data) {
            const meterType = meter.measurementType;
            const prefix = `meters.${meterType}`;
            
            promises.push(this.updateState(`${prefix}.power`, meter.activePower || 0, `${meterType} Power`, 'W', 'value.power'));
            promises.push(this.updateState(`${prefix}.energy_delivered`, meter.whDelivered || 0, `${meterType} Energy Delivered`, 'Wh', 'value.power.consumption'));
            promises.push(this.updateState(`${prefix}.energy_received`, meter.whReceived || 0, `${meterType} Energy Received`, 'Wh', 'value.power.consumption'));
        }
        
        await Promise.all(promises);
        this.log('Meters data updated');
    }
}

// Export classes for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        EnphaseAPIClient,
        DataProcessor
    };
}