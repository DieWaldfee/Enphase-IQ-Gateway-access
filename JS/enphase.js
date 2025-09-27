// -------------------------------------------------------------------------------------------------------------------
// reference: https://forum.iobroker.net/topic/66908/enphase-envoy-iq-gateway-solar-blockly-skript/10?_=1757761762260
// thanks to gregj for the basic development and steffe-s for the further development
// this script transfers the blockly implementation into plain javascript
// -------------------------------------------------------------------------------------------------------------------
// This script reads the data from an Enphase Envoy IQ Gateway and writes it to the corresponding states in ioBroker
// -------------------------------------------------------------------------------------------------------------------
// Prerequisites:
// - An Enphase Envoy IQ Gateway
// - An ioBroker installation with the adapter "javascript" and "http"
// - The http adapter must be configured to allow requests to the Envoy IP address
// - The Envoy must be reachable from the ioBroker host (ping test)
// - The Envoy must be configured to allow requests from the ioBroker host (see Envoy documentation)
// -------------------------------------------------------------------------------------------------------------------
// Configuration:
// - Set the IP address of the Envoy in the variable "envoyIP"
// - Set the polling interval in minutes in the variable "pollingInterval"
// -------------------------------------------------------------------------------------------------------------------
// Version 0.0.1 - initial version by greoj
// Version 0.0.2 - lifedata added by steffe-s
// Version ... - further developement by steffe-s
// Version 0.1.0 - complete transfer into plain javascript by Matthias Rauchschwalbe
// -------------------------------------------------------------------------------------------------------------------
// Note: extracted values are in milliWatt (1/1000 W), so a value of 1000 equals 1 Watt

// Import required modules
const fetch = require('node-fetch');
const querystring = require('querystring');
const https = require('https');

// -------------------------------------------------------------------------------------------------------------------
// user configurable variables :: please adjust to your needs
// -------------------------------------------------------------------------------------------------------------------
// ENPHASE ENVOY/IQ GATEWAY LOADER Requires >=v7 of Envoy API (i.e. current token authentication method)
// *** USER INPUT ***
let debug = 0; // Debug level (0=none, 1=error, 2=info, 3=debug)

let envoy_username = ''; // Add your Enphase Enlighten Cloud username (mandatory)
let envoy_password = ''; // Add your Enphase Enlighten Cloud password (mandatory)

let envoy_serial_no = ''; // Add serial no (12 digit) and IP of local Envoy (mandatory)
let envoy_ip = ''; // Add IP of local Envoy (mandatory)

let bearer_token = ''; // Add existing Envoy token (optional, default='')
// OPTIONAL: Add your existing Envoy token below (e.g. for testing purposes)
// (Note: If you fill in your token here then automatic token renewal with envoy username/password is disabled)
let pollingInterval = 1; // Polling interval in minutes (min: 1, max: 60; change as needed)

// -------------------------------------------------------------------------------------------------------------------
// initialization of variables
// -------------------------------------------------------------------------------------------------------------------
let error_cnt = 0; // Counts errors to slow down polling in case of errors
let http_resp_json = ''; // Variable to hold the JSON response from the Envoy
let ivp_prod = '/ivp/meters/reports/production'; // URL path to get production data from local Envoy
let ivp_cons = '/ivp/meters/reports/consumption'; // URL path to get consumption data from local Envoy
let ivp_read = '/ivp/meters/readings'; // URL path to get meter readings from local Envoy
let ivp_inverters = '/api/v1/production/inverters'; // URL path to get inverter data from local Envoy
let ivp_inventory = '/ivp/ensemble/inventory'; // URL path to get inventory data from local Envoy
let ivp_livedata = '/ivp/livedata/status'; // URL path to get livedata from local Envoy
let ivp_livedata_stream = '/ivp/livedata/stream'; // URL path to get livedata stream from local Envoy
let dpPrefix = '0_userdata.0.enphase.'; // Prefix for ioBroker datapoints
let ivp_production = '/production.json'; // URL path to get production data from local Envoy
//                                                      (old URL, but includes "day" counter "whToday")

