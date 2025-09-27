# Enphase IQ Gateway Access for ioBroker

Access your Enphase IQ Gateway Local APIs with Token-Based Authentication and integrate solar production data directly into ioBroker.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![ioBroker](https://img.shields.io/badge/ioBroker-Compatible-green.svg)](https://www.iobroker.net/)

## 📋 Overview

This repository provides JavaScript scripts for ioBroker that enable direct communication with your local Enphase IQ Gateway (Envoy) to fetch real-time solar production, consumption, and inverter data. No cloud dependency required!

### ✨ Features

- 🔌 **Direct Local API Access** - Connects directly to your IQ Gateway on your local network
- 🔐 **Token-Based Authentication** - Secure authentication using Enphase tokens  
- ⚡ **Real-time Data** - Production, consumption, and inverter monitoring
- 🏠 **ioBroker Integration** - Automatic datapoint creation and updates
- 📊 **Comprehensive Monitoring** - Individual inverter tracking and system information
- 🛠 **Easy Configuration** - Simple setup with minimal configuration required
- 🔧 **Modular Design** - Multiple script options from simple to advanced
- 📝 **Extensive Logging** - Debug support and error handling

## 🚀 Quick Start

### Prerequisites

- ioBroker installation with JavaScript adapter enabled
- Enphase IQ Gateway (Envoy) on your local network
- Valid Enphase authentication token

### Basic Setup

1. **Get Your Authentication Token**
   - Visit [Enphase Enlighten](https://entrez.enphaseenergy.com/)
   - Log into your Enphase account
   - Navigate to the API or Developer section
   - Generate a new token with appropriate permissions

2. **Find Your IQ Gateway IP**
   - Check your router's device list for "Envoy" or "IQ Gateway"
   - Try accessing `http://envoy.local` in your browser
   - Note the IP address (e.g., `192.168.1.100`)

3. **Install the Script**
   - Copy the contents of `JS/enphase-simple.js` 
   - Create a new JavaScript in ioBroker
   - Paste the script and configure the settings at the top

4. **Configure the Script**
   ```javascript
   const CONFIG = {
       gatewayIP: '192.168.1.100',    // Your gateway IP
       authToken: 'YOUR_TOKEN_HERE',   // Your token
       updateInterval: 30,             // Update every 30 seconds
       // ... other settings
   };
   ```

5. **Run and Monitor**
   - Save and run the script in ioBroker
   - Check the logs for successful connection
   - View your data under `javascript.0.enphase.*`

## 📁 File Structure

```
JS/
├── enphase-simple.js      # Easy-to-use basic script
├── enphase-iq-gateway.js  # Full-featured advanced script
├── api-utils.js           # API communication utilities
└── config-helper.js       # Configuration management helpers
```

## 🔧 Configuration Options

### Basic Configuration

```javascript
const CONFIG = {
    // Required Settings
    gatewayIP: 'envoy.local',           // Gateway IP or hostname
    authToken: 'YOUR_TOKEN_HERE',       // Authentication token
    
    // Optional Settings
    updateInterval: 30,                 // Update interval in seconds
    statePrefix: 'javascript.0.enphase.', // ioBroker state prefix
    debug: false,                       // Enable debug logging
    
    // Feature Toggles
    enableProduction: true,             // Solar production data
    enableConsumption: true,            // Home consumption data
    enableInverters: true,              // Individual inverter data
    enableSystemInfo: true              // System information
};
```

### Advanced Configuration

For advanced users, the full script (`enphase-iq-gateway.js`) offers additional options:

- Custom API endpoints
- Retry logic configuration
- Multiple data sources
- Extended logging options
- Error handling customization

## 📊 Available Data Points

### Production Data
- `production.power` - Current solar production (W)
- `production.today` - Energy produced today (Wh)
- `production.lifetime` - Lifetime energy production (Wh)

### Consumption Data
- `consumption.power` - Current home consumption (W)
- `consumption.today` - Energy consumed today (Wh)
- `consumption.lifetime` - Lifetime energy consumption (Wh)

### Inverter Data
- `inverters.count` - Total number of inverters
- `inverters.active` - Number of active inverters
- `inverters.total_power` - Combined power from all inverters (W)
- `inverters.{serial}.power` - Individual inverter power (W)
- `inverters.{serial}.producing` - Individual inverter status

### System Information
- `system.type` - Device type
- `system.version` - Software version
- `system.last_update` - Last successful data fetch

## 🛠 Advanced Usage

### Using the Modular Scripts

For more control, you can use the modular approach:

```javascript
// Load the utilities
const { EnphaseAPIClient, DataProcessor } = require('./api-utils.js');
const { validateConfig, mergeConfig } = require('./config-helper.js');

// Create instances
const config = mergeConfig(yourConfig);
const apiClient = new EnphaseAPIClient(config);
const processor = new DataProcessor(config);

// Fetch and process data
const data = await apiClient.getAllData();
await processor.processAllData(data);
```

### Custom Data Processing

You can extend the data processing to add custom calculations:

```javascript
// Calculate net production (production - consumption)
const netProduction = productionPower - consumptionPower;
await updateState('calculated.net_production', netProduction, 'Net Production', 'W');

// Calculate self-consumption percentage
const selfConsumption = (consumptionPower / productionPower) * 100;
await updateState('calculated.self_consumption', selfConsumption, 'Self Consumption', '%');
```

## 🔍 Troubleshooting

### Common Issues

**Authentication Errors (401)**
- Verify your token is correct and not expired
- Check if you have the necessary permissions
- Try regenerating your token

**Connection Timeouts**
- Verify the gateway IP address
- Check if the gateway is online and accessible
- Ensure your ioBroker system can reach the gateway

**Missing Data**
- Some endpoints require newer firmware versions
- Check which APIs your gateway model supports
- Enable debug logging to see detailed error messages

### Debug Logging

Enable debug logging for detailed troubleshooting:

```javascript
const CONFIG = {
    // ... other settings
    debug: true,
    logLevel: 'debug'
};
```

### API Endpoint Support

Different IQ Gateway models and firmware versions support different endpoints:

| Endpoint | Description | Firmware Requirement |
|----------|-------------|---------------------|
| `/api/v1/production` | Production data | All versions |
| `/api/v1/consumption` | Consumption data | Most versions |
| `/api/v1/production/inverters` | Inverter data | Most versions |
| `/api/v1/production/meters` | Meter data | Newer firmware |
| `/info` | System information | All versions |

## 🤝 Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for:

- Bug fixes
- Feature enhancements  
- Documentation improvements
- Additional API endpoint support
- Error handling improvements

### Development Setup

1. Fork the repository
2. Create a feature branch
3. Test your changes with a real IQ Gateway
4. Submit a pull request with detailed description

## 📄 License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This project is not affiliated with or endorsed by Enphase Energy. Use at your own risk. The authors are not responsible for any damage or issues that may arise from using this software.

## 🆘 Support

- **Issues**: Report bugs or request features via [GitHub Issues](https://github.com/DieWaldfee/Enphase-IQ-Gateway-access/issues)
- **Discussions**: Join the discussion in [GitHub Discussions](https://github.com/DieWaldfee/Enphase-IQ-Gateway-access/discussions)
- **ioBroker Forum**: Get help from the ioBroker community

## 🙏 Acknowledgments

- Enphase Energy for providing local API access
- ioBroker community for the excellent home automation platform
- Contributors and testers who help improve this project

---

**Happy Solar Monitoring! ☀️**
