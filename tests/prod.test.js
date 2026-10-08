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

t('silos de produto por defeito: 8 silos; D alimenta 34, 35, 43; 34/35 60 t, resto 188 t', () => {
  const c = P.defaultProdConfig();
  assert.deepStrictEqual(c.bins.map(b => b.id).sort(), ['34', '35', '40', '43', '44', '45', '46', '47']);
  assert.deepStrictEqual(c.bins.filter(b => b.lines.includes('D')).map(b => b.id), ['34', '35', '43']);
  assert.deepStrictEqual(c.bins.filter(b => b.capT === 60).map(b => b.id), ['34', '35']);
  assert.ok(c.bins.filter(b => b.capT === 188).length === 6);
  assert.ok(c.bins.every(b => b.lines.every(l => l === 'C' || l === 'D')));
  assert.deepStrictEqual(c.extraction, {});
  assert.deepStrictEqual(c.recipes, {});
});

t('stock do silo a partir de eventos da app de Silos', () => {
  const ev = [
    { silo: 'S1', type: 'IN', kg: '30.000', date: '2026-10-01', time: '08:00' },
    { silo: 'S1', type: 'OUT', kg: 5000, date: '2026-10-02', time: '08:00' },
    { silo: 'S1', type: 'TRANSFER', toSilo: 'S2', kg: 5000, date: '2026-10-03', time: '08:00' },
    { silo: 'S3', type: 'IN', kg: 9000, date: '2026-10-01', time: '08:00' },
    { silo: 'S3', type: 'EMPTY', kg: 0, date: '2026-10-04', time: '08:00' }
  ];
  assert.strictEqual(P.siloKg('S1', ev), 20000);
  assert.strictEqual(P.siloKg('S2', ev), 5000);
  assert.strictEqual(P.siloKg('S3', ev), 0);
});

const silosBackup = {
  app: 'moagem-app', format: 3, exportedAt: '2026-10-08T05:00:00.000Z',
  settings: [{ key: 'main', value: { silos: [
    { id: 'S1', cap: '500.000', cereal: 'Milho', colour: 'Branco', grade: 'G1' },
    { id: 'S2', cap: '500.000', cereal: 'Milho', colour: 'Branco', grade: 'G1' },
    { id: 'S3', cap: '500.000', cereal: 'Milho', colour: 'Amarelo', grade: 'G1' },
    { id: 'S4', cap: '500.000', cereal: 'Milho', colour: 'Branco', grade: 'OFF' },
    { id: 'S5', cap: '500.000', cereal: 'Milho', colour: 'Branco', grade: 'G1' }
  ] } }],
  events: [
    { silo: 'S1', type: 'IN', kg: 60000, date: '2026-10-01', time: '08:00' },
    { silo: 'S2', type: 'IN', kg: 100000, date: '2026-10-01', time: '08:00' },
    { silo: 'S3', type: 'IN', kg: 100000, date: '2026-10-01', time: '08:00' },
    { silo: 'S4', type: 'IN', kg: 100000, date: '2026-10-01', time: '08:00' },
    { silo: 'S5', type: 'IN', kg: 100000, date: '2026-10-01', time: '08:00' }
  ],
  sevents: [{ id: 'E1', silo: 'S5', status: 'OPEN', level: 4 }, { id: 'E2', silo: 'S2', status: 'OPEN', level: 2 }],
  lots: [], monitor: []
};

t('snapshot da app de Silos', () => {
  const s = P.snapshotFromSilosBackup(silosBackup, 123);
  assert.strictEqual(s.silos.length, 5);
  assert.strictEqual(s.silos[0].kg, 60000);
  assert.strictEqual(s.silos[4].openLevel, 4);
  assert.strictEqual(s.silos[0].openEvent, false);
  assert.throws(() => P.snapshotFromSilosBackup({ app: 'mill-qc' }, 1), /not-silos-backup/);
  assert.throws(() => P.snapshotFromSilosBackup({ app: 'moagem-app', settings: [], events: [] }, 1), /no-silos/);
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
  const b43 = c.bins.find(b => b.id === '43');
  assert.strictEqual(P.binCheck(b43, 'super', 'C', []).why, 'bin_line');
  assert.strictEqual(P.binCheck(b43, 'super', 'D', []).ok, true);
  const ev = [{ binId: '43', type: 'FILL', productId: 'fuba1', t: 1 }];
  const r = P.binCheck(b43, 'super', 'D', ev);
  assert.strictEqual(r.why, 'bin_other_product'); assert.strictEqual(r.current, 'fuba1');
  assert.strictEqual(P.binCheck(b43, 'fuba1', 'D', ev).ok, true);         // mesmo produto: pode continuar
  ev.push({ binId: '43', type: 'EMPTY', t: 2 });
  assert.strictEqual(P.binCheck(b43, 'super', 'D', ev).ok, true);         // vazio
  assert.strictEqual(P.binCheck(undefined, 'super', 'D', ev).why, 'bin_unknown');
});

