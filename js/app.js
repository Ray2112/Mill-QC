/* Moagem — Controlo de Qualidade. UI (vanilla JS). */
(function () {
  'use strict';
  const L = window.Logic, DB = window.DB, I = window.I18N;
  let PU = null;   // módulo de Produção (js/prod-ui.js)
  const $ = s => document.querySelector(s);
  const S = {
    view: 'home', lang: 'pt', cfg: null, crew: null, operator: '', lineState: {},
    samples: [], holds: [], alerts: [], limitChanges: [], reports: [],
    form: null, limitsProduct: null, limitsDraft: null, recDay: null, recLine: '', repDay: null,
    detailId: null, modal: null, notified: {}, pinLock: { fails: 0, until: 0 }
  };
  const DEC_OK = { record: 1, accept: 1, warn: 1, reject: 1 };
  const decCls = d => DEC_OK[d] ? 'd-' + d : 'd-record';

  // ---------- util ----------
  function t(k, vars) {
    let s = (I[S.lang] && I[S.lang][k]) || I.pt[k] || k;
    if (vars) Object.keys(vars).forEach(v => { s = s.split('{' + v + '}').join(vars[v]); });
    return s;
  }
  function esc(v) {
    return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const pad = n => String(n).padStart(2, '0');
  const fmtTime = ms => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const fmtDT = ms => { const d = new Date(ms); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + fmtTime(ms); };
  const fmtNum = v => (v === null || v === undefined || v === '') ? '' : (S.lang === 'pt' ? String(v).replace('.', ',') : String(v));
  const localInput = ms => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + fmtTime(ms); };
  const products = () => (S.cfg.products[S.cfg.millType] || []);
  const product = id => L.findProduct(S.cfg, id);
  const lineName = id => { const l = S.cfg.lines.find(x => x.id === id); return l ? l.name : id; };
  const prodName = id => t('prod_' + id);
  const PHYS_SET = { odour: 1, colour: 1, mould: 1, insects: 1, foreign: 1 };
  function anyLabel(p, prod) { return PHYS_SET[p] ? t('ph_' + p) : paramLabel(p, prod); }
  function paramLabel(p, prod) {
    if ((p === 'granA' || p === 'granB') && prod && prod.limits[p] && prod.limits[p].sieve)
      return t('p_gran', { mm: fmtNum(prod.limits[p].sieve) });
    return t('p_' + p);
  }
  function limitText(Lm) {
    if (!L.hasLimits(Lm)) return t('recordOnly');
    const parts = [];
    if (typeof Lm.lo === 'number') parts.push((Lm.loOp === 'gt' ? '> ' : '≥ ') + fmtNum(Lm.lo) + (Lm.loAct === 'reject' ? '' : ' ' + t('belowWarn')));
    if (typeof Lm.hi === 'number') parts.push((Lm.hiOp === 'lt' ? '< ' : '≤ ') + fmtNum(Lm.hi) + (Lm.hiAct === 'warn' ? ' ' + t('aboveWarn') : ''));
    if (typeof Lm.warnHi === 'number') parts.push(t('warnAbove', { v: fmtNum(Lm.warnHi) }));
    if (typeof Lm.warnLo === 'number') parts.push(t('warnBelow', { v: fmtNum(Lm.warnLo) }));
    return parts.join(' · ');
  }
  const decLabel = d => t('dec_' + (DEC_OK[d] ? d : 'record'));
  function toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  // ---------- PIN ----------
  async function sha(s) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
  }
  async function setPin(pin) {
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(x => x.toString(16).padStart(2, '0')).join('');
    await DB.setConfig('pin', { salt, hash: await sha(salt + pin) });
  }
  async function checkPin(pin) {
    const now = Date.now();
    if (S.pinLock.until > now) return { ok: false, locked: Math.ceil((S.pinLock.until - now) / 60000) };
    const p = await DB.getConfig('pin');
    if (!p) return { ok: false, noPin: true };
    const ok = (await sha(p.salt + String(pin || ''))) === p.hash;
    if (ok) S.pinLock = { fails: 0, until: 0 };
    else { S.pinLock.fails++; if (S.pinLock.fails >= 5) S.pinLock = { fails: 0, until: now + 5 * 60000 }; }
    await DB.setConfig('pinLock', S.pinLock);
    return { ok, left: 5 - S.pinLock.fails, locked: S.pinLock.until > now ? 5 : 0 };
  }
  function pinMsg(r) {
    if (r.noPin) return t('pinNotSet');
    if (r.locked) return t('pinLocked', { m: r.locked });
    return t('pinWrong', { n: r.left });
  }

  // ---------- dados ----------
  async function load() {
    S.cfg = (await DB.getConfig('cfg')) || L.defaultConfig();
    S.lang = (await DB.getConfig('lang')) || 'pt';
    S.crew = (await DB.getConfig('crew')) || null;
    S.operator = (await DB.getConfig('operator')) || '';
    S.lineState = (await DB.getConfig('lineState')) || {};
    S.pinLock = (await DB.getConfig('pinLock')) || { fails: 0, until: 0 };
    S.pinSet = !!(await DB.getConfig('pin'));
    await reloadData();
    await PU.load();
  }
  async function reloadData() {
    S.samples = await DB.all('samples');
    S.holds = await DB.all('holds');
    S.alerts = await DB.all('alerts');
    S.limitChanges = await DB.all('limitChanges');
    S.reports = await DB.all('reports');
  }
  const openHold = lineId => S.holds.find(h => h.lineId === lineId && h.status !== 'closed');
  function lineSamples(lineId) { return L.effective(S.samples).filter(s => s.lineId === lineId); }
  function lineStatus(lineId) {
    if (openHold(lineId)) return 'hold';
    const st = S.lineState[lineId];
    if (!st || !st.running) return 'stopped';
    const sh = L.shiftOf(Date.now());
    const last = lineSamples(lineId).filter(s => s.t >= sh.start).sort((a, b) => b.t - a.t)[0];
    if (!last) return 'nodata';
    return last.decision === 'warn' ? 'warn' : 'ok';
  }

  // ---------- alertas ----------
  function beep() {
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      const ctx = new C();
      [0, 0.35, 0.7].forEach(o => {
        const os = ctx.createOscillator(), g = ctx.createGain();
        os.frequency.value = 880; os.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.25, ctx.currentTime + o); os.start(ctx.currentTime + o); os.stop(ctx.currentTime + o + 0.22);
      });
    } catch (e) { /* sem som */ }
  }
  async function notify(title, body, tag) {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) reg.showNotification(title, { body, tag, renotify: true, icon: 'icons/icon-192.png' });
      else new Notification(title, { body, tag });
    } catch (e) { /* ignorar */ }
  }
  function alertText(s) {
    const prod = product(s.productId);
    const lines = s.failures.map(f => '• ' + paramLabel(f.param, prod) + ': ' + (f.value === 'abn' ? t('abnormal') : fmtNum(f.value)) +
      ' → ' + decLabel(f.decision) + (prod && prod.limits[f.param] ? ' (' + limitText(prod.limits[f.param]) + ')' : ''));
    return [t('waTitle', { dec: decLabel(s.decision).toUpperCase() }),
      lineName(s.lineId) + ' · ' + prodName(s.productId),
      fmtDT(s.t) + ' · ' + t('crew') + ' ' + s.crew + ' · ' + t('shift_' + L.shiftOf(s.t).period),
      ...lines,
      s.decision === 'reject' ? t('waHold') : t('waInvestigate'),
      t('operator') + ': ' + s.operator].join('\n');
  }
  const waLink = txt => 'https://wa.me/?text=' + encodeURIComponent(txt);
  function raiseAlert(s) {
    if (navigator.vibrate) navigator.vibrate(s.decision === 'reject' ? [400, 150, 400, 150, 400] : [300]);
    beep();
    notify(decLabel(s.decision) + ' — ' + lineName(s.lineId), prodName(s.productId) + ': ' + s.failures.map(f => paramLabel(f.param, product(s.productId))).join(', '), 'qc-' + s.id);
    S.modal = { type: 'alert', sampleId: s.id };
  }
  // verificação de atrasos (cada minuto)
  function overdueList() {
    const out = [];
    S.cfg.lines.forEach(l => {
      const st = S.lineState[l.id];
      if (!st || !st.running) return;
      const prod = product(st.productId); if (!prod) return;
      const d = L.dueStatus(prod, lineSamples(l.id), st.since, Date.now(), S.cfg.graceMin);
      d.hourly.filter(x => x.overdue).forEach(x => out.push({ lineId: l.id, param: x.param, due: x.due, prod }));
    });
    return out;
  }
  function checkOverdue() {
    const od = overdueList();
    od.forEach(o => {
      const k = o.lineId + '|' + o.param + '|' + o.due;
      if (S.notified[k]) return;
      S.notified[k] = 1;
      notify(t('overdueTitle'), lineName(o.lineId) + ': ' + (o.param === 'physical' ? t('physical') : paramLabel(o.param, o.prod)) + ' — ' + t('dueAt', { h: fmtTime(o.due) }), 'od-' + o.lineId);
    });
    if (S.view === 'home' && !S.modal) render();
  }

  // ---------- render ----------
  function render() {
    document.documentElement.lang = S.lang;
    const sh = L.shiftOf(Date.now());
    const openN = S.holds.filter(h => h.status !== 'closed').length;
    $('#app').innerHTML = `
      <header class="top">
        <div class="brand"><b>${esc(t('appTitle'))}</b><span class="mill">${esc(t('mill_' + S.cfg.millType))}</span></div>
        <div class="shiftbar">
          <label>${esc(t('crew'))}
            <select id="crewSel">${['', ...L.CREWS].map(c => `<option value="${esc(c)}" ${S.crew === c || (!S.crew && !c) ? 'selected' : ''}>${c ? esc(c) : '—'}</option>`).join('')}</select>
          </label>
          <span class="pill">${esc(t('shift_' + sh.period))} ${sh.period === 'D' ? '07–19' : '19–07'}</span>
          <span class="clock" id="clock">${fmtTime(Date.now())}</span>
        </div>
      </header>
      <main id="main">${view()}</main>
      <nav class="bottom">
        ${navBtn('home', '⌂')}${navBtn('sample', '＋')}${navBtn('holds', '⛔', openN)}${navBtn('prod', '▶', (S.jobs || []).filter(j => j.status === 'running').length)}${navBtn('records', '☰')}${navBtn('report', '▤')}${navBtn('settings', '⚙')}
      </nav>
      ${S.modal ? modal() : ''}`;
  }
  function navBtn(v, icon, badge) {
    return `<button class="nav ${S.view === v ? 'on' : ''}" data-nav="${v}"><span class="ic">${icon}</span><span>${esc(t('nav_' + v))}</span>${badge ? `<i class="badge">${badge}</i>` : ''}</button>`;
  }
  function view() {
    switch (S.view) {
      case 'sample': return viewSample();
      case 'holds': return viewHolds();
      case 'records': return viewRecords();
      case 'report': return viewReport();
      case 'settings': return viewSettings();
      case 'limits': return viewLimits();
      case 'prod': return PU.view();
      case 'prodset': return PU.viewProdSet();
      case 'codes': return PU.viewCodes();
      default: return viewHome();
    }
  }

  // ----- Início -----
  function reportPendingDay() {
    const prev = L.prodDay(Date.now() - 24 * 3600000);
    const [s, e] = L.prodDayRange(prev);
    const has = S.samples.some(x => x.t >= s && x.t < e);
    const done = S.reports.some(r => r.day === prev);
    return has && !done ? prev : null;
  }
  function viewHome() {
    if (!products().length) return `<section class="card warnbox"><h2>${esc(t('mill_' + S.cfg.millType))}</h2><p>${esc(t('notConfigured'))}</p></section>`;
    const banners = [];
    if (!S.pinSet) banners.push(`<div class="banner b-warn" data-nav="settings">${esc(t('setPinFirst'))}</div>`);
    if (!S.crew) banners.push(`<div class="banner b-warn">${esc(t('selectCrew'))}</div>`);
    const rp = reportPendingDay();
    if (rp) banners.push(`<div class="banner b-info" data-repday="${esc(rp)}">${esc(t('reportReady', { d: rp }))}</div>`);
    const od = overdueList();
    if (od.length) banners.push(`<div class="banner b-reject">⏰ ${esc(t('overdueN', { n: od.length }))}</div>`);
    return banners.join('') + S.cfg.lines.map(lineCard).join('');
  }
  function lineCard(l) {
    const st = S.lineState[l.id] || {};
    const status = lineStatus(l.id);
    const prod = st.productId ? product(st.productId) : null;
    const hold = openHold(l.id);
    let due = '';
    if (st.running && prod) {
      const d = L.dueStatus(prod, lineSamples(l.id), st.since, Date.now(), S.cfg.graceMin);
      due = `<div class="due"><div class="sub">${esc(t('hourlyChecks'))}</div>${d.hourly.map(x =>
        `<span class="chip ${x.overdue ? 'd-reject' : x.dueNow ? 'd-warn' : 'd-accept'}">${esc(x.param === 'physical' ? t('physical') : paramLabel(x.param, prod))} ${x.overdue ? esc(t('late')) : esc(fmtTime(x.due))}</span>`).join('')}</div>
        ${d.shift.length ? `<div class="due"><div class="sub">${esc(t('shiftChecks'))}</div>${d.shift.map(x =>
        `<span class="chip ${x.done ? 'd-accept' : 'd-warn'}">${esc(paramLabel(x.param, prod))} ${x.done ? '✓' : esc(t('pending'))}</span>`).join('')}</div>` : ''}`;
    }
    const statusCls = { hold: 'd-reject', warn: 'd-warn', ok: 'd-accept', stopped: 'd-record', nodata: 'd-record' }[status];
    return `<section class="card line">
      <div class="row between"><h2>${esc(l.name)}</h2><span class="status ${statusCls}">${esc(t('st_' + status))}</span></div>
      ${hold ? `<div class="banner b-reject" data-nav="holds">${esc(t('holdSince', { h: fmtDT(hold.openedAt) }))} — ${esc(t('hs_' + hold.status))}</div>` : ''}
      ${PU.homeLine(l.id)}
      <label class="fld">${esc(t('runningProduct'))}
        <select data-lineprod="${esc(l.id)}">
          <option value="">—</option>
          ${products().map(p => `<option value="${esc(p.id)}" ${st.productId === p.id ? 'selected' : ''}>${esc(prodName(p.id))}</option>`).join('')}
        </select></label>
      <div class="row">
        <button class="btn ${st.running ? 'ghost' : ''}" data-run="${esc(l.id)}">${esc(st.running ? t('stopLine') : t('startLine'))}</button>
        <button class="btn primary" data-newsample="${esc(l.id)}">${esc(t('newSample'))}</button>
      </div>
      ${st.running ? `<div class="sub">${esc(t('runningSince', { h: fmtDT(st.since) }))}</div>` : ''}
      ${due}
    </section>`;
  }

  // ----- Amostra -----
  function newForm(lineId, correctsId) {
    const lid = lineId || (S.cfg.lines[0] && S.cfg.lines[0].id);
    const st = S.lineState[lid] || {};
    S.form = { lineId: lid, productId: st.productId || (products()[0] && products()[0].id), time: localInput(Date.now()),
      operator: S.operator, values: {}, physical: {}, notes: '', correctsId: correctsId || null, reason: '' };
    if (correctsId) {
      const o = S.samples.find(s => s.id === correctsId);
      if (o) {
        Object.assign(S.form, { lineId: o.lineId, productId: o.productId, time: localInput(o.t) });
        Object.keys(o.values || {}).forEach(k => { S.form.values[k] = fmtNum(o.values[k]); });
        S.form.physical = Object.assign({}, o.physical || {});
      }
    }
  }
  function formEval() {
    const prod = product(S.form.productId);
    return prod ? L.evaluateSample(prod, S.form.values, S.form.physical) : null;
  }
  function viewSample() {
    if (!products().length) return `<section class="card"><p>${esc(t('notConfigured'))}</p></section>`;
    if (!S.form) newForm();
    const f = S.form, prod = product(f.productId);
    const st = S.lineState[f.lineId] || {};
    const due = prod && st.running && st.productId === prod.id ? L.dueStatus(prod, lineSamples(f.lineId), st.since, Date.now(), S.cfg.graceMin) : null;
    const pendingShift = due ? due.shift.filter(x => !x.done).map(x => x.param) : [];
    const byFreq = fr => L.PARAMS.filter(p => !L.EXTRA.includes(p) && prod.limits[p] && prod.limits[p].freq === fr && (p !== 'granB' || prod.limits.granB.sieve || L.hasLimits(prod.limits.granB)));
    const hourly = byFreq('hourly'), shift = byFreq('shift');
    const others = L.PARAMS.filter(p => !hourly.includes(p) && !shift.includes(p) && !((p === 'granA' || p === 'granB') && !(prod.limits[p] && prod.limits[p].sieve)));
    const ev = formEval();
    return `<section class="card">
      <h2>${esc(f.correctsId ? t('correction') + ' #' + f.correctsId : t('newSample'))}</h2>
      ${f.correctsId ? `<label class="fld req">${esc(t('correctionReason'))}<input id="f_reason" value="${esc(f.reason)}"></label>` : ''}
      <div class="grid2">
        <label class="fld">${esc(t('line'))}<select id="f_line" ${f.correctsId ? 'disabled' : ''}>${S.cfg.lines.map(l => `<option value="${esc(l.id)}" ${l.id === f.lineId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
        <label class="fld">${esc(t('product'))}<select id="f_prod" ${f.correctsId ? 'disabled' : ''}>${products().map(p => `<option value="${esc(p.id)}" ${p.id === f.productId ? 'selected' : ''}>${esc(prodName(p.id))}</option>`).join('')}</select></label>
        <label class="fld">${esc(t('sampleTime'))}<input type="datetime-local" id="f_time" value="${esc(f.time)}"></label>
        <label class="fld req">${esc(t('operator'))}<input id="f_op" value="${esc(f.operator)}" autocomplete="name"></label>
      </div>
      <div class="sub">${esc(t('crew'))}: <b>${esc(S.crew || '—')}</b> · ${esc(t('class'))}: ${esc(prod.cls)}</div>
    </section>
    <section class="card"><h3>${esc(t('hourlyChecks'))}</h3>${hourly.map(p => paramInput(p, prod, ev)).join('')}${physicalBlock(ev)}</section>
    ${shift.length ? `<section class="card"><h3>${esc(t('shiftChecks'))}</h3>${shift.map(p => paramInput(p, prod, ev, pendingShift.includes(p))).join('')}</section>` : ''}
    <details class="card" ${others.some(p => f.values[p]) ? 'open' : ''}><summary>${esc(t('otherTests'))}</summary>${others.map(p => paramInput(p, prod, ev)).join('')}</details>
    <section class="card">
      <label class="fld">${esc(t('notes'))}<textarea id="f_notes" rows="2">${esc(f.notes)}</textarea></label>
      <div id="liveDec">${liveDecision(ev)}</div>
      <button class="btn primary big" id="saveSample">${esc(t('save'))}</button>
    </section>`;
  }
  function paramInput(p, prod, ev, pending) {
    const Lm = prod.limits[p] || {};
    const r = ev && ev.results[p];
    const err = ev && ev.errors.some(e => e.field === p);
    return `<div class="param">
      <label class="fld">${esc(paramLabel(p, prod))} <small>(${esc(L.UNITS[p])})</small> ${pending ? `<span class="chip d-warn">${esc(t('pending'))}</span>` : ''}
        <input inputmode="decimal" data-val="${esc(p)}" value="${esc(S.form.values[p] || '')}" class="${err ? 'bad' : ''}"></label>
      <div class="lim"><span>${esc(limitText(Lm))}</span>${Lm.src ? `<em>${esc(Lm.src)}</em>` : ''}
        <span class="chip ${err ? 'd-reject' : r ? decCls(r.decision) : 'd-none'}" data-chip="${esc(p)}">${err ? esc(t('invalid')) : r ? esc(decLabel(r.decision)) : ''}</span></div>
    </div>`;
  }
  function physicalBlock(ev) {
    const err = ev && ev.errors.some(e => e.field === 'physical');
    return `<div class="phys"><div class="sub">${esc(t('physical'))} ${err ? `<b class="txt-reject">${esc(t('physIncomplete'))}</b>` : ''}</div>
      ${L.PHYSICAL.map(k => `<div class="physrow"><span>${esc(t('ph_' + k))}</span>
        <div class="seg"><button data-phys="${k}" data-pv="ok" class="${S.form.physical[k] === 'ok' ? 'on ok' : ''}">${esc(t('normal'))}</button><button data-phys="${k}" data-pv="abn" class="${S.form.physical[k] === 'abn' ? 'on abn' : ''}">${esc(t('abnormal'))}</button></div></div>`).join('')}
      <button class="btn ghost small" id="physAllOk">${esc(t('allNormal'))}</button></div>`;
  }
  function liveDecision(ev) {
    if (!ev) return '';
    if (ev.errors.some(e => e.code === 'empty')) return `<div class="dec d-record">${esc(t('enterValues'))}</div>`;
    return `<div class="dec ${decCls(ev.decision)}"><b>${esc(decLabel(ev.decision))}</b>${ev.decision === 'reject' ? ' — ' + esc(t('holdWillOpen')) : ''}</div>`;
  }
  function updateLive() {
    const ev = formEval(); const prod = product(S.form.productId);
    L.PARAMS.forEach(p => {
      const chip = document.querySelector(`[data-chip="${p}"]`); if (!chip) return;
      const err = ev.errors.some(e => e.field === p); const r = ev.results[p];
      chip.className = 'chip ' + (err ? 'd-reject' : r ? decCls(r.decision) : 'd-none');
      chip.textContent = err ? t('invalid') : r ? decLabel(r.decision) : '';
      const inp = document.querySelector(`[data-val="${p}"]`); if (inp) inp.classList.toggle('bad', err);
    });
    $('#liveDec').innerHTML = liveDecision(ev);
    void prod;
  }
  async function saveSample() {
    const f = S.form, prod = product(f.productId);
    const ev = formEval();
    const tms = new Date(f.time).getTime();
    if (!S.crew) return toast(t('selectCrew'));
    if (!String(f.operator).trim()) return toast(t('needOperator'));
    if (!isFinite(tms)) return toast(t('badTime'));
    if (tms > Date.now() + 5 * 60000) return toast(t('futureTime'));
    if (tms < Date.now() - 24 * 3600000) return toast(t('tooOld'));
    if (f.correctsId && !String(f.reason).trim()) return toast(t('needReason'));
    if (ev.errors.length) return toast(ev.errors.some(e => e.code === 'empty') ? t('enterValues') : ev.errors.some(e => e.code === 'incomplete') ? t('physIncomplete') : t('fixInvalid'));
    const sample = {
      t: tms, savedAt: Date.now(), lineId: f.lineId, productId: f.productId, crew: S.crew, period: L.shiftOf(tms).period,
      prodDay: L.prodDay(tms), operator: String(f.operator).trim(), values: ev.values, physical: ev.physical,
      results: ev.results, decision: ev.decision, failures: ev.failures, notes: String(f.notes || '').trim(),
      limits: JSON.parse(JSON.stringify(prod.limits)), millType: S.cfg.millType
    };
    if (f.correctsId) { sample.correctsId = f.correctsId; sample.correctionReason = String(f.reason).trim(); }
    const existing = openHold(f.lineId);
    const holdFn = s => {
      if (existing) return [L.holdAfterSample(existing, s)];
      if (s.decision === 'reject') return [L.newHold(s)];
      return [];
    };
    const alertObj = (sample.decision === 'warn' || sample.decision === 'reject') ? { t: tms, lineId: f.lineId, productId: f.productId, decision: sample.decision, crew: S.crew } : null;
    try {
      await DB.saveSampleBundle(sample, holdFn, alertObj);
    } catch (e) { return toast(t('saveFailed')); }
    S.operator = sample.operator; await DB.setConfig('operator', S.operator);
    await reloadData();
    const after = S.holds.find(h => h.openedBySample === sample.id || (h.samples || []).includes(sample.id));
    S.form = null;
    if (alertObj) raiseAlert(sample);
    else toast(t('saved') + (after && after.status === 'closed' ? ' — ' + t('holdClosed') : ''));
    if (after && after.status === 'closed' && alertObj) S.modal.holdClosed = true;
    S.view = 'home'; render();
  }

  // ----- Retenções -----
  function viewHolds() {
    const open = S.holds.filter(h => h.status !== 'closed').sort((a, b) => b.openedAt - a.openedAt);
    const closed = S.holds.filter(h => h.status === 'closed').sort((a, b) => b.closedAt - a.closedAt).slice(0, 20);
    return `<section class="card"><h2>${esc(t('openHolds'))}</h2>${open.length ? open.map(holdCard).join('') : `<p class="sub">${esc(t('noHolds'))}</p>`}</section>
      <section class="card"><h3>${esc(t('closedHolds'))}</h3>${closed.map(h => `<div class="rowitem"><b>${esc(lineName(h.lineId))}</b> · ${esc(prodName(h.productId))}<br><small>${esc(fmtDT(h.openedAt))} → ${esc(fmtDT(h.closedAt))} · ${esc(h.reasons.map(r => paramLabel(r, product(h.productId))).join(', '))}</small>
        ${(h.actions || []).map(a => `<div class="act"><small>${esc(fmtDT(a.at))} · ${esc(a.by)}: ${esc(a.text)}</small></div>`).join('')}</div>`).join('') || `<p class="sub">—</p>`}</section>`;
  }
  function holdCard(h) {
    const prod = product(h.productId);
    return `<div class="hold">
      <div class="row between"><b>${esc(lineName(h.lineId))} · ${esc(prodName(h.productId))}</b><span class="status d-reject">${esc(t('hs_' + h.status))}</span></div>
      <small>${esc(t('openedAt'))}: ${esc(fmtDT(h.openedAt))} · ${esc(t('reasons'))}: ${esc([...new Set(h.reasons)].map(r => r in { odour: 1, colour: 1, mould: 1, insects: 1, foreign: 1 } ? t('ph_' + r) : paramLabel(r, prod)).join(', '))}</small>
      ${(h.actions || []).map(a => `<div class="act"><small>${esc(fmtDT(a.at))} · ${esc(a.by)}: ${esc(a.text)}</small></div>`).join('')}
      ${h.status === 'action' ? `<p class="sub">${esc(t('awaitResample'))}</p>` : ''}
      <div class="holdform">
        <label class="fld">${esc(t('supervisor'))}<input data-hby="${h.id}"></label>
        <label class="fld">${esc(t('correctiveAction'))}<textarea rows="2" data-htext="${h.id}"></textarea></label>
        <label class="fld">${esc(t('pin'))}<input type="password" inputmode="numeric" data-hpin="${h.id}"></label>
        <button class="btn primary" data-haction="${h.id}">${esc(t('recordAction'))}</button>
      </div></div>`;
  }
  async function recordHoldAction(id) {
    const h = S.holds.find(x => x.id === id);
    const by = document.querySelector(`[data-hby="${id}"]`).value, text = document.querySelector(`[data-htext="${id}"]`).value, pin = document.querySelector(`[data-hpin="${id}"]`).value;
    if (!by.trim() || !text.trim()) return toast(t('needActionBy'));
    const r = await checkPin(pin);
    if (!r.ok) return toast(pinMsg(r));
    let nh;
    try { nh = L.addHoldAction(h, { at: Date.now(), by, text }); } catch (e) { return toast(t('saveFailed')); }
    await DB.put('holds', nh); await reloadData();
    toast(t('actionSaved')); render();
  }

  // ----- Registos -----
  function viewRecords() {
    const day = S.recDay || L.prodDay(Date.now());
    const [s, e] = L.prodDayRange(day);
    const superseded = new Set(S.samples.filter(x => x.correctsId).map(x => x.correctsId));
    const list = S.samples.filter(x => x.t >= s && x.t < e && (!S.recLine || x.lineId === S.recLine)).sort((a, b) => b.t - a.t);
    return `<section class="card"><h2>${esc(t('nav_records'))}</h2>
      <div class="grid2"><label class="fld">${esc(t('prodDay'))}<input type="date" id="recDay" value="${esc(day)}"></label>
      <label class="fld">${esc(t('line'))}<select id="recLine"><option value="">${esc(t('all'))}</option>${S.cfg.lines.map(l => `<option value="${esc(l.id)}" ${S.recLine === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label></div>
      <p class="sub">${esc(t('prodDayHint'))}</p></section>
      <section class="card">${list.length ? list.map(x => recItem(x, superseded.has(x.id))).join('') : `<p class="sub">${esc(t('noRecords'))}</p>`}</section>`;
  }
  function recItem(x, sup) {
    const prod = product(x.productId);
    const vals = Object.keys(x.values || {}).map(p => `${paramLabel(p, prod)}: ${fmtNum(x.values[p])}`).join(' · ');
    const open = S.detailId === x.id;
    return `<div class="rowitem ${sup ? 'superseded' : ''}" data-detail="${x.id}">
      <div class="row between"><span><b>${esc(fmtTime(x.t))}</b> · ${esc(lineName(x.lineId))} · ${esc(prodName(x.productId))}</span><span class="chip ${decCls(x.decision)}">${esc(decLabel(x.decision))}</span></div>
      <small>#${x.id} · ${esc(t('crew'))} ${esc(x.crew)} · ${esc(x.operator)}${x.correctsId ? ' · ' + esc(t('corrects', { id: x.correctsId })) : ''}${sup ? ' · ' + esc(t('supersededTag')) : ''}</small>
      <div><small>${esc(vals)}${x.physical ? ' · ' + esc(t('physical')) + ': ' + esc(Object.values(x.physical).includes('abn') ? t('abnormal') : t('normal')) : ''}</small></div>
      ${open ? `<div class="detail">${x.failures.length ? x.failures.map(f => `<div class="${decCls(f.decision)} pad">${esc(f.param in { odour: 1, colour: 1, mould: 1, insects: 1, foreign: 1 } ? t('ph_' + f.param) : paramLabel(f.param, prod))}: ${esc(f.value === 'abn' ? t('abnormal') : fmtNum(f.value))} — ${esc(decLabel(f.decision))}</div>`).join('') : ''}
        ${x.notes ? `<p><small>${esc(x.notes)}</small></p>` : ''}${x.correctionReason ? `<p><small>${esc(t('correctionReason'))}: ${esc(x.correctionReason)}</small></p>` : ''}
        ${!sup ? `<button class="btn ghost small" data-correct="${x.id}">${esc(t('correct'))}</button>` : ''}
        ${x.decision === 'warn' || x.decision === 'reject' ? `<a class="btn ghost small" target="_blank" rel="noopener" href="${esc(waLink(alertText(x)))}">${esc(t('sendWa'))}</a>` : ''}</div>` : ''}
    </div>`;
  }

  // ----- Relatório -----
  function viewReport() {
    const day = S.repDay || L.prodDay(Date.now() - 24 * 3600000);
    const r = L.dayReport(day, S.samples, S.holds, S.cfg);
    const gen = S.reports.filter(x => x.day === day);
    return `<section class="card"><h2>${esc(t('dailyReport'))}</h2>
      <label class="fld">${esc(t('prodDay'))}<input type="date" id="repDay" value="${esc(day)}"></label>
      <p class="sub">${esc(t('periodFromTo', { a: fmtDT(r.start), b: fmtDT(r.end) }))}</p>
      <div class="kpis"><div><b>${r.totals.n}</b><span>${esc(t('samples'))}</span></div><div class="d-accept"><b>${r.totals.accept}</b><span>${esc(t('dec_accept'))}</span></div>
      <div class="d-warn"><b>${r.totals.warn}</b><span>${esc(t('dec_warn'))}</span></div><div class="d-reject"><b>${r.totals.reject}</b><span>${esc(t('dec_reject'))}</span></div><div><b>${r.holds.length}</b><span>${esc(t('holds'))}</span></div></div>
      ${r.end > Date.now() ? `<p class="banner b-warn">${esc(t('dayNotFinished'))}</p>` : ''}
      <button class="btn primary big" id="genXlsx" ${r.totals.n ? '' : 'disabled'}>${esc(t('genExcel'))}</button>
      <a class="btn ghost" target="_blank" rel="noopener" href="${esc(waLink(reportText(r)))}">${esc(t('sendSummaryWa'))}</a>
      ${gen.length ? `<p class="sub">${esc(t('generatedAt', { h: fmtDT(gen[gen.length - 1].t) }))}</p>` : ''}</section>
      <section class="card"><h3>${esc(t('summary'))}</h3><div class="tablewrap"><table><thead><tr><th>${esc(t('line'))}</th><th>${esc(t('product'))}</th><th>${esc(t('shift'))}</th><th>${esc(t('crew'))}</th><th>n</th><th>✓</th><th>!</th><th>✗</th><th>${esc(t('p_moisture'))} ${esc(t('avg'))}</th><th>${esc(t('p_fat'))} ${esc(t('avg'))}</th><th>${esc(t('hoursChecked'))}</th></tr></thead><tbody>
      ${r.summary.map(g => `<tr><td>${esc(lineName(g.lineId))}</td><td>${esc(prodName(g.productId))}</td><td>${esc(t('shift_' + g.period))}</td><td>${esc(g.crews)}</td><td>${g.n}</td><td>${g.accept}</td><td>${g.warn}</td><td>${g.reject}</td><td>${esc(fmtNum(g.moisture.avg))}</td><td>${esc(fmtNum(g.fat.avg))}</td><td>${g.hoursWithMoisture}/12</td></tr>`).join('') || `<tr><td colspan="11">${esc(t('noRecords'))}</td></tr>`}
      </tbody></table></div></section>`;
  }
  function reportText(r) {
    return [t('waReportTitle', { d: r.day }), t('samples') + ': ' + r.totals.n + ' · ' + t('dec_accept') + ' ' + r.totals.accept + ' · ' + t('dec_warn') + ' ' + r.totals.warn + ' · ' + t('dec_reject') + ' ' + r.totals.reject,
      t('holds') + ': ' + r.holds.length,
      ...r.summary.map(g => `${lineName(g.lineId)} ${prodName(g.productId)} ${t('shift_' + g.period)} (${g.crews}): ${t('p_moisture')} ${fmtNum(g.moisture.avg)} · ${t('p_fat')} ${fmtNum(g.fat.avg)} · ✗${g.reject}`)].join('\n');
  }
  function buildWorkbook(r) {
    const XLSX = window.XLSX, wb = XLSX.utils.book_new();
    const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name.slice(0, 31));
    add(t('x_summary'), [[t('dailyReport') + ' — ' + t('prodDay') + ' ' + r.day], [t('periodFromTo', { a: fmtDT(r.start), b: fmtDT(r.end) })], [],
      [t('line'), t('product'), t('shift'), t('crew'), t('samples'), t('dec_accept'), t('dec_warn'), t('dec_reject'), t('dec_record'),
        t('p_moisture') + ' ' + t('avg'), t('p_moisture') + ' min', t('p_moisture') + ' max', t('p_fat') + ' ' + t('avg'), t('p_fat') + ' min', t('p_fat') + ' max',
        t('p_fibre') + ' ' + t('avg'), t('hoursChecked')],
      ...r.summary.map(g => [lineName(g.lineId), prodName(g.productId), t('shift_' + g.period), g.crews, g.n, g.accept, g.warn, g.reject, g.record,
        g.moisture.avg, g.moisture.min, g.moisture.max, g.fat.avg, g.fat.min, g.fat.max, g.fibre.avg, g.hoursWithMoisture + '/12'])]);
    const P = L.PARAMS;
    add(t('x_samples'), [['#', t('dateTime'), t('shift'), t('crew'), t('line'), t('product'), t('operator'), ...P.map(p => t('p_' + p)), t('physical'), t('decision'), t('failures'), t('notes'), t('correctionOf'), t('correctionReason')],
      ...r.samples.map(x => [x.id, fmtDT(x.t), t('shift_' + L.shiftOf(x.t).period), x.crew, lineName(x.lineId), prodName(x.productId), x.operator,
        ...P.map(p => x.values && x.values[p] !== undefined ? x.values[p] : ''),
        x.physical ? (Object.values(x.physical).includes('abn') ? t('abnormal') + ': ' + Object.keys(x.physical).filter(k => x.physical[k] === 'abn').map(k => t('ph_' + k)).join(', ') : t('normal')) : '',
        decLabel(x.decision), x.failures.map(f => (f.value === 'abn' ? t('ph_' + f.param) : paramLabel(f.param, product(x.productId)) + '=' + f.value) + ' (' + decLabel(f.decision) + ')').join('; '),
        x.notes || '', x.correctsId || '', x.correctionReason || ''])]);
    add(t('x_alerts'), [[t('dateTime'), t('line'), t('product'), t('crew'), t('decision'), t('failures')],
      ...r.alerts.map(x => [fmtDT(x.t), lineName(x.lineId), prodName(x.productId), x.crew, decLabel(x.decision), x.failures.map(f => anyLabel(f.param, product(x.productId)) + '=' + (f.value === 'abn' ? t('abnormal') : f.value)).join('; ')])]);
    add(t('x_holds'), [[t('line'), t('product'), t('openedAt'), t('closedAt'), t('durationMin'), t('status'), t('reasons'), t('actions')],
      ...r.holds.map(h => [lineName(h.lineId), prodName(h.productId), fmtDT(h.openedAt), h.closedAt ? fmtDT(h.closedAt) : '', h.durationMin, t('hs_' + h.status),
        [...new Set(h.reasons)].map(r => anyLabel(r, product(h.productId))).join(', '), (h.actions || []).map(a => fmtDT(a.at) + ' ' + a.by + ': ' + a.text).join(' | ')])]);
    const lim = [[t('product'), t('class'), t('parameter'), t('limits'), t('frequency'), t('source')]];
    products().forEach(p => L.PARAMS.forEach(k => { const m = p.limits[k]; if (m && (L.hasLimits(m) || m.freq !== 'optional')) lim.push([prodName(p.id), p.cls, paramLabel(k, p), limitText(m), t('fr_' + m.freq), m.src || '']); }));
    add(t('x_limits'), lim);
    const ch = S.limitChanges.filter(c => c.t >= r.start && c.t < r.end);
    add(t('x_limitChanges'), [[t('dateTime'), t('supervisor'), t('product'), t('parameter'), t('field'), t('oldValue'), t('newValue'), t('reason')],
      ...ch.map(c => [fmtDT(c.t), c.by, prodName(c.productId), anyLabel(c.param, product(c.productId)), c.field, c.old === null ? '' : c.old, c.new === null ? '' : c.new, c.reason])]);
    return wb;
  }
  async function genExcel() {
    const day = S.repDay || L.prodDay(Date.now() - 24 * 3600000);
    const r = L.dayReport(day, S.samples, S.holds, S.cfg);
    const wb = buildWorkbook(r);
    window.XLSX.writeFile(wb, day + '_CQ-Moagem-' + S.cfg.millType + '_Relatorio-Diario.xlsx');
    await DB.add('reports', { day, t: Date.now() }); await reloadData(); render();
  }

  // ----- Definições -----
  function viewSettings() {
    return `<section class="card"><h2>${esc(t('nav_settings'))}</h2>
      <label class="fld">${esc(t('language'))}<select id="langSel"><option value="pt" ${S.lang === 'pt' ? 'selected' : ''}>Português</option><option value="en" ${S.lang === 'en' ? 'selected' : ''}>English</option></select></label>
      <label class="fld">${esc(t('millType'))}<select id="millSel">${L.MILL_TYPES.map(m => `<option value="${m}" ${S.cfg.millType === m ? 'selected' : ''}>${esc(t('mill_' + m))}${S.cfg.products[m] && S.cfg.products[m].length ? '' : ' — ' + esc(t('notConfiguredShort'))}</option>`).join('')}</select></label>
      </section>
      <section class="card"><h3>${esc(t('supervisorPin'))}</h3>
        <p class="sub">${esc(S.pinSet ? t('pinIsSet') : t('pinNotSet'))} ${esc(t('pinNote'))}</p>
        ${S.pinSet ? `<label class="fld">${esc(t('currentPin'))}<input type="password" inputmode="numeric" id="pinOld"></label>` : ''}
        <label class="fld">${esc(t('newPin'))}<input type="password" inputmode="numeric" id="pinNew"></label>
        <label class="fld">${esc(t('repeatPin'))}<input type="password" inputmode="numeric" id="pinNew2"></label>
        <button class="btn primary" id="savePin">${esc(t('savePin'))}</button></section>
      <section class="card"><h3>${esc(t('qualityLimits'))}</h3><p class="sub">${esc(t('limitsNote'))}</p>
        <button class="btn" id="openLimits">${esc(t('editLimits'))}</button></section>
      ${PU.settingsCard()}
      <section class="card"><h3>${esc(t('lines'))}</h3>
        ${S.cfg.lines.map(l => `<label class="fld">${esc(l.id)}<input data-linename="${esc(l.id)}" value="${esc(l.name)}"></label>`).join('')}
        <label class="fld">${esc(t('graceMin'))}<input inputmode="numeric" id="graceMin" value="${esc(S.cfg.graceMin)}"></label>
        <label class="fld">${esc(t('pin'))}<input type="password" inputmode="numeric" id="linesPin"></label>
        <button class="btn" id="saveLines">${esc(t('save'))}</button></section>
      <section class="card"><h3>${esc(t('alerts'))}</h3><p class="sub">${esc(t('alertsNote'))}</p>
        <p class="sub">${esc(t('notifStatus'))}: <b>${esc('Notification' in window ? Notification.permission : t('unsupported'))}</b></p>
        <button class="btn" id="askNotif">${esc(t('enableNotif'))}</button> <button class="btn ghost" id="testAlert">${esc(t('testAlert'))}</button></section>
      <section class="card"><h3>${esc(t('backup'))}</h3><p class="sub">${esc(t('backupNote'))}</p>
        <button class="btn" id="exportBk">${esc(t('exportBackup'))}</button>
        <label class="btn ghost">${esc(t('importBackup'))}<input type="file" id="importBk" accept="application/json" hidden></label></section>
      <section class="card"><p class="sub">${esc(t('about', { v: L.VERSION }))}</p></section>`;
  }
  function viewLimits() {
    const pid = S.limitsProduct || products()[0].id;
    const prod = product(pid);
    if (!S.limitsDraft || S.limitsDraft.pid !== pid) S.limitsDraft = { pid, lim: JSON.parse(JSON.stringify(prod.limits)) };
    const D = S.limitsDraft.lim;
    const show = L.PARAMS.filter(p => !((p === 'granA' || p === 'granB') && !(prod.limits[p] && prod.limits[p].sieve)));
    return `<section class="card"><h2>${esc(t('qualityLimits'))}</h2>
      <label class="fld">${esc(t('product'))}<select id="limProd">${products().map(p => `<option value="${esc(p.id)}" ${p.id === pid ? 'selected' : ''}>${esc(prodName(p.id))} (${esc(p.cls)})</option>`).join('')}</select></label>
      <p class="sub">${esc(t('limitsHelp'))}</p></section>
      ${show.map(p => { const m = D[p] || {}; return `<details class="card lim-ed" ${L.hasLimits(prod.limits[p]) ? 'open' : ''}><summary><b>${esc(paramLabel(p, prod))}</b> <small>${esc(L.UNITS[p])} · ${esc(limitText(prod.limits[p]))}</small></summary>
        <p class="sub">${esc(t('now'))}: ${esc(limitText(prod.limits[p]))}${prod.limits[p].src ? ' · ' + esc(prod.limits[p].src) : ''}</p>
        <div class="grid3">
          <label class="fld">${esc(t('min'))} (${m.loOp === 'gt' ? '>' : '≥'})<input inputmode="decimal" data-lim="${p}|lo" value="${esc(fmtNum(m.lo))}"></label>
          <label class="fld">${esc(t('ifBelow'))}<select data-lim="${p}|loAct"><option value="warn" ${m.loAct !== 'reject' ? 'selected' : ''}>${esc(t('dec_warn'))}</option><option value="reject" ${m.loAct === 'reject' ? 'selected' : ''}>${esc(t('dec_reject'))}</option></select></label>
          <label class="fld">${esc(t('warnBelowLbl'))}<input inputmode="decimal" data-lim="${p}|warnLo" value="${esc(fmtNum(m.warnLo))}"></label>
          <label class="fld">${esc(t('max'))} (${m.hiOp === 'lt' ? '<' : '≤'})<input inputmode="decimal" data-lim="${p}|hi" value="${esc(fmtNum(m.hi))}"></label>
          <label class="fld">${esc(t('ifAbove'))}<select data-lim="${p}|hiAct"><option value="reject" ${m.hiAct !== 'warn' ? 'selected' : ''}>${esc(t('dec_reject'))}</option><option value="warn" ${m.hiAct === 'warn' ? 'selected' : ''}>${esc(t('dec_warn'))}</option></select></label>
          <label class="fld">${esc(t('warnAboveLbl'))}<input inputmode="decimal" data-lim="${p}|warnHi" value="${esc(fmtNum(m.warnHi))}"></label>
          <label class="fld">${esc(t('frequency'))}<select data-lim="${p}|freq">${L.FREQS.map(fr => `<option value="${fr}" ${m.freq === fr ? 'selected' : ''}>${esc(t('fr_' + fr))}</option>`).join('')}</select></label>
        </div></details>`; }).join('')}
      <section class="card"><label class="fld req">${esc(t('supervisor'))}<input id="limBy"></label>
        <label class="fld req">${esc(t('reason'))}<input id="limReason"></label>
        <label class="fld req">${esc(t('pin'))}<input type="password" inputmode="numeric" id="limPin"></label>
        <button class="btn primary big" id="saveLimits">${esc(t('saveLimits'))}</button>
        <button class="btn ghost" data-nav="settings">${esc(t('cancel'))}</button></section>`;
  }
  async function saveLimits() {
    const pid = S.limitsDraft.pid, prod = product(pid);
    const by = $('#limBy').value.trim(), reason = $('#limReason').value.trim();
    if (!by || !reason) return toast(t('needByReason'));
    const newLim = JSON.parse(JSON.stringify(prod.limits));
    const errs = [];
    document.querySelectorAll('[data-lim]').forEach(el => {
      const [p, f] = el.dataset.lim.split('|');
      if (f === 'loAct' || f === 'hiAct' || f === 'freq') { newLim[p][f] = el.value; return; }
      const n = L.num(el.value);
      if (n !== null && isNaN(n)) { errs.push(p); el.classList.add('bad'); return; }
      newLim[p][f] = n;
      if (f === 'lo' && n !== null && !newLim[p].loOp) newLim[p].loOp = 'ge';
      if (f === 'hi' && n !== null && !newLim[p].hiOp) newLim[p].hiOp = 'le';
    });
    L.PARAMS.forEach(p => { const e = L.validateLimit(newLim[p]); if (e.length) errs.push(p + ' (' + e.join(', ') + ')'); });
    if (errs.length) return toast(t('limitErrors') + ': ' + errs.map(e => e.replace(/^(\w+)/, m => t('p_' + m))).join('; '));
    const changes = [];
    L.PARAMS.forEach(p => L.limitDiff(prod.limits[p], newLim[p]).forEach(d => changes.push({ productId: pid, param: p, field: d.field, old: d.old, new: d.new })));
    if (!changes.length) return toast(t('noChanges'));
    const r = await checkPin($('#limPin').value);
    if (!r.ok) return toast(pinMsg(r));
    const now = Date.now();
    L.PARAMS.forEach(p => { if (L.limitDiff(prod.limits[p], newLim[p]).length) newLim[p].src = t('changedBy', { by, d: fmtDT(now).slice(0, 10) }); });
    const cfg = JSON.parse(JSON.stringify(S.cfg));
    cfg.products[cfg.millType].find(p => p.id === pid).limits = newLim;
    for (const c of changes) await DB.add('limitChanges', Object.assign({ t: now, by, reason }, c));
    await DB.setConfig('cfg', cfg); S.cfg = cfg; S.limitsDraft = null; await reloadData();
    toast(t('limitsSaved', { n: changes.length })); S.view = 'settings'; render();
  }

  // ---------- modal ----------
  function modal() {
    if (S.modal.type === 'alert') {
      const s = S.samples.find(x => x.id === S.modal.sampleId); if (!s) return '';
      const prod = product(s.productId);
      return `<div class="overlay"><div class="modal ${decCls(s.decision)}-border">
        <h2 class="${decCls(s.decision)} pad">${esc(decLabel(s.decision).toUpperCase())}</h2>
        <p><b>${esc(lineName(s.lineId))}</b> · ${esc(prodName(s.productId))} · ${esc(fmtTime(s.t))}</p>
        ${s.failures.map(f => `<div>• ${esc(f.value === 'abn' ? t('ph_' + f.param) + ': ' + t('abnormal') : paramLabel(f.param, prod) + ': ' + fmtNum(f.value))} — ${esc(decLabel(f.decision))}${f.value !== 'abn' ? ' <small>(' + esc(limitText(prod.limits[f.param])) + ')</small>' : ''}</div>`).join('')}
        <p class="${s.decision === 'reject' ? 'txt-reject' : ''}"><b>${esc(s.decision === 'reject' ? t('holdMsg') : t('warnMsg'))}</b></p>
        ${S.modal.holdClosed ? `<p>${esc(t('holdClosed'))}</p>` : ''}
        <a class="btn primary big" target="_blank" rel="noopener" href="${esc(waLink(alertText(s)))}">${esc(t('sendWa'))}</a>
        <button class="btn ghost" id="closeModal">${esc(t('close'))}</button></div></div>`;
    }
    return '';
  }

  // ---------- eventos ----------
  document.addEventListener('click', async e => {
    const pel = e.target.closest(PU.CLICK_SEL);
    if (pel) return PU.onClick(pel);
    const el = e.target.closest('[data-nav],[data-newsample],[data-run],[data-phys],[data-haction],[data-detail],[data-correct],[data-repday],#saveSample,#physAllOk,#closeModal,#genXlsx,#savePin,#openLimits,#saveLimits,#saveLines,#askNotif,#testAlert,#exportBk');
    if (!el) return;
    if (el.dataset.nav) { S.view = el.dataset.nav; S.modal = null; if (S.view === 'prodset') S.prodDraft = null; if (S.view === 'sample' && !S.form) newForm(); render(); window.scrollTo(0, 0); return; }
    if (el.dataset.repday) { S.repDay = el.dataset.repday; S.view = 'report'; render(); return; }
    if (el.dataset.newsample) { newForm(el.dataset.newsample); S.view = 'sample'; render(); window.scrollTo(0, 0); return; }
    if (el.dataset.run) return toggleRun(el.dataset.run);
    if (el.dataset.phys) { S.form.physical[el.dataset.phys] = el.dataset.pv; const y = window.scrollY; render(); window.scrollTo(0, y); return; }
    if (el.dataset.haction) return recordHoldAction(Number(el.dataset.haction));
    if (el.dataset.correct) { e.stopPropagation(); newForm(null, Number(el.dataset.correct)); S.view = 'sample'; render(); window.scrollTo(0, 0); return; }
    if (el.dataset.detail) { if (e.target.closest('a,button')) return; const id = Number(el.dataset.detail); S.detailId = S.detailId === id ? null : id; render(); return; }
    switch (el.id) {
      case 'saveSample': return saveSample();
      case 'physAllOk': L.PHYSICAL.forEach(k => { S.form.physical[k] = 'ok'; }); { const y = window.scrollY; render(); window.scrollTo(0, y); } return;
      case 'closeModal': S.modal = null; render(); return;
      case 'genXlsx': return genExcel();
      case 'savePin': return savePin();
      case 'openLimits': if (!products().length) return toast(t('notConfigured')); S.view = 'limits'; S.limitsDraft = null; render(); return;
      case 'saveLimits': return saveLimits();
      case 'saveLines': return saveLines();
      case 'askNotif': if ('Notification' in window) { await Notification.requestPermission(); render(); } else toast(t('unsupported')); return;
      case 'testAlert': beep(); if (navigator.vibrate) navigator.vibrate([300]); notify(t('appTitle'), t('testAlert'), 'test'); return;
      case 'exportBk': return exportBackup();
    }
  });
  document.addEventListener('input', e => {
    const el = e.target;
    if (PU.onInput(el)) return;
    if (el.dataset.val && S.form) { S.form.values[el.dataset.val] = el.value; updateLive(); return; }
    if (!S.form) return;
    if (el.id === 'f_op') S.form.operator = el.value;
    if (el.id === 'f_notes') S.form.notes = el.value;
    if (el.id === 'f_reason') S.form.reason = el.value;
    if (el.id === 'f_time') S.form.time = el.value;
  });
  document.addEventListener('change', async e => {
    const el = e.target;
    if (PU.onChange(el)) return;
    if (el.id === 'crewSel') { S.crew = el.value || null; await DB.setConfig('crew', S.crew); render(); return; }
    if (el.dataset.lineprod) return changeLineProduct(el.dataset.lineprod, el.value, el);
    if (el.id === 'f_line') { S.form.lineId = el.value; const st = S.lineState[el.value]; if (st && st.productId) S.form.productId = st.productId; render(); return; }
    if (el.id === 'f_prod') { S.form.productId = el.value; render(); return; }
    if (el.id === 'recDay') { S.recDay = el.value; render(); return; }
    if (el.id === 'recLine') { S.recLine = el.value; render(); return; }
    if (el.id === 'repDay') { S.repDay = el.value; render(); return; }
    if (el.id === 'limProd') { S.limitsProduct = el.value; S.limitsDraft = null; render(); return; }
    if (el.id === 'langSel') { S.lang = el.value; await DB.setConfig('lang', S.lang); render(); return; }
    if (el.id === 'millSel') { const cfg = Object.assign({}, S.cfg, { millType: el.value }); await DB.setConfig('cfg', cfg); S.cfg = cfg; S.form = null; render(); return; }
    if (el.id === 'importBk') return importBackup(el.files[0]);
  });

  async function toggleRun(lineId) {
    const st = Object.assign({}, S.lineState[lineId] || {});
    if (!st.running && !st.productId) return toast(t('selectProductFirst'));
    st.running = !st.running; st.since = Date.now();
    S.lineState = Object.assign({}, S.lineState, { [lineId]: st });
    await DB.setConfig('lineState', S.lineState); render();
  }
  async function changeLineProduct(lineId, pid, el) {
    const st = Object.assign({}, S.lineState[lineId] || {});
    if (st.running && st.productId && pid !== st.productId && !confirm(t('confirmChange'))) { el.value = st.productId; return; }
    st.productId = pid || null; st.since = Date.now();
    if (!pid) st.running = false;
    S.lineState = Object.assign({}, S.lineState, { [lineId]: st });
    await DB.setConfig('lineState', S.lineState); render();
  }
  async function savePin() {
    const n1 = $('#pinNew').value, n2 = $('#pinNew2').value;
    if (!/^\d{4,8}$/.test(n1)) return toast(t('pinFormat'));
    if (n1 !== n2) return toast(t('pinMismatch'));
    if (S.pinSet) { const r = await checkPin($('#pinOld').value); if (!r.ok) return toast(pinMsg(r)); }
    await setPin(n1); S.pinSet = true; toast(t('pinSaved')); render();
  }
  async function saveLines() {
    const r = await checkPin($('#linesPin').value);
    if (!r.ok) return toast(pinMsg(r));
    const g = L.num($('#graceMin').value);
    if (g === null || isNaN(g) || g < 0 || g > 60) return toast(t('graceInvalid'));
    const cfg = JSON.parse(JSON.stringify(S.cfg));
    cfg.lines.forEach(l => { const v = document.querySelector(`[data-linename="${l.id}"]`).value.trim(); if (v) l.name = v; });
    cfg.graceMin = g;
    await DB.setConfig('cfg', cfg); S.cfg = cfg; toast(t('saved')); render();
  }
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  async function exportBackup() {
    const o = await DB.exportAll();
    download(L.ymd(new Date()) + '_CQ-Moagem_Copia-Seguranca.json', JSON.stringify(o), 'application/json');
  }
  async function importBackup(file) {
    if (!file) return;
    let o;
    try { o = JSON.parse(await file.text()); } catch (e) { return toast(t('invalidBackup')); }
    if (!L.validBackup(o) || !window.Prod.validProdBackup(o)) return toast(t('invalidBackup'));
    if (!confirm(t('confirmImport'))) return;
    await exportBackup();                 // cópia de segurança antes de restaurar
    try { await DB.importAll(o); } catch (e) { return toast(t('invalidBackup')); }
    await load(); toast(t('imported')); render();
  }

  // ---------- arranque ----------
  async function start() {
    PU = window.ProdUI({ S, t, esc, DB, L, render, toast, checkPin, pinMsg, fmtDT, fmtTime, fmtNum, localInput, products, product, prodName,
      lineName, lineStatus, anyLabel, decLabel, decCls, waLink });
    await load(); render();
    setInterval(() => { const c = $('#clock'); if (c) c.textContent = fmtTime(Date.now()); }, 15000);
    setInterval(checkOverdue, 60000);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  window.QCApp = { S, render, reload: async () => { await load(); render(); } };
  start();
})();
