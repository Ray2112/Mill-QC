// node tests/wa-import.test.js — importação de mensagens do WhatsApp (v2.3.0)
const assert = require('assert');
const W = require('../js/wa-import.js');
const L = require('../js/logic.js');

// Texto tal como aparece nas mensagens do grupo (captura de 24-10-2026)
const two = `9h
Milho Seco-
Milho Húmido-16.8%

Fuba Amarela


Humidade -13.16%
Proteínas -9.12%
Cinzas-1.07%
Gorduras- 2.84%
Fibras -0.48%


Equipamento em uso: PFEUFFER e perten
Abaixo vão os resultados  do milho e Fuba LC

10h
Milho Seco-
Milho Húmido-16.9%

Fuba Amarela


Humidade -13.38%
Proteínas -9.01%
Gorduras- 3.39%
Fibras -0.47%


Equipamento em uso: PFEUFFER e perten`;

const m = W.parse(two);
assert.strictEqual(m.length, 2);
assert.deepStrictEqual([m[0].hour, m[1].hour], [9, 10]);
assert.deepStrictEqual(m[0].maize, { dry: null, wet: '16.8' }, 'Milho Seco vazio = não medido (null), não zero');
assert.strictEqual(m[0].samples.length, 1);
assert.strictEqual(m[0].samples[0].productId, 'fuba2', 'Fuba Amarela = Fuba 2');
assert.deepStrictEqual(m[0].samples[0].values, { moisture: '13.16', protein: '9.12', ash: '1.07', fat: '2.84', fibre: '0.48' });
assert.deepStrictEqual(m[1].samples[0].values, { moisture: '13.38', protein: '9.01', fat: '3.39', fibre: '0.47' }, 'sem Cinzas: não medido');
assert.strictEqual(m[0].equipment, 'PFEUFFER e perten');
assert.deepStrictEqual(m[0].errors, []);
assert.ok(m[0].ignored.some(x => x.startsWith('Abaixo')), 'texto livre ignorado e listado');
assert.ok(m[0].raw.startsWith('9h') && m[0].raw.includes('Fibras -0.48%'), 'texto original guardado');

// Cabeçalho do WhatsApp ao copiar várias mensagens + vírgula decimal + "9h30"
const hdr = W.parse(`[09:39, 24/10/2026] Abel LC: 9h30
Fuba Amarela
Humidade - 13,2 %
Gorduras: 2,9%`);
assert.strictEqual(hdr.length, 1);
assert.deepStrictEqual([hdr[0].hour, hdr[0].minute], [9, 30]);
assert.deepStrictEqual(hdr[0].header, { time: '09:39', date: '2026-10-24', sender: 'Abel LC' });
assert.deepStrictEqual(hdr[0].samples[0].values, { moisture: '13,2', fat: '2,9' });

// Erros: rótulo desconhecido, valor ilegível, parâmetro antes do produto, produto desconhecido, duplicado
const bad = W.parse(`11h
Humidade -13%
Fuba Branca
Fuba Amarela
Humidade -13.1%
Humidade -13.2%
Granulometria -12%
Gorduras -abc`);
const codes = bad[0].errors.map(e => e.code);
assert.deepStrictEqual(codes, ['wa_no_product', 'wa_product_unknown', 'wa_duplicate', 'wa_label_unknown', 'wa_value_bad']);
assert.deepStrictEqual(bad[0].samples[0].values, { moisture: '13.1' }, 'o primeiro valor fica; o duplicado é erro');

// Mensagem só com hora / produto vazio
assert.deepStrictEqual(W.parse('12h').map(x => x.errors.map(e => e.code)), [['wa_empty']]);
assert.deepStrictEqual(W.parse('12h\nFuba Amarela\nHumidade -').map(x => x.errors.map(e => e.code)), [['wa_product_empty']]);
assert.deepStrictEqual(W.parse('sem horas aqui'), [], 'sem linha de hora: nada importado');

// Hora → instante no dia de produção (07:00–07:00)
assert.strictEqual(W.timeOf('2026-10-23', 9, 0), new Date(2026, 9, 23, 9, 0).getTime());
assert.strictEqual(W.timeOf('2026-10-23', 2, 0), new Date(2026, 9, 24, 2, 0).getTime(), '02h pertence à madrugada seguinte');
assert.strictEqual(L.prodDay(W.timeOf('2026-10-23', 6, 59)), '2026-10-23');
assert.strictEqual(L.prodDay(W.timeOf('2026-10-23', 7, 0)), '2026-10-23');

// Os valores passam pela mesma avaliação que a amostra manual
const prod = L.defaultProducts().find(p => p.id === 'fuba2');
assert.ok(prod, 'produto fuba2 existe');
const ev = L.evaluateSample(prod, m[0].samples[0].values, {});
assert.deepStrictEqual(ev.errors, []);
assert.strictEqual(ev.values.moisture, 13.16);
assert.strictEqual(ev.values.fat, 2.84);

console.log('OK — importação do WhatsApp');