// -------------------------------------------------------------------------------------------------------------------
// end this script if a mandatory variable is not set
// -------------------------------------------------------------------------------------------------------------------
function isValidIPv4(ip) {
   // Check if the IP address has valid format
   return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && ip.split('.').every((num) => Number(num) >= 0 && Number(num) <= 255);
}
function stopMyScript() {
   // Stop the script and clear schedules
   try {
      clearSchedule(tokenRenewalSchedule);
   } catch (error) {}
   try {
      clearSchedule(cyclicSchedule);
   } catch (error) {}
   stopScript(); // stop script
}

if (envoy_username === null || envoy_username === undefined || envoy_username === '') {
   console.error('⚠️ variable envoy_username not set – script stopped');
   console.log('Please set the variable envoy_username to your Enphase Enlighten Cloud username.');
   stopMyScript(); // stop script
   return; // prevent further execution (parallel call of schedules)
}
if (envoy_password === null || envoy_password === undefined || envoy_password === '') {
   console.error('⚠️ variable envoy_password not set – script stopped');
   console.log('Please set the variable envoy_password to your Enphase Enlighten Cloud password.');
   stopMyScript(); // stop script
   return; // prevent further execution (parallel call of schedules)
}
if (envoy_serial_no === null || envoy_serial_no === undefined || envoy_serial_no === '') {
   console.error('⚠️ variable envoy_serial_no not set – script stopped');
   console.log('Please set the variable envoy_serial_no to the serial number of your Envoy device.');
   stopMyScript(); // stop script
   return; // prevent further execution (parallel call of schedules)
}
if (!/^\d{12}$/.test(envoy_serial_no)) {
   //check, if exactly 12 digits
   console.error('⚠️ envoy_serial_no must be exactly 12 digits – script stopped');
   console.log(
      'Please check the variable envoy_serial_no. It must contain exactly 12 digits (no letters, no special characters).'
   );
   stopMyScript(); // stop script
   return; // prevent further execution (parallel call of schedules)
}
if (envoy_ip === null || envoy_ip === undefined || envoy_ip === '') {
   console.error('⚠️ variable envoy_ip not set – script stopped');
   console.log('Please set the variable envoy_ip to the IP address of your Envoy device.');
   stopMyScript(); // stop script
   return; // prevent further execution (parallel call of schedules)
}
if (!isValidIPv4(envoy_ip)) {
   console.error('⚠️ envoy_ip is not a valid IPv4 address – script stopped');
   console.log('Please check the variable envoy_ip. It must contain a valid IPv4 address (e.g. 192.168.1.1)');
   stopMyScript(); // stop script
   return; // prevent further execution (parallel call of schedules)
}
if (debug > 0) console.log('All mandatory variables are set. Proceeding...');

// -------------------------------------------------------------------------------------------------------------------
// get bearer token
// -------------------------------------------------------------------------------------------------------------------
// Check if initial Envoy bearer token needs to be requested from Enphase server
if (bearer_token == '') {
   bearer_token = await renewEnvoyToken(envoy_username, envoy_password, envoy_serial_no, debug);
}

// -------------------------------------------------------------------------------------------------------------------
// basic function: renewEnvoyToken
// -------------------------------------------------------------------------------------------------------------------
// Requests a new Enphase bearer token from the Enphase cloud.
// -------------------------------------------------------------------------------------------------------------------
/** Parameters:
 * @param {string} envoy_username - Enphase Enlighten Cloud username.
 * @param {string} envoy_password - Enphase Enlighten Cloud password.
 * @param {string} envoy_serial_no - Serial number of the local Envoy device.
 * @param {number} debug - Debug level (0=none, 1=info, 2=advanced, 3=debug).
 * @returns {Promise<string>} - Returns a promise that resolves to the bearer token string.
 */
