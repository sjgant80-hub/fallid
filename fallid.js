// FallID · sovereign DID identity spine
// did:key + Ed25519 · Web Crypto native · MIT
// AI-Native Solutions · 2026

const DB_NAME = 'fallid';
const DB_VERSION = 1;
const STORE = 'identity';
const KEY_ID = 'primary';

// Multibase base58btc alphabet (Bitcoin)
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Multicodec Ed25519 public-key prefix: 0xed 0x01 (varint)
const ED25519_PREFIX = new Uint8Array([0xed, 0x01]);

// ---- IndexedDB helpers ----------------------------------------------------

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains('history')) {
        const s = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
        s.createIndex('ts', 'ts');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(store, key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readonly');
    const r = tx.objectStore(store).get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function idbPut(store, value, key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    const s = tx.objectStore(store);
    const r = key !== undefined ? s.put(value, key) : s.put(value);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function idbClear(store) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    const r = tx.objectStore(store).clear();
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

async function idbAll(store) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readonly');
    const r = tx.objectStore(store).getAll();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

// ---- Base58btc encode/decode ----------------------------------------------

function b58encode(bytes) {
  if (bytes.length === 0) return '';
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits = [0];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let out = '';
  for (let i = 0; i < zeros; i++) out += B58[0];
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]];
  return out;
}

function b58decode(str) {
  if (str.length === 0) return new Uint8Array(0);
  let zeros = 0;
  while (zeros < str.length && str[zeros] === B58[0]) zeros++;
  const bytes = [0];
  for (let i = zeros; i < str.length; i++) {
    const val = B58.indexOf(str[i]);
    if (val < 0) throw new Error('Invalid base58 char: ' + str[i]);
    let carry = val;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  const result = new Uint8Array(zeros + bytes.length);
  for (let i = bytes.length - 1, j = zeros; i >= 0; i--, j++) result[j] = bytes[i];
  return result;
}

// ---- Hex helpers ----------------------------------------------------------

export function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex) {
  hex = hex.replace(/\s+/g, '').toLowerCase();
  if (hex.length % 2) throw new Error('odd hex length');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---- did:key encoding -----------------------------------------------------

export function pubkeyToDID(pubkeyBytes) {
  const prefixed = new Uint8Array(ED25519_PREFIX.length + pubkeyBytes.length);
  prefixed.set(ED25519_PREFIX, 0);
  prefixed.set(pubkeyBytes, ED25519_PREFIX.length);
  return 'did:key:z' + b58encode(prefixed);
}

export function didToPubkey(did) {
  if (!did.startsWith('did:key:z')) throw new Error('Not a did:key');
  const decoded = b58decode(did.slice('did:key:z'.length));
  if (decoded.length < 2 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error('Not an Ed25519 did:key (bad multicodec prefix)');
  }
  return decoded.slice(2);
}

// ---- Ed25519 support check ------------------------------------------------

export async function checkEd25519Support() {
  try {
    const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    return !!kp;
  } catch (e) {
    return false;
  }
}

// ---- Core: getOrCreate, sign, verify --------------------------------------

let _cache = null;

export async function getOrCreate() {
  if (_cache) return _cache;
  const stored = await idbGet(STORE, KEY_ID);
  if (stored && stored.pubkeyJwk && stored.privkeyJwk) {
    const pubkey = await crypto.subtle.importKey('jwk', stored.pubkeyJwk, { name: 'Ed25519' }, true, ['verify']);
    const privkey = await crypto.subtle.importKey('jwk', stored.privkeyJwk, { name: 'Ed25519' }, true, ['sign']);
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pubkey));
    _cache = { did: pubkeyToDID(raw), pubkey, privkey, pubkeyBytes: raw, created: stored.created };
    return _cache;
  }
  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pubkeyJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const privkeyJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const created = Date.now();
  await idbPut(STORE, { pubkeyJwk, privkeyJwk, created }, KEY_ID);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  _cache = { did: pubkeyToDID(raw), pubkey: kp.publicKey, privkey: kp.privateKey, pubkeyBytes: raw, created };
  return _cache;
}

export async function getDID() {
  const id = await getOrCreate();
  return id.did;
}

export async function sign(bytes) {
  const id = await getOrCreate();
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  const sig = await crypto.subtle.sign({ name: 'Ed25519' }, id.privkey, data);
  return new Uint8Array(sig);
}

export async function verify(bytes, sig, did) {
  try {
    const pubkeyBytes = didToPubkey(did);
    const pubkey = await crypto.subtle.importKey('raw', pubkeyBytes, { name: 'Ed25519' }, true, ['verify']);
    const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
    const sigBytes = typeof sig === 'string' ? (sig.match(/^[0-9a-f]+$/i) ? hexToBytes(sig) : b64ToBytes(sig)) : sig;
    return await crypto.subtle.verify({ name: 'Ed25519' }, pubkey, sigBytes, data);
  } catch (e) {
    return false;
  }
}

// ---- Encrypted export/import ----------------------------------------------

async function deriveKey(passphrase, salt) {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function exportBackup(passphrase) {
  const stored = await idbGet(STORE, KEY_ID);
  if (!stored) throw new Error('No identity to export');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const payload = new TextEncoder().encode(JSON.stringify(stored));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload));
  return {
    v: 1,
    kind: 'fallid-backup',
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    ct: bytesToB64(ct),
    ts: Date.now()
  };
}

export async function importBackup(blob, passphrase) {
  if (!blob || blob.kind !== 'fallid-backup') throw new Error('Not a FallID backup');
  const salt = b64ToBytes(blob.salt);
  const iv = b64ToBytes(blob.iv);
  const ct = b64ToBytes(blob.ct);
  const key = await deriveKey(passphrase, salt);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  const stored = JSON.parse(new TextDecoder().decode(pt));
  await idbPut(STORE, stored, KEY_ID);
  _cache = null;
  return await getOrCreate();
}

// ---- Reset ---------------------------------------------------------------

export async function resetIdentity() {
  await idbClear(STORE);
  await idbClear('history');
  _cache = null;
  return await getOrCreate();
}

// ---- History (sign log) --------------------------------------------------

export async function logSign(entry) {
  await idbPut('history', { ...entry, ts: Date.now() });
}

export async function getHistory() {
  return await idbAll('history');
}

export async function clearHistory() {
  await idbClear('history');
}

// aliases matching the spec
export { exportBackup as export_, importBackup as import_ };
