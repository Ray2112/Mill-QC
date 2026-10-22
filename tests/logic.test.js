// node tests/logic.test.js
const assert = require('assert');
const L = require('../js/logic.js');
let n = 0;
function t(name, fn) { fn(); n++; }
const cfg = L.defaultConfig();
const P = id => L.findProduct(cfg, id);
const ev = (id, v, ph) => L.evaluateSample(P(id), v, ph);
const allOk = { odour: 'ok', colour: 2 };

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

t('cor: escala 1–5 registada, sem decisão; odor é o único item que rejeita (v1.8.0)', () => {
  assert.deepStrictEqual(L.PHYSICAL, ['odour', 'colour']);
  assert.deepStrictEqual(L.COLOUR_SCALE, [1, 2, 3, 4, 5]);
  const r5 = ev('super', {}, { odour: 'ok', colour: 5 });
  assert.strictEqual(r5.decision, 'accept'); assert.strictEqual(r5.physical.colour, 5);
  assert.ok(ev('super', {}, { odour: 'ok', colour: 6 }).errors.some(e => e.code === 'incomplete'));
  assert.ok(ev('super', {}, { odour: 'ok', colour: '0' }).errors.some(e => e.code === 'incomplete'));
  assert.ok(ev('super', {}, { odour: 'ok', colour: '3' }).errors.length === 0);   // texto numérico aceite
});
t('físico: tudo OK aceita; anormal rejeita; incompleto = erro', () => {
  assert.strictEqual(ev('super', {}, allOk).decision, 'accept');
  const r = ev('super', { moisture: '13' }, Object.assign({}, allOk, { odour: 'abn' }));
  assert.strictEqual(r.decision, 'reject');
  assert.ok(r.failures.some(f => f.param === 'odour'));
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
  const good = Object.assign({ id: 2, lineId: 'C', productId: 'super', t: 1500 }, ev('super', { moisture: '13' }));
  assert.strictEqual(L.holdAfterSample(h, good).status, 'open');
  h = L.addHoldAction(h, { at: 2000, by: 'Sup', text: 'Ajustar condicionamento' });
  assert.strictEqual(h.status, 'action');
  const bad = Object.assign({ id: 3, lineId: 'C', productId: 'super', t: 2500 }, ev('super', { moisture: '14,2' }));
  h = L.holdAfterSample(h, bad); assert.strictEqual(h.status, 'open');
  h = L.addHoldAction(h, { at: 2600, by: 'Sup', text: 'Nova acção' });
  const warn = Object.assign({ id: 4, lineId: 'C', productId: 'super', t: 3000 }, ev('super', { moisture: '13,8' }));
  h = L.holdAfterSample(h, warn);
  assert.strictEqual(h.status, 'closed'); assert.strictEqual(h.closedBySample, 4);
  // outra linha não afecta
  const h2 = L.newHold(s1);
  assert.strictEqual(L.holdAfterSample(h2, Object.assign({}, warn, { lineId: 'D' })).status, 'open');
  assert.throws(() => L.addHoldAction(h, { at: 1, by: 'x', text: 'y' }));
});

