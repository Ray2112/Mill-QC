// node tests/logic.test.js
const assert = require('assert');
const L = require('../js/logic.js');
let n = 0;
function t(name, fn) { fn(); n++; }
const cfg = L.defaultConfig();
const P = id => L.findProduct(cfg, id);
const ev = (id, v, ph) => L.evaluateSample(P(id), v, ph);
const allOk = { odour: 'ok', colour: 'ok', mould: 'ok', insects: 'ok', foreign: 'ok' };

t('números', () => {
  assert.strictEqual(L.num('13,5'), 13.5);
  assert.strictEqual(L.num(' 13.5 '), 13.5);
  assert.strictEqual(L.num(''), null);
  assert.ok(isNaN(L.num('13,5,1')));
  assert.ok(isNaN(L.num('abc')));
  assert.ok(isNaN(L.pct('101')));
  assert.strictEqual(L.pct('0'), 0);
});

t('produtos milho: 8, trigo/arroz vazios', () => {
  assert.strictEqual(cfg.products.maize.length, 8);
  assert.deepStrictEqual(cfg.products.wheat, []);
  assert.deepStrictEqual(cfg.products.rice, []);
});

t('humidade: 13,5 aceita; 13,6 aviso; 14,0 aviso; 14,1 rejeita', () => {
  assert.strictEqual(ev('super', { moisture: '13,5' }).decision, 'accept');
  assert.strictEqual(ev('super', { moisture: '13,6' }).decision, 'warn');
  assert.strictEqual(ev('super', { moisture: '14' }).decision, 'warn');
  assert.strictEqual(ev('super', { moisture: '14,1' }).decision, 'reject');
});

t('ração animal: humidade ≤13 aceita, >13 rejeita; gordura só registo', () => {
  assert.strictEqual(ev('animal', { moisture: '13' }).decision, 'accept');
  assert.strictEqual(ev('animal', { moisture: '13,1' }).decision, 'reject');
  assert.strictEqual(ev('animal', { fat: '6' }).decision, 'record');
});

t('Super Fuba gordura <2,0 (estrito)', () => {
  assert.strictEqual(ev('super', { fat: '1,99' }).decision, 'accept');
  assert.strictEqual(ev('super', { fat: '2,0' }).decision, 'reject');
});

t('Fuba 1 gordura 2,0–<3,0; abaixo = aviso', () => {
  assert.strictEqual(ev('fuba1', { fat: '2,0' }).decision, 'accept');
  assert.strictEqual(ev('fuba1', { fat: '2,99' }).decision, 'accept');
  assert.strictEqual(ev('fuba1', { fat: '3,0' }).decision, 'reject');
  const r = ev('fuba1', { fat: '1,9' });
  assert.strictEqual(r.decision, 'warn'); assert.strictEqual(r.failures[0].reason, 'lo');
});

t('Fuba 2 gordura 3,0–<4,0', () => {
  assert.strictEqual(ev('fuba2', { fat: '2,8' }).decision, 'warn');
  assert.strictEqual(ev('fuba2', { fat: '3,0' }).decision, 'accept');
  assert.strictEqual(ev('fuba2', { fat: '4,0' }).decision, 'reject');
});

t('Integral gordura ≥3,7 (abaixo aviso); fibra 1,8–2,5', () => {
  assert.strictEqual(ev('integral', { fat: '3,7' }).decision, 'accept');
  assert.strictEqual(ev('integral', { fat: '3,5' }).decision, 'warn');
  assert.strictEqual(ev('integral', { fat: '6' }).decision, 'accept');
  assert.strictEqual(ev('integral', { fibre: '1,7' }).decision, 'warn');
  assert.strictEqual(ev('integral', { fibre: '2,5' }).decision, 'accept');
  assert.strictEqual(ev('integral', { fibre: '2,6' }).decision, 'reject');
});

t('fibra Fuba 1 ≤1,2', () => {
  assert.strictEqual(ev('fuba1', { fibre: '1,2' }).decision, 'accept');
  assert.strictEqual(ev('fuba1', { fibre: '1,21' }).decision, 'reject');
});

t('granulometria Super: ≥90% passa 1,40; <90% passa 0,30', () => {
  assert.strictEqual(ev('super', { granA: '90', granB: '89,9' }).decision, 'accept');
  assert.strictEqual(ev('super', { granA: '89,9' }).decision, 'reject');
  assert.strictEqual(ev('super', { granB: '90' }).decision, 'reject');
});

