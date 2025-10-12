// ioBroker Skript: Enphase Cloud OAuth2 Flow
// Dieses Skript startet einen kleinen Webserver in ioBroker,
// um den Enphase-Authorization-Code-Flow auszuführen und
// den Bearer-Token in ioBroker-Objekten abzulegen.

const fetch = require('node-fetch');
const express = require('express');
const fs = require('fs');
const path = require('path');
const open = require('open');
const { get } = require('http');
const { clear } = require('console');

// -------------------------------------------------------------------------------------------------------------------
// user configurable variables :: please adjust to your needs
// -------------------------------------------------------------------------------------------------------------------
let debug = 0; // Debug level (0=none, 1=info, 2=advanced, 3=debug)
const dpBasicPath = '0_userdata.0.enphase.cloud.'; // datapoint path to store the values
const dpBasicConfigPath = '0_userdata.0.enphase.config.cloud.'; // datapoint path to store the values
const dpCredentialsPath = dpBasicConfigPath + 'credentials.'; // datapoint path to store user credentials
const dpConfigPath = dpBasicConfigPath + 'config.'; // datapoint path to store config variables
const dpAccess = dpCredentialsPath + 'access_token'; // datapoint path to store access token
const dpRefresh = dpCredentialsPath + 'refresh_token'; // datapoint path to store refresh token
const dpExpire = dpCredentialsPath + 'access_expires_at'; // datapoint path to store access token expiry time
const dpExpireTS = dpCredentialsPath + 'access_expires_at_ts'; // datapoint path to store access token expiry time as timestamp
const dpServerURI = dpConfigPath + 'server_URI'; // datapoint path to store server URI
const dpApiKey = dpCredentialsPath + 'Api_Key'; // datapoint path to store Api Key
const dbSystemIDs = dpBasicPath + 'SystemIDs'; // datapoint path to store system IDs found by FetchSystems
// global constants for timestamp validation
const MIN_VALID_TIMESTAMP = 1685000000; // unix timestamp -> seconds since 1970-01-01 :: 1685000000 ≈ Juni 2023
const MAX_VALID_TIMESTAMP = 4100000000; // unix timestamp -> seconds since 1970-01-01 :: 4100000000 ≈ Januar 2100

// -----------------------------------------------------------------------------------------------------------------------------------
// check datapoints for user credentials
// -----------------------------------------------------------------------------------------------------------------------------------
// Create credentials states if not existing
// Helper to create state and wait for completion
// Create credentials states if not existing
async function ensureStateAsync(id, value, options = { read: true, write: true }) {
   if (!existsState(id)) {
      await createStateAsync(id, value, options);
   }
}
await ensureStateAsync(dpCredentialsPath + 'Client_ID', '', { type: 'string', role: 'text', read: true, write: true });
await ensureStateAsync(dpCredentialsPath + 'Client_Secret', '', {
   type: 'string',
   role: 'text',
   read: true,
   write: true,
});
await ensureStateAsync(dpApiKey, '', { type: 'string', role: 'text', read: true, write: true });
await ensureStateAsync(dpConfigPath + 'Port', 3080, { type: 'number', role: 'value', read: true, write: true });
await ensureStateAsync(dpAccess, '', { type: 'string', role: 'text', read: true, write: true });
await ensureStateAsync(dpRefresh, '', { type: 'string', role: 'text', read: true, write: true });
await ensureStateAsync(dpExpire, '', { type: 'string', role: 'text', read: true, write: true });
await ensureStateAsync(dpExpireTS, 0, { type: 'number', role: 'value', read: true, write: true });
await ensureStateAsync(dbSystemIDs, '', { type: 'string', role: 'text', read: true, write: true });
await ensureStateAsync(dpServerURI, 'http://localhost', { type: 'string', role: 'text', read: true, write: true });
await setState(dpConfigPath + 'Port', getState(dpConfigPath + 'Port').val, true); // ensure acknowledgement is true without changing value
await setState(dpServerURI, getState(dpServerURI).val, true); // ensure acknowledgement is true without changing value
if (debug > 0) console.log('datapoints checked/created');

// --------------------------------------------------
// Werte aus ioBroker States lesen
// --------------------------------------------------
let Client_ID = '';
let Client_Secret = '';
let Api_Key = '';
let Port = 3080;
let serverURI = '';
let redirect_URI = '';
try {
   Client_ID = getState(dpCredentialsPath + 'Client_ID').val || '';
   Client_Secret = getState(dpCredentialsPath + 'Client_Secret').val || '';
   Api_Key = getState(dpApiKey).val || '';
   Port = getState(dpConfigPath + 'Port').val;
   serverURI = getState(dpServerURI).val;
   redirect_URI = serverURI + ':' + Port + '/callback';
} catch (err) {
   console.error('Error reading states: ' + err.message);
}

