// node tests/prod.test.js — regras de produção
const assert = require('assert');
const P = require('../js/prod.js');
let n = 0;
function t(name, fn) { try { fn(); n++; } catch (e) { console.error('FALHOU:', name); throw e; } }

t('números kg (uso angolano)', () => {
  assert.strictEqual(P.num('30.000', 'kg'), 30000);
  assert.strictEqual(P.num('30 000', 'kg'), 30000);
  assert.strictEqual(P.num('1.250,5', 'kg'), 1250.5);
  assert.strictEqual(P.num('13,5'), 13.5);
  assert.strictEqual(P.num('13.5'), 13.5);
  assert.strictEqual(P.num(''), null);
  assert.ok(isNaN(P.num('12a')));
  assert.ok(isNaN(P.num('1,2,3')));
});

t('água: balanço de massa sobre grão sujo', () => {
  // 100 000 kg de 12 % → 16 %: 100000 × 4 / 84 = 4761,9 L
  assert.strictEqual(Math.round(P.waterFor(100000, 12, 16) * 10) / 10, 4761.9);
  assert.strictEqual(P.waterFor(1000, 16, 16), 0);
  assert.strictEqual(P.waterFor(1000, 17, 16), 0);       // grão acima do alvo: sem água
  // Linha C 500 t/dia = 20,833 t/h, 12 → 16 %: 992 L/h
  assert.strictEqual(Math.round(P.waterRate(500 / 24, 12, 16)), 992);
});

t('caudal por defeito = capacidade/24', () => {
  const c = P.defaultProdConfig();
  assert.strictEqual(P.defaultFeedTph(c, 'D'), 12.5);
  assert.strictEqual(P.defaultFeedTph(c, 'X'), null);
});

t('dados mestre: S01–S21; B01–B04 sujo 130 t (C/D); B05–B06 temperado C 95 t; B07–B08 D 55 t; silos de produto B', () => {
  const c = P.defaultProdConfig();
  assert.strictEqual(c.grainSilos.length, 21); assert.strictEqual(c.grainSilos[0], 'S01'); assert.strictEqual(c.grainSilos[20], 'S21');
  assert.deepStrictEqual(c.dirtyBins, ['B01', 'B02', 'B03', 'B04'].map(id => ({ id, lines: ['C', 'D'], capT: 130 })));
  assert.deepStrictEqual(c.temperedBins, [{ id: 'B05', lines: ['C'], capT: 95 }, { id: 'B06', lines: ['C'], capT: 95 },
    { id: 'B07', lines: ['D'], capT: 55 }, { id: 'B08', lines: ['D'], capT: 55 }]);
  assert.deepStrictEqual(c.bins.map(b => b.id), ['B34', 'B35', 'B40', 'B43', 'B44', 'B45', 'B46', 'B47']);
  assert.deepStrictEqual(c.bins.filter(b => b.lines.includes('D')).map(b => b.id), ['B34', 'B35', 'B43']);
  assert.deepStrictEqual(c.bins.map(b => b.capT), [60, 60, 188, 188, 188, 188, 188, 145]);
  assert.deepStrictEqual(c.extraction, {}); assert.deepStrictEqual(c.recipes, {});
  assert.deepStrictEqual(P.validateProdConfig(c), []);
});

t('stock do silo a partir de eventos da app de Silos', () => {
  const ev = [
    { silo: 'S01', type: 'IN', kg: '30.000', date: '2026-10-01', time: '08:00' },
    { silo: 'S01', type: 'OUT', kg: 5000, date: '2026-10-02', time: '08:00' },
    { silo: 'S01', type: 'TRANSFER', toSilo: 'S02', kg: 5000, date: '2026-10-03', time: '08:00' },
    { silo: 'S03', type: 'IN', kg: 9000, date: '2026-10-01', time: '08:00' },
    { silo: 'S03', type: 'EMPTY', kg: 0, date: '2026-10-04', time: '08:00' }
  ];
  assert.strictEqual(P.siloKg('S01', ev), 20000);
  assert.strictEqual(P.siloKg('S02', ev), 5000);
  assert.strictEqual(P.siloKg('S03', ev), 0);
});

