/**
 * Enphase Summary Script
 *
 * This script aggregates and synchronizes Enphase solar system data for ioBroker.
 *
 * Main functions:
 * - Monitors and transfers battery State of Charge (SoC) and livedata connection status to summary states.
 * - Collects production and status data from local and cloud inverters, matches them, and writes summary info.
 * - Aggregates power data (active, apparent, reactive) for load, storage, grid, and PV across all phases.
 * - Updates summary states automatically when relevant source states change.
 *
 * Designed for ioBroker automation, using async state creation and event-driven updates.
 * Debug logging is available at multiple verbosity levels.
 */

//---------------------------------------------------------------------------------------------------
// Configuration
//---------------------------------------------------------------------------------------------------
let debug = 0; // Debug level (0=none, 1=info, 2=advanced, 3=debug)
//basic path
const rss_base_path = '0_userdata.0.enphase.';
const rss_local = rss_base_path + 'local.';
const rss_cloud = rss_base_path + 'cloud.';
const dst_summary = rss_base_path + 'summary.';
// resource path
const rss_SoC = rss_local + 'livedata.meters.soc';
const rss_sc_stream = rss_local + 'livedata.connection.sc_stream';
const rss_inverter = rss_local + 'inverter';
const rss_systems_cloud = rss_cloud + 'Systems';
const rss_livedata = rss_local + 'livedata';
const rss_dbSystemIDs = rss_cloud + 'SystemIDs'; // datapoint path to store system IDs found by FetchSystems
let rss_inverter_trigger = ''; //will be set later to inverter.0
const rss_power_trigger = rss_livedata + '.meters.grid.agg_p_mw'; //trigger for power data update
const rss_battery = rss_local + 'inventory.0.devices';
let rss_battery_trigger = ''; //will be set later to battery.0
let rss_gateway_trigger = ''; //will be set later to gateway.0
let minSoC_initialValue = 30; // initial minSoC value in % if not set yet
const rss_minSoC = rss_base_path + 'config.summary.minSoC'; // path to store minSoC value
// destination path
const dst_sc_stream = dst_summary + 'lifedataState';
const dst_SoC = dst_summary + 'SoC';
const dst_inverter = dst_summary + 'inverters';
const dst_battery = dst_summary + 'battery';
const dst_gateway = dst_summary + 'gateway';

// ---------------------------------------------------------------------------------------------------
// Ensure summary base path exists - helper functions
//---------------------------------------------------------------------------------------------------
/**
 * Ensures that a state with the given ID exists and is initialized.
 * - If the state does not exist, it creates it asynchronously with the provided value and options.
 * - If the state already exists, it simply updates its value.
 * - Useful for managing state objects in a consistent way, especially when states may be created dynamically.
 * - Logs actions when debug level is high.
 *
 * @param {string} id - The unique identifier for the state.
 * @param {*} value - The initial value to set for the state.
 * @param {object} options - Configuration for the state (e.g., read/write permissions, type).
 */
async function ensureStateAsync(id, value, options = { read: true, write: true }) {
   if (!existsState(id)) {
      await createStateAsync(id, value, options);
      if (debug > 1)
         log(
            `State ${id} created with initial value: ${JSON.stringify(value)} and options: ${JSON.stringify(options)}`,
            'info'
         );
   } else {
      if (debug > 1) log(`State ${id} already exists - updating value`, 'info');
      setState(id, value, true);
   }
}
// ---------------------------------------------------------------------------------------------------
// get SOC state and transfer to summary & calculate minSoC
//---------------------------------------------------------------------------------------------------
/**
 * Monitors the battery State of Charge (SoC) and mirrors it to a summary state.
 * - Checks if the source SoC state (rss_SoC) exists.
 * - If it exists, ensures that the target summary state (dst_SoC) is created or updated with proper attributes.
 * - Subscribes to changes of the source state and keeps the summary state synchronized automatically.
 * - Generates debug logs depending on the configured debug level.
 *
 * @constant {string} rss_SoC - ID of the source state providing the battery SoC.
 * @constant {string} dst_SoC - ID of the target summary state that mirrors the SoC value.
 */
async function getFirstLedStatus() {
   if (existsState(rss_battery + '.0.led_status')) {
      let led_status = getState(rss_battery + '.0.led_status').val;
      if (debug > 1) log(`First battery LED status: ${led_status}`, 'info');
      return led_status;
   }
   return null;
}
if (existsState(rss_SoC)) {
   ensureStateAsync(dst_SoC, Number(getState(rss_SoC)), {
      read: true,
      write: false,
      type: 'number',
      role: 'value.battery',
      unit: '%',
      min: 0,
      max: 100,
      def: 0,
      desc: 'State of Charge (SoC) of the battery in %',
   });
   if (debug > 1) log(`Monitoring SoC state at ${rss_SoC} and updating ${dst_SoC} now`, 'info');
   on({ id: rss_SoC, change: 'any' }, async function (obj) {
      setState(dst_SoC, obj.state.val, true);
      if (debug > 2) log(`SoC updated: ${obj.state.val}%`, 'info');
      // auto identify minSoC for battery based on discharging behavior
      if (existsState(rss_minSoC)) {
         let ledStatus = await getFirstLedStatus();
         if (debug > 2) log(`Current battery LED status: ${ledStatus}`, 'info');
         if (ledStatus == 13) {
            // battery is discharging - SoC valid for minSoC check
            let currentMinSoC = getState(rss_minSoC).val;
            if (obj.state.val < currentMinSoC) {
               ensureStateAsync(rss_minSoC, Number(obj.state.val), {
                  read: true,
                  write: true,
                  type: 'number',
                  role: 'value.battery',
                  unit: '%',
                  min: 0,
                  max: 100,
                  def: minSoC_initialValue,
                  desc: 'Minimum State of Charge (SoC) of the battery in %',
               });
               if (debug > 2) log(`minSoC updated: ${obj.state.val}%`, 'info');
            }
         }
      } else {
         // minSoC not set yet - initialize it
         ensureStateAsync(rss_minSoC, minSoC_initialValue, {
            read: true,
            write: true,
            type: 'number',
            role: 'value.battery',
            unit: '%',
            min: 0,
            max: 100,
            def: minSoC_initialValue,
            desc: 'Minimum State of Charge (SoC) of the battery in %',
         });
         if (debug > 2) log(`minSoC initialized to ${minSoC_initialValue}%`, 'info');
      }
   });
}

//---------------------------------------------------------------------------------------------------
// get sc_stream state and transfer to summary
//---------------------------------------------------------------------------------------------------
/**
 * Monitors the live data connection status (sc_stream) and mirrors it to a summary state.
 * - Checks if the source state (rss_sc_stream) exists.
 * - If it exists, ensures that the target summary state (dst_sc_stream) is created or updated as a boolean switch.
 * - Converts the source string value ("enabled"/other) into a boolean representation (true/false).
 * - Keeps the summary state synchronized automatically whenever the source changes.
 * - Generates debug logs depending on the configured debug level.
 *
 * @constant {string} rss_sc_stream - ID of the source state providing the live data connection status.
 * @constant {string} dst_sc_stream - ID of the target summary state that mirrors the connection status.
 */
if (existsState(rss_sc_stream)) {
   ensureStateAsync(dst_sc_stream, getState(rss_sc_stream) == 'enabled', {
      read: true,
      write: true,
      type: 'boolean',
      role: 'switch',
      def: false,
      desc: 'Status of livedata connection (sc_stream) as switch',
   });
   if (debug > 1) log(`Monitoring sc_stream state at ${rss_sc_stream} and updating ${dst_sc_stream} now`, 'info');
   on({ id: rss_sc_stream, change: 'any' }, function (obj) {
      if (obj.state.val == 'enabled') {
         setState(dst_sc_stream, true, true);
      } else {
         setState(dst_sc_stream, false, true);
      }
      if (debug > 2) log(`sc_stream updated: ${obj.state.val}`, 'info');
   });
}

