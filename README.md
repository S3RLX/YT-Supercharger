# ⚡ YT Supercharger

Ekstensi Chrome (Manifest V3) khusus YouTube dengan kontrol lanjutan. Semua data tersimpan lokal di browser Anda; tidak ada server, tidak ada pelacakan.

## Cara memasang
1. Ekstrak ZIP ini ke sebuah folder.
2. Buka `chrome://extensions` lalu aktifkan **Developer mode** (kanan atas).
3. Klik **Load unpacked** dan pilih folder `yt-supercharger`.
4. Buka/muat ulang tab YouTube. Tombol ⚡ muncul di bar kontrol pemutar (kiri-bawah tombol pengaturan).

## Fitur
| Fitur | Keterangan |
|---|---|
| Kecepatan 0,1× – 16× | Slider skala logaritmik, preset cepat, bisa diingat antar video |
| Loop A–B | Ulangi bagian tertentu; rentang tampil di progress bar |
| Booster volume | Sampai 600% lewat WebAudio |
| Filter video | Kecerahan, kontras, saturasi, rona, sepia, cermin, balik vertikal |
| Screenshot frame | Simpan PNG atau salin ke clipboard (ikut filter) |
| Catatan timestamp | Catatan per video, penanda di progress bar, salin Markdown, ekspor semua dari popup |
| Timer tidur | Jeda otomatis setelah 15 menit – 2 jam |
| Statistik | Waktu nonton & waktu yang dihemat berkat kecepatan, grafik 7 hari |
| Mode bioskop | Redupkan semua di sekitar pemutar |
| Mode bersih | Sembunyikan Shorts, komentar, rekomendasi samping, end cards |
| Otomatisasi | Mode teater otomatis, kualitas favorit, jeda saat tab disembunyikan, klik “Lewati iklan” |
| Lainnya | Picture-in-Picture, lompat per-frame |

## Pintasan keyboard (di halaman video)
| Tombol | Aksi |
|---|---|
| `]` / `[` | Kecepatan naik / turun (langkah bisa diatur di popup) |
| `\` | Reset kecepatan ke 1× |
| `Alt+1` / `Alt+2` / `Alt+3` | Set titik A / set titik B / hapus loop |
| `Alt+S` | Screenshot |
| `Alt+N` | Tambah catatan di waktu saat ini |
| `Alt+P` | Buka/tutup panel |
| `Alt+M` | Cermin video |
| `Alt+L` | Mode bioskop |
| `Alt+I` | Picture-in-Picture |

## Catatan & batasan
- **Iklan**: ekstensi ini *tidak memblokir* iklan. Opsi “Lewati iklan” hanya menekan tombol Lewati saat YouTube menampilkannya.
- **Kualitas favorit** memakai API internal pemutar; YouTube dapat mengabaikannya sewaktu-waktu.
- **Mode bersih & mode bioskop** bergantung pada struktur halaman YouTube. Jika YouTube mengubah desainnya, selector CSS di `content.css` mungkin perlu disesuaikan.
- **Screenshot** bisa gagal pada video yang dilindungi DRM.
- Setelah mengubah/memuat ulang ekstensi, muat ulang tab YouTube yang sudah terbuka.

## Struktur
- `manifest.json`: konfigurasi MV3
- `content.js` / `content.css`: seluruh logika dan UI di halaman YouTube
- `main.js`: jembatan ke API pemutar (world MAIN) untuk kualitas video
- `popup.*`: pengaturan, statistik, ekspor catatan
- `defaults.js`: nilai bawaan bersama