const T0 = Date.parse('2026-10-08T05:00:00.000Z');
const silosBackup = {
  app: 'moagem-app', format: 3, exportedAt: '2026-10-08T05:00:00.000Z',
  settings: [{ key: 'main', value: { silos: [
    { id: 'S01', cap: '500.000', cereal: 'Milho', colour: 'Branco', grade: 'G1' },
    { id: 'S02', cap: '500.000', cereal: 'Milho', colour: 'Branco', grade: 'G1' },
    { id: 'S03', cap: '500.000', cereal: 'Milho', colour: 'Amarelo', grade: 'G1' },
    { id: 'S04', cap: '500.000', cereal: 'Milho', colour: 'Branco', grade: 'OFF' },
    { id: 'S05', cap: '500.000', cereal: 'Milho', colour: 'Branco', grade: 'G1' },
    { id: 'Silo 15', cap: '500.000', cereal: 'Milho', colour: 'Branco', grade: 'G1' },
    { id: 'S06', cap: '500.000', cereal: 'Trigo', colour: '', grade: 'G1' }
  ] } }],
  events: ['S01', 'S02', 'S03', 'S04', 'S05', 'Silo 15', 'S06'].map((s, i) => ({ silo: s, type: 'IN', kg: i === 0 ? 60000 : 100000, date: '2026-10-01', time: '08:00' })),
  sevents: [{ id: 'E1', silo: 'S05', status: 'OPEN', level: 4 }, { id: 'E2', silo: 'S02', status: 'OPEN', level: 2 }],
  lots: [], monitor: []
};

t('snapshot da app de Silos e IDs fora da lista canónica', () => {
  const s = P.snapshotFromSilosBackup(silosBackup, 123);
  assert.strictEqual(s.silos.length, 7);
  assert.strictEqual(s.silos[0].kg, 60000);
  assert.strictEqual(s.silos[4].openLevel, 4);
  assert.strictEqual(s.silos[0].openEvent, false);
  assert.deepStrictEqual(P.nonCanonical(s, P.GRAIN_SILOS), ['Silo 15']);
  assert.throws(() => P.snapshotFromSilosBackup({ app: 'mill-qc' }, 1), /not-silos-backup/);
  assert.throws(() => P.snapshotFromSilosBackup({ app: 'moagem-app', settings: [], events: [] }, 1), /no-silos/);
});

t('lista de silos de grão', () => {
  assert.deepStrictEqual(P.parseSiloList('S01–S03, S10').silos, ['S01', 'S02', 'S03', 'S10']);
  assert.deepStrictEqual(P.parseSiloList('S01-S21').silos, P.GRAIN_SILOS);
  assert.deepStrictEqual(P.parseSiloList('S01, Silo 15, S01').errors, ['SILO 15', 'dup:S01']);
});

t('receita: cor e grau; receita em falta bloqueia', () => {
  const r = { colours: ['Branco'], grades: ['G1', 'G2'] };
  assert.deepStrictEqual(P.recipeFit(r, { cereal: 'Milho', colour: 'Branco', grade: 'G1' }, 'maize'), { ok: true });
  assert.strictEqual(P.recipeFit(r, { cereal: 'Milho', colour: 'Amarelo', grade: 'G1' }, 'maize').why, 'colour');
  assert.strictEqual(P.recipeFit(r, { cereal: 'Milho', colour: 'Branco', grade: 'OFF' }, 'maize').why, 'grade');
  assert.strictEqual(P.recipeFit(r, { cereal: 'Trigo', colour: '', grade: 'G1' }, 'maize').why, 'other_cereal');
  assert.strictEqual(P.recipeFit(null, { cereal: 'Milho' }, 'maize').why, 'recipe_not_set');
  assert.strictEqual(P.recipeFit({ colours: [], grades: ['G1'] }, { cereal: 'Milho' }, 'maize').why, 'recipe_not_set');
});

t('silo de produto: linha e produto diferente', () => {
  const c = P.defaultProdConfig();
  const b43 = c.bins.find(b => b.id === 'B43');
  assert.strictEqual(P.binCheck(b43, 'super', 'C', []).why, 'bin_line');
  assert.strictEqual(P.binCheck(b43, 'super', 'D', []).ok, true);
  const ev = [{ binId: 'B43', type: 'FILL', productId: 'fuba1', t: 1 }];
  const r = P.binCheck(b43, 'super', 'D', ev);
  assert.strictEqual(r.why, 'bin_other_product'); assert.strictEqual(r.current, 'fuba1');
  assert.strictEqual(P.binCheck(b43, 'fuba1', 'D', ev).ok, true);         // mesmo produto: pode continuar
  ev.push({ binId: 'B43', type: 'EMPTY', t: 2 });
  assert.strictEqual(P.binCheck(b43, 'super', 'D', ev).ok, true);         // vazio
  assert.strictEqual(P.binCheck(undefined, 'super', 'D', ev).why, 'bin_unknown');
});

