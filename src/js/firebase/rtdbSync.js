/**
 * CampusWalk AI — Firebase Realtime Database Sync Layer
 * Handles all reads/writes to Firebase RTDB.
 * Falls back gracefully to static CAMPUS_DATASET if Firebase is not configured.
 *
 * PERFORMANCE MODEL (instant publish):
 * - `campus/nodes/{id}` holds SMALL metadata only (name, floor, hotspots, …).
 *   Hotspot / text edits sync in ~100-500ms to every client.
 * - `campus/images/{id}` holds the big base64 panorama bytes, written ONLY
 *   when a photo actually changes. Clients lazy-load these on demand for the
 *   spot they are viewing (then IndexedDB-cache them), so a hotspot edit
 *   never forces a megabyte re-download.
 * - `node.photoRev` (timestamp) is bumped on every photo save so clients can
 *   detect a new photo and bust their caches for that node only.
 */

import { FIREBASE_CONFIG, RTDB_ROOT } from './firebaseConfig.js';
import { CAMPUS_DATASET } from '../graph/dataset.js';

let _db = null;
let _firebaseApp = null;
let _dbModule = null;
let _isConfigured = false;

/**
 * Check if the user has filled in real Firebase credentials
 */
function _isFirebaseConfigured() {
  return (
    FIREBASE_CONFIG.apiKey &&
    !FIREBASE_CONFIG.apiKey.includes('YOUR_') &&
    FIREBASE_CONFIG.databaseURL &&
    !FIREBASE_CONFIG.databaseURL.includes('YOUR_')
  );
}

/**
 * Helper to get or cache Firebase Database SDK module
 */
async function _getDbModule() {
  if (!_dbModule) {
    _dbModule = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
  }
  return _dbModule;
}

/**
 * Dynamically load Firebase SDK modules from CDN and initialize the app.
 * Returns true on success, false if config is missing / load fails.
 */
export async function initFirebase() {
  if (!_isFirebaseConfigured()) {
    console.warn('[Firebase] Config not set — running in offline/static mode. Fill in src/js/firebase/firebaseConfig.js to enable real-time sync.');
    return false;
  }

  try {
    // Parallel import of Firebase core and database modules for fastest load
    const [{ initializeApp, getApps }, { getDatabase }] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
      _getDbModule()
    ]);

    if (getApps().length === 0) {
      _firebaseApp = initializeApp(FIREBASE_CONFIG);
    } else {
      _firebaseApp = getApps()[0];
    }

    _db = getDatabase(_firebaseApp);
    _isConfigured = true;
    console.log('[Firebase] ✅ Connected to Realtime Database:', FIREBASE_CONFIG.databaseURL);
    return true;
  } catch (err) {
    console.error('[Firebase] Failed to initialize:', err);
    return false;
  }
}

/**
 * Split a node into a small remote-safe copy + optional big image bytes.
 * - URL images ("/panoramas/…", "https://…") stay inline (they're tiny).
 * - data: URL uploads are extracted to `campus/images/{id}`; the remote copy
 *   keeps `customImage: ''` + `photo: true` + fresh `photoRev`.
 * The LOCAL node object keeps its inline data URL so the uploader's viewer
 * renders instantly without a network round-trip.
 * @returns {{ remote: Object, imageData: string|null }}
 */
export function splitNodeForRemote(nodeData) {
  const remote = { ...(nodeData || {}) };
  let imageData = null;
  if (typeof remote.customImage === 'string' && remote.customImage.startsWith('data:')) {
    imageData = remote.customImage;
    remote.customImage = '';
    remote.photo = true;
    remote.photoRev = Date.now();
  }
  return { remote, imageData };
}

/**
 * Seed RTDB with the full static dataset if the /campus/nodes path is empty.
 * This only runs once on first setup.
 */
