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
// - Enter username, password, serial number and IP address of the Envoy in the datapoints
//   0_userdata.0.enphase.config.local.credentials.* (created at the first start)
// - Set the polling intervals in SECONDS in the datapoints 0_userdata.0.enphase.config.local.polling.*
//   (highPollingIntervalSec, medPollingIntervalSec, lowPollingIntervalSec); the values are checked at start
//   and changes need a restart of the script
// -------------------------------------------------------------------------------------------------------------------
// Version 0.0.1 - initial version by greoj
// Version 0.0.2 - lifedata added by steffe-s
// Version ... - further development by steffe-s
// Version 0.1.0 - complete transfer into plain javascript by Matthias Rauchschwalbe
// Version now monitored by GitHub - see stable release
// Version 3.5.0 - single connection to the gateway: one shared https agent (maxSockets 1) and a dispatcher that
//                 executes exactly one job at a time (OneConnect, Issue #42)
//               - polling intervals in seconds instead of minutes + seconds (Issue #43)
//               - configuration is validated at start (abort with error message), changes at runtime need a restart
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
// polling intervals in seconds - read from the datapoints at start (limits and defaults: see below)
let lowPollingIntervalSec = 900; // Polling interval in seconds (min: 60, max: 3600; default 900)
let medPollingIntervalSec = 300; // Polling interval in seconds (min: 60, max: 3600; default 300)
let highPollingIntervalSec = 30; // Polling interval in seconds (min: 10, max: 3600; default 30)
// Defaults and limits are the single source for datapoint creation, validation and error message.
// Rule: highPollingIntervalSec < medPollingIntervalSec < lowPollingIntervalSec (strict)
const POLLING_LEVELS = ['high', 'med', 'low']; // order = priority if two cycles are due at the same time
const POLLING_DEFAULTS = { high: 30, med: 300, low: 900 }; // seconds
const POLLING_LIMITS = {
   high: { min: 10, max: 3600 },
   med: { min: 60, max: 3600 },
   low: { min: 60, max: 3600 },
}; // seconds
// dispatcher: all gateway requests are executed one after another by a single timer
const DISPATCH_TICK_MS = 1000; // Dispatcher checks once per second whether a job is due
const START_OFFSET_SEC = { high: 0, med: 13, low: 45 }; // first run of each cycle after script start (seconds)
let dispatcherTimer = null; // timer of the dispatcher (cleared in stopMyScript)
// http response and error count
let error_cnt = 0; // Counts errors to slow down polling in case of errors
let http_resp_json = ''; // Variable to hold the JSON response from the Envoy
// gateway offline detection
let consecutiveErrors = 0; // Counts consecutive network errors for gateway offline detection
let gatewayOffline = false; // True when gateway is detected as offline/rebooting
let lastCycleErrors; // failed requests of the last executed cycle (undefined if the cycle did not run) - for status datapoints
const MAX_CONSECUTIVE_ERRORS = 3; // Number of consecutive errors before marking gateway as offline
const REQUEST_TIMEOUT_MS = 10000; // Timeout for HTTP requests in milliseconds (10 sec)
let dpPrefix = '0_userdata.0.enphase.local.'; // Prefix for ioBroker datapoints
const dpStatusPath = '0_userdata.0.enphase.status.local.'; // datapoint path for the status of the polling
// credentials for enphase IQ Gateway
const dpBasicConfigPath = '0_userdata.0.enphase.config.local.'; // datapoint path to store the values
const dpCredentialsPath = dpBasicConfigPath + 'credentials.'; // datapoint path to store user credentials
const dpPollingPath = dpBasicConfigPath + 'polling.'; // datapoint path to store polling intervals
const SC_STREAM_ENABLE_BODY = JSON.stringify({ enable: 1 }); // body of the POST to enable the livedata stream
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
// create polling datapoints (seconds), migrate old values, create status datapoints
// -------------------------------------------------------------------------------------------------------------------
/** @param {string} level - 'high' | 'med' | 'low' */
function pollingStateName(level) {
   return level + 'PollingIntervalSec';
}
/** common attributes of the polling datapoints (seconds) */
function pollingCommon(level) {
   const names = { high: 'High', med: 'Medium', low: 'Low' };
   const lim = POLLING_LIMITS[level];
   return {
      read: true,
      write: true,
      type: 'number',
      role: 'value',
      def: POLLING_DEFAULTS[level],
      min: lim.min,
      max: lim.max,
      unit: 's',
      desc:
         names[level] + ' frequency polling interval in seconds (min: ' + lim.min + ', max: ' + lim.max +
         ', default: ' + POLLING_DEFAULTS[level] + ')',
   };
}
/**
 * Updates attributes of an existing datapoint's common part only if one of them differs.
 * Uses createState with forceCreation (always allowed) instead of extendObject, which is blocked by default in
 * the javascript adapter. Existing attributes (e.g. custom settings) and the current value are kept.
 */
