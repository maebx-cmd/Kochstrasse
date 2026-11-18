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

async function route(url) {
	if (!hafas) hafas = createClient(oebbProfile, 'rundreise (github.com/maebx-cmd/Kochstrasse)');
	const q = url.searchParams;
	const path = url.pathname.replace(/^\/api/, '').replace(/\/+$/, '') || '/';
	let m;
	if (path === '/') return json(200, {ok: true, name: 'oebb-rundreise-worker'});
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
