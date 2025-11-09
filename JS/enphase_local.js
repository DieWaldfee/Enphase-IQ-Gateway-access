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
// Version ... - further development by steffe-s
// Version 0.1.0 - complete transfer into plain javascript by Matthias Rauchschwalbe
// Version now monitored by GitHub - see stable release
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
let debug = 0; // Debug level (0=none, 1=info, 2=advanced, 3=debug)
let bearer_token = ''; // Add existing Envoy token (optional, default='') will be created automatically if empty

// -------------------------------------------------------------------------------------------------------------------
// initialization of variables
// -------------------------------------------------------------------------------------------------------------------
// polling interval variables - will be overwritten from datapoints if existing
let pollingCron = ''; // Polling interval in cron format (e.g. '*/5 * * * *' for every 5 minutes; change as needed)
let lowPollingInterval = 15; // Polling interval in minutes (min: 0, max: 59; change as needed)
let medPollingInterval = 5; // Polling interval in minutes (min: 0, max: 59; change as needed)
let highPollingIntervalSec = 30; // Polling interval in seconds; valid x sec & 0 min (min: 10, max: 59; change as needed)
let highPollingIntervalMin = 0; // Polling interval in minutes; valid 0 sec & x min (min: 1, max: 59; change as needed)
// http response and error count
let error_cnt = 0; // Counts errors to slow down polling in case of errors
let http_resp_json = ''; // Variable to hold the JSON response from the Envoy
let dpPrefix = '0_userdata.0.enphase.local.'; // Prefix for ioBroker datapoints
// credentials for enphase IQ Gateway
const dpBasicConfigPath = '0_userdata.0.enphase.config.local.'; // datapoint path to store the values
const dpCredentialsPath = dpBasicConfigPath + 'credentials.'; // datapoint path to store user credentials
const dpPollingPath = dpBasicConfigPath + 'polling.'; // datapoint path to store polling intervals
// endpoint for a single call
let ivp_eh_devs = '/ivp/eh/devs'; // URL path to get EH devs from local Envoy
// endpoint for low frequency calls
let ivp_device_list = '/ivp/ensemble/device_list'; // URL path to get device list from local Envoy
let ivp_meters_status = '/ivp/meters'; // URL path to get meters data from local Envoy
// endpoint for med frequency calls
let ivp_prod = '/ivp/meters/reports/production'; // URL path to get production data from local Envoy
let ivp_cons = '/ivp/meters/reports/consumption'; // URL path to get consumption data from local Envoy
let ivp_production = '/production.json'; // URL path to get production data (old URL, but includes "day" counter "whToday")
let ivp_inverters = '/api/v1/production/inverters'; // URL path to get inverter data from local Envoy
let ivp_production_v1 = '/api/v1/production'; // URL path to get production data from local Envoy
let ivp_inventory = '/ivp/ensemble/inventory'; // URL path to get inventory data from local Envoy
// endpoint for high frequency calls
let ivp_read = '/ivp/meters/readings'; // URL path to get meter readings from local Envoy
let ivp_grid_reading = '/ivp/meters/gridReading'; // URL path to get grid reading from local Envoy
let ivp_pdm_energy = '/ivp/pdm/energy'; // URL path to get PDM energy data from local Envoy
let ivp_livedata = '/ivp/livedata/status'; // URL path to get livedata from local Envoy
// endpoint to access lifedata stream
let ivp_livedata_stream = '/ivp/livedata/stream'; // URL path to get livedata stream from local Envoy
const MIN_VALID_TIMESTAMP = 1685000000; // unix timestamp -> seconds since 1970-01-01 :: 1685000000 ≈ Juni 2023
const MAX_VALID_TIMESTAMP = 4100000000; // unix timestamp -> seconds since 1970-01-01 :: 4100000000 ≈ Januar 2100

