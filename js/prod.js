/* Moagem — Produção (ordens de produção, silos de produto, diário de turno).
 * Regras de negócio puras (sem DOM). Browser: window.Prod · Node: module.exports.
 * Dados fornecidos por Zhax (08-10-2026): linhas C 500 t/dia e D 300 t/dia; molhador máx. 2 500 L/h;
 * água calculada sobre o grão sujo; silos de produto: 34, 35 (60 t), 40, 43–47 (188 t); linhas: foto "Flour Silos".
 * Mistura de cores/graus permitida com autorização de supervisor; humidade do milho registada em cada turno.
 * Extracção alvo e receitas (cor/grau por produto) NÃO têm valores por defeito: definem-se com PIN.
 */
(function (root) {
  'use strict';

  const VERSION = '1.3.0';
  const COLOURS = ['Amarelo', 'Branco'];
  const SILO_GRADES = ['G1', 'G2', 'OFF', 'PRI'];          // designações da app de Silos (REJ nunca vai a moagem)
  // Códigos de paragem FMO — fonte: Downtime_Codes.xlsx (Folha1), versão 2, recebido de Zhax 08-10-2026.
  // [código, nome, categoria V1, categoria V2, Tier 3] — valores como no ficheiro (espaços retirados;
  // células só com traços = vazio). V2 é a categoria de referência (decisão de Zhax, 08-10-2026).
  // Coluna "Decisão" retirada (a pedido). Nome PT e tratamento OEE: vazios até definidos com autorização.
  const DOWNTIME_SOURCE = 'Downtime_Codes.xlsx (08-10-2026)';
  const DOWNTIME_CODES = [
    ["P01", "PRODUCTION START-UP", "Planned - Production", "Process", "Process"],
    ["A01", "SCALES", "Unplanned - Mechanical Breakdown", "Breakdown", "Breakdown"],
    ["O01", "MANAGEMENT AUTHORIZATION", "Planned - Other", "Planned", "Other"],
    ["P02", "PRODUCTION COMPLETION", "Planned - Production", "Process", "Process"],
    ["A02", "ASPIRATION FAN", "Unplanned - Mechanical Breakdown", "Breakdown", "Breakdown"],
    ["O02", "FUMIGATION", "Planned - Fumigation", "Planned", "Other"],
    ["P03", "PRODUCTION CHANGEOVER", "Planned - Production", "Process", "Process"],
    ["A03", "PNEUMATIC FAN", "Unplanned - Mechanical Breakdown", "Breakdown", "Breakdown"],
    ["O03", "SCHEDULED MAINTENANCE", "Planeada - Preventiva", "Planned", "Other"],
    ["P04", "LOOSE BELTS", "Unplanned - Operating Problems", "Process", "Process"],
    ["A04", "FLOUR CIRCUIT", "Unplanned - Mechanical Breakdown", "Breakdown", "Breakdown"],
    ["O04", "POWER FAILURE", "Unplanned - Electrical Breakdown", "Power Failure", "Power Failure"],
    ["P05", "LEVEL PROBE TRIP", "Unplanned - Operating Problems", "Process", "Process"],
    ["A05", "SASSORES", "Unplanned - Mechanical Breakdown", "Breakdown", "Breakdown"],
    ["O05", "SPECIAL PROJECTS", "Planned - Other", "Planned", "Other"],
    ["P06", "ROLLER CHANGE", "Unplanned - Operating Problems", "Process", "Process"],
    ["A06", "AIRLOCK LINE", "Unplanned - Mechanical Breakdown", "Breakdown", "Breakdown"],
    ["O06", "SCHEDULED REPAIRS", "Planned - Other", "Planned", "Other"],
    ["P07", "BRAN BIN FILLING", "Unplanned - Operating Problems", "Process", "Process"],
    ["A07", "MILLS", "Unplanned - Mechanical Breakdown", "Breakdown", "Breakdown"],
    ["O07", "PREVENTIVE MAINTENANCE PLAN COMPLIANCE", "Planeada - Preventiva", "Planned", "Other"],
    ["P08", "ENTOLETER FILLING", "Unplanned - Operating Problems", "Process", "Process"],
    ["A08", "MILLING ELECTRICAL PANEL", "Unplanned - Electrical Breakdown", "Breakdown", "Breakdown"],
    ["O08", "SCALE CALIBRATION", "Planeada - Produção", "Planned", "Other"],
    ["P09", "MILL FILLING", "Unplanned - Operating Problems", "Process", "Process"],
    ["A09", "COMPRESSOR/AIR NETWORK", "Unplanned - Mechanical Breakdown", "Breakdown", "Breakdown"],
    ["O09", "INVENTORY", "Planned - Inventory", "Planned", "Other"],
    ["P10", "PLANSIFTER FILLING", "Unplanned - Operating Problems", "Process", "Process"],
    ["A10", "ENTOLETERS", "Unplanned - Mechanical Breakdown", "Breakdown", "Breakdown"],
    ["O10", "NO PRODUCTION", "Planned - No Production Plan", "Planned", "Other"],
    ["P11", "PNEUMATIC SYSTEM FILLING", "Unplanned - Operating Problems", "Process", "Process"],
    ["A11", "BRAN BRUSHERS", "Unplanned - Mechanical Breakdown", "Breakdown", "Breakdown"],
    ["O11", "FEED MILL", "Unplanned - Other", "Feed Mill", "Feed Mill"],
    ["P12", "OTHER FILLING", "Unplanned - Operating Problems", "Process", "Process"],
    ["A12", "FILTERS", "Unplanned - Mechanical Breakdown", "Breakdown", "Breakdown"],
    ["P13", "FILTER CLEANING", "Unplanned - Operating Problems", "Process", "Process"],
    ["A13", "SAFETY SIFTER", "Unplanned - Mechanical Breakdown", "Breakdown", "Breakdown"],
    ["O50", "OTHER STOP", "Planned - Other", "Planned", "Other"],
    ["P14", "OTHER CLEANING", "Unplanned - Operating Problems", "Process", "Process"],
    ["A14", "PLANSIFTER", "Unplanned - Mechanical Breakdown", "Breakdown", "Breakdown"],
    ["P15", "BROKEN SIEVES/SCREENS", "Unplanned - Operating Problems", "Process", "Process"],
    ["A15", "BRAN SCREW CONVEYOR", "Unplanned - Mechanical Breakdown", "Breakdown", "Breakdown"],
    ["P16", "NO GRAIN AVAILABLE FOR MILLING", "Planned - Raw Material Shortage", "Planned", "Other"],
    ["A16", "VIBRATORS", "Unplanned - Electrical Breakdown", "Breakdown", "Breakdown"],
    ["P17", "FLOUR BIN FILLING", "Unplanned - Excess Finished Product", null, "Other"],
    ["A17", "BROKEN BELTS", "Unplanned - Operating Problem", "Breakdown", "Breakdown"],
    ["P18", "INSPECTION/CLEANING PLAN COMPLIANCE", "Planned - Preventive Maintenance", "Process", "Process"],
    ["A18", "FLOUR COLLECTOR SCREW CONVEYOR", "Unplanned - Mechanical Breakdown", "Breakdown", "Breakdown"],
    ["P19", "EXCESS FINISHED PRODUCT", "Unplanned - Excess Finished Product", "Planned", "Other"],
    ["A19", "BURNT MOTOR/GEAR MOTOR", "Unplanned - Electrical Breakdown", "Breakdown", "Breakdown"],
    ["P20", "THERMAL TRIP", "Unplanned - Operating Problems", "Process", "Process"],
    ["A20", "DRAG CONVEYOR SCRAPER", "Unplanned - Mechanical Breakdown", "Breakdown", "Breakdown"],
    ["P21", "NO APPARENT REASON", "Planned - Other", "Process", "Process"],
    ["A21", "CONVEYOR", "Unplanned - Mechanical Breakdown", "Breakdown", "Breakdown"],
    ["P22", "FINISHER FILLING", "Unplanned - Operating Problems", "Process", "Process"],
    ["A22", "BUCKET ELEVATORS", "Unplanned - Mechanical Breakdown", "Breakdown", "Breakdown"],
    ["P23", "POLISHER FILLING", "Unplanned - Operating Problems", "Process", "Process"],
    ["P24", "EMERGENCY STOP", null, null, "Process"],
    ["A50", "OTHER BREAKDOWNS", "Unplanned - Mechanical Breakdown", "Breakdown", "Breakdown"],
    ["P50", "OTHER PROCESS STOP", "Planned - Production", "Process", "Process"]
  ].map(([code, name, v1, v2, tier3]) => ({ code, name, namePt: null, v1, v2, tier3, oee: null, active: true }));
  const TIER3 = ['Process', 'Breakdown', 'Feed Mill', 'Power Failure', 'Other'];
  const V2_CATS = ['Process', 'Breakdown', 'Planned', 'Power Failure', 'Feed Mill'];
  // Tratamento OEE — lista PROPOSTA (prática OEE corrente), não vem do ficheiro FMO; vazio = não definido.
  const OEE_TREAT = ['planned', 'availability', 'performance'];
  const defaultCodes = () => DOWNTIME_CODES.map(c => Object.assign({}, c));
  const findCode = (c, list) => (list || DOWNTIME_CODES).find(x => x.code === c) || null;
  const ACT_TYPES = ['housekeeping', 'reprocessing', 'cleaning', 'maintenance', 'other'];
  const JOB_STATUS = ['running', 'done', 'cancelled'];

  // ---------- dados mestre (IDs canónicos — Zhax, 09-10-2026) ----------
  // Silos de grão (app de Silos): S01–S21. Silos de moagem: B01–B04 milho sujo (C e D, 130 t);
  // B05–B06 milho temperado linha C (95 t); B07–B08 milho temperado linha D (capacidade não indicada).
  // Silos de produto (fuba e grits): linhas do ecrã "Flour Silos" (foto 08-10-2026); capacidades: Zhax.
  const MASTER_SOURCE = 'IDs canónicos indicados por Zhax (09-10-2026)';
  const BIN_SOURCE = 'Ecrã "Flour Silos" (foto 08-10-2026) + IDs e capacidades indicados por Zhax (09-10-2026)';
  const GRAIN_SILOS = Array.from({ length: 21 }, (_, i) => 'S' + String(i + 1).padStart(2, '0'));
  const mk = rows => rows.map(([id, l, c]) => ({ id, lines: l.split(''), capT: c }));
  const DEFAULT_DIRTY_BINS = mk([['B01', 'CD', 130], ['B02', 'CD', 130], ['B03', 'CD', 130], ['B04', 'CD', 130]]);
  const DEFAULT_TEMPERED_BINS = mk([['B05', 'C', 95], ['B06', 'C', 95], ['B07', 'D', null], ['B08', 'D', null]]);
  const DEFAULT_BINS = mk([
    ['B34', 'CD', 60], ['B35', 'CD', 60], ['B40', 'C', 188], ['B43', 'D', 188],
    ['B44', 'C', 188], ['B45', 'C', 188], ['B46', 'C', 188], ['B47', 'C', 145]
  ]);
  const copyBins = l => l.map(b => ({ id: b.id, lines: b.lines.slice(), capT: b.capT }));

  function defaultProdConfig() {
    return {
      lineTpd: { C: 500, D: 300 },     // capacidade (t/dia) — dado do utilizador
      dampenerMaxLh: 2500,             // molhador, máximo L/h — dado do utilizador
      extraction: {},                  // { productId: % } — vazio até definido com PIN
      recipes: {},                     // { productId: { colours:[], grades:[] } } — vazio até definido
      bins: copyBins(DEFAULT_BINS),                  // silos de produto
      binSource: BIN_SOURCE,
      grainSilos: GRAIN_SILOS.slice(),               // IDs canónicos dos silos de grão
      dirtyBins: copyBins(DEFAULT_DIRTY_BINS),       // silos de milho sujo (origem das ordens)
      temperedBins: copyBins(DEFAULT_TEMPERED_BINS), // silos de milho temperado
      masterSource: MASTER_SOURCE,
      floors: [],                      // pisos para limpeza — lista definida pela empresa
      downtimeCodes: defaultCodes(),   // editáveis com autorização
      codesSource: DOWNTIME_SOURCE
    };
  }

  // ---------- números ----------
  // Igual a Logic.num, mais modo 'kg' (uso angolano: "30.000" = 30 000; "1.250,5" = 1250,5)
  function num(v, mode) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    let s = String(v).trim().replace(/[\s ']/g, '');
    if (s === '') return null;
    if (!/^-?[0-9.,]+$/.test(s)) return NaN;
    const dot = s.lastIndexOf('.'), com = s.lastIndexOf(',');
    if (dot >= 0 && com >= 0) {
      const dec = dot > com ? '.' : ',', th = dec === '.' ? ',' : '.';
      const ip = s.slice(0, s.lastIndexOf(dec)), fp = s.slice(s.lastIndexOf(dec) + 1);
      const g = ip.replace('-', '').split(th);
      if (fp.indexOf(th) >= 0 || !(g[0].length >= 1 && g[0].length <= 3 && g.slice(1).every(p => p.length === 3))) return NaN;
      s = ip.split(th).join('') + '.' + fp;
    } else if (com >= 0) {
      const parts = s.split(',');
      if (parts.length > 2) return NaN;
      s = parts.join('.');
    } else if (dot >= 0) {
      const parts = s.replace('-', '').split('.');
      if (mode === 'kg' && parts.length >= 2 && parts[0].length >= 1 && parts[0].length <= 3 && parts.slice(1).every(p => p.length === 3)) s = s.split('.').join('');
      else if (parts.length > 2) return NaN;
    }
    const n = parseFloat(s);
    return isFinite(n) ? n : NaN;
  }
  const r1 = n => Math.round(n * 10) / 10;
  const r0 = n => Math.round(n);
  const isNum = x => typeof x === 'number' && isFinite(x);

  // ---------- água de temperagem ----------
  // Balanço de massa sobre o grão sujo (como recebido do silo):
  //   água (kg ≈ L) = massa × (H alvo − H inicial) / (100 − H alvo)
  function waterFor(kg, m0, m1) {
    if (!isNum(kg) || !isNum(m0) || !isNum(m1)) return null;
    if (m1 <= m0) return 0;
    return kg * (m1 - m0) / (100 - m1);
  }
  // Caudal de água (L/h) para um caudal de grão (t/h)
  function waterRate(tph, m0, m1) {
    const w = waterFor(isNum(tph) ? tph * 1000 : NaN, m0, m1);
    return w === null ? null : w;
  }
  const defaultFeedTph = (cfgP, lineId) => {
    const tpd = cfgP.lineTpd && cfgP.lineTpd[lineId];
    return isNum(tpd) && tpd > 0 ? tpd / 24 : null;
  };

  // ---------- silos de grão (snapshot importado da app de Silos) ----------
  function siloKg(siloId, events) {
    const stamp = e => (e.date || '') + 'T' + (e.time || '00:00') + '#' + String(e.seq || 0).padStart(8, '0');
    const evs = (events || []).filter(e => e.silo === siloId || (e.type === 'TRANSFER' && e.toSilo === siloId))
      .sort((a, b) => stamp(a) < stamp(b) ? -1 : stamp(a) > stamp(b) ? 1 : 0);
    let kg = 0;
    evs.forEach(e => {
      const k = num(e.kg, 'kg');
      const v = isNum(k) ? k : 0;
      if (e.type === 'EMPTY' && e.silo === siloId) { kg = 0; return; }
      if (e.type === 'IN' || (e.type === 'TRANSFER' && e.toSilo === siloId && e.silo !== siloId)) kg += v;
      else if (e.type === 'OUT' || (e.type === 'TRANSFER' && e.silo === siloId && e.toSilo !== siloId)) kg -= v;
    });
    return Math.round(kg * 1000) / 1000;
  }
  // Lê a cópia de segurança da app de Silos (app 'moagem-app'). Devolve snapshot ou lança erro.
  function snapshotFromSilosBackup(o, importedAt) {
    if (!o || o.app !== 'moagem-app' || !Array.isArray(o.settings) || !Array.isArray(o.events)) throw new Error('not-silos-backup');
    const main = o.settings.find(s => s && s.key === 'main');
    const silos = main && main.value && Array.isArray(main.value.silos) ? main.value.silos : null;
    if (!silos) throw new Error('no-silos');
    const sev = Array.isArray(o.sevents) ? o.sevents : [];
    return {
      source: 'moagem-app', exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : null, importedAt,
      silos: silos.filter(s => s && typeof s.id === 'string').map(s => {
        const open = sev.filter(e => e && e.silo === s.id && e.status === 'OPEN');
        const lvl = open.reduce((m, e) => Math.max(m, isNum(e.level) ? e.level : 0), -1);
        return { id: s.id, cereal: s.cereal || '', colour: s.colour || '', grade: s.grade || '',
          cap: num(s.cap, 'kg'), kg: siloKg(s.id, o.events), openEvent: open.length > 0, openLevel: lvl >= 0 ? lvl : null };
      })
    };
  }
  // Grão já transferido para silos de moagem depois da exportação do snapshot (para não contar duas vezes)
  const snapTime = snap => snap ? (snap.exportedAt ? Date.parse(snap.exportedAt) : snap.importedAt) : 0;
  function transferredAfter(snapshot, moves) {
    const out = {}, t0 = snapTime(snapshot);
    (moves || []).forEach(m => {
      if (m.type !== 'TRANSFER' || !(m.t > t0)) return;
      (m.parts || []).forEach(p => { out[p.silo] = (out[p.silo] || 0) + p.kg; });
    });
    return out;
  }
  function availableKg(snapshot, moves, siloId) {
    const s = snapshot && snapshot.silos.find(x => x.id === siloId);
    if (!s) return null;
    return Math.max(0, Math.round((s.kg - (transferredAfter(snapshot, moves)[siloId] || 0)) * 1000) / 1000);
  }
  // Repartir: esvazia o 1.º silo, depois o seguinte
  function allocate(kg, slots) {
    let rest = kg; const parts = [];
    slots.forEach(s => {
      if (rest <= 0) return;
      const take = Math.round(Math.min(rest, Math.max(0, s.avail || 0)) * 1000) / 1000;
      if (take > 0) { parts.push({ silo: s.id, kg: take }); rest = Math.round((rest - take) * 1000) / 1000; }
    });
    return { parts, short: Math.max(0, Math.round(rest * 1000) / 1000) };
  }

  // ---------- silos de milho sujo (B01–B04) ----------
  // moves: {type:'TRANSFER', binId, t, parts:[{silo, kg, cereal, colour, grade}], kg} | {type:'EMPTY', binId, t, bookKg}
  // Conteúdo = transferências desde o último "vazio" − grão tirado pelas ordens desde então
  // (ordem em curso: quantidade planeada; concluída: quantidade real se indicada; cancelada: nada).
  const jobFactor = j => j.status === 'cancelled' ? 0 : (j.status === 'done' && isNum(j.actualKg) && isNum(j.grainKg) && j.grainKg > 0 ? j.actualKg / j.grainKg : 1);
  function dirtyBinState(binId, moves, jobs) {
    const evs = (moves || []).filter(m => m.binId === binId).sort((a, b) => a.t - b.t || (a.createdAt || 0) - (b.createdAt || 0));
    let since = null, last = null; const comps = {}; let inKg = 0;
    evs.forEach(m => {
      if (m.type === 'EMPTY') { since = m.t; inKg = 0; Object.keys(comps).forEach(k => delete comps[k]); last = m; return; }
      if (m.type !== 'TRANSFER') return;
      last = m;
      (m.parts || []).forEach(p => {
        inKg += p.kg;
        const k = [p.cereal, p.colour, p.grade].join('|');
        const c = comps[k] = comps[k] || { cereal: p.cereal, colour: p.colour, grade: p.grade, kg: 0, silos: [] };
        c.kg += p.kg; if (c.silos.indexOf(p.silo) < 0) c.silos.push(p.silo);
      });
    });
    let drawn = 0, running = [];
    (jobs || []).forEach(j => {
      if (!Array.isArray(j.alloc) || (since !== null && !(j.startedAt > since))) return;
      j.alloc.forEach(a => { if (a.bin === binId) drawn += a.kg * jobFactor(j); });
      if (j.status === 'running' && j.alloc.some(a => a.bin === binId)) running.push(j.uid);
    });
    const kg = Math.round((inKg - drawn) * 1000) / 1000;
    return { kg, inKg: Math.round(inKg * 1000) / 1000, drawnKg: Math.round(drawn * 1000) / 1000, comps: Object.keys(comps).map(k => comps[k]),
      since, last, runningJobs: running };
  }

  // Transferência silo(s) de grão → silo de milho sujo. tr: {binId, silos:[ids em ordem], kg, silosConfirmed}
  // ctx: {cfgP, millType, snapshot, moves, jobs, shiftStart}
  function validateTransfer(tr, ctx) {
    const E = [], W = [], calc = {};
    const cfgP = ctx.cfgP, snap = ctx.snapshot;
    const bin = (cfgP.dirtyBins || []).find(b => b.id === tr.binId);
    if (!tr.binId) E.push({ code: 'no_dirty_bin' }); else if (!bin) E.push({ code: 'dirty_bin_unknown', bin: tr.binId });
    const kg = num(tr.kg, 'kg');
    if (kg === null) E.push({ code: 'no_grain' }); else if (isNaN(kg) || kg <= 0) E.push({ code: 'bad', field: 'grainKg' });
    const silos = (tr.silos || []).filter(Boolean);
    if (!snap) E.push({ code: 'no_snapshot' });
    if (!silos.length) E.push({ code: 'no_silo' });
    const cereal = { maize: 'Milho', wheat: 'Trigo', rice: 'Arroz' }[ctx.millType];
    if (snap && silos.length) {
      if (new Set(silos).size !== silos.length) E.push({ code: 'silo_dup' });
      const slots = [];
      silos.forEach(id => {
        const s = snap.silos.find(x => x.id === id);
        if (!s) { E.push({ code: 'silo_unknown', silo: id }); return; }
        if ((cfgP.grainSilos || []).indexOf(id) < 0) E.push({ code: 'silo_not_canonical', silo: id });
        if (!s.cereal) E.push({ code: 'silo_not_designated', silo: id });
        else if (s.cereal !== cereal) E.push({ code: 'silo_other_cereal', silo: id, cereal: s.cereal });
        if (s.openEvent && isNum(s.openLevel) && s.openLevel >= 4) E.push({ code: 'silo_red', silo: id });
        else if (s.openEvent) W.push({ code: 'silo_event', silo: id });
        slots.push({ id, avail: availableKg(snap, ctx.moves, id) || 0, s });
      });
      if (isNum(kg) && kg > 0) {
        const a = allocate(kg, slots);
        calc.parts = a.parts.map(p => { const s = slots.find(x => x.id === p.silo).s; return { silo: p.silo, kg: p.kg, cereal: s.cereal, colour: s.colour, grade: s.grade }; });
        if (a.short > 0) E.push({ code: 'silo_short', short: a.short });
        silos.forEach(id => { if (!a.parts.some(p => p.silo === id) && a.short === 0) W.push({ code: 'silo_unused', silo: id }); });
      }
      if (isNum(ctx.shiftStart) && snapTime(snap) < ctx.shiftStart) W.push({ code: 'snapshot_old' });
    }
    if (!tr.silosConfirmed) E.push({ code: 'confirm_silos' });
    if (bin) {
      const st = dirtyBinState(bin.id, ctx.moves, ctx.jobs);
      calc.binKg = st.kg;
      if (isNum(bin.capT)) {
        calc.freeKg = Math.max(0, bin.capT * 1000 - Math.max(0, st.kg));
        if (isNum(kg) && kg > calc.freeKg) E.push({ code: 'dirty_bin_full', bin: bin.id, free: calc.freeKg });
      }
      // mistura de cores/graus no mesmo silo de moagem: aviso (a receita é verificada na ordem)
      if (calc.parts) {
        const keys = new Set(st.comps.filter(c => c.kg > 0 && st.kg > 0).map(c => c.colour + '|' + c.grade).concat(calc.parts.map(p => p.colour + '|' + p.grade)));
        if (keys.size > 1) W.push({ code: 'bin_mixed', bin: bin.id });
      }
    }
    return { errors: E, warnings: W, calc, values: { kg } };
  }

  // ---------- compatibilidade matéria-prima × produto (receita) ----------
  function recipeSet(r) { return !!r && Array.isArray(r.colours) && r.colours.length > 0 && Array.isArray(r.grades) && r.grades.length > 0; }
  // silo: {cereal, colour, grade}; millType 'maize' → cereal 'Milho'
  function recipeFit(recipe, silo, millType) {
    if (!recipeSet(recipe)) return { ok: false, why: 'recipe_not_set' };
    if (!silo || !silo.cereal) return { ok: false, why: 'silo_not_designated' };
    const cereal = { maize: 'Milho', wheat: 'Trigo', rice: 'Arroz' }[millType];
    if (silo.cereal !== cereal) return { ok: false, why: 'other_cereal' };
    if (cereal === 'Milho' && recipe.colours.indexOf(silo.colour) < 0) return { ok: false, why: 'colour' };
    if (recipe.grades.indexOf(silo.grade) < 0) return { ok: false, why: 'grade' };
    return { ok: true };
  }

  // ---------- silos de produto (bins) ----------
  // binEvents: {binId, type:'FILL'|'EMPTY'|'SET', productId, t, jobUid}
  function binState(binId, binEvents) {
    const evs = (binEvents || []).filter(e => e.binId === binId && !e.voidedBy).sort((a, b) => a.t - b.t || (a.seq || 0) - (b.seq || 0));
    const last = evs[evs.length - 1];
    if (!last || last.type === 'EMPTY') return { productId: null, since: last ? last.t : null, last: last || null };
    return { productId: last.productId || null, since: last.t, jobUid: last.jobUid || null, last };
  }
  function binCheck(bin, productId, lineId, binEvents) {
    if (!bin) return { ok: false, why: 'bin_unknown' };
    if (bin.lines.indexOf(lineId) < 0) return { ok: false, why: 'bin_line' };
    const st = binState(bin.id, binEvents);
    if (st.productId && st.productId !== productId) return { ok: false, why: 'bin_other_product', current: st.productId };
    return { ok: true, current: st.productId };
  }

  // ---------- validação da ordem de produção ----------
  // job: {productId, lineId, grainKg, mode:'seq'|'blend', sources:[silos de milho sujo em ordem], blend:{bin:{pct,m0,impurities}},
  //       tempered:[silos de milho temperado], bins:[silos de produto], m0, impurities, m1, feedTph, offRecipeAuth:{by,reason}|null}
  //  - 'seq'  : esvazia o 1.º silo de moagem, depois o seguinte; humidade e impurezas do grão (uma leitura).
  //  - 'blend': mistura em % por silo de moagem (soma 100); humidade/impurezas por silo → média ponderada.
  //  Conteúdo fora da receita (outra cor/grau) só com autorização de supervisor (PIN na interface).
  // ctx: {cfgP, millType, moves, jobs, binEvents, now, shiftStart}
  // Devolve {errors:[{code,...}], warnings:[...], calc:{...}, values}. errors ⇒ a ordem é bloqueada.
  function validateJob(job, ctx) {
    const E = [], W = [], calc = {};
    const cfgP = ctx.cfgP;
    const blend = job.mode === 'blend';
    if (!job.productId) E.push({ code: 'no_product' });
    if (!job.lineId) E.push({ code: 'no_line' });
    const kg = num(job.grainKg, 'kg');
    if (kg === null) E.push({ code: 'no_grain' });
    else if (isNaN(kg) || kg <= 0) E.push({ code: 'bad', field: 'grainKg' });
    const m1 = num(job.m1);
    if (m1 === null) E.push({ code: 'need', field: 'm1' }); else if (isNaN(m1) || m1 <= 0 || m1 >= 100) E.push({ code: 'bad', field: 'm1' });
    let tph = num(job.feedTph);
    if (tph === null) tph = job.lineId ? defaultFeedTph(cfgP, job.lineId) : null;
    if (tph === null || isNaN(tph) || tph <= 0) E.push({ code: 'bad', field: 'feedTph' });

    // linha ocupada
    if (job.lineId && (ctx.jobs || []).some(j => j.status === 'running' && j.lineId === job.lineId && j.uid !== job.uid))
      E.push({ code: 'line_busy' });

    // origem: silos de milho sujo (B01–B04)
    const srcs = (job.sources || []).filter(Boolean);
    const recipe = cfgP.recipes && cfgP.recipes[job.productId];
    const auth = job.offRecipeAuth && String(job.offRecipeAuth.by || '').trim() && String(job.offRecipeAuth.reason || '').trim() ? job.offRecipeAuth : null;
    if (job.productId && !recipeSet(recipe)) E.push({ code: 'recipe_not_set' });
    if (!srcs.length) E.push({ code: 'no_source' });
    calc.offRecipe = [];
    let m0 = null, imp = null;
    if (!blend) {
      m0 = num(job.m0); imp = num(job.impurities);
      if (m0 === null) E.push({ code: 'need', field: 'm0' }); else if (isNaN(m0) || m0 < 0 || m0 >= 100) E.push({ code: 'bad', field: 'm0' });
      if (imp === null) E.push({ code: 'need', field: 'impurities' }); else if (isNaN(imp) || imp < 0 || imp > 100) E.push({ code: 'bad', field: 'impurities' });
    }
    if (srcs.length) {
      if (new Set(srcs).size !== srcs.length) E.push({ code: 'source_dup' });
      const slots = [];
      srcs.forEach(id => {
        const b = (cfgP.dirtyBins || []).find(x => x.id === id);
        if (!b) { E.push({ code: 'source_unknown', bin: id }); return; }
        if (job.lineId && b.lines.indexOf(job.lineId) < 0) E.push({ code: 'source_line', bin: id });
        const st = dirtyBinState(id, ctx.moves, (ctx.jobs || []).filter(j => j.uid !== job.uid));
        if (st.kg <= 0) E.push({ code: 'source_empty', bin: id });
        if (recipeSet(recipe)) {
          const bad = [];
          st.comps.forEach(c => { const f = recipeFit(recipe, c, ctx.millType); if (!f.ok) bad.push({ why: f.why, colour: c.colour, grade: c.grade, silos: c.silos }); });
          if (bad.length) {
            // cor ou grau fora da receita: permitido com autorização; outro cereal/sem designação: nunca
            const canAuth = bad.every(x => x.why === 'colour' || x.why === 'grade');
            if (canAuth && auth) calc.offRecipe.push({ bin: id, items: bad });
            else E.push({ code: 'source_incompatible', bin: id, why: bad[0].why, canAuth, items: bad });
          }
        }
        slots.push({ id, avail: Math.max(0, st.kg) });
      });
      if (calc.offRecipe.length) W.push({ code: 'off_recipe_auth', by: auth.by });
      if (blend) {
        // percentagens, humidade e impurezas por silo de moagem
        let sum = 0, mw = 0, iw = 0, okM = true, okI = true;
        const parts = [];
        srcs.forEach(id => {
          const b = (job.blend || {})[id] || {};
          const pct = num(b.pct), bm = num(b.m0), bi = num(b.impurities);
          if (pct === null || isNaN(pct) || pct <= 0 || pct > 100) { E.push({ code: 'blend_pct', bin: id }); return; }
          if (bm === null || isNaN(bm) || bm < 0 || bm >= 100) { E.push({ code: 'blend_m0', bin: id }); okM = false; }
          if (bi === null || isNaN(bi) || bi < 0 || bi > 100) { E.push({ code: 'blend_imp', bin: id }); okI = false; }
          sum += pct;
          if (okM && isNum(bm)) mw += pct * bm;
          if (okI && isNum(bi)) iw += pct * bi;
          parts.push({ id, pct });
        });
        if (parts.length === srcs.length && Math.abs(sum - 100) > 0.01) E.push({ code: 'blend_sum', sum: Math.round(sum * 100) / 100 });
        if (Math.abs(sum - 100) <= 0.01 && parts.length === srcs.length) {
          if (okM) m0 = Math.round(mw / 100 * 100) / 100;
          if (okI) imp = Math.round(iw / 100 * 100) / 100;
          if (isNum(kg) && kg > 0) {
            calc.alloc = parts.map(p => ({ bin: p.id, kg: Math.round(kg * p.pct / 100 * 1000) / 1000, pct: p.pct }));
            calc.alloc.forEach(a => {
              const sl = slots.find(x => x.id === a.bin);
              if (sl && a.kg > sl.avail) E.push({ code: 'blend_short', bin: a.bin, short: Math.round((a.kg - sl.avail) * 1000) / 1000 });
            });
          }
        }
      } else if (isNum(kg) && kg > 0) {
        const a = allocate(kg, slots);
        calc.alloc = a.parts.map(p => ({ bin: p.silo, kg: p.kg }));
        if (a.short > 0) E.push({ code: 'source_short', short: a.short });
        srcs.forEach(id => { if (!a.parts.some(p => p.silo === id) && a.short === 0) W.push({ code: 'source_unused', bin: id }); });
      }
    }

    // silo(s) de milho temperado da linha
    const temp = (job.tempered || []).filter(Boolean);
    if (!temp.length) E.push({ code: 'no_tempered' });
    temp.forEach(id => {
      const b = (cfgP.temperedBins || []).find(x => x.id === id);
      if (!b) E.push({ code: 'tempered_unknown', bin: id });
      else if (job.lineId && b.lines.indexOf(job.lineId) < 0) E.push({ code: 'tempered_line', bin: id });
    });

    // produto esperado
    const ext = cfgP.extraction && cfgP.extraction[job.productId];
    if (isNum(kg) && kg > 0 && isNum(ext)) calc.expectedKg = r0(kg * ext / 100);
    else if (job.productId) W.push({ code: 'no_extraction' });
    calc.extraction = isNum(ext) ? ext : null;

    // silos de produto: linha, produto, capacidade
    const bins = (job.bins || []).filter(Boolean);
    if (!bins.length) E.push({ code: 'no_bin' });
    let capKnown = 0, unknownLevel = false, missingCap = false;
    bins.forEach(id => {
      const b = cfgP.bins.find(x => x.id === id);
      const r = binCheck(b, job.productId, job.lineId, ctx.binEvents);
      if (!r.ok) { E.push({ code: r.why, bin: id, current: r.current }); return; }
      if (!isNum(b.capT)) missingCap = true;
      else if (r.current) unknownLevel = true;            // já tem o mesmo produto: nível desconhecido
      else capKnown += b.capT * 1000;
    });
    calc.binCapKg = capKnown;
    if (bins.length && isNum(calc.expectedKg) && !missingCap) {
      if (!unknownLevel && calc.expectedKg > capKnown) E.push({ code: 'bin_capacity', need: calc.expectedKg, cap: capKnown });
      else if (unknownLevel && calc.expectedKg > capKnown) W.push({ code: 'bin_level_unknown' });
    }

    // água
    if (isNum(kg) && kg > 0 && isNum(m0) && isNum(m1) && m0 >= 0 && m1 > 0 && m1 < 100) {
      calc.m0 = m0; calc.impurities = imp;
      calc.waterL = r0(waterFor(kg, m0, m1));
      if (m1 <= m0) W.push({ code: 'no_water' });
      if (isNum(tph) && tph > 0) {
        calc.feedTph = Math.round(tph * 100) / 100;
        calc.waterLh = r0(waterRate(tph, m0, m1));
        calc.hours = r1(kg / 1000 / tph);
        if (isNum(cfgP.dampenerMaxLh) && calc.waterLh > cfgP.dampenerMaxLh) E.push({ code: 'dampener_max', need: calc.waterLh, max: cfgP.dampenerMaxLh });
      }
    }
    return { errors: E, warnings: W, calc, values: { grainKg: kg, m0, m1, impurities: imp, feedTph: tph } };
  }

  // ---------- humidade do milho por turno (ordem em curso) ----------
  // Cada turno regista a humidade do milho a entrar; recalcula o caudal de água para o alvo da ordem.
  function readingCalc(job, m0) {
    const v = num(m0);
    if (v === null || isNaN(v) || v < 0 || v >= 100) return { error: 'bad' };
    const lh = r0(waterRate(job.feedTph, v, job.m1));
    return { m0: v, waterLh: lh, over: isNum(job.dampenerMaxLh) && lh > job.dampenerMaxLh, noWater: v >= job.m1 };
  }
  // Falta a leitura deste turno? (a leitura de arranque conta se a ordem começou neste turno)
  function needsShiftReading(job, shiftStart) {
    if (!job || job.status !== 'running') return false;
    if (job.startedAt >= shiftStart) return false;
    return !(job.readings || []).some(r => r.t >= shiftStart);
  }

  // ---------- configuração de produção: validação ----------
  // Texto de silos de produto: "34:C,D:60; 45:C:188" (silo:linhas:capacidade t, capacidade opcional)
  function parseBins(text, lineIds) {
    const out = [], errors = [];
    String(text || '').split(/[;\n]+/).map(s => s.trim()).filter(Boolean).forEach(part => {
      const m = part.match(/^([A-Za-z0-9-]{1,12})\s*:\s*([A-Za-z,\s]+?)\s*(?::\s*([0-9.,]+)\s*t?)?$/);
      if (!m) { errors.push(part); return; }
      const lines = [...new Set(m[2].toUpperCase().split(/[,\s]+/).filter(Boolean).join('').split(''))];
      if (!lines.length || lines.some(l => lineIds.indexOf(l) < 0)) { errors.push(part); return; }
      if (out.some(b => b.id === m[1].toUpperCase())) { errors.push(part); return; }
      let capT = null;
      if (m[3] !== undefined) { capT = num(m[3]); if (capT === null || isNaN(capT) || capT <= 0) { errors.push(part); return; } }
      out.push({ id: m[1].toUpperCase(), lines: lines.sort(), capT });
    });
    return { bins: out, errors };
  }
  const binsText = bins => bins.map(b => b.id + ':' + b.lines.join(',') + (isNum(b.capT) ? ':' + b.capT : '')).join('; ');

  // Lista de silos de grão: "S01–S21" ou "S01, S02, …"
  function parseSiloList(text) {
    const out = [], errors = [];
    String(text || '').split(/[,;\n]+/).map(x => x.trim().toUpperCase()).filter(Boolean).forEach(part => {
      const m = part.match(/^([A-Z]+)(\d+)\s*[-–]\s*([A-Z]+)(\d+)$/);
      if (m && m[1] === m[3] && Number(m[2]) <= Number(m[4]) && Number(m[4]) - Number(m[2]) < 200) {
        for (let i = Number(m[2]); i <= Number(m[4]); i++) out.push(m[1] + String(i).padStart(m[2].length, '0'));
      } else if (/^[A-Z0-9-]{1,12}$/.test(part)) out.push(part);
      else errors.push(part);
    });
    const dup = out.filter((x, i) => out.indexOf(x) !== i);
    return { silos: [...new Set(out)], errors: errors.concat(dup.map(d => 'dup:' + d)) };
  }
  // Snapshot da app de Silos: IDs fora da lista canónica (para aviso na importação)
  const nonCanonical = (snapshot, grainSilos) => (snapshot ? snapshot.silos : []).map(s => s.id).filter(id => (grainSilos || []).indexOf(id) < 0);

  function validateProdConfig(c) {
    const e = [];
    Object.keys(c.lineTpd || {}).forEach(k => { const v = c.lineTpd[k]; if (!isNum(v) || v <= 0) e.push('lineTpd:' + k); });
    if (!isNum(c.dampenerMaxLh) || c.dampenerMaxLh <= 0) e.push('dampenerMaxLh');
    Object.keys(c.extraction || {}).forEach(k => { const v = c.extraction[k]; if (v !== null && (!isNum(v) || v <= 0 || v > 100)) e.push('extraction:' + k); });
    Object.keys(c.recipes || {}).forEach(k => {
      const r = c.recipes[k];
      if (r.colours.some(x => COLOURS.indexOf(x) < 0) || r.grades.some(x => SILO_GRADES.indexOf(x) < 0)) e.push('recipe:' + k);
    });
    if (!Array.isArray(c.bins) || !c.bins.length) e.push('bins');
    if (!Array.isArray(c.dirtyBins) || !c.dirtyBins.length) e.push('dirtyBins');
    if (!Array.isArray(c.temperedBins) || !c.temperedBins.length) e.push('temperedBins');
    if (!Array.isArray(c.grainSilos) || !c.grainSilos.length || c.grainSilos.some(x => !/^[A-Z0-9-]{1,12}$/.test(x))) e.push('grainSilos');
    // o mesmo ID não pode existir em duas listas
    const all = [].concat(c.grainSilos || [], (c.dirtyBins || []).map(b => b.id), (c.temperedBins || []).map(b => b.id), (c.bins || []).map(b => b.id));
    if (new Set(all).size !== all.length) e.push('dupIds');
    return e;
  }
  // Lista de alterações (auditoria)
  function prodConfigDiff(a, b) {
    const d = [];
    const cmp = (field, x, y) => { const sx = JSON.stringify(x === undefined ? null : x), sy = JSON.stringify(y === undefined ? null : y); if (sx !== sy) d.push({ field, old: sx, new: sy }); };
    const keys = (o1, o2) => [...new Set(Object.keys(o1 || {}).concat(Object.keys(o2 || {})))];
    keys(a.lineTpd, b.lineTpd).forEach(k => cmp('lineTpd.' + k, (a.lineTpd || {})[k], (b.lineTpd || {})[k]));
    cmp('dampenerMaxLh', a.dampenerMaxLh, b.dampenerMaxLh);
    keys(a.extraction, b.extraction).forEach(k => cmp('extraction.' + k, (a.extraction || {})[k], (b.extraction || {})[k]));
    keys(a.recipes, b.recipes).forEach(k => cmp('recipe.' + k, (a.recipes || {})[k], (b.recipes || {})[k]));
    cmp('bins', binsText(a.bins || []), binsText(b.bins || []));
    cmp('floors', a.floors || [], b.floors || []);
    cmp('grainSilos', (a.grainSilos || []).join(','), (b.grainSilos || []).join(','));
    cmp('dirtyBins', binsText(a.dirtyBins || []), binsText(b.dirtyBins || []));
    cmp('temperedBins', binsText(a.temperedBins || []), binsText(b.temperedBins || []));
    const ca = {}, cb = {};
    (a.downtimeCodes || []).forEach(c => { ca[c.code] = c; }); (b.downtimeCodes || []).forEach(c => { cb[c.code] = c; });
    keys(ca, cb).forEach(k => ['name', 'namePt', 'v2', 'tier3', 'oee', 'active'].forEach(f => cmp('code.' + k + '.' + f, (ca[k] || {})[f], (cb[k] || {})[f])));
    return d;
  }

  // ---------- códigos de paragem: validação da lista editada ----------
  function validateCodes(list) {
    const e = [], seen = new Set();
    (list || []).forEach(c => {
      if (!/^[A-Z][0-9]{2,3}$/.test(c.code || '')) e.push('code:' + (c.code || '?'));
      else if (seen.has(c.code)) e.push('dup:' + c.code);
      seen.add(c.code);
      if (!String(c.name || '').trim()) e.push('name:' + c.code);
      if (c.v2 && V2_CATS.indexOf(c.v2) < 0) e.push('v2:' + c.code);
      if (c.tier3 && TIER3.indexOf(c.tier3) < 0) e.push('tier3:' + c.code);
      if (c.oee && OEE_TREAT.indexOf(c.oee) < 0) e.push('oee:' + c.code);
    });
    if (!(list || []).some(c => c.active !== false)) e.push('empty');
    return e;
  }

  // ---------- diário de turno ----------
  // entradas: {kind:'issue'|'activity', t, prodDay, period, lineId, ...}; anulação = novo registo {kind:'void', voids:uid}
  function effectiveLog(entries) {
    const voided = new Set((entries || []).filter(e => e.kind === 'void').map(e => e.voids));
    return (entries || []).filter(e => e.kind !== 'void' && !voided.has(e.uid));
  }
  // Ocorrência: com paragem (min > 0) exige código de paragem válido; sem paragem o código é opcional.
  function validateIssue(o, codes) {
    const e = [];
    const dt = num(o.downtimeMin);
    if (dt !== null && (isNaN(dt) || dt < 0 || dt > 24 * 60)) e.push('downtimeMin');
    const cd = o.code ? findCode(o.code, codes) : null;
    if (o.code && (!cd || cd.active === false)) e.push('code');
    else if (!o.code && isNum(dt) && dt > 0) e.push('code');
    if (!String(o.description || '').trim()) e.push('description');
    return e;
  }
  function validateActivity(o) {
    const e = [];
    if (ACT_TYPES.indexOf(o.type) < 0) e.push('type');
    if (o.type === 'housekeeping' && !String(o.floor || '').trim()) e.push('floor');
    if (o.type === 'reprocessing') { const q = num(o.qtyKg, 'kg'); if (q === null || isNaN(q) || q <= 0) e.push('qtyKg'); }
    if (o.type !== 'housekeeping' && o.type !== 'reprocessing' && !String(o.description || '').trim()) e.push('description');
    return e;
  }
  // Registos de um turno (dia de produção + período)
  // range: [início, fim) do turno em ms; d: {log, jobs, now}
  function shiftSummary(day, period, range, d) {
    const log = effectiveLog(d.log).filter(x => x.prodDay === day && x.period === period);
    const byTime = (a, b) => a.t - b.t || (a.createdAt || 0) - (b.createdAt || 0);   // mesma hora: ordem de gravação
    const issues = log.filter(x => x.kind === 'issue').sort(byTime);
    const acts = log.filter(x => x.kind === 'activity').sort(byTime);
    const now = isNum(d.now) ? d.now : Date.now();
    const jobs = (d.jobs || []).filter(j => j.startedAt < range[1] && (j.closedAt || now) >= range[0]).sort((a, b) => a.startedAt - b.startedAt);
    const downtime = issues.reduce((s, i) => s + (isNum(i.downtimeMin) ? i.downtimeMin : 0), 0);
    // Por categoria V2 (referência) e tratamento OEE, a partir do código gravado no registo (cópia no momento)
    const byV2 = {}, byOee = {};
    issues.forEach(i => {
      if (!(isNum(i.downtimeMin) && i.downtimeMin > 0)) return;
      const c = i.codeInfo || findCode(i.code, d.codes) || {};
      const k = c.v2 || '', o = c.oee || '';
      byV2[k] = (byV2[k] || 0) + i.downtimeMin; byOee[o] = (byOee[o] || 0) + i.downtimeMin;
    });
    return { issues, acts, jobs, downtimeMin: downtime, byV2, byOee, openIssues: issues.filter(i => i.status !== 'closed').length };
  }

  // ---------- identificadores (formato preparado para sincronização) ----------
  function uid(deviceId, now, rnd) {
    const r = rnd || Math.random().toString(36).slice(2, 8);
    return (deviceId || 'dev') + '-' + Number(now).toString(36) + '-' + r;
  }

  function validProdBackup(o) {
    const okArr = k => o[k] === undefined || Array.isArray(o[k]);
    if (!['jobs', 'binEvents', 'shiftLog', 'siloSnapshots', 'prodChanges', 'grainMoves'].every(okArr)) return false;
    const okMoves = (o.grainMoves || []).every(m => m && typeof m.uid === 'string' && typeof m.binId === 'string' && ['TRANSFER', 'EMPTY'].indexOf(m.type) >= 0);
    if (!okMoves) return false;
    const okJobs = (o.jobs || []).every(j => j && typeof j.uid === 'string' && JOB_STATUS.indexOf(j.status) >= 0 && typeof j.lineId === 'string');
    const okBin = (o.binEvents || []).every(e => e && typeof e.uid === 'string' && typeof e.binId === 'string' && ['FILL', 'EMPTY', 'SET', 'VOID'].indexOf(e.type) >= 0);
    const okLog = (o.shiftLog || []).every(e => e && typeof e.uid === 'string' && ['issue', 'activity', 'void'].indexOf(e.kind) >= 0);
    return okJobs && okBin && okLog;
  }

  const api = { VERSION, COLOURS, SILO_GRADES, GRAIN_SILOS, DEFAULT_DIRTY_BINS, DEFAULT_TEMPERED_BINS, MASTER_SOURCE, dirtyBinState, validateTransfer, transferredAfter, parseSiloList, nonCanonical, DOWNTIME_CODES, DOWNTIME_SOURCE, TIER3, V2_CATS, OEE_TREAT, defaultCodes, findCode, validateCodes, ACT_TYPES, JOB_STATUS, DEFAULT_BINS, BIN_SOURCE,
    defaultProdConfig, num, waterFor, waterRate, defaultFeedTph, siloKg, snapshotFromSilosBackup,
    availableKg, allocate, recipeSet, recipeFit, binState, binCheck, validateJob, readingCalc, needsShiftReading, parseBins, binsText,
    validateProdConfig, prodConfigDiff, effectiveLog, validateIssue, validateActivity, shiftSummary, uid, validProdBackup };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Prod = api;
})(typeof window !== 'undefined' ? window : this);
