'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const express = require('express');

// SQLite bawaan Node.js (tanpa perlu kompilasi / instalasi tambahan)
let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  console.error('\nNode.js Anda terlalu lama untuk fitur SQLite bawaan.');
  console.error('Pasang Node.js versi 22.13 atau lebih baru (pilih versi LTS) dari https://nodejs.org\n');
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const PHOTO_DIR = path.join(DATA_DIR, 'photos');
fs.mkdirSync(PHOTO_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'dokumentasi.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS records (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    hari       INTEGER NOT NULL,
    tanggal    TEXT NOT NULL,
    lokasi     TEXT,
    kejuruan   TEXT,
    pelatihan  TEXT,
    kop1       TEXT,
    kop2       TEXT,
    kop3       TEXT,
    kop4       TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS photos (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    sesi      INTEGER NOT NULL,
    urutan    INTEGER NOT NULL,
    filename  TEXT NOT NULL,
    w         INTEGER,
    h         INTEGER
  );
`);

const FIELDS = ['lokasi', 'kejuruan', 'pelatihan', 'kop1', 'kop2', 'kop3', 'kop4'];
const JPEG_PREFIX = 'data:image/jpeg;base64,';

const httpError = (status, message) => Object.assign(new Error(message), { status });
const str = v => (typeof v === 'string' ? v.trim().slice(0, 300) : '');
const int = v => (Number.isFinite(+v) ? Math.round(+v) : 0);
const removeFile = name => { try { fs.unlinkSync(path.join(PHOTO_DIR, name)); } catch (e) { /* abaikan */ } };

function parseJpeg(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(JPEG_PREFIX)) {
    throw httpError(400, 'Format foto tidak valid (harus JPEG).');
  }
  return Buffer.from(dataUrl.slice(JPEG_PREFIX.length), 'base64');
}

function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}

function saveRecord(id, body) {
  const hari = Number.parseInt(body.hari, 10);
  if (!Number.isInteger(hari) || hari < 1) throw httpError(400, 'Hari ke- tidak valid.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.tanggal || '')) throw httpError(400, 'Tanggal tidak valid.');

  const photos = Array.isArray(body.photos) ? body.photos : [];
  if (photos.length > 6) throw httpError(400, 'Maksimal 6 foto per hari.');
  const perSesi = [0, 0, 0];
  for (const p of photos) {
    if (![0, 1, 2].includes(p.sesi)) throw httpError(400, 'Sesi foto tidak valid.');
    perSesi[p.sesi]++;
  }
  if (perSesi.some(n => n > 2)) throw httpError(400, 'Tiap sesi maksimal 2 foto.');

  const vals = FIELDS.map(f => str(body[f]));
  const newFiles = [];
  const oldFiles = [];

  db.exec('BEGIN');
  try {
    if (id == null) {
      const r = db.prepare(
        `INSERT INTO records (hari, tanggal, ${FIELDS.join(', ')}) VALUES (?, ?, ${FIELDS.map(() => '?').join(', ')})`
      ).run(hari, body.tanggal, ...vals);
      id = Number(r.lastInsertRowid);
    } else {
      const r = db.prepare(
        `UPDATE records SET hari = ?, tanggal = ?, ${FIELDS.map(f => f + ' = ?').join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(hari, body.tanggal, ...vals, id);
      if (r.changes === 0) throw httpError(404, 'Data tidak ditemukan.');
    }

    const existing = db.prepare('SELECT id, filename FROM photos WHERE record_id = ?').all(id);
    const existingIds = new Set(existing.map(e => Number(e.id)));
    const keep = new Set(photos.filter(p => p.id).map(p => Number(p.id)));

    for (const e of existing) {
      if (!keep.has(Number(e.id))) {
        db.prepare('DELETE FROM photos WHERE id = ?').run(e.id);
        oldFiles.push(e.filename);
      }
    }

    photos.forEach((p, i) => {
      if (p.id) {
        if (!existingIds.has(Number(p.id))) throw httpError(400, 'Foto tidak dikenali.');
        db.prepare('UPDATE photos SET sesi = ?, urutan = ? WHERE id = ?').run(p.sesi, i, Number(p.id));
      } else {
        const buf = parseJpeg(p.dataUrl);
        const filename = `${id}_${crypto.randomUUID()}.jpg`;
        fs.writeFileSync(path.join(PHOTO_DIR, filename), buf);
        newFiles.push(filename);
        db.prepare(
          'INSERT INTO photos (record_id, sesi, urutan, filename, w, h) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(id, p.sesi, i, filename, int(p.w), int(p.h));
      }
    });

    // Isian terakhir dijadikan nilai bawaan untuk dokumentasi berikutnya
    FIELDS.forEach((f, i) => setSetting(f, vals[i]));

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    newFiles.forEach(removeFile);
    throw err;
  }
  oldFiles.forEach(removeFile);
  return id;
}

