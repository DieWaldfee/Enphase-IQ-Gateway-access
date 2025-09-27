# Setup Instructions for ioBroker Integration

This guide will help you set up the Enphase IQ Gateway integration with ioBroker step by step.

## Prerequisites Checklist

Before starting, ensure you have:

- [ ] ioBroker system with JavaScript adapter installed and enabled
- [ ] Enphase IQ Gateway (Envoy) connected to your local network
- [ ] Access to your Enphase Enlighten account
- [ ] Admin access to your router (helpful for finding gateway IP)

## Step-by-Step Setup

### Step 1: Find Your IQ Gateway IP Address

**Option A: Using Your Router**
1. Access your router's admin interface (usually http://192.168.1.1 or http://192.168.0.1)
2. Look for "Connected Devices" or "DHCP Client List"
3. Find a device named "Envoy" or similar
4. Note the IP address (e.g., 192.168.1.100)

**Option B: Try Default Hostname**
1. Open a web browser
2. Try navigating to: http://envoy.local
3. If it loads, you can use "envoy.local" as your gateway IP
4. If it shows a login page, you've found it!

**Option C: Network Scanning**
1. Use a network scanner tool like "Advanced IP Scanner"
2. Scan your local network (usually 192.168.1.0/24 or 192.168.0.0/24)
3. Look for devices with open ports 80 or 443
4. Check each IP in your browser to find the Envoy interface

### Step 2: Get Your Authentication Token

