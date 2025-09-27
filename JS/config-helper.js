/**
 * Configuration Helper for Enphase IQ Gateway Integration
 * 
 * This module helps with configuration management and validation
 */

/**
 * Default configuration template
 */
const DEFAULT_CONFIG = {
    // Network settings
    gatewayIP: 'envoy.local', // or specific IP like '192.168.1.100'
    timeout: 10000, // Request timeout in milliseconds
    
    // Authentication
    authToken: '', // Your Enphase authentication token
    
    // API settings
    endpoints: {
        production: '/api/v1/production',
        consumption: '/api/v1/consumption',
        inventory: '/api/v1/production/inverters',
        info: '/info',
        meters: '/api/v1/production/meters',
        grid_profile: '/api/v1/grid_profile'
    },
    
    // Update settings
    updateInterval: 30000, // 30 seconds
    retryDelay: 5000, // 5 seconds retry delay on error
    maxRetries: 3,
    
    // ioBroker settings
    statePrefix: 'javascript.0.enphase.',
    createStates: true,
    logLevel: 'info', // 'debug', 'info', 'warn', 'error'
    
    // Feature toggles
    features: {
        production: true,
        consumption: true,
        inverters: true,
        systemInfo: true,
        meters: false, // Requires newer firmware
        gridProfile: false // Advanced feature
    }
};

/**
 * Validate IP address format
 */
function isValidIP(ip) {
    if (ip === 'envoy.local') return true;
    const ipRegex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(ip);
}

/**
 * Validate authentication token format
 */
function isValidToken(token) {
    if (!token || typeof token !== 'string') return false;
    // Basic validation - tokens are typically base64 encoded and quite long
    return token.length > 20 && /^[A-Za-z0-9+/=_-]+$/.test(token);
}

/**
 * Validate configuration object
 */
function validateConfig(config) {
    const errors = [];
    
    // Check required fields
    if (!config.gatewayIP) {
        errors.push('Gateway IP is required');
    } else if (!isValidIP(config.gatewayIP)) {
        errors.push('Invalid gateway IP format');
    }
    
    if (!config.authToken) {
        errors.push('Authentication token is required');
    } else if (!isValidToken(config.authToken)) {
        errors.push('Invalid authentication token format');
    }
    
    // Check numeric values
    if (config.updateInterval && (config.updateInterval < 5000 || config.updateInterval > 300000)) {
        errors.push('Update interval should be between 5 seconds and 5 minutes');
    }
    
    if (config.timeout && (config.timeout < 1000 || config.timeout > 60000)) {
        errors.push('Timeout should be between 1 and 60 seconds');
    }
    
    // Check state prefix format
    if (config.statePrefix && !config.statePrefix.endsWith('.')) {
        errors.push('State prefix should end with a dot (.)');
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

/**
 * Merge user configuration with defaults
 */
function mergeConfig(userConfig = {}) {
    const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); // Deep copy
    
    // Merge top-level properties
    Object.keys(userConfig).forEach(key => {
        if (typeof userConfig[key] === 'object' && !Array.isArray(userConfig[key]) && userConfig[key] !== null) {
            // Deep merge for objects
            config[key] = { ...config[key], ...userConfig[key] };
        } else {
            // Direct assignment for primitives
            config[key] = userConfig[key];
        }
    });
    
    return config;
}

/**
 * Generate configuration template file content
 */
function generateConfigTemplate() {
    return `// Enphase IQ Gateway Configuration
// Copy this to your ioBroker script and modify the values

const ENPHASE_CONFIG = {
    // === REQUIRED SETTINGS ===
    // Your IQ Gateway IP address (check your router or use 'envoy.local')
    gatewayIP: '192.168.1.100', // Change this to your actual gateway IP
    
    // Your Enphase authentication token
    // Get this from: https://entrez.enphaseenergy.com/
    // 1. Log into your Enphase account
    // 2. Go to 'API' or 'Developer' section
    // 3. Generate a new token with appropriate permissions
    authToken: 'YOUR_TOKEN_HERE', // Paste your token here
    
    // === OPTIONAL SETTINGS ===
    // How often to fetch data (in milliseconds)
    updateInterval: 30000, // 30 seconds (minimum 5 seconds recommended)
    
    // Request timeout
    timeout: 10000, // 10 seconds
    
    // ioBroker state path prefix
    statePrefix: 'javascript.0.enphase.',
    
    // Logging level: 'debug', 'info', 'warn', 'error'
    logLevel: 'info',
    
    // Features to enable/disable
    features: {
        production: true,      // Solar production data
        consumption: true,     // Home consumption data
        inverters: true,       // Individual inverter data
        systemInfo: true,      // System information
        meters: false,         // Production meters (newer firmware)
        gridProfile: false     // Grid profile settings
    }
};

// Don't forget to update the CONFIG object in the main script!`;
}

/**
 * Create example configurations for different setups
 */
function getExampleConfigs() {
    return {
        basic: {
            gatewayIP: 'envoy.local',
            authToken: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6Ik0wUkJPVUU1UVVSR1FUTXhOREl4UkVFeE5rTkJNa1JGUlRNeFJrUTFSVGN5UlVFd1FqQTNSUSJ9...',
            updateInterval: 60000, // 1 minute
            features: {
                production: true,
                consumption: false,
                inverters: false,
                systemInfo: true
            }
        },
        
        complete: {
            gatewayIP: '192.168.1.100',
            authToken: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6Ik0wUkJPVUU1UVVSR1FUTXhOREl4UkVFeE5rTkJNa1JGUlRNeFJrUTFSVGN5UlVFd1FqQTNSUSJ9...',
            updateInterval: 30000, // 30 seconds
            timeout: 15000,
            statePrefix: 'javascript.0.solar.enphase.',
            logLevel: 'debug',
            features: {
                production: true,
                consumption: true,
                inverters: true,
                systemInfo: true,
                meters: true,
                gridProfile: false
            }
        },
        
        minimal: {
            gatewayIP: 'envoy.local',
            authToken: 'YOUR_TOKEN_HERE',
            updateInterval: 120000, // 2 minutes
            features: {
                production: true,
                consumption: false,
                inverters: false,
                systemInfo: false
            }
        }
    };
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        DEFAULT_CONFIG,
        validateConfig,
        mergeConfig,
        generateConfigTemplate,
        getExampleConfigs,
        isValidIP,
        isValidToken
    };
}