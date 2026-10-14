/**
 * PanoramaCache - IndexedDB-backed persistent cache for 360 panorama data URLs.
 *
 * Why IndexedDB instead of localStorage?
 *  - localStorage is capped at ~5MB total — one full-res panorama alone can be 500KB+
 *  - IndexedDB has no practical limit (browser-controlled, typically GBs)
 *  - Async API — never blocks the main thread
 *
 * Cache key format: `pano_v2_<nodeId>`
 * Bump CACHE_VERSION to invalidate all stored entries on next load.
 */

const DB_NAME    = 'CampusWalkPanoramaCache';
const DB_VERSION = 1;
const STORE_NAME = 'panoramas';
const CACHE_VERSION = 'v3'; // bumped for MediPath rebrand (new panorama artwork)

let _db = null;

/**
 * Open (or reuse) the IndexedDB connection.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME); // keyed by string key
      }
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };

    req.onerror = (e) => {
      console.warn('[PanoramaCache] IndexedDB open failed:', e.target.error);
      reject(e.target.error);
    };
  });
}

/**
 * Build the full storage key for a node.
 * @param {string} nodeId
 * @returns {string}
 */
function cacheKey(nodeId) {
  return `pano_${CACHE_VERSION}_${nodeId}`;
}

/**
 * Read a cached panorama data URL from IndexedDB.
 * Returns null if not found or on any error.
 * @param {string} nodeId
 * @returns {Promise<string|null>}
 */
export async function getFromCache(nodeId) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx  = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(cacheKey(nodeId));
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror   = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Write a panorama data URL to IndexedDB (fire-and-forget, non-blocking).
 * Silently ignores quota or other errors.
 * @param {string} nodeId
 * @param {string} dataUrl
 */
export async function saveToCache(nodeId, dataUrl) {
  try {
    const db = await openDB();
    const tx  = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(dataUrl, cacheKey(nodeId));
    // No need to await tx.oncomplete — fire and forget
  } catch (e) {
    console.warn('[PanoramaCache] Could not save to IndexedDB:', e);
  }
}

/**
 * Delete a single cached panorama from IndexedDB (used when a node's image changes).
 * @param {string} nodeId
 */
export async function deleteFromCache(nodeId) {
  try {
    const db = await openDB();
    const tx  = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(cacheKey(nodeId));
  } catch (e) {
    console.warn('[PanoramaCache] Could not delete from IndexedDB:', e);
  }
}

/**
 * Clear all cached panoramas (e.g. for a forced refresh).
 */
export async function clearCache() {
  try {
    const db = await openDB();
    const tx  = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    console.log('[PanoramaCache] Cache cleared.');
  } catch (e) {
    console.warn('[PanoramaCache] Could not clear IndexedDB:', e);
  }
}
