// node tests/day-records.test.js — ficheiros diários de registos (v2.1.0); não contacta o Dropbox
const assert = require('assert');
const R = require('../js/day-records.js');
const L = require('../js/logic.js');

// Horas locais (o dispositivo está em Africa/Luanda; os testes usam a hora local da máquina, como a app)
const at = (y, m, d, h, mi) => new Date(y, m - 1, d, h, mi || 0).getTime();
const pd = L.prodDay;

// ---- dia de produção de cada registo ----
assert.strictEqual(R.dayOf('jobs', { uid: 'j1', prodDay: '2026-10-24', t: at(2026, 10, 26, 10) }, pd), '2026-10-24', 'prodDay manda');
assert.strictEqual(R.dayOf('reports', { id: 'r1', day: '2026-10-23', t: at(2026, 10, 24, 9) }, pd), '2026-10-23', 'relatório: day');
assert.strictEqual(R.dayOf('samples', { id: 's1', t: at(2026, 10, 24, 6, 59) }, pd), '2026-10-23', '06:59 pertence ao dia anterior');
assert.strictEqual(R.dayOf('samples', { id: 's2', t: at(2026, 10, 24, 7, 0) }, pd), '2026-10-24', '07:00 abre o dia');
assert.strictEqual(R.dayOf('holds', { id: 'h1', openedAt: at(2026, 10, 24, 20) }, pd), '2026-10-24', 'retenção: openedAt');
assert.strictEqual(R.dayOf('siloSnapshots', { uid: 'x', importedAt: at(2026, 10, 25, 2) }, pd), '2026-10-24', 'snapshot: importedAt, noite');
assert.strictEqual(R.dayOf('samples', { id: 's3', createdAt: new Date(at(2026, 10, 24, 12)).toISOString() }, pd), '2026-10-24', 'createdAt ISO');
assert.strictEqual(R.dayOf('samples', { id: 's4' }, pd), null, 'sem data');
assert.strictEqual(R.dayOf('jobs', { uid: 'j2', prodDay: 'lixo', t: at(2026, 10, 24, 8) }, pd), '2026-10-24', 'prodDay inválido cai para t');

// ---- construção dos ficheiros ----
const data = {
  samples: [
    { id: 'b', t: at(2026, 10, 24, 8), shift: '2026-10-24/D', test: false },
    { id: 'a', t: at(2026, 10, 25, 1), shift: '2026-10-24/N', test: false },
    { id: 'tst', t: at(2026, 10, 24, 9), test: true },
    { id: 'nodate', test: false }
  ],
  jobs: [{ uid: 'j1', prodDay: '2026-10-23', period: 'N', test: false }],
  grainMoves: [{ uid: 'm1', t: at(2026, 10, 24, 10), shift: '2026-10-24/D', test: false }],
  config: [{ key: 'pin', value: 'segredo' }]
};
const opts = { prodDayOf: pd, test: false, now: Date.UTC(2026, 9, 24, 12), writerVersion: '2.1.0', deviceId: 'd1', site: 'FMO', codesSource: 'v2' };
const b = R.buildDayFiles(data, opts);
assert.deepStrictEqual(Object.keys(b.files), ['2026-10-23', '2026-10-24'], 'dias ordenados');
const f24 = b.files['2026-10-24'].file;
assert.strictEqual(f24.kind, 'mill-qc-day');
assert.strictEqual(f24.prodDay, '2026-10-24');
assert.strictEqual(f24.test, false);
assert.strictEqual(f24.generatedAt, '2026-10-24T12:00:00.000Z');
assert.deepStrictEqual(f24.records.samples.map(s => s.id), ['a', 'b'], 'ordenados por chave; noite após 00:00 fica no dia');
assert.ok(!f24.records.samples.some(s => s.id === 'tst'), 'registo de teste fora do ficheiro real');
assert.strictEqual(f24.manifest.counts.samples, 2);
assert.strictEqual(f24.manifest.counts.grainMoves, 1);
assert.strictEqual(f24.manifest.counts.jobs, 0, 'loja vazia aparece com 0 (dia vazio ≠ envio em falta)');
assert.strictEqual(f24.manifest.total, 3);
assert.deepStrictEqual(f24.manifest.shifts, { D: 2, N: 1, none: 0 });
assert.deepStrictEqual(Object.keys(f24.records).sort(), R.STORES.slice().sort(), 'todas as lojas presentes');
assert.ok(!('config' in f24.records), 'configuração (PIN) nunca vai no ficheiro');
assert.deepStrictEqual(b.undated, { samples: 1 });
assert.strictEqual(b.files['2026-10-23'].file.manifest.shifts.N, 1, 'period usado quando não há shift');

// modo de teste: só registos de teste
const bt = R.buildDayFiles(data, Object.assign({}, opts, { test: true }));
assert.deepStrictEqual(Object.keys(bt.files), ['2026-10-24']);
assert.deepStrictEqual(bt.files['2026-10-24'].file.records.samples.map(s => s.id), ['tst']);
assert.strictEqual(bt.files['2026-10-24'].file.test, true);

// hash: igual com a mesma entrada (mesmo noutra hora de geração); muda quando um registo muda
const b2 = R.buildDayFiles(data, Object.assign({}, opts, { now: opts.now + 3600000 }));
assert.strictEqual(b2.files['2026-10-24'].hash, b.files['2026-10-24'].hash, 'hash não depende de generatedAt');
const data3 = JSON.parse(JSON.stringify(data)); data3.grainMoves[0].kg = 1;
const b3 = R.buildDayFiles(data3, opts);
assert.notStrictEqual(b3.files['2026-10-24'].hash, b.files['2026-10-24'].hash, 'registo alterado muda o hash');
assert.strictEqual(b3.files['2026-10-23'].hash, b.files['2026-10-23'].hash, 'outros dias não mudam');
assert.strictEqual(R.hashOf(''), '811c9dc5');
assert.match(R.hashOf('abc'), /^[0-9a-f]{8}$/);

// ---- caminhos e pendentes ----
assert.strictEqual(R.dayPath('/records', '2026-10-24'), '/records/2026-10-24_FMO_MillQC.json');
assert.strictEqual(R.dayPath('/records/', '2026-10-24'), '/records/2026-10-24_FMO_MillQC.json');
assert.throws(() => R.dayPath('/records', '24-10-2026'), /dia/);
assert.deepStrictEqual(R.pendingDays(b, '/records', {}), ['2026-10-23', '2026-10-24'], 'nada enviado: tudo pendente');
const sent = { '/records/2026-10-23_FMO_MillQC.json': b.files['2026-10-23'].hash, '/records/2026-10-24_FMO_MillQC.json': b.files['2026-10-24'].hash };
assert.deepStrictEqual(R.pendingDays(b, '/records', sent), [], 'tudo enviado');
assert.deepStrictEqual(R.pendingDays(b3, '/records', sent), ['2026-10-24'], 'só o dia alterado');
assert.deepStrictEqual(R.pendingDays(b, '/records-test', sent), ['2026-10-23', '2026-10-24'], 'pasta de teste independente');

assert.throws(() => R.buildDayFiles(data, {}), /prodDayOf/);
assert.deepStrictEqual(R.buildDayFiles(null, opts), { files: {}, undated: {} });

console.log('OK — ficheiros diários de registos');
