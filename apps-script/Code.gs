/**
 * Backend Portal Technical Team (Google Apps Script)
 * - Data laporan  -> Google Sheets (script ini terikat pada spreadsheet)
 * - Foto          -> Google Drive (folder "Foto Laporan Technical XXI")
 *
 * Cara pakai: lihat README.md. Ubah KODE_AKSES, jalankan setup() sekali,
 * lalu Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).
 */
const KODE_AKSES = 'GANTI-DENGAN-KODE-RAHASIA-TIM';

const SCHEMAS = {
  kerja: { sheet: 'Pengerjaan', cols: ['id','tanggal','lokasi','judul','uraian','teknisi','status','prioritas','photoIds','by','createdAt','updatedAt'] },
  beli: { sheet: 'Pembelian', cols: ['id','tanggal','barang','qty','satuan','harga','total','toko','keperluan','pemohon','status','photoIds','by','createdAt','updatedAt'] },
  meter: { sheet: 'Meteran', cols: ['id','tanggal','waktu','jenis','titik','angka','petugas','catatan','photoIds','by','createdAt','updatedAt'] },
  announcements: { sheet: 'Pengumuman', cols: ['id','judul','tag','tanggal','isi','tampil','createdAt'] },
  ats: { sheet: 'ATS', cols: ['id','film','format','buka','jam','tayang','catatan','createdAt'] }
};
const NUM = ['qty','harga','total','angka','createdAt','updatedAt'];
const TXT = ['id','tanggal','waktu','buka','jam','tayang','photoIds','by'];
const BOOL = ['tampil'];
const FOLDER_NAMES = { kerja: 'Pengerjaan', beli: 'Pembelian', meter: 'Meteran' };

function props_() { return PropertiesService.getScriptProperties(); }

/** Jalankan SEKALI dari editor: menyimpan kode akses, membuat sheet dan folder Drive. */
function setup() {
  if (!KODE_AKSES || KODE_AKSES.indexOf('GANTI') === 0) throw new Error('Ubah KODE_AKSES terlebih dahulu.');
  props_().setProperty('ACCESS_CODE', KODE_AKSES);
  Object.keys(SCHEMAS).forEach(sheet_);
  ['kerja','beli','meter'].forEach(folder_);
  Logger.log('Setup selesai. Lanjutkan ke Deploy > New deployment > Web app.');
}

function doGet() {
  return ContentService.createTextOutput('API Portal Technical Team aktif.');
}

