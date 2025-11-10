# JS Directory for Enphase-IQ-Gateway-access

This folder contains JavaScript utilities and scripts used for accessing, monitoring, and interacting with the Enphase IQ Gateway. 
The scripts are designed to help users communicate with the gateway's local API, collect system data, and perform useful operations 
related to solar energy monitoring.

---

## Contents Overview

Below is a summary of notable scripts and their intended functionality:

- **enphase_local.js**  
  Provides the connetion to your local Enphase IQ Gateway. It fetchs eg. grid, production and consumption data, lifestream data.
  These data are gathered just local and do not need an cloud connection. Just the accesstoken is generated on the enphase website.

- **enphase_cloud.js**  
  Collects status data to all devices each hour und once at midnight the events and alarms. These data are gathered from the cloud. 
  Therfore an cloud account is needed und internet connection is mandetory. For free you are ristricted to 1000 requests each month.
  The implementation limits to 750 requests. Additional requests are implemented, but not used cause of the cost free local data from
  the IG Gateway (script above). For the generation of the Accesstokens a small webserver is started to help.
  
  => run both scripts if you have interest on your energy data (enphase.js) and your device status (enphase_cloud.js)

---

## Install the scripts

Just download the scripts an add them to your iobroker as javascript.

---

## Configuration enphase_local.js

1. Create a new, empty JavaScript in ioBroker.
2. Copy the code in your Javascript.
3. start an stop the script - needed datapoints will be created.
4. Fill in your own credentials and device information in the following datapoints:

&nbsp;&nbsp;&nbsp;&nbsp;<img width="600" height="200" alt="grafik" src="https://github.com/user-attachments/assets/c39f5cf2-7631-4bd7-be2e-c4323b370531" />

5. start the script – done.