// -------------------------------------------------------------------------------------------------------------------
async function renewEnvoyToken(envoy_username, envoy_password, envoy_serial_no, debug = 0) {
   // Login-Anfrage
   const loginData = querystring.stringify({
      'user[email]': envoy_username,
      'user[password]': envoy_password,
   });

   if (debug > 0) console.log('Renew token. 1. Login to enlighten.enphaseenergy.com to get session_id...');

   try {
      const loginResponse = await fetch('https://enlighten.enphaseenergy.com/login/login.json', {
         method: 'POST',
         body: loginData,
         headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
         },
      });
      const responseData = await loginResponse.json();
      if (debug > 1) console.log('Response from login: ' + JSON.stringify(responseData));

      // Token-Anfrage
      const tokenData = {
         session_id: responseData.session_id,
         serial_num: envoy_serial_no,
         username: envoy_username,
      };
      // Check for invalid login
      if (responseData.message === 'Invalid') throw new Error('Invalid username or password');
      if (debug > 1) console.log('Login successful. Session ID: ' + responseData.session_id);
      if (debug > 2) console.log('Proceeding to token request with data: ' + JSON.stringify(tokenData));

      if (debug > 0) console.log('2. Login to entrez.enphaseenergy.com to get new token...');
      const tokenResponse = await fetch('https://entrez.enphaseenergy.com/tokens', {
         method: 'POST',
         body: JSON.stringify(tokenData),
         headers: {
            'Content-Type': 'application/json',
         },
      });
      const tokenRaw = await tokenResponse.text();
      if (debug > 1) console.log('New token: ' + tokenRaw);
      return tokenRaw;
   } catch (error) {
      console.error('Error token renewal: ' + error.message);
      return '';
   }
}

// -------------------------------------------------------------------------------------------------------------------
// basic function: IObSetState
// -------------------------------------------------------------------------------------------------------------------
// Create new or update existing states in IOBroker according to the JSON structure received from local
// Envoy URL (function 'GetEnvoyData).In case of a unix timestamp field this function will create an
// additional IOBroker state to show the unix time in human readable format. The field name of this
// additional field is built from 'fieldname' followed by '_str' (e.g. 'fieldname_str'). The 'id' parameter
// specifies the tree hierarchy in IOBroker e.g. '0_userdata.0.enphase.consumption' in which PV data will
// be populated.
// Note: This function is called by the cyclic program loop below.
// -------------------------------------------------------------------------------------------------------------------
/** Parameters:
 * @param {string} id - ioBroker tree path to insert/update the Envoy information.
 * @param {object} obj - JSON object received from local Envoy URL.
 * @param {number} [debug=0] - Debug level (0=none, 1=info, 2=advanced, 3=debug).
 * @returns {Promise<void>} - Resolves when all states have been set or created.
 */