// -------------------------------------------------------------------------------------------------------------------
// save stop script
// -------------------------------------------------------------------------------------------------------------------
function stopMyScript() {
   // Stop the script and clear schedules
   try {
      clearSchedule(tokenRenewalSchedule);
      clearSchedule(checkEventsAndAlarms);
      clearSchedule(fetchDevices);
   } catch (error) {}
   stopScript(); // stop script
}

// -------------------------------------------------------------------------------------------------------------------
// Validierung der Eingaben
// -------------------------------------------------------------------------------------------------------------------
// Überprüfen, ob alle erforderlichen Eingaben vorhanden sind
if (!Client_ID) throw new Error('Client_ID is missing');
if (!Client_Secret) throw new Error('Client_Secret is missing');
if (!Api_Key) throw new Error('Api_Key is missing');
if (!serverURI) throw new Error('serverURI is missing');
if (!Port) throw new Error('Port is missing');
if (!serverURI.startsWith('http://') && !serverURI.startsWith('https://')) {
   throw new Error('serverURI must start with http:// or https://');
}
if (typeof Port !== 'number' || Port < 1 || Port > 65535) {
   throw new Error('Port must be a number between 1 and 65535');
}
if (debug >= 0) console.log('Input validation passed');

// -------------------------------------------------------------------------------------------------------------------
// Enphase specific values and server setup
// -------------------------------------------------------------------------------------------------------------------
const AUTH_URL = 'https://api.enphaseenergy.com/oauth/authorize';
const TOKEN_URL = 'https://api.enphaseenergy.com/oauth/token';

// -------------------------------------------------------------------------------------------------------------------
// Express Webserver Setup :: startpage + callback to receive the authorization code
// -------------------------------------------------------------------------------------------------------------------
const app = express();
let server; // Reference to Express server for later shutdown
// Homepage: Link to Enphase login
app.get('/', (req, res) => {
   const loginUrl =
      AUTH_URL +
      '?response_type=code' +
      '&client_id=' +
      encodeURIComponent(Client_ID) +
      '&redirect_uri=' +
      encodeURIComponent(redirect_URI) +
      '&state=' +
      encodeURIComponent('enphase_' + Date.now());

   res.send(`<h3>Enphase OAuth2</h3>
              <p><a href="${loginUrl}">Login with Enphase</a></p><p>
              <small>After login, you will be redirected back to ioBroker.<br>
              The access token will be automatically saved in the ioBroker objects.</small></p>`);
});
if (debug >= 1) console.log('Express server homepage setup done');
// Callback: Enphase redirects here with ?code=...
app.get('/callback', async (req, res) => {
   const { code } = req.query;
   if (!code) return res.send('No code received');

   const basic = Buffer.from(`${Client_ID}:${Client_Secret}`).toString('base64');
   const tokenUrl = `${TOKEN_URL}?grant_type=authorization_code&code=${encodeURIComponent(
      code
   )}&redirect_uri=${encodeURIComponent(redirect_URI)}`;

   try {
      const resp = await fetch(tokenUrl, {
         method: 'POST',
         headers: {
            Authorization: `Basic ${basic}`,
            'Content-Type': 'application/x-www-form-urlencoded',
         },
      });
      const data = await resp.json();
      if (debug >= 1) console.log('token renew request finished');
      if (debug >= 2) console.log('token renew response: ' + JSON.stringify(data));
      if (!resp.ok) {
         res.send('Fehler: ' + JSON.stringify(data));
         return;
      }
      // Save to ioBroker states
      setState(dpAccess, data.access_token, true);
      setState(dpRefresh, data.refresh_token, true);
      if (debug >= 2) console.log('tokens saved to states');

      // Calculate and store expiry time
      const expiresIn = data.expires_in;
      const now = Date.now();
      const expiryTime = new Date(now + expiresIn * 1000);
      setState(dpExpire, expiryTime.toISOString(), true);
      setState(dpExpireTS, expiryTime.getTime(), true);
      if (debug >= 0) console.log('Access token expires at: ' + expiryTime.toLocaleString());

      res.send(`<h3>Token saved ✅</h3>
              <p>Access token expires at:<br><b>${expiryTime.toLocaleString()}</b></p>
              <pre>${JSON.stringify(data, null, 2)}</pre>`);
   } catch (e) {
      setState(dpAccess, '', true);
      setState(dpRefresh, '', true);
      setState(dpExpire, '', true);
      res.send('Exception: ' + e.message);
      console.error('Error during token request: ' + e.message);
      console.error('Script stopped. Please re-authenticate by restarting the script');
      stopMyScript();
   }
});
if (debug >= 1) console.log('Express server callback done');