// ---------- transferências silo de grão → silo de milho sujo ----------
function tctx(extra) {
  return Object.assign({ cfgP: P.defaultProdConfig(), millType: 'maize', snapshot: P.snapshotFromSilosBackup(silosBackup, T0 + 3600000),
    moves: [], jobs: [], shiftStart: T0 + 3600000 }, extra || {});
}
const baseTr = () => ({ binId: 'B01', silos: ['S01', 'S02'], kg: '100.000', silosConfirmed: true });
const codes = r => r.errors.map(e => e.code);
const mv = (binId, parts, t, type) => ({ uid: 'm' + Math.random(), type: type || 'TRANSFER', binId, t: t || T0 + 7200000, parts, kg: (parts || []).reduce((a, p) => a + p.kg, 0) });
const part = (silo, kg, colour, grade) => ({ silo, kg, cereal: 'Milho', colour: colour || 'Branco', grade: grade || 'G1' });

t('transferência válida: esvazia o 1.º silo, depois o seguinte', () => {
  const r = P.validateTransfer(baseTr(), tctx());
  assert.deepStrictEqual(codes(r), []);
  assert.deepStrictEqual(r.calc.parts, [part('S01', 60000), part('S02', 40000)]);
  assert.strictEqual(r.calc.freeKg, 130000);
  assert.ok(r.warnings.some(w => w.code === 'silo_event' && w.silo === 'S02'));
  assert.ok(r.warnings.some(w => w.code === 'snapshot_old'));
});

t('transferência: silo fora da lista canónica, outro cereal, Vermelho, stock, capacidade', () => {
  const t1 = baseTr(); t1.silos = ['Silo 15'];
  assert.ok(codes(P.validateTransfer(t1, tctx())).includes('silo_not_canonical'));
  t1.silos = ['S06'];
  assert.ok(P.validateTransfer(t1, tctx()).errors.some(e => e.code === 'silo_other_cereal' && e.cereal === 'Trigo'));
  t1.silos = ['S05'];
  assert.ok(codes(P.validateTransfer(t1, tctx())).includes('silo_red'));
  t1.silos = ['S01'];
  assert.ok(P.validateTransfer(t1, tctx()).errors.some(e => e.code === 'silo_short' && e.short === 40000));
  // B01 já com 100 t: só cabem 30 t
  const c = tctx({ moves: [mv('B01', [part('S02', 100000)])] });
  const r = P.validateTransfer(Object.assign(baseTr(), { silos: ['S03'], kg: '40.000' }), c);
  assert.ok(r.errors.some(e => e.code === 'dirty_bin_full' && e.free === 30000));
  // S02 já transferiu 100 t depois do snapshot → sem stock
  assert.ok(P.validateTransfer(Object.assign(baseTr(), { binId: 'B02', silos: ['S02'], kg: '10.000' }), c).errors.some(e => e.code === 'silo_short'));
  assert.strictEqual(P.availableKg(c.snapshot, c.moves, 'S02'), 0);
  // transferência anterior ao snapshot já está no stock da app de Silos: não desconta
  assert.strictEqual(P.availableKg(c.snapshot, [mv('B01', [part('S02', 100000)], T0 - 1000)], 'S02'), 100000);
  const t2 = baseTr(); t2.binId = 'B05'; t2.silosConfirmed = false; t2.silos = ['S01', 'S01'];
  ['dirty_bin_unknown', 'confirm_silos', 'silo_dup'].forEach(k => assert.ok(codes(P.validateTransfer(t2, tctx())).includes(k), k));
  assert.ok(codes(P.validateTransfer(baseTr(), tctx({ snapshot: null }))).includes('no_snapshot'));
});

t('transferência: aviso de mistura de cor/grau no silo de moagem', () => {
  const c = tctx({ moves: [mv('B01', [part('S01', 50000)])] });
  const r = P.validateTransfer(Object.assign(baseTr(), { silos: ['S03'], kg: '20.000' }), c);
  assert.deepStrictEqual(codes(r), []);
  assert.ok(r.warnings.some(w => w.code === 'bin_mixed'));
});

