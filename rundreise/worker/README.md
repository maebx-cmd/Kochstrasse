# ÖBB-Fahrplan-API als Cloudflare Worker

Kleine HTTPS-Schnittstelle für die Rundreise-App. Spricht direkt mit ÖBB-HAFAS (über `hafas-client`)
und liefert dasselbe JSON wie `hafas-rest-api`: `/api/locations`, `/api/stops/:id/departures`,
`/api/trips/:id`, `/api/journeys`. Gratis-Plan reicht (100 000 Abfragen/Tag).

## Einrichten (geht komplett am iPhone)
1. dash.cloudflare.com → **Workers & Pages** → **Create** → **Import a repository**
2. GitHub verbinden, Repo **Kochstrasse** wählen
3. **Root directory:** `rundreise/worker`
   **Build command:** `npm run build` · **Deploy command:** `npx wrangler deploy`
4. Deploy → Adresse kopieren, z. B. `https://kochstrasse.DEINNAME.workers.dev`
5. Test im Browser: `…workers.dev/api/locations?query=Imst` muss JSON zeigen
6. In der App unter **Erweitert → Fahrplan-API** eintragen: `https://kochstrasse.DEINNAME.workers.dev/api`

`dist/worker.js` ist bereits gebaut eingecheckt – nach Änderungen an `src/` neu bauen mit `npm install && npm run build`.