async function updateCommonIfChanged(id, common) {
   const obj = getObject(id);
   if (!obj || !obj.common) return;
   const changed = Object.keys(common).some((key) => obj.common[key] !== common[key]);
   if (!changed) return;
   const current = getState(id);
   const initial = current && current.val !== null && current.val !== undefined ? current.val : undefined;
   await createStateAsync(id, initial, true, Object.assign({}, obj.common, common));
}
/** Creates the read-only status datapoints (written by the dispatcher). */
async function ensureStatusStates() {
   const defs = [
      ['gatewayOffline', { type: 'boolean', role: 'indicator', def: false, desc: 'True while the gateway offline detection is active' }, false],
      ['consecutiveErrors', { type: 'number', role: 'value', def: 0, desc: 'Consecutive cycles with errors' }, 0],
      ['pendingJobs', { type: 'number', role: 'value', def: 0, desc: 'Number of waiting one-time and event jobs' }, 0],
   ];
   for (const level of POLLING_LEVELS) {
      const p = level + '.';
      defs.push([p + 'lastStart', { type: 'number', role: 'date', unit: 'ms', def: 0, desc: 'Start of the last ' + level + ' cycle (unix time in ms)' }, 0]);
      defs.push([p + 'lastDurationMs', { type: 'number', role: 'value', unit: 'ms', def: 0, desc: 'Duration of the last ' + level + ' cycle' }, 0]);
      defs.push([p + 'lastLagMs', { type: 'number', role: 'value', unit: 'ms', def: 0, desc: 'Wait time between due time and start of the last ' + level + ' cycle' }, 0]);
      defs.push([p + 'lastErrors', { type: 'number', role: 'value', def: 0, desc: 'Failed requests in the last ' + level + ' cycle' }, 0]);
   }
   for (const [name, common, initial] of defs) {
      if (!existsState(dpStatusPath + name)) {
         await createStateAsync(dpStatusPath + name, initial, Object.assign({ read: true, write: false }, common));
      }
   }
}
// Creates the datapoints in seconds if not existing and migrates the old minute values (V3.4.1 and older).
// Old datapoints stay as DEPRECATED. The new values are validated afterwards (validatePollingConfig).
async function readPollingIntervals() {
   // low and med: new = old (min) x 60 if the new datapoint does not exist yet
   for (const level of ['low', 'med']) {
      const newId = dpPollingPath + pollingStateName(level);
      const oldId = dpPollingPath + level + 'PollingInterval';
      if (!existsState(newId)) {
         let initial = POLLING_DEFAULTS[level];
         if (existsState(oldId)) {
            const oldVal = Number(getState(oldId).val);
            if (Number.isFinite(oldVal) && oldVal > 0) {
               initial = oldVal * 60;
               log('Polling interval migrated: ' + level + 'PollingInterval ' + oldVal + ' min -> ' + pollingStateName(level) + ' ' + initial + ' s', 'info');
            }
         }
         await createStateAsync(newId, initial, pollingCommon(level));
      }
   }
   // high: highPollingIntervalSec keeps its name (old range 0-59 s), highPollingIntervalMin > 0 -> sec = min x 60
   const highId = dpPollingPath + pollingStateName('high');
   const highMinId = dpPollingPath + 'highPollingIntervalMin';
   if (!existsState(highId)) {
      await createStateAsync(highId, POLLING_DEFAULTS.high, pollingCommon('high'));
   } else {
      await updateCommonIfChanged(highId, pollingCommon('high')); // new range, unit and description
      const oldMin = existsState(highMinId) ? Number(getState(highMinId).val) : 0;
      if (Number.isFinite(oldMin) && oldMin > 0) {
         await setStateAsync(highId, oldMin * 60, true);
         await setStateAsync(highMinId, 0, true); // marker: migrated
         log('Polling interval migrated: highPollingIntervalMin ' + oldMin + ' min -> ' + pollingStateName('high') + ' ' + oldMin * 60 + ' s', 'info');
      } else if (getState(highId).val === 0) {
         await setStateAsync(highId, POLLING_DEFAULTS.high, true); // old value 0 (= disabled) is below the minimum
         log('Polling interval migrated: highPollingIntervalSec 0 -> ' + POLLING_DEFAULTS.high + ' s (default)', 'info');
      }
   }
   // mark the old datapoints as deprecated
   const deprecated = {
      lowPollingInterval: 'lowPollingIntervalSec',
      medPollingInterval: 'medPollingIntervalSec',
      highPollingIntervalMin: 'highPollingIntervalSec',
   };
   for (const oldName of Object.keys(deprecated)) {
      if (existsState(dpPollingPath + oldName)) {
         await updateCommonIfChanged(dpPollingPath + oldName, {
            desc: 'DEPRECATED since V3.5.0, not used any more, use ' + deprecated[oldName],
         });
      }
   }
   await ensureStatusStates();
}
await readPollingIntervals();
if (debug > 0) log('polling intervals datapoints (seconds) and status datapoints created', 'info');

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
   log('The script created the necessary datapoints if they did not exist', 'info');
   log('After setting the credentials please restart this script', 'info');
   stopMyScript();
   return; // prevent further execution (parallel call of schedules)
}

// -------------------------------------------------------------------------------------------------------------------
// read and check polling intervals from iobroker datapoints (only at script start)
// -------------------------------------------------------------------------------------------------------------------
/**
 * Checks the three polling intervals. All errors are collected.
 * R1: value is a number | R2: value is an integer | R3: value is within the limits of its level
 * R4: high < med < low (strict)
 * @param {{high: any, med: any, low: any}} values - values read from the datapoints (seconds)
 * @returns {string[]} - list of error texts, empty if the configuration is valid
 */