t('estado do silo de milho sujo: entradas, ordens, vazio', () => {
  const moves = [mv('B01', [part('S01', 60000), part('S03', 20000, 'Amarelo')], T0 + 100), mv('B01', [part('S02', 10000)], T0 + 200)];
  const jobs = [
    { uid: 'a', status: 'done', startedAt: T0 + 300, grainKg: 40000, actualKg: 30000, alloc: [{ bin: 'B01', kg: 40000 }] },
    { uid: 'b', status: 'running', startedAt: T0 + 400, grainKg: 10000, alloc: [{ bin: 'B01', kg: 10000 }] },
    { uid: 'c', status: 'cancelled', startedAt: T0 + 400, grainKg: 50000, alloc: [{ bin: 'B01', kg: 50000 }] }
  ];
  const st = P.dirtyBinState('B01', moves, jobs);
  assert.strictEqual(st.inKg, 90000); assert.strictEqual(st.drawnKg, 40000); assert.strictEqual(st.kg, 50000);
  assert.deepStrictEqual(st.comps.map(c => [c.colour, c.grade, c.kg, c.silos]), [['Branco', 'G1', 70000, ['S01', 'S02']], ['Amarelo', 'G1', 20000, ['S03']]]);
  assert.deepStrictEqual(st.runningJobs, ['b']);
  moves.push({ uid: 'e', type: 'EMPTY', binId: 'B01', t: T0 + 500, bookKg: 50000 });
  const st2 = P.dirtyBinState('B01', moves, jobs);
  assert.strictEqual(st2.kg, 0); assert.deepStrictEqual(st2.comps, []); assert.deepStrictEqual(st2.runningJobs, []);
});

// ---------- ordens a partir dos silos de milho sujo ----------
function ctx(extra) {
  const cfgP = P.defaultProdConfig();
  cfgP.recipes.super = { colours: ['Branco'], grades: ['G1'] };
  cfgP.extraction.super = 70;
  return Object.assign({ cfgP, millType: 'maize', jobs: [], binEvents: [], shiftStart: T0 + 3600000,
    moves: [mv('B01', [part('S01', 60000)], T0 + 100), mv('B02', [part('S02', 100000)], T0 + 100),
      mv('B03', [part('S03', 100000, 'Amarelo')], T0 + 100), mv('B04', [part('S04', 100000, 'Branco', 'OFF')], T0 + 100)] }, extra || {});
}
const baseJob = () => ({ productId: 'super', lineId: 'C', grainKg: '100.000', sources: ['B01', 'B02'], tempered: ['B05'], bins: ['B45', 'B44'],
  m0: '12,0', impurities: '1,5', m1: '16', feedTph: '' });

t('ordem válida: repartição pelos silos de moagem, água, caudal, produto esperado', () => {
  const r = P.validateJob(baseJob(), ctx());
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.calc.alloc, [{ bin: 'B01', kg: 60000 }, { bin: 'B02', kg: 40000 }]);
  assert.strictEqual(r.calc.waterL, 4762);
  assert.strictEqual(r.calc.waterLh, 992);
  assert.strictEqual(r.calc.expectedKg, 70000);
  assert.strictEqual(r.calc.hours, 4.8);
  const j = baseJob(); j.lineId = 'D'; j.tempered = ['B07']; j.bins = ['B43'];
  assert.deepStrictEqual(codes(P.validateJob(j, ctx())), []);          // B01–B04 servem as duas linhas
});

t('grão insuficiente nos silos de moagem → seleccionar mais', () => {
  const j = baseJob(); j.sources = ['B01'];
  const e = P.validateJob(j, ctx()).errors.find(x => x.code === 'source_short');
  assert.ok(e); assert.strictEqual(e.short, 40000);
  // grão já tirado por outra ordem em curso não está disponível
  const c = ctx({ jobs: [{ uid: 'x', status: 'running', lineId: 'D', startedAt: T0 + 500, grainKg: 50000, alloc: [{ bin: 'B02', kg: 50000 }] }] });
  assert.ok(!codes(P.validateJob(baseJob(), c)).includes('source_short'));               // 60 000 + 50 000 ≥ 100 000
  const r = P.validateJob(Object.assign(baseJob(), { grainKg: '120.000' }), c);
  assert.ok(r.errors.some(x => x.code === 'source_short' && x.short === 10000));   // 60 000 + 50 000
});

t('conteúdo do silo de moagem fora da receita bloqueia; vazio bloqueia', () => {
  const j = baseJob(); j.sources = ['B03', 'B04'];
  const inc = P.validateJob(j, ctx()).errors.filter(x => x.code === 'source_incompatible');
  assert.deepStrictEqual(inc.map(x => [x.bin, x.why, x.canAuth]), [['B03', 'colour', true], ['B04', 'grade', true]]);
  const c = ctx(); c.moves = c.moves.filter(m => m.binId !== 'B02');
  assert.ok(P.validateJob(baseJob(), c).errors.some(x => x.code === 'source_empty' && x.bin === 'B02'));
});

