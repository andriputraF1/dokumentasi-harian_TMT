# Pembuat Foto Dokumentasi Pembelajaran Harian (dengan Database)

Aplikasi web lokal untuk membuat PDF foto dokumentasi pembelajaran harian.
Data (isian, logo, foto, sesi) tersimpan di database SQLite pada folder `data/`.

## Persyaratan
- **Node.js versi 22.13 atau lebih baru** (pilih versi LTS dari https://nodejs.org).
  Cek dengan perintah: `node -v`
- Koneksi internet saat membuka halaman (library jsPDF dimuat dari CDN).

## Cara menjalankan (Visual Studio Code)
1. Buka folder `dokumentasi-harian-db` di VS Code (File > Open Folder).
2. Buka terminal: menu **Terminal > New Terminal**.
3. Pasang dependensi (cukup sekali):
   ```
   npm install
   ```
4. Jalankan aplikasi:
   ```
   npm start
   ```
5. Buka di browser: http://localhost:3000
6. Untuk menghentikan, tekan `Ctrl + C` di terminal.

> Pesan "ExperimentalWarning: SQLite is an experimental feature" di terminal itu normal dan tidak berbahaya.

## Cara memakai
1. Isi kop surat, lalu unggah logo (sekali saja).
2. Isi Lokasi, Kejuruan, Pelatihan, Hari ke-, dan Tanggal.
3. Pilih 6 foto: 2 pertama = Pagi, 2 berikutnya = Siang, 2 terakhir = Sore. Sesi dan urutan bisa diubah.
4. Klik **Simpan** untuk menyimpan ke database, **Buat PDF** untuk pratinjau, **Unduh PDF** untuk menyimpan file.
5. Dokumentasi yang tersimpan muncul di **Riwayat tersimpan**. Klik **Buka** untuk mengedit atau mengunduh ulang PDF-nya.
6. Klik **Dokumentasi baru** untuk hari berikutnya. Hari ke- dan tanggal terisi otomatis (hari terakhir + 1).

## Memakai dari laptop lain

**Cara 1 - Pasang di laptop lain (data terpisah per laptop)**
1. Salin folder proyek (tanpa `node_modules` dan `data`) atau ambil dari GitHub dengan `git clone`.
2. Di laptop itu pasang Node.js 22.13+, lalu jalankan `npm install` dan `npm start`.
3. Buka http://localhost:3000. Untuk membawa data lama, salin folder `data/`.

**Cara 2 - Satu laptop sebagai server, laptop lain lewat browser (data terpusat)**
1. Di laptop server, jalankan:
   ```
   npm run start:jaringan
   ```
2. Terminal menampilkan alamat seperti `http://192.168.1.10:3000`.
3. Di laptop lain yang terhubung ke Wi-Fi/jaringan yang sama, buka alamat itu di browser.
4. Jika Windows Firewall bertanya, pilih **Allow** untuk jaringan Private.
5. Laptop server harus tetap menyala dan terminalnya tetap terbuka.

Aplikasi tidak memakai kata sandi, jadi pakai hanya di jaringan yang dipercaya.

## Lokasi data dan cadangan
```
data/
  dokumentasi.db   <- database SQLite
  photos/          <- file foto
```
Untuk mencadangkan atau memindahkan ke komputer lain, salin seluruh folder `data/`.
Aplikasi hanya bisa diakses dari komputer ini (127.0.0.1).

## Struktur proyek
```
dokumentasi-harian-db/
  package.json
  server.js        <- server + database
  public/
    index.html     <- tampilan web
  data/            <- dibuat otomatis saat pertama dijalankan
```