function validatePollingConfig(values) {
   const errors = [];
   const show = (v) => (v === null || v === undefined || v === '' ? '(empty)' : JSON.stringify(v));
   const isNum = {};
   for (const level of POLLING_LEVELS) {
      const name = pollingStateName(level);
      const v = values[level];
      const lim = POLLING_LIMITS[level];
      isNum[level] = typeof v === 'number' && Number.isFinite(v);
      if (!isNum[level]) {
         errors.push(name + ' = ' + show(v) + ': not a number (R1)');
      } else if (!Number.isInteger(v)) {
         errors.push(name + ' = ' + v + ': not a whole number of seconds (R2)');
      } else if (v < lim.min) {
         errors.push(name + ' = ' + v + ': below minimum (' + lim.min + ' s) (R3)');
      } else if (v > lim.max) {
         errors.push(name + ' = ' + v + ': above maximum (' + lim.max + ' s) (R3)');
      }
   }
   if (isNum.high && isNum.med && values.med <= values.high) {
      errors.push(
         pollingStateName('med') + ' = ' + values.med + ' is not greater than ' + pollingStateName('high') + ' = ' + values.high + ' (R4)'
      );
   }
   if (isNum.med && isNum.low && values.low <= values.med) {
      errors.push(
         pollingStateName('low') + ' = ' + values.low + ' is not greater than ' + pollingStateName('med') + ' = ' + values.med + ' (R4)'
      );
   }
   return errors;
}
/** Builds the one-time error message for an invalid polling configuration. */
function buildPollingErrorMessage(errors) {
   const range = POLLING_LEVELS.map((l) => l + ' ' + POLLING_LIMITS[l].min + '-' + POLLING_LIMITS[l].max).join(' | ');
   const defs = POLLING_LEVELS.map((l) => l + ' ' + POLLING_DEFAULTS[l]).join(' | ');
   return [
      '⚠️ Invalid polling configuration – script stopped',
      ...errors,
      'Allowed range in s: ' + range,
      'Rule: ' + pollingStateName('high') + ' < ' + pollingStateName('med') + ' < ' + pollingStateName('low'),
      'Defaults in s: ' + defs,
      'Please correct the datapoints in ' + dpPollingPath,
      'and restart the script.',
   ].join('\n');
}
const pollingValues = {};
try {
   for (const level of POLLING_LEVELS) {
      pollingValues[level] = getState(dpPollingPath + pollingStateName(level)).val;
   }
} catch (error) {
   log('Error reading polling intervals from datapoints: ' + error.message, 'error');
   stopMyScript();
   return; // prevent further execution
}
const pollingErrors = validatePollingConfig(pollingValues);
if (pollingErrors.length > 0) {
   log(buildPollingErrorMessage(pollingErrors), 'error');
   stopMyScript(); // stop script, the datapoint values are not changed
   return; // prevent further execution
}
highPollingIntervalSec = pollingValues.high;
medPollingIntervalSec = pollingValues.med;
lowPollingIntervalSec = pollingValues.low;
if (debug > 0) {
   log('Polling intervals in s: high ' + highPollingIntervalSec + ' | med ' + medPollingIntervalSec + ' | low ' + lowPollingIntervalSec, 'info');
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
      if (dispatcherTimer) clearInterval(dispatcherTimer);
   } catch (error) {}
   stopScript(); // stop script
}

if (envoy_username === null || envoy_username === undefined || envoy_username === '') {
   log('⚠️ variable envoy_username not set – script stopped', 'error');
   log('Please set the variable envoy_username to your Enphase Enlighten Cloud username', 'info');
   stopMyScript(); // stop script
   return; // prevent further execution (parallel call of schedules)
}
if (envoy_password === null || envoy_password === undefined || envoy_password === '') {
   log('⚠️ variable envoy_password not set – script stopped', 'error');
   log('Please set the variable envoy_password to your Enphase Enlighten Cloud password', 'info');
   stopMyScript(); // stop script
   return; // prevent further execution (parallel call of schedules)
}
if (envoy_serial_no === null || envoy_serial_no === undefined || envoy_serial_no === '') {
   log('⚠️ variable envoy_serial_no not set – script stopped', 'error');
   log('Please set the variable envoy_serial_no to the serial number of your Envoy device', 'info');
   stopMyScript(); // stop script
   return; // prevent further execution (parallel call of schedules)
}
if (!/^\d{12}$/.test(envoy_serial_no)) {
   //check, if exactly 12 digits
   log('⚠️ envoy_serial_no must be exactly 12 digits – script stopped', 'error');
   log(
      'Please check the variable envoy_serial_no. It must contain exactly 12 digits (no letters, no special characters)',
      'info'
   );
   stopMyScript(); // stop script
   return; // prevent further execution (parallel call of schedules)
}
if (envoy_ip === null || envoy_ip === undefined || envoy_ip === '') {
   log('⚠️ variable envoy_ip not set – script stopped', 'error');
   log('Please set the variable envoy_ip to the IP address of your Envoy device', 'info');
   stopMyScript(); // stop script
   return; // prevent further execution (parallel call of schedules)
}
if (!isValidIPv4(envoy_ip)) {
   log('⚠️ envoy_ip is not a valid IPv4 address – script stopped', 'error');
   log('Please check the variable envoy_ip. It must contain a valid IPv4 address (e.g. 192.168.1.1)', 'info');
   stopMyScript(); // stop script
   return; // prevent further execution (parallel call of schedules)
}
if (debug > 0) log('All mandatory variables are set. Proceeding', 'info');

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
/**
 * Validates the format of a bearer token.
 * @param {string} token - The token to validate.
 * @returns {boolean} - Returns true if the token is valid, false otherwise.
 */
