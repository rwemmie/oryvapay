// Intent Records: one per purchase, stored as JSON, with a SHA-256 hash chain over every event.
// Changing any past event breaks every hash after it, so tampering is detectable.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

const file = path.join(config.dataDir, 'records.json');
let db = { records: {} };
try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { fs.mkdirSync(config.dataDir, { recursive: true }); }

function save() {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, file);
}

// Stable JSON (sorted keys) so the hash is reproducible by anyone.
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const GENESIS = '0'.repeat(64);

export function createRecord(data) {
  const id = 'IR-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  db.records[id] = { id, createdAt: new Date().toISOString(), status: 'OPEN', attempts: [], events: [], ...data };
  save();
  return db.records[id];
}

export function getRecord(id) { return db.records[id] || null; }

export function listRecords() {
  return Object.values(db.records).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(r => {
    const last = r.attempts[r.attempts.length - 1];
    return { id: r.id, createdAt: r.createdAt, status: r.status, request: r.request, mode: r.mode,
      attempts: r.attempts.length, total: last?.verification?.order?.total ?? last?.cartTotal ?? null,
      lastVerdict: last?.verification?.verdict || null, headHash: r.events[r.events.length - 1]?.hash || null };
  });
}

export function updateRecord(id, fn) {
  const r = db.records[id];
  if (!r) throw new Error('Record not found');
  fn(r);
  save();
  return r;
}

export function appendEvent(id, type, data) {
  return updateRecord(id, r => {
    const prevHash = r.events.length ? r.events[r.events.length - 1].hash : GENESIS;
    const ev = { seq: r.events.length, type, at: new Date().toISOString(), data, prevHash };
    ev.hash = sha(prevHash + canonical({ seq: ev.seq, type: ev.type, at: ev.at, data: ev.data }));
    r.events.push(ev);
  });
}

export function verifyChain(r) {
  let prev = GENESIS;
  for (const ev of r.events) {
    const h = sha(prev + canonical({ seq: ev.seq, type: ev.type, at: ev.at, data: ev.data }));
    if (ev.prevHash !== prev || ev.hash !== h) return { valid: false, brokenAt: ev.seq };
    prev = h;
  }
  return { valid: true, events: r.events.length, headHash: prev };
}
