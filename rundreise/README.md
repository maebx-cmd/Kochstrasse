# Rundreise

Sucht Rundreisen mit Bahn (und optional Bus/IVB), wenn du ein paar Stunden totschlagen musst:
Start, Ziel und späteste Ankunft angeben – die App erkundet alle Richtungen und zeigt Verbindungen,
die rechtzeitig am Ziel ankommen.

**URL:** https://maebx-cmd.github.io/Kochstrasse/rundreise/

## Funktionen
- Gültigkeit: **VVT** (nur Tirol, Umstiege nur in Tirol), **Klimaticket Ö** (ganz Österreich) oder ohne Grenze
- **Nur Fernzüge** (RJ/RJX, ICE, EC/IC, D, EN/NJ) oder frei kombinierbar mit Regionalzug/S-Bahn, Bus, Tram
- **Kälte-Modus**: kurze max. Wartezeit überall, längere nur an Bahnhöfen mit Warteraum (Liste editierbar)
- Sortierung: meiste Fahrt, wenig Warten, Ankunft knapp vor Limit, wenig Umstiege, weiteste Strecke
- Einstellungen bleiben im Browser gespeichert

## So sucht sie
1. Abfahrten am aktuellen Halt holen (Zeitfenster = erlaubte Wartezeit)
2. Für jeden Zug den Laufweg laden; jeder spätere Halt ist ein möglicher Umstieg
3. Die vielversprechendsten Halte behalten (Knotenbahnhöfe, Fernverkehrshalte, Zeitplan passend)
4. Von dort per Verbindungsabfrage den Rückweg zum Ziel prüfen (Wartezeit-, Gebiets- und Zeitlimit)
5. Wiederholen bis zur Suchtiefe („automatisch“ = abhängig von der verfügbaren Zeit)

Das Gebiet wird über die Lage der Ein-/Umsteigehalte bestimmt (Durchfahrten, z. B. Deutsches Eck, zählen nicht).
Keine echte Tarifauskunft.

## Fahrplan-API
Standard ist die öffentliche Community-Instanz `https://v6.oebb.transport.rest/api` (ÖBB-HAFAS).
Fällt sie aus oder ist sie zu langsam, kannst du in `server/` eine eigene am Raspberry Pi starten:

```sh
cd server
docker build -t oebb-rest .
docker run -d --restart unless-stopped -p 3000:3000 --name oebb-rest oebb-rest
```

Dann in der App unter **Erweitert → Fahrplan-API** z. B. `https://dein-pi.example/api` eintragen.
Wichtig: GitHub Pages läuft über HTTPS, die API muss also auch über **HTTPS** erreichbar sein
(z. B. über deinen bestehenden Reverse-Proxy oder einen Cloudflare-Tunnel).