// -------------------------------------------------------------------------------------------------------------------
// create datapoints for credentials if not existing
// -------------------------------------------------------------------------------------------------------------------
// Create credentials datapoints if not existing, and wait for creation to finish
async function ensureCredentialsStates() {
   if (!existsState(dpCredentialsPath + 'username')) {
      await createStateAsync(dpCredentialsPath + 'username', '', {
         type: 'string',
         role: 'text',
         read: true,
         write: true,
         desc: 'Please enter your Enphase Enlighten username here',
      });
   }
   if (!existsState(dpCredentialsPath + 'password')) {
      await createStateAsync(dpCredentialsPath + 'password', '', {
         type: 'string',
         role: 'text',
         read: true,
         write: true,
         desc: 'Please enter your Enphase Enlighten password here',
      });
   }
   if (!existsState(dpCredentialsPath + 'serial_no')) {
      await createStateAsync(dpCredentialsPath + 'serial_no', '', {
         type: 'string',
         role: 'text',
         read: true,
         write: true,
         desc: 'Please enter the 12 digit serial number of your Enphase Envoy device here',
      });
   }
   if (!existsState(dpCredentialsPath + 'gateway_ip')) {
      await createStateAsync(dpCredentialsPath + 'gateway_ip', '', {
         type: 'string',
         role: 'text',
         read: true,
         write: true,
         desc: 'Please enter the IP address of your Enphase Envoy gateway device here',
      });
   }
}
await ensureCredentialsStates();
if (debug > 0) log('credentials, serial_no and gateway_ip datapoints created', 'info');

// -------------------------------------------------------------------------------------------------------------------
// read polling interval from iobroker datapoints if existing
// -------------------------------------------------------------------------------------------------------------------
async function readPollingIntervals() {
   if (!existsState(dpPollingPath + 'lowPollingInterval')) {
      await createStateAsync(dpPollingPath + 'lowPollingInterval', lowPollingInterval, {
         read: true,
         write: true,
         type: 'number',
         role: 'value',
         def: lowPollingInterval,
         min: 1,
         max: 59,
         unit: 'min',
         desc: 'Low frequency polling interval in minutes (min: 1, max: 59)',
      });
   }
   if (!existsState(dpPollingPath + 'medPollingInterval')) {
      await createStateAsync(dpPollingPath + 'medPollingInterval', medPollingInterval, {
         read: true,
         write: true,
         type: 'number',
         role: 'value',
         def: medPollingInterval,
         min: 1,
         max: 59,
         unit: 'min',
         desc: 'Medium frequency polling interval in minutes (min: 1, max: 59)',
      });
   }
   if (!existsState(dpPollingPath + 'highPollingIntervalSec')) {
      await createStateAsync(dpPollingPath + 'highPollingIntervalSec', highPollingIntervalSec, {
         read: true,
         write: true,
         type: 'number',
         role: 'value',
         def: highPollingIntervalSec,
         min: 0,
         max: 59,
         unit: 'sec',
         desc: 'High frequency polling interval in seconds (min: 10, max: 59) if 0 sec then disabled',
      });
   }
   if (!existsState(dpPollingPath + 'highPollingIntervalMin')) {
      await createStateAsync(dpPollingPath + 'highPollingIntervalMin', highPollingIntervalMin, {
         read: true,
         write: true,
         type: 'number',
         role: 'value',
         def: highPollingIntervalMin,
         min: 0,
         max: 59,
         unit: 'min',
         desc: 'High frequency polling interval in minutes (min: 1, max: 59) if 0 min then disabled',
      });
   }
}
await readPollingIntervals();
if (debug > 0) log('polling intervals datapoints datapoints created', 'info');

// -------------------------------------------------------------------------------------------------------------------
// read credentials from iobroker datapoints
// -------------------------------------------------------------------------------------------------------------------
let envoy_username = ''; // Add your Enphase Enlighten Cloud username (mandatory)
let envoy_password = ''; // Add your Enphase Enlighten Cloud password (mandatory)
let envoy_serial_no = ''; // Add serial no (12 digit) and IP of local Envoy (mandatory)
let envoy_ip = ''; // Add IP of local Envoy (mandatory)
try {
   envoy_username = getState(dpCredentialsPath + 'username').val;
   envoy_password = getState(dpCredentialsPath + 'password').val;
   envoy_serial_no = getState(dpCredentialsPath + 'serial_no').val;
   envoy_ip = getState(dpCredentialsPath + 'gateway_ip').val;
} catch (error) {
   log('Error reading credentials from datapoints: ' + error.message, 'error');
   stopMyScript();
}

