# Enphase-IQ-Gateway-access

Accessing IQ Gateway Local APIs with Token-Based Authentication <br>

---

## Description

This JavaScript code enables access to the **local Enphase IQ Gateway** and stores all retrieved data in **ioBroker datapoints**.

Key points:

* An **internet connection** is required to obtain a **bearer token** from Enphase servers.
* To receive this token, you need an **Enphase Enlighten account** at:
  👉 [https://enlighten.enphaseenergy.com](https://enlighten.enphaseenergy.com)
* Using your credentials, the script will request a bearer token to authenticate access to your **local Envoy IQ Gateway**.
* Once authenticated, the script will:

  * Request all relevant datapoints
  * Store them in ioBroker datapoints
  * Update existing datapoints if present, or create new ones if missing
* A **live link** to the Enphase server is refreshed regularly to maintain up-to-date access and data synchronization.

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

## Installation

You find a detailed installation guide under: https://github.com/DieWaldfee/Enphase-IQ-Gateway-access/tree/developement/JS

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
