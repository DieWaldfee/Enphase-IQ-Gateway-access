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

&nbsp;&nbsp;&nbsp;&nbsp; <img width="875" height="225" alt="grafik" src="https://github.com/user-attachments/assets/d2132ab1-f6d4-493f-a15a-1e15793bb538" />

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

&nbsp;&nbsp;&nbsp;&nbsp; <img width="865" height="520" alt="grafik" src="https://github.com/user-attachments/assets/c6ca790c-1d1f-4968-b29e-99200672454a" />

### Datapoint .gateway

- datapoint folder `2345678` (gatewayID): contains a summary of our gateway. If you have more than one gateway you will see for every single gateway such a folder. Normaly you have only one gateway.
- datapoint `2345678.active`: [true/false] status of your gateway
- datapoint `2345678.id`: [1] enphase-ID of your gateway - same as the folders name
- datapoint `2345678.serialnumber`: [1] your serial number of the gateway
- datapoint `2345678.status`: [true/false] gateway operating status: true = normal operation, false = error
- datapoint `2345678.statustext`: [string] gateway operation status as a string
- datapoint `2345678.systemID`: [1] enphase-ID of the system the gateway is connected to

&nbsp;&nbsp;&nbsp;&nbsp; <img width="915" height="120" alt="grafik" src="https://github.com/user-attachments/assets/26fb4528-42c4-48cd-a5d2-102f18bd46c5" />

### Datapoint .grid

`.grid` represents the consumption or feedIn from / into the grid your are connected to.

- datapoint folder `L1`: contains power values for the first phase of the grid your are connetcted to.
- datapoint `L1.activePower_L1`: [W] active power flowing from/to the grid over first phase. (+ = consumption, - = feedIn)
- datapoint `L1.apparentPower_L1`: [VA] apparent power flowing from/to the grid over first phase. (+ = consumption, - = feedIn)
- datapoint `L1.reactivePower_L1`: [VAR] reactive power flowing from/to the grid over first phase. (+ = consumption, - = feedIn)
- datapoint folder `L2`: contains power values for the second phase of the grid your are connetcted to.
- datapoint `L2.activePower_L2`: [W] active power flowing from/to the grid over second phase. (+ = consumption, - = feedIn)
- datapoint `L2.apparentPower_L2`: [VA] apparent power flowing from/to the grid over second phase. (+ = consumption, - = feedIn)
- datapoint `L2.reactivePower_L2`: [VAR] reactive power flowing from/to the grid over second phase. (+ = consumption, - = feedIn)
- datapoint folder `L3`: contains power values for the third phase of the grid your are connetcted to.
- datapoint `L3.activePower_L3`: [W] active power flowing from/to the grid over third phase. (+ = consumption, - = feedIn)
- datapoint `L3.apparentPower_L3`: [VA] apparent power flowing from/to the grid over third phase. (+ = consumption, - = feedIn)
- datapoint `L3.reactivePower_L3`: [VAR] reactive power flowing from/to the grid over third phase. (+ = consumption, - = feedIn)
- datapoint folder `total`: contains power values for the all phases in total of the grid your are connetcted to.
- datapoint `total.activePower_total`: [W] active power flowing from/to the grid over all phases. (+ = consumption, - = feedIn)
- datapoint `total.apparentPower_total`: [VA] apparent power flowing from/to the grid over all phases. (+ = consumption, - = feedIn)
- datapoint `total.reactivePower_total`: [VAR] reactive power flowing from/to the grid over all phases. (+ = consumption, - = feedIn)

&nbsp;&nbsp;&nbsp;&nbsp; <img width="870" height="328" alt="grafik" src="https://github.com/user-attachments/assets/d22e290f-0666-459b-bb8b-cf4d98f84e11" />

### Datapoint .histValues

### Datapoint .inverters

Each inverter has his own folder named by his enphase-ID. In total you get the list of all your inverters to iterate over them, if needed.

For each inverter in your system:
- datapoint folder `3456789` (inverterID): contains a summary of our inverter.
- datapoint `3456789.active`: [true/false] status of your inverter
- datapoint `3456789.id`: [1] enphase-ID of your inverter - same as the folders name
- datapoint `3456789.production`: [W] actual production of your single inverter
- datapoint `3456789.serialnumber`: [1] your serial number of the inverter
- datapoint `3456789.status`: [true/false] inverter operating status: true = normal operation, false = error
- datapoint `3456789.statustext`: [string] inverter operation status as a string
- datapoint `3456789.systemID`: [1] enphase-ID of the system the inverter is connected to

For all interters in your system:
- datapoint `inverter_list`: [json] list of all inverter enphase-IDs in your system to be able to iterate over all inverters

&nbsp;&nbsp;&nbsp;&nbsp; <img width="800" height="222" alt="grafik" src="https://github.com/user-attachments/assets/4a9d9f29-3707-4b2d-8edd-aba3c9b79028" />
&nbsp;&nbsp;&nbsp;&nbsp; <img width="850" height="75" alt="grafik" src="https://github.com/user-attachments/assets/668e698f-01e2-49ac-bfa0-26470e2231a6" />

### Datapoint .load

`.load` represents the consumption in your home.

- datapoint folder `L1`: contains power values for the first phase of the consumption.
- datapoint `L1.activePower_L1`: [W] active power consumption over first phase.
- datapoint `L1.apparentPower_L1`: [VA] apparent power consumption over first phase. 
- datapoint `L1.reactivePower_L1`: [VAR] reactive power consumption over first phase.
- datapoint folder `L2`: contains power values for the second phase of the consumption.
- datapoint `L2.activePower_L2`: [W] active power consumption over second phase.
- datapoint `L2.apparentPower_L2`: [VA] apparent power consumption over second phase.
- datapoint `L2.reactivePower_L2`: [VAR] reactive power consumption over second phase.
- datapoint folder `L3`: contains power values for the third phase of the consumption.
- datapoint `L3.activePower_L3`: [W] active power consumption over third phase.
- datapoint `L3.apparentPower_L3`: [VA] apparent power consumption over third phase. 
- datapoint `L3.reactivePower_L3`: [VAR] reactive power consumption over third phase. 
- datapoint folder `total`: contains power values for the all phases in total of the consumption.
- datapoint `total.activePower_total`: [W] active power consumption over all phases.
- datapoint `total.apparentPower_total`: [VA] apparent power consumption over all phases.
- datapoint `total.reactivePower_total`: [VAR] reactive power consumption over all phases. 

&nbsp;&nbsp;&nbsp;&nbsp; <img width="890" height="333" alt="grafik" src="https://github.com/user-attachments/assets/cfbf3a2c-8889-49c3-97e8-26e6f5ec5e3e" />







