/* IndexedDB — base de dados própria da app de CQ (separada da app de Silos).
 * v4 (sem versão de app atribuída): amostras, retenções, alertas, alterações de limites e relatórios passam a chave 'id' = UUID (texto);
 *   registos antigos são migrados na abertura, na mesma transação, com reescrita das referências.
 * v3 (app 1.3.0): + grainMoves (transferências para silos de milho sujo). v2 (app 1.1.0): lojas de produção com chave 'uid' (texto, único por dispositivo) para sincronização futura. */
(function (root) {
  'use strict';
  const DB_NAME = 'moagem-cq';
  const DB_VERSION = 4;
  const FORMAT = 4;
  const STORES = ['samples', 'holds', 'alerts', 'limitChanges', 'reports'];   // chave: id (UUID)
  const PSTORES = ['jobs', 'binEvents', 'shiftLog', 'siloSnapshots', 'prodChanges', 'grainMoves'];   // chave: uid
  const ALL = STORES.concat(PSTORES);
  const LOCAL_KEYS = ['pin', 'pinLock', 'deviceId'];               // ficam só neste dispositivo
  let dbp = null;

  function createKeyedStore(db, s) {
    const os = db.createObjectStore(s, { keyPath: 'id' });
    if (s !== 'reports') os.createIndex('t', s === 'holds' ? 'openedAt' : 't');
    return os;
  }

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        const tx = r.transaction;
        // Lojas antigas (v1–v3) têm chave numérica autoincrement: são lidas, recriadas com chave UUID e reescritas.
        const legacy = STORES.filter(s => db.objectStoreNames.contains(s) && tx.objectStore(s).autoIncrement);
        const read = {};
        let left = legacy.length;
        const build = () => {
          const up = legacy.length ? root.Logic.qcUpgradeKeys(read) : { data: {}, warnings: [] };
          legacy.forEach(s => db.deleteObjectStore(s));
          if (!db.objectStoreNames.contains('config')) db.createObjectStore('config', { keyPath: 'key' });
          STORES.forEach(s => { if (!db.objectStoreNames.contains(s)) createKeyedStore(db, s); });
          PSTORES.forEach(s => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'uid' }); });
          STORES.forEach(s => (up.data[s] || []).forEach(rec => tx.objectStore(s).put(rec)));
          if (legacy.length) {
            const counts = {};
            legacy.forEach(s => { counts[s] = read[s].length; });
            tx.objectStore('config').put({ key: 'migrationV4', value: { at: new Date().toISOString(), counts, warnings: up.warnings } });
          }
        };
        if (!left) build();
        legacy.forEach(s => {
          const q = tx.objectStore(s).getAll();
          q.onsuccess = () => { read[s] = q.result; if (--left === 0) build(); };
        });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  function tx(stores, mode, fn) {
    return open().then(db => new Promise((res, rej) => {
      const t = db.transaction(stores, mode);
      let out;
      Promise.resolve(fn(t)).then(v => { out = v; });
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('abort'));
    }));
  }
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  // Registos de CQ recebem UUID ao ser criados (nunca reutilizam uma chave apagada)
  const needsId = (store, obj) => STORES.indexOf(store) >= 0 && obj && (obj.id === undefined || obj.id === null);
  const withId = (store, obj) => { if (needsId(store, obj)) obj.id = root.Logic.newId(); return obj; };

  // add: só cria (nunca sobrescreve)
  function add(store, obj) {
    withId(store, obj);
    return tx([store], 'readwrite', t => req(t.objectStore(store).add(obj)));
  }
  // put: actualização intencional (retenções, configuração)
  function put(store, obj) {
    withId(store, obj);
    return tx([store], 'readwrite', t => req(t.objectStore(store).put(obj)));
  }
  function all(store) {
    return tx([store], 'readonly', t => req(t.objectStore(store).getAll()));
  }
  function getConfig(key) {
    return tx(['config'], 'readonly', t => req(t.objectStore('config').get(key))).then(r => r ? r.value : undefined);
  }
  function setConfig(key, value) {
    return tx(['config'], 'readwrite', t => req(t.objectStore('config').put({ key, value })));
  }
  // Grava amostra + (opcional) retenção nova/actualizada + alerta, tudo-ou-nada. Ids gerados antes da escrita,
  // para que a retenção e o alerta referenciem o UUID da amostra.
  function saveSampleBundle(sample, holdFn, alertObj) {
    withId('samples', sample);
    return tx(['samples', 'holds', 'alerts'], 'readwrite', async t => {
      await req(t.objectStore('samples').add(sample));
      const holdOps = holdFn ? holdFn(sample) : [];
      for (const h of holdOps) { withId('holds', h); await req(t.objectStore('holds').put(h)); }
      if (alertObj) { withId('alerts', alertObj); alertObj.sampleId = sample.id; await req(t.objectStore('alerts').add(alertObj)); }
      return sample.id;
    });
  }
  // Vários registos em várias lojas, tudo-ou-nada. ops: [{store, op:'add'|'put', obj}]
  function batch(ops) {
    ops.forEach(o => withId(o.store, o.obj));
    const stores = [...new Set(ops.map(o => o.store))];
    return tx(stores, 'readwrite', async t => {
      for (const o of ops) await req(t.objectStore(o.store)[o.op === 'put' ? 'put' : 'add'](o.obj));
    });
  }
  async function exportAll() {
    const o = { app: 'mill-qc', format: FORMAT, exportedAt: new Date().toISOString() };
    for (const s of ALL) o[s] = await all(s);
    o.config = (await tx(['config'], 'readonly', t => req(t.objectStore('config').getAll()))).filter(c => LOCAL_KEYS.indexOf(c.key) < 0);
    return o;
  }
  // Cópias de formato ≤3 têm ids numéricos: passam pela mesma migração de chaves antes de serem gravadas.
  async function importAll(o) {
    if (!root.Logic.validBackup(o) || !root.Prod.validProdBackup(o)) throw new Error('invalid-backup');
    let src = o, warnings = [];
    if (!(o.format >= 4)) {
      const up = root.Logic.qcUpgradeKeys(o);
      src = Object.assign({}, o, up.data);
      warnings = up.warnings;
    }
    const stores = ALL.concat(['config']);
    await tx(stores, 'readwrite', async t => {
      const keep = [];
      for (const k of LOCAL_KEYS) { const v = await req(t.objectStore('config').get(k)); if (v) keep.push(v); }
      for (const s of stores) {
        await req(t.objectStore(s).clear());
        if (s === 'config') for (const v of keep) await req(t.objectStore('config').put(v));
        for (const r of (src[s] || [])) {
          if (s === 'config' && LOCAL_KEYS.indexOf(r.key) >= 0) continue;    // PIN e identidade do dispositivo nunca são importados
          await req(t.objectStore(s).put(r));
        }
      }
    });
    return { warnings };
  }
  root.DB = { open, add, put, all, batch, getConfig, setConfig, saveSampleBundle, exportAll, importAll, DB_NAME, DB_VERSION, FORMAT };
})(window);
