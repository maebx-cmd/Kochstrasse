/* Rundreise-Suche – Engine
 * Datenquelle: ÖBB-HAFAS über eine hafas-rest-api-Instanz (z. B. v6.oebb.transport.rest
 * oder selbst gehostet). Läuft im Browser und in Node (für Tests).
 */
(function (root) {
  'use strict';

  // ---------- Geografie ----------
  // [Längengrad, Breitengrad] – grobe Umrisse, Bahnhöfe werden zusätzlich über die UIC-Länderkennung erkannt.
  const TIROL_NORD = [[10.19,47.12],[10.22,47.27],[10.30,47.30],[10.43,47.48],[10.62,47.57],[10.75,47.55],
    [10.88,47.47],[10.98,47.42],[11.10,47.39],[11.25,47.40],[11.40,47.45],[11.63,47.59],[11.85,47.58],
    [12.17,47.60],[12.22,47.70],[12.33,47.70],[12.43,47.67],[12.58,47.63],[12.66,47.60],[12.68,47.45],
    [12.42,47.31],[12.10,47.24],[12.15,47.08],[11.75,46.97],[11.50,47.01],[11.10,46.93],[10.98,46.77],
    [10.75,46.80],[10.47,46.84],[10.38,46.99],[10.10,46.86],[10.12,47.00],[10.17,47.10]];
  const TIROL_OST = [[12.37,46.71],[12.18,46.88],[12.15,47.02],[12.25,47.08],[12.55,47.12],[12.75,47.10],
    [12.85,46.98],[12.94,46.80],[12.90,46.70],[12.70,46.64],[12.45,46.67]];
  const OESTERREICH = [[9.56,47.05],[9.53,47.27],[9.65,47.45],[9.70,47.53],[9.97,47.54],[10.20,47.30],
    [10.30,47.30],[10.43,47.48],[10.62,47.57],[10.75,47.55],[10.88,47.47],[10.98,47.42],[11.25,47.40],
    [11.40,47.45],[11.63,47.59],[12.17,47.60],[12.22,47.70],[12.43,47.67],[12.58,47.63],[12.78,47.58],
    [12.95,47.47],[13.08,47.48],[13.05,47.72],[13.02,47.80],[12.93,47.96],[12.85,48.05],[12.93,48.20],
    [13.03,48.26],[13.25,48.30],[13.44,48.50],[13.50,48.58],[13.73,48.52],[13.82,48.77],[14.05,48.66],
    [14.70,48.60],[14.96,48.78],[15.00,49.00],[15.60,48.88],[16.10,48.75],[16.55,48.79],[16.95,48.62],
    [16.88,48.30],[17.07,48.10],[17.10,47.97],[17.05,47.72],[16.85,47.68],[16.65,47.62],[16.45,47.65],
    [16.62,47.45],[16.45,47.00],[16.10,46.86],[15.98,46.68],[15.65,46.71],[14.90,46.60],[14.55,46.42],
    [13.71,46.52],[13.50,46.56],[12.70,46.64],[12.40,46.68],[12.37,46.71],[12.18,46.88],[12.15,47.08],
    [11.75,46.97],[11.50,47.01],[11.10,46.93],[10.98,46.77],[10.47,46.84],[10.38,46.99],[10.10,46.86],
    [9.88,46.92],[9.60,47.05]];

  function inPoly(lon, lat, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function loc(stop) {
    if (!stop) return null;
    const l = stop.location || (stop.station && stop.station.location) || stop;
    if (l && typeof l.latitude === 'number' && typeof l.longitude === 'number') return l;
    return null;
  }
  function km(a, b) {
    const la = loc(a), lb = loc(b);
    if (!la || !lb) return 0;
    const R = 6371, r = Math.PI / 180;
    const dLat = (lb.latitude - la.latitude) * r, dLon = (lb.longitude - la.longitude) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la.latitude * r) * Math.cos(lb.latitude * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function stopId(s) { return s ? String(s.id || (s.station && s.station.id) || '') : ''; }
  function isUic(id) { return /^8\d{6}$/.test(id); }
  function sameStop(a, b) {
    if (!a || !b) return false;
    const ia = stopId(a), ib = stopId(b);
    if (ia && ia === ib) return true;
    if (a.station && b.station && a.station.id && a.station.id === b.station.id) return true;
    if (loc(a) && loc(b)) return km(a, b) < 0.4;
    // ohne Koordinaten: über den Namen ("Imst-Pitztal" = "Imst-Pitztal Bahnhof")
    const na = norm(a.name || (a.station && a.station.name)), nb = norm(b.name || (b.station && b.station.name));
    if (!na || !nb) return false;
    return na === nb || na.startsWith(nb + ' ') || nb.startsWith(na + ' ');
  }

  function regionCheck(mode, extraNames) {
    const extra = (extraNames || []).map(norm).filter(Boolean);
    return function allowed(stop) {
      if (mode === 'all') return true;
      if (extra.length && extra.some(e => norm(stop.name).includes(e))) return true;
      const id = stopId(stop);
      const l = loc(stop);
      let at;
      if (isUic(id)) at = id.startsWith('81');
      else at = l ? inPoly(l.longitude, l.latitude, OESTERREICH) : true;
      if (!at) return false;
      if (mode === 'at') return true;
      if (!l) return true; // ohne Koordinaten nicht ausschließen
      return inPoly(l.longitude, l.latitude, TIROL_NORD) || inPoly(l.longitude, l.latitude, TIROL_OST);
    };
  }

  // ---------- API ----------
  const PRODUCT_IDS = ['nationalExpress', 'national', 'interregional', 'regional', 'suburban', 'bus', 'ferry', 'subway', 'tram', 'onCall'];
  const FERN = new Set(['nationalExpress', 'national', 'interregional']);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  class Api {
    constructor(base, opt = {}) {
      this.base = String(base || '').replace(/\/+$/, '');
      this.rpm = opt.rpm || 100;
      this.conc = opt.conc || 4;
      this.calls = 0;
      this.active = 0;
      this.queue = [];
      this.lastStart = 0;
      this.cache = new Map();
      this.fetch = opt.fetch || ((u, o) => fetch(u, o));
      this.signal = null;
    }
    _slot() {
      return new Promise(res => { this.queue.push(res); this._pump(); });
    }
    _pump() {
      if (this.active >= this.conc || !this.queue.length || this._timer) return;
      const gap = 60000 / this.rpm;
      const wait = Math.max(0, this.lastStart + gap - Date.now());
      if (wait > 0) { this._timer = setTimeout(() => { this._timer = null; this._pump(); }, wait); return; }
      this.active++;
      this.lastStart = Date.now();
      this.queue.shift()();
      this._pump();
    }
    _done() { this.active--; this._pump(); }

    async get(path, params, cacheKey) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null) qs.set(k, String(v));
      const url = this.base + path + (qs.toString() ? '?' + qs : '');
      const key = cacheKey || url;
      if (this.cache.has(key)) return this.cache.get(key);
      const p = this._request(url);
      this.cache.set(key, p);
      p.catch(() => this.cache.delete(key));
      return p;
    }
    async _request(url) {
      for (let attempt = 0; attempt < 4; attempt++) {
        if (this.signal && this.signal.aborted) throw new Error('abgebrochen');
        await this._slot();
        let res;
        try {
          this.calls++;
          res = await this.fetch(url, { signal: this.signal || undefined, headers: { accept: 'application/json' } });
        } catch (e) {
          this._done();
          if (this.signal && this.signal.aborted) throw new Error('abgebrochen');
          if (attempt >= 2) throw new Error('Netzwerkfehler: ' + e.message);
          await sleep(1500 * (attempt + 1));
          continue;
        }
        this._done();
        if (res.status === 429 || res.status >= 500) {
          if (attempt >= 3) throw new Error('API-Fehler ' + res.status);
          await sleep(res.status === 429 ? 5000 * (attempt + 1) : 1500 * (attempt + 1));
          continue;
        }
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          const err = new Error('API-Fehler ' + res.status + (t ? ': ' + t.slice(0, 160) : ''));
          err.status = res.status;
          throw err;
        }
        return res.json();
      }
    }
    productParams(products) {
      const o = {};
      for (const id of PRODUCT_IDS) o[id] = !!(products && products[id]);
      return o;
    }
    locations(query) {
      return this.get('/locations', { query, results: 8, poi: false, addresses: false, stops: true });
    }
    async departures(id, whenMs, duration, products) {
      const r = await this.get('/stops/' + encodeURIComponent(id) + '/departures', Object.assign({
        when: new Date(whenMs).toISOString(), duration: Math.max(1, Math.round(duration)),
        remarks: false, language: 'de', pretty: false
      }, this.productParams(products)));
      return Array.isArray(r) ? r : (r.departures || []);
    }
    async trip(tripId) {
      const r = await this.get('/trips/' + encodeURIComponent(tripId), {
        stopovers: true, remarks: false, polyline: false, language: 'de', pretty: false
      }, 'trip:' + tripId);
      return r.trip || r;
    }
    async journeys(fromId, toId, whenMs, products, transferTime) {
      const r = await this.get('/journeys', Object.assign({
        from: fromId, to: toId, departure: new Date(whenMs).toISOString(), results: 4,
        stopovers: false, transferTime: transferTime || 0, remarks: false, language: 'de', pretty: false
      }, this.productParams(products)));
      return r.journeys || [];
    }
  }

  // ---------- Hilfen ----------
  const ms = v => (v ? Date.parse(v) : NaN);
  const depTime = o => { const t = ms(o.when || o.departure); return isNaN(t) ? ms(o.plannedWhen || o.plannedDeparture) : t; };
  const arrTime = o => { const t = ms(o.arrival); return isNaN(t) ? ms(o.plannedArrival) : t; };
  const plat = (a, b) => a || b || '';

  function lineInfo(line) {
    line = line || {};
    return { name: line.name || line.fahrtNr || '?', product: line.product || '', productName: line.productName || '', mode: line.mode || '' };
  }
  function slimStop(s) {
    if (!s) return null;
    const l = loc(s);
    return { id: stopId(s), name: s.name || (s.station && s.station.name) || '?', location: l ? { latitude: l.latitude, longitude: l.longitude } : null };
  }

  function summarize(legs, ctx) {
    let ride = 0, wait = 0, maxWait = 0, kmSum = 0, coldWaits = 0;
    const waits = [];
    for (let i = 0; i < legs.length; i++) {
      const L = legs[i];
      ride += L.arr - L.dep;
      kmSum += L.km || km(L.from, L.to) * 1.2;
      if (i > 0) {
        const w = Math.max(0, L.dep - legs[i - 1].arr);
        const warm = ctx.isWarm(legs[i - 1].to);
        waits.push({ min: Math.round(w / 60000), warm });
        wait += w; if (w > maxWait) maxWait = w;
        if (!warm && w > 10 * 60000) coldWaits++;
      }
    }
    const via = legs.slice(0, -1).map(L => L.to.name);
    return {
      dep: legs[0].dep, arr: legs[legs.length - 1].arr,
      rideMin: Math.round(ride / 60000), waitMin: Math.round(wait / 60000), maxWaitMin: Math.round(maxWait / 60000),
      transfers: legs.length - 1, km: Math.round(kmSum), via, waits, coldWaits
    };
  }

  // ---------- Suche ----------
  async function search(api, o) {
    const allowed = regionCheck(o.region, o.extraAllowed);
    const warmNames = (o.warmStations || []).map(norm).filter(Boolean);
    const isWarm = s => { const n = norm(s && s.name); return warmNames.some(w => n === w || n.startsWith(w + ' ') || n.includes(w)); };
    const minT = (o.minTransfer || 0) * 60000;
    const limitAt = s => (o.coldMode ? (isWarm(s) ? o.warmMaxWait : o.maxWait) : o.maxWaitWarm || 60) * 60000;
    const deadline = o.deadline;
    const to = o.to;
    const speedKmh = 150;
    const lowerBound = s => (km(s, to) / speedKmh) * 3600000;
    const ctx = { isWarm };

    const results = new Map();
    const stat = { deps: 0, trips: 0, region: 0, late: 0 };
    const hubLines = new Map(); // stopId -> Set(Linien)
    const fernStops = new Set();
    let stopped = null;
    const prog = (extra) => o.onProgress && o.onProgress(Object.assign({ calls: api.calls, results: results.size }, extra));

    const budgetLeft = () => api.calls < (o.maxCalls || 250);

    function addResult(legs) {
      if (!legs.length) return;
      const last = legs[legs.length - 1];
      if (last.arr > deadline) return;
      const key = norm(legs[0].from.name) + '>' + legs.map(L => norm(L.to.name)).join('>');
      const s = summarize(legs, ctx);
      const r = { key, legs, ...s };
      const prev = results.get(key);
      if (prev && prev.waitMin <= r.waitMin) return;
      results.set(key, r);
      o.onResult && o.onResult(r, results.size);
    }

    function noteTrip(trip) {
      const L = lineInfo(trip.line);
      const tag = L.name + '>' + norm(trip.direction);
      for (const so of trip.stopovers || []) {
        const id = stopId(so.stop);
        if (!id) continue;
        if (!hubLines.has(id)) hubLines.set(id, new Set());
        hubLines.get(id).add(tag);
        if (FERN.has(L.product)) fernStops.add(id);
      }
    }

    async function expand(st) {
      const out = [];
      if (!budgetLeft()) { stopped = stopped || 'Abfrage-Limit erreicht'; return out; }
      const first = st.legs.length === 0;
      const when = st.t + (first ? 0 : minT);
      const window = first ? (o.startWindow || 60) * 60000 : limitAt(st.stop) - minT;
      if (window <= 0) return out;
      const lastTrip = first ? null : st.legs[st.legs.length - 1].tripId;
      let deps;
      try { deps = await api.departures(st.stop.id, when, window / 60000, o.products); }
      catch (e) { if (e.message === 'abgebrochen') throw e; o.onWarn && o.onWarn('Abfahrten ' + st.stop.name + ': ' + e.message); return out; }

      const seen = new Set();
      const cand = [];
      for (const d of deps) {
        if (d.cancelled || !d.tripId || d.tripId === lastTrip) continue;
        const t = depTime(d);
        if (isNaN(t) || t < when || t > when + window || t > deadline) continue;
        const L = lineInfo(d.line);
        if (o.products && L.product && o.products[L.product] === false) continue;
        const k = L.name + '>' + norm(d.direction);
        if (seen.has(k)) continue;
        seen.add(k);
        cand.push({ d, t, L });
      }
      // Fernverkehr bevorzugen, dann früheste
      cand.sort((a, b) => (FERN.has(b.L.product) - FERN.has(a.L.product)) || a.t - b.t);
      const take = cand.slice(0, o.depsPerState || 8);
      stat.deps += deps.length;

      await Promise.all(take.map(async ({ d, t, L }) => {
        if (!budgetLeft() && !api.cache.has('trip:' + d.tripId)) { stopped = stopped || 'Abfrage-Limit erreicht'; return; }
        let trip;
        try { trip = await api.trip(d.tripId); }
        catch (e) { if (e.message === 'abgebrochen') throw e; return; }
        const sos = trip.stopovers || [];
        stat.trips++;
        noteTrip(trip);
        const near = so => Math.abs(depTime(so) - t) < 3 * 60000;
        let bi = sos.findIndex(so => (sameStop(so.stop, d.stop) || sameStop(so.stop, st.stop)) && near(so));
        if (bi < 0) bi = sos.findIndex(so => sameStop(so.stop, d.stop) || sameStop(so.stop, st.stop));
        if (bi < 0) { const hits = sos.filter(so => Math.abs(depTime(so) - t) < 60000); if (hits.length === 1) bi = sos.indexOf(hits[0]); }
        if (bi < 0) { o.onWarn && o.onWarn('Einstieg nicht gefunden: ' + L.name + ' in ' + st.stop.name); return; }
        const boardStop = slimStop(sos[bi].stop);
        const boardPlat = plat(sos[bi].departurePlatform, sos[bi].plannedDeparturePlatform) || plat(d.platform, d.plannedPlatform);
        let dist = 0;
        for (let i = bi + 1; i < sos.length; i++) {
          const so = sos[i];
          dist += km(sos[i - 1].stop, so.stop);
          if (so.cancelled) continue;
          const a = arrTime(so);
          if (isNaN(a)) continue;
          if (a > deadline) break;
          const leg = {
            tripId: d.tripId, line: L, direction: trip.direction || d.direction || '',
            from: boardStop, to: slimStop(so.stop), dep: t, arr: a,
            depPlatform: boardPlat, arrPlatform: plat(so.arrivalPlatform, so.plannedArrivalPlatform),
            stops: i - bi - 1, km: Math.round(dist)
          };
          if (sameStop(so.stop, to)) { addResult(st.legs.concat(leg)); continue; }
          if (!allowed(so.stop)) { stat.region++; continue; }
          const id = stopId(so.stop);
          if (st.visited.has(id)) continue;
          if (a + minT + lowerBound(so.stop) > deadline) { stat.late++; continue; }
          out.push({ stop: leg.to, t: a, legs: st.legs.concat(leg), visited: new Set([...st.visited, id]), via: d.tripId });
        }
      }));
      return out;
    }

    const lastLegMin = c => { const L = c.legs[c.legs.length - 1]; return (L.arr - L.dep) / 60000; };
    function choose(children, beam, level, depth) {
      // je Station höchstens 2 Zustände, zeitlich mind. 40 min auseinander
      children.sort((a, b) => a.t - b.t || a.legs.length - b.legs.length);
      const perStop = new Map(), arr = [];
      for (const c of children) {
        const list = perStop.get(c.stop.id) || [];
        if (list.length >= 2 || list.some(x => Math.abs(x.t - c.t) < 40 * 60000)) continue;
        list.push(c); perStop.set(c.stop.id, list); arr.push(c);
      }
      const span = deadline - o.start;
      const target = Math.min(0.85, level / (depth + 0.6));
      for (const c of arr) {
        const id = c.stop.id;
        const hubs = hubLines.has(id) ? hubLines.get(id).size : 0;
        const slack = (deadline - c.t - lowerBound(c.stop)) / 3600000;
        const progress = (c.t - o.start) / span;
        c.score = Math.min(hubs, 5) * 2 + (fernStops.has(id) ? 3 : 0) + (isUic(id) ? 1 : 0)
          + Math.min(km(c.stop, o.from), 120) / 40 + (isWarm(c.stop) ? 1.5 : 0)
          + (slack > 0.5 ? 1 : 0) + Math.random() * 0.8
          - (lastLegMin(c) < 12 ? 3 : 0)
          - Math.abs(progress - target) * 8;
      }
      arr.sort((a, b) => b.score - a.score);
      const perTrip = new Map(), picked = [];
      for (const c of arr) {
        const n = perTrip.get(c.via) || 0;
        if (n >= 2) continue;
        perTrip.set(c.via, n + 1);
        picked.push(c);
        if (picked.length >= beam) break;
      }
      return picked;
    }

    async function complete(st) {
      if (!budgetLeft()) { stopped = stopped || 'Abfrage-Limit erreicht'; return; }
      let js;
      try { js = await api.journeys(st.stop.id, to.id, st.t + minT, o.products, o.minTransfer); }
      catch (e) { if (e.message === 'abgebrochen') throw e; return; }
      const lastTrip = st.legs[st.legs.length - 1].tripId;
      for (const j of js) {
        const raw = (j.legs || []);
        const legs = [];
        let ok = true, prevArr = st.t, prevStop = st.stop;
        for (const l of raw) {
          if (l.walking) {
            const a = arrTime(l);
            if (!isNaN(a)) prevArr = Math.max(prevArr, a);
            if (l.destination) prevStop = l.destination;
            continue;
          }
          if (l.cancelled) { ok = false; break; }
          const dep = depTime(l), arr = arrTime(l);
          if (isNaN(dep) || isNaN(arr)) { ok = false; break; }
          if (l.tripId && l.tripId === lastTrip && !legs.length) { ok = false; break; }
          const wait = dep - prevArr;
          if (wait < 0 || wait > limitAt(prevStop)) { ok = false; break; }
          if (!allowed(l.origin) && !sameStop(l.origin, o.from)) { ok = false; break; }
          if (!allowed(l.destination) && !sameStop(l.destination, to)) { ok = false; break; }
          legs.push({
            tripId: l.tripId || '', line: lineInfo(l.line), direction: l.direction || '',
            from: slimStop(l.origin), to: slimStop(l.destination), dep, arr,
            depPlatform: plat(l.departurePlatform, l.plannedDeparturePlatform),
            arrPlatform: plat(l.arrivalPlatform, l.plannedArrivalPlatform), stops: null,
            km: Math.round(km(l.origin, l.destination) * 1.2)
          });
          prevArr = arr; prevStop = l.destination;
        }
        if (!ok || !legs.length) continue;
        if (legs[legs.length - 1].arr > deadline) continue;
        addResult(st.legs.concat(legs));
      }
    }

    // Start
    const hours = (deadline - o.start) / 3600000;
    const depth = o.depth > 0 ? o.depth : (hours <= 2.5 ? 2 : hours <= 4.5 ? 3 : hours <= 7 ? 4 : 5);
    let frontier = [{ stop: slimStop(o.from), t: o.start, legs: [], visited: new Set([stopId(o.from)]), via: null }];
    for (let level = 1; level <= depth; level++) {
      prog({ phase: 'Erkunde Ebene ' + level + ' von ' + depth, level, frontier: frontier.length });
      const kids = (await Promise.all(frontier.map(expand))).flat();
      if (!kids.length && level === 1) o.onWarn && o.onWarn('Ebene 1 ohne Umsteigepunkte: ' + stat.deps + ' Abfahrten, ' + stat.trips + ' Laufwege, ' + stat.region + ' außerhalb Gebiet, ' + stat.late + ' zu spät für Rückweg');
      const beam = o.beam || 8;
      frontier = choose(kids, beam, level, depth);
      prog({ phase: 'Suche Rückwege (Ebene ' + level + ')', level, frontier: frontier.length });
      await Promise.all(frontier.map(complete));
      if (!frontier.length || stopped) break;
    }
    prog({ phase: 'fertig', done: true, stopped });
    return { results: [...results.values()], stopped, calls: api.calls };
  }

  const api = { Api, search, regionCheck, summarize, km, sameStop, norm, inPoly, TIROL_NORD, TIROL_OST, OESTERREICH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Rundreise = api;
})(typeof window !== 'undefined' ? window : globalThis);
