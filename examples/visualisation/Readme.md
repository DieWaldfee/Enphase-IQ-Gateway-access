# Integration der Daten in eine Visualisierung

## ioBroker Instanz "energiefluss-erweitert"
Visualisieren des Energieflusses einer Enphase-Anlage 

 <img width="80" height="80" alt="energiefluss-erweitert" src="https://github.com/user-attachments/assets/d57ac070-e409-45bc-b750-84a42491bc12" />

## "energiefluss-erweitert" über ioBroker Adapter installieren

### 1. über die 3 Punkte den Adapter installieren

   <img width="145" height="213" alt="image" src="https://github.com/user-attachments/assets/b77b8fed-56ba-4238-af2d-f2f3daf1b091" />

### 2. Expertenmodus aktivieren
* den weißen Kopf anklicken
* Expertenmodus aktivieren -> "OK"

 <img width="487" height="287" alt="image" src="https://github.com/user-attachments/assets/549f6401-d859-4d6d-9fd9-b6355897115a" />

* weißen Kopf ändert sich in grün
     
 <img width="487" height="58" alt="image" src="https://github.com/user-attachments/assets/8694cc86-4879-4aca-9084-784ee742b04d" />


### 3. Instanz aufrufen
* Instanz von energiefluss_erweiter aufrufen
  
<img width="547" height="75" alt="image" src="https://github.com/user-attachments/assets/65784a49-6510-4c8c-a841-f3490d3d8838" />


* default Grafik editieren oder ( Strg + Alt + E )

<img width="446" height="479" alt="image" src="https://github.com/user-attachments/assets/0a6c45cd-d9bf-4143-8e84-0c5a1f157067" />

* default Grafik speichern und beenden
  
<img width="414" height="471" alt="image" src="https://github.com/user-attachments/assets/d095405b-173c-45a3-a29c-36db446c249e" />


### 4. Daten im Objektebaum einfügen
* Datenpunkt bearbeiten -> alte Daten im Datenpunkt löschen `energiefluss-erweitert.xxx.configuration`

<img width="1204" height="810" alt="image" src="https://github.com/user-attachments/assets/129612b1-875d-4813-9912-814890aaef08" />


* Daten aus der Skriptvorlage einfügen -> Wert Setzen

<img width="770" height="607" alt="image" src="https://github.com/user-attachments/assets/b2deed49-3f7a-408d-80f4-07b0ac4983c3" />

### 5. Energiefluss laden

* Instanz von energiefluss_erweiter aufrufen
 
<img width="547" height="75" alt="image" src="https://github.com/user-attachments/assets/65784a49-6510-4c8c-a841-f3490d3d8838" />

* Energiefluss wird geladen
* Grafik nochmals editieren oder ( Strg + Alt + E )
* Grafik speichern und beenden
  
* Seite aktualisieren (Taste F5)

<img width="508" height="467" alt="Screenshot 2025-11-19 125639" src="https://github.com/user-attachments/assets/01bef4fc-a2da-48c6-952e-c95e1a56bd9e" />

* ggf umstellen auf weißen Hintergrund

<img width="1692" height="995" alt="image" src="https://github.com/user-attachments/assets/d2eec78a-a343-4015-9ee3-1d431f55c5cc" />

<img width="538" height="470" alt="image" src="https://github.com/user-attachments/assets/c8041b7b-1acf-4689-a0ca-31353369869b" />

* Expertenmodus deaktivieren

---

# !!! ANLEITUNG IN ARBEIT !!!

---

## ioBroker Instanz "echarts"
Visualisierung der Bezugs- / Verbrauchsdaten

  <img width="80" height="80" alt="echarts" src="https://github.com/user-attachments/assets/ead2209d-1a32-4752-aa50-24cc802c7731" />

## "echarts" über ioBroker Adapter installieren

### 1. über die 3 Punkte den Adapter installieren
   
   <img width="145" height="213" alt="image" src="https://github.com/user-attachments/assets/005a925a-ecc0-432b-8142-b125b88cec96" />

### 2. Datenpunkte für History-Adapter aktivieren

*
*
*

### 3. Expertenmodus aktivieren
* den weißen Kopf anklicken
* Expertenmodus aktivieren -> "OK"

 <img width="487" height="287" alt="image" src="https://github.com/user-attachments/assets/549f6401-d859-4d6d-9fd9-b6355897115a" />

* weißen Kopf ändert sich in grün
     
 <img width="487" height="58" alt="image" src="https://github.com/user-attachments/assets/8694cc86-4879-4aca-9084-784ee742b04d" />

### 4. Instanz aufrufen
 * Chart neu anlegen `preset 1 wird automatisch angelegt`

<img width="612" height="631" alt="image" src="https://github.com/user-attachments/assets/b247696a-96dc-4dd6-b5b2-27896a59733d" />

### 5. Daten im Objektebaum einfügen
 * Datenpunkt bearbeiten -> alte Daten im Datenpunkt löschen
 * Daten aus der Skriptvorlage einfügen
 * speichern / schreiben 
   
<img width="1514" height="1101" alt="image" src="https://github.com/user-attachments/assets/e5cc78f0-fbd0-4277-963f-bccf4ff83929" />

### 6. eChart aufrufen

 * eChart umbenennen
 
<img width="1461" height="362" alt="image" src="https://github.com/user-attachments/assets/1e70f348-3c83-49a4-bf8b-787976f7bc06" />

 * eChart umbenennen
 * umbenannten Chart anklicken
 * "Optionen" auswählen -> nach unten skrollen
 * web.0 klicken
   
<img width="1759" height="953" alt="image" src="https://github.com/user-attachments/assets/fde633e4-c95b-4a36-91e1-4c50d6d3af31" />

 * Link in ein neues Browerfenster einfügen

<img width="1066" height="633" alt="image" src="https://github.com/user-attachments/assets/d10b0066-d725-44fc-8be4-eead0b971ca3" />










