// node tests/qcimport.test.js — folha horária de QC (dados SINTÉTICOS; nenhum dado de produção no repositório público)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Q = require('../js/qc-import.js');
const XLSX = require('../vendor/xlsx.full.min.js');
const fx = require('./fixtures/hourly_synthetic.json');
let n = 0;
function t(name, fn) { try { fn(); n++; } catch (e) { console.error('FALHOU:', name); throw e; } }
const base = () => Q.parseHourlySheet(fx.rows, { fileName: 'QC__15-10', yearDefault: 2026 });

t('data a partir do nome: QC__15-10 com ano por omissão', () => {
  assert.strictEqual(Q.dateFromName('QC__15-10', 2026), '2026-10-15');
  assert.strictEqual(Q.dateFromName('QC_15-10-2026.xlsx', 2026), '2026-10-15');
  assert.strictEqual(Q.dateFromName('sem data.xlsx', 2026), null);
});
t('estrutura: cabeçalhos e 24 horas 07:00 → 06:00', () => {
  const r = base();
  assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
  assert.strictEqual(r.hours.length, 24);
  assert.strictEqual(r.hours[0], '07:00'); assert.strictEqual(r.hours[23], '06:00');
  assert.strictEqual(r.date, '2026-10-15');
});
t('horas 00:00–06:59 ficam com dayOffset 1', () => {
  const r = base();
  assert.strictEqual(r.lines.C.find(x => x.hour === '01:00').dayOffset, 1);
  assert.strictEqual(r.lines.C.find(x => x.hour === '08:00').dayOffset, 0);
});
t('valores e vazios (sintéticos)', () => {
  const r = base();
  const at = (line, h, f) => r.lines[line].find(x => x.hour === h)[f];
  assert.strictEqual(at('C', '07:00', 'dry'), null);      // célula vazia
  assert.strictEqual(at('C', '08:00', 'dry'), 14.7);
  assert.strictEqual(at('C', '08:00', 'hMilho'), 18.5);
  assert.strictEqual(at('D', '08:00', 'dry'), 13.7);
});
t('médias recalculadas batem com a linha "Ave." (ambas as linhas)', () => {
  const r = base();
  for (const line of ['C', 'D']) for (const f of Q.FIELDS) assert.strictEqual(r.calc[line][f], r.file[line][f], line + ' ' + f);
  assert.deepStrictEqual(r.mismatches, []);
});
t('diferença entre média calculada e a do ficheiro é assinalada', () => {
  const rows = JSON.parse(JSON.stringify(fx.rows));
  rows[rows.length - 1][1] = 99.0;
  const r = Q.parseHourlySheet(rows, { fileName: 'QC__15-10', yearDefault: 2026 });
  assert.ok(r.mismatches.some(m => m.line === 'C' && m.field === 'dry'));
});
t('cabeçalho trocado é erro, não leitura silenciosa', () => {
  const rows = JSON.parse(JSON.stringify(fx.rows));
  rows[1][2] = 'Humidade';
  assert.strictEqual(Q.parseHourlySheet(rows, { fileName: 'QC__15-10', yearDefault: 2026 }).ok, false);
});
t('hora como fração do dia (Excel) é lida', () => {
  const rows = JSON.parse(JSON.stringify(fx.rows));
  rows[2][0] = 8 / 24;
  assert.strictEqual(Q.parseHourlySheet(rows, { fileName: 'QC__15-10', yearDefault: 2026 }).hours[0], '08:00');
});
t('leitura do .xlsx real (biblioteca SheetJS incluída) dá a mesma estrutura', () => {
  const buf = fs.readFileSync(path.join(__dirname, 'fixtures', 'QC__00-00_synthetic.xlsx'));
  const rows = Q.readRows(XLSX, buf);
  const r = Q.parseHourlySheet(rows, { fileName: 'QC__15-10', yearDefault: 2026 });
  assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
  assert.strictEqual(r.lines.C.find(x => x.hour === '08:00').dry, 14.7);
  assert.deepStrictEqual(r.mismatches, []);
});
t('registos: uma linha por hora e linha com valores; uid só acrescenta', () => {
  const r = base();
  const recs = Q.buildRecords(r, { fileName: 'QC__15-10', deviceId: 'D1', importedAt: '2026-10-16T10:00:00.000Z' });
  assert.ok(recs.length > 0);
  assert.ok(recs.every(x => x.uid && x.kind === 'hourly'));
  const night = recs.find(x => x.hour === '01:00' && x.line === 'C');
  if (night) assert.strictEqual(night.date, '2026-10-16');
  const again = Q.buildRecords(r, { fileName: 'QC__15-10', deviceId: 'D1', importedAt: '2026-10-16T11:00:00.000Z' });
  assert.notStrictEqual(recs[0].uid, again[0].uid);
});
console.log('OK —', n, 'testes de importação QC');