t('silos temperados: obrigatório e da linha', () => {
  const j = baseJob(); j.tempered = [];
  assert.ok(codes(P.validateJob(j, ctx())).includes('no_tempered'));
  j.tempered = ['B07'];
  assert.ok(P.validateJob(j, ctx()).errors.some(x => x.code === 'tempered_line' && x.bin === 'B07'));
  j.tempered = ['B01'];
  assert.ok(codes(P.validateJob(j, ctx())).includes('tempered_unknown'));
  j.tempered = ['B05']; j.sources = ['B05'];
  assert.ok(codes(P.validateJob(j, ctx())).includes('source_unknown'));
});

t('silo de produto com outro produto bloqueia', () => {
  const r = P.validateJob(baseJob(), ctx({ binEvents: [{ binId: 'B44', type: 'FILL', productId: 'fuba2', t: 1 }] }));
  const e = r.errors.find(x => x.code === 'bin_other_product');
  assert.ok(e); assert.strictEqual(e.bin, 'B44'); assert.strictEqual(e.current, 'fuba2');
});

t('silo de produto que a linha não alimenta bloqueia', () => {
  const j = baseJob(); j.lineId = 'D'; j.tempered = ['B07']; j.bins = ['B45'];
  assert.ok(codes(P.validateJob(j, ctx())).includes('bin_line'));
});

t('receita e campos em falta', () => {
  const j = baseJob(); j.productId = 'fuba1'; j.m0 = ''; j.impurities = 'x'; j.sources = [];
  const r = P.validateJob(j, ctx());
  ['recipe_not_set', 'no_source', 'need', 'bad'].forEach(c => assert.ok(codes(r).includes(c), c));
  assert.ok(r.warnings.some(w => w.code === 'no_extraction'));
});

t('molhador acima de 2 500 L/h bloqueia', () => {
  const j = baseJob(); j.m0 = '10'; j.m1 = '20'; j.feedTph = '25';   // 25 000 × 10/80 = 3 125 L/h
  const e = P.validateJob(j, ctx()).errors.find(x => x.code === 'dampener_max');
  assert.ok(e); assert.strictEqual(e.need, 3125);
  j.feedTph = '20';                                                   // 2 500 L/h exactamente: permitido
  assert.ok(!codes(P.validateJob(j, ctx())).includes('dampener_max'));
});

t('grão já no alvo: sem água (aviso)', () => {
  const j = baseJob(); j.m0 = '16'; j.m1 = '15';
  const r = P.validateJob(j, ctx());
  assert.strictEqual(r.calc.waterL, 0);
  assert.ok(r.warnings.some(w => w.code === 'no_water'));
});

t('linha ocupada por outra ordem a decorrer', () => {
  const r = P.validateJob(baseJob(), ctx({ jobs: [{ uid: 'x', status: 'running', lineId: 'C', startedAt: 1, alloc: [] }] }));
  assert.ok(codes(r).includes('line_busy'));
});

t('silo de moagem repetido e desconhecido', () => {
  const j = baseJob(); j.sources = ['B01', 'B01', 'B99'];
  const c = codes(P.validateJob(j, ctx()));
  assert.ok(c.includes('source_dup')); assert.ok(c.includes('source_unknown'));
});

t('capacidade dos silos de produto', () => {
  // 100 t de grão × 70 % = 70 t; B34 (60 t) não chega, B34+B35 (120 t) chega
  const j = baseJob(); j.bins = ['B34'];
  const e = P.validateJob(j, ctx()).errors.find(x => x.code === 'bin_capacity');
  assert.ok(e); assert.strictEqual(e.need, 70000); assert.strictEqual(e.cap, 60000);
  j.bins = ['B34', 'B35'];
  assert.ok(!codes(P.validateJob(j, ctx())).includes('bin_capacity'));
  j.bins = ['B34'];
  const r2 = P.validateJob(j, ctx({ binEvents: [{ binId: 'B34', type: 'FILL', productId: 'super', t: 1 }] }));
  assert.ok(!codes(r2).includes('bin_capacity'));
  assert.ok(r2.warnings.some(w => w.code === 'bin_level_unknown'));
  const c = ctx(); delete c.cfgP.extraction.super;
  assert.ok(!codes(P.validateJob(Object.assign(baseJob(), { bins: ['B34'] }), c)).includes('bin_capacity'));
});