export async function seedIfEmpty() {
  if (!_isConfigured || !_db) return;

  try {
    const { ref, get, set } = await _getDbModule();
    const nodesRef = ref(_db, `${RTDB_ROOT}/nodes`);
    const snapshot = await get(nodesRef);

    if (!snapshot.exists()) {
      console.log('[Firebase] RTDB is empty — seeding with static CAMPUS_DATASET...');
      const remoteNodes = {};
      const images = {};
      for (const [id, node] of Object.entries(CAMPUS_DATASET.nodes)) {
        const { remote, imageData } = splitNodeForRemote(node);
        remoteNodes[id] = remote;
        if (imageData) images[id] = imageData;
      }
      await set(nodesRef, remoteNodes);
      if (Object.keys(images).length > 0) {
        await set(ref(_db, `${RTDB_ROOT}/images`), images);
      }
      console.log('[Firebase] ✅ Seed complete.');
    } else {
      console.log('[Firebase] RTDB already has data, skipping seed.');
    }
  } catch (err) {
    console.error('[Firebase] Seed error:', err);
  }
}

/**
 * Force sync all current local panoramas, nodes, and hotspots to Firebase RTDB.
 */
export async function syncAllToFirebase() {
  if (!_isConfigured || !_db) {
    console.warn('[Firebase] Cannot sync — Firebase is not connected or configured.');
    return false;
  }

  try {
    const { ref, set } = await _getDbModule();
    console.log('[Firebase] Force syncing all dataset nodes and hotspots to RTDB...');
    const remoteNodes = {};
    const images = {};
    for (const [id, node] of Object.entries(CAMPUS_DATASET.nodes)) {
      const { remote, imageData } = splitNodeForRemote(node);
      remoteNodes[id] = remote;
      if (imageData) images[id] = imageData;
    }
    await set(ref(_db, `${RTDB_ROOT}/nodes`), remoteNodes);
    if (Object.keys(images).length > 0) {
      await set(ref(_db, `${RTDB_ROOT}/images`), images);
    }
    console.log('[Firebase] ✅ Sync all complete.');
    return true;
  } catch (err) {
    console.error('[Firebase] Force sync error:', err);
    return false;
  }
}

/**
 * Subscribe to real-time node updates from RTDB.
 * Calls `callback(nodes)` immediately with current data, then on every change.
 * @param {Function} callback — receives the full nodes object
 * @returns {Function} unsubscribe function
 */
export async function subscribeToNodes(callback) {
  if (!_isConfigured || !_db) {
    // Offline mode — call once with static data
    callback(CAMPUS_DATASET.nodes);
    return () => {};
  }

  const { ref, onValue } = await _getDbModule();
  const nodesRef = ref(_db, `${RTDB_ROOT}/nodes`);

  const unsubscribe = onValue(nodesRef, (snapshot) => {
    if (snapshot.exists()) {
      const nodes = snapshot.val();
      console.log('[Firebase] 🔄 Nodes updated from RTDB');
      callback(nodes);
    }
  }, (err) => {
    console.error('[Firebase] onValue error:', err);
    callback(CAMPUS_DATASET.nodes); // fallback
  });

  return unsubscribe;
}

/**
 * Write a full node object to RTDB (create or overwrite).
 * Instant path: big panorama bytes go to `campus/images/{id}` ONLY when the
 * photo changed; the small metadata write to `campus/nodes/{id}` is what all
 * clients subscribe to, so hotspot/text edits publish in milliseconds.
 * The local CAMPUS_DATASET copy keeps the inline image for instant rendering.
 * @param {string} nodeId
 * @param {Object} nodeData
 */
