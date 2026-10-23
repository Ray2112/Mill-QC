// node tests/shift-readings.test.js — leituras de balança por turno (v2.2.0)
const assert = require('assert');
const P = require('../js/prod.js');

const ctx = (readings) => ({ lineIds: ['C', 'D'], productIds: ['F1', 'F2', 'FAR'], readings: readings || [] });
const f = (o) => Object.assign({ prodDay: '2026-10-24', period: 'D', lineId: 'C', srKind: 'grain', productId: '', point: 'start', valueKg: '1.250.000', by: 'Zhax' }, o);
let n = 0;
const rec = (o) => Object.assign({ uid: 'r' + (++n), prodDay: '2026-10-24', period: 'D', lineId: 'C', srKind: 'grain', productId: null, point: 'start', valueKg: 0, t: n }, o);

// ---- validação ----
assert.deepStrictEqual(P.validateShiftReading(f(), ctx()), [], 'leitura válida; 1.250.000 = 1 250 000 kg');
assert.deepStrictEqual(P.validateShiftReading(f({ prodDay: '24-10-2026', period: 'X', lineId: 'Z', srKind: 'x', point: 'mid', valueKg: '', by: ' ' }), ctx()),
  ['sr_day', 'sr_period', 'sr_line', 'sr_kind', 'sr_point', 'sr_value', 'sr_by']);
assert.deepStrictEqual(P.validateShiftReading(f({ valueKg: '-5' }), ctx()), ['sr_value']);
assert.deepStrictEqual(P.validateShiftReading(f({ valueKg: 'abc' }), ctx()), ['sr_value']);
assert.deepStrictEqual(P.validateShiftReading(f({ srKind: 'product', productId: '' }), ctx()), ['sr_product'], 'produto obrigatório');
assert.deepStrictEqual(P.validateShiftReading(f({ srKind: 'product', productId: 'F1' }), ctx()), []);
// duplicado no mesmo turno/linha/tipo/produto/momento
const r1 = rec({ valueKg: 1000 });
assert.deepStrictEqual(P.validateShiftReading(f(), ctx([r1])), ['sr_duplicate']);
assert.deepStrictEqual(P.validateShiftReading(f({ period: 'N' }), ctx([r1])), [], 'outro turno não é duplicado');
assert.deepStrictEqual(P.validateShiftReading(f({ lineId: 'D' }), ctx([r1])), [], 'outra linha não é duplicado');
assert.deepStrictEqual(P.validateShiftReading(f({ srKind: 'product', productId: 'F1' }), ctx([r1])), [], 'grão e produto são diferentes');
// correcção
assert.deepStrictEqual(P.validateShiftReading(f({ replaces: r1.uid, reason: 'erro de leitura' }), ctx([r1])), [], 'correcção válida');
assert.deepStrictEqual(P.validateShiftReading(f({ replaces: r1.uid, reason: '' }), ctx([r1])), ['sr_reason']);
assert.deepStrictEqual(P.validateShiftReading(f({ replaces: 'nope', reason: 'x' }), ctx([r1])), ['sr_replaces']);
assert.deepStrictEqual(P.validateShiftReading(f({ point: 'end', replaces: r1.uid, reason: 'x' }), ctx([r1])), ['sr_replaces_slot']);
const r1fix = rec({ valueKg: 1100, replaces: r1.uid, reason: 'x' });
assert.deepStrictEqual(P.validateShiftReading(f({ replaces: r1.uid, reason: 'x' }), ctx([r1, r1fix])), ['sr_replaces'], 'leitura já corrigida não volta a ser corrigida');
assert.deepStrictEqual(P.validateShiftReading(f({ replaces: r1fix.uid, reason: 'y' }), ctx([r1, r1fix])), [], 'corrige-se a correcção em vigor');

// ---- leituras em vigor ----
assert.deepStrictEqual(P.effectiveReadings([r1, r1fix]).map(r => r.uid), [r1fix.uid]);

// ---- totais do turno ----
const day = [
  rec({ point: 'start', valueKg: 1000000 }), rec({ point: 'end', valueKg: 1240000 }),
  rec({ srKind: 'product', productId: 'F1', point: 'start', valueKg: 500000 }), rec({ srKind: 'product', productId: 'F1', point: 'end', valueKg: 692000 }),
  rec({ srKind: 'product', productId: 'FAR', point: 'start', valueKg: 10000 }),
  rec({ lineId: 'D', point: 'start', valueKg: 5000 }), rec({ lineId: 'D', point: 'end', valueKg: 4000 }),
  rec({ period: 'N', point: 'start', valueKg: 1240000 })
];
const T = P.shiftTotals(day, '2026-10-24', 'D');
assert.deepStrictEqual(Object.keys(T), ['C', 'D']);
assert.deepStrictEqual(T.C.grain, { start: 1000000, end: 1240000, kg: 240000, status: 'ok' });
assert.strictEqual(T.C.products.F1.kg, 192000);
assert.strictEqual(T.C.extraction.F1, 80, '192 000 / 240 000 = 80 %');
assert.strictEqual(T.C.products.FAR.status, 'missing_end');
assert.strictEqual(T.C.products.FAR.kg, null, 'sem fim: sem valor (nada estimado)');
assert.strictEqual(T.C.extraction.FAR, undefined);
assert.strictEqual(T.D.grain.status, 'negative');
assert.strictEqual(T.D.grain.kg, null);
assert.strictEqual(P.shiftTotals(day, '2026-10-24', 'N').C.grain.status, 'missing_end');
// correcção entra no total
const fixEnd = rec({ point: 'end', valueKg: 1250000, replaces: day[1].uid, reason: 'x' });
assert.strictEqual(P.shiftTotals(day.concat([fixEnd]), '2026-10-24', 'D').C.grain.kg, 250000);
// cópia de segurança aceita leituras válidas e recusa inválidas
assert.ok(P.validProdBackup({ shiftReadings: day }));
assert.ok(!P.validProdBackup({ shiftReadings: [{ uid: 'x', srKind: 'grain', point: 'start', valueKg: 'abc' }] }));

console.log('OK — leituras de balança por turno');