async function IObSetState(id, obj, debug = 0) {
   if (debug > 2) console.log('IObSetState called with id: ' + id + ' and obj: ' + JSON.stringify(obj));
   // Loop through all attributes of the given object
   for (const i of Object.keys(obj)) {
      const value = obj[i]; // Get value of current attribute
      const attr = i.replace(/[^a-zA-Z0-9._-]+/g, ''); // Clean attribute name to avoid issues in IOBroker

      if (typeof value == 'object') {
         // Nested object -> recursive call of IObSetState
         if (debug > 2)
            console.log('Nested object found for attribute: ' + attr + ' with value: ' + JSON.stringify(value));
         await IObSetState(id + '.' + attr, value, debug);
      } else {
         // Primitive value (string, number, date) -> create or update state in IOBroker
         if (existsState(id + '.' + attr)) {
            // Existing object => Update
            if (typeof value === 'string' || value instanceof String) {
               // value is a string
               if (debug > 1) console.log('Updating string state: ' + id + '.' + attr + ' with value: ' + value);
               setState(id + '.' + attr, value, true);
            } else {
               // It is a number or date
               if (new Date(value).getTime() > 0 && Number(value) > 1685000000 && Number(value) < 4100000000) {
                  // value is a date
                  if (debug > 1) console.log('Updating date state: ' + id + '.' + attr + ' with value: ' + value);
                  if (debug > 2)
                     console.log(
                        'Updating additional human readable date state: ' +
                           id +
                           '.' +
                           attr +
                           '_str with value: ' +
                           formatDate(value, 'TT.MM.JJJJ SS:mm:ss')
                     );
                  setState(id + '.' + attr, value, true); // unix timestamp
                  setState(id + '.' + attr + '_str', formatDate(value, 'TT.MM.JJJJ SS:mm:ss'), true); // human readable date
               } else {
                  // value is a number
                  if (debug > 1) console.log('Updating number state: ' + id + '.' + attr + ' with value: ' + value);
                  setState(id + '.' + attr, Number(value), true);
               }
            }
         } else {
            // New object => create
            if (typeof value === 'string' || value instanceof String) {
               // value is a string
               if (debug > 1) console.log('Creating string state: ' + id + '.' + attr + ' with value: ' + value);
               createState(id + '.' + attr, value, false, { type: 'string', read: true, write: true });
            } else {
               // It is a number or date
               if (new Date(value).getTime() > 0 && Number(value) > 1685000000 && Number(value) < 4100000000) {
                  // value is a date
                  if (debug > 1) console.log('Creating date state: ' + id + '.' + attr + ' with value: ' + value);
                  if (debug > 2)
                     console.log(
                        'Creating additional human readable date state: ' +
                           id +
                           '.' +
                           attr +
                           '_str with value: ' +
                           formatDate(value, 'TT.MM.JJJJ SS:mm:ss')
                     );
                  createState(id + '.' + attr, value, false, { type: 'number', read: true, write: true });
                  createState(id + '.' + attr + '_str', formatDate(value, 'TT.MM.JJJJ SS:mm:ss'), false, {
                     type: 'string',
                     read: true,
                     write: true,
                  });
               } else {
                  // value is a number
                  if (debug > 1) console.log('Creating number state: ' + id + '.' + attr + ' with value: ' + value);
                  createState(id + '.' + attr, value, false, { type: 'number', read: true, write: true }); // type set to 'number'; change to 'mixed' if mixed types are expected
               }
            }
         }
      }
   }
}