export async function pushNodeUpdate(nodeId, nodeData) {
  // Stamp photo revision locally so echo-diffing can match (see app.js)
  if (typeof nodeData?.customImage === 'string' && nodeData.customImage.startsWith('data:')) {
    nodeData.photo = true;
    nodeData.photoRev = Date.now();
  }
  CAMPUS_DATASET.nodes[nodeId] = nodeData;
  if (!_isConfigured || !_db) return;

  try {
    const { remote, imageData } = splitNodeForRemote(nodeData);
    // Keep local rev in sync with what we publish
    if (imageData && remote.photoRev) nodeData.photoRev = remote.photoRev;
    const { ref, set } = await _getDbModule();
    // Image bytes FIRST so subscribers never see a photoRev without bytes ready
    if (imageData) {
      await set(ref(_db, `${RTDB_ROOT}/images/${nodeId}`), imageData);
    }
    const nodeRef = ref(_db, `${RTDB_ROOT}/nodes/${nodeId}`);
    await set(nodeRef, remote);
    console.log(`[Firebase] ✅ Node saved: ${nodeId}`);
  } catch (err) {
    console.error(`[Firebase] Error saving node ${nodeId}:`, err);
  }
}

/**
 * One-time fetch of a node's uploaded panorama bytes from `campus/images`.
 * Returns null when offline, missing, or on error. Callers should fall back
 * to IndexedDB cache / procedural panoramas.
 * @param {string} nodeId
 * @returns {Promise<string|null>} data URL or null
 */
export async function getNodeImage(nodeId) {
  if (!_isConfigured || !_db || !nodeId) return null;
  try {
    const { ref, get } = await _getDbModule();
    const snap = await get(ref(_db, `${RTDB_ROOT}/images/${nodeId}`));
    return snap.exists() ? snap.val() : null;
  } catch (err) {
    console.warn(`[Firebase] Could not fetch image for ${nodeId}:`, err);
    return null;
  }
}

/**
 * Add a new hotspot to an existing node's hotspots array.
 * @param {string} nodeId
 * @param {Object} hotspot — { targetNodeId, pitch, yaw, text }
 */
export async function pushHotspotAdd(nodeId, hotspot) {
  const node = CAMPUS_DATASET.nodes[nodeId];
  if (!node) return;
  if (!node.hotspots) node.hotspots = [];
  if (hotspot && !node.hotspots.includes(hotspot)) node.hotspots.push(hotspot);
  
  if (!_isConfigured || !_db) return;

  try {
    const { ref, set } = await _getDbModule();
    const hsRef = ref(_db, `${RTDB_ROOT}/nodes/${nodeId}/hotspots`);
    await set(hsRef, node.hotspots);
    console.log(`[Firebase] ✅ Hotspot added to ${nodeId}`);
  } catch (err) {
    console.error(`[Firebase] Error adding hotspot to ${nodeId}:`, err);
  }
}

/**
 * Delete a hotspot from a node by index.
 * @param {string} nodeId
 * @param {number} hotspotIndex
 */
export async function removeHotspot(nodeId, hotspotIndex) {
  const node = CAMPUS_DATASET.nodes[nodeId];
  if (!_isConfigured || !_db || !node) return;

  try {
    const { ref, set } = await _getDbModule();
    const hsRef = ref(_db, `${RTDB_ROOT}/nodes/${nodeId}/hotspots`);
    await set(hsRef, node.hotspots || []);
    console.log(`[Firebase] ✅ Hotspots synced for ${nodeId}`);
  } catch (err) {
    console.error(`[Firebase] Error syncing hotspots:`, err);
  }
}

/**
 * Delete an entire node from RTDB.
 * @param {string} nodeId
 */
export async function deleteNode(nodeId) {
  delete CAMPUS_DATASET.nodes[nodeId];
  if (!_isConfigured || !_db) return;

  try {
    const { ref, remove } = await _getDbModule();
    const nodeRef = ref(_db, `${RTDB_ROOT}/nodes/${nodeId}`);
    await remove(nodeRef);
    console.log(`[Firebase] 🗑 Node deleted: ${nodeId}`);
  } catch (err) {
    console.error(`[Firebase] Error deleting node ${nodeId}:`, err);
  }
}

export function isFirebaseConnected() {
  return _isConfigured && _db !== null;
}