// -------------------------------------------------------------------------------------------------------------------
// check credentials from iobroker datapoints
// -------------------------------------------------------------------------------------------------------------------
if (envoy_username === '' || envoy_password === '' || envoy_serial_no === '' || envoy_ip === '') {
   log('⚠️ One or more Enphase credentials are not set – script stopped', 'error');
   log('Please set the Enphase credentials in the corresponding datapoints under ' + dpCredentialsPath, 'info');
   log('Mandatory datapoints are: username, password, serial_no (12 digit), ip (IPv4 address)', 'info');
   log('The script created the necessary datapoints if they did not exist.', 'info');
   log('After setting the credentials please restart this script.', 'info');
   stopMyScript();
   return; // prevent further execution (parallel call of schedules)
}

// -------------------------------------------------------------------------------------------------------------------
// read polling intervals from iobroker datapoints
// -------------------------------------------------------------------------------------------------------------------
try {
   lowPollingInterval = getState(dpPollingPath + 'lowPollingInterval').val;
   medPollingInterval = getState(dpPollingPath + 'medPollingInterval').val;
   highPollingIntervalSec = getState(dpPollingPath + 'highPollingIntervalSec').val;
   highPollingIntervalMin = getState(dpPollingPath + 'highPollingIntervalMin').val;
} catch (error) {
   log('Error reading polling intervals from datapoints: ' + error.message, 'error');
   stopMyScript();
}

// -------------------------------------------------------------------------------------------------------------------
// check polling intervals from iobroker datapoints
// -------------------------------------------------------------------------------------------------------------------
if (lowPollingInterval === null || lowPollingInterval === undefined || lowPollingInterval === '') {
   log('⚠️ variable lowPollingInterval not set – script stopped', 'error');
   stopMyScript(); // stop script
   return; // prevent further execution (parallel call of schedules)
}
if (medPollingInterval === null || medPollingInterval === undefined || medPollingInterval === '') {
   log('⚠️ variable medPollingInterval not set – script stopped', 'error');
   stopMyScript(); // stop script
   return; // prevent further execution (parallel call of schedules)
}
if (highPollingIntervalSec === null || highPollingIntervalSec === undefined || highPollingIntervalSec === '') {
   log('⚠️ variable highPollingIntervalSec not set – script stopped', 'error');
   stopMyScript(); // stop script
   return; // prevent further execution (parallel call of schedules)
}
if (highPollingIntervalMin === null || highPollingIntervalMin === undefined || highPollingIntervalMin === '') {
   log('⚠️ variable highPollingIntervalMin not set – script stopped', 'error');
   stopMyScript(); // stop script
   return; // prevent further execution (parallel call of schedules)
}
if (lowPollingInterval < 1 || lowPollingInterval > 60) {
   log('⚠️ variable lowPollingInterval out of range (1-59) – script stopped', 'error');
   stopMyScript(); // stop script
   return; // prevent further execution (parallel call of schedules)
}
if (medPollingInterval < 1 || medPollingInterval > 60) {
   log('⚠️ variable medPollingInterval out of range (1-59) – script stopped', 'error');
   stopMyScript(); // stop script
   return; // prevent further execution (parallel call of schedules)
}
if (highPollingIntervalSec < 0 || highPollingIntervalSec > 59) {
   log('⚠️ variable highPollingIntervalSec out of range (0-59) – script stopped', 'error');
   stopMyScript(); // stop script
   return; // prevent further execution (parallel call of schedules)
}
if (highPollingIntervalMin < 0 || highPollingIntervalMin > 59) {
   log('⚠️ variable highPollingIntervalMin out of range (0-59) – script stopped', 'error');
   stopMyScript(); // stop script
   return; // prevent further execution (parallel call of schedules)
}
if (highPollingIntervalSec == 0 && highPollingIntervalMin == 0) {
   log(
      '⚠️ variable highPollingIntervalSec and highPollingIntervalMin are both 0 - choose at least one – script stopped',
      'error'
   );
   stopMyScript(); // stop script
   return; // prevent further execution (parallel call of schedules)
}

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
      clearSchedule(lowCyclicSchedule);
   } catch (error) {}
   try {
      clearSchedule(medCyclicSchedule);
   } catch (error) {}
   try {
      clearSchedule(highCyclicSchedule);
   } catch (error) {}
   stopScript(); // stop script
}

