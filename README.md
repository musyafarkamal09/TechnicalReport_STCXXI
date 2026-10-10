# Portal Technical Team · Cinema XXI

Website laporan Team Technical bertema Cinema XXI: laporan pengerjaan, pembelian barang, pencatatan meteran air/listrik, beranda pengumuman dan info Advance Ticket Sales, foto multi-upload, unduh ZIP foto, serta ekspor Excel/CSV.

**Arsitektur (gratis, tanpa server sendiri)**

| Bagian | Teknologi |
|---|---|
| Tampilan | File statis (HTML/CSS/JS) di GitHub Pages |
| Data laporan | Google Sheets (satu sheet per kategori) |
| Foto | Google Drive |
| Penghubung | Google Apps Script Web App (`apps-script/Code.gs`) |

Karena data ada di Google Sheets, spreadsheet bisa langsung dibuka, difilter, dan dibuat grafik kapan saja.

## Isi repository

```
index.html
config.js            <- isi URL Web App di sini
assets/style.css
assets/app.js
apps-script/Code.gs  <- ditempel ke Google Apps Script
.nojekyll
```

## Langkah 1 — Siapkan Google Sheets dan Apps Script

1. Buat Google Sheets baru, misalnya **Laporan Technical XXI**.
2. Buka **Extensions > Apps Script** (script harus dibuat dari dalam spreadsheet ini).
3. Hapus kode bawaan, tempel seluruh isi `apps-script/Code.gs`.
4. Ubah baris `KODE_AKSES` menjadi kode rahasia tim (panjang dan sulit ditebak).
5. Pilih fungsi **setup** di menu atas, klik **Run**, lalu setujui izin akses Sheets dan Drive. Ini dilakukan sekali untuk membuat sheet dan folder foto.

## Langkah 2 — Deploy sebagai Web App

1. Klik **Deploy > New deployment**, pilih jenis **Web app**.
2. *Execute as*: **Me**. *Who has access*: **Anyone**.
3. Klik **Deploy**, lalu salin **Web app URL** (berakhiran `/exec`).

Setiap kali Anda mengubah `Code.gs`, buat versi baru lewat **Deploy > Manage deployments > Edit > New version**.

## Langkah 3 — Hubungkan ke website

Buka `config.js` dan ganti isinya:

```js
window.XXI_CONFIG = {
  API_URL: "https://script.google.com/macros/s/XXXXXXXX/exec"
};
```

## Langkah 4 — Unggah ke GitHub dan aktifkan Pages

1. Buat repository baru di GitHub, unggah semua file di atas (termasuk `.nojekyll`).
2. Buka **Settings > Pages**, pada *Build and deployment* pilih **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Tunggu sebentar, website aktif di `https://NAMA-AKUN.github.io/NAMA-REPO/`.

Saat pertama dibuka, setiap anggota tim diminta **nama** dan **kode akses** (disimpan di browser masing-masing).

## Catatan keamanan

- **Jangan** menaruh `KODE_AKSES` di GitHub. Kode itu hanya ada di Apps Script dan di kepala anggota tim.
- Foto di Drive diatur "siapa saja yang memiliki link dapat melihat" agar bisa tampil di website. Link foto sulit ditebak, tetapi siapa pun yang mendapatkan link bisa melihatnya. Jangan unggah foto yang bersifat rahasia.
- Kode akses adalah pengaman sederhana. Untuk kontrol lebih ketat, ganti kode secara berkala dengan mengubah `KODE_AKSES`, menjalankan `setup()` lagi, lalu membuat versi deployment baru.

## Batasan yang perlu diketahui

- Data diperbarui otomatis tiap 30 detik, dan langsung setelah Anda menyimpan.
- Foto dikompres di browser (sisi terpanjang 1280 px) lalu diunggah ke Drive; maksimal 20 foto per laporan.
- Apps Script punya kuota harian (akun Google gratis lebih kecil daripada Workspace). Untuk satu tim teknisi biasanya cukup.
- Bila gambar kecil (thumbnail) dari Drive tidak tampil, buka kembali beberapa saat lagi. Klik foto akan memuat ulang lewat jalur cadangan.
- Mengedit data langsung di Google Sheets boleh, asalkan kolom `id` tidak diubah dan baris tidak dipindah ke sheet lain.

## Menjalankan di komputer sendiri

```
python3 -m http.server 8000
```

lalu buka `http://localhost:8000`.

## Kustomisasi cepat

- Daftar studio, satuan, dan titik meter: bagian `CATS` di `assets/app.js`.
- Warna tema: variabel CSS di bagian atas `assets/style.css`.
- Logo XXI dan ilustrasi proyektor adalah SVG di `index.html` (`#logo`) dan `assets/app.js` (`PROJ`).
