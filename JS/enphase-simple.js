/**
 * Simplified Enphase IQ Gateway Integration for ioBroker
 * 
 * This is a simplified version that's easy to configure and use.
 * Copy this script to your ioBroker JavaScript adapter and configure the settings below.
 * 
 * Author: DieWaldfee
 * Version: 1.0.0
 * License: GPL-3.0
 */

// ========================================
// CONFIGURATION - CHANGE THESE VALUES!
// ========================================

const CONFIG = {
    // Your IQ Gateway IP address (check your router or use 'envoy.local')
    gatewayIP: 'envoy.local', // Change to your gateway IP, e.g., '192.168.1.100'
    
    // Your Enphase authentication token
    // Get this from: https://entrez.enphaseenergy.com/
    authToken: 'YOUR_TOKEN_HERE', // Replace with your actual token
    
    // How often to fetch data (in seconds)
    updateInterval: 30, // 30 seconds (minimum 5 seconds recommended)
    
    // Enable/disable features
    enableProduction: true,    // Solar production data
    enableConsumption: true,   // Home consumption data  
    enableInverters: true,     // Individual inverter data
    enableSystemInfo: true,    // System information
    
    // ioBroker state path
    statePrefix: 'javascript.0.enphase.',
    
    // Enable debug logging
    debug: false
};

// ========================================
// SCRIPT CODE - DO NOT MODIFY BELOW
// ========================================

let updateTimer = null;
let isRunning = false;

/**
 * Logging function
 */
function log(message, level = 'info') {
    const timestamp = new Date().toLocaleString();
    const msg = `[${timestamp}] [Enphase] ${message}`;
    
    switch (level) {
        case 'error': console.error(msg); break;
        case 'warn': console.warn(msg); break;
        case 'debug': if (CONFIG.debug) console.log(`[DEBUG] ${msg}`); break;
        default: console.log(msg);
    }
}

/**
 * Make API request to IQ Gateway
 */
