/**
 * Example Configuration for Enphase IQ Gateway Integration
 * 
 * Copy this file and modify the values according to your setup.
 * Then use the configuration in your ioBroker JavaScript.
 */

// BASIC CONFIGURATION - Most users only need to change these values
const BASIC_CONFIG = {
    // REQUIRED: Your IQ Gateway IP address
    // Find this in your router or try 'envoy.local'
    gatewayIP: '192.168.1.100', // CHANGE THIS
    
    // REQUIRED: Your Enphase authentication token
    // Get from: https://entrez.enphaseenergy.com/
    authToken: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6Ik0wUkJPVUU1UVVSR1FUTXhOREl4UkVFeE5rTkJNa1JGUlRNeFJrUTFSVGN5UlVFd1FqQTNSUSJ9...', // CHANGE THIS
    
    // How often to update (seconds) - minimum 5 seconds recommended
    updateInterval: 30,
    
    // What data to collect
    enableProduction: true,    // Solar production data
    enableConsumption: true,   // Home consumption data
    enableInverters: true,     // Individual inverter data
    enableSystemInfo: true,    // Gateway system info
    
    // ioBroker settings
    statePrefix: 'javascript.0.enphase.',
    debug: false // Set to true for troubleshooting
};

// ADVANCED CONFIGURATION - For experienced users
const ADVANCED_CONFIG = {
    // Network settings
    gatewayIP: '192.168.1.100',
    timeout: 15000, // Request timeout in milliseconds
    
    // Authentication
    authToken: 'your-token-here',
    
    // API endpoints (usually don't need to change these)
    endpoints: {
        production: '/api/v1/production',
        consumption: '/api/v1/consumption',
        inventory: '/api/v1/production/inverters',
        info: '/info',
        meters: '/api/v1/production/meters', // Requires newer firmware
        gridProfile: '/api/v1/grid_profile'  // Advanced feature
    },
    
    // Update settings
    updateInterval: 30000, // 30 seconds in milliseconds
    retryDelay: 5000,      // Retry delay on error
    maxRetries: 3,         // Maximum retry attempts
    
    // ioBroker settings
    statePrefix: 'javascript.0.solar.enphase.',
    createStates: true,
    logLevel: 'info', // 'debug', 'info', 'warn', 'error'
    
    // Feature toggles
    features: {
        production: true,
        consumption: true,
        inverters: true,
        systemInfo: true,
        meters: false,      // Enable if your gateway supports it
        gridProfile: false  // Advanced users only
    }
};

// EXAMPLE CONFIGURATIONS FOR DIFFERENT SETUPS

// Minimal setup - Production data only
const MINIMAL_CONFIG = {
    gatewayIP: 'envoy.local',
    authToken: 'your-token-here',
    updateInterval: 60, // 1 minute
    enableProduction: true,
    enableConsumption: false,
    enableInverters: false,
    enableSystemInfo: false,
    debug: false
};

// Complete monitoring setup
const COMPLETE_CONFIG = {
    gatewayIP: '192.168.1.100',
    authToken: 'your-token-here',
    updateInterval: 15, // 15 seconds for more frequent updates
    enableProduction: true,
    enableConsumption: true,
    enableInverters: true,
    enableSystemInfo: true,
    statePrefix: 'javascript.0.solar.enphase.',
    debug: true // Enable for detailed logging
};

// Troubleshooting configuration
const DEBUG_CONFIG = {
    gatewayIP: '192.168.1.100',
    authToken: 'your-token-here',
    updateInterval: 60, // Slower updates while debugging
    enableProduction: true,
    enableConsumption: true,
    enableInverters: true,
    enableSystemInfo: true,
    debug: true, // Detailed logging
    timeout: 20000, // Longer timeout
    maxRetries: 5 // More retry attempts
};

// HOW TO GET YOUR AUTHENTICATION TOKEN:
// 
// 1. Visit https://entrez.enphaseenergy.com/
// 2. Log into your Enphase account
// 3. Go to the API or Developer section
// 4. Create a new application or API key
// 5. Generate a token with the following permissions:
//    - Read access to production data
//    - Read access to consumption data (if available)
//    - Read access to system information
// 6. Copy the generated token (it will be a long string)
// 7. Paste it in the authToken field above
//
// Note: Tokens may expire and need to be renewed periodically.

// HOW TO FIND YOUR GATEWAY IP:
//
// Method 1: Router Admin Panel
// - Log into your router's admin interface
// - Look for connected devices
// - Find device named "Envoy" or "IQ Gateway"
// - Note the IP address
//
// Method 2: Network Scan
// - Use network scanner like "Advanced IP Scanner" or "nmap"
// - Look for devices on port 80 or 443
// - Try accessing found IPs in browser
//
// Method 3: Try Default Hostnames
// - Try http://envoy.local in your browser
// - Try http://envoy in your browser
//
// Method 4: Enphase App
// - Some versions of the Enphase app show the gateway IP

// TROUBLESHOOTING TIPS:
//
// 1. Authentication Issues (401 errors):
//    - Check if your token is correct
//    - Verify token hasn't expired
//    - Ensure you have necessary permissions
//
// 2. Connection Issues:
//    - Verify gateway IP is correct
//    - Check if gateway is online (ping test)
//    - Ensure ioBroker can access local network
//    - Try increasing timeout value
//
// 3. Missing Data:
//    - Some features require newer gateway firmware
//    - Not all gateway models support all APIs
//    - Check logs for specific error messages
//
// 4. Performance Issues:
//    - Don't set update interval too low (minimum 5 seconds)
//    - Monitor system resources
//    - Consider disabling unused features

// Export the configuration you want to use
// Uncomment the line for your preferred configuration:

// module.exports = BASIC_CONFIG;
// module.exports = ADVANCED_CONFIG;
// module.exports = MINIMAL_CONFIG;
// module.exports = COMPLETE_CONFIG;
// module.exports = DEBUG_CONFIG;