function ctx(extra) {
  const cfgP = P.defaultProdConfig();
  cfgP.recipes.super = { colours: ['Branco'], grades: ['G1'] };
  cfgP.extraction.super = 70;
  return Object.assign({ cfgP, millType: 'maize', snapshot: P.snapshotFromSilosBackup(silosBackup, Date.parse('2026-10-08T06:00:00Z')),
    jobs: [], binEvents: [], shiftStart: Date.parse('2026-10-08T06:00:00Z') }, extra || {});
}
const baseJob = () => ({ productId: 'super', lineId: 'C', grainKg: '100.000', silos: ['S1', 'S2'], bins: ['45', '44'],
  m0: '12,0', impurities: '1,5', m1: '16', feedTph: '', silosConfirmed: true });
const codes = r => r.errors.map(e => e.code);

t('ordem válida: repartição, água, caudal, produto esperado', () => {
  const r = P.validateJob(baseJob(), ctx());
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(r.calc.alloc, [{ silo: 'S1', kg: 60000 }, { silo: 'S2', kg: 40000 }]);
  assert.strictEqual(r.calc.waterL, 4762);
  assert.strictEqual(r.calc.waterLh, 992);
  assert.strictEqual(r.calc.expectedKg, 70000);
  assert.strictEqual(r.calc.hours, 4.8);
  assert.ok(r.warnings.some(w => w.code === 'silo_event' && w.silo === 'S2'));   // evento aberto nível 2 = aviso
  assert.ok(r.warnings.some(w => w.code === 'snapshot_old'));                    // exportado antes do início do turno
});

t('stock insuficiente num silo → pedir mais silos', () => {
  const j = baseJob(); j.silos = ['S1'];
  const r = P.validateJob(j, ctx());
  const e = r.errors.find(x => x.code === 'silo_short');
  assert.ok(e); assert.strictEqual(e.short, 40000);
});

t('matéria-prima incompatível (cor, grau) bloqueia', () => {
  const j = baseJob(); j.silos = ['S3', 'S4'];
  const r = P.validateJob(j, ctx());
  const inc = r.errors.filter(x => x.code === 'silo_incompatible').map(x => x.why);
  assert.deepStrictEqual(inc, ['colour', 'grade']);
});

t('silo com evento de armazenagem Vermelho bloqueia', () => {
  const j = baseJob(); j.silos = ['S5'];
  assert.ok(codes(P.validateJob(j, ctx())).includes('silo_red'));
});

t('silo de produto com outro produto bloqueia', () => {
  const r = P.validateJob(baseJob(), ctx({ binEvents: [{ binId: '44', type: 'FILL', productId: 'fuba2', t: 1 }] }));
  const e = r.errors.find(x => x.code === 'bin_other_product');
  assert.ok(e); assert.strictEqual(e.bin, '44'); assert.strictEqual(e.current, 'fuba2');
});

t('silo de produto que a linha não alimenta bloqueia', () => {
  const j = baseJob(); j.lineId = 'D'; j.bins = ['45'];
  assert.ok(codes(P.validateJob(j, ctx())).includes('bin_line'));
});

t('receita, snapshot, confirmação e campos em falta', () => {
  const j = baseJob(); j.productId = 'fuba1'; j.silosConfirmed = false; j.m0 = ''; j.impurities = 'x';
  const r = P.validateJob(j, ctx({ snapshot: null }));
  ['recipe_not_set', 'no_snapshot', 'confirm_silos', 'need', 'bad'].forEach(c => assert.ok(codes(r).includes(c), c));
  assert.ok(r.warnings.some(w => w.code === 'no_extraction'));
});

