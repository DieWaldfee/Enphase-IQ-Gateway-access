# JS Directory for Enphase-IQ-Gateway-access

This folder contains JavaScript utilities and scripts used for accessing, monitoring, and interacting with the Enphase IQ Gateway. 
The scripts are designed to help users communicate with the gateway's local API, collect system data, and perform useful operations 
related to solar energy monitoring.

## Contents Overview

Below is a summary of notable scripts and their intended functionality:

- **enphase.js**  
  Provides the connetion to your local Enphase IQ Gateway. It fetchs eg. grid, production and consumption data, lifestream data.
  These data are gathered just local and do not need an cloud connection. Just the accesstoken is generated on the enphase website.

- **enphase_cloud.js**  
  Collects status data to all devices each hour und once at midnight the events and alarms. These data are gathered from the cloud. 
  Therfore an cloud account is needed und internet connection is mandetory. For free you are ristricted to 1000 requests each month.
  The implementation limits to 750 requests. Additional requests are implemented, but not used cause of the cost free local data from
  the IG Gateway (script above).
  
=> run both scripts if you have interest on your energy data (enphase.js) and your device status (enphase_clod.js)

## install the scripts

Just download the scripts an add them to your iobroker as javascript.

## configuration

### enphase.js

tbd

### enphase_cloud.js

tbd

