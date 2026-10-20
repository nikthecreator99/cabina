// Локальное хранилище CABINA на IndexedDB. Ничего не передаётся по сети.
const DB_NAME = 'cabina';
const DB_VERSION = 1;
export const STORES = ['trips', 'absences', 'routes', 'notes', 'files', 'blobs', 'meta'];

let dbp = null;
let memory = null; // запасной режим, если IndexedDB недоступна

export function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) {
          const os = db.createObjectStore(s, { keyPath: 'id' });
          if (s === 'files') os.createIndex('parentId', 'parentId');
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('blocked'));
  }).catch((e) => {
    console.warn('IndexedDB недоступна, данные будут только в памяти', e);
    memory = Object.fromEntries(STORES.map((s) => [s, new Map()]));
    return null;
  });
  return dbp;
}

export const isMemoryMode = () => !!memory;

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('abort'));
  });
}

export async function getAll(store) {
  const db = await openDB();
  if (!db) return [...memory[store].values()].map((v) => structuredClone(v));
  return new Promise((resolve, reject) => {
    const r = db.transaction(store).objectStore(store).getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function get(store, id) {
  const db = await openDB();
  if (!db) { const v = memory[store].get(id); return v ? structuredClone(v) : undefined; }
  return new Promise((resolve, reject) => {
    const r = db.transaction(store).objectStore(store).get(id);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

// ops: [{store, put: obj} | {store, del: id}] — одна транзакция: либо всё, либо ничего
export async function write(ops) {
  const db = await openDB();
  if (!db) {
    for (const op of ops) {
      if (op.put) memory[op.store].set(op.put.id, structuredClone(op.put));
      else memory[op.store].delete(op.del);
    }
    return;
  }
  const stores = [...new Set(ops.map((o) => o.store))];
  const tx = db.transaction(stores, 'readwrite');
  for (const op of ops) {
    const os = tx.objectStore(op.store);
    if (op.put) os.put(op.put); else os.delete(op.del);
  }
  await done(tx);
}

export const put = (store, obj) => write([{ store, put: obj }]);
export const del = (store, id) => write([{ store, del: id }]);

// Полная замена данных (восстановление резервной копии). Атомарно.
export async function replaceAll(data) {
  const db = await openDB();
  if (!db) {
    for (const s of STORES) { memory[s].clear(); for (const o of data[s] || []) memory[s].set(o.id, o); }
    return;
  }
  const tx = db.transaction(STORES, 'readwrite');
  for (const s of STORES) {
    const os = tx.objectStore(s);
    os.clear();
    for (const o of data[s] || []) os.put(o);
  }
  await done(tx);
}

export function isQuotaError(e) {
  if (!e) return false;
  const n = e.name || '';
  return n === 'QuotaExceededError' || n === 'NS_ERROR_DOM_QUOTA_REACHED' || /quota/i.test(e.message || '');
}