function isValidToken(token) {
   // Check if the token is a non-empty string
   if (typeof token !== 'string' || token.trim() === '') {
      return false;
   }

   // Check the length of the token (e.g., 128 characters)
   if (token.length < 50 || token.length > 512) {
      return false;
   }

   // Check for allowed characters (alphanumeric, dots, dashes, underscores)
   const tokenRegex = /^[a-zA-Z0-9._-]+$/;
   if (!tokenRegex.test(token)) {
      return false;
   }

   return true;
}
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

   if (debug > 0) log('Renew token. 1. Login to enlighten.enphaseenergy.com to get session_id', 'info');

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

      if (debug > 0) log('2. Login to entrez.enphaseenergy.com to get new token', 'info');
      const tokenResponse = await fetch('https://entrez.enphaseenergy.com/tokens', {
         method: 'POST',
         body: JSON.stringify(tokenData),
         headers: {
            'Content-Type': 'application/json',
         },
      });
      const tokenRaw = await tokenResponse.text();
      // Validate the token
      if (!isValidToken(tokenRaw)) {
         log('Invalid token received: ' + tokenRaw, 'error');
         throw new Error('Token validation failed. Received an invalid token');
      }
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
      req.setTimeout(REQUEST_TIMEOUT_MS, () => {
         req.destroy(new Error('Request timed out after ' + REQUEST_TIMEOUT_MS + 'ms'));
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
      req.write(SC_STREAM_ENABLE_BODY);
      req.setTimeout(REQUEST_TIMEOUT_MS, () => {
         req.destroy(new Error('Request timed out after ' + REQUEST_TIMEOUT_MS + 'ms'));
      });
      req.on('error', (error) => {
         reject(error);
      });
      req.end();
   });
}
//Helper function to convert html-respones to escaped text
function escapeHtml(html) {
    return html
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
// Helper funtion checks if the response is an HTML error page instead of JSON/Token
function isHtmlError(response) {
    if (typeof response !== 'string') return false;
    
    const html = response.toLowerCase();
    return (
        html.includes('<html') ||
        html.includes('<!doctype html') ||
        html.includes('<body') ||
        (html.includes('error') && html.includes('unauthorized'))
    );
   }
// Shared HTTPS agent for ALL gateway requests (GetEnvoyData, PostEnvoyData, probeGateway):
// - maxSockets: 1 -> never more than one connection to the gateway at the same time (OneConnect, Issue #42).
//   The dispatcher additionally makes sure that only one request is running at a time.
// - keepAlive: true -> the connection is reused, fewer TLS handshakes
// Background: firmware D8.3.5528.260506 reboots when too many connections are opened at once
const envoyAgent = new https.Agent({
   keepAlive: true,
   keepAliveMsecs: 1000,
   maxSockets: 1,
   maxFreeSockets: 1,
});

// get envoy data from local envoy
async function GetEnvoyData(envoy_ip, envoy_path, bearer_token, log_msg, debug = 0) {
   // Set up HTTPS request options for local Envoy
   const options = {
      hostname: envoy_ip,
      port: 443,
      path: envoy_path,
      method: 'GET',
      rejectUnauthorized: false, // Ignore invalid certificate
      agent: envoyAgent,
      headers: {
         Authorization: `Bearer ${bearer_token}`,
         Accept: 'application/json', // Request JSON response
      },
   };

   if (debug > 0) log(log_msg + '...started', 'info');
   if (debug > 1) log('Query local Envoy IP: ' + envoy_ip + ' ...process started', 'info');
   let jsonData;

  // start request and check for errors
   try {
      const response = await httpsRequestAsyncGet(options);
      if (debug > 1) log('Query local Envoy IP: ' + envoy_ip, 'info');
      if (debug > 2) log('Response from local Envoy: ' + response, 'info');
      if (isHtmlError(response)) {
        log('Error querying local Envoy at IP ' + envoy_ip + ': response is HTML error page - not JSON', 'error');
        log('Response: ' + escapeHtml(response), 'error');
        jsonData = {};
      } else {
         jsonData = JSON.parse(response);
      }
   } catch (error) {
      // Network error (timeout, connection refused, gateway reboot, etc.)
      // State management (consecutiveErrors, gatewayOffline) is handled at cycle level by updateGatewayState()
      if (!gatewayOffline) {
         log('⚠️ Error querying gateway at IP ' + envoy_ip + ': ' + escapeHtml(error instanceof Error ? error.message : String(error)), 'error');
      }
      return false;
   }

   try {
      http_resp_json = JSON.stringify(jsonData, null, 2);
      if (debug > 2) log('JSON data to be processed: ' + JSON.stringify(jsonData), 'info');
      if (debug > 1) log(log_msg + 'ok', 'info');
      return true;
   } catch (error) {
      if (!gatewayOffline) log(log_msg + (error instanceof Error ? error.message : String(error)) + ' | Error cnt: ' + String(error_cnt), 'error');
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
      agent: envoyAgent,
      headers: {
         Authorization: `Bearer ${bearer_token}`,
         'Content-Type': 'application/json',
         'Content-Length': Buffer.byteLength(SC_STREAM_ENABLE_BODY),
      },
   };

   if (debug > 0) log(log_msg + '...started', 'info');
   if (debug > 1) log('Query local Envoy IP: ' + envoy_ip + ' ...process started', 'info');
   let jsonData;

  // start request and check for errors
   try {
      const response = await httpsRequestAsyncPost(options);
      if (debug > 1) log('Query local Envoy IP: ' + envoy_ip, 'info');
      if (debug > 2) log('Response from local Envoy: ' + response, 'info');
      if (isHtmlError(response)) {
        log('Error querying local Envoy at IP ' + envoy_ip + ': response is HTML error page - not JSON', 'error');
        log('Response: ' + escapeHtml(response), 'error');
        jsonData = {};
      } else {
         jsonData = JSON.parse(response);
      }
   } catch (error) {
      // Network error – state management handled at cycle level by updateGatewayState()
      if (!gatewayOffline) {
         log('⚠️ Error querying gateway at IP ' + envoy_ip + ': ' + escapeHtml(error instanceof Error ? error.message : String(error)), 'error');
      }
      return false;
   }

   try {
      http_resp_json = JSON.stringify(jsonData, null, 2);
      if (debug > 2) log('JSON data to be processed: ' + JSON.stringify(jsonData), 'info');
      if (debug > 1) log(log_msg + 'ok', 'info');
      return true;
   } catch (error) {
      if (!gatewayOffline) log(log_msg + ': ' + (error instanceof Error ? error.message : String(error)) + ' | Error cnt: ' + String(error_cnt), 'error');
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
/**
 * Updates gateway state after a complete polling cycle.
 * Must be called once per cycle with the total number of failed requests in that cycle.
 * Recovery and offline detection are tracked at cycle level (not per-request) to avoid
 * false recoveries when only the first of several requests in a cycle succeeds.
 * @param {number} cycleErrors - Number of failed GetEnvoyData calls in this cycle.
 */
function updateGatewayState(cycleErrors) {
   lastCycleErrors = cycleErrors; // for the status datapoints
   if (cycleErrors === 0) {
      // Entire cycle succeeded
      if (consecutiveErrors > 0) {
         if (gatewayOffline) {
            log('✅ Gateway ' + envoy_ip + ' is back online after ' + consecutiveErrors + ' cycle(s) with errors.', 'info');
         }
         consecutiveErrors = 0;
         gatewayOffline = false;
         error_cnt = 0;
      }
   } else {
      // At least one request in this cycle failed
      consecutiveErrors++;
      error_cnt++;
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS && !gatewayOffline) {
         gatewayOffline = true;
         log('⚠️ Gateway ' + envoy_ip + ' appears to be offline or rebooting – error logging suppressed until recovery.', 'warn');
      }
   }
}
/**
 * Sends a single lightweight HTTP request to check if the gateway SERVICE is responding.
 * Used as recovery probe when gatewayOffline=true instead of running all endpoints.
 * Note: Network reachability alone is not sufficient – the gateway service may still be booting
 * after a reboot even when the host is ping-reachable.
 * @returns {Promise<boolean>} - true if gateway responds with valid JSON, false otherwise.
 */
async function probeGateway() {
   const options = {
      hostname: envoy_ip,
      port: 443,
      path: ivp_production_v1, // lightweight endpoint for service probe
      method: 'GET',
      rejectUnauthorized: false,
      agent: envoyAgent,
      headers: {
         Authorization: `Bearer ${bearer_token}`,
         Accept: 'application/json',
      },
   };
   try {
      const response = await httpsRequestAsyncGet(options);
      const responseStr = String(response);
      if (isHtmlError(responseStr)) {
         // A 401/Unauthorized HTML response may indicate an expired token rather than an
         // offline gateway. Attempt token renewal now so the next probe uses a fresh token.
         if (responseStr.toLowerCase().includes('unauthorized') || responseStr.toLowerCase().includes('401')) {
            log('⚠️ Probe received 401 – token may have expired. Attempting renewal.', 'warn');
            const newToken = await renewEnvoyToken(envoy_username, envoy_password, envoy_serial_no, debug);
            if (newToken) {
               bearer_token = newToken;
               log('✅ Token renewed during offline probe – will retry on next probe cycle.', 'info');
            } else {
               log('⚠️ Token renewal failed during probe – will retry at next scheduled renewal.', 'warn');
            }
         }
         return false;
      }
      JSON.parse(responseStr); // Valid JSON = service is up and responding
      return true;
   } catch (error) {
      return false; // Service still not responding
   }
}
// single requests of data (job "startup-eh_devs" of the dispatcher, runs once as the first job)
async function runStartup() {
   // 1. Get PV EH DEVS
   if (await GetEnvoyData(envoy_ip, ivp_eh_devs, bearer_token, 'Get EH DEVS data : ', debug)) {
      if (debug > 1) log('Processing eh devs data', 'info');
      const ehDevsData = safeParseJSON(http_resp_json);
      await IObSetState(dpPrefix + 'eh_devs', ehDevsData);
   }
}
// Cycle functions: the dispatcher (below) calls them one after another, never in parallel.
// Main cyclic program loop low frequency
async function runLowCycle() {
   try {
      if (gatewayOffline) return; // High-freq cycle handles probe – skip low-freq entirely
      if (error_cnt <= 0) {
         if (debug > 0)
            log('Cyclic polling started (low). Polling interval: ' + lowPollingIntervalSec + ' s', 'info');
         if (debug > 2) log('Current error count: ' + error_cnt, 'info');
         if (debug > 1) log('Fetching data from local Envoy IP: ' + envoy_ip + ' ...process started', 'info');
         let cycleErrors = 0;
         // A. Get PV DEVICE LIST
         if (await GetEnvoyData(envoy_ip, ivp_device_list, bearer_token, 'Get DEVICE LIST data : ', debug)) {
            if (debug > 1) log('Processing device list data', 'info');
            const deviceListData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'device_list', deviceListData);
         } else { cycleErrors++; }
         // B. status meters
         if (await GetEnvoyData(envoy_ip, ivp_meters_status, bearer_token, 'Get Meters status data : ', debug)) {
            if (debug > 1) log('Processing meters status data', 'info');
            const metersStatusData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'meters.status', metersStatusData);
         } else { cycleErrors++; }
         updateGatewayState(cycleErrors);
      }
   } catch (err) {
      log('Error in low freq. polling loop: ' + err.message, 'error');
   }
}
// Main cyclic program loop med frequency
async function runMedCycle() {
   try {
      if (gatewayOffline) return; // High-freq cycle handles probe – skip med-freq entirely
      if (error_cnt <= 0) {
         if (debug > 0)
            log('Cyclic polling started (medium). Polling interval: ' + medPollingIntervalSec + ' s', 'info');
         if (debug > 2) log('Current error count: ' + error_cnt, 'info');
         if (debug > 1) log('Fetching data from local Envoy IP: ' + envoy_ip + ' ...process started', 'info');
         let cycleErrors = 0;
         // 1. Get PV METER PRODUCTION
         if (await GetEnvoyData(envoy_ip, ivp_prod, bearer_token, 'Get Prod. data: ', debug)) {
            if (debug > 1) log('Processing production data', 'info');
            const prodData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'production', prodData);
         } else { cycleErrors++; }
         // 2. Get PV METER CONSUMPTION
         if (await GetEnvoyData(envoy_ip, ivp_cons, bearer_token, 'Get Cons. data: ', debug)) {
            if (debug > 1) log('Processing consumption data', 'info');
            const consData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'consumption', consData);
         } else { cycleErrors++; }
         // 3. Get PV PRODUCTION.JSON
         if (await GetEnvoyData(envoy_ip, ivp_production, bearer_token, 'Get production.json data: ', debug)) {
            if (debug > 1) log('Processing production.json data', 'info');
            // Note: This URL is deprecated but still includes the "whToday" counter
            // which is not included in the new "/ivp/meters/reports/production" URL
            const prodStatData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'prod_stat', prodStatData);
         } else { cycleErrors++; }
         // 4. Get PV MICRO INVERTER
         if (await GetEnvoyData(envoy_ip, ivp_inverters, bearer_token, 'Get Inv. data : ', debug)) {
            if (debug > 1) log('Processing inverter data', 'info');
            const inverterData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'inverter', inverterData);
         } else { cycleErrors++; }
         // 5. Get PV INVENTORY
         if (await GetEnvoyData(envoy_ip, ivp_inventory, bearer_token, 'Get INVENTORY data : ', debug)) {
            if (debug > 1) log('Processing inventory data', 'info');
            const inventoryData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'inventory', inventoryData);
         } else { cycleErrors++; }
         // 6. Get PV PRODUCTION V1
         if (await GetEnvoyData(envoy_ip, ivp_production_v1, bearer_token, 'Get PRODUCTION V1 data : ', debug)) {
            if (debug > 1) log('Processing PRODUCTION V1 data', 'info');
            const productionV1Data = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'production', productionV1Data);
         } else { cycleErrors++; }
         updateGatewayState(cycleErrors);
      }
   } catch (err) {
      log('Error in mid freq. polling loop: ' + err.message, 'error');
   }
}
// Main cyclic program loop high frequency
async function runHighCycle() {
   try {
      if (gatewayOffline) {
         // Gateway is offline – send a single lightweight probe to detect service recovery
         if (debug > 0) log('Gateway offline – sending probe request to ' + envoy_ip, 'info');
         const recovered = await probeGateway();
         if (recovered) {
            log('✅ Gateway ' + envoy_ip + ' service is responding – resuming normal polling on next cycle.', 'info');
            gatewayOffline = false;
            consecutiveErrors = 0;
            error_cnt = 0;
         }
         return;
      }
      if (error_cnt <= 0) {
         if (debug > 0) log('High cyclic polling started. Polling interval: ' + highPollingIntervalSec + ' s', 'info');
         if (debug > 2) log('Current error count: ' + error_cnt, 'info');
         if (debug > 1) log('Fetching data from local Envoy IP: ' + envoy_ip + ' ...process started', 'info');
         let cycleErrors = 0;
         // 1. Get PV METER READINGS
         if (await GetEnvoyData(envoy_ip, ivp_read, bearer_token, 'Get Meter data: ', debug)) {
            if (debug > 1) log('Processing meter readings data', 'info');
            const meterData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'meters', meterData);
         } else { cycleErrors++; }
         // 2. Get PV LIVEDATA
         if (await GetEnvoyData(envoy_ip, ivp_livedata, bearer_token, 'Get LIVEDATA data : ', debug)) {
            if (debug > 1) log('Processing livedata data', 'info');
            const livedataData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'livedata', livedataData);
            // sc_stream retry: if stream is disabled in polling cycle, trigger POST to enable it
            // (complements the on()-handler which only fires on value changes)
            const scStreamState = existsState(dpPrefix + 'livedata.connection.sc_stream')
               ? getState(dpPrefix + 'livedata.connection.sc_stream')
               : null;
            if (!scStreamState || scStreamState.val === 'disabled') {
               if (debug > 0) log('SC stream is disabled in polling cycle. Attempting to enable it.', 'info');
               await PostEnvoyData(envoy_ip, ivp_livedata_stream, bearer_token, 'POST sc_stream (polling): ', debug);
            }
         } else { cycleErrors++; }
         // 3. Get PV METER Grid Reading
         if (await GetEnvoyData(envoy_ip, ivp_grid_reading, bearer_token, 'Get Grid Reading data : ', debug)) {
            if (debug > 1) log('Processing grid reading data', 'info');
            const gridReadingData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'meters.gridReading', gridReadingData);
         } else { cycleErrors++; }
         // 4. Get PV METER PDM Energy
         if (await GetEnvoyData(envoy_ip, ivp_pdm_energy, bearer_token, 'Get PDM Energy data : ', debug)) {
            if (debug > 1) log('Processing PDM Energy data', 'info');
            const pdmEnergyData = safeParseJSON(http_resp_json);
            await IObSetState(dpPrefix + 'PDM.energy', pdmEnergyData);
         } else { cycleErrors++; }
         updateGatewayState(cycleErrors);
      } else {
         // Slow down polling in case of errors
         if (!gatewayOffline && debug > 0) log('Previous errors detected - skipping cycle. Error count: ' + error_cnt, 'info');
         error_cnt = typeof error_cnt === 'number' ? error_cnt : 0;
         error_cnt -= 1;
      }
   } catch (err) {
      log('Error in high freq. polling loop: ' + err.message, 'error');
   }
}

