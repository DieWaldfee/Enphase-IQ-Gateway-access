/**
 * Enphase IQ Gateway Local API Integration for ioBroker
 * 
 * This script fetches data from the local IQ Gateway Local APIs with Token-Based Authentication
 * and creates/updates ioBroker datapoints for monitoring solar production and consumption.
 * 
 * Author: DieWaldfee
 * Version: 1.0.0
 * License: GPL-3.0
 */

// Configuration - Update these values according to your setup
const CONFIG = {
    // IQ Gateway IP address (usually envoy.local or specific IP)
    gatewayIP: '192.168.1.100', // Change to your IQ Gateway IP
    
    // Authentication token - Get this from the Enphase Enlighten website
    authToken: 'YOUR_TOKEN_HERE',
    
    // API endpoints
    endpoints: {
        production: '/api/v1/production',
        consumption: '/api/v1/consumption',
        inventory: '/api/v1/production/inverters',
        info: '/info'
    },
    
    // Update intervals (in milliseconds)
    updateInterval: 30000, // 30 seconds
    
    // ioBroker state prefix
    statePrefix: 'javascript.0.enphase.',
    
    // Enable/disable debug logging
    debug: true
};

// Global variables
let updateTimer = null;
let isRunning = false;

/**
 * Log function with debug support
 */
function logMessage(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logMsg = `[${timestamp}] [Enphase IQ Gateway] ${message}`;
    
    switch (level) {
        case 'error':
            console.error(logMsg);
            break;
        case 'warn':
            console.warn(logMsg);
            break;
        case 'debug':
            if (CONFIG.debug) console.log(`[DEBUG] ${logMsg}`);
            break;
        default:
            console.log(logMsg);
    }
}

/**
 * Make HTTP request to IQ Gateway API
 */
async function makeAPIRequest(endpoint) {
    const url = `https://${CONFIG.gatewayIP}${endpoint}`;
    
    try {
        logMessage(`Making request to: ${url}`, 'debug');
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${CONFIG.authToken}`,
                'Accept': 'application/json',
                'User-Agent': 'ioBroker-Enphase-Integration/1.0'
            },
            // Ignore SSL certificate errors for local connections
            agent: new (require('https')).Agent({ rejectUnauthorized: false })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        logMessage(`Successfully received data from ${endpoint}`, 'debug');
        return data;
        
    } catch (error) {
        logMessage(`Error making request to ${endpoint}: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Create or update ioBroker state
 */
async function createOrUpdateState(stateId, value, name, unit = '', role = 'value') {
    const fullStateId = CONFIG.statePrefix + stateId;
    
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
            logMessage(`Created new state: ${fullStateId}`, 'debug');
        }
        
        // Set the value
        await setStateAsync(fullStateId, value);
        logMessage(`Updated ${fullStateId} = ${value} ${unit}`, 'debug');
        
    } catch (error) {
        logMessage(`Error updating state ${fullStateId}: ${error.message}`, 'error');
    }
}

/**
 * Process production data
 */
async function processProductionData(data) {
    if (!data || !data.production) {
        logMessage('No production data available', 'warn');
        return;
    }
    
    const production = data.production[0]; // Current production
    const productionToday = data.production[1]; // Today's production
    
    if (production) {
        await createOrUpdateState('production.current.power', production.wNow || 0, 'Current Production Power', 'W', 'value.power');
        await createOrUpdateState('production.current.energy_today', production.whToday || 0, 'Production Energy Today', 'Wh', 'value.power.consumption');
        await createOrUpdateState('production.current.energy_lifetime', production.whLifetime || 0, 'Production Energy Lifetime', 'Wh', 'value.power.consumption');
    }
    
    if (productionToday) {
        await createOrUpdateState('production.today.energy', productionToday.whToday || 0, 'Production Energy Today Total', 'Wh', 'value.power.consumption');
    }
    
    logMessage(`Production: ${production?.wNow || 0}W current, ${production?.whToday || 0}Wh today`);
}

/**
 * Process consumption data
 */
async function processConsumptionData(data) {
    if (!data || !data.consumption) {
        logMessage('No consumption data available', 'warn');
        return;
    }
    
    const consumption = data.consumption[0]; // Current consumption
    
    if (consumption) {
        await createOrUpdateState('consumption.current.power', consumption.wNow || 0, 'Current Consumption Power', 'W', 'value.power');
        await createOrUpdateState('consumption.current.energy_today', consumption.whToday || 0, 'Consumption Energy Today', 'Wh', 'value.power.consumption');
        await createOrUpdateState('consumption.current.energy_lifetime', consumption.whLifetime || 0, 'Consumption Energy Lifetime', 'Wh', 'value.power.consumption');
    }
    
    logMessage(`Consumption: ${consumption?.wNow || 0}W current, ${consumption?.whToday || 0}Wh today`);
}

/**
 * Process inverter inventory data
 */
