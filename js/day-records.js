// Ficheiros diários de registos para o Dropbox (v2.1.0): um ficheiro por dia de produção (07:00–07:00),
// com todos os registos desse dia de todas as lojas e um manifesto (contagens por loja e por turno).
// Só regras puras: não lê a base de dados nem contacta a rede. O envio fica em prod-ui.js.
// O ficheiro de um dia é reescrito por inteiro sempre que um registo desse dia muda (modo overwrite);
// a ingestão desduplica por id/uid, portanto reenviar o mesmo dia não duplica nada.
(function (root) {
  const FILE_SCHEMA = 1;
  const QC_STORES = ['samples', 'holds', 'alerts', 'limitChanges', 'reports'];                          // chave: id
  const PROD_STORES = ['jobs', 'binEvents', 'shiftLog', 'siloSnapshots', 'prodChanges', 'grainMoves'];  // chave: uid
  const STORES = QC_STORES.concat(PROD_STORES);
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

  const keyOf = (store, rec) => String(QC_STORES.indexOf(store) >= 0 ? rec.id : rec.uid);
  function toMs(v) {
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v === 'string' && v) { const ms = Date.parse(v); if (isFinite(ms)) return ms; }
    return null;
  }
  // Dia de produção de um registo: campo prodDay (produção), day (relatórios), senão a hora do registo.
  // prodDayOf(ms) -> 'AAAA-MM-DD' (Logic.prodDay, hora local do dispositivo). null = sem data.
  function dayOf(store, rec, prodDayOf) {
    if (!rec) return null;
    if (typeof rec.prodDay === 'string' && DAY_RE.test(rec.prodDay)) return rec.prodDay;
    if (store === 'reports' && typeof rec.day === 'string' && DAY_RE.test(rec.day)) return rec.day;
    const ms = [rec.t, rec.openedAt, rec.importedAt, rec.startedAt, rec.createdAt].map(toMs).find(x => x !== null);
    return ms === null || ms === undefined ? null : prodDayOf(ms);
  }
  // Hash FNV-1a 32 bits (hex): só para saber se o conteúdo de um dia mudou desde o último envio.
  function hashOf(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  function dayPath(dir, day) {
    if (!DAY_RE.test(day)) throw new Error('dia inválido');
    return dir.replace(/\/+$/, '') + '/' + day + '_FMO_MillQC.json';
  }
  // data: {store: [registos]} (como DB.exportAll). opts: {prodDayOf, test, now, writerVersion, deviceId, site, codesSource}
  // Só entram registos com test === opts.test (registos de teste vão para outra pasta).
  // Devolve {files: {dia: {path?, hash, file}}, undated: {store: n}}
  function buildDayFiles(data, opts) {
    const o = opts || {};
    if (typeof o.prodDayOf !== 'function') throw new Error('prodDayOf em falta');
    const wantTest = !!o.test;
    const byDay = {}, undated = {};
    STORES.forEach(store => {
      (data && Array.isArray(data[store]) ? data[store] : []).forEach(rec => {
        if (!rec || !!rec.test !== wantTest) return;
        const day = dayOf(store, rec, o.prodDayOf);
        if (!day) { undated[store] = (undated[store] || 0) + 1; return; }
        const d = byDay[day] || (byDay[day] = {});
        (d[store] || (d[store] = [])).push(rec);
      });
    });
    const files = {};
    Object.keys(byDay).sort().forEach(day => {
      const records = {}, counts = {}, shifts = { D: 0, N: 0, none: 0 };
      STORES.forEach(store => {
        const list = (byDay[day][store] || []).slice().sort((a, b) => keyOf(store, a) < keyOf(store, b) ? -1 : keyOf(store, a) > keyOf(store, b) ? 1 : 0);
        records[store] = list;
        counts[store] = list.length;
        list.forEach(r => {
          const p = typeof r.shift === 'string' ? r.shift.slice(-1) : r.period;
          if (p === 'D' || p === 'N') shifts[p]++; else shifts.none++;
        });
      });
      const body = JSON.stringify(records);
      const hash = hashOf(body);
      const total = STORES.reduce((s, k) => s + counts[k], 0);
      files[day] = {
        hash,
        file: {
          schemaVersion: FILE_SCHEMA, kind: 'mill-qc-day', prodDay: day, test: wantTest,
          generatedAt: new Date(typeof o.now === 'number' ? o.now : Date.now()).toISOString(),
          writer: 'mill-qc', writerVersion: o.writerVersion || null, deviceId: o.deviceId || null, site: o.site || '',
          codesSource: o.codesSource || null,
          manifest: { counts, total, shifts, contentHash: hash },
          records
        }
      };
    });
    return { files, undated };
  }
  // Dias cujo conteúdo mudou desde o último envio confirmado. sent: {caminho: hash}
  function pendingDays(built, dir, sent) {
    const s = sent || {};
    return Object.keys(built.files).sort().filter(day => s[dayPath(dir, day)] !== built.files[day].hash);
  }
  const api = { FILE_SCHEMA, STORES, QC_STORES, PROD_STORES, dayOf, hashOf, dayPath, buildDayFiles, pendingDays };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DayRecords = api;
})(typeof window !== 'undefined' ? window : this);