// -------------------------------------------------------------------------------------------------------------------
// sc stream enable (event job)
// -------------------------------------------------------------------------------------------------------------------
async function runScStreamEnable() {
   if (debug > 0) log('SC stream is disabled. Attempting to enable it', 'info');
   const success = await PostEnvoyData(envoy_ip, ivp_livedata_stream, bearer_token, 'POST sc_stream data: ', debug);
   // Immediately re-read livedata so sc_stream reflects the new state without waiting for the next polling cycle
   if (success) {
      if (await GetEnvoyData(envoy_ip, ivp_livedata, bearer_token, 'Refresh LIVEDATA after sc_stream enable: ', debug)) {
         const livedataData = safeParseJSON(http_resp_json);
         await IObSetState(dpPrefix + 'livedata', livedataData);
      }
   }
}

// -------------------------------------------------------------------------------------------------------------------
// dispatcher: exactly one gateway job at a time (OneConnect)
// -------------------------------------------------------------------------------------------------------------------
// Jobs: one-time and event jobs (FIFO, always first), then the cycles high/med/low. If several cycles are due,
// the one with the earliest due time runs first (tie: high, med, low). If a cycle is delayed by a running job it
// starts afterwards (lag). Cycles keep a fixed grid without backlog: missed runs are not caught up.
// -------------------------------------------------------------------------------------------------------------------
const dispatcherStart = Date.now();
const cycleRunners = { high: runHighCycle, med: runMedCycle, low: runLowCycle };
const cycleIntervalSec = { high: highPollingIntervalSec, med: medPollingIntervalSec, low: lowPollingIntervalSec };
/** cyclic jobs in priority order (high, med, low) */
const cycleJobs = POLLING_LEVELS.map((level) => ({
   name: level,
   every: cycleIntervalSec[level] * 1000,
   due: dispatcherStart + START_OFFSET_SEC[level] * 1000,
   run: cycleRunners[level],
}));
/** one-time and event jobs (FIFO) */
const jobQueue = [{ name: 'startup-eh_devs', run: runStartup }];
let dispatcherRunning = false;
const statusCache = {}; // last written status values - only changes are written

