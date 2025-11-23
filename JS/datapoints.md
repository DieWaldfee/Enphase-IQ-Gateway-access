# Dokumentation of datapoints

Standard datapoint and baseic path is `0_userdata.0.enphase.`

&nbsp;&nbsp;&nbsp;&nbsp; <img width="120" height="135" alt="grafik" src="https://github.com/user-attachments/assets/b9f7ee03-9f1c-4a66-bda0-8c3478a2b073" />

- datapoint `local`: all datapoint of enphase_local.js
- datapoint `cloud`: all datapoints of enphase_cloud.js
- datapoint `config`: configuration datapoint of enphase_local.js and enphase_cloud.js (more details in [Readme.md](https://github.com/DieWaldfee/Enphase-IQ-Gateway-access/blob/developement/JS/README.md))
- datapoints `summary`: all datapoints calculated from the database of enphase_local.js in `local` and enphase_cloud.js in `cloud`.


## Datapoints in enphase_local.js and enphase_cloud.js

The datapoints are descriped in [Readme.md](https://github.com/DieWaldfee/Enphase-IQ-Gateway-access/blob/developement/JS/README.md)

## Datapoint in enphase_summary.js

<img width="875" height="225" alt="grafik" src="https://github.com/user-attachments/assets/d2132ab1-f6d4-493f-a15a-1e15793bb538" />

- datapoint folder `battery`: summary data of installed batteries, if avaiable
- datapoint folder `gateway`: summary data of gateway informations
- datapoint folder `grid`: summary data of grid informations (calculation from mW to W)
- datapoint folder `inverters`: list of inverters and for each inverter the status and production
- datapoint folder `load`: summary data of load informations (calculation from mW to W)
- datapoint folder `maxValues`: max. production values for each inverter an in total of the system. maxPower and maxPower_yesterday in [W]
- datapoint folder `powerflow`: actual values of the power distribution in the system in [W]
- datapoint folder `pv`: summary data of pv production informations (calculation from mW to W)
- datapoint folder `storage`: summary data of storage/barrery informations (calculation from mW to W) in avaiable 
- datapoint folder `sumValues`: summary energy values. production an consumption from gateway meters and selfcalculated from `powerflow`-values and the timestamp (from actual enphase_local.js interval)
- datapoint `SoC`: [%] total SoC of all batteries in your system - if battery stack if avaiable (`.local.lifedata.meters.soc`)
- datapoint `lifedataState`: [true/false] status of the lifedata stream (sc_stream) converted to boolean (true = lifedata is running, false = lifedata is stopped)

### Datapoint .battery

The battery datapoint are only present, if you have enphase batteries in your system.

For each battery in your system:
- datapoint folder `1234567` (batteryID): contains a summary of our single battery. If you have more than one battery you will see for every single battery such a folder.
- datapoint `1234567.active`: [true/false] status of your battery
- datapoint `1234567.capacity`: [Wh] capacity of your single battery
- datapoint `1234567.id`: [1] enphase-ID of your battery - same as the folders name
- datapoint `1234567.led_status`: [1] internal colour code of the system. inicates the operation state of your battery as eg. charging and discharging
- datapoint `1234567.percentFull`: [%] actual SoC of yout single battery (SoC = state of charge)
- datapoint `1234567.serialnumber`: [1] your serial number of the battery
- datapoint `1234567.status`: [true/false] battery operating status: true = normal operation, false = error
- datapoint `1234567.statustext`: [string] battery operation status as a string
- datapoint `1234567.systemID`: [1] enphase-ID of the system the battery is connected to
- datapoint `1234567.temperature`: [°C] battery temperature inside

Now additional folders may follow in the same configuration. the picture below contains tree batteries in on system.

total summary of all batteries in your system:
- datapoint `battery_list`: [json] list of all battery enphase-IDs in your system to be able to iterate over all batteries
- datapoint `timeToFullCharge_at`: [time] calculated time on the clock, when the batteries are fully charged with the actual power (N/A if not charging)
- datapoint `timeToFullCharge_h`: [h] calculated time in hours, when the batteries are fully charged with the actual power
- datapoint `timeToFullCharge_h_min`: [h:min] calculated time in hours and minutes, when the batteries are fully charged with the actual power
- datapoint `timeToFullCharge_min`: [min] calculated time in minutes, when the batteries are fully charged with the actual power
- datapoint `timeToFullCharge_ts`: [timestamp] calculated time on the clock as timestamp, when the batteries are fully charged with the actual power (0 if not charging)
- datapoint `timeToFullDischarge_at`: [time] calculated time on the clock, when the batteries are fully discharged with the actual power (N/A if not discharging)
- datapoint `timeToFullDischarge_h`: [h] calculated time in hours, when the batteries are fully discharged with the actual power
- datapoint `timeToFullDischarge_h_min`: [h:min] calculated time in hours and minutes, when the batteries are fully discharged with the actual power
- datapoint `timeToFullDischarge_min`: [min] calculated time in minutes, when the batteries are fully discharged with the actual power
- datapoint `timeToFullDischarge_ts`: [timestamp] calculated time on the clock as timestamp, when the batteries are fully discharged with the actual power (0 if not discharging)
- datapoint `totalCapacity`: [Wh] summary of the battery capacities in your system

<img width="865" height="520" alt="grafik" src="https://github.com/user-attachments/assets/c6ca790c-1d1f-4968-b29e-99200672454a" />

### Datapoint .gateway

- datapoint folder `2345678` (gatewayID): contains a summary of our gateway. If you have more than one gateway you will see for every single gateway such a folder. Normaly you have only one gateway.
- datapoint `2345678.active`: [true/false] status of your gateway
- datapoint `2345678.id`: [1] enphase-ID of your gateway - same as the folders name
- datapoint `2345678.serialnumber`: [1] your serial number of the gateway
- datapoint `2345678.status`: [true/false] gateway operating status: true = normal operation, false = error
- datapoint `2345678.statustext`: [string] gateway operation status as a string
- datapoint `2345678.systemID`: [1] enphase-ID of the system the gateway is connected to

<img width="915" height="120" alt="grafik" src="https://github.com/user-attachments/assets/26fb4528-42c4-48cd-a5d2-102f18bd46c5" />




