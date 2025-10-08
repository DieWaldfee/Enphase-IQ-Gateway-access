# JS Directory for Enphase-IQ-Gateway-access

This folder contains JavaScript utilities and scripts used for accessing, monitoring, and interacting with the Enphase IQ Gateway. 
The scripts are designed to help users communicate with the gateway's local API, collect system data, and perform useful operations 
related to solar energy monitoring.

---

## Contents Overview

Below is a summary of notable scripts and their intended functionality:

- **enphase.js**  
  Provides the connetion to your local Enphase IQ Gateway. It fetchs eg. grid, production and consumption data, lifestream data.
  These data are gathered just local and do not need an cloud connection. Just the accesstoken is generated on the enphase website.

- **enphase_cloud.js**  
  Collects status data to all devices each hour und once at midnight the events and alarms. These data are gathered from the cloud. 
  Therfore an cloud account is needed und internet connection is mandetory. For free you are ristricted to 1000 requests each month.
  The implementation limits to 750 requests. Additional requests are implemented, but not used cause of the cost free local data from
  the IG Gateway (script above).
  
=> run both scripts if you have interest on your energy data (enphase.js) and your device status (enphase_clod.js)

---

## install the scripts

Just download the scripts an add them to your iobroker as javascript.

---

## configuration

### enphase.js


1. Create a new, empty JavaScript in ioBroker.
2. Copy the code in your Javascript.
3. Fill in your own credentials and device information in the following lines:

```javascript
let envoy_username = '';   // Enphase Enlighten Cloud username (required)
let envoy_password = '';   // Enphase Enlighten Cloud password (required)
let envoy_serial_no = '';  // 12-digit serial number of your Envoy (required)
let envoy_ip = '';         // IP address of your local Envoy (required)
```

3. Save and run – done.

#### Where to find the required information
**Username & Password:** Use your login credentials from [https://enlighten.enphaseenergy.com](https://enlighten.enphaseenergy.com)<br>
**Serial number:** In the Enphase app or web interface: under System → Devices → Gateway → SN<br>
**IP address:** From your local network (e.g. in your router’s DHCP table) or by assigning a static IP to the Envoy device<br>

(For reliable operation, make sure the IP address does not change: in your router settings, add a DHCP reservation and assign a fixed IP address to the Envoy device.)

#### optional configuration
By default, only errors are written to the log. If you need more detailed information, increase the debug level above zero:

```javascript
let debug = 0; // Debug level (0 = none, 1 = error, 2 = info, 3 = debug)
```

If you want to adjust the update rate, you can change the polling interval from the default value of 1 minute to your preference:

```javascript
let pollingInterval = 1; // polling interval in minutes (min: 1, max: 30; change as needed)
```

### enphase_cloud.js

tbd




---



## Datapoint Configuration

### enphase.js

The script automatically creates all datapoints under `0_userdata.0.enphase.` by default.
If you want to use a different path, you can adjust it with the following parameter:

```javascript
let dpPrefix = '0_userdata.0.enphase.'; // Prefix for ioBroker datapoints
```
Example:
<img width="1091" height="335" alt="grafik" src="https://github.com/user-attachments/assets/da84c156-9711-46d8-a964-1a1aaa8ea75c" />