if (envoy_username === null || envoy_username === undefined || envoy_username === '') {
   log('⚠️ variable envoy_username not set – script stopped', 'error');
   log('Please set the variable envoy_username to your Enphase Enlighten Cloud username.', 'info');
   stopMyScript(); // stop script
   return; // prevent further execution (parallel call of schedules)
}
if (envoy_password === null || envoy_password === undefined || envoy_password === '') {
   log('⚠️ variable envoy_password not set – script stopped', 'error');
   log('Please set the variable envoy_password to your Enphase Enlighten Cloud password.', 'info');
   stopMyScript(); // stop script
   return; // prevent further execution (parallel call of schedules)
}
if (envoy_serial_no === null || envoy_serial_no === undefined || envoy_serial_no === '') {
   log('⚠️ variable envoy_serial_no not set – script stopped', 'error');
   log('Please set the variable envoy_serial_no to the serial number of your Envoy device.', 'info');
   stopMyScript(); // stop script
   return; // prevent further execution (parallel call of schedules)
}
if (!/^\d{12}$/.test(envoy_serial_no)) {
   //check, if exactly 12 digits
   log('⚠️ envoy_serial_no must be exactly 12 digits – script stopped', 'error');
   log(
      'Please check the variable envoy_serial_no. It must contain exactly 12 digits (no letters, no special characters).',
      'info'
   );
   stopMyScript(); // stop script
   return; // prevent further execution (parallel call of schedules)
}
if (envoy_ip === null || envoy_ip === undefined || envoy_ip === '') {
   log('⚠️ variable envoy_ip not set – script stopped', 'error');
   log('Please set the variable envoy_ip to the IP address of your Envoy device.', 'info');
   stopMyScript(); // stop script
   return; // prevent further execution (parallel call of schedules)
}
if (!isValidIPv4(envoy_ip)) {
   log('⚠️ envoy_ip is not a valid IPv4 address – script stopped', 'error');
   log('Please check the variable envoy_ip. It must contain a valid IPv4 address (e.g. 192.168.1.1)', 'info');
   stopMyScript(); // stop script
   return; // prevent further execution (parallel call of schedules)
}
if (debug > 0) log('All mandatory variables are set. Proceeding...', 'info');

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
   // Login request
   const loginData = querystring.stringify({
      'user[email]': envoy_username,
      'user[password]': envoy_password,
   });

   if (debug > 0) log('Renew token. 1. Login to enlighten.enphaseenergy.com to get session_id...', 'info');

   try {
      const loginResponse = await fetch('https://enlighten.enphaseenergy.com/login/login.json', {
         method: 'POST',
         body: loginData,
         headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
         },
      });
      const responseData = await loginResponse.json();
      if (debug > 1) log('Response from login: ' + JSON.stringify(responseData), 'info');

      // Token request
      const tokenData = {
         session_id: responseData.session_id,
         serial_num: envoy_serial_no,
         username: envoy_username,
      };
      // Check for invalid login
      if (responseData.message === 'Invalid') throw new Error('Invalid username or password');
      if (debug > 1) log('Login successful. Session ID: ' + responseData.session_id, 'info');
      if (debug > 2) log('Proceeding to token request with data: ' + JSON.stringify(tokenData), 'info');

      if (debug > 0) log('2. Login to entrez.enphaseenergy.com to get new token...', 'info');
      const tokenResponse = await fetch('https://entrez.enphaseenergy.com/tokens', {
         method: 'POST',
         body: JSON.stringify(tokenData),
         headers: {
            'Content-Type': 'application/json',
         },
      });
      const tokenRaw = await tokenResponse.text();
      if (debug > 1) log('New token: ' + tokenRaw, 'info');
      return tokenRaw;
   } catch (error) {
      log('Error token renewal: ' + error.message, 'error');
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
   // Null oder undefined auf oberster Ebene abfangen
   if (obj === null || obj === undefined) {
      if (debug > 1) log('Writing null/undefined object for id: ' + id, 'info');
      if (existsState(id)) {
         setState(id, null, true);
      } else {
         createState(id, null, false, { type: 'mixed', read: true, write: true });
      }
      return;
   }
   if (debug > 2) log('IObSetState called with id: ' + id + ' and obj: ' + JSON.stringify(obj), 'info');
   // Loop through all attributes of the given object
   for (const i of Object.keys(obj)) {
      const value = obj[i]; // Get value of current attribute
      const attr = i.replace(/[^a-zA-Z0-9._-]+/g, ''); // Clean attribute name to avoid issues in IOBroker

      if (typeof value == 'object') {
         // Nested object -> recursive call of IObSetState
         if (debug > 2)
            log('Nested object found for attribute: ' + attr + ' with value: ' + JSON.stringify(value), 'info');
         await IObSetState(id + '.' + attr, value, debug);
      } else {
         // Primitive value (string, number, date) -> create or update state in IOBroker
         if (existsState(id + '.' + attr)) {
            // Existing object => Update
            if (typeof value === 'string' || value instanceof String) {
               // value is a string
               if (debug > 1) log('Updating string state: ' + id + '.' + attr + ' with value: ' + value, 'info');
               setState(id + '.' + attr, value, true);
            } else if (typeof value === 'boolean') {
               // value is a boolean
               if (debug > 1) log('Updating boolean state: ' + id + '.' + attr + ' with value: ' + value, 'info');
               setState(id + '.' + attr, value, true);
            } else {
               // It is a number or date
               if (
                  new Date(value).getTime() > 0 &&
                  Number(value) > MIN_VALID_TIMESTAMP &&
                  Number(value) < MAX_VALID_TIMESTAMP
               ) {
                  // value is a date
                  if (debug > 1) log('Updating date state: ' + id + '.' + attr + ' with value: ' + value, 'info');
                  if (debug > 2)
                     log(
                        'Updating additional human readable date state: ' +
                           id +
                           '.' +
                           attr +
                           '_str with value: ' +
                           formatDate(value, 'TT.MM.JJJJ SS:mm:ss'),
                        'info'
                     );
                  setState(id + '.' + attr, value, true); // unix timestamp
                  setState(id + '.' + attr + '_str', formatDate(value, 'TT.MM.JJJJ SS:mm:ss'), true); // human readable date
               } else {
                  // value is a number
                  if (debug > 1) log('Updating number state: ' + id + '.' + attr + ' with value: ' + value, 'info');
                  setState(id + '.' + attr, Number(value), true);
               }
            }
         } else {
            // New object => create
            if (typeof value === 'string' || value instanceof String) {
               // value is a string
               if (debug > 1) log('Creating string state: ' + id + '.' + attr + ' with value: ' + value, 'info');
               createState(id + '.' + attr, value, false, { type: 'string', read: true, write: true });
            } else if (typeof value === 'boolean') {
               // value is a boolean
               if (debug > 1) log('Creating boolean state: ' + id + '.' + attr + ' with value: ' + value, 'info');
               createState(id + '.' + attr, value, false, { type: 'boolean', read: true, write: true });
            } else {
               // It is a number or date
               if (
                  new Date(value).getTime() > 0 &&
                  Number(value) > MIN_VALID_TIMESTAMP &&
                  Number(value) < MAX_VALID_TIMESTAMP
               ) {
                  // value is a date
                  if (debug > 1) log('Creating date state: ' + id + '.' + attr + ' with value: ' + value, 'info');
                  if (debug > 2)
                     log(
                        'Creating additional human readable date state: ' +
                           id +
                           '.' +
                           attr +
                           '_str with value: ' +
                           formatDate(value, 'TT.MM.JJJJ SS:mm:ss'),
                        'info'
                     );
                  createState(id + '.' + attr, value, false, { type: 'number', read: true, write: true });
                  createState(id + '.' + attr + '_str', formatDate(value, 'TT.MM.JJJJ SS:mm:ss'), false, {
                     type: 'string',
                     read: true,
                     write: true,
                  });
               } else {
                  // value is a number
                  if (debug > 1) log('Creating number state: ' + id + '.' + attr + ' with value: ' + value, 'info');
                  createState(id + '.' + attr, value, false, { type: 'number', read: true, write: true }); // type set to 'number'; change to 'mixed' if mixed types are expected
               }
            }
         }
      }
   }
}

