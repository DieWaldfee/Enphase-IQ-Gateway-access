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
//treshold for production to consider inverter active
const production_active_threshold = 10; //in Watts - below this value activePowerMod is zeroed to zero
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
const rss_PDM_p_totalEnergy = rss_local + 'PDM.energy.production.eim.wattHoursToday'; // energy meter data production
const rss_PDM_c_totalEnergy = rss_local + 'PDM.energy.consumption.eim.wattHoursToday'; // energy meter data consumption
// destination path
const dst_sc_stream = dst_summary + 'lifedataState';
const dst_SoC = dst_summary + 'SoC';
const dst_inverter = dst_summary + 'inverters';
let dst_inverter_trigger = ''; //will be set later to summary.inverters.<first inverter>.production
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
 * Retrieves the LED status from the first battery module, if available.
 *
 * Reads the state `<rss_battery>.0.led_status` and returns its current value.
 * Used primarily to detect whether the battery is charging, discharging, or idle.
 * If the state does not exist, the function returns `null`.
 *
 * @async
 * @function getFirstLedStatus
 * @returns {Promise<number|null>} The numeric LED status code of the first battery, or `null` if unavailable.
 *
 * @example
 * const ledStatus = await getFirstLedStatus();
 * if (ledStatus === 13) log('Battery is discharging', 'info');
 *
 * @remarks
 * - Requires the global variable `rss_battery` to be defined.
 * - Produces debug log output when `debug > 1`.
 */
