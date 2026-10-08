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

t('silos de produto por defeito: só C/D, D alimenta 24, 34, 35, 39, 43', () => {
  const c = P.defaultProdConfig();
  assert.strictEqual(c.bins.length, 15);
  assert.deepStrictEqual(c.bins.filter(b => b.lines.includes('D')).map(b => b.id), ['24', '34', '35', '39', '43']);
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
  const b39 = c.bins.find(b => b.id === '39');
  assert.strictEqual(P.binCheck(b39, 'super', 'C', []).why, 'bin_line');
  assert.strictEqual(P.binCheck(b39, 'super', 'D', []).ok, true);
  const ev = [{ binId: '39', type: 'FILL', productId: 'fuba1', t: 1 }];
  const r = P.binCheck(b39, 'super', 'D', ev);
  assert.strictEqual(r.why, 'bin_other_product'); assert.strictEqual(r.current, 'fuba1');
  assert.strictEqual(P.binCheck(b39, 'fuba1', 'D', ev).ok, true);         // mesmo produto: pode continuar
  ev.push({ binId: '39', type: 'EMPTY', t: 2 });
  assert.strictEqual(P.binCheck(b39, 'super', 'D', ev).ok, true);         // vazio
  assert.strictEqual(P.binCheck(undefined, 'super', 'D', ev).why, 'bin_unknown');
});

function ctx(extra) {
  const cfgP = P.defaultProdConfig();
  cfgP.recipes.super = { colours: ['Branco'], grades: ['G1'] };
  cfgP.extraction.super = 70;
  return Object.assign({ cfgP, millType: 'maize', snapshot: P.snapshotFromSilosBackup(silosBackup, Date.parse('2026-10-08T06:00:00Z')),
    jobs: [], binEvents: [], shiftStart: Date.parse('2026-10-08T06:00:00Z') }, extra || {});
}
const baseJob = () => ({ productId: 'super', lineId: 'C', grainKg: '100.000', silos: ['S1', 'S2'], bins: ['23', '24'],
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
  const r = P.validateJob(baseJob(), ctx({ binEvents: [{ binId: '24', type: 'FILL', productId: 'fuba2', t: 1 }] }));
  const e = r.errors.find(x => x.code === 'bin_other_product');
  assert.ok(e); assert.strictEqual(e.bin, '24'); assert.strictEqual(e.current, 'fuba2');
});

t('silo de produto que a linha não alimenta bloqueia', () => {
  const j = baseJob(); j.lineId = 'D'; j.bins = ['23'];
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

t('texto de silos de produto', () => {
  const r = P.parseBins('23:C; 24:C,D\n39 D', ['C', 'D']);
  assert.deepStrictEqual(r.bins, [{ id: '23', lines: ['C'] }, { id: '24', lines: ['C', 'D'] }, { id: '39', lines: ['D'] }]);
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(P.parseBins('23:X; 24:C; 24:D', ['C', 'D']).errors, ['23:X', '24:D']);
  assert.strictEqual(P.binsText(r.bins), '23:C; 24:C,D; 39:D');
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
  assert.deepStrictEqual(P.validateIssue({ category: 'breakdown', description: 'x', downtimeMin: '30' }), []);
  assert.deepStrictEqual(P.validateIssue({ category: 'zz', description: ' ', downtimeMin: '-1' }), ['category', 'description', 'downtimeMin']);
  assert.deepStrictEqual(P.validateActivity({ type: 'housekeeping', floor: '' }), ['floor']);
  assert.deepStrictEqual(P.validateActivity({ type: 'reprocessing', qtyKg: '1.200' }), []);
  assert.deepStrictEqual(P.validateActivity({ type: 'other', description: '' }), ['description']);
  const log = [
    { uid: 'i1', kind: 'issue', prodDay: '2026-10-08', period: 'D', t: 2, downtimeMin: 30, status: 'open' },
    { uid: 'i2', kind: 'issue', prodDay: '2026-10-08', period: 'D', t: 3, downtimeMin: 15, status: 'closed' },
    { uid: 'i3', kind: 'issue', prodDay: '2026-10-08', period: 'D', t: 4, downtimeMin: 99, status: 'open' },
    { uid: 'v1', kind: 'void', voids: 'i3', t: 5 },
    { uid: 'a1', kind: 'activity', prodDay: '2026-10-08', period: 'D', t: 1, type: 'housekeeping', floor: '3' },
    { uid: 'a2', kind: 'activity', prodDay: '2026-10-08', period: 'N', t: 9, type: 'cleaning' }
  ];
  const jobs = [{ uid: 'j1', startedAt: 100, closedAt: 200 }, { uid: 'j2', startedAt: 1000 }, { uid: 'j3', startedAt: 10, closedAt: 50 }];
  const s = P.shiftSummary('2026-10-08', 'D', [60, 500], { log, jobs, now: 2000 });
  assert.strictEqual(s.issues.length, 2); assert.strictEqual(s.acts.length, 1);
  assert.strictEqual(s.downtimeMin, 45); assert.strictEqual(s.openIssues, 1);
  assert.deepStrictEqual(s.jobs.map(j => j.uid), ['j1']);
});

t('identificador e validação da cópia', () => {
  assert.strictEqual(P.uid('abc', 36 * 36, 'r1'), 'abc-100-r1');
  assert.ok(P.validProdBackup({}));
  assert.ok(P.validProdBackup({ jobs: [{ uid: 'a', status: 'running', lineId: 'C' }], binEvents: [{ uid: 'b', binId: '23', type: 'FILL' }], shiftLog: [{ uid: 'c', kind: 'issue' }] }));
  assert.ok(!P.validProdBackup({ jobs: [{ uid: 'a', status: 'hacked', lineId: 'C' }] }));
  assert.ok(!P.validProdBackup({ shiftLog: 'x' }));
});

console.log('prod.test.js: ' + n + ' testes OK');