/** Adds a one-time/event job to the queue, a job with the same name that is already waiting is not added twice. */
function enqueueJob(name, run) {
   if (jobQueue.some((job) => job.name === name)) {
      if (debug > 1) log('Job ' + name + ' is already waiting', 'info');
      return;
   }
   jobQueue.push({ name: name, run: run });
}
/** Returns the due cycle with the earliest due time (tie: order high, med, low) or null. */
function dueCycle() {
   const now = Date.now();
   let best = null;
   for (const job of cycleJobs) {
      if (job.due <= now && (best === null || job.due < best.due)) best = job;
   }
   return best;
}
/** Writes a status value only if it changed (keeps the number of setState calls low). */
function setStatus(name, value) {
   if (statusCache[name] === value) return;
   statusCache[name] = value;
   setState(dpStatusPath + name, value, true);
}
/** Writes the status datapoints after a job. */
function writeStatus(job, startedAt, durationMs, lagMs, errors) {
   if (job.every) {
      setStatus(job.name + '.lastStart', startedAt);
      setStatus(job.name + '.lastDurationMs', durationMs);
      setStatus(job.name + '.lastLagMs', lagMs);
      if (errors !== undefined) setStatus(job.name + '.lastErrors', errors);
   }
   setStatus('gatewayOffline', gatewayOffline);
   setStatus('consecutiveErrors', consecutiveErrors);
   setStatus('pendingJobs', jobQueue.length);
}
async function dispatcherTick() {
   if (dispatcherRunning) return; // exactly one job at a time
   const job = jobQueue.shift() || dueCycle(); // event/one-time job first, otherwise a due cycle
   if (!job) return;
   dispatcherRunning = true;
   const startedAt = Date.now();
   const lagMs = job.every ? Math.max(0, startedAt - job.due) : 0;
   lastCycleErrors = undefined;
   try {
      await job.run();
   } catch (err) {
      log('Dispatcher: error in job ' + job.name + ': ' + (err instanceof Error ? err.message : String(err)), 'error');
   } finally {
      dispatcherRunning = false;
      if (job.every) {
         // fixed grid without backlog
         while (job.due <= Date.now()) job.due += job.every;
      }
   }
   try {
      const durationMs = Date.now() - startedAt;
      if (job.every && lagMs > job.every) {
         log('Dispatcher: cycle ' + job.name + ' started ' + Math.round(lagMs / 1000) + ' s late (interval ' + job.every / 1000 + ' s). Intervals too short for the response time of the gateway?', 'warn');
      }
      if (debug > 1) log('Dispatcher: job ' + job.name + ' finished (duration ' + durationMs + ' ms, lag ' + lagMs + ' ms)', 'info');
      writeStatus(job, startedAt, durationMs, lagMs, lastCycleErrors);
   } catch (err) {
      log('Dispatcher: error writing status: ' + (err instanceof Error ? err.message : String(err)), 'error');
   }
}
dispatcherTimer = setInterval(dispatcherTick, DISPATCH_TICK_MS);