//---------------------------------------------------------------------------------------------------
// get inverter production and status and transfer to summary
//---------------------------------------------------------------------------------------------------
// get inverter production from local and micro inverter state from cloud if available
// read production of all micro inverters and store in array
/**
 * Asynchronously waits until a specific ioBroker state exists.
 * - Repeatedly checks whether the state with the given ID has been created.
 * - Waits for the defined interval between checks, up to a maximum number of attempts.
 * - Logs progress and warnings when debug mode is active.
 * - Useful for ensuring dependent states are available before accessing or linking them.
 *
 * @async
 * @function waitForState
 * @param {string} id - The ID of the state to wait for.
 * @param {number} [interval=500] - The interval (in ms) between existence checks.
 * @param {number} [maxAttempts=20] - The maximum number of attempts before giving up.
 * @returns {Promise<void>} Resolves when the state exists or when the maximum attempts are reached.
 */
async function waitForState(id, interval = 500, maxAttempts = 20) {
   let attempts = 0;
   // Check if id ends with a point
   if (id.endsWith('.')) {
      log(`State id "${id}" ends with a point. This may cause issues`, 'warn');
   }
   while (!existsState(id) && attempts < maxAttempts) {
      if (debug > 1) log(`Waiting until state ${id} is created`, 'info');
      await new Promise((resolve) => setTimeout(resolve, interval));
      attempts++;
   }
   if (!existsState(id)) {
      log(`State ${id} was not created after waiting`, 'info');
   }
}
/**
 * Collects and merges inverter data from local (Envoy) and cloud sources into a unified summary.
 * - Scans for all locally reported inverters and their last known production values.
 * - Retrieves inverter status information from the cloud (for all known system IDs).
 * - Matches local production data with cloud status data using the inverter serial number.
 * - Creates or updates corresponding summary datapoints under the inverter summary path in ioBroker.
 * - Produces detailed debug logs depending on the configured debug level.
 *
 * @async
 * @function inverterSummary
 * @returns {Promise<void>} Resolves when all inverter data has been processed and summary states created.
 */
async function inverterSummary() {
   let micro_production = [];
   let inverter = [];
   let notDoneYet = true;
   let i = 0;
   let serial;
   do {
      if (existsState(rss_inverter + '.' + i + '.serialNumber')) {
         try {
            if (i == 0) {
               rss_inverter_trigger = rss_inverter + '.' + i + '.lastReportWatts';
               if (debug > 1) log(`Inverter trigger set to ${rss_inverter_trigger} now`, 'info');
            }
            serial = getState(rss_inverter + '.' + i + '.serialNumber').val;
            let lastReportWatts = 0;
            if (existsState(rss_inverter + '.' + i + '.lastReportWatts')) {
               lastReportWatts = getState(rss_inverter + '.' + i + '.lastReportWatts').val;
            } else {
               if (debug > 1)
                  log(`Inverter ID ${i} serial number state exists but lastReportWatts state is missing`, 'info');
            }
            micro_production.push({ serialNumber: serial, lastReportWatts: lastReportWatts });
            inverter.push(serial);
            if (debug > 2)
               log(`Inverter ID ${i} has serial number ${serial}, lastReportWatts: ${lastReportWatts}`, 'info');
         } catch {
            log(`Inverter ID ${i} does exist but serial number state is invalid or missing`, 'error');
         }
      } else {
         notDoneYet = false;
         if (debug > 1) log(`No more inverters found after ID ${i - 1}. Stopping search`, 'info');
      }
      i++;
   } while (notDoneYet);
   if (debug > 2) log(`Found ${micro_production.length} inverters: ${JSON.stringify(micro_production)}`, 'info');
   if (debug > 2) log(`List of inverters: ${inverter}`, 'info');
   // read state of summary inverter and store it in array
   let status_inverter = [];
   notDoneYet = true;
   let systems = [];
   i = 0;
   try {
      const rawSystems = getState(rss_dbSystemIDs).val;
      systems = [];
      if (rawSystems == null || rawSystems === '') {
         systems = [];
         if (debug > 0) log(`No systems found in ${rss_dbSystemIDs}. Value is null or empty`, 'info');
      } else if (Array.isArray(rawSystems)) {
         systems = rawSystems;
         if (debug > 1) log(`Found systems in ${rss_dbSystemIDs}: ${JSON.stringify(systems)}`, 'info');
      } else if (typeof rawSystems === 'string') {
         const s = rawSystems.trim();
         try {
            const parsed = JSON.parse(s); // try JSON array first
            systems = Array.isArray(parsed) ? parsed : [String(parsed)];
            if (debug > 1) log(`Found systems in ${rss_dbSystemIDs}: ${JSON.stringify(systems)}`, 'info');
         } catch (e) {
            // fallback to comma separated
            systems = s.length
               ? s
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean)
               : [];
            if (debug > 1)
               log(`Found systems in ${rss_dbSystemIDs} (comma separated): ${JSON.stringify(systems)}`, 'info');
         }
      } else {
         systems = [String(rawSystems)];
         if (debug > 1) log(`Found single system in ${rss_dbSystemIDs}: ${JSON.stringify(systems)}`, 'info');
      }
   } catch {
      systems = [];
      if (debug > 0) log(`No systems found in ${rss_dbSystemIDs}. Please run FetchSystems first`, 'info');
   }
   if (debug > 1) log('Systems known from Array: ' + JSON.stringify(systems), 'info');
   for (let system in systems) {
      if (debug > 2) log('System ID:' + systems[system], 'info');
      if (existsState(rss_cloud + 'Systems.System_' + systems[system] + '.devices.devices.micros.0.status')) {
         if (debug > 1) log(`Inverters found for system ${systems[system]}`, 'info');
         //search for all inverters in the system and store status in array
         do {
            if (
               existsState(rss_cloud + 'Systems.System_' + systems[system] + '.devices.devices.micros.' + i + '.status')
            ) {
               try {
                  let inv_status = getState(
                     rss_cloud + 'Systems.System_' + systems[system] + '.devices.devices.micros.' + i + '.status'
                  ).val;
                  let inv_serial = getState(
                     rss_cloud + 'Systems.System_' + systems[system] + '.devices.devices.micros.' + i + '.serial_number'
                  ).val;
                  let inv_active = getState(
                     rss_cloud + 'Systems.System_' + systems[system] + '.devices.devices.micros.' + i + '.active'
                  ).val;
                  let inv_id = getState(
                     rss_cloud + 'Systems.System_' + systems[system] + '.devices.devices.micros.' + i + '.id'
                  ).val;
                  status_inverter.push({
                     serialNumber: inv_serial,
                     status: inv_status,
                     active: inv_active,
                     id: inv_id,
                     systemID: systems[system],
                  });
                  if (debug > 2)
                     log(`System ${systems[system]} owns inverter ${i} with serial number: ${inv_serial}`, 'info');
                  i++;
               } catch {
                  if (debug > 1) log(`Error while processing inverter ${i} for system ${systems[system]}`, 'info');
                  notDoneYet = false;
               }
               if (i > 40) notDoneYet = false; //safety exit
            } else {
               notDoneYet = false;
               if (debug > 1)
                  log(
                     `No more inverters found for system ${systems[system]} after ID ${i - 1}. Stopping search`,
                     'info'
                  );
            }
         } while (notDoneYet);
      } else {
         if (debug > 1) log(`No inverter found for system ${systems[system]}`, 'info');
      }
   }
   if (status_inverter.length == 0) {
      if (debug > 0) log(`No inverter status found in any system. Please check cloud data`, 'info');
   } else {
      if (debug > 2) log(`Inverter status found: ${JSON.stringify(status_inverter)}`, 'info');
   }
   //sort arrays by serial number to ensure matching order
   micro_production.sort((a, b) => a.serialNumber.localeCompare(b.serialNumber));
   if (debug > 2) log(`micro production after sort: ${JSON.stringify(micro_production)}`, 'info');
   inverter.sort((a, b) => a.localeCompare(b));
   if (debug > 2) log(`inverter list after sort: ${JSON.stringify(inverter)}`, 'info');
   status_inverter.sort((a, b) => a.serialNumber.localeCompare(b.serialNumber));
   if (debug > 2) log(`inverter status after sort: ${JSON.stringify(status_inverter)}`, 'info');
   //match production and status of each inverter and write to summary
   let summary_inverter = [];
   for (let inv in micro_production) {
      let prod = micro_production[inv];
      let status = status_inverter.find((s) => s.serialNumber === prod.serialNumber);
      if (status) {
         // If status is found, write to summary
         summary_inverter.push({
            serialNumber: prod.serialNumber,
            production: prod.lastReportWatts,
            status: status.status,
            active: status.active,
            id: status.id,
            systemID: status.systemID,
         });
      } else {
         summary_inverter.push({
            serialNumber: prod.serialNumber,
            production: prod.lastReportWatts,
            status: 'unknown',
            active: false,
            id: 'unknown',
            systemID: 'unknown',
         });
      }
   }
   if (debug > 2) log(`Summary inverter data: ${JSON.stringify(summary_inverter)}`, 'info');
   // write summary inverter data to ioBroker datapoints
   //list of inverters in summary
   ensureStateAsync(dst_inverter + '.inverter_list', JSON.stringify(inverter), {
      read: true,
      write: false,
      type: 'string',
      role: 'json',
      def: '',
      desc: 'List of inverter serial numbers found (may include local and cloud sources, JSON string)',
   });
   //data for each inverter in summary
   for (let inv of summary_inverter) {
      //serial number
      ensureStateAsync(dst_inverter + '.' + inv.serialNumber + '.serialNumber', String(inv.serialNumber), {
         read: true,
         write: false,
         type: 'string',
         role: 'value',
         def: '',
         desc: 'serial number of the inverter',
      });
      //production data
      ensureStateAsync(dst_inverter + '.' + inv.serialNumber + '.production', Number(inv.production), {
         read: true,
         write: false,
         type: 'number',
         role: 'value',
         unit: 'W',
         def: 0,
         desc: 'production data of the inverter',
      });
      // active state
      ensureStateAsync(dst_inverter + '.' + inv.serialNumber + '.active', inv.active, {
         read: true,
         write: false,
         type: 'boolean',
         role: 'value',
         def: false,
         desc: 'active state of the inverter',
      });
      // inverters id
      ensureStateAsync(dst_inverter + '.' + inv.serialNumber + '.id', Number(inv.id), {
         read: true,
         write: false,
         type: 'number',
         role: 'value',
         def: 0,
         desc: 'id of the inverter',
      });
      // system owns the inverter
      ensureStateAsync(dst_inverter + '.' + inv.serialNumber + '.systemID', Number(inv.systemID), {
         read: true,
         write: false,
         type: 'number',
         role: 'value',
         def: 0,
         desc: 'id of the system owning the inverter',
      });
      // status of the inverter - status switch
      let switchState;
      if (inv.status == 'normal') {
         switchState = true;
      } else {
         switchState = false;
      }
      ensureStateAsync(dst_inverter + '.' + inv.serialNumber + '.status', switchState, {
         read: true,
         write: true,
         type: 'boolean',
         role: 'switch',
         def: false,
         desc: 'Status switch of the inverter (true=normal, false=error)',
      });
      ensureStateAsync(dst_inverter + '.' + inv.serialNumber + '.statusText', inv.status, {
         read: true,
         write: false,
         type: 'string',
         role: 'value',
         def: 'unknown',
         desc: 'Status switch of the inverter (true=normal, false=error)',
      });
   }
}
/**
 * Sets up automatic monitoring for inverter production data.
 * - Executes an initial inverter summary generation at startup.
 * - Checks if at least one inverter serial number exists to validate readiness.
 * - Subscribes to changes of the defined inverter trigger state (rss_inverter_trigger).
 * - On any change, waits briefly (500 ms) to allow all inverter states to update,
 *   then re-runs the inverter summary function to refresh aggregated data.
 * - Produces debug logs according to the configured debug level.
 *
 * @async
 * @function monitorInverterProduction
 * @returns {Promise<void>} Resolves after the initial inverter summary is created and monitoring is active.
 */
