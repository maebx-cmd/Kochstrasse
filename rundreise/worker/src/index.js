// Cloudflare Worker: ÖBB-Fahrplan-API für die Rundreise-App.
// Spricht direkt mit ÖBB-HAFAS (über hafas-client) und liefert dasselbe JSON wie hafas-rest-api.
import {createClient} from 'hafas-client';
import {profile as oebbProfile} from 'hafas-client/p/oebb/index.js';

let hafas = null;
const PRODUCTS = ['nationalExpress', 'national', 'interregional', 'regional', 'suburban', 'bus', 'ferry', 'subway', 'tram', 'onCall'];

const CORS = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'GET, OPTIONS',
	'access-control-allow-headers': 'accept, content-type',
};
const json = (status, body, maxAge = 0) => new Response(JSON.stringify(body), {
	status,
	headers: {...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': maxAge ? `public, max-age=${maxAge}` : 'no-store'},
});
const products = (q) => {
	const p = {};
	for (const id of PRODUCTS) if (q.has(id)) p[id] = q.get(id) === 'true';
	return p;
};
const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const date = (v) => { const d = v ? new Date(v) : new Date(); return isNaN(d) ? new Date() : d; };

// --- Wagenstandsanzeiger: Bahnhofsuche (Name → EVA) und EVA → plc (interne Nummer des ÖBB-Webdisplays) ---
// Beide ÖBB-Quellen erlauben kein CORS, darum läuft das über den Worker.
const OEBB_STATIONS = 'https://live.oebb.at/assets/assets/stations.json';
const OEBB_PLC = 'https://meine.oebb.at/abfahrtankunft/api/evaNrs/';
const UA = {'user-agent': 'Mozilla/5.0 (kochstrasse wagenstand; github.com/maebx-cmd/Kochstrasse)', accept: 'application/json'};
let stationList = null, stationListAt = 0;

const norm = (s) => s.toLowerCase()
	.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
	.normalize('NFD').replace(/[̀-ͯ]/g, '')
	.replace(/\bhauptbahnhof\b/g, 'hbf').replace(/\bst\.?\s*/g, 'sankt ')
	.replace(/[^a-z0-9]+/g, ' ').trim();
const cleanName = (n) => n.replace(/\s+(Bahnhof|Bahnhst|Bahnhst\.|Bahnsteig)$/i, '').trim();

async function stations() {
	if (stationList && Date.now() - stationListAt < 12 * 3600e3) return stationList;
	const r = await fetch(OEBB_STATIONS, {headers: UA, cf: {cacheTtl: 86400, cacheEverything: true}});
	if (!r.ok) throw new Error('ÖBB-Bahnhofsliste nicht erreichbar (HTTP ' + r.status + ')');
	const raw = await r.json();
	stationList = raw.filter((s) => s && s.eva && s.name)
		.map((s) => ({eva: String(s.eva), name: cleanName(s.name), key: norm(cleanName(s.name))}));
	stationListAt = Date.now();
	return stationList;
}

async function searchStations(query, limit) {
	const q = norm(query);
	if (!q) return [];
	const words = q.split(' ');
	const list = await stations();
	const hits = [];
	for (const s of list) {
		if (!words.every((w) => s.key.includes(w))) continue;
		let score = 0;
		if (s.key === q) score += 100;
		if (s.key.startsWith(q)) score += 50;
		if (s.key.split(' ').some((p) => p.startsWith(words[0]))) score += 20;
		if (/\bhbf\b/.test(s.key)) score += 10;
		if (s.eva.startsWith('81')) score += 5; // österreichische Bahnhöfe zuerst
		score -= s.key.length / 100;
		hits.push({score, eva: s.eva, name: s.name});
	}
	hits.sort((a, b) => b.score - a.score);
	return hits.slice(0, limit).map(({eva, name}) => ({eva, name}));
}

async function plcFor(eva) {
	const r = await fetch(OEBB_PLC + encodeURIComponent(eva), {headers: UA});
	if (r.status === 404) return null;
	if (!r.ok) throw new Error('ÖBB-Webdisplay nicht erreichbar (HTTP ' + r.status + ')');
	const j = await r.json();
	return j && j.plc ? {eva: String(eva), plc: String(j.plc), name: j.name || null} : null;
}

async function route(url) {
	const q = url.searchParams;
	const path = url.pathname.replace(/^\/api/, '').replace(/\/+$/, '') || '/';
	let m;
	if (path === '/') return json(200, {ok: true, name: 'oebb-rundreise-worker'});
	if (path === '/wagenstand/stations') {
		const query = q.get('q') || q.get('query') || '';
		if (query.trim().length < 2) return json(400, {msg: 'mindestens 2 Zeichen'});
		return json(200, await searchStations(query, Math.min(int(q.get('results'), 12), 30)), 3600);
	}
	if ((m = path.match(/^\/wagenstand\/plc\/(\d{6,9})$/))) {
		const r = await plcFor(m[1]);
		return r ? json(200, r, 86400) : json(404, {msg: 'Für diesen Bahnhof gibt es kein Webdisplay'});
	}
	if (!hafas) hafas = createClient(oebbProfile, 'rundreise (github.com/maebx-cmd/Kochstrasse)');
	if (path === '/locations') {
		const query = q.get('query');
		if (!query) return json(400, {msg: 'query fehlt'});
		const r = await hafas.locations(query, {results: int(q.get('results'), 8), poi: false, addresses: false, stops: true});
		return json(200, r, 3600);
	}
	if ((m = path.match(/^\/stops\/([^/]+)\/departures$/))) {
		const r = await hafas.departures(decodeURIComponent(m[1]), {
			when: date(q.get('when')), duration: int(q.get('duration'), 30), products: products(q),
			remarks: false, language: 'de',
		});
		return json(200, {departures: r.departures || r}, 60);
	}
	if ((m = path.match(/^\/stops\/([^/]+)\/arrivals$/))) {
		const r = await hafas.arrivals(decodeURIComponent(m[1]), {
			when: date(q.get('when')), duration: int(q.get('duration'), 30), products: products(q),
			remarks: false, language: 'de',
		});
		return json(200, {arrivals: r.arrivals || r}, 60);
	}
	if ((m = path.match(/^\/trips\/(.+)$/))) {
		const r = await hafas.trip(decodeURIComponent(m[1]), {stopovers: true, remarks: false, polyline: false, language: 'de'});
		return json(200, {trip: r.trip || r}, 120);
	}
	if (path === '/journeys') {
		const from = q.get('from'), to = q.get('to');
		if (!from || !to) return json(400, {msg: 'from/to fehlt'});
		const r = await hafas.journeys(from, to, {
			departure: date(q.get('departure')), results: int(q.get('results'), 4),
			...(q.get('via') ? {via: q.get('via')} : {}),
			transferTime: int(q.get('transferTime'), 0), stopovers: q.get('stopovers') === 'true',
			products: products(q), remarks: false, language: 'de',
		});
		return json(200, {journeys: r.journeys || []}, 60);
	}
	return json(404, {msg: 'nicht gefunden'});
}

export default {
	async fetch(request, env, ctx) {
		if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: CORS});
		if (request.method !== 'GET') return json(405, {msg: 'nur GET'});
		const url = new URL(request.url);
		const cache = caches.default;
		const hit = await cache.match(request);
		if (hit) return hit;
		let res;
		try {
			res = await route(url);
		} catch (e) {
			const status = e.isHafasError ? (e.code === 'NOT_FOUND' ? 404 : 502) : 500;
			return json(status, {msg: e.message || String(e), code: e.code || null, hafasCode: e.hafasCode || null});
		}
		if (res.status === 200 && res.headers.get('cache-control') !== 'no-store') ctx.waitUntil(cache.put(request, res.clone()));
		return res;
	},
};