t('mistura: percentagens, humidade ponderada, stock por silo de moagem', () => {
  const j = baseJob(); j.mode = 'blend'; j.m0 = ''; j.impurities = '';
  j.blend = { B01: { pct: '40', m0: '12', impurities: '1' }, B02: { pct: '60', m0: '14', impurities: '2' } };
  const r = P.validateJob(j, ctx());
  assert.deepStrictEqual(codes(r), []);
  assert.strictEqual(r.calc.m0, 13.2);
  assert.strictEqual(r.calc.impurities, 1.6);
  assert.deepStrictEqual(r.calc.alloc, [{ bin: 'B01', kg: 40000, pct: 40 }, { bin: 'B02', kg: 60000, pct: 60 }]);
  assert.strictEqual(r.calc.waterL, Math.round(100000 * (16 - 13.2) / 84));
  j.blend.B01.pct = '70';
  assert.ok(P.validateJob(j, ctx()).errors.some(e => e.code === 'blend_sum' && e.sum === 130));
  j.blend.B02.pct = '30';
  const sh = P.validateJob(j, ctx()).errors.find(e => e.code === 'blend_short');
  assert.ok(sh); assert.strictEqual(sh.bin, 'B01'); assert.strictEqual(sh.short, 10000);
  j.blend.B02.m0 = 'x';
  assert.ok(codes(P.validateJob(j, ctx())).includes('blend_m0'));
  j.blend.B02 = { pct: '', m0: '14', impurities: '1' };
  assert.ok(codes(P.validateJob(j, ctx())).includes('blend_pct'));
});

t('mistura de cor/grau fora da receita só com autorização', () => {
  const j = baseJob(); j.mode = 'blend'; j.sources = ['B02', 'B03', 'B04'];
  j.blend = { B02: { pct: '50', m0: '12', impurities: '1' }, B03: { pct: '25', m0: '12', impurities: '1' }, B04: { pct: '25', m0: '12', impurities: '1' } };
  const inc = P.validateJob(j, ctx()).errors.filter(e => e.code === 'source_incompatible');
  assert.deepStrictEqual(inc.map(e => e.why), ['colour', 'grade']);
  assert.ok(inc.every(e => e.canAuth));
  j.offRecipeAuth = { by: 'Sup', reason: '' };
  assert.ok(codes(P.validateJob(j, ctx())).includes('source_incompatible'));
  j.offRecipeAuth = { by: 'Sup', reason: 'falta de milho branco G1' };
  const r2 = P.validateJob(j, ctx());
  assert.ok(!codes(r2).includes('source_incompatible'));
  assert.deepStrictEqual(r2.calc.offRecipe.map(x => x.bin), ['B03', 'B04']);
  assert.ok(r2.warnings.some(w => w.code === 'off_recipe_auth'));
  // outro cereal num silo de moagem nunca é autorizável
  const c = ctx(); c.moves.push(mv('B02', [{ silo: 'S06', kg: 1000, cereal: 'Trigo', colour: '', grade: 'G1' }], T0 + 150));
  const r3 = P.validateJob(j, c);
  assert.ok(r3.errors.some(e => e.code === 'source_incompatible' && e.bin === 'B02' && !e.canAuth));
});

t('humidade do milho por turno: recalcula o caudal de água', () => {
  const job = { status: 'running', startedAt: 1000, feedTph: 500 / 24, m1: 16, dampenerMaxLh: 2500, readings: [] };
  const r = P.readingCalc(job, '13,0');
  assert.strictEqual(r.m0, 13); assert.strictEqual(r.waterLh, Math.round(20833.333 * 3 / 84)); assert.strictEqual(r.over, false);
  assert.strictEqual(P.readingCalc(job, '6').over, false);   // 20 833 × 10/84 = 2 480 L/h
  assert.strictEqual(P.readingCalc(job, '5').over, true);    // 20 833 × 11/84 = 2 728 L/h > 2 500
  assert.strictEqual(P.readingCalc(job, '17').noWater, true);
  assert.strictEqual(P.readingCalc(job, 'x').error, 'bad');
  assert.strictEqual(P.needsShiftReading(job, 500), false);  // começou neste turno
  assert.strictEqual(P.needsShiftReading(job, 2000), true);  // turno seguinte, sem leitura
  job.readings.push({ t: 2100 });
  assert.strictEqual(P.needsShiftReading(job, 2000), false);
  assert.strictEqual(P.needsShiftReading(Object.assign({}, job, { status: 'done' }), 5000), false);
});