await inverterSummary(); //initial run
if (existsState(rss_inverter + '.0.serialNumber')) {
   if (debug > 1) log(`Monitoring inverter production at ${rss_inverter} and updating ${dst_inverter} now`, 'info');
   if (debug > 2) log(`Using event trigger ${rss_inverter_trigger} to refresh inverter data`, 'info');
   on({ id: rss_inverter_trigger, change: 'any' }, function (obj) {
      //timeout 500ms to ensure all inverters are updated
      setTimeout(() => {
         inverterSummary();
      }, 500);
      if (debug > 2) log(`Inverter production updated`, 'info');
   });
}

// ---------------------------------------------------------------------------------------------------
// Read and summarize power data for storage, production, and consumption
// ---------------------------------------------------------------------------------------------------
/**
 * Reads live power data for a given device ID from Enphase livedata and writes summarized values to ioBroker states.
 * - Retrieves total and per-phase (L1–L3) active, apparent, and reactive power values.
 * - Converts Enphase values (MW, MVA) into standard units (W, VA, VAR).
 * - Calculates reactive power from apparent and active power, with safeguards against rounding errors.
 * - Writes results to summary states using ensureStateAsync().
 * - Handles missing data and logs detailed information according to debug level.
 *
 * @async
 * @function powerSummary
 * @param {string|number} id - Identifier of the meter or storage device to process.
 * @returns {Promise<void>} Resolves when all summary states have been updated or exits on error.
 */