// -------------------------------------------------------------------------------------------------------------------
// Token Refresh Funktion
// -------------------------------------------------------------------------------------------------------------------
// Manual token refresh via script function
async function refreshToken() {
   const refreshToken = getState(dpRefresh).val;
   if (!refreshToken) {
      console.error('No refresh token available');
      return;
   }
   const basic = Buffer.from(`${Client_ID}:${Client_Secret}`).toString('base64');
   const url = `${TOKEN_URL}?grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`;

   const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}` },
   });
   const data = await resp.json();
   if (resp.ok) {
      setState(dpAccess, data.access_token, true);
      setState(dpRefresh, data.refresh_token, true);
      console.log('Token successfully renewed');
      // Ablaufzeit berechnen und speichern
      if (data.expires_in) {
         const now = Date.now();
         const expiryTime = new Date(now + data.expires_in * 1000);
         setState(dpExpire, expiryTime.toISOString(), true);
         console.log('Access token expires at:', expiryTime.toLocaleString());
      } else {
         setState(dpExpire, '', true);
         console.warn('No expires_in field in token response');
      }
      if (debug >= 2) console.log('token renew response: ' + getState(dpExpire).val);
   } else {
      setState(dpAccess, '', true);
      setState(dpRefresh, '', true);
      setState(dpExpire, '', true);
      console.error('Refresh error: ' + JSON.stringify(data));
      console.error('Script stopped. Please re-authenticate');
      console.error('Script stopped. Please re-authenticate by restarting the script');
      stopMyScript();
   }
}

// -------------------------------------------------------------------------------------------------------------------
// Start Express server and schedule token refresh
// -------------------------------------------------------------------------------------------------------------------
// Try to refresh the token regularly (e.g. every 6 hours)
let tokenRenewalSchedule = schedule('0 */6 * * *', refreshToken);

// -------------------------------------------------------------------------------------------------------------------
// Start Express server
// -------------------------------------------------------------------------------------------------------------------
server = app.listen(Port, () => {
   open(`${serverURI}:${Port}/`);
   console.log('Enphase OAuth server is running at ' + serverURI + ':' + Port);
});

// -------------------------------------------------------------------------------------------------------------------
// Clean shutdown of Express server on script stop
// -------------------------------------------------------------------------------------------------------------------
// When the script or adapter is stopped → cleanly shut down Express
onStop(
   (callback) => {
      try {
         if (server) {
            server.close(() => {
               console.log('Enphase OAuth server stopped');
               callback();
            });
         } else {
            callback();
         }
      } catch (err) {
         console.error('Error stopping the server: ' + err.message);
         callback();
      }
   },
   2000 // 2 Sekunden Timeout
);

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
      if (debug > 1) console.log('Writing null/undefined object for id: ' + id);
      if (existsState(id)) {
         setState(id, null, true);
      } else {
         createState(id, null, false, { type: 'mixed', read: true, write: true });
      }
      return;
   }
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
               if (
                  new Date(value).getTime() > 0 &&
                  Number(value) > MIN_VALID_TIMESTAMP &&
                  Number(value) < MAX_VALID_TIMESTAMP
               ) {
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
               if (
                  new Date(value).getTime() > 0 &&
                  Number(value) > MIN_VALID_TIMESTAMP &&
                  Number(value) < MAX_VALID_TIMESTAMP
               ) {
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
// Abfrage der verfügbaren Systeme
// -------------------------------------------------------------------------------------------------------------------
// help function to safely parse JSON
function safeParseJSON(jsonStr) {
   try {
      return JSON.parse(jsonStr);
   } catch (e) {
      console.warn('Invalid JSON:', e.message);
      return null;
   }
}
// result is returned as json text
async function apiGet(endpoint, params = '') {
   const baseUrl = 'https://api.enphaseenergy.com/api/v4/';
   const accessToken = getState(dpAccess).val;
   const apiKey = getState(dpApiKey).val;
   // check for access token and api key
   if (!accessToken) {
      console.error('❌ Kein Access Token vorhanden. Bitte Authentifizierung durchführen');
      return null;
   }
   if (!apiKey) {
      console.error('❌ Kein API-Key vorhanden. Bitte in den Credentials-Datenpunkt eintragen');
      return null;
   }
   // constructing requestUrl
   const url = baseUrl + endpoint + `?key=${apiKey}` + params;
   if (debug >= 2) console.log(`🔍 GET ${endpoint} → URL: ${url}`);
   try {
      const response = await fetch(url, {
         method: 'GET',
         headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
         },
      });
      // check response status
      if (!response.ok) {
         const text = await response.text();
         console.error(`💥 Fehler bei GET ${endpoint} → Status ${response.status}: ${text}`);
         return null;
      }
      // output response text
      if (debug >= 2) console.log(`✅ GET ${endpoint} erfolgreich.`);
      if (debug >= 3) console.log(await response.text());
      return await response.text();
   } catch (err) {
      console.error(`💥 Ausnahme bei GET ${endpoint}: ${err.message}`);
      return null;
   }
}

// -------------------------------------------------------------------------------------------------------------------
// Helper function to get data from Envoy cloud and write to the systems datapoint in ioBroker
// -------------------------------------------------------------------------------------------------------------------
async function getAndWrite(params, endPoint, title, debug = 0) {
   // get the systems array from IOBroker
   const systems = getState(dbSystemIDs).val;
   if (debug > 1) console.log('Systems known from Array: ' + JSON.stringify(systems));
   //interation through all systems found
   for (let system in systems) {
      if (debug > 2) console.log('System ID:' + systems[system]);
      const alarms = await apiGet(`systems/${systems[system]}/${endPoint}`, params);
      const resp_json = safeParseJSON(alarms);
      if (debug > 2) console.log('Parsed JSON:' + JSON.stringify(resp_json, null, 2));
      await IObSetState(dpBasicPath + `Systems.System_${systems[system]}.${title}`, resp_json, debug);
      if (debug > 1) console.log(`System ${systems[system]} ${title} saved.`);
   }
}

// -------------------------------------------------------------------------------------------------------------------
// Fetch systems from Enphase cloud and store in ioBroker
// -------------------------------------------------------------------------------------------------------------------
// Returns a list of systems for which the user can make API requests. By default, systems are returned in batches
// of 10. The maximum size is 100.
/**
 * Fetches systems from the Enphase cloud and stores them in ioBroker.
 *
 * This function:
 * - Calls the Enphase API to retrieve a list of systems.
 * - Parses and saves the full response to the 'Fetch' datapoint.
 * - For each system found, creates a system datapoint under 'Systems'.
 * - Stores an array of system IDs in ioBroker for further use.
 * - Logs debug information depending on the debug level.
 *
 * API parameters:
 * - page:    The page to be returned. Default=1, Min=1.
 * - size:    Maximum number of records per page. Default=10, Min=1, Max=100.
 * - sort_by: Field to sort by ('id', '-id'). Default='id'.
 *
 * @async
 * @function fetchSystems
 * @param {number} [page=1] - Page number to fetch.
 * @param {number} [size=10] - Number of records per page.
 * @param {string} [sort_by='id'] - Sort order.
 * @returns {Promise<void>} Resolves when all operations are complete.
 */
async function fetchSystems(page = 1, size = 10, sort_by = 'id') {
   if (debug > 0) console.log('Fetch systems from cloud...');
   // validate input parameters
   if (page < 1) page = 1; // min page = 1
   if (size < 1) size = 10; // min size = 1
   if (size > 100) size = 100; // max size = 100
   if (!sort_by) sort_by = 'id'; // default sort_by = id
   if (sort_by !== 'id' && sort_by !== '-id' && sort_by !== 'name' && sort_by !== '-name') {
      console.warn(`Invalid sort_by value: ${sort_by}. Defaulting to 'id'.`);
      sort_by = 'id';
   }
   const params = `&page=${page}&size=${size}&sort_by=${encodeURIComponent(sort_by)}`;
   // fetch systems from Enphase cloud
   const systems = await apiGet('systems', params);
   if (systems) {
      if (debug > 0) console.log('Successfully fetched systems. Saving data to ioBroker...');
      const resp_json = safeParseJSON(systems);
      if (debug > 2) console.log('Parsed JSON:' + JSON.stringify(resp_json, null, 2));
      await IObSetState(dpBasicPath + 'Fetch', resp_json, debug);
      if (debug > 0) console.log('Creating systems...');
      if (resp_json.systems && Array.isArray(resp_json.systems)) {
         // create system datapoint for each system found
         let systemString = '{';
         for (let i = 0; i < resp_json.systems.length; i++) {
            const systemId = resp_json.systems[i].system_id;
            if (debug > 2) console.log('System ID found:' + systemId);
            systemString += `"System_${systemId}": { "system_id": ${JSON.stringify(resp_json.systems[i].system_id)} },`;
         }
         systemString = systemString.slice(0, -1) + '}';
         if (debug > 1) console.log('Systems JSON string: ' + systemString);
         await IObSetState(dpBasicPath + 'Systems', safeParseJSON(systemString), debug);
         // create an iterable array of system IDs in ioBroker
         const systemIds = resp_json.systems.map((sys) => sys.system_id);
         if (debug > 1) console.log('System IDs array: ' + JSON.stringify(systemIds));
         setState(dbSystemIDs, systemIds, true);
         if (debug > 0) console.log('Systems created');
      }
   } else {
      console.warn('No systems found or resp_json.systems is undefined');
   }
}

// -------------------------------------------------------------------------------------------------------------------
// get systems summary
// -------------------------------------------------------------------------------------------------------------------
// Fetches and stores a summary for each system found in the Enphase cloud.
// Each summary contains system details such as id, name, and status.
// Data is retrieved for all system IDs stored in ioBroker and saved under their respective datapoints.
// Returns system summary based on the specified system ID.
/**
 * Retrieves a summary for each system found in the Enphase cloud and stores it in ioBroker.
 *
 * This function:
 * - Reads the array of system IDs from ioBroker.
 * - Fetches the summary for each system using the Enphase API.
 * - Parses and saves the summary data to ioBroker states.
 * - Logs debug information at various levels.
 *
 * @async
 * @function getSystemsSummary
 * @returns {Promise<void>} Resolves when all system summaries have been processed and stored.
 */
async function getSystemsSummary() {
   if (debug > 0) console.log('Getting summary for each system in systemIDs...');
   await getAndWrite('', 'summary', 'summary', debug);
}

// -------------------------------------------------------------------------------------------------------------------
// get systems devices
// -------------------------------------------------------------------------------------------------------------------
// Returns and stores an array of devices for each system found in the Enphase cloud in ioBroker.
// Each device includes id, name, and status. Data is fetched for all system IDs stored in ioBroker.
// Retrieves devices for a given system. Only devices that are active will be returned in the response.
/**
 * Retrieves devices for each system found in the Enphase cloud and stores them in ioBroker.
 *
 * This function:
 * - Reads the array of system IDs from ioBroker.
 * - Fetches the devices for each system using the Enphase API.
 * - Parses and saves the device data to ioBroker states.
 * - Logs warnings and skips systems if API calls fail or return invalid data.
 *
 * @async
 * @function getSystemsDevices
 * @returns {Promise<void>} Resolves when all system devices have been processed and stored.
 */
async function getSystemsDevices() {
   if (debug > 0) console.log('Getting devices for each system in systemIDs...');
   await getAndWrite('', 'devices', 'devices', debug);
}

// -------------------------------------------------------------------------------------------------------------------
// retrieve systems ID by gateway serial number
// -------------------------------------------------------------------------------------------------------------------
// Get system ID by passing envoy serial number. If the serial number of a retired envoy is passed in the request
// param, a 404 Not Found response will be returned.
/**
 * Retrieves the system ID associated with a given gateway serial number.
 *
 * Makes an asynchronous API call to fetch the system ID for the provided serial number.
 * Parses the response and returns the system ID if found, otherwise returns the raw response or null.
 * Logs debug information if the debug level is greater than 0.
 *
 * @param {string} serialNumber - The serial number to look up.
 * @returns {Promise<string|null>} The system ID if found, otherwise null.
 */
async function retrieveSystemID(serialNumber) {
   if (debug > 0) console.log(`Retrieving system ID for serial number: ${serialNumber}`);
   const systemID = await apiGet(`systems/retrieve_system_id`, `&serial_num=${serialNumber}`);

   if (systemID) {
      const resp_json = safeParseJSON(systemID);
      if (debug > 1) {
         if (resp_json && resp_json.system_id) {
            console.log(`Found system ID ${resp_json.system_id} for serial number ${serialNumber}`);
         } else {
            console.log(`Received response for serial number ${serialNumber}: ${JSON.stringify(resp_json)}`);
         }
      }
      return resp_json && resp_json.system_id ? resp_json.system_id : systemID;
   }
   if (debug > 0) console.log(`No system found for serial number: ${serialNumber}`);
   return null;
}

// -------------------------------------------------------------------------------------------------------------------
// get systems events from startTime to endTime (max. 7 days range)
// -------------------------------------------------------------------------------------------------------------------
// Returns an array of system events for each system found in Enphase cloud and stores them in ioBroker.
// Each event includes id, name, and status. The query range is defined by startTime and endTime (epoch seconds).
// This endpoint is used to retrieve the events for a site. start_time is mandatory and cannot be older than 9 months
// from the current time. Maximum 1 week of data can be retrieved in a single call.
// An Event is triggered when a site/device meets a pre-defined set of conditions. Each of these pre-defined set of
// conditions is called an “Event type”. These conditions are defined at both site and device level, therefore events
// can be triggered at both site and device level. Each event is associated with an event type.
// Most Event types (not all) further have pre-defined configurations. Whenever an Event of a given Event type meets
// these pre-defined configurations, then the Event triggers an Alarm. An example of pre-defined configuration for an
// event type is - Event status is “Open” beyond a certain time limit.
// Events are generated when a site or device meets specific, predefined conditions. These conditions are grouped into
// what we call “Event types.” Each event is always linked to an event type. For example, ‘Gateway not reporting’ is an
// event type and an event gets created on a site if the gateway stops reporting. Similarly, if a gateway on another
// site stops reporting, another event is created specific to that site with the same event type.
// Many event types (though not all) come with predefined escalation criteria for alarms. When an event meets these
// configurations, it can trigger an alarm. For example, a common configuration might specify that an event should
// trigger an alarm if its status remains “Open” beyond a certain time threshold.
/**
 * Retrieves events for each system found in the Enphase cloud and stores them in ioBroker.
 *
 * This function:
 * - Reads the array of system IDs from ioBroker.
 * - Fetches the events for each system using the Enphase API within the specified time range.
 * - Parses and saves the event data to ioBroker states.
 * - Validates input times and logs warnings for invalid parameters.
 *
 * @async
 * @function getSystemsEvents
 * @param {number} startTime - Required. Epoch time (seconds) for the start of the event query range.
 * @param {number} [endTime] - Optional. Epoch time (seconds) for the end of the event query range. Defaults to now.
 * @returns {Promise<void>} Resolves when all system events have been processed and stored, or returns early if `startTime` is missing.
 */
async function getSystemsEvents(startTime = null, endTime = null) {
   if (startTime) {
      if (debug > 0) console.log(`Getting systems events from startTime ${startTime} for each system in systemIDs...`);
      // define endTime as now in epoch seconds
      if (!endTime) {
         endTime = Math.floor(Date.now() / 1000); // current time in epoch seconds
      } else {
         if (typeof endTime !== 'number' || endTime < MIN_VALID_TIMESTAMP || startTime > endTime) {
            console.warn(
               `Invalid endTime: ${endTime}. Must be a valid epoch time number and greater than startTime ${startTime}. No action taken.`
            );
            return;
         }
      }
      if (debug > 0) console.log(`Using endTime ${endTime}`);
      // Check if startTime is a valid epoch time (number, > 0, reasonable range)
      if (typeof startTime !== 'number' || startTime < MIN_VALID_TIMESTAMP || startTime > endTime) {
         console.warn(
            `Invalid startTime: ${startTime}. Must be a valid epoch time number and less than endTime ${endTime}. No action taken.`
         );
         return;
      }
      const params = `&start_time=${startTime}&end_time=${endTime}`;
      if (debug > 1) console.log(`Using params: ${params}`);
      // get events for each system and write to ioBroker
      await getAndWrite(params, 'events', 'events', debug);
   } else {
      console.warn('Called getSystemsEvents without startTime [Epoch time format] - no action taken');
   }
}

// -------------------------------------------------------------------------------------------------------------------
// get systems alarms from startTime to endTime or now (max. 7 days range)
// -------------------------------------------------------------------------------------------------------------------
// returns an array of system alarms with id, name, and status for each system found
// in Enphase cloud stored in IOBroker
// This endpoint is used to retrieve the alarms for a site. start_time is mandatory and cannot be older than 9 months
// from the current time. Maximum 1 week of data can be retrieved in a single call.
// Many event types (though not all) come with predefined escalation criteria for alarms. When an event meets these
// configurations, it can trigger an alarm. For example, a common configuration might specify that an event should
// trigger an alarm if its status remains “Open” beyond a certain time threshold.
// An Alarm is always tied to an Event, and the relationship between them can be one-to-one or one-to-many. For
// instance, if a site has a single battery and its State of Charge (SOC) drops below a predefined threshold, an
// event is created. If the SOC remains below that threshold for a specified duration, an alarm is triggered for
// that battery. In another scenario, if a site has multiple batteries and all of them fall below the SOC threshold,
// individual events are created for each battery. If the low SOC condition persists across all batteries for the
// defined time period, a single alarm may be triggered for all of them.
// This means: (1) An alarm can be associated with multiple events (2) But an event can be associated with only
// one alarm.
/**
 * Retrieves alarms for each system found in the Enphase cloud and stores it in ioBroker.
 *
 * This function:
 * - Reads the array of system IDs from ioBroker.
 * - Fetches the alarms for each system using the Enphase API.
 * - Parses and saves the alarm data to ioBroker states.
 * - If `startTime` is not provided, logs a warning and returns without making API calls.
 *
 * @async
 * @function getSystemsAlarms
 * @param {number} startTime - Required. Epoch time (seconds) for the start of the alarm query range.
 * @param {number} [endTime] - Optional. Epoch time (seconds) for the end of the alarm query range. Defaults to now.
 * @param {boolean} [cleared=false] - Optional. Whether to include cleared alarms.
 * @returns {Promise<void>} Resolves when all system alarms have been processed and stored, or returns early if `startTime` is missing.
 */
async function getSystemsAlarms(startTime = null, endTime = null, cleared = false) {
   if (startTime) {
      if (debug > 0) console.log(`getting systems alarms until startTime ${startTime} for each system in systemIDs...`);
      // define endTime as now in epoch seconds
      if (!endTime) {
         endTime = Math.floor(Date.now() / 1000); // current time in epoch seconds
      } else {
         if (typeof endTime !== 'number' || endTime < MIN_VALID_TIMESTAMP || startTime > endTime) {
            console.warn(
               `Invalid endTime: ${endTime}. Must be a valid epoch time number and greater than startTime ${startTime}. No action taken.`
            );
            return;
         }
      }
      if (debug > 0) console.log(`using endTime ${endTime}`);
      // Check if startTime is a valid epoch time (number, > 0, reasonable range)
      if (typeof startTime !== 'number' || startTime < MIN_VALID_TIMESTAMP || startTime > endTime) {
         console.warn(
            `Invalid startTime: ${startTime}. Must be a valid epoch time number and less than endTime ${endTime}. No action taken.`
         );
         return;
      }
      let clearedParam = 'false';
      if (cleared) {
         if (debug > 1) console.log('including cleared alarms');
         clearedParam = 'true';
      } else {
         if (debug > 1) console.log('only active alarms');
      }
      const params = `&start_time=${startTime}&end_time=${endTime}&cleared=${clearedParam}`;
      if (debug > 1) console.log(`using params: ${params}`);
      // get alarms for each system and write to ioBroker
      await getAndWrite(params, 'alarms', 'alarms', debug);
   } else {
      console.warn('called getSystemsAlarms without startTime [Epoch time format] - no action taken');
   }
}

// -------------------------------------------------------------------------------------------------------------------
// get event_type list
// -------------------------------------------------------------------------------------------------------------------
// Fetches all available event types from the Enphase cloud and stores them in ioBroker.
// Each event type describes a possible event that can occur in a system.
// This endpoint is used to retrieve the list of all available event_types. The endpoint will return list of
// event_type_id along with the event_description and recommended_action. If an event_type_id is passed, this
// endpoint will return the detail of specific event_type
/**
 * Retrieves event types from the Enphase cloud and stores them in ioBroker.
 *
 * This function:
 * - Optionally filters by event_type_id if provided.
 * - Fetches the event types using the Enphase API.
 * - Parses and saves the event type data to ioBroker states.
 * - Logs debug information at various levels.
 *
 * @async
 * @function getEventTypes
 * @param {number|null} [event_type_id=null] - Optional. Specific event type ID to filter.
 * @returns {Promise<void>} Resolves when event types have been processed and stored.
 */
async function getEventTypes(event_type_id = null) {
   let params = '';
   if (event_type_id && Number.isInteger(event_type_id) && event_type_id > 0) {
      if (debug > 1) console.log(`event_type_id provided: ${event_type_id}`);
      params = `&event_type_id=${event_type_id}`;
   }
   if (debug > 0) console.log(`Fetching event types from Enphase cloud...`);
   const eventType = await apiGet('systems/event_types', params);
   const resp_json = safeParseJSON(eventType);
   if (debug > 2) console.log('Parsed JSON:' + JSON.stringify(resp_json, null, 2));
   await IObSetState(dpBasicPath + 'Systems', resp_json, debug);
   if (debug > 1) console.log(`Event types saved to ioBroker.`);
}

// -------------------------------------------------------------------------------------------------------------------
// get ebattery settings for each system in systemIDs :: Method not allowed yet / not allowed for free accounts
// -------------------------------------------------------------------------------------------------------------------
async function getBatterySettings() {
   if (debug > 0) console.log('Getting battery settings for each system in systemIDs...');
   await getAndWrite('', 'battery_settings', 'config.battery_settings', debug);
}
// -------------------------------------------------------------------------------------------------------------------
// get storm guard settings for each system in systemIDs :: Method not allowed yet / not allowed for free accounts
// -------------------------------------------------------------------------------------------------------------------
async function getStormGuard() {
   if (debug > 0) console.log('Getting storm guard settings for each system in systemIDs...');
   await getAndWrite('', 'storm_guard', 'config.storm_guard', debug);
}
// -------------------------------------------------------------------------------------------------------------------
// get grid status settings for each system in systemIDs :: Method not allowed yet / not allowed for free accounts
// -------------------------------------------------------------------------------------------------------------------
async function getGridStatus() {
   if (debug > 0) console.log('Getting grid status settings for each system in systemIDs...');
   await getAndWrite('', 'grid_status', 'config.grid_status', debug);
}
// -------------------------------------------------------------------------------------------------------------------
// get load control settings for each system in systemIDs :: Method not allowed yet / not allowed for free accounts
// -------------------------------------------------------------------------------------------------------------------
async function getLoadControl() {
   if (debug > 0) console.log('Getting load control settings for each system in systemIDs...');
   await getAndWrite('', 'load_control', 'config.load_control', debug);
}

// -------------------------------------------------------------------------------------------------------------------
// initialization - first run
// -------------------------------------------------------------------------------------------------------------------
// This block checks if the access token datapoint exists and is populated.
// If the access token is available, it ensures the Fetch datapoint exists by fetching systems from the cloud.
// It also fetches event types and creates the event_types datapoint.
// If the access token is missing, it warns the user and stops the script
if (existsState(dpAccess)) {
   if (debug > 0) console.log('Access Token datapoint already exists');
   if (getState(dpAccess).val != '') {
      // Access token is available
      if (!existsState(dpBasicPath + 'Fetch')) {
         if (debug > 0) console.log('Fetch datapoint does not exist. Creating by fetching systems from cloud...');
         await fetchSystems(1, 10, 'id'); // get available systems from cloud and create Fetch and Systems datapoints
         await getEventTypes(); // get event types and create event_types datapoint
      }
   } else {
      // Access token is empty, prompt user to authenticate and stop script
      console.warn(
         'Access Token is empty. Please authenticate using ' +
            getState(dpServerURI).val +
            ':' +
            Port +
            ' or modify Server URL in datapoint ' +
            dpServerURI +
            ', if you use another computer than the ioBroker to authenticate'
      );
   }
}

// -------------------------------------------------------------------------------------------------------------------
// Loop area - cyclic execution of functions
// -------------------------------------------------------------------------------------------------------------------
// The following section is the cyclic execution area of the script. Functions can be called here to be executed
// at each cycle. The cycle time can be set in the script settings (e.g. every 1 hour).
// Note: Be cautious with API rate limits when calling functions too frequently.
// get events and alarms every day at midnight for the last day
// @30 days -> 30 calls per month
const oneDayAgo = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 1; // 1 day ago
let checkEventsAndAlarms = schedule('0 0 * * *', async () => {
   try {
      await getSystemsEvents(oneDaysAgo);
      if (debug > 3) console.log('getSystemsEvents executed successfully');
   } catch (err) {
      console.error('Error in getSystemsEvents:', err.message);
   }
   try {
      await getSystemsAlarms(oneDayAgo, null, true);
      if (debug > 3) console.log('getSystemsAlarms executed successfully');
   } catch (err) {
      console.error('Error in getSystemsAlarms:', err.message);
   }
});
// Get devices every hour
// @24 hours -> 24 calls per day -> 720 calls per month
let fetchDevices = schedule('0 */1 * * *', async () => {
   try {
      await getSystemsDevices();
      if (debug > 3) console.log('getSystemsDevices executed successfully');
   } catch (err) {
      console.error('Error in getSystemsDevices:', err.message);
   }
});