1. **Visit Enphase Developer Portal**
   - Go to [https://entrez.enphaseenergy.com/](https://entrez.enphaseenergy.com/)
   - If redirected, look for "API" or "Developer" section

2. **Login to Your Account**
   - Use your regular Enphase account credentials
   - This is the same account you use for the Enphase mobile app

3. **Create API Application** (if required)
   - Some portals require creating an "application" first
   - Use any name like "ioBroker Integration"
   - Description: "Local ioBroker integration for solar monitoring"

4. **Generate Token**
   - Look for "Generate Token", "Create Token", or "New API Key"
   - Select appropriate permissions:
     - ✅ Read production data
     - ✅ Read consumption data
     - ✅ Read system information
   - Copy the generated token (long string starting with "eyJ" or similar)

5. **Save Your Token**
   - ⚠️ **Important**: Save this token securely
   - You may not be able to view it again later
   - Consider storing it in a password manager

### Step 3: Prepare ioBroker

1. **Enable JavaScript Adapter**
   - Go to "Adapters" in ioBroker admin
   - Find "JavaScript" adapter
   - Install and enable it if not already done
   - Make sure at least one instance is running

2. **Access JavaScript Scripts**
   - Go to "Scripts" in ioBroker admin
   - You should see the JavaScript adapter listed

### Step 4: Install the Script

1. **Choose Your Script**
   - For beginners: Use `enphase-simple.js`
   - For advanced users: Use `enphase-iq-gateway.js`

2. **Create New Script**
   - In ioBroker Scripts, click "+" to add new script
   - Name it something like "Enphase Solar Monitor"
   - Choose JavaScript as the engine

3. **Copy Script Content**
   - Open the chosen script file from this repository
   - Copy all content (Ctrl+A, Ctrl+C)
   - Paste into the ioBroker script editor

### Step 5: Configure the Script

1. **Find Configuration Section**
   - Look for the `CONFIG` object at the top of the script
   - It will look like this:
   ```javascript
   const CONFIG = {
       gatewayIP: 'envoy.local',
       authToken: 'YOUR_TOKEN_HERE',
       // ... other settings
   };
   ```

2. **Update Required Settings**
   ```javascript
   const CONFIG = {
       gatewayIP: '192.168.1.100', // Your gateway IP from Step 1
       authToken: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6...', // Your token from Step 2
       updateInterval: 30, // Update every 30 seconds
       // ... keep other settings as default for now
   };
   ```

3. **Optional: Customize Other Settings**
   - `updateInterval`: How often to fetch data (seconds, minimum 5)
   - `enableProduction`: Set to `false` if you don't want production data
   - `enableConsumption`: Set to `false` if you don't want consumption data
   - `enableInverters`: Set to `false` if you don't want individual inverter data
   - `debug`: Set to `true` for troubleshooting

### Step 6: Test the Script

1. **Save and Run**
   - Save the script in ioBroker
   - Click the "Run" or "Start" button
   - The script should start automatically

2. **Check Logs**
   - Look at the JavaScript adapter logs
   - You should see messages like:
     - "Starting Enphase IQ Gateway monitoring..."
     - "Production: 2500W (15000Wh today)"
     - "Monitoring started successfully"

3. **Verify Data Points**
   - Go to "Objects" in ioBroker admin
   - Look for objects starting with `javascript.0.enphase.`
   - You should see data points like:
     - `javascript.0.enphase.production.power`
     - `javascript.0.enphase.consumption.power`
     - `javascript.0.enphase.inverters.count`

### Step 7: Monitor and Verify

1. **Check Data Updates**
   - Watch the data points for a few minutes
   - Values should update according to your `updateInterval`
   - Production should change based on sunlight conditions

2. **Verify Accuracy**
   - Compare values with your Enphase mobile app
   - Check against the Envoy web interface (http://your-gateway-ip)
   - Values should match closely (small delays are normal)

## Troubleshooting Common Issues

### Authentication Errors (401)

**Problem**: Logs show "Authentication failed" or "HTTP 401" errors

**Solutions**:
1. Double-check your authentication token
2. Regenerate a new token from Enphase portal
3. Ensure token has correct permissions
4. Check if token has expired

### Connection Timeouts

**Problem**: Logs show "Request timeout" or connection errors

**Solutions**:
1. Verify gateway IP address is correct
2. Ping the gateway: `ping 192.168.1.100`
3. Try accessing gateway in web browser
4. Check if gateway is online and responsive
5. Increase timeout value in configuration

### Missing Data Points

**Problem**: Some data points are not created or always show 0

**Solutions**:
1. Check if your gateway model supports all features
2. Try enabling debug logging to see detailed errors
3. Some features require newer firmware versions
4. Consumption data requires CT sensors to be installed

### Script Stops Working

**Problem**: Script runs initially but stops updating

**Solutions**:
1. Check ioBroker JavaScript adapter status
2. Look for error messages in logs
3. Restart the JavaScript adapter
4. Check for system resource issues
5. Consider reducing update frequency

### Performance Issues

**Problem**: ioBroker becomes slow or unresponsive

**Solutions**:
1. Increase update interval (reduce frequency)
2. Disable unused features (inverters, system info)
3. Check system resources (CPU, memory)
4. Reduce debug logging

## Advanced Configuration

### Custom State Paths

You can change where data points are created:

```javascript
statePrefix: 'javascript.0.solar.enphase.', // Custom path
```

### Selective Feature Enabling

Disable features you don't need to improve performance:

```javascript
enableProduction: true,    // Keep production data
enableConsumption: false,  // Disable if no consumption monitoring
enableInverters: false,    // Disable for better performance
enableSystemInfo: false,   // Only needed occasionally
```

### Debug Logging

Enable detailed logging for troubleshooting:

```javascript
debug: true, // Enables detailed logging
```

## Data Point Reference

### Production Data
- `production.power` - Current solar production (Watts)
- `production.today` - Energy produced today (Watt-hours)
- `production.lifetime` - Total lifetime energy production (Watt-hours)

### Consumption Data (if available)
- `consumption.power` - Current home consumption (Watts)
- `consumption.today` - Energy consumed today (Watt-hours)
- `consumption.lifetime` - Total lifetime energy consumption (Watt-hours)

### Inverter Data (if enabled)
- `inverters.count` - Total number of inverters
- `inverters.active` - Number of currently producing inverters
- `inverters.total_power` - Combined power from all inverters (Watts)
- `inverters.{serial}.power` - Power from specific inverter (Watts)
- `inverters.{serial}.producing` - Whether specific inverter is producing (1/0)

### System Information
- `system.type` - Gateway device type
- `system.version` - Gateway software version
- `system.last_update` - Timestamp of last successful data fetch

## Getting Help

If you encounter issues not covered in this guide:

1. **Enable Debug Logging**
   - Set `debug: true` in configuration
   - Restart the script
   - Check logs for detailed error messages

2. **Check Community Resources**
   - ioBroker forum discussions
   - GitHub issues on this repository
   - Enphase community forums

3. **Report Issues**
   - Create a detailed issue on GitHub
   - Include your configuration (without token!)
   - Include relevant log messages
   - Specify your gateway model and firmware version

## Success Indicators

You'll know the integration is working correctly when:

- ✅ Script starts without errors
- ✅ Data points are created automatically
- ✅ Values update regularly (every 30 seconds by default)
- ✅ Production values change based on sunlight
- ✅ Data matches your Enphase app (within reasonable tolerance)
- ✅ No authentication or connection errors in logs

**Congratulations! Your Enphase IQ Gateway is now integrated with ioBroker! ☀️**