async function powerSummary(id) {
   if (debug > 1) log(`Reading data for id ${id}`, 'info');
   if (debug > 2)
      log(`Data ressource: ${JSON.stringify(rss_livedata + '.meters.' + String(id) + '.agg_p_mw')} `, 'info');
   try {
      if (existsState(rss_livedata + '.meters.' + String(id) + '.agg_p_mw')) {
         //total: read and calculate data and convert to W, VA, VAR
         //total: read and calculate data and convert to W, VA, VAR
         let activePower = getState(rss_livedata + '.meters.' + String(id) + '.agg_p_mw').val / 1000;
         let apparentPower = getState(rss_livedata + '.meters.' + String(id) + '.agg_s_mva').val / 1000;
         let reactivePower = apparentPower * apparentPower - activePower * activePower;
         if (reactivePower >= 0) {
            reactivePower = Math.sqrt(reactivePower);
         } else {
            reactivePower = 0; // to avoid NaN in case of negative value due to rounding errors
         }
         //total: write data to summary
         ensureStateAsync(dst_summary + String(id) + '.total.activePower_total', Math.round(activePower * 10) / 10, {
            read: true,
            write: false,
            type: 'number',
            role: 'value',
            unit: 'W',
            def: 0,
            desc: 'Active Power (P) in W',
         });
         ensureStateAsync(
            dst_summary + String(id) + '.total.apparentPower_total',
            Math.round(apparentPower * 10) / 10,
            {
               read: true,
               write: false,
               type: 'number',
               role: 'value',
               unit: 'VA',
               def: 0,
               desc: 'Apparent Power (S) in VA',
            }
         );
         ensureStateAsync(
            dst_summary + String(id) + '.total.reactivePower_total',
            Math.round(reactivePower * 10) / 10,
            {
               read: true,
               write: false,
               type: 'number',
               role: 'value',
               unit: 'VAR',
               def: 0,
               desc: 'Reactive Power (Q) in VAR',
            }
         );
         // L1 (Phase A): read and calculate data and convert to W, VA, VAR
         activePower = getState(rss_livedata + '.meters.' + String(id) + '.agg_p_ph_a_mw').val / 1000;
         apparentPower = getState(rss_livedata + '.meters.' + String(id) + '.agg_s_ph_a_mva').val / 1000;
         reactivePower = apparentPower * apparentPower - activePower * activePower;
         if (reactivePower >= 0) {
            reactivePower = Math.sqrt(reactivePower);
         } else {
            reactivePower = 0; // to avoid NaN in case of negative value due to rounding errors
         }
         //L1 (Phase A): write data to summary
         ensureStateAsync(dst_summary + String(id) + '.L1.activePower_L1', Math.round(activePower * 10) / 10, {
            read: true,
            write: false,
            type: 'number',
            role: 'value',
            unit: 'W',
            def: 0,
            desc: 'Active Power (P) in W',
         });
         ensureStateAsync(dst_summary + String(id) + '.L1.apparentPower_L1', Math.round(apparentPower * 10) / 10, {
            read: true,
            write: false,
            type: 'number',
            role: 'value',
            unit: 'VA',
            def: 0,
            desc: 'Apparent Power (S) in VA',
         });
         ensureStateAsync(dst_summary + String(id) + '.L1.reactivePower_L1', Math.round(reactivePower * 10) / 10, {
            read: true,
            write: false,
            type: 'number',
            role: 'value',
            unit: 'VAR',
            def: 0,
            desc: 'Reactive Power (Q) in VAR',
         });
         // L2 (Phase B): read and calculate data and convert to W, VA, VAR
         activePower = getState(rss_livedata + '.meters.' + String(id) + '.agg_p_ph_b_mw').val / 1000;
         apparentPower = getState(rss_livedata + '.meters.' + String(id) + '.agg_s_ph_b_mva').val / 1000;
         reactivePower = apparentPower * apparentPower - activePower * activePower;
         if (reactivePower >= 0) {
            reactivePower = Math.sqrt(reactivePower);
         } else {
            reactivePower = 0; // to avoid NaN in case of negative value due to rounding errors
         }
         //L2 (Phase B): write data to summary
         ensureStateAsync(dst_summary + String(id) + '.L2.activePower_L2', Math.round(activePower * 10) / 10, {
            read: true,
            write: false,
            type: 'number',
            role: 'value',
            unit: 'W',
            def: 0,
            desc: 'Active Power (P) in W',
         });
         ensureStateAsync(dst_summary + String(id) + '.L2.apparentPower_L2', Math.round(apparentPower * 10) / 10, {
            read: true,
            write: false,
            type: 'number',
            role: 'value',
            unit: 'VA',
            def: 0,
            desc: 'Apparent Power (S) in VA',
         });
         ensureStateAsync(dst_summary + String(id) + '.L2.reactivePower_L2', Math.round(reactivePower * 10) / 10, {
            read: true,
            write: false,
            type: 'number',
            role: 'value',
            unit: 'VAR',
            def: 0,
            desc: 'Reactive Power (Q) in VAR',
         });
         // L3 (Phase C): read and calculate data and convert to W, VA, VAR
         activePower = getState(rss_livedata + '.meters.' + String(id) + '.agg_p_ph_c_mw').val / 1000;
         apparentPower = getState(rss_livedata + '.meters.' + String(id) + '.agg_s_ph_c_mva').val / 1000;
         reactivePower = apparentPower * apparentPower - activePower * activePower;
         if (reactivePower >= 0) {
            reactivePower = Math.sqrt(reactivePower);
         } else {
            reactivePower = 0; // to avoid NaN in case of negative value due to rounding errors
         }
         //L3 (Phase C): write data to summary
         ensureStateAsync(dst_summary + String(id) + '.L3.activePower_L3', Math.round(activePower * 10) / 10, {
            read: true,
            write: false,
            type: 'number',
            role: 'value',
            unit: 'W',
            def: 0,
            desc: 'Active Power (P) in W',
         });
         ensureStateAsync(dst_summary + String(id) + '.L3.apparentPower_L3', Math.round(apparentPower * 10) / 10, {
            read: true,
            write: false,
            type: 'number',
            role: 'value',
            unit: 'VA',
            def: 0,
            desc: 'Apparent Power (S) in VA',
         });
         ensureStateAsync(dst_summary + String(id) + '.L3.reactivePower_L3', Math.round(reactivePower * 10) / 10, {
            read: true,
            write: false,
            type: 'number',
            role: 'value',
            unit: 'VAR',
            def: 0,
            desc: 'Reactive Power (Q) in VAR',
         });
      } else {
         if (debug > 0) log(`No data found in local livedata. Please check local data`, 'info');
         return;
      }
   } catch {
      log(`Error while accessing data for id ${id}`, 'error');
      return;
   }
}

//---------------------------------------------------------------------------------------------------
// monitoring power data
//---------------------------------------------------------------------------------------------------
// monitoring power data and updating summary based on trigger state
if (existsState(rss_power_trigger)) {
   if (debug > 1) log(`Monitoring power measures at ${rss_power_trigger} now`, 'info');
   on({ id: rss_power_trigger, change: 'any' }, function (obj) {
      //timeout 500ms to ensure all power data states are updated before summary calculation
      setTimeout(async () => {
         powerSummary('load');
         powerSummary('storage');
         powerSummary('grid');
         powerSummary('pv');
      }, 500);
      if (debug > 2) log(`Power updated for ids: load, storage, grid, pv`, 'info');
   });
}

// ---------------------------------------------------------------------------------------------------
// Read and summarize battery data for all batteries
// ---------------------------------------------------------------------------------------------------
// read data of all batteries and store in array
/**
 * Reads all available local and cloud battery data, summarizes it, and updates the corresponding summary states.
 * - Scans through all locally available batteries via RSS states.
 * - Reads battery details such as serial number, temperature, charge level, and LED status.
 * - Retrieves additional cloud data (status, activity, system mapping).
 * - Merges local and cloud data into a combined summary array.
 * - Writes results to ioBroker summary datapoints for further processing or display.
 *
 * Features:
 * - Dynamically discovers all batteries by iterating over sequential IDs until no more are found.
 * - Supports systems retrieved from cloud data via `rss_dbSystemIDs`.
 * - Logs detailed progress and debug information depending on the debug level.
 * - Automatically creates missing summary states asynchronously using `ensureStateAsync`.
 *
 * @async
 * @function batterySummary
 * @returns {Promise<void>} Resolves when all summary states have been updated.
 *
 */
