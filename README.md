# Enphase-IQ-Gateway-access

Accessing IQ Gateway Local APIs with Token-Based Authentication <br>

---

## Description

This JavaScript code enables access to the **local Enphase IQ Gateway** and stores all retrieved data in **ioBroker datapoints**.

Key points:

* An **internet connection** is required to obtain a **bearer token** from Enphase servers.
* To receive this token, you need an **Enphase Enlighten account** at:
  👉 [https://enlighten.enphaseenergy.com](https://enlighten.enphaseenergy.com)
* Using your credentials, the script will request a bearer token to authenticate access to your **local Envoy IQ Gateway**.
* Once authenticated, the script will:

  * Request all relevant datapoints
  * Store them in ioBroker datapoints
  * Update existing datapoints if present, or create new ones if missing
* A **live link** to the Enphase server is refreshed regularly to maintain up-to-date access and data synchronization.

---

## ⚠️ Disclaimer / Liability Notice

This project is provided **as-is**, without any guarantees, warranties, or liabilities.
It is a **beta project** and may contain errors, incomplete implementations, or unexpected behavior.

* **Use at your own risk.**
* The authors and contributors are **not responsible for any damage, loss of data, malfunction, or breach of service agreements** caused by using this code.
* Before using this project, you must ensure that your usage complies with **Enphase’s license agreements, API terms, and server access policies** applicable in your region.

By using this project, you acknowledge and agree that:

* You are solely responsible for compliance with Enphase’s **API and service license terms**.
* You will not hold the authors or contributors liable for any direct or indirect damages.

---

## Status of the Project

This project is currently in **beta status**.
Please carefully review your **regional license agreement** with Enphase regarding:

* Access to their servers
* Usage limitations of their API
* Restrictions on local data collection and processing

---

## Legal Notice on API and Server Usage

All rights to the **Enphase API, servers, authentication mechanisms, and data access methods** belong to **Enphase Energy, Inc.**

This project:

* **Does not grant** you any license, ownership, or rights to Enphase’s services, API, or servers.
* **Relies on Enphase’s infrastructure**, which is governed by their official terms of service and license agreements.
* May cease to function at any time if Enphase modifies or restricts API access.

You are required to review and comply with Enphase’s official terms before using this code.
Failure to comply may violate your agreement with Enphase.

---

## Installation

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

## Where to find the required information
**Username & Password:** Use your login credentials from [https://enlighten.enphaseenergy.com](https://enlighten.enphaseenergy.com)<br>
**Serial number:** In the Enphase app or web interface: under System → Devices → Gateway → SN<br>
**IP address:** From your local network (e.g. in your router’s DHCP table) or by assigning a static IP to the Envoy device<br>

(For reliable operation, make sure the IP address does not change: in your router settings, add a DHCP reservation and assign a fixed IP address to the Envoy device.)

## optional configuration
By default, only errors are written to the log. If you need more detailed information, increase the debug level above zero:

```javascript
let debug = 0; // Debug level (0 = none, 1 = error, 2 = info, 3 = debug)
```

If you want to adjust the update rate, you can change the polling interval from the default value of 1 minute to your preference:

```javascript
let pollingInterval = 1; // polling interval in minutes (min: 1, max: 30; change as needed)
```

---

### Datapoint Configuration

The script automatically creates all datapoints under `0_userdata.0.enphase.` by default.
If you want to use a different path, you can adjust it with the following parameter:

```javascript
let dpPrefix = '0_userdata.0.enphase.'; // Prefix for ioBroker datapoints
```
Example:
<img width="1091" height="335" alt="grafik" src="https://github.com/user-attachments/assets/da84c156-9711-46d8-a964-1a1aaa8ea75c" />


## Reference

* Community discussion: [https://forum.iobroker.net/topic/66908/enphase-envoy-iq-gateway-solar-blockly-skript/5](https://forum.iobroker.net/topic/66908/enphase-envoy-iq-gateway-solar-blockly-skript/5)
* Original code contributions from: **steffe-s** and **gregoj**

---
