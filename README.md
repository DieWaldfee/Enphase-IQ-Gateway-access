# Enphase-IQ-Gateway-access

Accessing IQ Gateway Local APIs with Token-Based Authentication <br>

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

## Legal Notice on API and Server Usage

All rights to the **Enphase API, servers, authentication mechanisms, and data access methods** belong to **Enphase Energy, Inc.**

This project:

* **Does not grant** you any license, ownership, or rights to Enphase’s services, API, or servers.
* **Relies on Enphase’s infrastructure**, which is governed by their official terms of service and license agreements.
* May cease to function at any time if Enphase modifies or restricts API access.

You are required to review and comply with Enphase’s official terms before using this code.
Failure to comply may violate your agreement with Enphase.

---

## Reference

* Community discussion: [https://forum.iobroker.net/topic/66908/enphase-envoy-iq-gateway-solar-blockly-skript/5](https://forum.iobroker.net/topic/66908/enphase-envoy-iq-gateway-solar-blockly-skript/5)
* Original code contributions from: **steffe-s** and **gregoj**

---
