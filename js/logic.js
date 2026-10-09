/* Moagem — Controlo de Qualidade (auto-controlo)
 * Regras de negócio puras (sem DOM). Usado no browser (window.Logic) e em Node (tests).
 * Fonte dos limites: "Maize Product Quality Matrix — FMO / Carrinho", v1.0, 06-10-2026,
 * que adopta os valores SA R.63 (29-01-2016) Table 1. Valores FMO são propostos, não legais.
 */
(function (root) {
  'use strict';

  const VERSION = '1.4.0';
  const DECISIONS = ['record', 'accept', 'warn', 'reject'];   // ordem de gravidade
  const RANK = { record: 0, accept: 1, warn: 2, reject: 3 };
  const CREWS = ['A', 'B', 'C', 'D'];
  const MILL_TYPES = ['maize', 'wheat', 'rice'];
  const PHYSICAL = ['odour', 'colour', 'mould', 'insects', 'foreign'];
  const FREQS = ['hourly', 'shift', 'optional'];
  const HOUR_MS = 3600000;

  // Parâmetros numéricos (unidade). granA/granB = % que passa no crivo indicado (sieve, mm).
  const PARAMS = ['moisture', 'fat', 'fibre', 'granA', 'granB',
    'protein', 'ash', 'starch', 'whiteness', 'specks', 'aflatoxin', 'fumonisin'];
  const UNITS = { moisture: '%', fat: '%', fibre: '%', granA: '%', granB: '%', protein: '%', ash: '%',
    starch: '%', whiteness: 'WI', specks: '/10 cm²', aflatoxin: 'µg/kg', fumonisin: 'mg/kg' };
  const EXTRA = ['protein', 'ash', 'starch', 'whiteness', 'specks', 'aflatoxin', 'fumonisin'];

  // ---------- limites por defeito ----------
  // lo/hi: limites; loOp 'ge'|'gt'; hiOp 'le'|'lt'; loAct/hiAct: 'warn'|'reject';
  // warnLo/warnHi: banda de aviso dentro dos limites; freq; sieve (mm) para granulometria; src: fonte.
  const SA = 'SA R.63', FMO = 'FMO prop.', FEED = 'Ref. ração';
  const moistureHuman = () => ({ hi: 14, hiOp: 'le', hiAct: 'reject', warnHi: 13.5, freq: 'hourly', src: SA + ' (14) / ' + FMO + ' (13,5)' });
  const rec = (freq) => ({ freq: freq || 'optional', src: '' });
  function extras(o) { EXTRA.forEach(k => { o[k] = rec('optional'); }); return o; }

  function defaultProducts() {
    const P = [];
    const add = (id, cls, group, lim) => P.push({ id, cls, group, limits: extras(lim) });
    add('super', 'Super Maize Meal', 'meal', {
      moisture: moistureHuman(),
      fat: { hi: 2.0, hiOp: 'lt', hiAct: 'reject', freq: 'hourly', src: SA },
      fibre: { hi: 0.8, hiOp: 'le', hiAct: 'reject', freq: 'shift', src: SA },
      granA: { sieve: '1.40', lo: 90, loOp: 'ge', loAct: 'reject', freq: 'shift', src: SA },
      granB: { sieve: '0.30', hi: 90, hiOp: 'lt', hiAct: 'reject', freq: 'shift', src: SA }
    });
    add('fuba1', 'Special Maize Meal', 'meal', {
      moisture: moistureHuman(),
      fat: { lo: 2.0, loOp: 'ge', loAct: 'warn', hi: 3.0, hiOp: 'lt', hiAct: 'reject', freq: 'hourly', src: SA },
      fibre: { hi: 1.2, hiOp: 'le', hiAct: 'reject', freq: 'shift', src: SA },
      granA: { sieve: '1.40', lo: 90, loOp: 'ge', loAct: 'reject', freq: 'shift', src: SA },
      granB: rec('optional')
    });
    add('fuba2', 'Sifted Maize Meal', 'meal', {
      moisture: moistureHuman(),
      fat: { lo: 3.0, loOp: 'ge', loAct: 'warn', hi: 4.0, hiOp: 'lt', hiAct: 'reject', freq: 'hourly', src: SA },
      fibre: { hi: 1.2, hiOp: 'le', hiAct: 'reject', freq: 'shift', src: SA },
      granA: { sieve: '1.40', lo: 90, loOp: 'ge', loAct: 'reject', freq: 'shift', src: SA },
      granB: rec('optional')
    });
    add('integral', 'No.1 Straight-Run Meal', 'meal', {
      moisture: moistureHuman(),
      fat: { lo: 3.7, loOp: 'ge', loAct: 'warn', freq: 'hourly', src: SA },
      fibre: { lo: 1.8, loOp: 'ge', loAct: 'warn', hi: 2.5, hiOp: 'le', hiAct: 'reject', freq: 'shift', src: SA },
      granA: { sieve: '2.36', lo: 90, loOp: 'ge', loAct: 'reject', freq: 'shift', src: SA },
      granB: rec('optional')
    });
    add('animal', 'Hominy Chop', 'feed', {
      moisture: { hi: 13, hiOp: 'le', hiAct: 'reject', freq: 'hourly', src: FEED },
      fat: rec('hourly'), fibre: rec('shift'), granA: rec('optional'), granB: rec('optional')
    });
    const grits = (id, cls, coarse, fine) => add(id, cls, 'grits', {
      moisture: moistureHuman(),
      fat: { hi: 1.5, hiOp: 'le', hiAct: 'reject', freq: 'hourly', src: SA },
      fibre: { hi: 0.8, hiOp: 'le', hiAct: 'reject', freq: 'shift', src: SA },
      granA: { sieve: coarse, lo: 90, loOp: 'ge', loAct: 'reject', freq: 'hourly', src: SA },
      granB: { sieve: fine, hi: 5, hiOp: 'le', hiAct: 'reject', freq: 'hourly', src: SA }
    });
    grits('brew_grits', 'Brewing Grits', '4.0', '0.50');
    grits('snack_grits', 'Snack Grits', '2.0', '0.850');
    grits('maize_rice', 'Maize Rice', '4.0', '1.18');
    return P;
  }

  function defaultConfig() {
    return {
      millType: 'maize',
      lines: [{ id: 'C', name: 'Moinho C' }, { id: 'D', name: 'Moinho D' }],
      graceMin: 10,          // tolerância antes de "em atraso" (definição da app, não do documento)
      products: { maize: defaultProducts(), wheat: [], rice: [] }
    };
  }

  // ---------- números ----------
  // Aceita "13,5", "13.5", " 13 ". Devolve null se vazio, NaN se inválido.
  function num(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    let s = String(v).trim().replace(/\s+/g, '');
    if (s === '') return null;
    if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
    return parseFloat(s);
  }
  function pct(v) {
    const n = num(v);
    if (n === null || isNaN(n)) return n;
    return (n < 0 || n > 100) ? NaN : n;
  }

  // ---------- avaliação ----------
  function hasLimits(L) {
    return !!L && [L.lo, L.hi, L.warnLo, L.warnHi].some(x => x !== null && x !== undefined && x !== '');
  }
  const isNum = x => typeof x === 'number' && isFinite(x);

  // Devolve {decision, reason} ; reason: 'hi'|'lo'|'warnHi'|'warnLo'|null
  function evalParam(v, L) {
    if (v === null || v === undefined) return { decision: null, reason: null };
    if (!hasLimits(L)) return { decision: 'record', reason: null };
    if (isNum(L.hi)) {
      const fail = L.hiOp === 'lt' ? !(v < L.hi) : !(v <= L.hi);
      if (fail) return { decision: L.hiAct === 'warn' ? 'warn' : 'reject', reason: 'hi' };
    }
    if (isNum(L.lo)) {
      const fail = L.loOp === 'gt' ? !(v > L.lo) : !(v >= L.lo);
      if (fail) return { decision: L.loAct === 'reject' ? 'reject' : 'warn', reason: 'lo' };
    }
    if (isNum(L.warnHi) && v > L.warnHi) return { decision: 'warn', reason: 'warnHi' };
    if (isNum(L.warnLo) && v < L.warnLo) return { decision: 'warn', reason: 'warnLo' };
    return { decision: 'accept', reason: null };
  }

  function worst(list) {
    let w = null;
    list.forEach(d => { if (d && (w === null || RANK[d] > RANK[w])) w = d; });
    return w;
  }

  // values: {moisture: '13,2', ...}; physical: {odour:'ok'|'abn'|null,...}
  // Devolve {values (números), results{param:{decision,reason}}, physical, decision, errors[], failures[]}
  function evaluateSample(product, rawValues, physical) {
    const errors = [], values = {}, results = {}, failures = [];
    PARAMS.forEach(p => {
      const raw = rawValues ? rawValues[p] : null;
      const n = (p === 'specks' || p === 'aflatoxin' || p === 'fumonisin' || p === 'whiteness') ? num(raw) : pct(raw);
      if (n !== null && isNaN(n)) { errors.push({ field: p, code: 'invalid' }); return; }
      if (n !== null && n < 0) { errors.push({ field: p, code: 'invalid' }); return; }
      if (n === null) return;
      values[p] = n;
      const r = evalParam(n, product.limits[p]);
      results[p] = r;
      if (r.decision === 'warn' || r.decision === 'reject') failures.push({ param: p, value: n, decision: r.decision, reason: r.reason });
    });
    const phys = {};
    let physAny = false, physAbn = [];
    PHYSICAL.forEach(k => {
      const v = physical ? physical[k] : null;
      if (v === 'ok' || v === 'abn') { phys[k] = v; physAny = true; if (v === 'abn') physAbn.push(k); }
    });
    if (physAny && PHYSICAL.some(k => !phys[k])) errors.push({ field: 'physical', code: 'incomplete' });
    physAbn.forEach(k => failures.push({ param: k, value: 'abn', decision: 'reject', reason: 'physical' }));
    if (!Object.keys(values).length && !physAny && !errors.length) errors.push({ field: 'all', code: 'empty' });

    const ds = Object.values(results).map(r => r.decision);
    if (physAny) ds.push(physAbn.length ? 'reject' : 'accept');
    let decision = worst(ds) || 'record';
    return { values, results, physical: physAny ? phys : null, decision, errors, failures };
  }

  // ---------- turnos e dia de produção ----------
  const pad = n => String(n).padStart(2, '0');
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  // Dia de produção = data das 07:00 que iniciaram o período 07:00–07:00
  function prodDay(t) {
    const d = new Date(t);
    if (d.getHours() < 7) d.setDate(d.getDate() - 1);
    return ymd(d);
  }
  function prodDayRange(day) {   // 'YYYY-MM-DD' → [start, end) em ms (hora local)
    const [y, m, dd] = day.split('-').map(Number);
    const s = new Date(y, m - 1, dd, 7, 0, 0, 0);
    const e = new Date(y, m - 1, dd + 1, 7, 0, 0, 0);
    return [s.getTime(), e.getTime()];
  }
  // Turno: 'D' 07–19, 'N' 19–07. Devolve {period, start, end, day}
  function shiftOf(t) {
    const d = new Date(t), h = d.getHours();
    const day = prodDay(t);
    const [y, m, dd] = day.split('-').map(Number);
    if (h >= 7 && h < 19) return { period: 'D', start: new Date(y, m - 1, dd, 7).getTime(), end: new Date(y, m - 1, dd, 19).getTime(), day };
    return { period: 'N', start: new Date(y, m - 1, dd, 19).getTime(), end: new Date(y, m - 1, dd + 1, 7).getTime(), day };
  }

  // ---------- frequências / atrasos ----------
  // samples: amostras efectivas da linha (qualquer produto), runningSince: ms do arranque/mudança de produto
  function dueStatus(product, samples, runningSince, now, graceMin) {
    const grace = (isNum(graceMin) ? graceMin : 10) * 60000;
    const out = { hourly: [], shift: [] };
    const sh = shiftOf(now);
    PARAMS.concat(['physical']).forEach(p => {
      const L = p === 'physical' ? { freq: 'hourly' } : product.limits[p];
      if (!L || (L.freq !== 'hourly' && L.freq !== 'shift')) return;
      const has = s => p === 'physical' ? !!s.physical : (s.values && s.values[p] !== undefined);
      const relevant = samples.filter(s => s.productId === product.id && s.t >= runningSince && has(s));
      const last = relevant.reduce((m, s) => Math.max(m, s.t), 0);
      if (L.freq === 'hourly') {
        const base = last || runningSince;
        const due = base + HOUR_MS;
        out.hourly.push({ param: p, last: last || null, due, overdue: now > due + grace, dueNow: now >= due });
      } else {
        const from = Math.max(sh.start, runningSince);
        const done = relevant.some(s => s.t >= from);
        out.shift.push({ param: p, done, shiftEnd: sh.end });
      }
    });
    return out;
  }

  // ---------- retenções (hold) ----------
  // status: 'open' (precisa acção) → 'action' (aguarda re-amostra) → 'closed'
  function holdAfterSample(hold, sample) {
    if (!hold || hold.status === 'closed' || sample.lineId !== hold.lineId) return hold;
    const h = JSON.parse(JSON.stringify(hold));
    h.samples = (h.samples || []).concat([sample.id]);
    if (sample.decision === 'reject') {
      h.status = 'open';
      h.reasons = (h.reasons || []).concat(sample.failures.filter(f => f.decision === 'reject').map(f => f.param));
    } else if (h.status === 'action' && (sample.decision === 'accept' || sample.decision === 'warn')) {
      h.status = 'closed'; h.closedAt = sample.t; h.closedBySample = sample.id;
    }
    return h;
  }
  function addHoldAction(hold, action) {
    if (!hold || hold.status === 'closed') throw new Error('hold-closed');
    if (!action || !String(action.text || '').trim() || !String(action.by || '').trim()) throw new Error('action-required');
    const h = JSON.parse(JSON.stringify(hold));
    h.actions = (h.actions || []).concat([{ at: action.at, by: String(action.by).trim(), text: String(action.text).trim() }]);
    h.status = 'action';
    return h;
  }
  function newHold(sample) {
    return {
      lineId: sample.lineId, productId: sample.productId, openedAt: sample.t, openedBySample: sample.id,
      status: 'open', reasons: sample.failures.filter(f => f.decision === 'reject').map(f => f.param),
      actions: [], samples: [sample.id], crew: sample.crew
    };
  }

  // ---------- correcções ----------
  // Amostras nunca são editadas: uma correcção é um novo registo com correctsId. Devolve só as efectivas.
  function effective(samples) {
    const superseded = new Set(samples.filter(s => s.correctsId).map(s => s.correctsId));
    return samples.filter(s => !superseded.has(s.id));
  }

  // ---------- edição de limites ----------
  const LIMIT_FIELDS = ['lo', 'hi', 'warnLo', 'warnHi'];
  // Valida um conjunto de limites de um parâmetro. Devolve lista de códigos de erro.
  function validateLimit(L) {
    const e = [];
    LIMIT_FIELDS.forEach(f => { if (L[f] !== null && L[f] !== undefined && !isNum(L[f])) e.push(f + ':invalid'); });
    if (isNum(L.lo) && isNum(L.hi) && L.lo > L.hi) e.push('lo>hi');
    if (isNum(L.warnHi) && isNum(L.hi) && L.warnHi > L.hi) e.push('warnHi>hi');
    if (isNum(L.warnLo) && isNum(L.lo) && L.warnLo < L.lo) e.push('warnLo<lo');
    if (isNum(L.warnLo) && isNum(L.warnHi) && L.warnLo > L.warnHi) e.push('warnLo>warnHi');
    if (L.freq && FREQS.indexOf(L.freq) < 0) e.push('freq:invalid');
    return e;
  }
  // Diferenças entre limites antigos e novos (para auditoria)
  function limitDiff(oldL, newL) {
    const d = [];
    LIMIT_FIELDS.concat(['freq', 'loAct', 'hiAct']).forEach(f => {
      const dflt = f === 'loAct' ? 'warn' : f === 'hiAct' ? 'reject' : null;   // acção por defeito
      const norm = v => (v === undefined || v === null) ? dflt : v;
      const a = norm(oldL[f]), b = norm(newL[f]);
      if (a !== b) d.push({ field: f, old: a, new: b });
    });
    return d;
  }

  // ---------- relatório diário ----------
  function stats(arr) {
    if (!arr.length) return { n: 0, avg: null, min: null, max: null };
    const sum = arr.reduce((a, b) => a + b, 0);
    return { n: arr.length, avg: Math.round(sum / arr.length * 100) / 100, min: Math.min(...arr), max: Math.max(...arr) };
  }
  function dayReport(day, allSamples, holds, cfg) {
    const [s, e] = prodDayRange(day);
    const samples = effective(allSamples).filter(x => x.t >= s && x.t < e).sort((a, b) => a.t - b.t);
    const groups = {};
    samples.forEach(x => {
      const k = x.lineId + '|' + x.productId + '|' + shiftOf(x.t).period;
      (groups[k] = groups[k] || []).push(x);
    });
    const summary = Object.keys(groups).sort().map(k => {
      const [lineId, productId, period] = k.split('|');
      const g = groups[k];
      const count = d => g.filter(x => x.decision === d).length;
      const hours = new Set(g.filter(x => x.values && x.values.moisture !== undefined).map(x => new Date(x.t).getHours())).size;
      const st = p => stats(g.filter(x => x.values && x.values[p] !== undefined).map(x => x.values[p]));
      return { lineId, productId, period, crews: [...new Set(g.map(x => x.crew))].join('/'), n: g.length,
        accept: count('accept'), warn: count('warn'), reject: count('reject'), record: count('record'),
        hoursWithMoisture: hours, moisture: st('moisture'), fat: st('fat'), fibre: st('fibre'), granA: st('granA'), granB: st('granB') };
    });
    const dayHolds = (holds || []).filter(h => h.openedAt < e && (!h.closedAt || h.closedAt >= s))
      .map(h => Object.assign({}, h, { durationMin: Math.round(((h.closedAt || Math.min(e, Date.now())) - h.openedAt) / 60000) }));
    const alerts = samples.filter(x => x.decision === 'warn' || x.decision === 'reject');
    return { day, start: s, end: e, samples, summary, holds: dayHolds, alerts,
      totals: { n: samples.length, accept: samples.filter(x => x.decision === 'accept').length,
        warn: samples.filter(x => x.decision === 'warn').length, reject: samples.filter(x => x.decision === 'reject').length } };
  }

  // ---------- cópia de segurança ----------
  function validBackup(o) {
    if (!o || typeof o !== 'object' || o.app !== 'mill-qc' || typeof o.format !== 'number') return false;
    if (!Array.isArray(o.samples) || !Array.isArray(o.holds)) return false;
    const okS = o.samples.every(s => s && typeof s.t === 'number' && typeof s.lineId === 'string' &&
      typeof s.productId === 'string' && DECISIONS.indexOf(s.decision) >= 0 && (s.crew === undefined || CREWS.indexOf(s.crew) >= 0));
    const okH = o.holds.every(h => h && typeof h.lineId === 'string' && ['open', 'action', 'closed'].indexOf(h.status) >= 0);
    return okS && okH;
  }

  function findProduct(cfg, id) {
    const list = (cfg.products && cfg.products[cfg.millType]) || [];
    return list.find(p => p.id === id) || null;
  }

  const api = { VERSION, DECISIONS, RANK, CREWS, MILL_TYPES, PHYSICAL, PARAMS, EXTRA, UNITS, FREQS,
    defaultProducts, defaultConfig, num, pct, evalParam, hasLimits, evaluateSample, worst,
    prodDay, prodDayRange, shiftOf, ymd, dueStatus, newHold, holdAfterSample, addHoldAction,
    effective, validateLimit, limitDiff, dayReport, validBackup, findProduct };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Logic = api;
})(typeof window !== 'undefined' ? window : this);
