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
  const ACT = new Set(P.ACT_TYPES);
  // Código de paragem: "A07 MILLS · Breakdown" (texto do ficheiro FMO, sem tradução)
  const codes = () => S.cfgP.downtimeCodes;
  const cName = d => (S.lang === 'pt' && d.namePt) ? d.namePt : d.name;
  const codeLabel = (c, info) => { const d = info || P.findCode(c, codes()); return d ? d.code + ' ' + cName(d) : (c || ''); };
  const v2Label = v => v || t('noV2');
  const oeeLabel = o => o ? t('oee_' + o) : t('oeeNotSet');
  const GROUPS = [['P', 'cg_P'], ['A', 'cg_A'], ['O', 'cg_O']];

  // ---------- dados ----------
  async function load() {
    S.cfgP = (await DB.getConfig('cfgP')) || P.defaultProdConfig();
    if (!Array.isArray(S.cfgP.downtimeCodes)) { S.cfgP.downtimeCodes = P.defaultCodes(); S.cfgP.codesSource = P.DOWNTIME_SOURCE; }   // configuração anterior à v1.2
    // configuração anterior à v1.3: acrescenta os dados mestre em falta (não altera listas já existentes)
    const d = P.defaultProdConfig();
    ['grainSilos', 'dirtyBins', 'temperedBins', 'masterSource', 'leaders'].forEach(k => { if (S.cfgP[k] === undefined) S.cfgP[k] = d[k]; });
    S.deviceId = await DB.getConfig('deviceId');
    if (!S.deviceId) {
      S.deviceId = 'd' + Array.from(crypto.getRandomValues(new Uint8Array(4))).map(x => x.toString(16).padStart(2, '0')).join('');
      await DB.setConfig('deviceId', S.deviceId);
    }
    // v1.4.0: lista por defeito antiga e nunca editada neste telemóvel → passa para os códigos v2 (registado em prodChanges)
    if (P.OLD_DOWNTIME_SOURCES.indexOf(S.cfgP.codesSource) >= 0) {
      const n = Object.assign({}, S.cfgP, { downtimeCodes: P.defaultCodes(), codesSource: P.DOWNTIME_SOURCE });
      const diff = P.prodConfigDiff(S.cfgP, n), tms = now();
      try {
        if (diff.length) await DB.batch(diff.map(x => ({ store: 'prodChanges', op: 'add', obj: Object.assign(base(tms), { t: tms, by: 'app ' + P.VERSION, reason: t('codesAutoUpgrade') }, x) })));
        await DB.setConfig('cfgP', n); S.cfgP = n;
      } catch (e) { /* mantém a lista antiga; tenta de novo na próxima abertura */ }
    }
    await reload();
  }
  async function reload() {
    S.jobs = await DB.all('jobs');
    S.binEvents = await DB.all('binEvents');
    S.shiftLog = await DB.all('shiftLog');
    S.siloSnaps = await DB.all('siloSnapshots');
    S.prodChanges = await DB.all('prodChanges');
    S.moves = await DB.all('grainMoves');
  }
  let seq = 0;
  // UUID v4 por registo (o dispositivo vai em deviceId); recurso antigo se randomUUID não existir
  const newUid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : P.uid(S.deviceId, now(), (++seq).toString(36) + Math.random().toString(36).slice(2, 6));
  const base = tms => ({ uid: newUid(), deviceId: S.deviceId, createdAt: now(), crew: S.crew, period: L.shiftOf(tms).period, prodDay: L.prodDay(tms) });
  const snapshot = () => (S.siloSnaps || []).slice().sort((a, b) => b.importedAt - a.importedAt)[0] || null;
  const runningJob = lineId => (S.jobs || []).find(j => j.status === 'running' && j.lineId === lineId);
  const lineIds = () => S.cfg.lines.map(l => l.id);
  const binById = id => S.cfgP.bins.find(b => b.id === id);
  const prodOrDash = id => id ? C.prodName(id) : '—';
  // Chefe de turno: lista (Definições) quando definida; senão texto livre. Por defeito: chefe da turma seleccionada.
  const defLeader = () => P.crewLeader(S.cfgP, S.crew) || S.operator;
  function leaderField(attr, value) {
    const list = P.leaderNames(S.cfgP);
    if (!list.length) return `<input ${attr} value="${esc(value)}">`;
    const known = list.some(x => x.name === value);
    return `<select ${attr}><option value="">—</option>${list.map(x => `<option value="${esc(x.name)}" ${x.name === value ? 'selected' : ''}>${esc(x.name)} (${esc(t('crew'))} ${esc(x.crew)})</option>`).join('')}${value && !known ? `<option value="${esc(value)}" selected>${esc(value)}</option>` : ''}</select>`;
  }
  const leaderCrewOf = name => { const x = P.leaderNames(S.cfgP).find(l => l.name === name); return x ? x.crew : null; };

  // ---------- vista principal ----------
  function view() {
    const tab = S.prodTab || 'jobs';
    const tabs = ['jobs', 'grain', 'log', 'bins'].map(k => `<button class="btn ${tab === k ? 'primary' : 'ghost'} small" data-ptab="${k}">${esc(t('ptab_' + k))}</button>`).join(' ');
    const body = tab === 'log' ? viewLog() : tab === 'bins' ? viewBins() : tab === 'grain' ? viewGrain() : viewJobs();
    return `<section class="card"><h2>${esc(t('nav_prod'))}</h2><div class="row">${tabs}</div></section>${body}`;
  }

  // ---------- ordens de produção ----------
  function snapCard() {
    const sn = snapshot();
    const sh = L.shiftOf(now());
    const exp = sn ? (sn.exportedAt ? Date.parse(sn.exportedAt) : sn.importedAt) : null;
    return `<section class="card"><h3>${esc(t('grainStock'))}</h3>
      ${sn ? `<p class="sub">${esc(t('snapFrom', { e: C.fmtDT(exp), i: C.fmtDT(sn.importedAt) }))}</p>
        ${exp < sh.start ? `<div class="banner b-warn">${esc(t('snapOld'))}</div>` : ''}
        ${P.nonCanonical(sn, S.cfgP.grainSilos).length ? `<div class="banner b-reject">${esc(t('nonCanonical', { s: P.nonCanonical(sn, S.cfgP.grainSilos).join(', '), list: siloRange() }))}</div>` : ''}` : `<div class="banner b-warn">${esc(t('snapNone'))}</div>`}
      <p class="sub">${esc(t('snapHow'))}</p>
      <label class="btn ghost">${esc(t('importSilos'))}<input type="file" id="importSilos" accept="application/json" hidden></label></section>`;
  }
  const siloRange = () => { const g = S.cfgP.grainSilos || []; return g.length > 2 ? g[0] + '–' + g[g.length - 1] : g.join(', '); };
  const dirtyState = id => P.dirtyBinState(id, S.moves, S.jobs);
  const gradeName = g => t('g_' + (P.SILO_GRADES.indexOf(g) >= 0 ? g : 'none'));
  const compText = comps => (comps || []).filter(c => c.kg > 0).map(c => (c.cereal === 'Milho' ? '' : c.cereal + ' ') + c.colour + ' · ' + gradeName(c.grade) + ': ' + fmtKg(c.kg) + ' kg (' + c.silos.join(', ') + ')').join(' + ');

  // ---------- grão: stock da app de Silos, transferências para silos de milho sujo ----------
  function viewGrain() {
    const recent = (S.moves || []).slice().sort((a, b) => b.t - a.t).slice(0, 10);
    return snapCard() +
      (S.trForm ? transferFormView() : `<section class="card"><button class="btn primary big" data-pact="newtransfer">＋ ${esc(t('newTransfer'))}</button></section>`) +
      `<section class="card"><h3>${esc(t('dirtyBins'))}</h3>${(S.cfgP.dirtyBins || []).map(dirtyCard).join('')}</section>
      <section class="card"><h3>${esc(t('temperedBins'))}</h3>${(S.cfgP.temperedBins || []).map(b => `<div class="kv"><span><b>${esc(b.id)}</b> · ${esc(t('fedBy'))} ${esc(b.lines.join('/'))}</span><b>${isNum(b.capT) ? fmtKg(b.capT) + ' t' : esc(t('capNotSet'))}</b></div>`).join('')}
        <p class="sub">${esc(t('temperedNote'))}</p></section>
      <section class="card"><h3>${esc(t('recentMoves'))}</h3>${recent.map(m => `<div class="rowitem"><b>${esc(C.fmtDT(m.t))}</b> · ${esc(m.binId)} · ${m.type === 'EMPTY' ? esc(t('binEmptied', { kg: fmtKg(m.bookKg) })) : esc((m.parts || []).map(p => p.silo + ' ' + fmtKg(p.kg) + ' kg').join(' → '))}<br><small>${esc(t('crew'))} ${esc(m.crew || '—')} · ${esc(m.by || '')}</small></div>`).join('') || '<p class="sub">—</p>'}</section>
      <section class="card"><p class="sub">${esc(t('masterNote', { s: S.cfgP.masterSource || '' }))}</p></section>`;
  }
  function dirtyCard(b) {
    const st = dirtyState(b.id);
    const pct = isNum(b.capT) && b.capT > 0 ? Math.max(0, Math.min(100, Math.round(st.kg / (b.capT * 10)))) : null;
    const mine = S.emptyBin === b.id;
    return `<div class="rowitem"><div class="row between"><span><b>${esc(b.id)}</b> <small>${esc(t('fedBy'))} ${esc(b.lines.join('/'))}${isNum(b.capT) ? ' · ' + fmtKg(b.capT) + ' t' : ''}</small></span>
        <span class="chip ${st.kg > 0 ? 'd-warn' : 'd-accept'}">${st.kg > 0 ? fmtKg(st.kg) + ' kg' + (pct !== null ? ' · ' + pct + ' %' : '') : esc(t('binEmpty'))}</span></div>
      ${st.kg < 0 ? `<div class="banner b-reject"><small>${esc(t('negativeBin'))}</small></div>` : ''}
      ${st.comps.length ? `<small>${esc(t('inputsSince'))}: ${esc(compText(st.comps))}</small>` : ''}
      ${st.runningJobs.length ? `<div><small>${esc(t('inUseBy', { n: st.runningJobs.length }))}</small></div>` : ''}
      ${mine ? `<div class="holdform"><p class="sub">${esc(t('emptyDirtyNote', { kg: fmtKg(st.kg) }))}</p>
          <label class="fld req">${esc(t('name'))}<input id="eb_by" value="${esc(S.operator)}"></label>
          <label class="fld req">${esc(t('pin'))}<input type="password" inputmode="numeric" id="eb_pin"></label>
          <button class="btn primary small" data-pact="emptydirty">${esc(t('save'))}</button> <button class="btn ghost small" data-pact="cancelempty">${esc(t('cancel'))}</button></div>`
        : (st.inKg > 0 || st.kg !== 0 ? `<div class="row"><button class="btn ghost small" data-emptydirty="${esc(b.id)}">${esc(t('binEmptyBtn'))}</button></div>` : '')}</div>`;
  }
  const tctxFor = () => ({ cfgP: S.cfgP, millType: S.cfg.millType, snapshot: snapshot(), moves: S.moves, jobs: S.jobs, shiftStart: L.shiftOf(now()).start });
  function newTransferForm() { S.trForm = { binId: '', silos: [], kg: '', silosConfirmed: false, by: defLeader() }; }
  function transferFormView() {
    const f = S.trForm, sn = snapshot();
    const siloRows = sn ? sn.silos.map(s => {
      const idx = f.silos.indexOf(s.id);
      const canon = (S.cfgP.grainSilos || []).indexOf(s.id) >= 0;
      const red = s.openEvent && isNum(s.openLevel) && s.openLevel >= 4;
      const chip = !canon ? `<span class="chip d-reject">${esc(t('notCanonical'))}</span>` : red ? `<span class="chip d-reject">${esc(t('siloRed'))}</span>` : s.openEvent ? `<span class="chip d-warn">⚠ ${esc(t('openEvent'))}</span>` : '';
      return `<button class="pick ${idx >= 0 ? 'on' : ''}" data-trsilo="${esc(s.id)}">${idx >= 0 ? `<i class="ord">${idx + 1}</i>` : ''}<b>${esc(s.id)}</b>
        <small>${esc(s.cereal)} ${esc(s.colour)} · ${esc(gradeName(s.grade))} · ${fmtKg(P.availableKg(sn, S.moves, s.id))} kg</small>${chip}</button>`;
    }).join('') : `<p class="sub">${esc(t('snapNone'))}</p>`;
    return `<section class="card"><h2>${esc(t('newTransfer'))}</h2>
      <div class="grid2"><label class="fld req">${esc(t('dirtyBin'))}<select data-trf="binId"><option value="">—</option>${(S.cfgP.dirtyBins || []).map(b => { const st = dirtyState(b.id); return `<option value="${esc(b.id)}" ${f.binId === b.id ? 'selected' : ''}>${esc(b.id)} · ${fmtKg(st.kg)} / ${isNum(b.capT) ? fmtKg(b.capT * 1000) : '?'} kg</option>`; }).join('')}</select></label>
        <label class="fld req">${esc(t('qtyKg'))}<input inputmode="decimal" data-tri="kg" value="${esc(f.kg)}"></label></div>
      <p class="sub">${esc(t('silosOrder'))}</p><div class="picks">${siloRows}</div>
      <label class="chk"><input type="checkbox" data-trf="silosConfirmed" ${f.silosConfirmed ? 'checked' : ''}> ${esc(t('confirmSilos'))}</label>
      <label class="fld req">${esc(t('name'))}<input data-tri="by" value="${esc(f.by)}"></label>
      <div id="trCheck">${trCheckHtml()}</div>
      <button class="btn primary big" data-pact="savetransfer">${esc(t('saveTransfer'))}</button>
      <button class="btn ghost" data-pact="canceltransfer">${esc(t('cancel'))}</button></section>`;
  }
  function trErrText(e) {
    const v = Object.assign({}, e);
    if (e.field) v.field = t('f_' + e.field);
    if (isNum(e.short)) v.short = fmtKg(e.short);
    if (isNum(e.free)) v.free = fmtKg(e.free);
    v.list = siloRange();
    return t('je_' + e.code, v);
  }
  function trCheckHtml() {
    const r = P.validateTransfer(S.trForm, tctxFor());
    const rows = r.calc.parts ? `<div class="kv"><span>${esc(t('fromSilos'))}</span><b>${esc(r.calc.parts.map(p => p.silo + ' ' + fmtKg(p.kg) + ' kg').join(' → '))}</b></div>` : '';
    const free = isNum(r.calc.freeKg) ? `<div class="kv"><span>${esc(t('freeInBin'))}</span><b>${fmtKg(r.calc.freeKg)} kg</b></div>` : '';
    return `${rows}${free}${r.errors.length ? `<div class="dec d-reject"><b>${esc(t('trBlocked'))}</b>${r.errors.map(e => `<div class="li">• ${esc(trErrText(e))}</div>`).join('')}</div>` : `<div class="dec d-accept"><b>${esc(t('trOk'))}</b></div>`}
      ${r.warnings.length ? `<div class="dec d-warn">${r.warnings.map(w => `<div class="li">• ${esc(t('jw_' + w.code, w))}</div>`).join('')}</div>` : ''}`;
  }
  async function saveTransfer() {
    const f = S.trForm;
    if (!S.crew) return C.toast(t('selectCrew'));
    if (!String(f.by || '').trim()) return C.toast(t('needName'));
    const r = P.validateTransfer(f, tctxFor());
    if (r.errors.length) { keepScroll(); return C.toast(t('trBlocked')); }
    const tms = now(), sn = snapshot();
    const m = Object.assign(base(tms), { type: 'TRANSFER', binId: f.binId, t: tms, kg: r.values.kg, parts: r.calc.parts,
      snapshotUid: sn ? sn.uid : null, warnings: r.warnings.map(w => w.code + (w.silo ? ':' + w.silo : '')), by: String(f.by).trim() });
    try { await DB.add('grainMoves', m); } catch (e) { return C.toast(t('saveFailed')); }
    S.operator = m.by; await DB.setConfig('operator', S.operator);
    S.trForm = null; await reload(); C.toast(t('trSaved', { kg: fmtKg(m.kg), b: m.binId })); keepScroll();
  }
  async function emptyDirty() {
    const id = S.emptyBin, by = $('#eb_by').value.trim();
    if (!by) return C.toast(t('needName'));
    const st = dirtyState(id);
    if (st.runningJobs.length) return C.toast(t('binInUse'));
    const r = await C.checkPin($('#eb_pin').value);
    if (!r.ok) return C.toast(C.pinMsg(r));
    const tms = now();
    try { await DB.add('grainMoves', Object.assign(base(tms), { type: 'EMPTY', binId: id, t: tms, bookKg: st.kg, comps: st.comps, by })); }
    catch (e) { return C.toast(t('saveFailed')); }
    S.emptyBin = null; await reload(); C.toast(t('saved')); keepScroll();
  }

  function viewJobs() {
    const running = (S.jobs || []).filter(j => j.status === 'running').sort((a, b) => a.lineId < b.lineId ? -1 : 1);
    const closed = (S.jobs || []).filter(j => j.status !== 'running').sort((a, b) => b.closedAt - a.closedAt).slice(0, 10);
    return (S.jobForm ? jobFormView() : `<section class="card"><button class="btn primary big" data-pact="newjob">＋ ${esc(t('newJob'))}</button></section>`) +
      `<section class="card"><h3>${esc(t('jobsRunning'))}</h3>${running.length ? running.map(jobCard).join('') : `<p class="sub">${esc(t('noJobs'))}</p>`}</section>
      <section class="card"><h3>${esc(t('jobsClosed'))}</h3>${closed.length ? closed.map(jobCard).join('') : '<p class="sub">—</p>'}</section>`;
  }
  function allocText(alloc) { return (alloc || []).map(a => esc(a.bin || a.silo) + ' ' + fmtKg(a.kg) + ' kg' + (isNum(a.pct) ? ' (' + esc(C.fmtNum(a.pct)) + ' %)' : '')).join(isNum((alloc || [])[0] && alloc[0].pct) ? ' + ' : ' → '); }
  function jobCard(j) {
    const st = JOB_ST[j.status] ? j.status : 'running';
    const qc = j.status === 'running' ? qcForJob(j) : '';
    const closing = S.closeJob === j.uid;
    return `<div class="hold job">
      <div class="row between"><b>${esc(C.lineName(j.lineId))} · ${esc(C.prodName(j.productId))}</b><span class="status ${STATUS_CLS[st]}">${esc(t('js_' + st))}</span></div>
      <small>${esc(t('startedBy', { d: C.fmtDT(j.startedAt), by: j.leader, crew: j.crew || '—' }))}${j.closedAt ? ' · ' + esc(t('closedBy', { d: C.fmtDT(j.closedAt), by: j.closedBy })) : ''}</small>
      <div class="kv"><span>${esc(t('grainToMill'))}</span><b>${fmtKg(j.grainKg)} kg</b></div>
      <div class="kv"><span>${esc(t('fromBins'))}${j.mode === 'blend' ? ' · ' + esc(t('mode_blend')) : ''}</span><b>${allocText(j.alloc)}</b></div>
      ${j.sourceComps ? `<div><small>${esc(Object.keys(j.sourceComps).map(k => k + ': ' + compText(j.sourceComps[k])).join(' · '))}</small></div>` : ''}
      ${j.recipe && P.recipeSet(j.recipe) ? `<div class="kv"><span>${esc(t('jobRecipe'))}</span><b>${esc(j.recipe.colours.join('/'))} · ${esc(j.recipe.grades.map(g => t('g_' + g)).join('/'))}</b></div>` : ''}
      ${j.offRecipeAuth ? `<div class="banner b-warn"><small>${esc(t('authOnJob', { s: (j.offRecipe || []).map(x => x.bin || x.silo).join(', '), by: j.offRecipeAuth.by, r: j.offRecipeAuth.reason }))}</small></div>`
        : (j.offRecipe || []).length ? `<div class="banner b-warn"><small>${esc(t('offRecipeOnJob', { s: j.offRecipe.map(x => x.bin || x.silo).join(', ') }))}</small></div>` : ''}
      <div class="kv"><span>${esc(t('temperedBin'))}</span><b>${esc((j.tempered || []).join(', ') || '—')}</b></div>
      <div class="kv"><span>${esc(t('toBins'))}</span><b>${esc((j.bins || []).join(', '))}</b></div>
      <div class="kv"><span>${esc(t('moistureFromTo'))}</span><b>${esc(C.fmtNum(j.m0))} → ${esc(C.fmtNum(j.m1))} % · ${esc(t('impurities'))} ${esc(C.fmtNum(j.impurities))} %</b></div>
      <div class="kv"><span>${esc(t('water'))}</span><b>${fmtKg(j.waterLh)} L/h · ${esc(t('total'))} ${fmtKg(j.waterL)} L</b></div>
      <div class="kv"><span>${esc(t('expectedProduct'))}</span><b>${isNum(j.expectedKg) ? fmtKg(j.expectedKg) + ' kg (' + esc(C.fmtNum(j.extraction)) + ' %)' : esc(t('extractionNotSet'))}</b></div>
      ${j.status === 'done' && isNum(j.actualKg) ? `<div class="kv"><span>${esc(t('actualGrain'))}</span><b>${fmtKg(j.actualKg)} kg</b></div>` : ''}
      ${j.closeNote ? `<p><small>${esc(j.closeNote)}</small></p>` : ''}
      ${readingsBlock(j)}
      ${qc}
      ${j.status === 'running' && !closing ? `<button class="btn ghost small" data-closejob="${esc(j.uid)}">${esc(t('closeJob'))}</button>` : ''}
      ${closing ? `<div class="holdform">
        <label class="fld">${esc(t('closeAs'))}<select id="cj_status"><option value="done">${esc(t('js_done'))}</option><option value="cancelled">${esc(t('js_cancelled'))}</option></select></label>
        <label class="fld">${esc(t('actualGrain'))} (kg) <small>${esc(t('optional'))}</small><input inputmode="decimal" id="cj_kg"></label>
        <label class="fld req">${esc(t('shiftLeader'))}${leaderField('id="cj_by"', defLeader())}</label>
        <label class="fld">${esc(t('notes'))}<textarea id="cj_note" rows="2"></textarea></label>
        <button class="btn primary" data-pact="closejob">${esc(t('closeJob'))}</button> <button class="btn ghost" data-pact="cancelclose">${esc(t('cancel'))}</button>
      </div>` : ''}
    </div>`;
  }
  // Humidade do milho por turno: histórico + registo do turno actual
  function readingsBlock(j) {
    const rs = (j.readings || []).slice().sort((a, b) => a.t - b.t);
    const need = P.needsShiftReading(j, L.shiftOf(now()).start);
    const last = rs[rs.length - 1];
    const prev = S.readForm && S.readForm.uid === j.uid ? P.readingCalc(j, S.readForm.m0) : null;
    return `<div class="due"><div class="sub">${esc(t('maizeMoisture'))}</div>
      ${need ? `<div class="banner b-warn">${esc(t('needReading'))}</div>` : ''}
      ${rs.map(r => `<div class="kv"><span>${esc(C.fmtDT(r.t))} · ${esc(t('crew'))} ${esc(r.crew || '—')}${r.kind === 'start' ? ' · ' + esc(t('atStart')) : ''}</span><b class="${r.over ? 'txt-reject' : ''}">${esc(C.fmtNum(r.m0))} % → ${fmtKg(r.waterLh)} L/h</b></div>`).join('')}
      ${j.status === 'running' ? `<div class="grid2"><label class="fld">${esc(t('m0Now'))} (%)<input inputmode="decimal" data-rd="${esc(j.uid)}" value="${esc(S.readForm && S.readForm.uid === j.uid ? S.readForm.m0 : '')}"></label>
        <label class="fld">${esc(t('name'))}<input id="rd_by_${esc(j.uid)}" value="${esc(S.operator)}"></label></div>
        <div id="rdc_${esc(j.uid)}">${readPreview(j, prev)}</div>
        <button class="btn small" data-pact="savereading" data-uid="${esc(j.uid)}">${esc(t('saveReading'))}</button>` : (last ? '' : '')}</div>`;
  }
  function readPreview(j, c) {
    if (!c) return '';
    if (c.error) return `<small class="txt-reject">${esc(t('invalid'))}</small>`;
    return `<small class="${c.over ? 'txt-reject' : ''}">${esc(t('newWaterRate', { lh: fmtKg(c.waterLh), m1: C.fmtNum(j.m1), max: fmtKg(j.dampenerMaxLh) }))}${c.over ? ' — ' + esc(t('overDampener')) : ''}${c.noWater ? ' — ' + esc(t('jw_no_water')) : ''}</small>`;
  }
  async function saveReading(uid) {
    const j = S.jobs.find(x => x.uid === uid);
    if (!j || j.status !== 'running') return;
    if (!S.crew) return C.toast(t('selectCrew'));
    const c = P.readingCalc(j, S.readForm && S.readForm.uid === uid ? S.readForm.m0 : '');
    if (c.error) return C.toast(t('fixInvalid'));
    const by = ($('#rd_by_' + CSS.escape(uid)) || {}).value || '';
    if (!by.trim()) return C.toast(t('needName'));
    const tms = now(), sh = L.shiftOf(tms);
    const rd = { uuid: newUid(), t: tms, crew: S.crew, period: sh.period, prodDay: sh.day, m0: c.m0, waterLh: c.waterLh, over: c.over, by: by.trim(), kind: 'shift' };
    try { await DB.put('jobs', Object.assign({}, j, { readings: (j.readings || []).concat([rd]) })); } catch (e) { return C.toast(t('saveFailed')); }
    S.readForm = null; S.operator = rd.by; await DB.setConfig('operator', S.operator);
    await reload(); C.toast(c.over ? t('overDampener') : t('readingSaved', { lh: fmtKg(c.waterLh) })); keepScroll();
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
    S.jobForm = { productId: '', lineId: line ? line.id : '', grainKg: '', mode: 'seq', sources: [], blend: {}, tempered: [], bins: [], m0: '', impurities: '', m1: '', feedTph: '',
      recipe: { colours: [], grades: [] }, targetExtraction: '', leader: defLeader() };
  }
  const ctxFor = () => ({ cfgP: S.cfgP, millType: S.cfg.millType, moves: S.moves, jobs: S.jobs, binEvents: S.binEvents, now: now(), shiftStart: L.shiftOf(now()).start });
  function jobFormView() {
    const f = S.jobForm;
    const recipe = f.recipe;
    const tphDef = f.lineId ? P.defaultFeedTph(S.cfgP, f.lineId) : null;
    const srcRows = (S.cfgP.dirtyBins || []).filter(b => !f.lineId || b.lines.indexOf(f.lineId) >= 0).map(b => {
      const idx = f.sources.indexOf(b.id);
      const st = dirtyState(b.id);
      const bad = P.recipeSet(recipe) ? st.comps.map(c => P.recipeFit(recipe, c, S.cfg.millType)).filter(x => !x.ok) : [];
      const hard = bad.find(x => x.why !== 'colour' && x.why !== 'grade');
      const chip = st.kg <= 0 ? '' : !P.recipeSet(recipe) ? `<span class="chip d-record">${esc(t('recipeFirst'))}</span>`
        : hard ? `<span class="chip d-reject">${esc(t('why_' + hard.why))}</span>`
        : bad.length ? `<span class="chip d-warn">${esc(t('why_' + bad[0].why))}</span>` : `<span class="chip d-accept">${esc(t('compatible'))}</span>`;
      return `<button class="pick ${idx >= 0 ? 'on' : ''}" data-jsrc="${esc(b.id)}">${idx >= 0 ? `<i class="ord">${idx + 1}</i>` : ''}<b>${esc(b.id)}</b>
        <small>${st.kg > 0 ? fmtKg(st.kg) + ' kg · ' + esc(compText(st.comps)) : esc(t('binEmpty'))}</small>${chip}</button>`;
    }).join('');
    const tempRows = (S.cfgP.temperedBins || []).filter(b => !f.lineId || b.lines.indexOf(f.lineId) >= 0).map(b =>
      `<button class="pick ${f.tempered.indexOf(b.id) >= 0 ? 'on' : ''}" data-jtemp="${esc(b.id)}"><b>${esc(b.id)}</b><small>${esc(t('fedBy'))} ${esc(b.lines.join('/'))}${isNum(b.capT) ? ' · ' + fmtKg(b.capT) + ' t' : ''}</small></button>`).join('');
    const lineBins = S.cfgP.bins.filter(b => !f.lineId || b.lines.indexOf(f.lineId) >= 0);
    const binRows = lineBins.map(b => {
      const st = P.binState(b.id, S.binEvents);
      const on = f.bins.indexOf(b.id) >= 0;
      const clash = st.productId && f.productId && st.productId !== f.productId;
      return `<button class="pick ${on ? 'on' : ''}" data-jbin="${esc(b.id)}"><b>${esc(b.id)}</b><small>${esc(t('fedBy'))} ${esc(b.lines.join('/'))}${isNum(b.capT) ? ' · ' + fmtKg(b.capT) + ' t' : ''}</small>
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
    </section>
    <section class="card"><h3>${esc(t('jobRecipe'))}</h3><p class="sub">${esc(t('jobRecipeHelp'))}</p>
      <div class="sub req">${esc(t('recipeColours'))}</div><div class="picks">${P.COLOURS.map(c => `<button class="pick ${recipe.colours.indexOf(c) >= 0 ? 'on' : ''}" data-jrc="${esc(c)}"><b>${esc(c)}</b></button>`).join('')}</div>
      <div class="sub req">${esc(t('recipeGrades'))}</div><div class="picks">${P.SILO_GRADES.map(g => `<button class="pick ${recipe.grades.indexOf(g) >= 0 ? 'on' : ''}" data-jrg="${esc(g)}"><b>${esc(t('g_' + g))}</b></button>`).join('')}</div>
      <div class="grid2"><label class="fld req">${esc(t('extraction'))} (%)<input inputmode="decimal" data-jfi="targetExtraction" value="${esc(f.targetExtraction)}"></label></div>
      <p class="sub">${esc(t('extractionHelp'))}</p></section>
    <section class="card"><h3>${esc(t('rawMaterial'))}</h3>
      <div class="seg mode"><button data-jmode="seq" class="${f.mode !== 'blend' ? 'on ok' : ''}">${esc(t('mode_seq'))}</button><button data-jmode="blend" class="${f.mode === 'blend' ? 'on ok' : ''}">${esc(t('mode_blend'))}</button></div>
      <p class="sub">${esc(t(f.mode === 'blend' ? 'binsBlend' : 'binsOrder'))}</p>${f.lineId ? '' : `<p class="sub">${esc(t('pickLineFirst'))}</p>`}<div class="picks">${srcRows}</div>
      ${f.mode === 'blend' && f.sources.length ? blendTable(f) : ''}
      <h3>${esc(t('temperedBin'))}</h3><div class="picks">${tempRows}</div></section>
    <section class="card"><h3>${esc(t('grainSpecs'))}</h3>
      <div class="grid3">
        ${f.mode === 'blend' ? '' : `<label class="fld req">${esc(t('m0'))} (%)<input inputmode="decimal" data-jfi="m0" value="${esc(f.m0)}"></label>
        <label class="fld req">${esc(t('impurities'))} (%)<input inputmode="decimal" data-jfi="impurities" value="${esc(f.impurities)}"></label>`}
        <label class="fld req">${esc(t('m1'))} (%)<input inputmode="decimal" data-jfi="m1" value="${esc(f.m1)}"></label>
      </div>
      ${f.mode === 'blend' ? `<p class="sub">${esc(t('blendMoistNote'))}</p>` : ''}
      <p class="sub">${esc(t('waterHint'))}</p></section>
    <section class="card"><h3>${esc(t('toBins'))}</h3>${f.lineId ? '' : `<p class="sub">${esc(t('pickLineFirst'))}</p>`}<div class="picks">${binRows}</div>
      <p class="sub">${esc(t('binSourceNote', { s: S.cfgP.binSource || '' }))}</p></section>
    <section class="card">
      <label class="fld req">${esc(t('shiftLeader'))}${leaderField('data-jfl="leader"', f.leader)}</label>
      ${!P.leaderNames(S.cfgP).length ? `<p class="sub">${esc(t('leadersNotSet'))}</p>` : ''}
      <div id="jobCheck">${jobCheckHtml()}</div>
      <button class="btn primary big" data-pact="startjob">${esc(t('startJob'))}</button>
      <button class="btn ghost" data-pact="canceljob">${esc(t('cancel'))}</button></section>`;
  }
  function blendTable(f) {
    return `<div class="tablewrap"><table class="blend"><thead><tr><th>${esc(t('silo'))}</th><th>%</th><th>${esc(t('m0'))} %</th><th>${esc(t('impurities'))} %</th></tr></thead><tbody>
      ${f.sources.map(id => { const b = f.blend[id] || {}; return `<tr><td><b>${esc(id)}</b></td>
        <td><input inputmode="decimal" data-jbl="${esc(id)}|pct" value="${esc(b.pct || '')}"></td>
        <td><input inputmode="decimal" data-jbl="${esc(id)}|m0" value="${esc(b.m0 || '')}"></td>
        <td><input inputmode="decimal" data-jbl="${esc(id)}|impurities" value="${esc(b.impurities || '')}"></td></tr>`; }).join('')}
      </tbody></table></div>`;
  }
  function errText(e) {
    const v = Object.assign({}, e);
    if (e.field) v.field = t('f_' + e.field);
    if (e.current) v.current = C.prodName(e.current);
    if (isNum(e.short)) v.short = fmtKg(e.short);
    if (isNum(e.need)) v.need = fmtKg(e.need);
    if (isNum(e.cap)) v.cap = fmtKg(e.cap);
    if (isNum(e.max)) v.max = fmtKg(e.max);
    if (e.code === 'source_incompatible') return t('je_source_incompatible', { bin: e.bin, why: t('why_' + e.why) });
    return t('je_' + e.code, v);
  }
  function jobCheckHtml() {
    const r = P.validateJob(S.jobForm, ctxFor());
    const c = r.calc;
    const rows = [];
    if (S.jobForm.mode === 'blend' && isNum(c.m0)) rows.push(`<div class="kv"><span>${esc(t('blendM0'))}</span><b>${esc(C.fmtNum(c.m0))} % · ${esc(t('impurities'))} ${esc(C.fmtNum(c.impurities))} %</b></div>`);
    if (isNum(c.waterL)) rows.push(`<div class="kv"><span>${esc(t('waterTotal'))}</span><b>${fmtKg(c.waterL)} L</b></div>`);
    if (isNum(c.waterLh)) rows.push(`<div class="kv"><span>${esc(t('waterRate'))}</span><b class="${c.waterLh > S.cfgP.dampenerMaxLh ? 'txt-reject' : ''}">${fmtKg(c.waterLh)} L/h <small>(${esc(t('max'))} ${fmtKg(S.cfgP.dampenerMaxLh)})</small></b></div>`);
    if (isNum(c.hours)) rows.push(`<div class="kv"><span>${esc(t('duration'))}</span><b>${esc(C.fmtNum(c.hours))} h @ ${esc(C.fmtNum(c.feedTph))} t/h</b></div>`);
    if (isNum(c.expectedKg)) rows.push(`<div class="kv"><span>${esc(t('expectedProduct'))}</span><b>${fmtKg(c.expectedKg)} kg (${esc(C.fmtNum(c.extraction))} %)</b></div>`);
    if (c.alloc && c.alloc.length) rows.push(`<div class="kv"><span>${esc(t('fromBins'))}</span><b>${allocText(c.alloc)}</b></div>`);
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
    const tms = now();
    const sourceComps = {};
    f.sources.forEach(id => { sourceComps[id] = dirtyState(id).comps; });   // conteúdo de cada silo de moagem no arranque (rastreabilidade)
    const job = Object.assign(base(tms), {
      status: 'running', startedAt: tms, millType: S.cfg.millType, productId: f.productId, lineId: f.lineId,
      grainKg: r.values.grainKg, mode: f.mode === 'blend' ? 'blend' : 'seq', sources: f.sources.slice(), sourceComps, alloc: r.calc.alloc,
      tempered: f.tempered.slice(), bins: f.bins.slice(),
      blendInputs: f.mode === 'blend' ? JSON.parse(JSON.stringify(f.blend)) : null,
      offRecipe: r.calc.offRecipe,
      m0: r.values.m0, m1: r.values.m1, impurities: r.values.impurities, feedTph: r.calc.feedTph,
      waterL: r.calc.waterL, waterLh: r.calc.waterLh, expectedKg: isNum(r.calc.expectedKg) ? r.calc.expectedKg : null,
      extraction: r.calc.extraction, extractionRaw: String(f.targetExtraction), dampenerMaxLh: S.cfgP.dampenerMaxLh,
      recipe: { colours: f.recipe.colours.slice(), grades: f.recipe.grades.slice(), source: 'job' },
      warnings: r.warnings.map(w => w.code + (w.bin ? ':' + w.bin : '')),
      leader: String(f.leader).trim(), leaderCrew: leaderCrewOf(String(f.leader).trim())
    });
    job.readings = [{ t: tms, crew: S.crew, period: job.period, prodDay: job.prodDay, m0: job.m0, waterLh: job.waterLh, by: job.leader, kind: 'start' }];
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
    const nj = Object.assign({}, j, { status, closedAt: now(), closedBy: by, closedByCrew: leaderCrewOf(by), actualKg: kg, closeNote: $('#cj_note').value.trim() });
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
    const sm = P.shiftSummary(ls.day, ls.period, range, { log: S.shiftLog, jobs: S.jobs, now: now(), codes: codes() });
    const f = S.logForm;
    return `<section class="card"><h3>${esc(t('shiftLog'))}</h3>
      <div class="grid2"><label class="fld">${esc(t('prodDay'))}<input type="date" id="logDay" value="${esc(ls.day)}"></label>
      <label class="fld">${esc(t('shift'))}<select id="logPeriod"><option value="D" ${ls.period === 'D' ? 'selected' : ''}>${esc(t('shift_D'))} 07–19</option><option value="N" ${ls.period === 'N' ? 'selected' : ''}>${esc(t('shift_N'))} 19–07</option></select></label></div>
      <div class="kpis k4"><div><b>${sm.jobs.length}</b><span>${esc(t('ptab_jobs'))}</span></div><div class="${sm.openIssues ? 'd-warn' : ''}"><b>${sm.issues.length}</b><span>${esc(t('issues'))}</span></div>
        <div><b>${sm.downtimeMin}</b><span>${esc(t('downtimeMin'))}</span></div><div><b>${sm.acts.length}</b><span>${esc(t('activities'))}</span></div></div>
      ${Object.keys(sm.byV2).length ? `<p class="sub">${esc(t('byV2'))}: ${Object.keys(sm.byV2).map(k => esc(v2Label(k)) + ' ' + sm.byV2[k] + ' min').join(' · ')}<br>${esc(t('byOee'))}: ${Object.keys(sm.byOee).map(k => esc(oeeLabel(k)) + ' ' + sm.byOee[k] + ' min').join(' · ')}</p>` : ''}
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
        <label class="fld">${esc(t('downtimeCode'))}<select data-lf="code"><option value="">— ${esc(t('noStopCode'))}</option>${GROUPS.map(([g, k]) => `<optgroup label="${esc(t(k))}">${codes().filter(c => c.code[0] === g && c.active !== false).map(c => `<option value="${esc(c.code)}" ${f.code === c.code ? 'selected' : ''}>${esc(c.code + ' ' + cName(c))}</option>`).join('')}</optgroup>`).join('')}
        ${codes().some(c => c.active !== false && GROUPS.every(([g]) => c.code[0] !== g)) ? `<optgroup label="${esc(t('cg_X'))}">${codes().filter(c => c.active !== false && GROUPS.every(([g]) => c.code[0] !== g)).map(c => `<option value="${esc(c.code)}" ${f.code === c.code ? 'selected' : ''}>${esc(c.code + ' ' + cName(c))}</option>`).join('')}</optgroup>` : ''}</select></label>
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
    S.logForm = { kind, time: C.localInput(now()), lineId: '', code: '', equipment: '', description: '', downtimeMin: '', action: '',
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
      const e = P.validateIssue(f, codes());
      if (e.length) return C.toast(t('fillFields') + ': ' + e.map(x => t('f_' + x)).join(', '));
      const dt = P.num(f.downtimeMin);
      rec = Object.assign(base(tms), { kind: 'issue', t: tms, lineId: f.lineId, code: f.code || null, codeInfo: f.code ? Object.assign({ source: S.cfgP.codesSource || P.DOWNTIME_SOURCE }, P.findCode(f.code, codes())) : null, equipment: f.equipment.trim(),
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
    const cd = i.codeInfo || P.findCode(i.code, codes());
    const open = i.status !== 'closed';
    const act = S.logAct && S.logAct.uid === i.uid ? S.logAct.mode : null;
    return `<div class="rowitem">
      <div class="row between"><span><b>${esc(C.fmtTime(i.t))}</b>${i.code ? ' · <b>' + esc(codeLabel(i.code, cd)) + '</b> <small>(' + esc(v2Label(cd && cd.v2)) + ')</small>' : ' · ' + esc(t('noStopCode'))}${i.lineId ? ' · ' + esc(C.lineName(i.lineId)) : ''}${i.equipment ? ' · ' + esc(i.equipment) : ''}</span>
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
    lines.push(t('issues') + ': ' + sm.issues.length + ' (' + t('is_open') + ' ' + sm.openIssues + ') · ' + t('downtimeMin') + ': ' + sm.downtimeMin + (Object.keys(sm.byV2).length ? ' (' + Object.keys(sm.byV2).map(k => v2Label(k) + ' ' + sm.byV2[k]).join(', ') + ')' : ''));
    sm.issues.forEach(i => lines.push('• ' + C.fmtTime(i.t) + ' ' + (i.code ? codeLabel(i.code, i.codeInfo) : t('noStopCode')) + (i.lineId ? ' ' + i.lineId : '') + ': ' + i.description + (isNum(i.downtimeMin) ? ' (' + i.downtimeMin + ' min)' : '')));
    if (sm.acts.length) lines.push(t('activities') + ': ' + sm.acts.map(a => t('at_' + (ACT.has(a.type) ? a.type : 'other')) + (a.floor ? ' ' + a.floor : '')).join('; '));
    return lines.join('\n');
  }
  function shiftWorkbook(ls, sm, range) {
    const XLSX = window.XLSX, wb = XLSX.utils.book_new();
    const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name.slice(0, 31));
    add(t('x_jobs'), [[t('waShiftTitle', { d: ls.day, s: t('shift_' + ls.period) })], [],
      [t('line'), t('product'), t('status'), t('startedAt'), t('closedAt'), t('shiftLeader'), t('crew'), t('grainToMill') + ' (kg)', t('fromBins'), t('binContents'), t('temperedBin'), t('toBins'),
        t('m0'), t('impurities'), t('m1'), t('feedRate') + ' (t/h)', t('waterRate') + ' (L/h)', t('waterTotal') + ' (L)', t('jobRecipe'), t('x_offRecipe'), t('extraction') + ' %', t('expectedProduct') + ' (kg)', t('actualGrain') + ' (kg)', t('notes')],
      ...sm.jobs.map(j => [C.lineName(j.lineId), C.prodName(j.productId), t('js_' + (JOB_ST[j.status] ? j.status : 'running')), C.fmtDT(j.startedAt), j.closedAt ? C.fmtDT(j.closedAt) : '',
        j.leader, j.crew, j.grainKg, (j.alloc || []).map(a => (a.bin || a.silo) + '=' + a.kg).join('; '),
        j.sourceComps ? Object.keys(j.sourceComps).map(k => k + ': ' + compText(j.sourceComps[k])).join(' | ') : '', (j.tempered || []).join(', '), (j.bins || []).join(', '), j.m0, j.impurities, j.m1, j.feedTph, j.waterLh, j.waterL,
        j.recipe && P.recipeSet(j.recipe) ? j.recipe.colours.join('/') + ' · ' + j.recipe.grades.join('/') : '',
        (j.offRecipe || []).map(x => x.bin || x.silo).join(', ') + (j.offRecipeAuth ? ' (' + j.offRecipeAuth.by + ': ' + j.offRecipeAuth.reason + ')' : ''),
        isNum(j.extraction) ? j.extraction : '', isNum(j.expectedKg) ? j.expectedKg : '', isNum(j.actualKg) ? j.actualKg : '', j.closeNote || ''])]);
    const mvs = (S.moves || []).filter(m => m.t >= range[0] && m.t < range[1]).sort((a, b) => a.t - b.t);
    add(t('x_moves'), [[t('dateTime'), t('crew'), t('type'), t('dirtyBin'), t('silo'), 'kg', t('colour'), t('grade'), t('name')],
      ...[].concat(...mvs.map(m => m.type === 'EMPTY' ? [[C.fmtDT(m.t), m.crew, t('mv_EMPTY'), m.binId, '', m.bookKg, '', '', m.by]]
        : (m.parts || []).map(pt => [C.fmtDT(m.t), m.crew, t('mv_TRANSFER'), m.binId, pt.silo, pt.kg, pt.colour, gradeName(pt.grade), m.by])))]);
    add(t('dirtyBins'), [[t('dirtyBin'), t('fedBy'), t('capacityT'), 'kg', t('binContents')],
      ...(S.cfgP.dirtyBins || []).map(b => { const st = dirtyState(b.id); return [b.id, b.lines.join('/'), isNum(b.capT) ? b.capT : '', st.kg, compText(st.comps)]; })]);
    const rds = [];
    (S.jobs || []).forEach(j => (j.readings || []).forEach(r => { if (r.t >= range[0] && r.t < range[1]) rds.push([C.fmtDT(r.t), r.crew, C.lineName(j.lineId), C.prodName(j.productId), r.m0, j.m1, r.waterLh, r.over ? t('overDampener') : '', r.by, r.kind === 'start' ? t('atStart') : '']); }));
    add(t('maizeMoisture'), [[t('dateTime'), t('crew'), t('line'), t('product'), t('maizeMoistureCol') + ' %', t('m1') + ' %', t('waterRate') + ' (L/h)', '', t('name'), ''], ...rds]);
    add(t('issues'), [[t('dateTime'), t('crew'), t('line'), t('downtimeCode'), t('codeName'), t('codeNamePt'), 'V1', 'V2', 'Tier 3', t('oeeTreat'), t('equipment'), t('issueDesc'), t('downtimeMin'), t('actionCol'), t('status'), t('reportedBy'), t('closedAt'), t('resolution')],
      ...sm.issues.map(i => { const d = i.codeInfo || P.findCode(i.code, codes()) || {}; return [C.fmtDT(i.t), i.crew, i.lineId ? C.lineName(i.lineId) : '', i.code || '', d.name || '', d.namePt || '', d.v1 || '', d.v2 || '', d.tier3 || '', d.oee ? t('oee_' + d.oee) : '', i.equipment, i.description,
        isNum(i.downtimeMin) ? i.downtimeMin : '', i.action, i.status === 'closed' ? t('is_closed') : t('is_open'), i.by, i.closedAt ? C.fmtDT(i.closedAt) : '', i.resolution || '']; })]);
    add(t('byV2'), [['V2', t('downtimeMin')], ...Object.keys(sm.byV2).map(k => [v2Label(k), sm.byV2[k]]), [], [t('oeeTreat'), t('downtimeMin')],
      ...Object.keys(sm.byOee).map(k => [oeeLabel(k), sm.byOee[k]]), [], [t('codesSource', { s: S.cfgP.codesSource || P.DOWNTIME_SOURCE })]]);
    add(t('activities'), [[t('dateTime'), t('crew'), t('line'), t('activityType'), t('floor'), t('qtyKg'), t('product'), t('description'), t('doneBy')],
      ...sm.acts.map(a => [C.fmtDT(a.t), a.crew, a.lineId ? C.lineName(a.lineId) : '', t('at_' + (ACT.has(a.type) ? a.type : 'other')), a.floor || '', isNum(a.qtyKg) ? a.qtyKg : '',
        a.productId ? C.prodName(a.productId) : '', a.description || '', a.by])]);
    const qa = L.effective(S.samples).filter(s => s.t >= range[0] && s.t < range[1] && (s.decision === 'warn' || s.decision === 'reject')).sort((a, b) => a.t - b.t);
    add(t('x_alerts'), [[t('dateTime'), t('line'), t('product'), t('decision'), t('failures')],
      ...qa.map(s => [C.fmtDT(s.t), C.lineName(s.lineId), C.prodName(s.productId), C.decLabel(s.decision), s.failures.map(f => C.anyLabel(f.param, C.product(s.productId)) + '=' + (f.value === 'abn' ? t('abnormal') : f.value)).join('; ')])]);
    add(t('ptab_bins'), [[t('bin'), t('fedBy'), t('capacityT'), t('content'), t('since')],
      ...S.cfgP.bins.map(b => { const st = P.binState(b.id, S.binEvents); return [b.id, b.lines.join('/'), isNum(b.capT) ? b.capT : '', st.productId ? C.prodName(st.productId) : t('binEmpty'), st.since ? C.fmtDT(st.since) : '']; })]);
    return wb;
  }
  function shiftExcel() {
    const ls = logShift(), range = shiftRange(ls.day, ls.period);
    const sm = P.shiftSummary(ls.day, ls.period, range, { log: S.shiftLog, jobs: S.jobs, now: now(), codes: codes() });
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
        return `<div class="rowitem"><div class="row between"><span><b>${esc(b.id)}</b> <small>${esc(t('fedBy'))} ${esc(b.lines.join('/'))}${isNum(b.capT) ? ' · ' + fmtKg(b.capT) + ' t' : ''}</small></span>
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
    return `<section class="card"><h3>${esc(t('prodSettings'))}</h3>
      <p class="sub">${esc(t('prodSettingsSummary', { c: lineIds().map(id => id + ' ' + fmtKg(c.lineTpd[id]) + ' t/d').join(' · '), d: fmtKg(c.dampenerMaxLh), b: c.bins.length }))}</p>
      <button class="btn" data-nav="prodset">${esc(t('editProdSettings'))}</button></section>
      <section class="card"><h3>${esc(t('codesTitle'))}</h3>
      <p class="sub">${esc(t('codesSummary', { n: codes().filter(c => c.active !== false).length, s: S.cfgP.codesSource || '', pt: codes().filter(c => c.namePt).length, o: codes().filter(c => c.oee).length }))}</p>
      <button class="btn" data-nav="codes">${esc(t('editCodes'))}</button></section>`;
  }
  function viewProdSet() {
    if (!S.prodDraft) S.prodDraft = JSON.parse(JSON.stringify(S.cfgP));
    const d = S.prodDraft;
    return `<section class="card"><h2>${esc(t('prodSettings'))}</h2><p class="sub">${esc(t('prodSettingsNote'))}</p>
      <div class="grid2">${lineIds().map(id => `<label class="fld">${esc(t('lineCap', { l: C.lineName(id) }))}<input inputmode="decimal" data-ps="tpd|${esc(id)}" value="${esc(C.fmtNum(d.lineTpd[id]))}"></label>`).join('')}
      <label class="fld">${esc(t('dampenerMax'))}<input inputmode="decimal" data-ps="damp" value="${esc(C.fmtNum(d.dampenerMaxLh))}"></label></div></section>
      <section class="card"><h3>${esc(t('masterData'))}</h3><p class="sub">${esc(t('masterHelp'))}</p>
        <label class="fld">${esc(t('grainSilosList'))}<textarea rows="2" data-ps="grainSilos">${esc((d.grainSilos || []).join(', '))}</textarea></label>
        <p class="sub">${esc(t('binsHelp'))}</p>
        <label class="fld">${esc(t('dirtyBins'))}<textarea rows="2" data-ps="dirtyBins">${esc(P.binsText(d.dirtyBins || []))}</textarea></label>
        <label class="fld">${esc(t('temperedBins'))}<textarea rows="2" data-ps="temperedBins">${esc(P.binsText(d.temperedBins || []))}</textarea></label>
        <label class="fld">${esc(t('ptab_bins'))}<textarea rows="4" data-ps="bins">${esc(P.binsText(d.bins))}</textarea></label>
        <h3>${esc(t('leaders'))}</h3><p class="sub">${esc(t('leadersHelp'))}</p>
        <div class="grid2">${['A', 'B', 'C', 'D'].map(k => `<label class="fld">${esc(t('crew'))} ${k}<input data-ps="leader|${k}" value="${esc((d.leaders || {})[k] || '')}" maxlength="60"></label>`).join('')}</div>
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
    document.querySelectorAll('[data-ps]').forEach(el => {
      const [k, a, b] = el.dataset.ps.split('|');
      if (k === 'tpd') { const v = P.num(el.value); if (v === null || isNaN(v) || v <= 0) bad.push(t('lineCap', { l: a })); else n.lineTpd[a] = v; }
      if (k === 'damp') { const v = P.num(el.value); if (v === null || isNaN(v) || v <= 0) bad.push(t('dampenerMax')); else n.dampenerMaxLh = v; }
      if (k === 'bins') { const r = P.parseBins(el.value, lineIds()); if (r.errors.length || !r.bins.length) bad.push(t('ptab_bins') + ': ' + (r.errors.join(' | ') || '—')); else n.bins = r.bins; }
      if (k === 'dirtyBins' || k === 'temperedBins') { const r = P.parseBins(el.value, lineIds()); if (r.errors.length || !r.bins.length) bad.push(t(k) + ': ' + (r.errors.join(' | ') || '—')); else n[k] = r.bins; }
      if (k === 'grainSilos') { const r = P.parseSiloList(el.value); if (r.errors.length || !r.silos.length) bad.push(t('grainSilosList') + ': ' + (r.errors.join(' | ') || '—')); else n.grainSilos = r.silos; }
      if (k === 'leader') { n.leaders = Object.assign({}, n.leaders); n.leaders[a] = el.value.trim().replace(/\s+/g, ' '); }
      if (k === 'floors') n.floors = el.value.split(',').map(x => x.trim()).filter(Boolean).filter((x, i, arr) => arr.indexOf(x) === i);
    });
    if (bad.length) return C.toast(t('limitErrors') + ': ' + bad.join('; '));
    const errs = P.validateProdConfig(n);
    if (errs.length) return C.toast(t('limitErrors') + ': ' + errs.join(', '));
    if (JSON.stringify(n.bins) !== JSON.stringify(S.cfgP.bins)) n.binSource = t('changedBy', { by, d: C.fmtDT(now()).slice(0, 10) });
    if (['grainSilos', 'dirtyBins', 'temperedBins'].some(k => JSON.stringify(n[k]) !== JSON.stringify(S.cfgP[k]))) n.masterSource = P.MASTER_SOURCE + ' + ' + t('changedBy', { by, d: C.fmtDT(now()).slice(0, 10) });
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

  // ---------- códigos de paragem: editor (autorização) ----------
  function viewCodes() {
    const opt = (list, v, lab) => `<option value="">—</option>` + list.map(x => `<option value="${esc(x)}" ${v === x ? 'selected' : ''}>${esc(lab ? lab(x) : x)}</option>`).join('');
    return `<section class="card"><h2>${esc(t('codesTitle'))}</h2><p class="sub">${esc(t('codesHelp'))}</p>
      <p class="sub">${esc(t('oeeProposal'))}</p></section>
      ${codes().map((c, i) => `<details class="card code-ed ${c.active === false ? 'inactive' : ''}"><summary><b>${esc(c.code)}</b> ${esc(cName(c))} <small>· ${esc(v2Label(c.v2))} · ${esc(oeeLabel(c.oee))}${c.active === false ? ' · ' + esc(t('inactive')) : ''}</small></summary>
        <div class="grid2">
          <label class="fld">${esc(t('codeName'))} (EN)<input data-cd="${i}|name" value="${esc(c.name)}"></label>
          <label class="fld">${esc(t('codeNamePt'))}<input data-cd="${i}|namePt" value="${esc(c.namePt || '')}"></label>
          <label class="fld">V2<select data-cd="${i}|v2">${opt(P.V2_CATS, c.v2)}</select></label>
          <label class="fld">Tier 3<select data-cd="${i}|tier3">${opt(P.TIER3, c.tier3)}</select></label>
          <label class="fld">${esc(t('oeeTreat'))}<select data-cd="${i}|oee">${opt(P.OEE_TREAT, c.oee, o => t('oee_' + o))}</select></label>
          <label class="chk"><input type="checkbox" data-cd="${i}|active" ${c.active !== false ? 'checked' : ''}> ${esc(t('activeCode'))}</label>
        </div>${c.v1 ? `<p class="sub">V1: ${esc(c.v1)}</p>` : ''}</details>`).join('')}
      <section class="card"><h3>${esc(t('newCode'))}</h3><div class="grid2">
        <label class="fld">${esc(t('downtimeCode'))}<input id="nc_code" placeholder="P25"></label>
        <label class="fld">${esc(t('codeName'))} (EN)<input id="nc_name"></label></div><p class="sub">${esc(t('newCodeHelp'))}</p></section>
      <section class="card"><label class="fld req">${esc(t('supervisor'))}<input id="cdBy"></label>
        <label class="fld req">${esc(t('reason'))}<input id="cdReason"></label>
        <label class="fld req">${esc(t('pin'))}<input type="password" inputmode="numeric" id="cdPin"></label>
        <button class="btn primary big" data-pact="savecodes">${esc(t('save'))}</button>
        <button class="btn ghost" data-nav="settings">${esc(t('cancel'))}</button></section>`;
  }
  async function saveCodes() {
    const by = $('#cdBy').value.trim(), reason = $('#cdReason').value.trim();
    if (!by || !reason) return C.toast(t('needByReason'));
    const list = JSON.parse(JSON.stringify(codes()));
    document.querySelectorAll('[data-cd]').forEach(el => {
      const [i, f] = el.dataset.cd.split('|'); const c = list[Number(i)]; if (!c) return;
      if (f === 'active') c.active = el.checked;
      else { const v = el.value.trim(); c[f] = v === '' ? (f === 'name' ? '' : null) : v; }
    });
    const nc = $('#nc_code').value.trim().toUpperCase(), nn = $('#nc_name').value.trim();
    if (nc || nn) list.push({ code: nc, name: nn, namePt: null, v1: null, v2: null, tier3: null, oee: null, active: true });
    const errs = P.validateCodes(list);
    if (errs.length) return C.toast(t('limitErrors') + ': ' + errs.join(', '));
    const n = Object.assign({}, S.cfgP, { downtimeCodes: list });
    const diff = P.prodConfigDiff(S.cfgP, n);
    if (!diff.length) return C.toast(t('noChanges'));
    const r = await C.checkPin($('#cdPin').value);
    if (!r.ok) return C.toast(C.pinMsg(r));
    n.codesSource = (P.DOWNTIME_SOURCE) + ' + ' + t('changedBy', { by, d: C.fmtDT(now()).slice(0, 10) });
    const tms = now();
    try {
      await DB.batch(diff.map(x => ({ store: 'prodChanges', op: 'add', obj: Object.assign(base(tms), { t: tms, by, reason }, x) })));
      await DB.setConfig('cfgP', n);
    } catch (e) { return C.toast(t('saveFailed')); }
    S.cfgP = n; await reload(); C.toast(t('limitsSaved', { n: diff.length })); S.view = 'settings'; C.render(); window.scrollTo(0, 0);
  }

  // ---------- início: resumo por linha ----------
  function homeLine(lineId) {
    const j = runningJob(lineId);
    if (!j) return '';
    const rs = (j.readings || []), lw = rs.length ? rs[rs.length - 1].waterLh : j.waterLh;
    return `<div class="banner b-info" data-nav="prod">▶ ${esc(t('jobOnLine', { p: C.prodName(j.productId), kg: fmtKg(j.grainKg), w: fmtKg(lw), h: C.fmtTime(j.startedAt) }))}</div>
      ${P.needsShiftReading(j, L.shiftOf(now()).start) ? `<div class="banner b-warn" data-nav="prod">${esc(t('needReading'))}</div>` : ''}`;
  }

  // ---------- eventos ----------
  const CLICK_SEL = '[data-ptab],[data-pact],[data-closejob],[data-jsrc],[data-jrc],[data-jrg],[data-jtemp],[data-trsilo],[data-emptydirty],[data-jbin],[data-jmode],[data-logact],[data-binact]';
  async function onClick(el) {
    if (el.dataset.ptab) { S.prodTab = el.dataset.ptab; C.render(); return; }
    if (el.dataset.closejob) { S.closeJob = el.dataset.closejob; keepScroll(); return; }
    if (el.dataset.jsrc) { const f = S.jobForm, i = f.sources.indexOf(el.dataset.jsrc); if (i >= 0) { f.sources.splice(i, 1); delete f.blend[el.dataset.jsrc]; } else f.sources.push(el.dataset.jsrc); keepScroll(); return; }
    if (el.dataset.jrc || el.dataset.jrg) {
      const list = el.dataset.jrc ? S.jobForm.recipe.colours : S.jobForm.recipe.grades, v = el.dataset.jrc || el.dataset.jrg;
      const i = list.indexOf(v); if (i >= 0) list.splice(i, 1); else list.push(v); keepScroll(); return;
    }
    if (el.dataset.jtemp) { const f = S.jobForm, i = f.tempered.indexOf(el.dataset.jtemp); if (i >= 0) f.tempered.splice(i, 1); else f.tempered.push(el.dataset.jtemp); keepScroll(); return; }
    if (el.dataset.trsilo) { const f = S.trForm, i = f.silos.indexOf(el.dataset.trsilo); if (i >= 0) f.silos.splice(i, 1); else f.silos.push(el.dataset.trsilo); f.silosConfirmed = false; keepScroll(); return; }
    if (el.dataset.emptydirty) { S.emptyBin = el.dataset.emptydirty; keepScroll(); return; }
    if (el.dataset.jmode) { S.jobForm.mode = el.dataset.jmode === 'blend' ? 'blend' : 'seq'; keepScroll(); return; }
    if (el.dataset.jbin) { const f = S.jobForm, i = f.bins.indexOf(el.dataset.jbin); if (i >= 0) f.bins.splice(i, 1); else f.bins.push(el.dataset.jbin); keepScroll(); return; }
    if (el.dataset.logact) { S.logAct = { uid: el.dataset.uid, mode: el.dataset.logact === 'close' ? 'close' : 'void' }; keepScroll(); return; }
    if (el.dataset.binact) { S.binAct = { id: el.dataset.bin, mode: el.dataset.binact === 'set' ? 'set' : 'empty' }; keepScroll(); return; }
    switch (el.dataset.pact) {
      case 'newjob': newJobForm(); keepScroll(); return;
      case 'newtransfer': newTransferForm(); keepScroll(); return;
      case 'canceltransfer': S.trForm = null; keepScroll(); return;
      case 'savetransfer': return saveTransfer();
      case 'emptydirty': return emptyDirty();
      case 'cancelempty': S.emptyBin = null; keepScroll(); return;
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
      case 'savecodes': return saveCodes();
      case 'savereading': return saveReading(el.dataset.uid);
    }
  }
  function onInput(el) {
    if (el.dataset.jbl && S.jobForm) {
      const [id, k] = el.dataset.jbl.split('|');
      S.jobForm.blend[id] = Object.assign({}, S.jobForm.blend[id], { [k]: el.value });
      const b = $('#jobCheck'); if (b) b.innerHTML = jobCheckHtml(); return true;
    }
    if (el.dataset.rd) {
      S.readForm = { uid: el.dataset.rd, m0: el.value };
      const j = S.jobs.find(x => x.uid === el.dataset.rd), box = document.getElementById('rdc_' + el.dataset.rd);
      if (j && box) box.innerHTML = readPreview(j, P.readingCalc(j, el.value)); return true;
    }
    if (el.dataset.jfl && S.jobForm && el.tagName === 'INPUT') { S.jobForm.leader = el.value; const b = $('#jobCheck'); if (b) b.innerHTML = jobCheckHtml(); return true; }
    if (el.dataset.tri && S.trForm) { S.trForm[el.dataset.tri] = el.value; const b = $('#trCheck'); if (b) b.innerHTML = trCheckHtml(); return true; }
    if (el.dataset.jfi && S.jobForm) { S.jobForm[el.dataset.jfi] = el.value; const b = $('#jobCheck'); if (b) b.innerHTML = jobCheckHtml(); return true; }
    if (el.dataset.lf && S.logForm && el.tagName !== 'SELECT') { S.logForm[el.dataset.lf] = el.value; return true; }
    return false;
  }
  function onChange(el) {
    if (el.dataset.jf && S.jobForm) {
      const k = el.dataset.jf;
      S.jobForm[k] = el.type === 'checkbox' ? el.checked : el.value;
      if (k === 'lineId') {
        const keep = (list, id) => { const b = list.find(x => x.id === id); return b && b.lines.indexOf(el.value) >= 0; };
        S.jobForm.bins = S.jobForm.bins.filter(b => keep(S.cfgP.bins, b));
        S.jobForm.tempered = S.jobForm.tempered.filter(b => keep(S.cfgP.temperedBins, b));
        S.jobForm.sources = S.jobForm.sources.filter(b => keep(S.cfgP.dirtyBins, b));
      }
      keepScroll(); return true;
    }
    if (el.dataset.jfl && S.jobForm) { S.jobForm.leader = el.value; const b = $('#jobCheck'); if (b) b.innerHTML = jobCheckHtml(); return true; }
    if (el.dataset.trf && S.trForm) { S.trForm[el.dataset.trf] = el.type === 'checkbox' ? el.checked : el.value; keepScroll(); return true; }
    if (el.dataset.lf && S.logForm && el.tagName === 'SELECT') { S.logForm[el.dataset.lf] = el.value; keepScroll(); return true; }
    if (el.id === 'logDay') { S.logShift = Object.assign(logShift(), { day: el.value || logShift().day }); C.render(); return true; }
    if (el.id === 'logPeriod') { S.logShift = Object.assign(logShift(), { period: el.value === 'N' ? 'N' : 'D' }); C.render(); return true; }
    if (el.id === 'importSilos') { importSilos(el.files[0]); el.value = ''; return true; }
    return false;
  }

  return { load, reload, view, viewProdSet, viewCodes, settingsCard, homeLine, onClick, onInput, onChange, CLICK_SEL };
};