// -------------------------------------------------------------------------------------------------------------------
// basic funktion: GetEnvoyData
// -------------------------------------------------------------------------------------------------------------------
// Fetch PV data from your local Envoy. The JSON response of the given URL will then update (or create
// if not existing) the corresponding states in IOBroker (via function IObSetState)
/**
// Set up HTTPS request options for local Envoy
// @param {string} envoy_ip - The IP address of the Envoy device.
// @param {string} envoy_path - The API path to query on the Envoy device.
// @param {string} bearer_token - The bearer token for authentication.
// @param {string} log_msg - Message to log for this request.
// @param {number} [debug=0] - Debug level (0=none, 1=info, 2=advanced, 3=debug).
// @returns {Promise<boolean>} - Resolves to true if data was fetched and processed successfully, false otherwise.
*/
// Helper function to wrap https.request GET
function httpsRequestAsyncGet(options) {
   return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
         let data = '';
         res.on('data', (chunk) => {
            data += chunk;
         });
         res.on('end', () => {
            resolve(data);
         });
      });
      req.on('error', (error) => {
         reject(error);
      });
      req.end();
   });
}
// Helper function to wrap https.request POST
function httpsRequestAsyncPost(options) {
   return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
         let data = '';
         res.on('data', (chunk) => {
            data += chunk;
         });
         res.on('end', () => {
            resolve(data);
         });
      });
      req.write(JSON.stringify({ enable: 1 }));
      req.on('error', (error) => {
         reject(error);
      });
      req.end();
   });
}
// get envoy data from local envoy
async function GetEnvoyData(envoy_ip, envoy_path, bearer_token, log_msg, debug = 0) {
   // Set up HTTPS request options for local Envoy
   const options = {
      hostname: envoy_ip,
      port: 443,
      path: envoy_path,
      method: 'GET',
      rejectUnauthorized: false, // Ignore invalid certificate
      headers: { Authorization: `Bearer ${bearer_token}` },
   };

   if (debug > 0) console.log(log_msg + '...started');
   if (debug > 1) console.log('Query local Envoy IP: ' + envoy_ip + ' ...process started');
   let jsonData;
   try {
      const response = await httpsRequestAsyncGet(options);
      if (debug > 1) console.log('Query local Envoy IP: ' + envoy_ip);
      if (debug > 2) console.log('Response from local Envoy: ' + response);
      jsonData = JSON.parse(response);
   } catch (error) {
      // Error handling for request failure or JSON parsing error -> stop script here
      throw new Error('Error local Envoy IP: ' + envoy_ip + '. Error: ' + error.message);
   }

   try {
      http_resp_json = JSON.stringify(jsonData, null, 2);
      error_cnt -= 1;
      if (debug > 2) console.log('JSON data to be processed: ' + JSON.stringify(jsonData));
      if (debug > 1) console.log(log_msg + 'ok');
      return true;
   } catch (error) {
      error_cnt += 1;
      console.error(log_msg + error.message + ' | Error cnt: ' + String(error_cnt));
      return false;
   }
}
//get lifedata stream from local envoy
async function PostEnvoyData(envoy_ip, envoy_path, bearer_token, log_msg, debug = 0) {
   // Set up HTTPS request options for local Envoy
   const options = {
      hostname: envoy_ip,
      port: 443,
      path: envoy_path,
      method: 'POST',
      rejectUnauthorized: false, // Ignore invalid certificate
      headers: { Authorization: `Bearer ${bearer_token}` },
   };

   if (debug > 0) console.log(log_msg + '...started');
   if (debug > 1) console.log('Query local Envoy IP: ' + envoy_ip + ' ...process started');
   let jsonData;
   try {
      const response = await httpsRequestAsyncPost(options);
      if (debug > 1) console.log('Query local Envoy IP: ' + envoy_ip);
      if (debug > 2) console.log('Response from local Envoy: ' + response);
      jsonData = JSON.parse(response);
   } catch (error) {
      // Error handling for request failure or JSON parsing error -> stop script here
      throw new Error('Error local Envoy IP: ' + envoy_ip + '. Error: ' + error.message);
   }

   try {
      http_resp_json = JSON.stringify(jsonData, null, 2);
      error_cnt -= 1;
      if (debug > 2) console.log('JSON data to be processed: ' + JSON.stringify(jsonData));
      if (debug > 1) console.log(log_msg + 'ok');
      return true;
   } catch (error) {
      error_cnt += 1;
      console.error(log_msg + ': ' + error.message + ' | Error cnt: ' + String(error_cnt));
      return false;
   }
}

// -------------------------------------------------------------------------------------------------------------------
// cyclic program loop
// -------------------------------------------------------------------------------------------------------------------
// This section sets up a scheduled cyclic loop to periodically fetch photovoltaic (PV) data from the
// local Envoy device. The loop runs at a configurable interval and attempts to retrieve multiple types
// of data (production, consumption, meter readings, etc.). If errors occur during data retrieval, the
// error count is incremented and polling is slowed down to avoid repeated failures. The loop also updates
// or creates corresponding states in ioBroker for each data type fetched.
// -------------------------------------------------------------------------------------------------------------------
// Ensure pollingInterval stays within bounds
if (pollingInterval < 1) pollingInterval = 1;
if (pollingInterval > 30) pollingInterval = 30;
let pollingCron = `*/${pollingInterval} * * * *`;
/**
 * Safely parses a JSON string and returns an object, or an empty object on error.
 * @param {string} jsonStr
 * @returns {object}
 */