t('grits: ≥90% grosso e ≤5% fino; frequência horária', () => {
  assert.strictEqual(ev('brew_grits', { granA: '90', granB: '5' }).decision, 'accept');
  assert.strictEqual(ev('brew_grits', { granB: '5,1' }).decision, 'reject');
  assert.strictEqual(ev('snack_grits', { granA: '89' }).decision, 'reject');
  assert.strictEqual(P('brew_grits').limits.granA.sieve, '4.0');
  assert.strictEqual(P('brew_grits').limits.granB.sieve, '0.50');
  assert.strictEqual(P('snack_grits').limits.granB.sieve, '0.850');
  assert.strictEqual(P('maize_rice').limits.granB.sieve, '1.18');
  assert.strictEqual(P('brew_grits').limits.granA.freq, 'hourly');
  assert.strictEqual(P('super').limits.granA.freq, 'shift');
  assert.strictEqual(ev('maize_rice', { fat: '1,5' }).decision, 'accept');
  assert.strictEqual(ev('maize_rice', { fat: '1,6' }).decision, 'reject');
});

t('físico: tudo OK aceita; anormal rejeita; incompleto = erro', () => {
  assert.strictEqual(ev('super', {}, allOk).decision, 'accept');
  const r = ev('super', { moisture: '13' }, Object.assign({}, allOk, { insects: 'abn' }));
  assert.strictEqual(r.decision, 'reject');
  assert.ok(r.failures.some(f => f.param === 'insects'));
  assert.ok(ev('super', {}, { odour: 'ok' }).errors.some(e => e.code === 'incomplete'));
});

t('pior parâmetro ganha; vazio/erro', () => {
  assert.strictEqual(ev('super', { moisture: '13,8', fat: '2,5' }).decision, 'reject');
  assert.ok(ev('super', {}).errors.some(e => e.code === 'empty'));
  assert.ok(ev('super', { moisture: '1x' }).errors.some(e => e.field === 'moisture'));
  assert.ok(ev('super', { moisture: '150' }).errors.some(e => e.field === 'moisture'));
});

t('extras sem limites = só registo', () => {
  assert.strictEqual(ev('super', { protein: '8' }).decision, 'record');
  const p = JSON.parse(JSON.stringify(P('super'))); p.limits.protein.lo = 7; p.limits.protein.loAct = 'warn';
  assert.strictEqual(L.evaluateSample(p, { protein: '6' }).decision, 'warn');
});

t('dia de produção e turnos', () => {
  const d = (h, m) => new Date(2026, 9, 6, h, m || 0).getTime();
  assert.strictEqual(L.prodDay(d(6, 59)), '2026-10-05');
  assert.strictEqual(L.prodDay(d(7, 0)), '2026-10-06');
  assert.strictEqual(L.shiftOf(d(7)).period, 'D');
  assert.strictEqual(L.shiftOf(d(18, 59)).period, 'D');
  assert.strictEqual(L.shiftOf(d(19)).period, 'N');
  const n = L.shiftOf(d(3));
  assert.strictEqual(n.period, 'N'); assert.strictEqual(n.day, '2026-10-05');
  assert.strictEqual(n.start, new Date(2026, 9, 5, 19).getTime());
  const [s, e] = L.prodDayRange('2026-10-06');
  assert.strictEqual(e - s, 24 * 3600000);
});

t('atrasos: horário e por turno', () => {
  const start = new Date(2026, 9, 6, 7).getTime();
  const samples = [{ productId: 'super', t: start + 5 * 60000, values: { moisture: 13, fat: 1.5, fibre: 0.5 }, physical: allOk }];
  let st = L.dueStatus(P('super'), samples, start, start + 70 * 60000, 10);
  const m = st.hourly.find(x => x.param === 'moisture');
  assert.strictEqual(m.dueNow, true); assert.strictEqual(m.overdue, false);
  st = L.dueStatus(P('super'), samples, start, start + 76 * 60000, 10);
  assert.strictEqual(st.hourly.find(x => x.param === 'moisture').overdue, true);
  assert.strictEqual(st.shift.find(x => x.param === 'fibre').done, true);
  assert.strictEqual(st.shift.find(x => x.param === 'granA').done, false);
  // no turno seguinte fibra volta a estar pendente
  st = L.dueStatus(P('super'), samples, start, new Date(2026, 9, 6, 20).getTime(), 10);
  assert.strictEqual(st.shift.find(x => x.param === 'fibre').done, false);
  // grits: granulometria horária
  st = L.dueStatus(P('brew_grits'), [], start, start + 10 * 60000, 10);
  assert.ok(st.hourly.some(x => x.param === 'granA'));
});