function getRecord(id) {
  const rec = db.prepare('SELECT * FROM records WHERE id = ?').get(id);
  if (!rec) return null;
  const photos = db.prepare(
    'SELECT id, sesi, urutan, filename, w, h FROM photos WHERE record_id = ? ORDER BY sesi, urutan'
  ).all(id).map(p => ({
    id: Number(p.id), sesi: Number(p.sesi), urutan: Number(p.urutan),
    w: Number(p.w), h: Number(p.h), url: '/photos/' + p.filename
  }));
  return { ...rec, photos };
}

const app = express();
app.use(express.json({ limit: '80mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/photos', express.static(PHOTO_DIR));

// Pengaturan bawaan + logo
app.get('/api/settings', (req, res) => {
  const out = {};
  db.prepare('SELECT key, value FROM settings').all().forEach(r => { out[r.key] = r.value; });
  res.json(out);
});

app.put('/api/logo', (req, res) => {
  const d = req.body && req.body.dataUrl;
  if (typeof d !== 'string' || !/^data:image\/(jpeg|png);base64,/.test(d)) {
    throw httpError(400, 'Format logo tidak valid.');
  }
  setSetting('logo', d);
  res.json({ ok: true });
});

// Riwayat dokumentasi
app.get('/api/records', (req, res) => {
  const rows = db.prepare(`
    SELECT r.id, r.hari, r.tanggal, r.pelatihan,
           (SELECT COUNT(*) FROM photos p WHERE p.record_id = r.id) AS jumlah_foto
    FROM records r ORDER BY r.hari, r.tanggal
  `).all().map(r => ({ ...r, id: Number(r.id), hari: Number(r.hari), jumlah_foto: Number(r.jumlah_foto) }));
  res.json(rows);
});

app.get('/api/records/:id', (req, res) => {
  const rec = getRecord(Number(req.params.id));
  if (!rec) throw httpError(404, 'Data tidak ditemukan.');
  res.json(rec);
});

app.post('/api/records', (req, res) => {
  const id = saveRecord(null, req.body || {});
  res.status(201).json({ id });
});

app.put('/api/records/:id', (req, res) => {
  const id = saveRecord(Number(req.params.id), req.body || {});
  res.json({ id });
});

app.delete('/api/records/:id', (req, res) => {
  const id = Number(req.params.id);
  const files = db.prepare('SELECT filename FROM photos WHERE record_id = ?').all(id);
  const r = db.prepare('DELETE FROM records WHERE id = ?').run(id);
  if (r.changes === 0) throw httpError(404, 'Data tidak ditemukan.');
  files.forEach(f => removeFile(f.filename));
  res.json({ ok: true });
});

// Penanganan error
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Terjadi kesalahan pada server.' : err.message });
});

// Mode biasa: hanya bisa diakses dari komputer ini.
// Mode jaringan (node server.js --jaringan): bisa diakses dari laptop lain di Wi-Fi/jaringan yang sama.
const NETWORK_MODE = process.argv.includes('--jaringan');
const HOST = NETWORK_MODE ? '0.0.0.0' : '127.0.0.1';

app.listen(PORT, HOST, () => {
  console.log(`\nAplikasi berjalan. Buka di komputer ini: http://localhost:${PORT}`);
  if (NETWORK_MODE) {
    for (const list of Object.values(os.networkInterfaces())) {
      for (const n of list || []) {
        if (n.family === 'IPv4' && !n.internal) {
          console.log(`Dari laptop lain (satu Wi-Fi): http://${n.address}:${PORT}`);
        }
      }
    }
    console.log('Perhatian: aplikasi tidak memakai kata sandi. Gunakan hanya di jaringan yang Anda percaya.');
  }
  console.log(`Data tersimpan di folder: ${DATA_DIR}\n`);
});
