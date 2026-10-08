/* Moagem — Produção: interface (ordens de produção, diário de turno, silos de produto, definições).
 * Criada por app.js com ProdUI(ctx). Regras em js/prod.js (window.Prod). */
window.ProdUI = function (C) {
  'use strict';
  const { S, t, esc, DB, L } = C;
  const P = window.Prod;
  const $ = s => document.querySelector(s);
  const now = () => Date.now();
  const isNum = x => typeof x === 'number' && isFinite(x);
  const fmtKg = n => isNum(n) ? String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : '—';
  const keepScroll = () => { const y = window.scrollY; C.render(); window.scrollTo(0, y); };
  const STATUS_CLS = { running: 'd-warn', done: 'd-accept', cancelled: 'd-record' };
  const JOB_ST = { running: 1, done: 1, cancelled: 1 };
  const CAT = new Set(P.ISSUE_CATS), ACT = new Set(P.ACT_TYPES);

  // ---------- dados ----------
  async function load() {
    S.cfgP = (await DB.getConfig('cfgP')) || P.defaultProdConfig();
    S.deviceId = await DB.getConfig('deviceId');
    if (!S.deviceId) {
      S.deviceId = 'd' + Array.from(crypto.getRandomValues(new Uint8Array(4))).map(x => x.toString(16).padStart(2, '0')).join('');
      await DB.setConfig('deviceId', S.deviceId);
    }
    await reload();
  }
  async function reload() {
    S.jobs = await DB.all('jobs');
    S.binEvents = await DB.all('binEvents');
    S.shiftLog = await DB.all('shiftLog');
    S.siloSnaps = await DB.all('siloSnapshots');
    S.prodChanges = await DB.all('prodChanges');
  }
  let seq = 0;
  const newUid = () => P.uid(S.deviceId, now(), (++seq).toString(36) + Math.random().toString(36).slice(2, 6));
  const base = tms => ({ uid: newUid(), deviceId: S.deviceId, createdAt: now(), crew: S.crew, period: L.shiftOf(tms).period, prodDay: L.prodDay(tms) });
  const snapshot = () => (S.siloSnaps || []).slice().sort((a, b) => b.importedAt - a.importedAt)[0] || null;
  const runningJob = lineId => (S.jobs || []).find(j => j.status === 'running' && j.lineId === lineId);
  const lineIds = () => S.cfg.lines.map(l => l.id);
  const binById = id => S.cfgP.bins.find(b => b.id === id);
  const prodOrDash = id => id ? C.prodName(id) : '—';

  // ---------- vista principal ----------
  function view() {
    const tab = S.prodTab || 'jobs';
    const tabs = ['jobs', 'log', 'bins'].map(k => `<button class="btn ${tab === k ? 'primary' : 'ghost'} small" data-ptab="${k}">${esc(t('ptab_' + k))}</button>`).join(' ');
    const body = tab === 'log' ? viewLog() : tab === 'bins' ? viewBins() : viewJobs();
    return `<section class="card"><h2>${esc(t('nav_prod'))}</h2><div class="row">${tabs}</div></section>${body}`;
  }

  // ---------- ordens de produção ----------
  function snapCard() {
    const sn = snapshot();
    const sh = L.shiftOf(now());
    const exp = sn ? (sn.exportedAt ? Date.parse(sn.exportedAt) : sn.importedAt) : null;
    return `<section class="card"><h3>${esc(t('grainStock'))}</h3>
      ${sn ? `<p class="sub">${esc(t('snapFrom', { e: C.fmtDT(exp), i: C.fmtDT(sn.importedAt) }))}</p>
        ${exp < sh.start ? `<div class="banner b-warn">${esc(t('snapOld'))}</div>` : ''}` : `<div class="banner b-warn">${esc(t('snapNone'))}</div>`}
      <p class="sub">${esc(t('snapHow'))}</p>
      <label class="btn ghost">${esc(t('importSilos'))}<input type="file" id="importSilos" accept="application/json" hidden></label></section>`;
  }
  function viewJobs() {
    const running = (S.jobs || []).filter(j => j.status === 'running').sort((a, b) => a.lineId < b.lineId ? -1 : 1);
    const closed = (S.jobs || []).filter(j => j.status !== 'running').sort((a, b) => b.closedAt - a.closedAt).slice(0, 10);
    return snapCard() +
      (S.jobForm ? jobFormView() : `<section class="card"><button class="btn primary big" data-pact="newjob">＋ ${esc(t('newJob'))}</button></section>`) +
      `<section class="card"><h3>${esc(t('jobsRunning'))}</h3>${running.length ? running.map(jobCard).join('') : `<p class="sub">${esc(t('noJobs'))}</p>`}</section>
      <section class="card"><h3>${esc(t('jobsClosed'))}</h3>${closed.length ? closed.map(jobCard).join('') : '<p class="sub">—</p>'}</section>`;
  }
  function allocText(alloc) { return (alloc || []).map(a => esc(a.silo) + ' ' + fmtKg(a.kg) + ' kg').join(' → '); }
  function jobCard(j) {
    const st = JOB_ST[j.status] ? j.status : 'running';
    const qc = j.status === 'running' ? qcForJob(j) : '';
    const closing = S.closeJob === j.uid;
    return `<div class="hold job">
      <div class="row between"><b>${esc(C.lineName(j.lineId))} · ${esc(C.prodName(j.productId))}</b><span class="status ${STATUS_CLS[st]}">${esc(t('js_' + st))}</span></div>
      <small>${esc(t('startedBy', { d: C.fmtDT(j.startedAt), by: j.leader, crew: j.crew || '—' }))}${j.closedAt ? ' · ' + esc(t('closedBy', { d: C.fmtDT(j.closedAt), by: j.closedBy })) : ''}</small>
      <div class="kv"><span>${esc(t('grainToMill'))}</span><b>${fmtKg(j.grainKg)} kg</b></div>
      <div class="kv"><span>${esc(t('fromSilos'))}</span><b>${allocText(j.alloc)}</b></div>
      <div class="kv"><span>${esc(t('toBins'))}</span><b>${esc((j.bins || []).join(', '))}</b></div>
      <div class="kv"><span>${esc(t('moistureFromTo'))}</span><b>${esc(C.fmtNum(j.m0))} → ${esc(C.fmtNum(j.m1))} % · ${esc(t('impurities'))} ${esc(C.fmtNum(j.impurities))} %</b></div>
      <div class="kv"><span>${esc(t('water'))}</span><b>${fmtKg(j.waterLh)} L/h · ${esc(t('total'))} ${fmtKg(j.waterL)} L</b></div>
      <div class="kv"><span>${esc(t('expectedProduct'))}</span><b>${isNum(j.expectedKg) ? fmtKg(j.expectedKg) + ' kg (' + esc(C.fmtNum(j.extraction)) + ' %)' : esc(t('extractionNotSet'))}</b></div>
      ${j.status === 'done' && isNum(j.actualKg) ? `<div class="kv"><span>${esc(t('actualGrain'))}</span><b>${fmtKg(j.actualKg)} kg</b></div>` : ''}
      ${j.closeNote ? `<p><small>${esc(j.closeNote)}</small></p>` : ''}
      ${qc}
      ${j.status === 'running' && !closing ? `<button class="btn ghost small" data-closejob="${esc(j.uid)}">${esc(t('closeJob'))}</button>` : ''}
      ${closing ? `<div class="holdform">
        <label class="fld">${esc(t('closeAs'))}<select id="cj_status"><option value="done">${esc(t('js_done'))}</option><option value="cancelled">${esc(t('js_cancelled'))}</option></select></label>
        <label class="fld">${esc(t('actualGrain'))} (kg) <small>${esc(t('optional'))}</small><input inputmode="decimal" id="cj_kg"></label>
        <label class="fld req">${esc(t('shiftLeader'))}<input id="cj_by" value="${esc(S.operator)}"></label>
        <label class="fld">${esc(t('notes'))}<textarea id="cj_note" rows="2"></textarea></label>
        <button class="btn primary" data-pact="closejob">${esc(t('closeJob'))}</button> <button class="btn ghost" data-pact="cancelclose">${esc(t('cancel'))}</button>
      </div>` : ''}
    </div>`;
  }
  // Alertas do CQ para a linha desde o início da ordem (o CQ só envia alertas para a produção)
  function qcForJob(j) {
    const status = C.lineStatus(j.lineId);
    const cls = { hold: 'd-reject', warn: 'd-warn', ok: 'd-accept', stopped: 'd-record', nodata: 'd-record' }[status] || 'd-record';
    const from = j.startedAt - j.startedAt % 60000;   // hora das amostras só tem minutos
    const al = L.effective(S.samples).filter(s => s.lineId === j.lineId && s.t >= from && (s.decision === 'warn' || s.decision === 'reject'))
      .sort((a, b) => b.t - a.t).slice(0, 3);
    return `<div class="due"><div class="sub">${esc(t('qcAlerts'))} <span class="chip ${cls}">${esc(t('st_' + status))}</span></div>
      ${al.map(s => `<div class="${C.decCls(s.decision)} pad"><small>${esc(C.fmtTime(s.t))} · ${esc(C.prodName(s.productId))} · ${esc(s.failures.map(f => C.anyLabel(f.param, C.product(s.productId)) + ' ' + (f.value === 'abn' ? t('abnormal') : C.fmtNum(f.value))).join(', '))} → ${esc(C.decLabel(s.decision))}</small></div>`).join('') || `<small class="sub">${esc(t('noQcAlerts'))}</small>`}</div>`;
  }

  // ----- formulário da ordem -----
  function newJobForm() {
    const line = S.cfg.lines.find(l => !runningJob(l.id));
    S.jobForm = { productId: '', lineId: line ? line.id : '', grainKg: '', silos: [], bins: [], m0: '', impurities: '', m1: '', feedTph: '', silosConfirmed: false, leader: S.operator };
  }
  const ctxFor = () => ({ cfgP: S.cfgP, millType: S.cfg.millType, snapshot: snapshot(), jobs: S.jobs, binEvents: S.binEvents, now: now(), shiftStart: L.shiftOf(now()).start });
  function jobFormView() {
    const f = S.jobForm, sn = snapshot();
    const recipe = S.cfgP.recipes[f.productId];
    const tphDef = f.lineId ? P.defaultFeedTph(S.cfgP, f.lineId) : null;
    const siloRows = sn ? sn.silos.map(s => {
      const idx = f.silos.indexOf(s.id);
      const avail = P.availableKg(sn, S.jobs, s.id);
      const fit = P.recipeSet(recipe) ? P.recipeFit(recipe, s, S.cfg.millType) : null;
      const red = s.openEvent && isNum(s.openLevel) && s.openLevel >= 4;
      const chip = !f.productId ? '' : !fit ? `<span class="chip d-record">${esc(t('je_recipe_not_set'))}</span>`
        : fit.ok ? (red ? `<span class="chip d-reject">${esc(t('siloRed'))}</span>` : `<span class="chip d-accept">${esc(t('compatible'))}</span>`)
        : `<span class="chip d-reject">${esc(t('why_' + fit.why))}</span>`;
      return `<button class="pick ${idx >= 0 ? 'on' : ''}" data-jsilo="${esc(s.id)}">${idx >= 0 ? `<i class="ord">${idx + 1}</i>` : ''}<b>${esc(s.id)}</b>
        <small>${esc(s.cereal)} ${esc(s.colour)} · ${esc(t('g_' + (P.SILO_GRADES.indexOf(s.grade) >= 0 ? s.grade : 'none')))} · ${fmtKg(avail)} kg${s.openEvent ? ' · ⚠' : ''}</small>${chip}</button>`;
    }).join('') : `<p class="sub">${esc(t('snapNone'))}</p>`;
    const lineBins = S.cfgP.bins.filter(b => !f.lineId || b.lines.indexOf(f.lineId) >= 0);
    const binRows = lineBins.map(b => {
      const st = P.binState(b.id, S.binEvents);
      const on = f.bins.indexOf(b.id) >= 0;
      const clash = st.productId && f.productId && st.productId !== f.productId;
      return `<button class="pick ${on ? 'on' : ''}" data-jbin="${esc(b.id)}"><b>${esc(b.id)}</b><small>${esc(t('fedBy'))} ${esc(b.lines.join('/'))}</small>
        <span class="chip ${clash ? 'd-reject' : st.productId ? 'd-warn' : 'd-accept'}">${esc(st.productId ? C.prodName(st.productId) : t('binEmpty'))}</span></button>`;
    }).join('');
    return `<section class="card"><h2>${esc(t('newJob'))}</h2>
      <div class="grid2">
        <label class="fld req">${esc(t('product'))}<select data-jf="productId"><option value="">—</option>${C.products().map(p => `<option value="${esc(p.id)}" ${f.productId === p.id ? 'selected' : ''}>${esc(C.prodName(p.id))}</option>`).join('')}</select></label>
        <label class="fld req">${esc(t('line'))}<select data-jf="lineId"><option value="">—</option>${S.cfg.lines.map(l => `<option value="${esc(l.id)}" ${f.lineId === l.id ? 'selected' : ''}>${esc(l.name)}${runningJob(l.id) ? ' (' + esc(t('busy')) + ')' : ''}</option>`).join('')}</select></label>
        <label class="fld req">${esc(t('grainToMill'))} (kg)<input inputmode="decimal" data-jfi="grainKg" value="${esc(f.grainKg)}"></label>
        <label class="fld">${esc(t('feedRate'))} (t/h)<input inputmode="decimal" data-jfi="feedTph" value="${esc(f.feedTph)}" placeholder="${esc(tphDef ? C.fmtNum(Math.round(tphDef * 100) / 100) : '')}"></label>
      </div>
      <p class="sub">${esc(t('feedRateHint'))}</p>
      ${f.productId && !P.recipeSet(recipe) ? `<div class="banner b-reject">${esc(t('je_recipe_not_set'))}</div>` : ''}
      ${f.productId && P.recipeSet(recipe) ? `<p class="sub">${esc(t('recipeIs', { c: recipe.colours.join('/'), g: recipe.grades.map(g => t('g_' + g)).join('/') }))}</p>` : ''}
    </section>
    <section class="card"><h3>${esc(t('rawMaterial'))}</h3><p class="sub">${esc(t('silosOrder'))}</p><div class="picks">${siloRows}</div>
      <label class="chk"><input type="checkbox" data-jf="silosConfirmed" ${f.silosConfirmed ? 'checked' : ''}> ${esc(t('confirmSilos'))}</label></section>
    <section class="card"><h3>${esc(t('grainSpecs'))}</h3>
      <div class="grid3">
        <label class="fld req">${esc(t('m0'))} (%)<input inputmode="decimal" data-jfi="m0" value="${esc(f.m0)}"></label>
        <label class="fld req">${esc(t('impurities'))} (%)<input inputmode="decimal" data-jfi="impurities" value="${esc(f.impurities)}"></label>
        <label class="fld req">${esc(t('m1'))} (%)<input inputmode="decimal" data-jfi="m1" value="${esc(f.m1)}"></label>
      </div>
      <p class="sub">${esc(t('waterHint'))}</p></section>
    <section class="card"><h3>${esc(t('toBins'))}</h3>${f.lineId ? '' : `<p class="sub">${esc(t('pickLineFirst'))}</p>`}<div class="picks">${binRows}</div>
      <p class="sub">${esc(t('binSourceNote', { s: S.cfgP.binSource || '' }))}</p></section>
    <section class="card">
      <label class="fld req">${esc(t('shiftLeader'))}<input data-jfi="leader" value="${esc(f.leader)}"></label>
      <div id="jobCheck">${jobCheckHtml()}</div>
      <button class="btn primary big" data-pact="startjob">${esc(t('startJob'))}</button>
      <button class="btn ghost" data-pact="canceljob">${esc(t('cancel'))}</button></section>`;
  }
  function errText(e) {
    const v = Object.assign({}, e);
    if (e.field) v.field = t('f_' + e.field);
    if (e.current) v.current = C.prodName(e.current);
    if (isNum(e.short)) v.short = fmtKg(e.short);
    if (isNum(e.need)) v.need = fmtKg(e.need);
    if (isNum(e.max)) v.max = fmtKg(e.max);
    if (e.code === 'silo_incompatible') return t('je_silo_incompatible', { silo: e.silo, why: t('why_' + e.why) });
    return t('je_' + e.code, v);
  }
  function jobCheckHtml() {
    const r = P.validateJob(S.jobForm, ctxFor());
    const c = r.calc;
    const rows = [];
    if (isNum(c.waterL)) rows.push(`<div class="kv"><span>${esc(t('waterTotal'))}</span><b>${fmtKg(c.waterL)} L</b></div>`);
    if (isNum(c.waterLh)) rows.push(`<div class="kv"><span>${esc(t('waterRate'))}</span><b class="${c.waterLh > S.cfgP.dampenerMaxLh ? 'txt-reject' : ''}">${fmtKg(c.waterLh)} L/h <small>(${esc(t('max'))} ${fmtKg(S.cfgP.dampenerMaxLh)})</small></b></div>`);
    if (isNum(c.hours)) rows.push(`<div class="kv"><span>${esc(t('duration'))}</span><b>${esc(C.fmtNum(c.hours))} h @ ${esc(C.fmtNum(c.feedTph))} t/h</b></div>`);
    if (isNum(c.expectedKg)) rows.push(`<div class="kv"><span>${esc(t('expectedProduct'))}</span><b>${fmtKg(c.expectedKg)} kg (${esc(C.fmtNum(c.extraction))} %)</b></div>`);
    if (c.alloc && c.alloc.length) rows.push(`<div class="kv"><span>${esc(t('fromSilos'))}</span><b>${allocText(c.alloc)}</b></div>`);
    return `${rows.join('')}
      ${r.errors.length ? `<div class="dec d-reject"><b>${esc(t('jobBlocked'))}</b>${r.errors.map(e => `<div class="li">• ${esc(errText(e))}</div>`).join('')}</div>` : `<div class="dec d-accept"><b>${esc(t('jobOk'))}</b></div>`}
      ${r.warnings.length ? `<div class="dec d-warn">${r.warnings.map(w => `<div class="li">• ${esc(t('jw_' + w.code, w))}</div>`).join('')}</div>` : ''}`;
  }
  async function startJob() {
    const f = S.jobForm;
    if (!S.crew) return C.toast(t('selectCrew'));
    if (!String(f.leader || '').trim()) return C.toast(t('needLeader'));
    const r = P.validateJob(f, ctxFor());
    if (r.errors.length) { keepScroll(); return C.toast(t('jobBlocked')); }
    const tms = now(), sn = snapshot();
    const job = Object.assign(base(tms), {
      status: 'running', startedAt: tms, millType: S.cfg.millType, productId: f.productId, lineId: f.lineId,
      grainKg: r.values.grainKg, silos: f.silos.slice(), alloc: r.calc.alloc, bins: f.bins.slice(),
      m0: r.values.m0, m1: r.values.m1, impurities: r.values.impurities, feedTph: r.calc.feedTph,
      waterL: r.calc.waterL, waterLh: r.calc.waterLh, expectedKg: isNum(r.calc.expectedKg) ? r.calc.expectedKg : null,
      extraction: r.calc.extraction, dampenerMaxLh: S.cfgP.dampenerMaxLh, recipe: JSON.parse(JSON.stringify(S.cfgP.recipes[f.productId])),
      snapshotUid: sn ? sn.uid : null, warnings: r.warnings.map(w => w.code + (w.silo ? ':' + w.silo : '')),
      leader: String(f.leader).trim()
    });
    const ops = [{ store: 'jobs', op: 'add', obj: job }].concat(f.bins.map((b, i) => ({ store: 'binEvents', op: 'add',
      obj: Object.assign(base(tms), { binId: b, type: 'FILL', productId: f.productId, jobUid: job.uid, lineId: f.lineId, t: tms, seq: i, by: job.leader }) })));
    try { await DB.batch(ops); } catch (e) { return C.toast(t('saveFailed')); }
    // Integração com o CQ: a linha passa a produzir este produto (controlos horários contam a partir daqui)
    const ls = Object.assign({}, S.lineState, { [f.lineId]: { productId: f.productId, running: true, since: tms } });
    S.lineState = ls; await DB.setConfig('lineState', ls);
    S.operator = job.leader; await DB.setConfig('operator', S.operator);
    S.jobForm = null; await reload(); C.toast(t('jobStarted')); C.render(); window.scrollTo(0, 0);
  }
  async function closeJob() {
    const j = S.jobs.find(x => x.uid === S.closeJob);
    if (!j || j.status !== 'running') return;
    const status = $('#cj_status').value === 'cancelled' ? 'cancelled' : 'done';
    const by = $('#cj_by').value.trim();
    if (!by) return C.toast(t('needLeader'));
    const kg = P.num($('#cj_kg').value, 'kg');
    if (kg !== null && (isNaN(kg) || kg < 0)) return C.toast(t('fixInvalid'));
    const nj = Object.assign({}, j, { status, closedAt: now(), closedBy: by, actualKg: kg, closeNote: $('#cj_note').value.trim() });
    try { await DB.put('jobs', nj); } catch (e) { return C.toast(t('saveFailed')); }
    const st = S.lineState[j.lineId];
    if (st && st.running && st.productId === j.productId) {
      S.lineState = Object.assign({}, S.lineState, { [j.lineId]: Object.assign({}, st, { running: false, since: now() }) });
      await DB.setConfig('lineState', S.lineState);
    }
    S.closeJob = null; await reload(); C.toast(t('jobClosed')); keepScroll();
  }
  async function importSilos(file) {
    if (!file) return;
    let o, snap;
    try { o = JSON.parse(await file.text()); snap = P.snapshotFromSilosBackup(o, now()); }
    catch (e) { return C.toast(t('notSilosFile')); }
    snap.uid = newUid(); snap.deviceId = S.deviceId; snap.fileName = String(file.name || '').slice(0, 120);
    try { await DB.add('siloSnapshots', snap); } catch (e) { return C.toast(t('saveFailed')); }
    await reload(); C.toast(t('snapImported', { n: snap.silos.length })); keepScroll();
  }

  // ---------- diário de turno ----------
  function logShift() {
    if (!S.logShift) { const sh = L.shiftOf(now()); S.logShift = { day: sh.day, period: sh.period }; }
    return S.logShift;
  }
  function shiftRange(day, period) {
    const [s] = L.prodDayRange(day);
    return period === 'D' ? [s, s + 12 * 3600000] : [s + 12 * 3600000, s + 24 * 3600000];
  }
  function viewLog() {
    const ls = logShift();
    const range = shiftRange(ls.day, ls.period);
    const sm = P.shiftSummary(ls.day, ls.period, range, { log: S.shiftLog, jobs: S.jobs, now: now() });
    const f = S.logForm;
    return `<section class="card"><h3>${esc(t('shiftLog'))}</h3>
      <div class="grid2"><label class="fld">${esc(t('prodDay'))}<input type="date" id="logDay" value="${esc(ls.day)}"></label>
      <label class="fld">${esc(t('shift'))}<select id="logPeriod"><option value="D" ${ls.period === 'D' ? 'selected' : ''}>${esc(t('shift_D'))} 07–19</option><option value="N" ${ls.period === 'N' ? 'selected' : ''}>${esc(t('shift_N'))} 19–07</option></select></label></div>
      <div class="kpis k4"><div><b>${sm.jobs.length}</b><span>${esc(t('ptab_jobs'))}</span></div><div class="${sm.openIssues ? 'd-warn' : ''}"><b>${sm.issues.length}</b><span>${esc(t('issues'))}</span></div>
        <div><b>${sm.downtimeMin}</b><span>${esc(t('downtimeMin'))}</span></div><div><b>${sm.acts.length}</b><span>${esc(t('activities'))}</span></div></div>
      ${f ? '' : `<div class="row"><button class="btn primary" data-pact="newissue">＋ ${esc(t('newIssue'))}</button><button class="btn" data-pact="newact">＋ ${esc(t('newActivity'))}</button></div>`}
      <div class="row"><button class="btn ghost small" data-pact="shiftxlsx">${esc(t('genExcel'))}</button>
        <a class="btn ghost small" target="_blank" rel="noopener" href="${esc(C.waLink(shiftText(ls, sm)))}">${esc(t('sendSummaryWa'))}</a></div></section>
      ${f ? logFormView() : ''}
      <section class="card"><h3>${esc(t('issues'))}</h3>${sm.issues.map(issueItem).join('') || '<p class="sub">—</p>'}</section>
      <section class="card"><h3>${esc(t('activities'))}</h3>${sm.acts.map(actItem).join('') || '<p class="sub">—</p>'}</section>`;
  }
  function lineOpts(sel) {
    return `<option value="">—</option>` + S.cfg.lines.map(l => `<option value="${esc(l.id)}" ${sel === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
  }
  function logFormView() {
    const f = S.logForm;
    const head = `<label class="fld">${esc(t('time'))}<input type="datetime-local" data-lf="time" value="${esc(f.time)}"></label>
      <label class="fld">${esc(t('line'))}<select data-lf="lineId">${lineOpts(f.lineId)}</select></label>`;
    if (f.kind === 'issue') return `<section class="card"><h3>${esc(t('newIssue'))}</h3><div class="grid2">${head}
        <label class="fld req">${esc(t('category'))}<select data-lf="category"><option value="">—</option>${P.ISSUE_CATS.map(c => `<option value="${c}" ${f.category === c ? 'selected' : ''}>${esc(t('ic_' + c))}</option>`).join('')}</select></label>
        <label class="fld">${esc(t('equipment'))}<input data-lf="equipment" value="${esc(f.equipment)}"></label></div>
        <label class="fld req">${esc(t('issueDesc'))}<textarea rows="2" data-lf="description">${esc(f.description)}</textarea></label>
        <label class="fld">${esc(t('downtimeMin'))}<input inputmode="numeric" data-lf="downtimeMin" value="${esc(f.downtimeMin)}"></label>
        <label class="fld">${esc(t('actionTaken'))}<textarea rows="2" data-lf="action">${esc(f.action)}</textarea></label>
        <label class="fld req">${esc(t('reportedBy'))}<input data-lf="by" value="${esc(f.by)}"></label>
        <p class="sub">${esc(t('kbLater'))}</p>
        <button class="btn primary big" data-pact="savelog">${esc(t('save'))}</button><button class="btn ghost" data-pact="cancellog">${esc(t('cancel'))}</button></section>`;
    return `<section class="card"><h3>${esc(t('newActivity'))}</h3><div class="grid2">${head}
        <label class="fld req">${esc(t('activityType'))}<select data-lf="type"><option value="">—</option>${P.ACT_TYPES.map(c => `<option value="${c}" ${f.type === c ? 'selected' : ''}>${esc(t('at_' + c))}</option>`).join('')}</select></label>
        ${f.type === 'housekeeping' ? `<label class="fld req">${esc(t('floor'))}<input data-lf="floor" list="floorList" value="${esc(f.floor)}"><datalist id="floorList">${(S.cfgP.floors || []).map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>` : ''}
        ${f.type === 'reprocessing' ? `<label class="fld req">${esc(t('qtyKg'))}<input inputmode="decimal" data-lf="qtyKg" value="${esc(f.qtyKg)}"></label>
          <label class="fld">${esc(t('product'))}<select data-lf="productId"><option value="">—</option>${C.products().map(p => `<option value="${esc(p.id)}" ${f.productId === p.id ? 'selected' : ''}>${esc(C.prodName(p.id))}</option>`).join('')}</select></label>` : ''}
      </div>
      <label class="fld ${f.type && f.type !== 'housekeeping' && f.type !== 'reprocessing' ? 'req' : ''}">${esc(t('description'))}<textarea rows="2" data-lf="description">${esc(f.description)}</textarea></label>
      <label class="fld req">${esc(t('doneBy'))}<input data-lf="by" value="${esc(f.by)}"></label>
      <button class="btn primary big" data-pact="savelog">${esc(t('save'))}</button><button class="btn ghost" data-pact="cancellog">${esc(t('cancel'))}</button></section>`;
  }
  function newLogForm(kind) {
    S.logForm = { kind, time: C.localInput(now()), lineId: '', category: '', equipment: '', description: '', downtimeMin: '', action: '',
      type: '', floor: '', qtyKg: '', productId: '', by: S.operator };
  }
  async function saveLog() {
    const f = S.logForm;
    if (!S.crew) return C.toast(t('selectCrew'));
    const tms = new Date(f.time).getTime();
    if (!isFinite(tms)) return C.toast(t('badTime'));
    if (tms > now() + 5 * 60000) return C.toast(t('futureTime'));
    if (tms < now() - 24 * 3600000) return C.toast(t('tooOld'));
    if (!String(f.by || '').trim()) return C.toast(t('needName'));
    let rec;
    if (f.kind === 'issue') {
      const e = P.validateIssue(f);
      if (e.length) return C.toast(t('fillFields') + ': ' + e.map(x => t('f_' + x)).join(', '));
      const dt = P.num(f.downtimeMin);
      rec = Object.assign(base(tms), { kind: 'issue', t: tms, lineId: f.lineId, category: f.category, equipment: f.equipment.trim(),
        description: f.description.trim(), downtimeMin: dt, action: f.action.trim(), by: f.by.trim(), status: f.action.trim() ? 'closed' : 'open' });
      if (rec.status === 'closed') { rec.closedAt = tms; rec.closedBy = rec.by; rec.resolution = rec.action; }
    } else {
      const e = P.validateActivity(f);
      if (e.length) return C.toast(t('fillFields') + ': ' + e.map(x => t('f_' + x)).join(', '));
      rec = Object.assign(base(tms), { kind: 'activity', t: tms, lineId: f.lineId, type: f.type, floor: f.type === 'housekeeping' ? f.floor.trim() : '',
        qtyKg: f.type === 'reprocessing' ? P.num(f.qtyKg, 'kg') : null, productId: f.type === 'reprocessing' ? f.productId : '',
        description: f.description.trim(), by: f.by.trim() });
    }
    try { await DB.add('shiftLog', rec); } catch (e) { return C.toast(t('saveFailed')); }
    S.operator = rec.by; await DB.setConfig('operator', S.operator);
    S.logForm = null; S.logShift = { day: rec.prodDay, period: rec.period };
    await reload(); C.toast(t('saved')); keepScroll();
  }
  function issueItem(i) {
    const cat = CAT.has(i.category) ? i.category : 'other';
    const open = i.status !== 'closed';
    const act = S.logAct && S.logAct.uid === i.uid ? S.logAct.mode : null;
    return `<div class="rowitem">
      <div class="row between"><span><b>${esc(C.fmtTime(i.t))}</b> · ${esc(t('ic_' + cat))}${i.lineId ? ' · ' + esc(C.lineName(i.lineId)) : ''}${i.equipment ? ' · ' + esc(i.equipment) : ''}</span>
        <span class="chip ${open ? 'd-warn' : 'd-accept'}">${esc(open ? t('is_open') : t('is_closed'))}</span></div>
      <div>${esc(i.description)}</div>
      <small>${isNum(i.downtimeMin) ? esc(t('downtimeMin')) + ': ' + i.downtimeMin + ' · ' : ''}${esc(t('crew'))} ${esc(i.crew)} · ${esc(i.by)}</small>
      ${i.resolution ? `<div class="act"><small>${esc(i.closedAt ? C.fmtDT(i.closedAt) : '')} · ${esc(i.closedBy || '')}: ${esc(i.resolution)}</small></div>` : ''}
      ${act ? `<div class="holdform"><label class="fld req">${esc(act === 'close' ? t('resolution') : t('voidReason'))}<textarea rows="2" id="la_text"></textarea></label>
        <label class="fld req">${esc(t('name'))}<input id="la_by" value="${esc(S.operator)}"></label>
        <button class="btn primary small" data-pact="${act === 'close' ? 'closeissue' : 'voidlog'}">${esc(t('save'))}</button> <button class="btn ghost small" data-pact="cancella">${esc(t('cancel'))}</button></div>`
        : `<div class="row">${open ? `<button class="btn ghost small" data-logact="close" data-uid="${esc(i.uid)}">${esc(t('closeIssue'))}</button>` : ''}<button class="btn ghost small" data-logact="void" data-uid="${esc(i.uid)}">${esc(t('voidEntry'))}</button></div>`}
    </div>`;
  }
  function actItem(a) {
    const ty = ACT.has(a.type) ? a.type : 'other';
    const act = S.logAct && S.logAct.uid === a.uid ? S.logAct.mode : null;
    return `<div class="rowitem"><div><b>${esc(C.fmtTime(a.t))}</b> · ${esc(t('at_' + ty))}${a.floor ? ' · ' + esc(a.floor) : ''}${a.lineId ? ' · ' + esc(C.lineName(a.lineId)) : ''}${isNum(a.qtyKg) ? ' · ' + fmtKg(a.qtyKg) + ' kg' + (a.productId ? ' ' + esc(C.prodName(a.productId)) : '') : ''}</div>
      ${a.description ? `<div>${esc(a.description)}</div>` : ''}<small>${esc(t('crew'))} ${esc(a.crew)} · ${esc(a.by)}</small>
      ${act ? `<div class="holdform"><label class="fld req">${esc(t('voidReason'))}<textarea rows="2" id="la_text"></textarea></label>
        <label class="fld req">${esc(t('name'))}<input id="la_by" value="${esc(S.operator)}"></label>
        <button class="btn primary small" data-pact="voidlog">${esc(t('save'))}</button> <button class="btn ghost small" data-pact="cancella">${esc(t('cancel'))}</button></div>`
        : `<div class="row"><button class="btn ghost small" data-logact="void" data-uid="${esc(a.uid)}">${esc(t('voidEntry'))}</button></div>`}</div>`;
  }
  async function logAction(mode) {
    const e = S.shiftLog.find(x => x.uid === S.logAct.uid);
    const text = $('#la_text').value.trim(), by = $('#la_by').value.trim();
    if (!e || !text || !by) return C.toast(t('needTextName'));
    try {
      if (mode === 'close') await DB.put('shiftLog', Object.assign({}, e, { status: 'closed', closedAt: now(), closedBy: by, resolution: text }));
      else await DB.add('shiftLog', Object.assign(base(now()), { kind: 'void', voids: e.uid, t: now(), reason: text, by }));
    } catch (err) { return C.toast(t('saveFailed')); }
    S.logAct = null; await reload(); C.toast(t('saved')); keepScroll();
  }
  function shiftText(ls, sm) {
    const lines = [t('waShiftTitle', { d: ls.day, s: t('shift_' + ls.period) })];
    sm.jobs.forEach(j => lines.push('▶ ' + C.lineName(j.lineId) + ' ' + C.prodName(j.productId) + ': ' + fmtKg(j.grainKg) + ' kg · ' + t('js_' + (JOB_ST[j.status] ? j.status : 'running'))));
    lines.push(t('issues') + ': ' + sm.issues.length + ' (' + t('is_open') + ' ' + sm.openIssues + ') · ' + t('downtimeMin') + ': ' + sm.downtimeMin);
    sm.issues.forEach(i => lines.push('• ' + C.fmtTime(i.t) + ' ' + t('ic_' + (CAT.has(i.category) ? i.category : 'other')) + (i.lineId ? ' ' + i.lineId : '') + ': ' + i.description + (isNum(i.downtimeMin) ? ' (' + i.downtimeMin + ' min)' : '')));
    if (sm.acts.length) lines.push(t('activities') + ': ' + sm.acts.map(a => t('at_' + (ACT.has(a.type) ? a.type : 'other')) + (a.floor ? ' ' + a.floor : '')).join('; '));
    return lines.join('\n');
  }
  function shiftWorkbook(ls, sm, range) {
    const XLSX = window.XLSX, wb = XLSX.utils.book_new();
    const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name.slice(0, 31));
    add(t('x_jobs'), [[t('waShiftTitle', { d: ls.day, s: t('shift_' + ls.period) })], [],
      [t('line'), t('product'), t('status'), t('startedAt'), t('closedAt'), t('shiftLeader'), t('crew'), t('grainToMill') + ' (kg)', t('fromSilos'), t('toBins'),
        t('m0'), t('impurities'), t('m1'), t('feedRate') + ' (t/h)', t('waterRate') + ' (L/h)', t('waterTotal') + ' (L)', t('extraction') + ' %', t('expectedProduct') + ' (kg)', t('actualGrain') + ' (kg)', t('notes')],
      ...sm.jobs.map(j => [C.lineName(j.lineId), C.prodName(j.productId), t('js_' + (JOB_ST[j.status] ? j.status : 'running')), C.fmtDT(j.startedAt), j.closedAt ? C.fmtDT(j.closedAt) : '',
        j.leader, j.crew, j.grainKg, (j.alloc || []).map(a => a.silo + '=' + a.kg).join('; '), (j.bins || []).join(', '), j.m0, j.impurities, j.m1, j.feedTph, j.waterLh, j.waterL,
        isNum(j.extraction) ? j.extraction : '', isNum(j.expectedKg) ? j.expectedKg : '', isNum(j.actualKg) ? j.actualKg : '', j.closeNote || ''])]);
    add(t('issues'), [[t('dateTime'), t('crew'), t('line'), t('category'), t('equipment'), t('issueDesc'), t('downtimeMin'), t('actionTaken'), t('status'), t('reportedBy'), t('closedAt'), t('resolution')],
      ...sm.issues.map(i => [C.fmtDT(i.t), i.crew, i.lineId ? C.lineName(i.lineId) : '', t('ic_' + (CAT.has(i.category) ? i.category : 'other')), i.equipment, i.description,
        isNum(i.downtimeMin) ? i.downtimeMin : '', i.action, i.status === 'closed' ? t('is_closed') : t('is_open'), i.by, i.closedAt ? C.fmtDT(i.closedAt) : '', i.resolution || ''])]);
    add(t('activities'), [[t('dateTime'), t('crew'), t('line'), t('activityType'), t('floor'), t('qtyKg'), t('product'), t('description'), t('doneBy')],
      ...sm.acts.map(a => [C.fmtDT(a.t), a.crew, a.lineId ? C.lineName(a.lineId) : '', t('at_' + (ACT.has(a.type) ? a.type : 'other')), a.floor || '', isNum(a.qtyKg) ? a.qtyKg : '',
        a.productId ? C.prodName(a.productId) : '', a.description || '', a.by])]);
    const qa = L.effective(S.samples).filter(s => s.t >= range[0] && s.t < range[1] && (s.decision === 'warn' || s.decision === 'reject')).sort((a, b) => a.t - b.t);
    add(t('x_alerts'), [[t('dateTime'), t('line'), t('product'), t('decision'), t('failures')],
      ...qa.map(s => [C.fmtDT(s.t), C.lineName(s.lineId), C.prodName(s.productId), C.decLabel(s.decision), s.failures.map(f => C.anyLabel(f.param, C.product(s.productId)) + '=' + (f.value === 'abn' ? t('abnormal') : f.value)).join('; ')])]);
    add(t('ptab_bins'), [[t('bin'), t('fedBy'), t('content'), t('since')],
      ...S.cfgP.bins.map(b => { const st = P.binState(b.id, S.binEvents); return [b.id, b.lines.join('/'), st.productId ? C.prodName(st.productId) : t('binEmpty'), st.since ? C.fmtDT(st.since) : '']; })]);
    return wb;
  }
  function shiftExcel() {
    const ls = logShift(), range = shiftRange(ls.day, ls.period);
    const sm = P.shiftSummary(ls.day, ls.period, range, { log: S.shiftLog, jobs: S.jobs, now: now() });
    window.XLSX.writeFile(shiftWorkbook(ls, sm, range), ls.day + '_' + (ls.period === 'D' ? 'Dia' : 'Noite') + '_Producao-Moagem_Diario-Turno.xlsx');
  }

  // ---------- silos de produto ----------
  function viewBins() {
    const a = S.binAct;
    return `<section class="card"><h3>${esc(t('ptab_bins'))}</h3><p class="sub">${esc(t('binSourceNote', { s: S.cfgP.binSource || '' }))}</p>
      ${S.cfgP.bins.map(b => {
        const st = P.binState(b.id, S.binEvents);
        const job = st.jobUid ? S.jobs.find(j => j.uid === st.jobUid) : null;
        const mine = a && a.id === b.id ? a.mode : null;
        return `<div class="rowitem"><div class="row between"><span><b>${esc(b.id)}</b> <small>${esc(t('fedBy'))} ${esc(b.lines.join('/'))}</small></span>
          <span class="chip ${st.productId ? 'd-warn' : 'd-accept'}">${esc(st.productId ? C.prodName(st.productId) : t('binEmpty'))}</span></div>
          ${st.since ? `<small>${esc(t('since'))} ${esc(C.fmtDT(st.since))}${job ? ' · ' + esc(C.lineName(job.lineId)) + (job.status === 'running' ? ' (' + esc(t('js_running')) + ')' : '') : ''}${st.last && st.last.by ? ' · ' + esc(st.last.by) : ''}</small>` : ''}
          ${mine ? `<div class="holdform">
            ${mine === 'set' ? `<label class="fld req">${esc(t('product'))}<select id="ba_prod"><option value="">—</option>${C.products().map(p => `<option value="${esc(p.id)}">${esc(C.prodName(p.id))}</option>`).join('')}</select></label>` : ''}
            <label class="fld req">${esc(t('name'))}<input id="ba_by" value="${esc(S.operator)}"></label>
            ${mine === 'set' ? `<label class="fld req">${esc(t('pin'))}<input type="password" inputmode="numeric" id="ba_pin"></label><p class="sub">${esc(t('setBinNote'))}</p>` : `<p class="sub">${esc(t('emptyBinNote'))}</p>`}
            <button class="btn primary small" data-pact="${mine === 'set' ? 'setbin' : 'emptybin'}">${esc(t('save'))}</button> <button class="btn ghost small" data-pact="cancelba">${esc(t('cancel'))}</button></div>`
          : `<div class="row">${st.productId ? `<button class="btn ghost small" data-binact="empty" data-bin="${esc(b.id)}">${esc(t('binEmptyBtn'))}</button>` : ''}<button class="btn ghost small" data-binact="set" data-bin="${esc(b.id)}">${esc(t('binSetBtn'))}</button></div>`}</div>`;
      }).join('')}</section>`;
  }
  async function binAction(mode) {
    const id = S.binAct.id, by = $('#ba_by').value.trim();
    if (!by) return C.toast(t('needName'));
    const st = P.binState(id, S.binEvents);
    if (mode === 'empty') {
      const job = st.jobUid ? S.jobs.find(j => j.uid === st.jobUid) : null;
      if (job && job.status === 'running') return C.toast(t('binInUse'));
    }
    let productId = null;
    if (mode === 'set') {
      productId = $('#ba_prod').value;
      if (!productId) return C.toast(t('selectProductFirst'));
      const r = await C.checkPin($('#ba_pin').value);
      if (!r.ok) return C.toast(C.pinMsg(r));
    }
    const tms = now();
    try { await DB.add('binEvents', Object.assign(base(tms), { binId: id, type: mode === 'set' ? 'SET' : 'EMPTY', productId, t: tms, seq: 0, by, previous: st.productId })); }
    catch (e) { return C.toast(t('saveFailed')); }
    S.binAct = null; await reload(); C.toast(t('saved')); keepScroll();
  }

  // ---------- definições de produção ----------
  function settingsCard() {
    const c = S.cfgP;
    const nExt = Object.keys(c.extraction).filter(k => isNum(c.extraction[k])).length, nRec = Object.keys(c.recipes).filter(k => P.recipeSet(c.recipes[k])).length;
    return `<section class="card"><h3>${esc(t('prodSettings'))}</h3>
      <p class="sub">${esc(t('prodSettingsSummary', { c: lineIds().map(id => id + ' ' + fmtKg(c.lineTpd[id]) + ' t/d').join(' · '), d: fmtKg(c.dampenerMaxLh), e: nExt, r: nRec, n: C.products().length, b: c.bins.length }))}</p>
      <button class="btn" data-nav="prodset">${esc(t('editProdSettings'))}</button></section>`;
  }
  function viewProdSet() {
    if (!S.prodDraft) S.prodDraft = JSON.parse(JSON.stringify(S.cfgP));
    const d = S.prodDraft;
    return `<section class="card"><h2>${esc(t('prodSettings'))}</h2><p class="sub">${esc(t('prodSettingsNote'))}</p>
      <div class="grid2">${lineIds().map(id => `<label class="fld">${esc(t('lineCap', { l: C.lineName(id) }))}<input inputmode="decimal" data-ps="tpd|${esc(id)}" value="${esc(C.fmtNum(d.lineTpd[id]))}"></label>`).join('')}
      <label class="fld">${esc(t('dampenerMax'))}<input inputmode="decimal" data-ps="damp" value="${esc(C.fmtNum(d.dampenerMaxLh))}"></label></div></section>
      <section class="card"><h3>${esc(t('extractionAndRecipes'))}</h3><p class="sub">${esc(t('recipeHelp'))}</p>
      ${C.products().map(p => { const r = d.recipes[p.id] || { colours: [], grades: [] }; return `<div class="param"><b>${esc(C.prodName(p.id))}</b>
        <label class="fld">${esc(t('extraction'))} (%)<input inputmode="decimal" data-ps="ext|${esc(p.id)}" value="${esc(C.fmtNum(d.extraction[p.id]))}"></label>
        <div class="sub">${esc(t('allowedColours'))}</div><div class="row">${P.COLOURS.map(c => `<label class="chk"><input type="checkbox" data-ps="col|${esc(p.id)}|${c}" ${r.colours.indexOf(c) >= 0 ? 'checked' : ''}> ${esc(c)}</label>`).join('')}</div>
        <div class="sub">${esc(t('allowedGrades'))}</div><div class="row">${P.SILO_GRADES.map(g => `<label class="chk"><input type="checkbox" data-ps="gr|${esc(p.id)}|${g}" ${r.grades.indexOf(g) >= 0 ? 'checked' : ''}> ${esc(t('g_' + g))}</label>`).join('')}</div></div>`; }).join('')}</section>
      <section class="card"><h3>${esc(t('ptab_bins'))}</h3><p class="sub">${esc(t('binsHelp'))}</p>
        <label class="fld"><textarea rows="4" data-ps="bins">${esc(P.binsText(d.bins))}</textarea></label>
        <h3>${esc(t('floors'))}</h3><p class="sub">${esc(t('floorsHelp'))}</p>
        <label class="fld"><input data-ps="floors" value="${esc((d.floors || []).join(', '))}"></label></section>
      <section class="card"><label class="fld req">${esc(t('supervisor'))}<input id="psBy"></label>
        <label class="fld req">${esc(t('reason'))}<input id="psReason"></label>
        <label class="fld req">${esc(t('pin'))}<input type="password" inputmode="numeric" id="psPin"></label>
        <button class="btn primary big" data-pact="saveprodset">${esc(t('save'))}</button>
        <button class="btn ghost" data-nav="settings">${esc(t('cancel'))}</button></section>`;
  }
  async function saveProdSet() {
    const by = $('#psBy').value.trim(), reason = $('#psReason').value.trim();
    if (!by || !reason) return C.toast(t('needByReason'));
    const n = JSON.parse(JSON.stringify(S.cfgP));
    const bad = [];
    n.extraction = {}; n.recipes = {};
    document.querySelectorAll('[data-ps]').forEach(el => {
      const [k, a, b] = el.dataset.ps.split('|');
      if (k === 'tpd') { const v = P.num(el.value); if (v === null || isNaN(v) || v <= 0) bad.push(t('lineCap', { l: a })); else n.lineTpd[a] = v; }
      if (k === 'damp') { const v = P.num(el.value); if (v === null || isNaN(v) || v <= 0) bad.push(t('dampenerMax')); else n.dampenerMaxLh = v; }
      if (k === 'ext') { const v = P.num(el.value); if (v !== null) { if (isNaN(v) || v <= 0 || v > 100) bad.push(t('extraction') + ' ' + C.prodName(a)); else n.extraction[a] = v; } }
      if (k === 'col' || k === 'gr') {
        const r = n.recipes[a] = n.recipes[a] || { colours: [], grades: [] };
        if (el.checked) (k === 'col' ? r.colours : r.grades).push(b);
      }
      if (k === 'bins') { const r = P.parseBins(el.value, lineIds()); if (r.errors.length || !r.bins.length) bad.push(t('ptab_bins') + ': ' + (r.errors.join(' | ') || '—')); else n.bins = r.bins; }
      if (k === 'floors') n.floors = el.value.split(',').map(x => x.trim()).filter(Boolean).filter((x, i, arr) => arr.indexOf(x) === i);
    });
    Object.keys(n.recipes).forEach(k => { if (!n.recipes[k].colours.length && !n.recipes[k].grades.length) delete n.recipes[k]; });
    if (bad.length) return C.toast(t('limitErrors') + ': ' + bad.join('; '));
    const errs = P.validateProdConfig(n);
    if (errs.length) return C.toast(t('limitErrors') + ': ' + errs.join(', '));
    if (JSON.stringify(n.bins) !== JSON.stringify(S.cfgP.bins)) n.binSource = t('changedBy', { by, d: C.fmtDT(now()).slice(0, 10) });
    const diff = P.prodConfigDiff(S.cfgP, n);
    if (!diff.length) return C.toast(t('noChanges'));
    const r = await C.checkPin($('#psPin').value);
    if (!r.ok) return C.toast(C.pinMsg(r));
    const tms = now();
    try {
      await DB.batch(diff.map(x => ({ store: 'prodChanges', op: 'add', obj: Object.assign(base(tms), { t: tms, by, reason }, x) })));
      await DB.setConfig('cfgP', n);
    } catch (e) { return C.toast(t('saveFailed')); }
    S.cfgP = n; S.prodDraft = null; await reload();
    C.toast(t('limitsSaved', { n: diff.length })); S.view = 'settings'; C.render(); window.scrollTo(0, 0);
  }

  // ---------- início: resumo por linha ----------
  function homeLine(lineId) {
    const j = runningJob(lineId);
    if (!j) return '';
    return `<div class="banner b-info" data-nav="prod">▶ ${esc(t('jobOnLine', { p: C.prodName(j.productId), kg: fmtKg(j.grainKg), w: fmtKg(j.waterLh), h: C.fmtTime(j.startedAt) }))}</div>`;
  }

  // ---------- eventos ----------
  const CLICK_SEL = '[data-ptab],[data-pact],[data-closejob],[data-jsilo],[data-jbin],[data-logact],[data-binact]';
  async function onClick(el) {
    if (el.dataset.ptab) { S.prodTab = el.dataset.ptab; C.render(); return; }
    if (el.dataset.closejob) { S.closeJob = el.dataset.closejob; keepScroll(); return; }
    if (el.dataset.jsilo) { const f = S.jobForm, i = f.silos.indexOf(el.dataset.jsilo); if (i >= 0) f.silos.splice(i, 1); else f.silos.push(el.dataset.jsilo); keepScroll(); return; }
    if (el.dataset.jbin) { const f = S.jobForm, i = f.bins.indexOf(el.dataset.jbin); if (i >= 0) f.bins.splice(i, 1); else f.bins.push(el.dataset.jbin); keepScroll(); return; }
    if (el.dataset.logact) { S.logAct = { uid: el.dataset.uid, mode: el.dataset.logact === 'close' ? 'close' : 'void' }; keepScroll(); return; }
    if (el.dataset.binact) { S.binAct = { id: el.dataset.bin, mode: el.dataset.binact === 'set' ? 'set' : 'empty' }; keepScroll(); return; }
    switch (el.dataset.pact) {
      case 'newjob': newJobForm(); keepScroll(); return;
      case 'canceljob': S.jobForm = null; keepScroll(); return;
      case 'startjob': return startJob();
      case 'closejob': return closeJob();
      case 'cancelclose': S.closeJob = null; keepScroll(); return;
      case 'newissue': newLogForm('issue'); keepScroll(); return;
      case 'newact': newLogForm('activity'); keepScroll(); return;
      case 'cancellog': S.logForm = null; keepScroll(); return;
      case 'savelog': return saveLog();
      case 'closeissue': return logAction('close');
      case 'voidlog': return logAction('void');
      case 'cancella': S.logAct = null; keepScroll(); return;
      case 'shiftxlsx': return shiftExcel();
      case 'emptybin': return binAction('empty');
      case 'setbin': return binAction('set');
      case 'cancelba': S.binAct = null; keepScroll(); return;
      case 'saveprodset': return saveProdSet();
    }
  }
  function onInput(el) {
    if (el.dataset.jfi && S.jobForm) { S.jobForm[el.dataset.jfi] = el.value; const b = $('#jobCheck'); if (b) b.innerHTML = jobCheckHtml(); return true; }
    if (el.dataset.lf && S.logForm && el.tagName !== 'SELECT') { S.logForm[el.dataset.lf] = el.value; return true; }
    return false;
  }
  function onChange(el) {
    if (el.dataset.jf && S.jobForm) {
      const k = el.dataset.jf;
      S.jobForm[k] = el.type === 'checkbox' ? el.checked : el.value;
      if (k === 'lineId') S.jobForm.bins = S.jobForm.bins.filter(b => { const bin = binById(b); return bin && bin.lines.indexOf(el.value) >= 0; });
      keepScroll(); return true;
    }
    if (el.dataset.lf && S.logForm && el.tagName === 'SELECT') { S.logForm[el.dataset.lf] = el.value; keepScroll(); return true; }
    if (el.id === 'logDay') { S.logShift = Object.assign(logShift(), { day: el.value || logShift().day }); C.render(); return true; }
    if (el.id === 'logPeriod') { S.logShift = Object.assign(logShift(), { period: el.value === 'N' ? 'N' : 'D' }); C.render(); return true; }
    if (el.id === 'importSilos') { importSilos(el.files[0]); el.value = ''; return true; }
    return false;
  }

  return { load, reload, view, viewProdSet, settingsCard, homeLine, onClick, onInput, onChange, CLICK_SEL };
};