### Where to find the required information
**Username & Password:** Use your login credentials from [https://enlighten.enphaseenergy.com](https://enlighten.enphaseenergy.com)<br>
**Serial number:** In the Enphase app or web interface: under System → Devices → Gateway → SN<br>
**IP address:** From your local network (e.g. in your router’s DHCP table) or by assigning a static IP to the Envoy device<br>

(For reliable operation, make sure the IP address does not change: in your router settings, add a DHCP reservation and assign a fixed IP address to the Envoy device.)

### optional configuration
By default, only errors are written to the log. If you need more detailed information, increase the debug level above zero:

```javascript
let debug = 0; // Debug level (0 = none, 1 = error, 2 = info, 3 = debug)
```

If you want to adjust the update rate, you can change the polling interval from the default value of 1 minute to your preference.
therfore use the datapoints under `.config.local.polling` to adjust. After adjustment please restart enphase_local.js to read your adjustments.

&nbsp;&nbsp;&nbsp;&nbsp;<img width="900" height="175" alt="Image" src="https://github.com/user-attachments/assets/43ca44ab-07ca-41a3-adce-4705d9237176" />

When turning the `highPollingIntervalSec` to 10 seconds the amount of requests from this script rises over the standard limit of 1000 requests per minute an an error will be thrown.
To avoid this an adjustment in the configuration of the `javascript` adapter is nessesary:

* navigate to the instances in your ioBroker and search the javascript adapter:<br>
  ![512137152-b93920f3-13dd-4822-8ddd-0615bde61154](https://github.com/user-attachments/assets/c6f177fc-4c80-4465-a502-f72664750ea8)
* access the configuration an change the value `Maximum setState requests per Minute per Script` from 1.000 to 10.000<br>
  ![512136760-8d1bcc93-c643-4fad-9025-ab81ea18272d](https://github.com/user-attachments/assets/bcb96927-bb30-4452-8cec-65660cbbfa33)

---

## Dependencies

**enphase_local.js**:
- `node-fetch`

**enphase_cloud.js**:
- `node-fetch`
- `express`
- `open`

**enphase_summary.js**:
- nothing needed

how to check:

```console
cd /opt/iobroker/node_modules/iobroker.javascript
npm ls <modulname>
```
You will get the installed version like `└── node-fetch@3.3.2` or an error like `└── (empty)` or `npm ERR! missing: node-fetch@*,...`

how to install missing modules/libs:

```console
cd /opt/iobroker/node_modules/iobroker.javascript
npm install node-fetch --save
npm install express --save
npm install open --save
iobroker fix
```

**Why install in the subfolder?**
- The modules are installed only for the JavaScript adapter.
- This isolation prevents version conflicts with other adapters and keeps dependencies clean.

---

## Datapoint configuration enphase.js

The script automatically creates all datapoints under `0_userdata.0.enphase.` by default.
If you want to use a different path, you can adjust it with the following parameter:

```javascript
let dpPrefix = '0_userdata.0.enphase.'; // Prefix for ioBroker datapoints
```
Example:

&nbsp;&nbsp;&nbsp;&nbsp;<img width="550" height="165" alt="grafik" src="https://github.com/user-attachments/assets/da84c156-9711-46d8-a964-1a1aaa8ea75c" />

---
---
---

## Configuration enphase_cloud.js

1. Create a new, empty JavaScript in ioBroker.
2. Copy the code in your Javascript.
3. Before you start the script you need an enphase developer account. This will grant access to the cloud data.<br>
    Create an account at https://developer-v4.enphase.com/ with your credentials. These credentials you only need to log 
    on yourself on the webpage. For the communication with the enphase_cloud.js is another step needed - see below.
4. Generate an Application on  https://developer-v4.enphase.com/ <p>


&nbsp;&nbsp;&nbsp;&nbsp;<img width="700" height="75" alt="grafik" src="https://github.com/user-attachments/assets/8e480bd5-27fb-489b-9669-690075555225" />

  The free communication concept is named "Watt". More is not needed in my opinion.<br>
  You have these options:<br>

- System Details: this option is mandetory for enphase_cloud.js
- Site Level Production Monitoring: this option is actualy not needed but doesn´t hurt anyway
- Site Level Consumption Monitoring: this option is actualy not needed but doesn´t hurt anyway
- EV charging is not implementet yet, but if you need it - feel free. You do not need to develope rocket science to update the code for these endpoints.<br>

&nbsp;&nbsp;&nbsp;&nbsp;<img width="600" height="450" alt="grafik" src="https://github.com/user-attachments/assets/4f1cd0a2-8e2b-4a81-9a7c-694193693b6e" />

  After that step you get the Informations you need to configure enphase_cloud.js:<br>

&nbsp;&nbsp;&nbsp;&nbsp;<img width="800" height="400" alt="grafik" src="https://github.com/user-attachments/assets/de9287e5-6b2b-4702-b7b3-a61b0545e63b" />

5. now start the script the first time. if you have done this before - nothing damaged :-). Now all needed datapoints are generated to configure the script.<br>
   All the datapoints are located unter `0_userdata.0.enphase`.
   
&nbsp;&nbsp;&nbsp;&nbsp;<img width="550" height="55" alt="grafik" src="https://github.com/user-attachments/assets/27fa089d-51b0-46ef-ba17-5c7ffc49c71f" />
  
  If you start the script, there are some Warnings and an final error - because your credentials are missing. Stop the script and enter
  the following data in the according datapoints:
  - `API-key`: 0_userdata.0.enphase.config.cloud.credentials.Api_Key
  - `Client_ID`: 0_userdata.0.enphase.config.cloud.credentials.Client_ID
  - `Client_Secret`: 0_userdata.0.enphase.config.cloud.credentials.Client_Secret
  - `server_URI`: 0_userdata.0.enphase.config.cloud.config.server_URI <br>
  Change here hocalhost to the **IP of the ioBroker**. Otherwise the generation of the access-token will only work on the desktop of your ioBroker.
   
&nbsp;&nbsp;&nbsp;&nbsp;<img width="1653" height="506" alt="grafik" src="https://github.com/user-attachments/assets/9621a3f4-1cba-4bda-b4d8-37af639bc0d3" />

6. start the script again. It will show with a worning because of an empty access-token.

&nbsp;&nbsp;&nbsp;&nbsp;<img width="440" height="65" alt="grafik" src="https://github.com/user-attachments/assets/e93d79cf-ee5c-4c8a-a734-19bfb5a96739" />

7. open another tab on your browser with http://Your_IP_or_your_DNS_name_of_ioBroker:3080 and click on "Login with enphase".

&nbsp;&nbsp;&nbsp;&nbsp;<img width="220" height="65" alt="grafik" src="https://github.com/user-attachments/assets/3fe5e8c5-a3e4-4cf5-8368-2fd971fb1efd" />

8. enter your username and password form https://developer-v4.enphase.com/

&nbsp;&nbsp;&nbsp;&nbsp;<img width="265" height="244" alt="grafik" src="https://github.com/user-attachments/assets/9f34a06b-5d10-45d4-8616-58a8eb6acd20" />

9. press "Allow Access"

&nbsp;&nbsp;&nbsp;&nbsp;<img width="615" height="350" alt="grafik" src="https://github.com/user-attachments/assets/94b08b5e-f290-418a-b667-351c4b3cfd1e" />

10. Enphase opens the local callback-page. There automaticly the access-token and the refresh-token will be updated to the datapoints in ioBroker.

&nbsp;&nbsp;&nbsp;&nbsp;<img width="315" height="175" alt="grafik" src="https://github.com/user-attachments/assets/e3524a00-4e65-4b41-8505-90032a57869f" />

11. now restart the script to normal operation - its done. <br>

  The script automaticly downloads all visible systems - this is normaly only one. The new datapoint are below 0_userdata.0.enphase.cloud.Fetch.
  All systems_IDs are written in an array in the datapoint 0_userdata.0.enphase.cloud.systemIDs. The script will always iterate over all systems in that array. If you want to change this behavior change the array by deleting the unwanted systems from this array. if you have only one - everything is fine :-) <p>

&nbsp;&nbsp;&nbsp;&nbsp;<img width="455" height="83" alt="grafik" src="https://github.com/user-attachments/assets/d4e5aed9-3ff1-444c-87b8-55e04b0b4da5" /> <br>

&nbsp;&nbsp;&nbsp;&nbsp;<img width="550" height="135" alt="grafik" src="https://github.com/user-attachments/assets/d5081102-0af3-47bd-ab77-b638836aebbc" /> <br>

**Normal operation:**<br>
In standard all active events and alamrs will be requested at midnight each day. Hourly the request of the device status will be updated.

---

## Datapoint configuration enphase_cloud.js

All datapoints are under:

- `0_userdata.0.enphase.cloud`
- `0_userdata.0.enphase.config.cloud`

...depends on your system and components :-)