t('retenção: abre, acção, re-amostra rejeitada reabre, boa fecha', () => {
  const r = ev('super', { moisture: '14,5' });
  const s1 = Object.assign({ id: 1, lineId: 'C', productId: 'super', t: 1000, crew: 'A' }, r);
  let h = L.newHold(s1);
  assert.strictEqual(h.status, 'open'); assert.deepStrictEqual(h.reasons, ['moisture']);
  assert.throws(() => L.addHoldAction(h, { at: 2000, by: '', text: 'x' }));
  // amostra boa SEM acção não fecha
  const good = Object.assign({ id: 2, lineId: 'C', t: 1500 }, ev('super', { moisture: '13' }));
  assert.strictEqual(L.holdAfterSample(h, good).status, 'open');
  h = L.addHoldAction(h, { at: 2000, by: 'Sup', text: 'Ajustar condicionamento' });
  assert.strictEqual(h.status, 'action');
  const bad = Object.assign({ id: 3, lineId: 'C', t: 2500 }, ev('super', { moisture: '14,2' }));
  h = L.holdAfterSample(h, bad); assert.strictEqual(h.status, 'open');
  h = L.addHoldAction(h, { at: 2600, by: 'Sup', text: 'Nova acção' });
  const warn = Object.assign({ id: 4, lineId: 'C', t: 3000 }, ev('super', { moisture: '13,8' }));
  h = L.holdAfterSample(h, warn);
  assert.strictEqual(h.status, 'closed'); assert.strictEqual(h.closedBySample, 4);
  // outra linha não afecta
  const h2 = L.newHold(s1);
  assert.strictEqual(L.holdAfterSample(h2, Object.assign({}, warn, { lineId: 'D' })).status, 'open');
  assert.throws(() => L.addHoldAction(h, { at: 1, by: 'x', text: 'y' }));
});

t('correcções substituem o original', () => {
  const ss = [{ id: 1 }, { id: 2 }, { id: 3, correctsId: 1 }];
  assert.deepStrictEqual(L.effective(ss).map(s => s.id), [2, 3]);
});

t('validação de limites', () => {
  assert.deepStrictEqual(L.validateLimit({ lo: 2, hi: 3 }), []);
  assert.ok(L.validateLimit({ lo: 4, hi: 3 }).includes('lo>hi'));
  assert.ok(L.validateLimit({ hi: 14, warnHi: 15 }).includes('warnHi>hi'));
  assert.ok(L.validateLimit({ hi: NaN }).includes('hi:invalid'));
  assert.strictEqual(L.limitDiff({ hi: 14, warnHi: 13.5 }, { hi: 14, warnHi: 13 }).length, 1);
});

t('relatório diário 07:00–07:00', () => {
  const base = new Date(2026, 9, 6, 7).getTime();
  const mk = (id, off, mo, crew) => Object.assign({ id, lineId: 'C', productId: 'super', t: base + off * 60000, crew },
    ev('super', { moisture: String(mo) }));
  const ss = [mk(1, 10, 13, 'A'), mk(2, 70, 13.8, 'A'), mk(3, 13 * 60, 14.5, 'B'), mk(4, 25 * 60, 13, 'C'),
    Object.assign(mk(5, 75, 13.2, 'A'), { correctsId: 2 })];
  const r = L.dayReport('2026-10-06', ss, [], cfg);
  assert.strictEqual(r.totals.n, 3);
  assert.strictEqual(r.totals.reject, 1);
  assert.strictEqual(r.summary.length, 2);
  const d = r.summary.find(x => x.period === 'D');
  assert.strictEqual(d.hoursWithMoisture, 2); assert.strictEqual(d.moisture.max, 13.2);
});

t('backup válido / adulterado', () => {
  const ok = { app: 'mill-qc', format: 1, samples: [{ t: 1, lineId: 'C', productId: 'super', decision: 'accept', crew: 'A' }], holds: [] };
  assert.ok(L.validBackup(ok));
  assert.ok(!L.validBackup(Object.assign({}, ok, { app: 'other' })));
  assert.ok(!L.validBackup(Object.assign({}, ok, { samples: [{ t: 1, lineId: 'C', productId: 'x', decision: '<img>' }] })));
  assert.ok(!L.validBackup(Object.assign({}, ok, { holds: [{ lineId: 'C', status: 'hack' }] })));
});

console.log('OK —', n, 'grupos de testes passaram');
// acção por defeito não conta como alteração
assert.strictEqual(L.limitDiff({ hi: 14 }, { hi: 14, loAct: 'warn', hiAct: 'reject' }).length, 0);
assert.strictEqual(L.limitDiff({ hi: 14 }, { hi: 14, hiAct: 'warn' }).length, 1);
console.log('OK — limitDiff por defeito');