async function apiRequest(endpoint) {
    const url = `https://${CONFIG.gatewayIP}${endpoint}`;
    
    try {
        log(`Requesting: ${endpoint}`, 'debug');
        
        // Use Node.js built-in modules
        const https = require('https');
        const options = {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${CONFIG.authToken}`,
                'Accept': 'application/json'
            },
            // Ignore SSL certificate errors for local connections
            rejectUnauthorized: false,
            timeout: 10000
        };
        
        return new Promise((resolve, reject) => {
            const req = https.request(url, options, (res) => {
                let data = '';
                
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        if (res.statusCode === 200) {
                            resolve(JSON.parse(data));
                        } else {
                            reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                        }
                    } catch (e) {
                        reject(new Error(`Parse error: ${e.message}`));
                    }
                });
            });
            
            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
            
            req.end();
        });
        
    } catch (error) {
        log(`API request failed for ${endpoint}: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Create or update ioBroker state
 */
async function updateState(stateId, value, name, unit = '') {
    const fullId = CONFIG.statePrefix + stateId;
    
    try {
        // Create state if it doesn't exist
        if (!existsState(fullId)) {
            await createStateAsync(fullId, {
                name: name,
                type: typeof value,
                role: 'value',
                unit: unit,
                read: true,
                write: false
            });
            log(`Created state: ${fullId}`, 'debug');
        }
        
        // Update value
        await setStateAsync(fullId, value);
        log(`${stateId} = ${value} ${unit}`, 'debug');
        
    } catch (error) {
        log(`State update error for ${fullId}: ${error.message}`, 'error');
    }
}

/**
 * Fetch and process production data
 */
async function fetchProduction() {
    if (!CONFIG.enableProduction) return;
    
    try {
        const data = await apiRequest('/api/v1/production');
        
        if (data && data.production && data.production[0]) {
            const prod = data.production[0];
            
            await updateState('production.power', prod.wNow || 0, 'Current Production', 'W');
            await updateState('production.today', prod.whToday || 0, 'Production Today', 'Wh');
            await updateState('production.lifetime', prod.whLifetime || 0, 'Production Lifetime', 'Wh');
            
            log(`Production: ${prod.wNow || 0}W (${prod.whToday || 0}Wh today)`);
        }
        
    } catch (error) {
        log(`Production fetch failed: ${error.message}`, 'error');
    }
}

/**
 * Fetch and process consumption data
 */
async function fetchConsumption() {
    if (!CONFIG.enableConsumption) return;
    
    try {
        const data = await apiRequest('/api/v1/consumption');
        
        if (data && data.consumption && data.consumption[0]) {
            const cons = data.consumption[0];
            
            await updateState('consumption.power', cons.wNow || 0, 'Current Consumption', 'W');
            await updateState('consumption.today', cons.whToday || 0, 'Consumption Today', 'Wh');
            await updateState('consumption.lifetime', cons.whLifetime || 0, 'Consumption Lifetime', 'Wh');
            
            log(`Consumption: ${cons.wNow || 0}W (${cons.whToday || 0}Wh today)`);
        }
        
    } catch (error) {
        log(`Consumption fetch failed: ${error.message}`, 'error');
    }
}

/**
 * Fetch and process inverter data
 */
async function fetchInverters() {
    if (!CONFIG.enableInverters) return;
    
    try {
        const data = await apiRequest('/api/v1/production/inverters');
        
        if (data && Array.isArray(data)) {
            await updateState('inverters.count', data.length, 'Inverter Count', '');
            
            let totalPower = 0;
            let activeCount = 0;
            
            // Process each inverter
            for (const inv of data) {
                const serial = inv.serialNumber;
                const power = inv.lastReportWatts || 0;
                
                await updateState(`inverters.${serial}.power`, power, `Inverter ${serial}`, 'W');
                await updateState(`inverters.${serial}.producing`, inv.producing ? 1 : 0, `Inverter ${serial} Status`, '');
                
                totalPower += power;
                if (inv.producing) activeCount++;
            }
            
            await updateState('inverters.total_power', totalPower, 'Total Inverter Power', 'W');
            await updateState('inverters.active', activeCount, 'Active Inverters', '');
            
            log(`Inverters: ${activeCount}/${data.length} active (${totalPower}W total)`);
        }
        
    } catch (error) {
        log(`Inverter fetch failed: ${error.message}`, 'error');
    }
}

/**
 * Fetch system information
 */
async function fetchSystemInfo() {
    if (!CONFIG.enableSystemInfo) return;
    
    try {
        const data = await apiRequest('/info');
        
        if (data) {
            if (data.device) {
                await updateState('system.type', data.device.type || 'unknown', 'Device Type', '');
                await updateState('system.version', data.device.software || 'unknown', 'Software Version', '');
            }
            
            log('System info updated');
        }
        
    } catch (error) {
        log(`System info fetch failed: ${error.message}`, 'error');
    }
}

/**
 * Main data fetch function
 */
async function fetchAllData() {
    if (isRunning) {
        log('Previous fetch still running, skipping...', 'warn');
        return;
    }
    
    isRunning = true;
    log('Starting data fetch...');
    
    try {
        // Fetch all enabled data types
        await Promise.allSettled([
            fetchProduction(),
            fetchConsumption(),
            fetchInverters(),
            fetchSystemInfo()
        ]);
        
        // Update last fetch time
        await updateState('system.last_update', new Date().toISOString(), 'Last Update', '');
        
        log('Data fetch completed');
        
    } catch (error) {
        log(`Fetch error: ${error.message}`, 'error');
    } finally {
        isRunning = false;
    }
}

/**
 * Validate configuration
 */
function validateConfig() {
    if (!CONFIG.gatewayIP || CONFIG.gatewayIP === 'envoy.local') {
        log('Using default gateway address. Change CONFIG.gatewayIP if needed.', 'warn');
    }
    
    if (!CONFIG.authToken || CONFIG.authToken === 'YOUR_TOKEN_HERE') {
        throw new Error('Please set your authentication token in CONFIG.authToken');
    }
    
    if (CONFIG.updateInterval < 5) {
        throw new Error('Update interval must be at least 5 seconds');
    }
}

/**
 * Start monitoring
 */
function startMonitoring() {
    try {
        log('Starting Enphase IQ Gateway monitoring...');
        
        // Validate configuration
        validateConfig();
        
        // Clear existing timer
        if (updateTimer) {
            clearInterval(updateTimer);
        }
        
        // Initial fetch
        fetchAllData();
        
        // Set up recurring fetch
        updateTimer = setInterval(fetchAllData, CONFIG.updateInterval * 1000);
        
        log(`Monitoring started (interval: ${CONFIG.updateInterval}s)`);
        
    } catch (error) {
        log(`Failed to start monitoring: ${error.message}`, 'error');
    }
}

/**
 * Stop monitoring
 */
function stopMonitoring() {
    if (updateTimer) {
        clearInterval(updateTimer);
        updateTimer = null;
        log('Monitoring stopped');
    }
}

// ========================================
// SCRIPT LIFECYCLE
// ========================================

// Handle script stop
if (typeof onStop === 'function') {
    onStop(() => {
        stopMonitoring();
        log('Script stopped');
    });
}

// Auto-start monitoring
startMonitoring();

log('Enphase IQ Gateway integration loaded');
log('Visit https://entrez.enphaseenergy.com/ to get your authentication token');
log(`Data will be available under: ${CONFIG.statePrefix}*`);