t('texto de silos de produto', () => {
  const r = P.parseBins('34:C,D:60; 45:C:188\n46:C', ['C', 'D']);
  assert.deepStrictEqual(r.bins, [{ id: '34', lines: ['C', 'D'], capT: 60 }, { id: '45', lines: ['C'], capT: 188 }, { id: '46', lines: ['C'], capT: null }]);
  ['dirtyBins', 'temperedBins'].forEach(k => assert.deepStrictEqual(P.parseBins(P.binsText(P.defaultProdConfig()[k]), ['C', 'D']).bins, P.defaultProdConfig()[k]));
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(P.parseBins('23:X; 24:C; 24:D; 25:C:0; 26:C:abc', ['C', 'D']).errors, ['23:X', '24:D', '25:C:0', '26:C:abc']);
  assert.strictEqual(P.binsText(r.bins), '34:C,D:60; 45:C:188; 46:C');
  assert.deepStrictEqual(P.parseBins(P.binsText(P.defaultProdConfig().bins), ['C', 'D']).bins, P.defaultProdConfig().bins);
});

t('configuração: validação e diferenças', () => {
  const a = P.defaultProdConfig(), b = JSON.parse(JSON.stringify(a));
  assert.deepStrictEqual(P.validateProdConfig(a), []);
  b.extraction.super = 120; b.dampenerMaxLh = 0;
  assert.deepStrictEqual(P.validateProdConfig(b).sort(), ['dampenerMaxLh', 'extraction:super']);
  b.extraction.super = 72; b.dampenerMaxLh = 2500; b.recipes.super = { colours: ['Branco'], grades: ['G1'] };
  const d = P.prodConfigDiff(a, b).map(x => x.field);
  assert.deepStrictEqual(d, ['extraction.super', 'recipe.super']);
  // mesmo ID em duas listas
  const c = P.defaultProdConfig(); c.temperedBins.push({ id: 'B01', lines: ['C'], capT: 95 });
  assert.ok(P.validateProdConfig(c).includes('dupIds'));
  const c2 = P.defaultProdConfig(); c2.temperedBins[2].capT = 60;
  assert.deepStrictEqual(P.prodConfigDiff(P.defaultProdConfig(), c2).map(x => x.field), ['temperedBins']);
});

t('diário: validação, anulação e resumo do turno', () => {
  assert.deepStrictEqual(P.validateIssue({ code: 'A22', description: 'x', downtimeMin: '30' }), []);
  assert.deepStrictEqual(P.validateIssue({ code: '', description: 'x', downtimeMin: '30' }), ['code']);        // paragem sem código
  assert.deepStrictEqual(P.validateIssue({ code: '', description: 'x', downtimeMin: '' }), []);          // sem paragem: código opcional
  assert.deepStrictEqual(P.validateIssue({ code: 'Z99', description: ' ', downtimeMin: '-1' }), ['downtimeMin', 'code', 'description']);
  assert.deepStrictEqual(P.validateActivity({ type: 'housekeeping', floor: '' }), ['floor']);
  assert.deepStrictEqual(P.validateActivity({ type: 'reprocessing', qtyKg: '1.200' }), []);
  assert.deepStrictEqual(P.validateActivity({ type: 'other', description: '' }), ['description']);
  const log = [
    { uid: 'i1', kind: 'issue', prodDay: '2026-10-08', period: 'D', t: 2, downtimeMin: 30, code: 'A22', status: 'open' },
    { uid: 'i2', kind: 'issue', prodDay: '2026-10-08', period: 'D', t: 3, downtimeMin: 15, code: 'P13', status: 'closed' },
    { uid: 'i3', kind: 'issue', prodDay: '2026-10-08', period: 'D', t: 4, downtimeMin: 99, status: 'open' },
    { uid: 'v1', kind: 'void', voids: 'i3', t: 5 },
    { uid: 'a1', kind: 'activity', prodDay: '2026-10-08', period: 'D', t: 1, type: 'housekeeping', floor: '3' },
    { uid: 'a2', kind: 'activity', prodDay: '2026-10-08', period: 'N', t: 9, type: 'cleaning' }
  ];
  const jobs = [{ uid: 'j1', startedAt: 100, closedAt: 200 }, { uid: 'j2', startedAt: 1000 }, { uid: 'j3', startedAt: 10, closedAt: 50 }];
  log.push({ uid: 'zz', kind: 'activity', prodDay: '2026-10-08', period: 'D', t: 1, createdAt: 5, type: 'cleaning' });
  log.find(x => x.uid === 'a1').createdAt = 9;
  const s0 = P.shiftSummary('2026-10-08', 'D', [60, 500], { log, jobs, now: 2000 });
  assert.deepStrictEqual(s0.acts.map(a => a.uid), ['zz', 'a1']);           // mesma hora → ordem de gravação
  log.pop();
  const s = P.shiftSummary('2026-10-08', 'D', [60, 500], { log, jobs, now: 2000 });
  assert.strictEqual(s.issues.length, 2); assert.strictEqual(s.acts.length, 1);
  assert.strictEqual(s.downtimeMin, 45); assert.strictEqual(s.openIssues, 1);
  assert.deepStrictEqual(s.byV2, { Breakdown: 30, Process: 15 });
  assert.deepStrictEqual(s.byOee, { '': 45 });                              // OEE ainda não definido
  assert.deepStrictEqual(s.jobs.map(j => j.uid), ['j1']);
});

