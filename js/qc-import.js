/* Importação da folha horária de QC (LINE C / LINE D). Só lê; não grava.
   Hourly QC sheet import: reads the rows, recalculates the "Ave." row to check the file's own average.
   Layout: row "Hora"; LINE C = cols 1–4, LINE D = cols 5–8; hours 07:00 → 06:00 (production day). */
(function (root) {
  'use strict';
  const HEADERS = ['Milho Seco', 'H/Milho %', 'Gordura %', 'H/Fuba %'];
  const FIELDS = ['dry', 'hMilho', 'fat', 'hFuba'];
  const BLOCKS = { C: 1, D: 5 };

  // Data do nome do ficheiro: "QC__15-10" → "2026-10-15" (ano em falta: assume-se yearDefault)
  function dateFromName(name, yearDefault) {
    const m = /(\d{1,2})[-_.](\d{1,2})(?:[-_.](\d{2,4}))?(?!\d)/.exec(String(name || ''));
    if (!m) return null;
    const dd = +m[1], mm = +m[2];
    let yy = m[3] ? +m[3] : yearDefault;
    if (yy < 100) yy += 2000;
    if (!yy || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return yy + '-' + String(mm).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
  }
  // Valor numérico: aceita número ou texto com vírgula/ponto; vazio → null
  function numOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    const s = String(v).trim().replace(',', '.');
    if (s === '') return null;
    const n = Number(s);
    return isFinite(n) ? n : null;
  }
  function round2(n) { return n === null ? null : Math.round(n * 100) / 100; }
  function mean(vals) {
    const v = vals.filter(x => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }
  // rows: matriz (array de arrays) da folha; hora em texto "HH:MM"
  function parseHourlySheet(rows, opts) {
    const o = opts || {};
    const errors = [], warnings = [];
    const hi = rows.findIndex(r => r && String(r[0]).trim().toLowerCase() === 'hora');
    if (hi < 0) return { ok: false, errors: ['no_hora_header'], warnings, lines: {}, hours: [] };
    const header = rows[hi];
    for (const line of Object.keys(BLOCKS)) {
      const c0 = BLOCKS[line];
      HEADERS.forEach((h, j) => {
        if (String(header[c0 + j] || '').trim() !== h) errors.push('header_' + line + '_' + j + ':' + (header[c0 + j] || ''));
      });
    }
    const lines = { C: [], D: [] };
    const hours = [];
    let avgRow = null;
    for (let i = hi + 1; i < rows.length; i++) {
      const r = rows[i] || [];
      let label = r[0];
      if (typeof label === 'number' && label >= 0 && label < 1) { // hora como fração do dia (Excel)
        const mins = Math.round(label * 1440); label = String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
      }
      label = String(label || '').trim();
      if (label.toLowerCase().startsWith('ave')) { avgRow = r; break; }
      if (!/^\d{1,2}:\d{2}$/.test(label)) continue;
      const [hh] = label.split(':').map(Number);
      // Horas 00:00–06:59 pertencem ao dia de produção que começou às 07:00 anterior
      const dayOffset = hh < 7 ? 1 : 0;
      hours.push(label);
      for (const line of Object.keys(BLOCKS)) {
        const c0 = BLOCKS[line];
        const rec = { hour: label, dayOffset: dayOffset };
        FIELDS.forEach((f, j) => { rec[f] = numOrNull(r[c0 + j]); });
        lines[line].push(rec);
      }
    }
    // Média recalculada e média do ficheiro (linha "Ave.")
    const calc = {}, file = {};
    for (const line of Object.keys(BLOCKS)) {
      const c0 = BLOCKS[line];
      calc[line] = {}; file[line] = {};
      FIELDS.forEach((f, j) => {
        calc[line][f] = round2(mean(lines[line].map(x => x[f])));
        file[line][f] = avgRow ? round2(numOrNull(avgRow[c0 + j])) : null;
      });
    }
    const tol = o.tolerance === undefined ? 0.011 : o.tolerance;
    const mismatches = [];
    for (const line of Object.keys(BLOCKS)) {
      FIELDS.forEach(f => {
        const a = calc[line][f], b = file[line][f];
        if (a === null && b === null) return;
        if (a === null || b === null) { if (a !== b) mismatches.push({ line, field: f, calc: a, file: b }); return; }
        if (Math.abs(a - b) > tol) mismatches.push({ line, field: f, calc: a, file: b });
      });
    }
    if (!avgRow) warnings.push('no_ave_row');
    // Valores fora de intervalo plausível (%) — só aviso
    for (const line of Object.keys(BLOCKS)) lines[line].forEach(rec => FIELDS.forEach(f => {
      if (rec[f] !== null && (rec[f] < 0 || rec[f] > 100)) warnings.push('out_of_range:' + line + ':' + rec.hour + ':' + f);
    }));
    const date = dateFromName(o.fileName, o.yearDefault);
    if (!date) warnings.push('no_date_from_name');
    return { ok: errors.length === 0, errors, warnings, date, lines, calc, file, mismatches, hours };
  }

  // Lê a primeira folha de um .xlsx (ArrayBuffer) com a biblioteca XLSX já carregada; devolve matriz de valores brutos.
  function readRows(XLSX, buffer) {
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  }
  // Registos para a loja hourlyChecks. uid = data|linha|hora|momento da importação: só acrescenta (nunca sobrescreve).
  // Horas sem nenhum valor são omitidas.
  function buildRecords(parsed, meta) {
    const out = [];
    if (!parsed || !parsed.date) return out;
    for (const line of Object.keys(parsed.lines)) {
      for (const rec of parsed.lines[line]) {
        if (FIELDS.every(f => rec[f] === null)) continue;
        const dayDate = rec.dayOffset ? nextDay(parsed.date) : parsed.date;
        out.push({
          uid: [dayDate, line, rec.hour, meta.importedAt].join('|'),
          kind: 'hourly', date: dayDate, shift: 'prodDay:' + parsed.date, line: line, hour: rec.hour,
          dry: rec.dry, hMilho: rec.hMilho, fat: rec.fat, hFuba: rec.hFuba,
          sourceFile: meta.fileName || '', deviceId: meta.deviceId || '', importedAt: meta.importedAt,
          createdAt: meta.importedAt
        });
      }
    }
    return out;
  }
  function nextDay(iso) {
    const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  const api = { HEADERS, FIELDS, dateFromName, numOrNull, parseHourlySheet, readRows, buildRecords, nextDay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QcImport = api;
})(typeof window !== 'undefined' ? window : this);
