# Enphase-IQ-Gateway-access

## Quick overview
* Accessing IQ Gateway Local APIs with Token-Based Authentication to gather production, consumtion and life data<br>
* Accessing IQ Enphase cloud data eg. operation status, events and alarms.
* summarize local an cloud data to an consistent view on your enphase system.

### What can you expect?
First: if you want to contol e.g. your dish washer to use your own solar power you are right here. All engines you switch 
on where you have no meanful sense to switch them off at once are fine with the polling frequencies here :-)<br>
This project gives you all the datapoints you need to controll your system! Also if you want to visualize your Enphase system. 
Therefor a really high polling frequency in not needed. So if you don't want to catch the cloud passing the line of flight 
between solar panel and sun you get all you need here.<br>
If you want high frequecy data of your grid-feed-in you should install a separate sensor - thats not that expensive and 
garantees the polling rate in seconds or lower. You can use eg. Shelly Pro 3EM or Shelly 3EM to do that. <br>
When do you need higher frequencies at all? If you want to switch e.g. an heater rod excatly on the edge of your production.<br>

### Polling frequencies
Local and cloud data are gatherd in different frequencies. The local data from livestream are gatherd in 30 seconds. You 
are able to adjust this to nearby 10 seconds - not really faster. To reduce local network load there are two additional 
frequencies for polling data of lower interest (in standard 5 and 15 minutes). Cloud data (using the cost free account 
on enphase) are gatherd hourly - faster is not possible due to the restrictions of the cost free enphase cloud access.

---

## Description

This JavaScript code enables access to the **local Enphase IQ Gateway** and your **Enphase cloud data** and stores all retrieved data in **ioBroker datapoints**.

Key points for the local connection:

* An **internet connection** is required to obtain a **bearer token** from Enphase servers.
* To receive this token, you need an **Enphase Enlighten account** at:
  👉 [https://enlighten.enphaseenergy.com](https://enlighten.enphaseenergy.com)
* Using your credentials, the script will request a bearer token to authenticate access to your **local Envoy IQ Gateway**.
* Once authenticated, the script will:
  * Request all relevant datapoints
  * Store them in ioBroker datapoints
  * Update existing datapoints if present, or create new ones if missing
* A **live link** to the Enphase server is refreshed regularly to maintain up-to-date access and data synchronization.
* polling rate for the lifestream is in standard 30 secondes - lower frequencies for other data ar 5 and 15 minutes (adjustable)

Key points to the cloud connection:
* An **internet connection** is required to obtain the **access and refresh token** from Enphase cloud servers.
* To recieve the needed access, you need to create an account on the **Enphase developer website**: 
   👉 [https://developer-v4.enphase.com](https://developer-v4.enphase.com)
* the credentials are used to authenticate in the OAuth2 process. In the backround the script starts an lightweight webserver
that handles the OAuth2-process. A detailed description you will find here: [Link to JS-folder](https://github.com/DieWaldfee/Enphase-IQ-Gateway-access/blob/developement/JS/README.md)
* once authenticated the script catches the two token and stores them in datapoints. Refresching the access ist automated
* polling rate is one hour

Key points combining these data:
* some data are gathered local and some from the cloud. To build a consistend picture the data are combinded
* in the summary the relevant data to controle something are compressed and meanful combined
* Data in miliWatt are calculated in Watt, status informations are calculated form string to ture/false
* Datapoint are orderd by the serial number to avoid problems in changing data orientation

---

## Change Log

* V0.1.0  redesign in javascript. ressource reference (1) see below
* V0.1.1  enevt handler added to sc_stream -> stay always online
* V2.0.1  split cron events in hing, mid and low frequency. aim to minimize traffic
* V2.0.2  Buxfix in high frequency cron
* V3.0.0  cloud acess integrated and redesign ioBroker datapoints from local gateway
* V3.1.0  actual work: summary and conclusion build from local and cloud data in 'enphase.summary'
* V4.0.0  planed: redesign in typescript parallel to the javascript-version (free to choose js or ts) (2025 Q4)
* V5.0.0  planed: redesign into ioBroker adapter (2026 Q2-Q3)

---

## Installation

You find a detailed installation guide under: https://github.com/DieWaldfee/Enphase-IQ-Gateway-access/tree/developement/JS

---

## ⚠️ Disclaimer / Liability Notice

This project is provided **as-is**, without any guarantees, warranties, or liabilities.
It is a **beta project** and may contain errors, incomplete implementations, or unexpected behavior.

* **Use at your own risk.**
* The authors and contributors are **not responsible for any damage, loss of data, malfunction, or breach of service agreements** caused by using this code.
* Before using this project, you must ensure that your usage complies with **Enphase’s license agreements, API terms, and server access policies** applicable in your region.

By using this project, you acknowledge and agree that:

* You are solely responsible for compliance with Enphase’s **API and service license terms**.
* You will not hold the authors or contributors liable for any direct or indirect damages.

---

## Status of the Project

This project is currently in **beta status**.
Please carefully review your **regional license agreement** with Enphase regarding:

* Access to their servers
* Usage limitations of their API
* Restrictions on local data collection and processing

---

## Legal Notice on API and Server Usage

All rights to the **Enphase API, servers, authentication mechanisms, and data access methods** belong to **Enphase Energy, Inc.**

This project:

* **Does not grant** you any license, ownership, or rights to Enphase’s services, API, or servers.
* **Relies on Enphase’s infrastructure**, which is governed by their official terms of service and license agreements.
* May cease to function at any time if Enphase modifies or restricts API access.

You are required to review and comply with Enphase’s official terms before using this code.
Failure to comply may violate your agreement with Enphase.

---

## API reference

### relevant for enphase_local.js

(1) https://enphase.com/download/iq-gateway-local-apis-or-ui-access-using-token <br>
(2) <a href="https://enphase.com/download/iq-gateway-access-using-local-apis-or-local-ui-token-based-authentication-tech-brief?_gl=1*1j1oh16*_up*MQ..*_ga*MTQwNDI5OTk5MC4xNzU5MzUxOTg4*_ga_YT9FNYJVCP*czE3NTkzNTE5ODckbzEkZzAkdDE3NTkzNTE5ODckajYwJGwwJGgw" target="_blank">https://enphase.com/download/iq-gateway-access-using-local-apis-or-local-ui-token-based-authentication-tech-brief</a><br>

### relevant for enphase_cloud.js

(3) https://developer-v4.enphase.com/docs.html

---

## Reference

* Community discussion: (1) [https://forum.iobroker.net/topic/66908/enphase-envoy-iq-gateway-solar-blockly-skript/5](https://forum.iobroker.net/topic/66908/enphase-envoy-iq-gateway-solar-blockly-skript/5)
* Original code contributions from: **steffe-s** and **greoj**

---