async function processInventoryData(data) {
    if (!data || !Array.isArray(data)) {
        logMessage('No inverter inventory data available', 'warn');
        return;
    }
    
    await createOrUpdateState('inverters.count', data.length, 'Number of Inverters', '', 'value');
    
    let totalPower = 0;
    let activeCount = 0;
    
    for (const inverter of data) {
        const serialNumber = inverter.serialNumber;
        const power = inverter.lastReportWatts || 0;
        const lastReport = new Date(inverter.lastReportDate * 1000);
        
        // Create states for each inverter
        await createOrUpdateState(`inverters.${serialNumber}.power`, power, `Inverter ${serialNumber} Power`, 'W', 'value.power');
        await createOrUpdateState(`inverters.${serialNumber}.last_report`, lastReport.toISOString(), `Inverter ${serialNumber} Last Report`, '', 'value.datetime');
        await createOrUpdateState(`inverters.${serialNumber}.producing`, inverter.producing ? 1 : 0, `Inverter ${serialNumber} Producing`, '', 'indicator');
        
        totalPower += power;
        if (inverter.producing) activeCount++;
    }
    
    await createOrUpdateState('inverters.total_power', totalPower, 'Total Inverter Power', 'W', 'value.power');
    await createOrUpdateState('inverters.active_count', activeCount, 'Active Inverters Count', '', 'value');
    
    logMessage(`Inverters: ${activeCount}/${data.length} active, ${totalPower}W total`);
}

/**
 * Process system info data
 */
async function processSystemInfo(data) {
    if (!data) {
        logMessage('No system info data available', 'warn');
        return;
    }
    
    // Update system information
    if (data.device) {
        await createOrUpdateState('system.device_type', data.device.type || 'unknown', 'Device Type', '', 'text');
        await createOrUpdateState('system.part_number', data.device.pn || 'unknown', 'Part Number', '', 'text');
        await createOrUpdateState('system.software_version', data.device.software || 'unknown', 'Software Version', '', 'text');
    }
    
    if (data.build_info) {
        await createOrUpdateState('system.build_date', data.build_info.build_date || 'unknown', 'Build Date', '', 'text');
    }
    
    // Set last update timestamp
    await createOrUpdateState('system.last_update', new Date().toISOString(), 'Last Update', '', 'value.datetime');
    
    logMessage('System info updated');
}

/**
 * Fetch and process all data
 */
async function fetchAllData() {
    if (isRunning) {
        logMessage('Previous fetch still running, skipping...', 'warn');
        return;
    }
    
    isRunning = true;
    
    try {
        logMessage('Starting data fetch cycle...');
        
        // Fetch production data
        try {
            const productionData = await makeAPIRequest(CONFIG.endpoints.production);
            await processProductionData(productionData);
        } catch (error) {
            logMessage(`Failed to fetch production data: ${error.message}`, 'error');
        }
        
        // Fetch consumption data
        try {
            const consumptionData = await makeAPIRequest(CONFIG.endpoints.consumption);
            await processConsumptionData(consumptionData);
        } catch (error) {
            logMessage(`Failed to fetch consumption data: ${error.message}`, 'error');
        }
        
        // Fetch inverter inventory
        try {
            const inventoryData = await makeAPIRequest(CONFIG.endpoints.inventory);
            await processInventoryData(inventoryData);
        } catch (error) {
            logMessage(`Failed to fetch inventory data: ${error.message}`, 'error');
        }
        
        // Fetch system info (less frequently)
        try {
            const systemInfo = await makeAPIRequest(CONFIG.endpoints.info);
            await processSystemInfo(systemInfo);
        } catch (error) {
            logMessage(`Failed to fetch system info: ${error.message}`, 'error');
        }
        
        logMessage('Data fetch cycle completed successfully');
        
    } catch (error) {
        logMessage(`Error during data fetch cycle: ${error.message}`, 'error');
    } finally {
        isRunning = false;
    }
}

/**
 * Start the monitoring service
 */
function startMonitoring() {
    if (updateTimer) {
        clearInterval(updateTimer);
    }
    
    logMessage(`Starting Enphase IQ Gateway monitoring (interval: ${CONFIG.updateInterval}ms)`);
    
    // Initial fetch
    fetchAllData();
    
    // Set up periodic updates
    updateTimer = setInterval(fetchAllData, CONFIG.updateInterval);
    
    logMessage('Monitoring started successfully');
}

/**
 * Stop the monitoring service
 */
function stopMonitoring() {
    if (updateTimer) {
        clearInterval(updateTimer);
        updateTimer = null;
    }
    
    logMessage('Monitoring stopped');
}

/**
 * Validate configuration
 */
function validateConfig() {
    if (!CONFIG.gatewayIP || CONFIG.gatewayIP === '192.168.1.100') {
        throw new Error('Please configure the correct IQ Gateway IP address');
    }
    
    if (!CONFIG.authToken || CONFIG.authToken === 'YOUR_TOKEN_HERE') {
        throw new Error('Please configure your authentication token');
    }
    
    logMessage('Configuration validated successfully');
}

/**
 * Main execution
 */
function main() {
    try {
        logMessage('Initializing Enphase IQ Gateway integration...');
        
        // Validate configuration
        validateConfig();
        
        // Start monitoring
        startMonitoring();
        
        logMessage('Enphase IQ Gateway integration initialized successfully');
        
    } catch (error) {
        logMessage(`Initialization failed: ${error.message}`, 'error');
        return;
    }
}

// Script lifecycle management
if (typeof onStop === 'function') {
    onStop(() => {
        stopMonitoring();
        logMessage('Script stopped');
    });
}

// Auto-start when script is loaded
main();

// Export functions for external use (optional)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        startMonitoring,
        stopMonitoring,
        fetchAllData,
        CONFIG
    };
}