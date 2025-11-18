# Dokumentation of datapoints

Standard datapoint and baseic path is `0_userdata.0.enphase.`

&nbsp;&nbsp;&nbsp;&nbsp; <img width="120" height="135" alt="grafik" src="https://github.com/user-attachments/assets/b9f7ee03-9f1c-4a66-bda0-8c3478a2b073" />

- datapoint `local`: all datapoint of enphase_local.js
- datapoint `cloud`: all datapoints of enphase_cloud.js
- datapoint `config`: configuration datapoint of enphase_local.js and enphase_cloud.js (more details in [Readme.md](https://github.com/DieWaldfee/Enphase-IQ-Gateway-access/blob/developement/JS/README.md))
- datapoints `summary`: all datapoints calculated from the database of enphase_local.js in `local` and enphase_cloud.js in `cloud`.


## Datapoints in enphase_local.js and enphase_cloud.js

The datapoints are descriped in [Readme.md](https://github.com/DieWaldfee/Enphase-IQ-Gateway-access/blob/developement/JS/README.md)

## Datapoint do enphase_summary.js

<img width="875" height="225" alt="grafik" src="https://github.com/user-attachments/assets/d2132ab1-f6d4-493f-a15a-1e15793bb538" />

- datapoint `battery`: summary data of installed batteries, if avaiable
- datapoint `gateway`: summary data of gateway informations
- datapoint `grid`: summary data of grid informations (calculation from mW to W)
- datapoint `inverters`: list of inverters and for each inverter the status and production
- datapoint `load`: summary data of load informations (calculation from mW to W)
- datapoint `maxValues`: max. production values for each inverter an in total of the system. maxPower and maxPower_yesterday in [W]
- datapoint `powerflow`: actual values of the power distribution in the system in [W]
- datapoint `pv`: summary data of pv production informations (calculation from mW to W)
- datapoint `storage`: summary data of storage/barrery informations (calculation from mW to W) in avaiable 
- datapoint `sumValues`: summary energy values. production an consumption from gateway meters and selfcalculated from `powerflow`-values and the timestamp (from actual enphase_local.js interval)
- datapoint `SoC`: [1]% SoC if battery stack if avaiable (`.local.lifedata.meters.soc`)
- datapoint `lifedataState`: [true/false] status of the lifedata stream (sc_stream) converted to boolean

  
