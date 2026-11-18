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
Die öffentliche Instanz `v6.oebb.transport.rest` ist nicht nutzbar (ungültiges HTTPS-Zertifikat).
Darum läuft die Schnittstelle als eigener **Cloudflare Worker** – Anleitung in `worker/README.md`.
Die Adresse wird einmalig in der App unter **Erweitert → Fahrplan-API** eingetragen.

Alternative: `server/` (Docker, hafas-rest-api) – braucht aber eine öffentliche HTTPS-Adresse.