function safeParseJSON(jsonStr) {
   try {
      return JSON.parse(jsonStr);
   } catch (e) {
      return {};
   }
}
// Main cyclic program loop
const cyclicSchedule = schedule(pollingCron, async () => {
   try {
      if (error_cnt <= 0) {
         if (debug > 0) console.log('Cyclic polling started. Polling interval: ' + pollingInterval + ' minutes');
         if (debug > 2) console.log('Current error count: ' + error_cnt);
         if (debug > 1) console.log('Fetching data from local Envoy IP: ' + envoy_ip + ' ...process started');
         // Reset error count before starting new polling cycle
         // Variable 'error_cnt' counts Envoy errors to slow down polling in case of errors
         error_cnt = 0;
         // 1. Get PV METER PRODUCTION
         if (await GetEnvoyData(envoy_ip, ivp_prod, bearer_token, 'Get Prod. data: ', debug)) {
            if (debug > 1) console.log('Processing production data...');
            const prodData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'production', prodData);
         }
         // 2. Get PV METER CONSUMPTION
         if (await GetEnvoyData(envoy_ip, ivp_cons, bearer_token, 'Get Cons. data: ', debug)) {
            if (debug > 1) console.log('Processing consumption data...');
            const consData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'consumption', consData);
         }
         // 3. Get PV METER READINGS
         if (await GetEnvoyData(envoy_ip, ivp_read, bearer_token, 'Get Meter data: ', debug)) {
            if (debug > 1) console.log('Processing meter readings data...');
            const meterData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'meters', meterData);
         }
         // 4. Get PV PRODUCTION.JSON
         if (await GetEnvoyData(envoy_ip, ivp_production, bearer_token, 'Get production.json data: ', debug)) {
            if (debug > 1) console.log('Processing production.json data...');
            // Note: This URL is deprecated but still includes the "whToday" counter
            // which is not included in the new "/ivp/meters/reports/production" URL
            const prodStatData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'prod_stat', prodStatData);
         }
         // 5. Get PV MICRO INVERTER
         if (await GetEnvoyData(envoy_ip, ivp_inverters, bearer_token, 'Get Inv. data : ', debug)) {
            if (debug > 1) console.log('Processing inverter data...');
            const inverterData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'inverter', inverterData);
         }
         // 6. Get PV INVENTORY
         if (await GetEnvoyData(envoy_ip, ivp_inventory, bearer_token, 'Get INVENTORY data : ', debug)) {
            if (debug > 1) console.log('Processing inventory data...');
            const inventoryData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'inventory', inventoryData);
         }
         // 7. Get PV LIVEDATA
         if (await GetEnvoyData(envoy_ip, ivp_livedata, bearer_token, 'Get LIVEDATA data : ', debug)) {
            if (debug > 1) console.log('Processing livedata data...');
            const livedataData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'livedata', livedataData);
         }
         // 8. Get PV LIVEDATA STREAM STATUS update
         if (existsState(dpPrefix + 'livedata.connection.sc_stream') &&
             getState(dpPrefix + 'livedata.connection.sc_stream').val == 'disabled') {
            // Start SC stream after disconnect
            if (debug > 0) console.log('SC stream is disabled. Attempting to enable it...');
            await PostEnvoyData(envoy_ip, ivp_livedata_stream, bearer_token, 'POST sc_stream data: ', debug);
         }
      } else {
         // Slow down polling in case of errors
         console.log('Previous errors detected - skipping cycle. Error count: ' + error_cnt);
         error_cnt = typeof error_cnt === 'number' ? error_cnt : 0;
         error_cnt -= 1;
      }
   } catch (err) {
      console.error('Error in scheduled polling loop:' + err.message);
   }
});

// -------------------------------------------------------------------------------------------------------------------
// automatic token renewal
// -------------------------------------------------------------------------------------------------------------------
// Periodic token renewal. Default: Daily at midnight. Adjust as needed.
// -------------------------------------------------------------------------------------------------------------------
const tokenRenewalSchedule = schedule('0 0 * * *', async () => {
   if (debug > 0) console.log('Automatic token renewal started...');
   bearer_token = await renewEnvoyToken(envoy_username, envoy_password, envoy_serial_no, debug);
});