// -------------------------------------------------------------------------------------------------------------------
// basic function: GetEnvoyData
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
      headers: {
         Authorization: `Bearer ${bearer_token}`,
         Accept: 'application/json', // Request JSON response
      },
   };

   if (debug > 0) log(log_msg + '...started', 'info');
   if (debug > 1) log('Query local Envoy IP: ' + envoy_ip + ' ...process started', 'info');
   let jsonData;
   try {
      const response = await httpsRequestAsyncGet(options);
      if (debug > 1) log('Query local Envoy IP: ' + envoy_ip, 'info');
      if (debug > 2) log('Response from local Envoy: ' + response, 'info');
      jsonData = JSON.parse(response);
   } catch (error) {
      // Error handling for request failure or JSON parsing error -> stop script here
      throw new Error(`Error querying local Envoy at IP ${envoy_ip}: ${error.message}`);
   }

   try {
      http_resp_json = JSON.stringify(jsonData, null, 2);
      error_cnt -= 1;
      if (debug > 2) log('JSON data to be processed: ' + JSON.stringify(jsonData), 'info');
      if (debug > 1) log(log_msg + 'ok', 'info');
      return true;
   } catch (error) {
      error_cnt += 1;
      log(log_msg + error.message + ' | Error cnt: ' + String(error_cnt), 'error');
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

   if (debug > 0) log(log_msg + '...started', 'info');
   if (debug > 1) log('Query local Envoy IP: ' + envoy_ip + ' ...process started', 'info');
   let jsonData;
   try {
      const response = await httpsRequestAsyncPost(options);
      if (debug > 1) log('Query local Envoy IP: ' + envoy_ip, 'info');
      if (debug > 2) log('Response from local Envoy: ' + response, 'info');
      jsonData = JSON.parse(response);
   } catch (error) {
      // Error handling for request failure or JSON parsing error -> stop script here
      throw new Error(`Error querying local Envoy at IP ${envoy_ip}: ${error.message}`);
   }

   try {
      http_resp_json = JSON.stringify(jsonData, null, 2);
      error_cnt -= 1;
      if (debug > 2) log('JSON data to be processed: ' + JSON.stringify(jsonData), 'info');
      if (debug > 1) log(log_msg + 'ok', 'info');
      return true;
   } catch (error) {
      error_cnt += 1;
      log(log_msg + ': ' + error.message + ' | Error cnt: ' + String(error_cnt), 'error');
      return false;
   }
}