async function batterySummary() {
   let battery = [];
   let battery_sn = [];
   let notDoneYet = true;
   let i = 0;
   let serial;
   let totalBatteryCapacity = 0;
   do {
      if (existsState(rss_battery + '.' + i + '.serial_num')) {
         try {
            if (i == 0) {
               rss_battery_trigger = rss_battery + '.' + i + '.percentFull';
               if (debug > 1) log(`Battery trigger set to ${rss_battery_trigger} now`, 'info');
            }
            serial = getState(rss_battery + '.' + i + '.serial_num').val;
            let percentFull = 0;
            if (existsState(rss_battery + '.' + i + '.percentFull')) {
               percentFull = getState(rss_battery + '.' + i + '.percentFull').val;
            } else {
               if (debug > 1)
                  log(`Battery ID ${i} serial number state exists but percentFull state is missing`, 'info');
            }
            let temperature = 0;
            if (existsState(rss_battery + '.' + i + '.temperature')) {
               temperature = getState(rss_battery + '.' + i + '.temperature').val;
            } else {
               if (debug > 1)
                  log(`Battery ID ${i} serial number state exists but temperature state is missing`, 'info');
            }
            let encharge_capacity = 0;
            if (existsState(rss_battery + '.' + i + '.encharge_capacity')) {
               encharge_capacity = getState(rss_battery + '.' + i + '.encharge_capacity').val;
            } else {
               encharge_capacity = 0;
               if (debug > 1)
                  log(`Battery ID ${i} serial number state exists but encharge_capacity state is missing`, 'info');
            }
            totalBatteryCapacity += encharge_capacity;
            let led_status = 0;
            if (existsState(rss_battery + '.' + i + '.led_status')) {
               led_status = getState(rss_battery + '.' + i + '.led_status').val;
            } else {
               if (debug > 1) log(`Battery ID ${i} serial number state exists but led_status state is missing`, 'info');
            }
            battery.push({
               serialNumber: serial,
               percentFull: percentFull,
               temperature: temperature,
               encharge_capacity: encharge_capacity,
               led_status: led_status,
            });
            battery_sn.push(serial);
            if (debug > 2)
               log(
                  `Battery ID ${i} has serial number ${serial}, percentFull: ${percentFull}, temperature: ${temperature}, encharge_capacity: ${encharge_capacity}, led_status: ${led_status}`,
                  'info'
               );
         } catch {
            log(`Battery ID ${i} does exist but serial number state is invalid or missing`, 'error');
         }
      } else {
         notDoneYet = false;
         if (debug > 1) log(`No more batteries found after ID ${i - 1}. Stopping search`, 'info');
      }
      i++;
   } while (notDoneYet);
   if (debug > 2) log(`Found ${battery.length} batteries: ${JSON.stringify(battery)}`, 'info');
   if (debug > 2) log(`List of batteries: ${battery_sn}`, 'info');
   // read state of summary inverter and store it in array
   let status_battery = [];
   notDoneYet = true;
   let systems = [];
   i = 0;
   try {
      const rawSystems = getState(rss_dbSystemIDs).val;
      systems = [];
      if (rawSystems == null || rawSystems === '') {
         systems = [];
         if (debug > 0) log(`No systems found in ${rss_dbSystemIDs}. Value is null or empty`, 'info');
      } else if (Array.isArray(rawSystems)) {
         systems = rawSystems;
         if (debug > 1) log(`Found systems in ${rss_dbSystemIDs}: ${JSON.stringify(systems)}`, 'info');
      } else if (typeof rawSystems === 'string') {
         const s = rawSystems.trim();
         try {
            const parsed = JSON.parse(s); // try JSON array first
            systems = Array.isArray(parsed) ? parsed : [String(parsed)];
            if (debug > 1) log(`Found systems in ${rss_dbSystemIDs}: ${JSON.stringify(systems)}`, 'info');
         } catch (e) {
            // fallback to comma separated
            systems = s.length
               ? s
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean)
               : [];
            if (debug > 1)
               log(`Found systems in ${rss_dbSystemIDs} (comma separated): ${JSON.stringify(systems)}`, 'info');
         }
      } else {
         systems = [String(rawSystems)];
         if (debug > 1) log(`Found single system in ${rss_dbSystemIDs}: ${JSON.stringify(systems)}`, 'info');
      }
   } catch {
      systems = [];
      if (debug > 0) log(`No systems found in ${rss_dbSystemIDs}. Please run FetchSystems first`, 'info');
   }
   if (debug > 1) log('Systems known from Array: ' + JSON.stringify(systems), 'info');
   for (let system in systems) {
      if (debug > 2) log('System ID:' + systems[system], 'info');
      if (existsState(rss_cloud + 'Systems.System_' + systems[system] + '.devices.devices.encharges.0.status')) {
         if (debug > 1) log(`Battery found for system ${systems[system]}`, 'info');
         //search for all batteries in the system and store status in array
         do {
            if (
               existsState(
                  rss_cloud + 'Systems.System_' + systems[system] + '.devices.devices.encharges.' + i + '.status'
               )
            ) {
               try {
                  let inv_status = getState(
                     rss_cloud + 'Systems.System_' + systems[system] + '.devices.devices.encharges.' + i + '.status'
                  ).val;
                  let inv_serial = getState(
                     rss_cloud +
                        'Systems.System_' +
                        systems[system] +
                        '.devices.devices.encharges.' +
                        i +
                        '.serial_number'
                  ).val;
                  let inv_active = getState(
                     rss_cloud + 'Systems.System_' + systems[system] + '.devices.devices.encharges.' + i + '.active'
                  ).val;
                  let inv_id = getState(
                     rss_cloud + 'Systems.System_' + systems[system] + '.devices.devices.encharges.' + i + '.id'
                  ).val;
                  status_battery.push({
                     serialNumber: inv_serial,
                     status: inv_status,
                     active: inv_active,
                     id: inv_id,
                     systemID: systems[system],
                  });
                  if (debug > 2)
                     log(`System ${systems[system]} owns battery ${i} with serial number: ${inv_serial}`, 'info');
                  i++;
               } catch {
                  if (debug > 1) log(`Error while processing battery ${i} for system ${systems[system]}`, 'info');
                  notDoneYet = false;
               }
               if (i > 40) notDoneYet = false; //safety exit
            } else {
               notDoneYet = false;
               if (debug > 1)
                  log(
                     `No more batteries found for system ${systems[system]} after ID ${i - 1}. Stopping search`,
                     'info'
                  );
            }
         } while (notDoneYet);
      } else {
         if (debug > 1) log(`No battery found for system ${systems[system]}`, 'info');
      }
   }
   if (status_battery.length == 0) {
      if (debug > 0) log(`No battery status found in any system. Please check cloud data`, 'info');
   } else {
      if (debug > 2) log(`Battery status found: ${JSON.stringify(status_battery)}`, 'info');
   }
   //sort arrays by serial number to ensure matching order
   battery.sort((a, b) => a.serialNumber.localeCompare(b.serialNumber));
   if (debug > 2) log(`battery after sort: ${JSON.stringify(battery)}`, 'info');
   battery_sn.sort((a, b) => a.localeCompare(b));
   if (debug > 2) log(`battery list after sort: ${JSON.stringify(battery_sn)}`, 'info');
   status_battery.sort((a, b) => a.serialNumber.localeCompare(b.serialNumber));
   if (debug > 2) log(`battery status after sort: ${JSON.stringify(status_battery)}`, 'info');
   //match production and status of each battery and write to summary
   let summary_battery = [];
   for (let inv in battery) {
      let prod = battery[inv];
      let status = status_battery.find((s) => s.serialNumber === prod.serialNumber);
      if (status) {
         // If status is found, write to summary
         summary_battery.push({
            serialNumber: prod.serialNumber,
            percentFull: prod.percentFull,
            temperature: prod.temperature,
            capacity: prod.encharge_capacity,
            led_status: prod.led_status,
            status: status.status,
            active: status.active,
            id: status.id,
            systemID: status.systemID,
         });
      } else {
         summary_battery.push({
            serialNumber: prod.serialNumber,
            percentFull: prod.percentFull,
            temperature: prod.temperature,
            capacity: prod.encharge_capacity,
            led_status: prod.led_status,
            status: 'unknown',
            active: 0,
            id: 'unknown',
            systemID: 'unknown',
         });
      }
   }
   if (debug > 2) log(`Summary battery data: ${JSON.stringify(summary_battery)}`, 'info');
   // write summary battery data to ioBroker datapoints
   //list of batteries in summary
   ensureStateAsync(dst_battery + '.battery_list', JSON.stringify(battery_sn), {
      read: true,
      write: false,
      type: 'string',
      role: 'json',
      def: '',
      desc: 'List of battery serial numbers found (may include local and cloud sources, JSON string)',
   });
   //total capacity of all batteries
   ensureStateAsync(dst_battery + '.total_capacity_Wh', Number(totalBatteryCapacity), {
      read: true,
      write: false,
      type: 'number',
      role: 'value',
      unit: 'Wh',
      def: 0,
      desc: 'Total capacity of all batteries',
   });
   //data for each battery in summary
   for (let bat of summary_battery) {
      //serial number
      ensureStateAsync(dst_battery + '.' + bat.serialNumber + '.serialNumber', String(bat.serialNumber), {
         read: true,
         write: false,
         type: 'string',
         role: 'value',
         def: '',
         desc: 'serial number of the battery',
      });
      //temperature data
      ensureStateAsync(dst_battery + '.' + bat.serialNumber + '.temperature', Number(bat.temperature), {
         read: true,
         write: false,
         type: 'number',
         role: 'value',
         unit: '°C',
         def: 0,
         desc: 'temperature data of the battery',
      });
      //capacity data
      ensureStateAsync(dst_battery + '.' + bat.serialNumber + '.capacity', Number(bat.capacity), {
         read: true,
         write: false,
         type: 'number',
         role: 'value',
         unit: 'Wh',
         def: 0,
         desc: 'capacity data of the battery',
      });
      //led status data
      ensureStateAsync(dst_battery + '.' + bat.serialNumber + '.led_status', String(bat.led_status), {
         read: true,
         write: false,
         type: 'string',
         role: 'value',
         def: '',
         desc: 'LED status of the battery',
      });
      //percent full data
      ensureStateAsync(dst_battery + '.' + bat.serialNumber + '.percentFull', Number(bat.percentFull), {
         read: true,
         write: false,
         type: 'number',
         role: 'value',
         unit: '%',
         def: 0,
         desc: 'percent full data of the battery',
      });
      // active state
      ensureStateAsync(dst_battery + '.' + bat.serialNumber + '.active', bat.active, {
         read: true,
         write: false,
         type: 'boolean',
         role: 'value',
         def: false,
         desc: 'active state of the battery',
      });
      // inverters id
      ensureStateAsync(dst_battery + '.' + bat.serialNumber + '.id', Number(bat.id), {
         read: true,
         write: false,
         type: 'number',
         role: 'value',
         def: 0,
         desc: 'id of the battery',
      });
      // system owns the battery
      ensureStateAsync(dst_battery + '.' + bat.serialNumber + '.systemID', Number(bat.systemID), {
         read: true,
         write: false,
         type: 'number',
         role: 'value',
         def: 0,
         desc: 'id of the system owning the battery',
      });
      // status of the battery - status switch
      let switchState;
      if (bat.status == 'normal') {
         switchState = true;
      } else {
         switchState = false;
      }
      ensureStateAsync(dst_battery + '.' + bat.serialNumber + '.status', switchState, {
         read: true,
         write: true,
         type: 'boolean',
         role: 'switch',
         def: false,
         desc: 'Status switch of the battery (true=normal, false=error)',
      });
      ensureStateAsync(dst_battery + '.' + bat.serialNumber + '.statusText', bat.status, {
         read: true,
         write: false,
         type: 'string',
         role: 'value',
         def: 'unknown',
         desc: 'Status switch of the battery (true=normal, false=error)',
      });
   }
}
/**
 * Monitors battery production data and triggers updates of the battery summary.
 * - Performs an initial summary update on script start.
 * - If battery data exists, sets up an event listener on the defined trigger state.
 * - Ensures delayed execution (500 ms) to allow all battery states to update before recalculating the summary.
 * - Logs monitoring and trigger setup actions.
 */