t('retenção com dois produtos na linha (v1.5.0): só fecha quando cada produto rejeitado passa', () => {
  const smp = (id, pid, vals, t0) => Object.assign({ id, lineId: 'C', productId: pid, t: t0, crew: 'A' }, ev(pid, vals));
  let h = L.newHold(smp(1, 'fuba2', { moisture: '14,5' }, 1000));
  assert.deepStrictEqual(h.status, 'open');
  h = L.addHoldAction(h, { at: 1100, by: 'Sup', text: 'acção' });
  // amostra boa de OUTRO produto da mesma linha não liberta
  h = L.holdAfterSample(h, smp(2, 'brew_grits', { moisture: '13' }, 1200));
  assert.strictEqual(h.status, 'action'); assert.deepStrictEqual(h.clearedProducts, []);
  // grits também rejeita → mantém, dois produtos por libertar
  h = L.holdAfterSample(h, smp(3, 'brew_grits', { moisture: '14,5' }, 1300));
  assert.strictEqual(h.status, 'open'); assert.deepStrictEqual(h.rejectedProducts, ['fuba2', 'brew_grits']);
  h = L.addHoldAction(h, { at: 1400, by: 'Sup', text: 'acção 2' });
  h = L.holdAfterSample(h, smp(4, 'fuba2', { moisture: '13' }, 1500));
  assert.strictEqual(h.status, 'action'); assert.deepStrictEqual(h.clearedProducts, ['fuba2']);
  h = L.holdAfterSample(h, smp(5, 'brew_grits', { moisture: '13' }, 1600));
  assert.strictEqual(h.status, 'closed'); assert.strictEqual(h.closedBySample, 5);
  // retenção antiga (só productId) continua a funcionar
  const old = { lineId: 'C', productId: 'super', status: 'action', reasons: ['moisture'], actions: [{}], samples: [1] };
  assert.strictEqual(L.holdAfterSample(old, smp(9, 'super', { moisture: '13' }, 2000)).status, 'closed');
  assert.strictEqual(L.holdAfterSample(old, smp(9, 'fuba2', { moisture: '13' }, 2000)).status, 'action');
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

// ----- chaves UUID (v4) -----
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
t('newId: UUID v4 (randomUUID e fallback)', () => {
  assert.ok(UUID_RE.test(L.newId()));
  const seq = [0.5, 0.25, 0.75];
  const rnd = () => seq.length ? seq.shift() : 0.1;
  const saved = globalThis.crypto; globalThis.crypto = undefined;
  try { assert.ok(UUID_RE.test(L.newId(rnd))); } finally { globalThis.crypto = saved; }
});
t('shortId: 8 hex sem hífens; vazio para null', () => {
  assert.strictEqual(L.shortId('3f9a1c2e-0000-4000-8000-123456789abc'), '3f9a1c2e');
  assert.strictEqual(L.shortId(null), '');
  assert.strictEqual(L.shortId(12), '12');
});
t('qcUpgradeKeys: ids numéricos → UUID e referências reescritas', () => {
  const legacy = {
    samples: [{ id: 1, t: 10, lineId: 'L1' }, { id: 2, t: 20, lineId: 'L1', correctsId: 1 }, { id: 3, t: 30, lineId: 'L1' }],
    holds: [{ id: 1, lineId: 'L1', openedBySample: 1, closedBySample: 2, samples: [1, 2] }],
    alerts: [{ id: 1, sampleId: 1 }, { id: 2, sampleId: 3 }],
    limitChanges: [{ id: 1, productId: 'p' }],
    reports: [{ id: 1, day: '2026-10-13', t: 5 }]
  };
  const { data, warnings } = L.qcUpgradeKeys(legacy);
  assert.deepStrictEqual(warnings, []);
  const [s1, s2, s3] = data.samples.map(s => s.id);
  [s1, s2, s3, data.holds[0].id, data.alerts[0].id, data.alerts[1].id, data.limitChanges[0].id, data.reports[0].id]
    .forEach(id => assert.ok(UUID_RE.test(id), 'não é UUID: ' + id));
  assert.strictEqual(new Set([s1, s2, s3]).size, 3);
  assert.strictEqual(data.samples[1].correctsId, s1);
  assert.strictEqual(data.holds[0].openedBySample, s1);
  assert.strictEqual(data.holds[0].closedBySample, s2);
  assert.deepStrictEqual(data.holds[0].samples, [s1, s2]);
  assert.strictEqual(data.alerts[0].sampleId, s1);
  assert.strictEqual(data.alerts[1].sampleId, s3);
  assert.strictEqual(data.samples[0].t, 10);                 // outros campos intactos
  assert.strictEqual(legacy.samples[0].id, 1);               // entrada não mutada
});
t('qcUpgradeKeys: idempotente (segunda passagem não muda nada)', () => {
  const once = L.qcUpgradeKeys({ samples: [{ id: 7, t: 1, lineId: 'L' }], holds: [{ id: 2, samples: [7], openedBySample: 7 }] }).data;
  const twice = L.qcUpgradeKeys(once).data;
  assert.deepStrictEqual(twice, once);
});
t('qcUpgradeKeys: referência sem registo fica tal como está e é assinalada', () => {
  const r = L.qcUpgradeKeys({ samples: [{ id: 1, t: 1, lineId: 'L' }], alerts: [{ id: 1, sampleId: 99 }] });
  assert.strictEqual(r.data.alerts[0].sampleId, 99);
  assert.deepStrictEqual(r.warnings, ['ref:99']);
});
t('qcUpgradeKeys: lista vazia ou ausente', () => {
  const r = L.qcUpgradeKeys({});
  L.QC_KEYED.forEach(s => assert.deepStrictEqual(r.data[s], []));
});
t('UUID: correcção (effective) e retenção (holdAfterSample) funcionam com chaves de texto', () => {
  const a = { id: L.newId(), t: 1, lineId: 'L1', productId: 'p', decision: 'accept', failures: [] };
  const b = { id: L.newId(), t: 2, lineId: 'L1', productId: 'p', decision: 'accept', failures: [], correctsId: a.id };
  assert.deepStrictEqual(L.effective([a, b]).map(s => s.id), [b.id]);
  const rej = { id: L.newId(), t: 3, lineId: 'L1', productId: 'p', decision: 'reject', failures: [{ param: 'hi', decision: 'reject' }] };
  const h = L.newHold(rej);
  assert.strictEqual(h.openedBySample, rej.id);
  const ok = { id: L.newId(), t: 4, lineId: 'L1', productId: 'p', decision: 'accept', failures: [] };
  const h2 = L.holdAfterSample(Object.assign({}, h, { status: 'action' }), ok);
  assert.strictEqual(h2.status, 'closed');
  assert.strictEqual(h2.closedBySample, ok.id);
  assert.deepStrictEqual(h2.samples, [rej.id, ok.id]);
});
t('UUID: alerta e correcção migrados ficam ligados à amostra certa', () => {
  const r = L.qcUpgradeKeys({ samples: [{ id: 5, t: 1, lineId: 'L' }, { id: 6, t: 2, lineId: 'L', correctsId: 5 }], alerts: [{ id: 3, sampleId: 6 }] }).data;
  assert.strictEqual(L.effective(r.samples).length, 1);
  assert.strictEqual(L.effective(r.samples)[0].id, r.samples[1].id);
  assert.strictEqual(r.alerts[0].sampleId, r.samples[1].id);
});

// ----- mestre partilhado de limites -----
t('mestre: ficheiro válido; versões comparam-se por instante ISO', () => {
  const c = L.defaultConfig();
  const m = L.limitsMasterFile(c, '2026-10-14T08:00:00.000Z', '2026-10-14T08:00:01.000Z');
  assert.deepStrictEqual(L.validLimitsMaster(m), { ok: true, errors: [] });
  assert.strictEqual(L.limitsVersionStatus(undefined, m.version), 'apply');
  assert.strictEqual(L.limitsVersionStatus('2026-10-14T08:00:00.000Z', '2026-10-14T08:00:00.000Z'), 'same');
  assert.strictEqual(L.limitsVersionStatus('2026-10-14T09:00:00.000Z', '2026-10-14T08:00:00.000Z'), 'older');
  assert.strictEqual(L.limitsVersionStatus('2026-10-14T08:00:00.000Z', '2026-10-15T08:00:00.000Z'), 'apply');
});
t('mestre: rejeita ficheiro de outra app, versão mal formada, moagem diferente e limites inválidos', () => {
  const c = L.defaultConfig();
  const good = L.limitsMasterFile(c, '2026-10-14T08:00:00.000Z', '2026-10-14T08:00:01.000Z');
  assert.ok(L.validLimitsMaster(Object.assign({}, good, { app: 'outra' })).errors.includes('wrong-file'));
  assert.ok(L.validLimitsMaster(Object.assign({}, good, { version: '14-10-2026' })).errors.includes('bad-version'));
  assert.ok(L.validLimitsMaster(Object.assign({}, good, { millType: 'soja' })).errors.includes('bad-mill'));
  assert.ok(L.validLimitsMaster(Object.assign({}, good, { products: [] })).errors.includes('no-products'));
  const bad = JSON.parse(JSON.stringify(good));
  const pid = bad.products[0].id;
  bad.products[0].limits.moisture = { lo: 15, hi: 10 };          // lo > hi
  const v = L.validLimitsMaster(bad);
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.includes(pid + '.moisture'));
  assert.throws(() => L.applyLimitsMaster(c, bad), /invalid-master/);
  assert.throws(() => L.applyLimitsMaster(c, Object.assign({}, good, { millType: 'wheat' })), /mill-mismatch/);
});
t('mestre: aplicar substitui limites, regista alterações e fica com a versão; versão antiga não altera nada', () => {
  const c = L.defaultConfig();
  const m1 = L.limitsMasterFile(c, '2026-10-14T08:00:00.000Z', '2026-10-14T08:00:01.000Z');
  const m2 = JSON.parse(JSON.stringify(m1));
  m2.version = '2026-10-15T08:00:00.000Z';
  const pid = m2.products[0].id;
  m2.products[0].limits.moisture = Object.assign({}, m2.products[0].limits.moisture || {}, { hi: 13.5 });
  const r = L.applyLimitsMaster(c, m2);
  assert.strictEqual(r.status, 'apply');
  assert.strictEqual(r.cfg.limitsVersion, m2.version);
  assert.ok(r.changes.some(x => x.productId === pid && x.param === 'moisture' && x.field === 'hi' && x.new === 13.5));
  assert.strictEqual(c.limitsVersion, undefined);                  // configuração de origem não alterada
  const again = L.applyLimitsMaster(r.cfg, m2);
  assert.strictEqual(again.status, 'same');
  assert.strictEqual(again.changes.length, 0);
  const older = L.applyLimitsMaster(r.cfg, m1);
  assert.strictEqual(older.status, 'older');
  assert.strictEqual(older.cfg, r.cfg);                            // não aplicado
});

console.log('OK —', n, 'grupos de testes passaram');
// acção por defeito não conta como alteração
assert.strictEqual(L.limitDiff({ hi: 14 }, { hi: 14, loAct: 'warn', hiAct: 'reject' }).length, 0);
assert.strictEqual(L.limitDiff({ hi: 14 }, { hi: 14, hiAct: 'warn' }).length, 1);
// v1.6.0: operadores editáveis — registados na auditoria, validados, e mudam a decisão no valor-limite
assert.deepStrictEqual(L.limitDiff({ hi: 3, hiOp: 'lt' }, { hi: 3, hiOp: 'le' }), [{ field: 'hiOp', old: 'lt', new: 'le' }]);
assert.deepStrictEqual(L.limitDiff({ lo: 5 }, { lo: 5, loOp: 'gt' }), [{ field: 'loOp', old: 'ge', new: 'gt' }]);
assert.strictEqual(L.limitDiff({ hi: 3 }, { hi: 3, hiOp: 'le', loOp: 'ge' }).length, 0);       // ausente = ≤ / ≥
assert.deepStrictEqual(L.validateLimit({ hi: 3, hiOp: 'xx' }), ['hiOp:invalid']);
assert.deepStrictEqual(L.validateLimit({ lo: 3, loOp: 'le' }), ['loOp:invalid']);
assert.strictEqual(L.evalParam(3.0, { hi: 3, hiOp: 'lt', hiAct: 'reject' }).decision, 'reject');
assert.strictEqual(L.evalParam(3.0, { hi: 3, hiOp: 'le', hiAct: 'reject' }).decision, 'accept');
assert.strictEqual(L.evalParam(4.9, { lo: 5, loOp: 'ge', loAct: 'warn' }).decision, 'warn');      // mínimo com aviso, não retém
assert.strictEqual(L.evalParam(5, { lo: 5, loOp: 'gt', loAct: 'warn' }).decision, 'warn');
console.log('OK — limitDiff por defeito');

// ---- contrato v1 ----
{
  const ctx = { deviceId: 'D-QC', operatorId: 'OP-7', test: true, now: '2026-10-14T08:00:00.000Z' };
  const s = L.stampContract({ id: 'x1', t: 1 }, ctx, true);
  assert.strictEqual(s.schemaVersion, 1);
  assert.strictEqual(L.CONTRACT_VERSION, 1);
  assert.strictEqual(s.appVersion, L.VERSION);
  assert.strictEqual(s.deviceId, 'D-QC');
  assert.strictEqual(s.operatorId, 'OP-7');
  assert.strictEqual(s.test, true);
  assert.strictEqual(s.uploadedAt, null);
  assert.strictEqual(s.createdAt, '2026-10-14T08:00:00.000Z');
  // registo existente: não recebe createdAt nem altera valores já gravados
  const old = { id: 'x2', deviceId: 'D-OLD', operatorId: null, test: false, createdAt: '2026-01-01T00:00:00.000Z' };
  const u = L.stampContract(old, ctx, false);
  assert.strictEqual(u.deviceId, 'D-OLD');
  assert.strictEqual(u.test, false);
  assert.strictEqual(u.createdAt, '2026-01-01T00:00:00.000Z');
  const legacy = L.stampContract({ id: 'x3' }, null, false);
  assert.strictEqual(legacy.createdAt, undefined);
  assert.strictEqual(legacy.test, false);
  assert.strictEqual(legacy.operatorId, null);
  console.log('OK — contrato v1 (stampContract)');
}
{
  // leituras com 'uuid' (≤1.4.0) passam a 'uid'; leituras sem chave recebem uma; nada muda se já estiver certo
  let n = 0; const keyFn = () => 'K' + (++n);
  const job = { id: 'J1', readings: [
    { uuid: 'U-A', t: 1, kind: 'shift' },
    { t: 2, kind: 'start' },
    { uid: 'U-C', t: 3, kind: 'shift' },
  ] };
  const fixed = L.normalizeReadings(job, keyFn);
  assert.notStrictEqual(fixed, job);
  assert.deepStrictEqual(fixed.readings.map(r => r.uid), ['U-A', 'K1', 'U-C']);
  assert.ok(fixed.readings.every(r => !('uuid' in r)));
  assert.strictEqual(job.readings[0].uuid, 'U-A', 'o trabalho original não é alterado');
  assert.strictEqual(L.normalizeReadings(fixed, keyFn), fixed, 'segunda passagem não altera nada');
  assert.strictEqual(L.normalizeReadings({ id: 'J2' }, keyFn).readings, undefined);
  console.log('OK — normalizeReadings (uuid → uid)');
}

// ---- turno e turma no contrato (QC) ----
{
  // 03:00 de 14-10 pertence ao turno N de 13-10 (dia de produção); 09:00 ao turno D de 14-10
  const night = new Date(2026, 9, 14, 3, 0).getTime();
  const day = new Date(2026, 9, 14, 9, 0).getTime();
  const a = L.stampContract({ id: 'a', t: night }, null, true);
  assert.strictEqual(a.shift, '2026-10-13/N');
  // turma derivada da rotação (ancora 14-10 07:00 = C; 13-10 19:00 = D; 14-10 09:00 = C; 14-10 20:15 = B)
  assert.strictEqual(a.crew, 'D');
  assert.strictEqual(L.stampContract({ id: 'b2', t: day }, null, true).crew, 'C');
  assert.strictEqual(L.stampContract({ id: 'b3', t: new Date(2026, 9, 14, 20, 15).getTime() }, null, true).crew, 'B');
  assert.strictEqual(L.stampContract({ id: 'b4', t: new Date(2026, 9, 14, 20, 15).getTime() }, { crew: 'A' }, true).crew, 'B', 'contexto manual não sobrepõe a rotação');
  assert.strictEqual(L.stampContract({ id: 'b', t: day }, null, true).shift, '2026-10-14/D');
  assert.strictEqual(L.stampContract({ id: 'c', openedAt: new Date(day).toISOString() }, null, true).shift, '2026-10-14/D');
  assert.strictEqual(L.stampContract({ id: 'd' }, null, true).shift, undefined, 'sem hora: sem turno');
  console.log('OK — turno D/N e turma no contrato');
}
