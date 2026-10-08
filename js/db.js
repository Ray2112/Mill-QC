/* IndexedDB — base de dados própria da app de CQ (separada da app de Silos).
 * v2 (app 1.1.0): lojas de produção com chave 'uid' (texto, único por dispositivo) para sincronização futura. */
(function (root) {
  'use strict';
  const DB_NAME = 'moagem-cq';
  const DB_VERSION = 2;
  const FORMAT = 2;
  const STORES = ['samples', 'holds', 'alerts', 'limitChanges', 'reports'];
  const PSTORES = ['jobs', 'binEvents', 'shiftLog', 'siloSnapshots', 'prodChanges'];   // chave: uid
  const ALL = STORES.concat(PSTORES);
  const LOCAL_KEYS = ['pin', 'pinLock', 'deviceId'];               // ficam só neste dispositivo
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        STORES.forEach(s => {
          if (!db.objectStoreNames.contains(s)) {
            const os = db.createObjectStore(s, { keyPath: 'id', autoIncrement: true });
            if (s !== 'reports') os.createIndex('t', s === 'holds' ? 'openedAt' : 't');
          }
        });
        if (!db.objectStoreNames.contains('config')) db.createObjectStore('config', { keyPath: 'key' });
        PSTORES.forEach(s => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'uid' }); });
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

  // add: só cria (nunca sobrescreve)
  function add(store, obj) {
    return tx([store], 'readwrite', t => req(t.objectStore(store).add(obj)));
  }
  // put: actualização intencional (retenções, configuração)
  function put(store, obj) {
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
  // Grava amostra + (opcional) retenção nova/actualizada + alerta, tudo-ou-nada
  function saveSampleBundle(sample, holdFn, alertObj) {
    return tx(['samples', 'holds', 'alerts'], 'readwrite', async t => {
      const id = await req(t.objectStore('samples').add(sample));
      sample.id = id;
      const holdOps = holdFn ? holdFn(sample) : [];
      for (const h of holdOps) await req(t.objectStore('holds').put(h));
      if (alertObj) { alertObj.sampleId = id; await req(t.objectStore('alerts').add(alertObj)); }
      return id;
    });
  }
  // Vários registos em várias lojas, tudo-ou-nada. ops: [{store, op:'add'|'put', obj}]
  function batch(ops) {
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
  async function importAll(o) {
    if (!root.Logic.validBackup(o) || !root.Prod.validProdBackup(o)) throw new Error('invalid-backup');
    const stores = ALL.concat(['config']);
    return tx(stores, 'readwrite', async t => {
      const keep = [];
      for (const k of LOCAL_KEYS) { const v = await req(t.objectStore('config').get(k)); if (v) keep.push(v); }
      for (const s of stores) {
        await req(t.objectStore(s).clear());
        if (s === 'config') for (const v of keep) await req(t.objectStore('config').put(v));
        for (const r of (o[s] || [])) {
          if (s === 'config' && LOCAL_KEYS.indexOf(r.key) >= 0) continue;    // PIN e identidade do dispositivo nunca são importados
          await req(t.objectStore(s).put(r));
        }
      }
    });
  }
  root.DB = { open, add, put, all, batch, getConfig, setConfig, saveSampleBundle, exportAll, importAll, DB_NAME, DB_VERSION, FORMAT };
})(window);