await batterySummary(); //initial run
if (existsState(rss_battery + '.0.serial_num')) {
   if (debug > 1) log(`Monitoring battery production at ${rss_battery} and updating ${dst_battery} now`, 'info');
   if (debug > 2) log(`Using event trigger ${rss_battery_trigger} to refresh battery data`, 'info');
   on({ id: rss_battery_trigger, change: 'any' }, function (obj) {
      //timeout 500ms to ensure all batteries are updated
      setTimeout(() => {
         batterySummary();
      }, 500);
      if (debug > 2) log(`Battery production updated`, 'info');
   });
}

//---------------------------------------------------------------------------------------------------
// read gateway data and summarize
//---------------------------------------------------------------------------------------------------
/**
 * Reads and summarizes gateway information from all systems available in ioBroker.
 * - Collects gateway status, activity state, and system associations from Enphase cloud data.
 * - Iterates through all configured systems and retrieves gateway details dynamically.
 * - Sorts data by serial number for consistent ordering.
 * - Writes structured gateway summary data to ioBroker datapoints.
 * - Logs detailed progress and errors depending on debug level.
 *
 * @async
 * @function gatewaySummary
 */
async function gatewaySummary() {
   let notDoneYet = true;
   let i = 0;
   let status_gateway = [];
   notDoneYet = true;
   let systems = [];
   i = 0;
   try {
      const rawSystems = getState(rss_dbSystemIDs).val;
      systems = [];
      if (rawSystems == null || rawSystems === '') {
         systems = [];
         if (debug > 0) log(`No systems found in ${rss_dbSystemIDs}. Value is null or empty`, 'info');
      } else if (Array.isArray(rawSystems)) {
         systems = rawSystems;
         if (debug > 1) log(`Found systems in ${rss_dbSystemIDs}: ${JSON.stringify(systems)}`, 'info');
      } else if (typeof rawSystems === 'string') {
         const s = rawSystems.trim();
         try {
            const parsed = JSON.parse(s); // try JSON array first
            systems = Array.isArray(parsed) ? parsed : [String(parsed)];
            if (debug > 1) log(`Found systems in ${rss_dbSystemIDs}: ${JSON.stringify(systems)}`, 'info');
         } catch (e) {
            // fallback to comma separated
            systems = s.length
               ? s
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean)
               : [];
            if (debug > 1)
               log(`Found systems in ${rss_dbSystemIDs} (comma separated): ${JSON.stringify(systems)}`, 'info');
         }
      } else {
         systems = [String(rawSystems)];
         if (debug > 1) log(`Found single system in ${rss_dbSystemIDs}: ${JSON.stringify(systems)}`, 'info');
      }
   } catch {
      systems = [];
      if (debug > 0) log(`No systems found in ${rss_dbSystemIDs}. Please run FetchSystems first`, 'info');
   }
   if (debug > 1) log('Systems known from Array: ' + JSON.stringify(systems), 'info');
   for (let system in systems) {
      if (debug > 2) log('System ID:' + systems[system], 'info');
      if (existsState(rss_cloud + 'Systems.System_' + systems[system] + '.devices.devices.gateways.0.status')) {
         if (debug > 1) log(`Gateway found for system ${systems[system]}`, 'info');
         //search for all gateways in the system and store status in array
         rss_gateway_trigger = rss_cloud + 'Systems.System_' + systems[system] + '.devices.devices.gateways.0.status';
         do {
            if (
               existsState(
                  rss_cloud + 'Systems.System_' + systems[system] + '.devices.devices.gateways.' + i + '.status'
               )
            ) {
               try {
                  let inv_status = getState(
                     rss_cloud + 'Systems.System_' + systems[system] + '.devices.devices.gateways.' + i + '.status'
                  ).val;
                  let inv_serial = getState(
                     rss_cloud +
                        'Systems.System_' +
                        systems[system] +
                        '.devices.devices.gateways.' +
                        i +
                        '.serial_number'
                  ).val;
                  let inv_active = getState(
                     rss_cloud + 'Systems.System_' + systems[system] + '.devices.devices.gateways.' + i + '.active'
                  ).val;
                  let inv_id = getState(
                     rss_cloud + 'Systems.System_' + systems[system] + '.devices.devices.gateways.' + i + '.id'
                  ).val;
                  status_gateway.push({
                     serialNumber: inv_serial,
                     status: inv_status,
                     active: inv_active,
                     id: inv_id,
                     systemID: systems[system],
                  });
                  if (debug > 2)
                     log(`System ${systems[system]} owns gateways ${i} with serial number: ${inv_serial}`, 'info');
                  i++;
               } catch {
                  if (debug > 1) log(`Error while processing gateway ${i} for system ${systems[system]}`, 'info');
                  notDoneYet = false;
               }
               if (i > 40) notDoneYet = false; //safety exit
            } else {
               notDoneYet = false;
               if (debug > 1)
                  log(
                     `No more gateways found for system ${systems[system]} after ID ${i - 1}. Stopping search`,
                     'info'
                  );
            }
         } while (notDoneYet);
      } else {
         if (debug > 1) log(`No gateways found for system ${systems[system]}`, 'info');
      }
   }
   if (status_gateway.length == 0) {
      if (debug > 0) log(`No gateway status found in any system. Please check cloud data`, 'info');
   } else {
      if (debug > 2) log(`Gateway status found: ${JSON.stringify(status_gateway)}`, 'info');
   }
   //sort arrays by serial number to ensure matching order
   status_gateway.sort((a, b) => a.serialNumber.localeCompare(b.serialNumber));
   if (debug > 2) log(`gateway status after sort: ${JSON.stringify(status_gateway)}`, 'info');
   // write status gateway data to ioBroker datapoints
   //data for each gateway in summary
   for (let gw of status_gateway) {
      //serial number
      ensureStateAsync(dst_gateway + '.' + gw.serialNumber + '.serialNumber', String(gw.serialNumber), {
         read: true,
         write: false,
         type: 'string',
         role: 'value',
         def: '',
         desc: 'serial number of the gateway',
      });
      // active state
      ensureStateAsync(dst_gateway + '.' + gw.serialNumber + '.active', gw.active, {
         read: true,
         write: false,
         type: 'boolean',
         role: 'value',
         def: false,
         desc: 'active state of the gateway',
      });
      // gateway id
      ensureStateAsync(dst_gateway + '.' + gw.serialNumber + '.id', Number(gw.id), {
         read: true,
         write: false,
         type: 'number',
         role: 'value',
         def: 0,
         desc: 'id of the gateway',
      });
      // system owns the gateway
      ensureStateAsync(dst_gateway + '.' + gw.serialNumber + '.systemID', Number(gw.systemID), {
         read: true,
         write: false,
         type: 'number',
         role: 'value',
         def: 0,
         desc: 'id of the system owning the gateway',
      });
      // status of the gateway - status switch
      let switchState;
      if (gw.status == 'normal') {
         switchState = true;
      } else {
         switchState = false;
      }
      ensureStateAsync(dst_gateway + '.' + gw.serialNumber + '.status', switchState, {
         read: true,
         write: true,
         type: 'boolean',
         role: 'switch',
         def: false,
         desc: 'Status switch of the gateway (true=normal, false=error)',
      });
      ensureStateAsync(dst_gateway + '.' + gw.serialNumber + '.statusText', gw.status, {
         read: true,
         write: false,
         type: 'string',
         role: 'value',
         def: 'unknown',
         desc: 'Status switch of the gateway (true=normal, false=error)',
      });
   }
}
/**
 * Monitors gateway status updates and triggers summary recalculation.
 * - Performs an initial summary update on script start.
 * - Sets up an event listener on the defined gateway trigger state.
 * - Ensures delayed execution (500 ms) to allow all gateway states to update before recalculating.
 * - Logs monitoring actions and trigger events based on debug level.
 */