t('códigos de paragem FMO (Downtime_Codes.xlsx)', () => {
  assert.strictEqual(P.DOWNTIME_CODES.length, 60);
  assert.strictEqual(new Set(P.DOWNTIME_CODES.map(c => c.code)).size, 60);
  assert.ok(P.DOWNTIME_CODES.every(c => /^[PAO]\d{2}$/.test(c.code) && c.code === c.code.trim()));
  assert.ok(P.DOWNTIME_CODES.every(c => P.TIER3.indexOf(c.tier3) >= 0));
  assert.ok(P.DOWNTIME_CODES.every(c => c.v2 === null || P.V2_CATS.indexOf(c.v2) >= 0));
  assert.deepStrictEqual(P.findCode('A02'), { code: 'A02', name: 'ASPIRATION FAN', namePt: null, v1: 'Unplanned - Mechanical Breakdown', v2: 'Breakdown', tier3: 'Breakdown', oee: null, active: true });
  assert.strictEqual(P.findCode('P24').v2, null);               // célula só com traços no ficheiro
  assert.strictEqual(P.findCode('O04').tier3, 'Power Failure');
  assert.ok(P.DOWNTIME_CODES.every(c => c.oee === null && c.namePt === null && !('decision' in c)));
  assert.deepStrictEqual(P.validateCodes(P.defaultCodes()), []);
});

t('códigos editáveis: validação, inactivos, diferenças', () => {
  const list = P.defaultCodes();
  list[0].namePt = 'ARRANQUE DE PRODUÇÃO'; list[0].oee = 'planned';
  list.find(c => c.code === 'A22').active = false;
  list.push({ code: 'P25', name: 'NEW STOP', namePt: null, v1: null, v2: 'Process', tier3: null, oee: 'availability', active: true });
  assert.deepStrictEqual(P.validateCodes(list), []);
  const bad = P.defaultCodes().concat([{ code: 'p1', name: '' }, { code: 'P01', name: 'x' }]);
  bad.find(c => c.code === 'P02').oee = 'xyz'; bad.find(c => c.code === 'P03').v2 = 'Other';
  assert.deepStrictEqual(P.validateCodes(bad).sort(), ['code:p1', 'dup:P01', 'name:p1', 'oee:P02', 'v2:P03']);
  // inactivo não pode ser usado em novas ocorrências
  assert.deepStrictEqual(P.validateIssue({ code: 'A22', description: 'x', downtimeMin: '5' }, list), ['code']);
  assert.deepStrictEqual(P.validateIssue({ code: 'P25', description: 'x', downtimeMin: '5' }, list), []);
  const a = P.defaultProdConfig(), b = Object.assign({}, a, { downtimeCodes: list });
  const d = P.prodConfigDiff(a, b).map(x => x.field);
  assert.deepStrictEqual(d.sort(), ['code.A22.active', 'code.P01.namePt', 'code.P01.oee', 'code.P25.active', 'code.P25.name', 'code.P25.oee', 'code.P25.v2'].sort());
});

t('identificador e validação da cópia', () => {
  assert.strictEqual(P.uid('abc', 36 * 36, 'r1'), 'abc-100-r1');
  assert.ok(P.validProdBackup({}));
  assert.ok(!P.validProdBackup({ grainMoves: [{ uid: 'a', binId: 'B01', type: 'DELETE' }] }));
  assert.ok(P.validProdBackup({ grainMoves: [{ uid: 'a', binId: 'B01', type: 'TRANSFER' }], jobs: [{ uid: 'a', status: 'running', lineId: 'C' }], binEvents: [{ uid: 'b', binId: '23', type: 'FILL' }], shiftLog: [{ uid: 'c', kind: 'issue' }] }));
  assert.ok(!P.validProdBackup({ jobs: [{ uid: 'a', status: 'hacked', lineId: 'C' }] }));
  assert.ok(!P.validProdBackup({ shiftLog: 'x' }));
});

console.log('prod.test.js: ' + n + ' testes OK');
