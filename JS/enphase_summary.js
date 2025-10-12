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
const rss_dbSystemIDs = rss_cloud + 'SystemIDs'; // datapoint path to store system IDs found by FetchSystems
let rss_inverter_trigger = ''; //will be set later to inverter.0
// destination path
const dst_sc_stream = dst_summary + 'lifedataState';
const dst_SoC = dst_summary + 'SoC';
const dst_inverter = dst_summary + 'inverters';

//helper
async function ensureStateAsync(id, value, options = { read: true, write: true }) {
   if (!existsState(id)) {
      await createStateAsync(id, value, options);
      if (debug > 1)
         console.log(
            `State ${id} created with initial value: ${JSON.stringify(value)} and options: ${JSON.stringify(options)}`
         );
   } else {
      if (debug > 1) console.log(`State ${id} already exists - updating value`);
      setState(id, value, true);
   }
}

// get SOC state and transfer to summary
if (existsState(rss_SoC)) {
   ensureStateAsync(dst_SoC, getState(rss_SoC), {
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
   if (debug > 1) console.log(`Monitoring SoC state at ${rss_SoC} and updating ${dst_SoC}`);
   on({ id: rss_SoC, change: 'ne' }, function (obj) {
      setState(dst_SoC, obj.state.val, true);
      if (debug > 2) console.log(`SoC updated: ${obj.state.val}%`);
   });
}

//get sc_stream state and transfer to summary
if (existsState(rss_sc_stream)) {
   ensureStateAsync(dst_sc_stream, getState(rss_sc_stream), {
      read: true,
      write: true,
      type: 'boolean',
      role: 'switch',
      def: false,
      desc: 'Status of livedata connection (sc_stream) as switch',
   });
   if (debug > 1) console.log(`Monitoring sc_stream state at ${rss_sc_stream} and updating ${dst_sc_stream}`);
   on({ id: rss_sc_stream, change: 'ne' }, function (obj) {
      if (obj.state.val == 'enabled') {
         setState(dst_sc_stream, true, true);
      } else {
         setState(dst_sc_stream, false, true);
      }
      if (debug > 2) console.log(`sc_stream updated: ${obj.state.val}`);
   });
}

//get inverter production from local and micro inverter state from cloud if available
//read production of all micro inverters and store in array
async function waitForState(id, interval = 500, maxAttempts = 20) {
   let attempts = 0;
   while (!existsState(id) && attempts < maxAttempts) {
      if (debug > 1) console.log(`Waiting until state ${id} is created...`);
      await new Promise((resolve) => setTimeout(resolve, interval));
      attempts++;
   }
   if (!existsState(id)) {
      console.log(`State ${id} was not created after waiting.`);
   }
}
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
               if (debug > 1) console.log(`Inverter trigger set to ${rss_inverter_trigger}`);
            }
            serial = getState(rss_inverter + '.' + i + '.serialNumber').val;
            let lastReportWatts = 0;
            if (existsState(rss_inverter + '.' + i + '.lastReportWatts')) {
               lastReportWatts = getState(rss_inverter + '.' + i + '.lastReportWatts').val;
            } else {
               if (debug > 1)
                  console.log(`Inverter ID ${i} serial number state exists but lastReportWatts state is missing`);
            }
            micro_production.push({ serialNumber: serial, lastReportWatts: lastReportWatts });
            inverter.push(serial);
            if (debug > 2)
               console.log(`Inverter ID ${i} has serial number ${serial}, lastReportWatts: ${lastReportWatts}.`);
         } catch {
            console.log(`Inverter ID ${i} does exist but serial number state is invalid or missing`);
         }
      } else {
         notDoneYet = false;
         if (debug > 1) console.log(`No more inverters found after ID ${i - 1}. Stopping search`);
      }
      i++;
   } while (notDoneYet);
   if (debug > 2) console.log(`Found ${micro_production.length} inverters: ${JSON.stringify(micro_production)}`);
   if (debug > 2) console.log(`List of inverters: ${inverter}`);
   // read state of summary inverter and store it in array
   let status_inverter = [];
   notDoneYet = true;
   let systems = [];
   i = 0;
   try {
      systems = getState(rss_dbSystemIDs).val;
   } catch {
      systems = [];
      if (debug > 0) console.log(`No systems found in ${rss_dbSystemIDs}. Please run FetchSystems first`);
   }
   if (debug > 1) console.log('Systems known from Array: ' + JSON.stringify(systems));
   for (let system in systems) {
      if (debug > 2) console.log('System ID:' + systems[system]);
      if (existsState(rss_cloud + 'Systems.System_' + systems[system] + '.devices.devices.micros.0.status')) {
         if (debug > 1) console.log(`Inverters found for system ${systems[system]}`);
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
                     console.log(`System ${systems[system]} owns inverter ${i} with serial number: ${inv_serial}`);
                  i++;
               } catch {
                  if (debug > 1) console.log(`Error while processing inverter ${i} for system ${systems[system]}`);
                  notDoneYet = false;
               }
               if (i > 40) notDoneYet = false; //safety exit
            } else {
               notDoneYet = false;
               if (debug > 1)
                  console.log(
                     `No more inverters found for system ${systems[system]} after ID ${i - 1}. Stopping search`
                  );
            }
         } while (notDoneYet);
      } else {
         if (debug > 1) console.log(`No inverter found for system ${systems[system]}`);
      }
   }
   if (status_inverter.length == 0) {
      if (debug > 0) console.log(`No inverter status found in any system. Please check cloud data`);
   } else {
      if (debug > 2) console.log(`Inverter status found: ${JSON.stringify(status_inverter)}`);
   }
   //sort arrays by serial number to ensure matching order
   micro_production.sort((a, b) => a.serialNumber.localeCompare(b.serialNumber));
   if (debug > 2) console.log(`micro production after sort: ${JSON.stringify(micro_production)}`);
   inverter.sort((a, b) => a.localeCompare(b));
   if (debug > 2) console.log(`inverter list after sort: ${JSON.stringify(inverter)}`);
   status_inverter.sort((a, b) => a.serialNumber.localeCompare(b.serialNumber));
   if (debug > 2) console.log(`inverter status after sort: ${JSON.stringify(status_inverter)}`);
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
            active: 0,
            id: 'unknown',
            systemID: 'unknown',
         });
      }
   }
   if (debug > 2) console.log(`Summary inverter data: ${JSON.stringify(summary_inverter)}`);
   // write summary inverter data to ioBroker datapoints
   //list of inverters in summary
   ensureStateAsync(dst_inverter + '.inverter_list', JSON.stringify(inverter), {
      read: true,
      write: false,
      type: 'string',
      role: 'value',
      def: '',
      desc: 'List of inverter serial numbers found (may include local and cloud sources, JSON string)',
   });
   //await waitForState(dst_inverter + '.inverter_list');
   //setState(dst_inverter + '.inverter_list', JSON.stringify(inverter), true);

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
      ensureStateAsync(dst_inverter + '.' + inv.serialNumber + '.active', Number(inv.active), {
         read: true,
         write: false,
         type: 'number',
         role: 'value',
         def: 0,
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
         def: false,
         desc: 'Status switch of the inverter (true=normal, false=error)',
      });
   }
}
//monitoring inverter production
await inverterSummary(); //initial run
if (existsState(rss_inverter + '.0.serialNumber')) {
   if (debug > 1) console.log(`Monitoring inverter production at ${rss_inverter} and updating ${dst_inverter}`);
   if (debug > 2) console.log(`Using event trigger ${rss_inverter_trigger}`);
   on({ id: rss_inverter_trigger, change: 'any' }, function (obj) {
      //timeout 500ms to ensure all inverters are updated
      setTimeout(() => {inverterSummary();}, 500);
      if (debug > 2) console.log(`Inverter production updated`);
   });
}