async function getFirstLedStatus() {
   if (existsState(rss_battery + '.0.led_status')) {
      let led_status = getState(rss_battery + '.0.led_status').val;
      if (debug > 1) log(`First battery LED status: ${led_status}`, 'info');
      return led_status;
   }
   return null;
}
/**
 * Monitors the main battery State of Charge (SoC), synchronizes it to a summary state,
 * and dynamically updates the minimum SoC value based on discharging behavior.
 *
 * When the source SoC state (`rss_SoC`) changes, the handler:
 * - Mirrors its value into the summary state (`dst_SoC`).
 * - Checks if the battery is discharging (based on LED status).
 * - Updates or initializes the minimum SoC (`rss_minSoC`) when a new lower SoC is detected.
 *
 * @listens {ioBroker.StateChange} rss_SoC - Triggered when the SoC value changes.
 * @async
 * @callback onSoCChange
 * @param {object} obj - ioBroker object containing the updated state.
 * @param {ioBroker.State} obj.state - The new state information.
 * @param {number} obj.state.val - The updated SoC value (0–100 %).
 *
 * @example
 * // Automatically mirrors and tracks SoC:
 * on({ id: rss_SoC, change: 'any' }, onSoCChange);
 *
 * @remarks
 * - Uses {@link ensureStateAsync} to safely create and update target states.
 * - Automatically initializes `rss_minSoC` with `minSoC_initialValue` if not yet defined.
 * - Relies on {@link getFirstLedStatus} to verify the discharging condition.
 * - Generates detailed debug logs depending on the global `debug` level.
 */
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
         let activePowerMod = 0; // is activePower if above threshold, else zero
         if (id == 'pv') {
            if (activePower < 0) {
               activePowerMod = 0;
            } else {
               if (activePower > production_active_threshold) {
                  activePowerMod = activePower;
               } else {
                  activePowerMod = 0;
               }
            }
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
         if (id == 'pv') {
            ensureStateAsync(
               dst_summary + String(id) + '.total.activePower_total_mod',
               Math.round(activePowerMod * 10) / 10,
               {
                  read: true,
                  write: false,
                  type: 'number',
                  role: 'value',
                  unit: 'W',
                  def: 0,
                  desc: 'Modified Active Power (P) in W',
               }
            );
         }
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
         if (id == 'pv') {
            if (activePower < 0) {
               activePowerMod = 0;
            } else {
               if (activePower > production_active_threshold) {
                  activePowerMod = activePower;
               } else {
                  activePowerMod = 0;
               }
            }
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
         if (id == 'pv') {
            ensureStateAsync(
               dst_summary + String(id) + '.L1.activePower_L1_mod',
               Math.round(activePowerMod * 10) / 10,
               {
                  read: true,
                  write: false,
                  type: 'number',
                  role: 'value',
                  unit: 'W',
                  def: 0,
                  desc: 'Modified Active Power (P) in W',
               }
            );
         }
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
         if (id == 'pv') {
            if (activePower < 0) {
               activePowerMod = 0;
            } else {
               if (activePower > production_active_threshold) {
                  activePowerMod = activePower;
               } else {
                  activePowerMod = 0;
               }
            }
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
         if (id == 'pv') {
            ensureStateAsync(
               dst_summary + String(id) + '.L2.activePower_L2_mod',
               Math.round(activePowerMod * 10) / 10,
               {
                  read: true,
                  write: false,
                  type: 'number',
                  role: 'value',
                  unit: 'W',
                  def: 0,
                  desc: 'Modified Active Power (P) in W',
               }
            );
         }
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
         if (id == 'pv') {
            if (activePower < 0) {
               activePowerMod = 0;
            } else {
               if (activePower > production_active_threshold) {
                  activePowerMod = activePower;
               } else {
                  activePowerMod = 0;
               }
            }
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
         if (id == 'pv') {
            ensureStateAsync(
               dst_summary + String(id) + '.L3.activePower_L3_mod',
               Math.round(activePowerMod * 10) / 10,
               {
                  read: true,
                  write: false,
                  type: 'number',
                  role: 'value',
                  unit: 'W',
                  def: 0,
                  desc: 'Modified Active Power (P) in W',
               }
            );
         }
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
// Calculate battery charging to 100% or down to lowest SoC
//---------------------------------------------------------------------------------------------------
/**
 * Calculates the remaining battery charging time until 100% SoC is reached.
 *
 * Reads the current battery capacity and SoC from ioBroker data points,
 * checks the provided charging power, and calculates the time until the battery is fully charged.
 *
 * @async
 * @function calcBatteryChargeTime
 * @param {number} loadPower - Current charging power in watts (W). Values ≤ 0 are ignored.
 * @returns {Promise<number>} Estimated charging time in hours (h). Returns `0` if calculation is not possible.
 *
 * @example
 * const timeToFull = await calcBatteryChargeTime(2500);
 * log(`Battery will be fully charged in ${timeToFull.toFixed(2)} hours.`);
 *
 * @throws {Error} If an ioBroker state cannot be read (internally caught and logged).
 */
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
/**
 * Calculates the remaining battery discharge time until the minimum SoC (State of Charge) is reached.
 *
 * Reads the current battery capacity, the SoC, and the minimum SoC from ioBroker data points,
 * checks the provided discharge power, and calculates the time until the battery is fully discharged.
 *
 * @async
 * @function calcBatteryDischargeTime
 * @param {number} loadPower - Current discharge power in watts (W). Must be negative; otherwise, it is set to `0`.
 * @returns {Promise<number>} Estimated discharge time in hours (h). Returns `0` if calculation is not possible.
 *
 * @example
 * const timeToEmpty = await calcBatteryDischargeTime(-1800);
 * log(`Battery will be empty in ${timeToEmpty.toFixed(2)} hours.`);
 *
 * @throws {Error} If an ioBroker state cannot be read (internally caught and logged).
 */
async function calcBatteryDischargeTime(loadPower) {
   // set lowest SoC the discharge power is used for calculation
   let lowestSoC;
   if (existsState(rss_minSoC)) {
      lowestSoC = getState(rss_minSoC).val;
   } else {
      lowestSoC = minSoC_initialValue; // default lowest SoC if not defined
   }
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
/**
 * Event handler for recalculating battery charge and discharge times when power changes.
 *
 * Monitors the data point `storage.total.activePower_total` and automatically recalculates
 * the remaining time until the battery is full or empty whenever the charging or discharging
 * power changes. Results are written to the corresponding ioBroker data points under
 * `dst_summary + 'battery.*'`.
 *
 * **Functionality:**
 * - Positive power → Calls {@link calcBatteryChargeTime}
 * - Negative power → Calls {@link calcBatteryDischargeTime}
 * - Power = 0 → All time values are set to 0 or “N/A”
 *
 * @listens {ioBroker.StateChange} dst_summary + 'storage.total.activePower_total'
 * @async
 * @callback onLoadPowerChange
 * @param {object} obj - ioBroker object containing the new state value.
 * @param {ioBroker.State} obj.state - Current state of the monitored data point.
 * @param {number} obj.state.val - Current power value in watts (W). Negative values indicate charging.
 *
 * @example
 * // Automatically triggered when the battery power changes:
 * on({ id: dst_summary + 'storage.total.activePower_total', change: 'any' }, onLoadPowerChange);
 *
 * @remarks
 * - Updates the following states:
 *   - `battery.timeToFullCharge_*`
 *   - `battery.timeToFullDischarge_*`
 * - Uses {@link ensureStateAsync} for safe creation and updating of states.
 * - Outputs debug messages depending on the global `debug` level.
 */
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
         await ensureStateAsync(dst_summary + 'battery.timeToFullDischarge_h_min', '00:00', {
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
         await ensureStateAsync(dst_summary + 'battery.timeToFullDischarge_h_min', fullDischargeTime_h_min, {
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
         await ensureStateAsync(dst_summary + 'battery.timeToFullDischarge_h_min', '00:00', {
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
// max. values (actual and previous day) for total production power
//---------------------------------------------------------------------------------------------------
// identify max production power value
async function maxTotalProductionPower() {
   let maxTotalPower = 0;
   let actualTotalPower = 0;
   if (existsState(rss_livedata + '.meters.pv.agg_p_mw')) {
      actualTotalPower = Math.round(getState(rss_livedata + '.meters.pv.agg_p_mw').val / 1000);
   } else {
      actualTotalPower = 0;
   }
   if (debug > 1) log(`Actual total production power: ${actualTotalPower} W`, 'info');
   let lastTotalPower = 0;
   if (existsState(dst_summary + 'maxValues.power.maxProductionPower')) {
      lastTotalPower = getState(dst_summary + 'maxValues.power.maxProductionPower').val;
   } else {
      lastTotalPower = 0;
   }
   if (debug > 1) log(`Last max total production power: ${lastTotalPower} W`, 'info');
   maxTotalPower = Math.max(actualTotalPower, lastTotalPower);
   if (debug > 1) log(`New max total production power: ${maxTotalPower} W`, 'info');
   await ensureStateAsync(dst_summary + 'maxValues.power.maxProductionPower', maxTotalPower, {
      read: true,
      write: false,
      type: 'number',
      role: 'value',
      def: 0,
      unit: 'W',
      desc: 'Max. total production power in W',
   });
}
// identify max production power on every inverter
async function maxInverterPower() {
   // identify all inverters in dst_inverter
   let inverterIDs = [];
   // Try to get inverter IDs from the summary inverter_list state using getState
   if (existsState(dst_inverter + '.inverter_list')) {
      try {
         const raw = getState(dst_inverter + '.inverter_list').val;
         if (raw) {
            if (Array.isArray(raw)) {
               inverterIDs = raw;
            } else if (typeof raw === 'string') {
               // try JSON first, fallback to comma separated
               try {
                  inverterIDs = JSON.parse(raw);
                  if (!Array.isArray(inverterIDs)) inverterIDs = [String(inverterIDs)];
               } catch {
                  inverterIDs = raw
                     .split(',')
                     .map((s) => s.trim())
                     .filter(Boolean);
               }
            } else {
               inverterIDs = [String(raw)];
            }
         }
      } catch (e) {
         log(`Error reading inverter_list: ${e}`, 'error');
      }
   } else {
      // no inverter_list state available
      inverterIDs = [];
   }
   if (debug > 1) log(`Inverter IDs found: ${JSON.stringify(inverterIDs)}`, 'info');
   // Now you have all inverter IDs in the inverterIDs array
   for (const inverterID of inverterIDs) {
      let maxInverterPower = 0;
      let actualInverterPower = 0;
      if (existsState(dst_summary + 'inverters.' + inverterID + '.production')) {
         actualInverterPower = Math.round(getState(dst_summary + 'inverters.' + inverterID + '.production').val);
      } else {
         actualInverterPower = 0;
      }
      if (debug > 1) log(`Actual inverter production power (${inverterID}): ${actualInverterPower} W`, 'info');
      let lastInverterPower = 0;
      if (existsState(dst_summary + 'maxValues.power.inverters.' + inverterID + '.maxProductionPower')) {
         lastInverterPower = getState(
            dst_summary + 'maxValues.power.inverters.' + inverterID + '.maxProductionPower'
         ).val;
      } else {
         lastInverterPower = 0;
      }
      if (debug > 1) log(`Last max inverter production power (${inverterID}): ${lastInverterPower} W`, 'info');
      maxInverterPower = Math.max(actualInverterPower, lastInverterPower);
      if (debug > 1) log(`New max inverter production power (${inverterID}): ${maxInverterPower} W`, 'info');
      await ensureStateAsync(
         dst_summary + 'maxValues.power.inverters.' + inverterID + '.maxProductionPower',
         maxInverterPower,
         {
            read: true,
            write: false,
            type: 'number',
            role: 'value',
            def: 0,
            unit: 'W',
            desc: 'Max. inverter production power in W',
         }
      );
   }
}
// monitor production power to identify max value
on({ id: rss_livedata + '.meters.pv.agg_p_mw', change: 'any' }, function (obj) {
   //timeout 500ms to ensure all values are updated
   setTimeout(() => {
      maxTotalProductionPower();
   }, 500);
   if (debug > 2) log(`Total production power updated`, 'info');
});
// monitor inverter production power to identify max value
await maxInverterPower(); //initial run
if (existsState(rss_inverter_trigger)) {
   if (debug > 1) log(`Monitoring inverter to identify max production power now`, 'info');
   if (debug > 2) log(`Using event trigger ${rss_inverter_trigger} to refresh inverter max power data`, 'info');
   on({ id: rss_inverter_trigger, change: 'any' }, function (obj) {
      //timeout 500ms to ensure all inverters are updated
      setTimeout(() => {
         maxInverterPower();
      }, 500);
      if (debug > 2) log(`Inverter max production power updated`, 'info');
   });
}
// copy actual day of max total production power to yesterday value at midnight
async function pushTotalMaxProductionYesterday() {
   let yesterdayMaxPower;
   if (existsState(dst_summary + 'maxValues.power.maxProductionPower')) {
      yesterdayMaxPower = getState(dst_summary + 'maxValues.power.maxProductionPower').val;
   } else {
      yesterdayMaxPower = 0;
   }
   if (debug > 1) log(`Max total production power: ${yesterdayMaxPower} W`, 'info');
   await ensureStateAsync(dst_summary + 'maxValues.power.maxProductionPower_yesterday', yesterdayMaxPower, {
      read: true,
      write: false,
      type: 'number',
      role: 'value',
      def: 0,
      unit: 'W',
      desc: 'Max. total production power yesterday in W',
   });
   await ensureStateAsync(dst_summary + 'maxValues.power.maxProductionPower', 0, {
      read: true,
      write: false,
      type: 'number',
      role: 'value',
      def: 0,
      unit: 'W',
      desc: 'Max. total production power in W',
   });
}
// copy actual day of max inverter production power to yesterday value at midnight
async function pushInverterMaxProductionYesterday() {
   // identify all inverters in dst_inverter
   let inverterIDs = [];
   // Try to get inverter IDs from the summary inverter_list state using getState
   if (existsState(dst_inverter + '.inverter_list')) {
      try {
         const raw = getState(dst_inverter + '.inverter_list').val;
         if (raw) {
            if (Array.isArray(raw)) {
               inverterIDs = raw;
            } else if (typeof raw === 'string') {
               // try JSON first, fallback to comma separated
               try {
                  inverterIDs = JSON.parse(raw);
                  if (!Array.isArray(inverterIDs)) inverterIDs = [String(inverterIDs)];
               } catch {
                  inverterIDs = raw
                     .split(',')
                     .map((s) => s.trim())
                     .filter(Boolean);
               }
            } else {
               inverterIDs = [String(raw)];
            }
         }
      } catch (e) {
         log(`Error reading inverter_list: ${e}`, 'error');
      }
   } else {
      // no inverter_list state available
      inverterIDs = [];
   }
   if (debug > 1) log(`Inverter IDs found: ${JSON.stringify(inverterIDs)}`, 'info');
   for (const inverterID of inverterIDs) {
      let yesterdayMaxPower;
      if (existsState(dst_summary + 'maxValues.power.inverters.' + inverterID + '.maxProductionPower')) {
         yesterdayMaxPower = getState(
            dst_summary + 'maxValues.power.inverters.' + inverterID + '.maxProductionPower'
         ).val;
      } else {
         yesterdayMaxPower = 0;
      }
      if (debug > 1) log(`Inverter ${inverterID} - max production power: ${yesterdayMaxPower} W`, 'info');
      await ensureStateAsync(
         dst_summary + 'maxValues.power.inverters.' + inverterID + '.maxProductionPower_yesterday',
         yesterdayMaxPower,
         {
            read: true,
            write: false,
            type: 'number',
            role: 'value',
            def: 0,
            unit: 'W',
            desc: 'Max. inverter production power yesterday in W',
         }
      );
      await ensureStateAsync(dst_summary + 'maxValues.power.inverters.' + inverterID + '.maxProductionPower', 0, {
         read: true,
         write: false,
         type: 'number',
         role: 'value',
         def: 0,
         unit: 'W',
         desc: 'Max. inverter production power in W',
      });
   }
}
// copy actual day of max total production power to yesterday value at midnight
schedule('0 0 * * *', async function () {
   if (debug > 1) log('Midnight reached - store yesterday max production power and reset max production power', 'info');
   await pushTotalMaxProductionYesterday();
   await pushInverterMaxProductionYesterday();
});

//---------------------------------------------------------------------------------------------------
// max. values (actual and previous day, monthly, year) for total and inverters production energy
//---------------------------------------------------------------------------------------------------
async function maxTotalProductionEnergy() {
   let TotalEnergy = 0;
   if (existsState(rss_PDM_p_totalEnergy)) {
      TotalEnergy = getState(rss_PDM_p_totalEnergy).val;
   } else {
      TotalEnergy = 0;
   }
   if (debug > 1) log(`Actual total production energy today: ${TotalEnergy} Wh`, 'info');
   await ensureStateAsync(dst_summary + 'maxValues.energy.ProductionEnergy', TotalEnergy, {
      read: true,
      write: false,
      type: 'number',
      role: 'value',
      def: 0,
      unit: 'Wh',
      desc: 'Actual production energy in Wh',
   });
}
on({ id: rss_PDM_p_totalEnergy, change: 'any' }, function (obj) {
   //timeout 500ms to ensure all values are updated
   setTimeout(() => {
      maxTotalProductionEnergy();
   }, 500);
   if (debug > 2) log(`Total production energy updated`, 'info');
});
// copy actual day of max total production energy to yesterday value short before midnight
schedule('55 23 * * *', async function () {
   if (debug > 1)
      log('Midnight reached - store yesterday max production energy and reset max production energy', 'info');
   let yesterdayTotalEnergy;
   if (existsState(dst_summary + 'maxValues.energy.ProductionEnergy')) {
      yesterdayTotalEnergy = getState(dst_summary + 'maxValues.energy.ProductionEnergy').val;
   } else {
      yesterdayTotalEnergy = 0;
   }
   await ensureStateAsync(dst_summary + 'maxValues.energy.ProductionEnergy_yesterday', yesterdayTotalEnergy, {
      read: true,
      write: false,
      type: 'number',
      role: 'value',
      def: 0,
      unit: 'Wh',
      desc: 'Max. total production energy yesterday in Wh',
   });
   await ensureStateAsync(dst_summary + 'maxValues.energy.ProductionEnergy', 0, {
      read: true,
      write: false,
      type: 'number',
      role: 'value',
      def: 0,
      unit: 'Wh',
      desc: 'Max. total production energy in Wh',
   });
   // monthly max production energy
   let now = new Date();
   let month = now.getMonth() + 1; //months from 1-12
   let storedMonthEnergy = 0;
   if (
      existsState(dst_summary + 'maxValues.energy.month.maxProductionEnergy_month_' + month.toString().padStart(2, '0'))
   ) {
      storedMonthEnergy = getState(
         dst_summary + 'maxValues.energy.month.maxProductionEnergy_month_' + month.toString().padStart(2, '0')
      ).val;
   } else {
      storedMonthEnergy = 0;
   }
   maxMonthTotalEnergy = storedMonthEnergy + yesterdayTotalEnergy;
   await ensureStateAsync(
      dst_summary + 'maxValues.energy.month.maxProductionEnergy_month_' + month.toString().padStart(2, '0'),
      maxMonthTotalEnergy,
      {
         read: true,
         write: false,
         type: 'number',
         role: 'value',
         def: 0,
         unit: 'Wh',
         desc: 'Max. total production energy in Wh for month ' + month.toString().padStart(2, '0'),
      }
   );
   // yearly max production energy
   let storedYearEnergy = 0;
   if (existsState(dst_summary + 'maxValues.energy.year.maxProductionEnergy_year')) {
      storedYearEnergy = getState(dst_summary + 'maxValues.energy.year.maxProductionEnergy_year').val;
   } else {
      storedYearEnergy = 0;
   }
   maxYearTotalEnergy = storedYearEnergy + yesterdayTotalEnergy;
   await ensureStateAsync(dst_summary + 'maxValues.energy.year.maxProductionEnergy_year', maxYearTotalEnergy, {
      read: true,
      write: false,
      type: 'number',
      role: 'value',
      def: 0,
      unit: 'Wh',
      desc: 'Max. total production energy in Wh for year',
   });
});

//---------------------------------------------------------------------------------------------------
// actual self-consumtion and autarky calculation, feedInPower and purchasedPower
//---------------------------------------------------------------------------------------------------
async function calcActualPowerflow() {
   let productionPower = 0; // from lifedata: positive: production power
   let consumptionPower = 0; // from lifedata: positive: consumption power
   let gridPower = 0; // from lifedata: positive: purchased power, negative: feed-in power
   let storagePower = 0; // from lifedata: positive: discharge power, negative: charge power
   let feedInPower = 0;
   let purchasedPower = 0;
   let selfConsumptionPower = 0;
   let gridConsumptionPower = 0;
   let gridChargePower = 0;
   let storageConsumptionPower = 0;
   let storageChargePower = 0;
   let autarky = 0;
   if (existsState(rss_livedata + '.meters.pv.agg_p_mw')) {
      productionPower = getState(rss_livedata + '.meters.pv.agg_p_mw').val / 1000;
   }
   if (productionPower < 0) {
      productionPower = 0;
   }
   if (debug > 1) log(`Production Power: ${productionPower} W`, 'info');
   if (existsState(rss_livedata + '.meters.load.agg_p_mw')) {
      consumptionPower = getState(rss_livedata + '.meters.load.agg_p_mw').val / 1000;
   }
   if (consumptionPower < 0) {
      consumptionPower = 0;
   }
   if (debug > 1) log(`Consumption Power: ${consumptionPower} W`, 'info');
   if (existsState(rss_livedata + '.meters.grid.agg_p_mw')) {
      gridPower = getState(rss_livedata + '.meters.grid.agg_p_mw').val / 1000;
   }
   if (debug > 1) log(`Grid Power: ${gridPower} W`, 'info');
   if (existsState(rss_livedata + '.meters.storage.agg_p_mw')) {
      storagePower = getState(rss_livedata + '.meters.storage.agg_p_mw').val / 1000;
   }
   if (debug > 1) log(`Storage Power: ${storagePower} W`, 'info');
   // calculate feed-in and purchased power
   if (gridPower < 0) {
      feedInPower = Math.abs(gridPower);
      purchasedPower = 0;
   } else {
      feedInPower = 0;
      purchasedPower = gridPower;
   }
   if (debug > 1) log(`Feed-in Power: ${feedInPower} W`, 'info');
   if (debug > 1) log(`Purchased Power: ${purchasedPower} W`, 'info');
   // storgae consumption and charge power
   if (storagePower < 0) {
      storageChargePower = Math.abs(storagePower);
      storageConsumptionPower = 0;
   } else {
      storageChargePower = 0;
      storageConsumptionPower = storagePower;
   }
   if (debug > 1) log(`Storage Consumption Power: ${storageConsumptionPower} W`, 'info');
   if (debug > 1) log(`Storage Charge Power: ${storageChargePower} W`, 'info');
   // calculate self-consumption
   if (feedInPower >= 0) {
      selfConsumptionPower = productionPower - feedInPower;
   } else {
      if (productionPower > 0) {
         selfConsumptionPower = productionPower;
      } else {
         selfConsumptionPower = 0;
      }
   }
   if (debug > 1) log(`Self-Consumption Power: ${selfConsumptionPower} W`, 'info');
   // calculate grid consumption power
   if (consumptionPower == selfConsumptionPower) {
      gridConsumptionPower = 0;
   } else {
      gridConsumptionPower = consumptionPower - selfConsumptionPower - storageConsumptionPower;
      if (gridConsumptionPower < 0) {
         gridConsumptionPower = 0;
      }
   }
   if (debug > 1) log(`Grid Consumption Power: ${gridConsumptionPower} W`, 'info');
   // calculate grid charge power
   if (purchasedPower > gridConsumptionPower) {
      gridChargePower = purchasedPower - gridConsumptionPower;
   } else {
      gridChargePower = 0;
   }
   if (debug > 1) log(`Grid Charge Power: ${gridChargePower} W`, 'info');
   // calculate autarky
   if (consumptionPower == 0) {
      autarky = 100; // no consumption -> autarky 100%; avoid division by zero
   } else {
      autarky = ((selfConsumptionPower + storageConsumptionPower) / consumptionPower) * 100;
   }
   if (debug > 1) log(`Autarky: ${autarky} %`, 'info');
   // write values to states
   await ensureStateAsync(dst_summary + 'powerflow.productionPower', Math.round(productionPower * 10) / 10, {
      read: true,
      write: false,
      type: 'number',
      role: 'value',
      def: 0,
      unit: 'W',
      desc: 'PV Production Power in W',
   });
   await ensureStateAsync(dst_summary + 'powerflow.consumptionPower', Math.round(consumptionPower * 10) / 10, {
      read: true,
      write: false,
      type: 'number',
      role: 'value',
      def: 0,
      unit: 'W',
      desc: 'Consumption Power in W',
   });
   await ensureStateAsync(dst_summary + 'powerflow.gridPower', Math.round(gridPower * 10) / 10, {
      read: true,
      write: false,
      type: 'number',
      role: 'value',
      def: 0,
      unit: 'W',
      desc: 'Grid Power in W',
   });
   await ensureStateAsync(dst_summary + 'powerflow.storagePower', Math.round(storagePower * 10) / 10, {
      read: true,
      write: false,
      type: 'number',
      role: 'value',
      def: 0,
      unit: 'W',
      desc: 'Storage Power in W',
   });
   await ensureStateAsync(dst_summary + 'powerflow.feedInPower', Math.round(feedInPower * 10) / 10, {
      read: true,
      write: false,
      type: 'number',
      role: 'value',
      def: 0,
      unit: 'W',
      desc: 'Feed-in Power in W',
   });
   await ensureStateAsync(dst_summary + 'powerflow.purchasedPower', Math.round(purchasedPower * 10) / 10, {
      read: true,
      write: false,
      type: 'number',
      role: 'value',
      def: 0,
      unit: 'W',
      desc: 'Purchased Power in W',
   });
   await ensureStateAsync(dst_summary + 'powerflow.selfConsumptionPower', Math.round(selfConsumptionPower * 10) / 10, {
      read: true,
      write: false,
      type: 'number',
      role: 'value',
      def: 0,
      unit: 'W',
      desc: 'Self-Consumption Power in W',
   });
   await ensureStateAsync(dst_summary + 'powerflow.gridConsumptionPower', Math.round(gridConsumptionPower * 10) / 10, {
      read: true,
      write: false,
      type: 'number',
      role: 'value',
      def: 0,
      unit: 'W',
      desc: 'Grid Consumption Power in W',
   });
   await ensureStateAsync(dst_summary + 'powerflow.gridChargePower', Math.round(gridChargePower * 10) / 10, {
      read: true,
      write: false,
      type: 'number',
      role: 'value',
      def: 0,
      unit: 'W',
      desc: 'Grid Charge Power in W',
   });
   await ensureStateAsync(
      dst_summary + 'powerflow.storageConsumptionPower',
      Math.round(storageConsumptionPower * 10) / 10,
      {
         read: true,
         write: false,
         type: 'number',
         role: 'value',
         def: 0,
         unit: 'W',
         desc: 'Storage Consumption Power in W',
      }
   );
   await ensureStateAsync(dst_summary + 'powerflow.storageChargePower', Math.round(storageChargePower * 10) / 10, {
      read: true,
      write: false,
      type: 'number',
      role: 'value',
      def: 0,
      unit: 'W',
      desc: 'Storage Charge Power in W',
   });
   await ensureStateAsync(dst_summary + 'powerflow.autarky', Math.round(autarky), {
      read: true,
      write: false,
      type: 'number',
      role: 'value',
      def: 0,
      unit: '%',
      desc: 'Autarky in %',
   });
}
// monitor production power to identify max value
on({ id: rss_livedata + '.meters.grid.agg_p_mw', change: 'any' }, function (obj) {
   //timeout 500ms to ensure all values are updated
   setTimeout(() => {
      calcActualPowerflow();
   }, 500);
   if (debug > 2) log(`Powerflow updated`, 'info');
});

//---------------------------------------------------------------------------------------------------
// Copy yearly data: current year -> previous year
//---------------------------------------------------------------------------------------------------
async function CopyEnergyToLastYear(deleteAfterCopy = false) {
   //copy monthly data
   let month = 0;
   for (month = 1; month <= 12; month++) {
      let storedMonthEnergy = 0;
      if (
         existsState(
            dst_summary + 'maxValues.energy.month.maxProductionEnergy_month_' + month.toString().padStart(2, '0')
         )
      ) {
         storedMonthEnergy = getState(
            dst_summary + 'maxValues.energy.month.maxProductionEnergy_month_' + month.toString().padStart(2, '0')
         ).val;
      } else {
         storedMonthEnergy = 0;
      }
      await ensureStateAsync(
         dst_summary +
            'maxValues.energy.lastYear.month.maxProductionEnergy_month_' +
            month.toString().padStart(2, '0') +
            '_lastYear',
         storedMonthEnergy,
         {
            read: true,
            write: false,
            type: 'number',
            role: 'value',
            def: 0,
            unit: 'Wh',
            desc: 'Maximum production energy for month ' + month + ' last year',
         }
      );
      if (deleteAfterCopy) {
         await ensureStateAsync(
            dst_summary +
               'maxValues.energy.month.maxProductionEnergy_month_' +
               month.toString().padStart(2, '0') +
               '_lastYear',
            0,
            {
               read: true,
               write: false,
               type: 'number',
               role: 'value',
               def: 0,
               unit: 'Wh',
               desc: 'Max. total production energy in Wh for month ' + month.toString().padStart(2, '0'),
            }
         );
      }
   }
   //copy yearly data
   let storedYearEnergy = 0;
   if (existsState(dst_summary + 'maxValues.energy.year.maxProductionEnergy_year')) {
      storedYearEnergy = getState(dst_summary + 'maxValues.energy.year.maxProductionEnergy_year').val;
   } else {
      storedYearEnergy = 0;
   }
   await ensureStateAsync(dst_summary + 'maxValues.energy.lastYear.year.maxProductionEnergy_year', storedYearEnergy, {
      read: true,
      write: false,
      type: 'number',
      role: 'value',
      def: 0,
      unit: 'Wh',
      desc: 'Max. total production energy in Wh for last year',
   });
   if (deleteAfterCopy) {
      await ensureStateAsync(dst_summary + 'maxValues.energy.year.maxProductionEnergy_year', 0, {
         read: true,
         write: false,
         type: 'number',
         role: 'value',
         def: 0,
         unit: 'Wh',
         desc: 'Max. total production energy in Wh for year',
      });
   }
}
// copy actual year to last year at new year
schedule('0 0 1 1 *', async function () {
   if (debug > 1) log('New Year reached - copy yearly energy data to last year', 'info');
   await CopyEnergyToLastYear(true);
});