// -------------------------------------------------------------------------------------------------------------------
// single and cyclic program loop
// -------------------------------------------------------------------------------------------------------------------
// This section sets up a scheduled cyclic loop to periodically fetch photovoltaic (PV) data from the
// local Envoy device. The loop runs at a configurable interval and attempts to retrieve multiple types
// of data (production, consumption, meter readings, etc.). If errors occur during data retrieval, the
// error count is incremented and polling is slowed down to avoid repeated failures. The loop also updates
// or creates corresponding states in ioBroker for each data type fetched.
// -------------------------------------------------------------------------------------------------------------------
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
// single requests of data
// 1. Get PV EH DEVS
if (await GetEnvoyData(envoy_ip, ivp_eh_devs, bearer_token, 'Get EH DEVS data : ', debug)) {
   if (debug > 1) log('Processing eh devs data...', 'info');
   const ehDevsData = safeParseJSON(http_resp_json);
   await IObSetState(dpPrefix + 'eh_devs', ehDevsData);
}
// Main cyclic program loop low frequency
// Ensure pollingInterval stays within bounds
if (lowPollingInterval < 1) lowPollingInterval = 1;
if (lowPollingInterval > 59) lowPollingInterval = 59;
pollingCron = `28 */${lowPollingInterval} * * * *`; // every x minutes with 28 seconds delay
// start cyclic polling schedule
const lowCyclicSchedule = schedule(pollingCron, async () => {
   try {
      if (error_cnt <= 0) {
         if (debug > 0)
            log('Cyclic polling started (low). Polling interval: ' + lowPollingInterval + ' minutes', 'info');
         if (debug > 1) log('Resulting polling interval: ' + pollingCron, 'info');
         if (debug > 2) log('Current error count: ' + error_cnt, 'info');
         if (debug > 1) log('Fetching data from local Envoy IP: ' + envoy_ip + ' ...process started', 'info');
         // A. Get PV DEVICE LIST
         if (await GetEnvoyData(envoy_ip, ivp_device_list, bearer_token, 'Get DEVICE LIST data : ', debug)) {
            if (debug > 1) log('Processing device list data...', 'info');
            const deviceListData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'device_list', deviceListData);
         }
         // B. status meters
         if (await GetEnvoyData(envoy_ip, ivp_meters_status, bearer_token, 'Get Meters status data : ', debug)) {
            if (debug > 1) log('Processing meters status data...', 'info');
            const metersStatusData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'meters.status', metersStatusData);
         }
      }
   } catch (err) {
      log('Error in low freq. scheduled polling loop: ' + err.message, 'error');
   }
});
// Main cyclic program loop med frequency
// Ensure pollingInterval stays within bounds
if (medPollingInterval < 1) medPollingInterval = 1;
if (medPollingInterval > 59) medPollingInterval = 59;
pollingCron = `13 */${medPollingInterval} * * * *`; // every x minutes with 13 seconds delay
// start cyclic polling schedule
const medCyclicSchedule = schedule(pollingCron, async () => {
   try {
      if (error_cnt <= 0) {
         if (debug > 0)
            log('Cyclic polling started (medium). Polling interval: ' + medPollingInterval + ' minutes', 'info');
         if (debug > 1) log('Resulting polling interval: ' + pollingCron, 'info');
         if (debug > 2) log('Current error count: ' + error_cnt, 'info');
         if (debug > 1) log('Fetching data from local Envoy IP: ' + envoy_ip + ' ...process started', 'info');
         // 1. Get PV METER PRODUCTION
         if (await GetEnvoyData(envoy_ip, ivp_prod, bearer_token, 'Get Prod. data: ', debug)) {
            if (debug > 1) log('Processing production data...', 'info');
            const prodData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'production', prodData);
         }
         // 2. Get PV METER CONSUMPTION
         if (await GetEnvoyData(envoy_ip, ivp_cons, bearer_token, 'Get Cons. data: ', debug)) {
            if (debug > 1) log('Processing consumption data...', 'info');
            const consData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'consumption', consData);
         }
         // 3. Get PV PRODUCTION.JSON
         if (await GetEnvoyData(envoy_ip, ivp_production, bearer_token, 'Get production.json data: ', debug)) {
            if (debug > 1) log('Processing production.json data...', 'info');
            // Note: This URL is deprecated but still includes the "whToday" counter
            // which is not included in the new "/ivp/meters/reports/production" URL
            const prodStatData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'prod_stat', prodStatData);
         }
         // 4. Get PV MICRO INVERTER
         if (await GetEnvoyData(envoy_ip, ivp_inverters, bearer_token, 'Get Inv. data : ', debug)) {
            if (debug > 1) log('Processing inverter data...', 'info');
            const inverterData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'inverter', inverterData);
         }
         // 5. Get PV INVENTORY
         if (await GetEnvoyData(envoy_ip, ivp_inventory, bearer_token, 'Get INVENTORY data : ', debug)) {
            if (debug > 1) log('Processing inventory data...', 'info');
            const inventoryData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'inventory', inventoryData);
         }
         // 6. Get PV PRODUCTION V1
         if (await GetEnvoyData(envoy_ip, ivp_production_v1, bearer_token, 'Get PRODUCTION V1 data : ', debug)) {
            if (debug > 1) log('Processing PRODUCTION V1 data...', 'info');
            const productionV1Data = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'production', productionV1Data);
         }
      }
   } catch (err) {
      log('Error in mid freq. scheduled polling loop: ' + err.message, 'error');
   }
});
// Main cyclic program loop high frequency
// Ensure pollingInterval stays within bounds
if (highPollingIntervalSec < 0) highPollingIntervalSec = 0;
if (highPollingIntervalSec > 59) highPollingIntervalSec = 59;
if (highPollingIntervalMin < 0) highPollingIntervalMin = 0;
if (highPollingIntervalMin > 59) highPollingIntervalMin = 59;
if (highPollingIntervalSec == 0 && highPollingIntervalMin == 0) {
   log('please choose either seconds or minutes as polling interval', 'info');
   highPollingIntervalSec = 30; // minimum polling interval is 30 seconds
}
if (highPollingIntervalSec != 0 && highPollingIntervalMin != 0) {
   log('please choose either seconds or minutes as polling interval', 'info');
   highPollingIntervalSec = 0; // choose the minutes value
}
if (highPollingIntervalSec == 0) {
   pollingCron = `0 */${highPollingIntervalMin} * * * *`; // every x minutes - no seconds
} else {
   pollingCron = `*/${highPollingIntervalSec} * * * * *`; // every x seconds - no minutes
}
// start cyclic polling schedule
const highCyclicSchedule = schedule(pollingCron, async () => {
   try {
      if (error_cnt <= 0) {
         if (debug > 0)
            log(
               'High cyclic polling started. Polling interval: ' +
                  highPollingIntervalMin +
                  ' minutes' +
                  highPollingIntervalSec +
                  ' seconds',
               'info'
            );
         if (debug > 1) log('Resulting high cyclic polling interval: ' + pollingCron, 'info');
         if (debug > 2) log('Current error count: ' + error_cnt, 'info');
         if (debug > 1) log('Fetching data from local Envoy IP: ' + envoy_ip + ' ...process started', 'info');
         // Reset error count before starting new polling cycle
         // Variable 'error_cnt' counts Envoy errors to slow down polling in case of errors
         error_cnt = 0;
         // 1. Get PV METER READINGS
         if (await GetEnvoyData(envoy_ip, ivp_read, bearer_token, 'Get Meter data: ', debug)) {
            if (debug > 1) log('Processing meter readings data...', 'info');
            const meterData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'meters', meterData);
         }
         // 2. Get PV LIVEDATA
         if (await GetEnvoyData(envoy_ip, ivp_livedata, bearer_token, 'Get LIVEDATA data : ', debug)) {
            if (debug > 1) log('Processing livedata data...', 'info');
            const livedataData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'livedata', livedataData);
         }
         // 3. Get PV METER Grid Reading
         if (await GetEnvoyData(envoy_ip, ivp_grid_reading, bearer_token, 'Get Grid Reading data : ', debug)) {
            if (debug > 1) log('Processing grid reading data...', 'info');
            const gridReadingData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'meters.gridReading', gridReadingData);
         }
         // 4. Get PV METER PDM Energy
         if (await GetEnvoyData(envoy_ip, ivp_pdm_energy, bearer_token, 'Get PDM Energy data : ', debug)) {
            if (debug > 1) log('Processing PDM Energy data...', 'info');
            const pdmEnergyData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'PDM.energy', pdmEnergyData);
         }
      } else {
         // Slow down polling in case of errors
         log('Previous errors detected - skipping cycle. Error count: ' + error_cnt, 'info');
         error_cnt = typeof error_cnt === 'number' ? error_cnt : 0;
         error_cnt -= 1;
      }
   } catch (err) {
      log('Error in high freq. scheduled polling loop: ' + err.message, 'error');
   }
});

// -------------------------------------------------------------------------------------------------------------------
// automatic sc stream update
// -------------------------------------------------------------------------------------------------------------------
// sc stream update after state change in ioBroker to disabled
// -------------------------------------------------------------------------------------------------------------------
on({ id: dpPrefix + 'livedata.connection.sc_stream', change: 'ne' }, async (obj) => {
   let value = obj.state.val;
   if ((obj.state ? obj.state.val : 'disabled') == 'disabled') {
      if (debug > 0) log('SC stream is disabled. Attempting to enable it...', 'info');
      await PostEnvoyData(envoy_ip, ivp_livedata_stream, bearer_token, 'POST sc_stream data: ', debug);
   }
});

// -------------------------------------------------------------------------------------------------------------------
// automatic token renewal
// -------------------------------------------------------------------------------------------------------------------
// Periodic token renewal. Default: Daily at midnight. Adjust as needed.
// -------------------------------------------------------------------------------------------------------------------
const tokenRenewalSchedule = schedule('0 0 0 * * *', async () => {
   if (debug > 0) log('Automatic token renewal started...', 'info');
   bearer_token = await renewEnvoyToken(envoy_username, envoy_password, envoy_serial_no, debug);
});