t('molhador acima de 2 500 L/h bloqueia', () => {
  const j = baseJob(); j.m0 = '10'; j.m1 = '20'; j.feedTph = '25';   // 25 000 × 10/80 = 3 125 L/h
  const r = P.validateJob(j, ctx());
  const e = r.errors.find(x => x.code === 'dampener_max');
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

t('grão comprometido por ordens após o snapshot não é contado duas vezes', () => {
  const c = ctx();
  const later = Date.parse('2026-10-08T07:00:00Z'), before = Date.parse('2026-10-08T04:00:00Z');
  c.jobs = [
    { uid: 'a', status: 'done', lineId: 'D', startedAt: later, grainKg: 50000, actualKg: 25000, alloc: [{ silo: 'S2', kg: 50000 }] },
    { uid: 'b', status: 'running', lineId: 'D', startedAt: later, grainKg: 10000, alloc: [{ silo: 'S2', kg: 10000 }] },
    { uid: 'c', status: 'done', lineId: 'D', startedAt: before, grainKg: 90000, alloc: [{ silo: 'S2', kg: 90000 }] },
    { uid: 'd', status: 'cancelled', lineId: 'D', startedAt: later, grainKg: 90000, alloc: [{ silo: 'S2', kg: 90000 }] }
  ];
  assert.strictEqual(P.availableKg(c.snapshot, c.jobs, 'S2'), 65000);   // 100 000 − 25 000 − 10 000
  c.jobs = c.jobs.filter(j => j.uid !== 'b');
  const r = P.validateJob(baseJob(), c);
  assert.deepStrictEqual(r.calc.alloc, [{ silo: 'S1', kg: 60000 }, { silo: 'S2', kg: 40000 }]);
});

t('silo repetido e silo desconhecido', () => {
  const j = baseJob(); j.silos = ['S1', 'S1', 'ZZ'];
  const c = codes(P.validateJob(j, ctx()));
  assert.ok(c.includes('silo_dup')); assert.ok(c.includes('silo_unknown'));
});


t('capacidade dos silos de produto', () => {
  // 100 t de grão × 70 % = 70 t; 34 (60 t) não chega, 34+35 (120 t) chega
  const j = baseJob(); j.bins = ['34'];
  const r = P.validateJob(j, ctx());
  const e = r.errors.find(x => x.code === 'bin_capacity');
  assert.ok(e); assert.strictEqual(e.need, 70000); assert.strictEqual(e.cap, 60000);
  j.bins = ['34', '35'];
  assert.ok(!codes(P.validateJob(j, ctx())).includes('bin_capacity'));
  // silo de produto já com o mesmo produto: nível desconhecido → aviso, não bloqueio
  j.bins = ['34'];
  const r2 = P.validateJob(j, ctx({ binEvents: [{ binId: '34', type: 'FILL', productId: 'super', t: 1 }] }));
  assert.ok(!codes(r2).includes('bin_capacity'));
  assert.ok(r2.warnings.some(w => w.code === 'bin_level_unknown'));
  // sem extracção: sem verificação de capacidade (aviso no_extraction)
  const c = ctx(); delete c.cfgP.extraction.super;
  assert.ok(!codes(P.validateJob(Object.assign(baseJob(), { bins: ['34'] }), c)).includes('bin_capacity'));
});

t('mistura: percentagens, humidade ponderada, stock por silo', () => {
  const j = baseJob(); j.mode = 'blend'; j.m0 = ''; j.impurities = '';
  j.blend = { S1: { pct: '40', m0: '12', impurities: '1' }, S2: { pct: '60', m0: '14', impurities: '2' } };
  const r = P.validateJob(j, ctx());
  assert.deepStrictEqual(codes(r), []);
  assert.strictEqual(r.calc.m0, 13.2);                    // 0,4×12 + 0,6×14
  assert.strictEqual(r.calc.impurities, 1.6);
  assert.deepStrictEqual(r.calc.alloc, [{ silo: 'S1', kg: 40000, pct: 40 }, { silo: 'S2', kg: 60000, pct: 60 }]);
  assert.strictEqual(r.calc.waterL, Math.round(100000 * (16 - 13.2) / 84));
  j.blend.S1.pct = '70';                                  // 70 000 de S1 (60 000 disponível) e soma 130
  const r2 = P.validateJob(j, ctx());
  assert.ok(r2.errors.some(e => e.code === 'blend_sum' && e.sum === 130));
  j.blend.S2.pct = '30';
  const r3 = P.validateJob(j, ctx());
  const sh = r3.errors.find(e => e.code === 'blend_short');
  assert.ok(sh); assert.strictEqual(sh.silo, 'S1'); assert.strictEqual(sh.short, 10000);
  j.blend.S2.m0 = 'x';
  assert.ok(codes(P.validateJob(j, ctx())).includes('blend_m0'));
  j.blend.S2 = { pct: '', m0: '14', impurities: '1' };
  assert.ok(codes(P.validateJob(j, ctx())).includes('blend_pct'));
});

t('mistura de cor/grau fora da receita só com autorização', () => {
  const j = baseJob(); j.mode = 'blend'; j.silos = ['S2', 'S3', 'S4'];
  j.blend = { S2: { pct: '50', m0: '12', impurities: '1' }, S3: { pct: '25', m0: '12', impurities: '1' }, S4: { pct: '25', m0: '12', impurities: '1' } };
  const r = P.validateJob(j, ctx());
  const inc = r.errors.filter(e => e.code === 'silo_incompatible');
  assert.deepStrictEqual(inc.map(e => e.why), ['colour', 'grade']);
  assert.ok(inc.every(e => e.canAuth));
  j.offRecipeAuth = { by: 'Sup', reason: '' };               // sem motivo não conta
  assert.ok(codes(P.validateJob(j, ctx())).includes('silo_incompatible'));
  j.offRecipeAuth = { by: 'Sup', reason: 'falta de milho branco G1' };
  const r2 = P.validateJob(j, ctx());
  assert.ok(!codes(r2).includes('silo_incompatible'));
  assert.deepStrictEqual(r2.calc.offRecipe.map(x => x.silo), ['S3', 'S4']);
  assert.ok(r2.warnings.some(w => w.code === 'off_recipe_auth'));
  // outro cereal nunca é autorizável
  const c = ctx(); c.snapshot.silos.push({ id: 'T1', cereal: 'Trigo', colour: '', grade: 'G1', kg: 50000 });
  j.silos = ['S2', 'T1']; j.blend = { S2: { pct: '50', m0: '12', impurities: '1' }, T1: { pct: '50', m0: '12', impurities: '1' } };
  const r3 = P.validateJob(j, c);
  assert.ok(r3.errors.some(e => e.code === 'silo_incompatible' && e.why === 'other_cereal' && !e.canAuth));
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
  assert.deepStrictEqual(s.byTier3, { Breakdown: 30, Process: 15 });
  assert.deepStrictEqual(s.jobs.map(j => j.uid), ['j1']);
});

t('códigos de paragem FMO (Downtime_Codes.xlsx)', () => {
  assert.strictEqual(P.DOWNTIME_CODES.length, 60);
  assert.strictEqual(new Set(P.DOWNTIME_CODES.map(c => c.code)).size, 60);
  assert.ok(P.DOWNTIME_CODES.every(c => /^[PAO]\d{2}$/.test(c.code) && c.code === c.code.trim()));
  assert.ok(P.DOWNTIME_CODES.every(c => P.TIER3.indexOf(c.tier3) >= 0));
  assert.deepStrictEqual(P.findCode('A02'), { code: 'A02', name: 'ASPIRATION FAN', v1: 'Unplanned - Mechanical Breakdown', v2: 'Breakdown', decision: null, tier3: 'Breakdown' });
  assert.strictEqual(P.findCode('P24').v2, null);               // célula só com traços no ficheiro
  assert.strictEqual(P.findCode('O04').tier3, 'Power Failure');
});

t('identificador e validação da cópia', () => {
  assert.strictEqual(P.uid('abc', 36 * 36, 'r1'), 'abc-100-r1');
  assert.ok(P.validProdBackup({}));
  assert.ok(P.validProdBackup({ jobs: [{ uid: 'a', status: 'running', lineId: 'C' }], binEvents: [{ uid: 'b', binId: '23', type: 'FILL' }], shiftLog: [{ uid: 'c', kind: 'issue' }] }));
  assert.ok(!P.validProdBackup({ jobs: [{ uid: 'a', status: 'hacked', lineId: 'C' }] }));
  assert.ok(!P.validProdBackup({ shiftLog: 'x' }));
});

console.log('prod.test.js: ' + n + ' testes OK');