// -------------------------------------------------------------------------------------------------------------------
// automatic sc stream update
// -------------------------------------------------------------------------------------------------------------------
// sc stream update after state change in ioBroker to disabled: the POST is executed as a job of the dispatcher
// -------------------------------------------------------------------------------------------------------------------
on({ id: dpPrefix + 'livedata.connection.sc_stream', change: 'ne' }, (obj) => {
   if ((obj.state ? obj.state.val : 'disabled') == 'disabled') {
      enqueueJob('sc_stream-enable', runScStreamEnable);
   }
});

// -------------------------------------------------------------------------------------------------------------------
// change of the polling configuration while the script is running
// -------------------------------------------------------------------------------------------------------------------
// Changes by the user (ack = false) are NOT applied. Once per script run an info is logged: restart required.
// The values are checked at the next start (validatePollingConfig).
// -------------------------------------------------------------------------------------------------------------------
let pollingChangeInfoShown = false;
on(
   { id: POLLING_LEVELS.map((level) => dpPollingPath + pollingStateName(level)), change: 'ne', ack: false },
   (obj) => {
      if (pollingChangeInfoShown) return;
      pollingChangeInfoShown = true;
      const name = String(obj.id).substring(String(obj.id).lastIndexOf('.') + 1);
      const oldVal = obj.oldState ? obj.oldState.val : '?';
      const newVal = obj.state ? obj.state.val : '?';
      log(
         'ℹ️ Polling configuration changed (' + name + ': ' + oldVal + ' -> ' + newVal + ').\n' +
            'The new values are not applied while the script is running.\n' +
            'Please restart the script to apply them. The values are checked at startup.',
         'info'
      );
   }
);

// -------------------------------------------------------------------------------------------------------------------
// automatic token renewal
// -------------------------------------------------------------------------------------------------------------------
// Periodic token renewal. Default: Daily at midnight. Adjust as needed.
// -------------------------------------------------------------------------------------------------------------------
const tokenRenewalSchedule = schedule('0 0 0 * * *', async () => {
   if (debug > 0) log('Automatic token renewal started', 'info');
   const newToken = await renewEnvoyToken(envoy_username, envoy_password, envoy_serial_no, debug);
   if (newToken) {
      bearer_token = newToken;
      if (debug > 0) log('Token renewal successful.', 'info');
   } else {
      log('⚠️ Token renewal failed – keeping existing token. Will retry at next scheduled renewal.', 'warn');
   }
});