function doPost(e) {
  let out;
  try {
    const req = JSON.parse(e.postData.contents);
    const code = props_().getProperty('ACCESS_CODE');
    if (!code || req.key !== code) throw new Error('unauthorized');
    const readOnly = req.action === 'list' || req.action === 'photoGet';
    if (readOnly) {
      out = handle_(req);
    } else {
      const lock = LockService.getScriptLock();
      lock.waitLock(25000);
      try { out = handle_(req); } finally { lock.releaseLock(); }
    }
    out.ok = true;
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function handle_(req) {
  switch (req.action) {
    case 'list': return list_();
    case 'put': return put_(req);
    case 'del': return del_(req);
    case 'photoUp': return photoUp_(req);
    case 'photoGet': return photoGet_(req);
    case 'photoDel': return photoDel_(req);
    default: throw new Error('bad_action');
  }
}

/* ---------- sheets ---------- */
function sheet_(key) {
  const d = SCHEMAS[key];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(d.sheet);
  if (!sh) {
    sh = ss.insertSheet(d.sheet);
    sh.getRange(1, 1, 1, d.cols.length).setValues([d.cols]).setFontWeight('bold').setBackground('#1c1a15').setFontColor('#f0cd7a');
    sh.setFrozenRows(1);
    d.cols.forEach(function (c, i) {
      if (TXT.indexOf(c) >= 0) sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@');
    });
  }
  return sh;
}

function cast_(c, v) {
  if (v instanceof Date) {
    v = Utilities.formatDate(v, Session.getScriptTimeZone(), (c === 'waktu' || c === 'jam') ? 'HH:mm' : 'yyyy-MM-dd');
  }
  if (NUM.indexOf(c) >= 0) return v === '' || v === null ? null : Number(v);
  if (BOOL.indexOf(c) >= 0) return !(v === false || String(v).toUpperCase() === 'FALSE');
  if (c === 'photoIds') return v ? String(v).split(',').filter(Boolean) : [];
  return v === null || v === undefined ? '' : v;
}

function readAll_(key) {
  const d = SCHEMAS[key];
  const sh = sheet_(key);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const vals = sh.getRange(2, 1, last - 1, d.cols.length).getValues();
  return vals.filter(function (r) { return r[0] !== ''; }).map(function (r) {
    const o = {};
    d.cols.forEach(function (c, i) { o[c] = cast_(c, r[i]); });
    if (key === 'kerja' || key === 'beli' || key === 'meter') o.cat = key;
    o.id = String(o.id);
    return o;
  });
}

function list_() {
  const reports = [].concat(readAll_('kerja'), readAll_('beli'), readAll_('meter'));
  return {
    reports: reports,
    ann: readAll_('announcements'),
    ats: readAll_('ats'),
    note: props_().getProperty('ATS_NOTE') || ''
  };
}

function findRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function safe_(v) {
  if (typeof v === 'string' && v.charAt(0) === '=') return "'" + v; // cegah formula injection
  return v;
}

function put_(req) {
  if (req.col === 'settings') {
    props_().setProperty('ATS_NOTE', String((req.data && req.data.note) || '').slice(0, 8000));
    return {};
  }
  const key = req.col === 'reports' ? (req.data && req.data.cat) : req.col;
  const d = SCHEMAS[key];
  if (!d) throw new Error('bad_col');
  const sh = sheet_(key);
  const row = d.cols.map(function (c) {
    let v = req.data[c];
    if (c === 'photoIds') v = (v || []).join(',');
    if (v === null || v === undefined) v = '';
    return safe_(v);
  });
  row[0] = String(req.id);
  let r = findRow_(sh, req.id);
  if (r < 0) r = Math.max(sh.getLastRow(), 1) + 1;
  sh.getRange(r, 1, 1, row.length).setValues([row]);
  return {};
}

function del_(req) {
  const key = req.col === 'reports' ? req.cat : req.col;
  if (!SCHEMAS[key]) throw new Error('bad_col');
  const sh = sheet_(key);
  const r = findRow_(sh, req.id);
  if (r > 0) sh.deleteRow(r);
  return {};
}

/* ---------- foto (Google Drive) ---------- */
function folder_(cat) {
  const p = props_();
  let root = null;
  const rid = p.getProperty('ROOT_FOLDER');
  if (rid) { try { root = DriveApp.getFolderById(rid); } catch (e) { root = null; } }
  if (!root) {
    root = DriveApp.createFolder('Foto Laporan Technical XXI');
    p.setProperty('ROOT_FOLDER', root.getId());
  }
  const name = FOLDER_NAMES[cat] || 'Lainnya';
  const it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

function photoUp_(req) {
  if (!/^data:image\/jpeg;base64,/.test(req.data || '')) throw new Error('bad_image');
  const bytes = Utilities.base64Decode(req.data.split(',')[1]);
  const blob = Utilities.newBlob(bytes, 'image/jpeg', String(req.reportId || 'x') + '_' + Date.now() + '.jpg');
  const f = folder_(req.cat).createFile(blob);
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { id: f.getId() };
}

function inRoot_(file) {
  const rid = props_().getProperty('ROOT_FOLDER');
  const parents = file.getParents();
  while (parents.hasNext()) {
    const p = parents.next();
    const gp = p.getParents();
    if (p.getId() === rid || (gp.hasNext() && gp.next().getId() === rid)) return true;
  }
  return false;
}

function photoGet_(req) {
  const f = DriveApp.getFileById(req.id);
  if (!inRoot_(f)) throw new Error('forbidden');
  return { data: 'data:image/jpeg;base64,' + Utilities.base64Encode(f.getBlob().getBytes()) };
}

function photoDel_(req) {
  const f = DriveApp.getFileById(req.id);
  if (!inRoot_(f)) throw new Error('forbidden');
  f.setTrashed(true);
  return {};
}