await gatewaySummary(); //initial run
if (existsState(rss_gateway_trigger)) {
   if (debug > 1) log(`Monitoring gateway and updating ${dst_gateway} now`, 'info');
   if (debug > 2) log(`Using event trigger ${rss_gateway_trigger} to refresh gateway data`, 'info');
   on({ id: rss_gateway_trigger, change: 'any' }, function (obj) {
      //timeout 500ms to ensure all gateways are updated
      setTimeout(() => {
         gatewaySummary();
      }, 500);
      if (debug > 2) log(`Gateway status updated`, 'info');
   });
}

//---------------------------------------------------------------------------------------------------
// Batterieladung auf 100% bzw. auf lowest SoC berechnen
//---------------------------------------------------------------------------------------------------
async function calcBatteryChargeTime(loadPower) {
   // get total battery capacity
   let totalBatteryCapacity_Wh = 0;
   try {
      totalBatteryCapacity_Wh = getState(dst_battery + '.total_capacity_Wh').val;
      if (debug > 2) log(`Current battery capacity: ${totalBatteryCapacity_Wh} Wh`, 'info');
   } catch (error) {
      totalBatteryCapacity_Wh = 0;
      log(`Error in calcBatteryChargeTime getting totalBatteryCapacity_Wh: ${error}`, 'error');
   }
   // get SoC of all batteries
   let totalSoC_percent = 0;
   try {
      totalSoC_percent = getState(dst_SoC).val;
      if (debug > 2) log(`Current total SoC: ${totalSoC_percent} %`, 'info');
   } catch (error) {
      totalSoC_percent = 0;
      log(`Error in calcBatteryChargeTime getting SoC: ${error}`, 'error');
   }
   // check loadPower
   if (loadPower == null || loadPower == '') {
      // Intentionally left blank: no action needed if loadPower is null or empty
      if (debug > 0) log('loadPower is null or empty in calcBatteryChargeTime', 'warn');
      loadPower = 0;
   }
   if (loadPower < 0) {
      loadPower = 0;
      if (debug > 0) log('loadPower is negative in calcBatteryChargeTime -> set to 0', 'warn');
   }
   // calculate time to full charge
   let timeToFullCharge = 0;
   if (totalBatteryCapacity_Wh > 0 && totalSoC_percent < 100 && loadPower > 0) {
      const remainingCapacity = totalBatteryCapacity_Wh * (1 - totalSoC_percent / 100);
      timeToFullCharge = remainingCapacity / loadPower; // time in hours
   }
   if (debug > 2) log(`Time to full charge: ${timeToFullCharge} hours`, 'info');
   return timeToFullCharge;
}
async function calcBatteryDischargeTime(loadPower) {
   // set lowest SoC the discharge power is used for calculation
   let lowestSoC = 5; // in percent - maybe readable from local or cloud data in future
   // get total battery capacity
   let totalBatteryCapacity_Wh = 0;
   try {
      totalBatteryCapacity_Wh = getState(dst_battery + '.total_capacity_Wh').val;
      if (debug > 2) log(`Current battery capacity: ${totalBatteryCapacity_Wh} Wh`, 'info');
   } catch (error) {
      totalBatteryCapacity_Wh = 0;
      log(`Error in calcBatteryDischargeTime getting totalBatteryCapacity_Wh: ${error}`, 'error');
   }
   // get SoC of all batteries
   let totalSoC_percent = 0;
   try {
      totalSoC_percent = getState(dst_SoC).val;
      if (debug > 2) log(`Current total SoC: ${totalSoC_percent} %`, 'info');
   } catch (error) {
      totalSoC_percent = 0;
      log(`Error in calcBatteryDischargeTime getting SoC: ${error}`, 'error');
   }
   // check loadPower
   if (loadPower == null || loadPower == '') {
      // Intentionally left blank: no action needed if loadPower is null or empty
      if (debug > 0) log('loadPower is null or empty in calcBatteryDischargeTime', 'warn');
      loadPower = 0;
   }
   if (loadPower > 0) {
      loadPower = 0;
      if (debug > 0) log('loadPower is positive in calcBatteryDischargeTime -> set to 0', 'warn');
   }
   // calculate time to full discharge
   let timeToFullDischarge = 0;
   if (totalBatteryCapacity_Wh > 0 && totalSoC_percent > lowestSoC && loadPower < 0) {
      const remainingCapacity = totalBatteryCapacity_Wh * (totalSoC_percent / 100 - lowestSoC / 100);
      timeToFullDischarge = (remainingCapacity / loadPower) * -1; // time in hours
   }
   if (debug > 2) log(`Time to full discharge: ${timeToFullDischarge} hours`, 'info');
   return timeToFullDischarge;
}
// handler to recalculate battery charge/discharge time on load power change
if (existsState(dst_summary + 'storage.total.activePower_total')) {
   if (debug > 1) log(`Monitoring load power to recalculate battery charge/discharge time`, 'info');
   if (debug > 2) log(`Using event trigger ${dst_summary + 'storage.total.activePower_total'}`, 'info');
   on({ id: dst_summary + 'storage.total.activePower_total', change: 'any' }, async (obj) => {
      let loadPower = obj.state.val * -1; // load power is negative in storage summary when charging
      if (loadPower > 0) {
         if (debug > 2) log(`Load power for battery charging: ${loadPower} W`, 'info');
         // Recalculate battery charge time
         let timeToFullCharge = await calcBatteryChargeTime(loadPower);
         let timeToFullCharge_min = timeToFullCharge * 60;
         let now = new Date();
         let fullChargeTime;
         let fullChargeTime_str;
         let fullChargeTime_h_min;
         if (timeToFullCharge > 0) {
            fullChargeTime = new Date(now.getTime() + timeToFullCharge * 60 * 60 * 1000);
            fullChargeTime_str = fullChargeTime.toLocaleString('de-DE', {
               hour: '2-digit',
               minute: '2-digit',
               second: '2-digit',
            });
            const hours = Math.floor(timeToFullCharge);
            const minutes = Math.round((timeToFullCharge - hours) * 60);
            fullChargeTime_h_min = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
         } else {
            fullChargeTime = new Date(0);
            fullChargeTime_str = 'N/A';
            fullChargeTime_h_min = '00:00';
         }
         await ensureStateAsync(dst_summary + 'battery.timeToFullCharge_h', Math.round(timeToFullCharge * 100) / 100, {
            read: true,
            write: false,
            type: 'number',
            role: 'value',
            def: 0,
            unit: 'h',
            desc: 'Time to full charge in hours',
         });
         await ensureStateAsync(
            dst_summary + 'battery.timeToFullCharge_min',
            Math.round(timeToFullCharge_min * 100) / 100,
            {
               read: true,
               write: false,
               type: 'number',
               role: 'value',
               def: 0,
               unit: 'min',
               desc: 'Time to full charge in minutes',
            }
         );
         await ensureStateAsync(dst_summary + 'battery.timeToFullCharge_h_min', fullChargeTime_h_min, {
            read: true,
            write: false,
            type: 'string',
            role: 'text',
            def: '00:00',
            desc: 'Time to full charge in hours and minutes',
         });
         await ensureStateAsync(dst_summary + 'battery.timeToFullCharge_at', fullChargeTime_str, {
            read: true,
            write: false,
            type: 'string',
            role: 'text',
            desc: 'Local time when battery will be full',
         });
         await ensureStateAsync(dst_summary + 'battery.timeToFullCharge_ts', fullChargeTime.getTime(), {
            read: true,
            write: false,
            type: 'number',
            role: 'value.time',
            desc: 'Unix timestamp when battery will be full',
         });
         // zero discharge time states
         await ensureStateAsync(dst_summary + 'battery.timeToFullDischarge_h', 0, {
            read: true,
            write: false,
            type: 'number',
            role: 'value',
            def: 0,
            unit: 'h',
            desc: 'Time to full discharge in hours',
         });
         await ensureStateAsync(dst_summary + 'battery.timeToFullDischarge_min', 0, {
            read: true,
            write: false,
            type: 'number',
            role: 'value',
            def: 0,
            unit: 'min',
            desc: 'Time to full discharge in minutes',
         });
         await ensureStateAsync(dst_summary + 'battery.timeToFullCharge_h_min', '00:00', {
            read: true,
            write: false,
            type: 'string',
            role: 'text',
            def: '00:00',
            desc: 'Time to full charge in hours and minutes',
         });
         await ensureStateAsync(dst_summary + 'battery.timeToFullDischarge_at', 'N/A', {
            read: true,
            write: false,
            type: 'string',
            role: 'text',
            desc: 'Local time when battery will be empty',
         });
         await ensureStateAsync(dst_summary + 'battery.timeToFullDischarge_ts', 0, {
            read: true,
            write: false,
            type: 'number',
            role: 'value.time',
            desc: 'Unix timestamp when battery will be empty',
         });
      } else if (loadPower < 0) {
         // Handle negative load power (discharging)
         if (debug > 2) log(`Load power for battery discharging: ${loadPower} W`, 'info');
         // Recalculate battery charge time
         let timeToFullDischarge = await calcBatteryDischargeTime(loadPower);
         let timeToFullDischarge_min = timeToFullDischarge * 60;
         let now = new Date();
         let fullDischargeTime;
         let fullDischargeTime_str;
         let fullDischargeTime_h_min;
         if (timeToFullDischarge > 0) {
            fullDischargeTime = new Date(now.getTime() + timeToFullDischarge * 60 * 60 * 1000);
            fullDischargeTime_str = fullDischargeTime.toLocaleString('de-DE', {
               hour: '2-digit',
               minute: '2-digit',
               second: '2-digit',
            });
            const hours = Math.floor(timeToFullDischarge);
            const minutes = Math.round((timeToFullDischarge - hours) * 60);
            fullDischargeTime_h_min = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
         } else {
            fullDischargeTime = new Date(0);
            fullDischargeTime_str = 'N/A';
            fullDischargeTime_h_min = '00:00';
         }
         await ensureStateAsync(
            dst_summary + 'battery.timeToFullDischarge_h',
            Math.round(timeToFullDischarge * 100) / 100,
            {
               read: true,
               write: false,
               type: 'number',
               role: 'value',
               def: 0,
               unit: 'h',
               desc: 'Time to full discharge in hours',
            }
         );
         await ensureStateAsync(
            dst_summary + 'battery.timeToFullDischarge_min',
            Math.round(timeToFullDischarge_min * 100) / 100,
            {
               read: true,
               write: false,
               type: 'number',
               role: 'value',
               def: 0,
               unit: 'min',
               desc: 'Time to full discharge in minutes',
            }
         );
         await ensureStateAsync(dst_summary + 'battery.timeToFullCharge_h_min', fullDischargeTime_h_min, {
            read: true,
            write: false,
            type: 'string',
            role: 'text',
            def: '00:00',
            desc: 'Time to full charge in hours and minutes',
         });
         await ensureStateAsync(dst_summary + 'battery.timeToFullDischarge_at', fullDischargeTime_str, {
            read: true,
            write: false,
            type: 'string',
            role: 'text',
            desc: 'Local time when battery will be empty',
         });
         await ensureStateAsync(dst_summary + 'battery.timeToFullDischarge_ts', fullDischargeTime.getTime(), {
            read: true,
            write: false,
            type: 'number',
            role: 'value.time',
            desc: 'Unix timestamp when battery will be empty',
         });
         // zero charge time states
         await ensureStateAsync(dst_summary + 'battery.timeToFullCharge_h', 0, {
            read: true,
            write: false,
            type: 'number',
            role: 'value',
            def: 0,
            unit: 'h',
            desc: 'Time to full charge in hours',
         });
         await ensureStateAsync(dst_summary + 'battery.timeToFullCharge_min', 0, {
            read: true,
            write: false,
            type: 'number',
            role: 'value',
            def: 0,
            unit: 'min',
            desc: 'Time to full charge in minutes',
         });
         await ensureStateAsync(dst_summary + 'battery.timeToFullCharge_h_min', '00:00', {
            read: true,
            write: false,
            type: 'string',
            role: 'text',
            def: '00:00',
            desc: 'Time to full charge in hours and minutes',
         });
         await ensureStateAsync(dst_summary + 'battery.timeToFullCharge_at', 'N/A', {
            read: true,
            write: false,
            type: 'string',
            role: 'text',
            desc: 'Local time when battery will be full',
         });
         await ensureStateAsync(dst_summary + 'battery.timeToFullCharge_ts', 0, {
            read: true,
            write: false,
            type: 'number',
            role: 'value.time',
            desc: 'Unix timestamp when battery will be full',
         });
      } else {
         if (debug > 2)
            log(`Load power is zero, no charge/discharge time calculation needed - values set to 0`, 'info');
         // zero charge time states
         await ensureStateAsync(dst_summary + 'battery.timeToFullCharge_h', 0, {
            read: true,
            write: false,
            type: 'number',
            role: 'value',
            def: 0,
            unit: 'h',
            desc: 'Time to full charge in hours',
         });
         await ensureStateAsync(dst_summary + 'battery.timeToFullCharge_min', 0, {
            read: true,
            write: false,
            type: 'number',
            role: 'value',
            def: 0,
            unit: 'min',
            desc: 'Time to full charge in minutes',
         });
         await ensureStateAsync(dst_summary + 'battery.timeToFullCharge_h_min', '00:00', {
            read: true,
            write: false,
            type: 'string',
            role: 'text',
            def: '00:00',
            desc: 'Time to full charge in hours and minutes',
         });
         await ensureStateAsync(dst_summary + 'battery.timeToFullCharge_at', 'N/A', {
            read: true,
            write: false,
            type: 'string',
            role: 'text',
            desc: 'Local time when battery will be full',
         });
         await ensureStateAsync(dst_summary + 'battery.timeToFullCharge_ts', 0, {
            read: true,
            write: false,
            type: 'number',
            role: 'value.time',
            desc: 'Unix timestamp when battery will be full',
         });
         // zero discharge time states
         await ensureStateAsync(dst_summary + 'battery.timeToFullDischarge_h', 0, {
            read: true,
            write: false,
            type: 'number',
            role: 'value',
            def: 0,
            unit: 'h',
            desc: 'Time to full discharge in hours',
         });
         await ensureStateAsync(dst_summary + 'battery.timeToFullDischarge_min', 0, {
            read: true,
            write: false,
            type: 'number',
            role: 'value',
            def: 0,
            unit: 'min',
            desc: 'Time to full discharge in minutes',
         });
         await ensureStateAsync(dst_summary + 'battery.timeToFullCharge_h_min', '00:00', {
            read: true,
            write: false,
            type: 'string',
            role: 'text',
            def: '00:00',
            desc: 'Time to full charge in hours and minutes',
         });
         await ensureStateAsync(dst_summary + 'battery.timeToFullDischarge_at', 'N/A', {
            read: true,
            write: false,
            type: 'string',
            role: 'text',
            desc: 'Local time when battery will be empty',
         });
         await ensureStateAsync(dst_summary + 'battery.timeToFullDischarge_ts', 0, {
            read: true,
            write: false,
            type: 'number',
            role: 'value.time',
            desc: 'Unix timestamp when battery will be empty',
         });
      }
   });
}

//---------------------------------------------------------------------------------------------------
// auto identify minSoC for battery based on discharging behavior
//---------------------------------------------------------------------------------------------------
if (existsState(dst_summary + 'storage.total.activePower_total')) {
}

async function getFirstLedStatus() {
   if (existsState(rss_battery + '.0.led_status')) {
      let led_status = getState(rss_battery + '.0.led_status').val;
      if (debug > 1) log(`First battery LED status: ${led_status}`, 'info');
      return led_status;
   }
   return null;
}
