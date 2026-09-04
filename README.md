# Spotiwind

![Spotiwind Banner](public/branding/Spotiwind%20Animation%20Logo.gif)

**Feel the Music, Ride the Wind.**

Spotiwind adalah platform streaming musik yang berfokus pada pengalaman mendengarkan yang mengalir, penemuan musik berbasis konteks, dan antarmuka yang bereaksi terhadap audio. Produk ini ditujukan untuk pasar Indonesia terlebih dahulu dan menggabungkan katalog Jamendo dengan katalog lokal Indonesia yang dikurasi.

## Status Project

Repo ini saat ini berisi implementasi web berbasis HTML, CSS, dan JavaScript, termasuk halaman desktop/mobile, aset UI, service Firebase, serta katalog lokal. Dokumen di `docs/` mendefinisikan target arsitektur dan ruang lingkup produk berikutnya; sebagian fitur di dalamnya masih berupa roadmap dan belum seluruhnya tersedia di implementasi saat ini.

Implementasi yang sudah menjadi fondasi meliputi:

- Halaman web responsif untuk desktop dan mobile
- Service autentikasi, profil, library, favorit, player, pencarian, katalog, aktivitas, notifikasi, dan presence
- Integrasi yang direncanakan dengan Firebase dan Jamendo
- Katalog aset lagu dan artis Indonesia di `public/music/`
- Branding dan logo resmi Spotiwind di `public/branding/`
- Cloud Functions Firebase di `database/`

## Produk yang Direncanakan

MVP Spotiwind berfokus pada:

- Registrasi, login, dan onboarding preferensi musik
- Home feed dengan shelf personal
- Pemutaran on-demand dengan queue, seek, shuffle, repeat, dan mini-player persisten
- Pencarian track, artis, album, dan playlist
- Library untuk lagu yang disukai, album tersimpan, artis yang diikuti, dan playlist pengguna
- Playlist publik, privat, atau unlisted
- WindFlow Radio, yaitu pemutaran berkelanjutan dari track, artis, atau mood tertentu
- Profil artis untuk katalog lokal
- Katalog Jamendo non-komersial dan katalog lokal Indonesia

Fitur seperti offline listening, Tailwind Playlists, social layer, Artist Dashboard, Gust Mode, Windsock, Wind Rewind, dan Windmap berada di fase lanjutan. Monetisasi juga belum aktif; penggunaan katalog Jamendo harus tetap mematuhi lisensi non-komersialnya.

## Identitas dan Prinsip Desain

Spotiwind menggunakan canvas hitam dengan **Windstream gradient** sebagai aksen bermakna:

```css
linear-gradient(135deg, #FF2D78 0%, #9B4DFF 35%, #4C6EF5 65%, #1FE8C4 100%)
```

Prinsip utamanya adalah gerakan yang halus, warna yang tidak berlebihan, dan UI yang terasa merespons musik. Player Bar adalah signature element: progress, border, glow, dan transisi audio mengarahkan perhatian utama ke musik yang sedang berjalan. Detail token warna, tipografi Sora/Inter, spacing, motion, accessibility, dan komponen ada di [DESIGN.md](docs/DESIGN.md).

## Arsitektur Teknologi

- **Web saat ini:** HTML, CSS, dan JavaScript modular
- **Target frontend:** Next.js, React, dan TypeScript
- **Styling target:** Tailwind CSS dengan design tokens dari [DESIGN.md](docs/DESIGN.md)
- **State target:** Zustand untuk player/queue dan listener real-time Firestore untuk server state
- **Backend platform:** Firebase Authentication, Cloud Firestore, Cloud Functions, dan Firebase Storage
- **Katalog internasional:** Jamendo API, dipanggil langsung dari client pada fase ini
- **Hosting target:** Vercel atau Firebase Hosting
- **Testing target:** Vitest, React Testing Library, Firebase Local Emulator Suite, dan Playwright

Firestore menjadi sumber data utama, bukan Firebase Realtime Database. Model data menggunakan koleksi seperti `users`, `tracks`, `artists`, `albums`, `genres`, `playlists`, `jamendoCache`, dan `windsockTrending`. Katalog lokal menyimpan audio dan gambar di Firebase Storage; komponen Storage ini menggunakan Blaze dan harus dipantau dengan Budget Alert. Rincian schema dan Security Rules ada di [DATABASE.md](docs/DATABASE.md).

## Struktur Repository

```text
.
├── index.html                   # Router redirect otomatis berdasarkan ukuran layar
├── public/                      # Branding, gambar, audio, dan manifest katalog
│   ├── branding/                # Logo resmi, banner, dan ikon aplikasi
│   ├── data/                    # Manifest katalog JSON (artists.json, songs.json, albums.json)
│   └── music/                   # Folder katalog musik & foto artis lokal
├── src/
│   ├── assets/                  # CSS & JS modular
│   ├── components/              # Modals, sheets, players
│   ├── core/                    # Core engine, audio, router & page loader
│   ├── pages/                   # Halaman aplikasi (home-desktop.html, home-mobile.html, dll)
│   └── services/                # Auth, catalog, player, library, dan service lain
├── api/                         # Vercel Serverless Functions (OG Image generator, dll)
├── database/                    # Cloud Functions & Security Rules Firebase
├── docs/                        # Dokumentasi produk dan engineering
└── README.md
```

## Dokumentasi

Kelima dokumen berikut adalah sumber konteks utama project dan sebaiknya dibaca bersama:

| Dokumen | Fungsi |
|---|---|
| [PRD.md](docs/PRD.md) | Apa yang dibangun: visi, persona, requirement, role, scope, monetisasi, risiko, dan roadmap |
| [DESIGN.md](docs/DESIGN.md) | Bagaimana produk terlihat dan terasa: token, komponen, motion, accessibility, dan UX writing |
| [DATABASE.md](docs/DATABASE.md) | Bagaimana data dimodelkan di Firestore, caching Jamendo, Storage, indexes, privacy, dan Security Rules |
| [SKILL.md](docs/SKILL.md) | Bagaimana produk direkayasa: stack target, standar kode, konfigurasi, biaya, testing, security, dan deployment |
| [USER-FLOW.md](docs/USER-FLOW.md) | Bagaimana pengguna bergerak dari onboarding sampai playback, playlist, settings, upload artis, dan edge cases |

Urutan bacaan yang disarankan adalah `PRD.md` untuk scope, `DESIGN.md` untuk UI, `DATABASE.md` untuk data, `USER-FLOW.md` untuk alur, lalu `SKILL.md` sebelum mengubah kode.

## Pengembangan Lokal

Untuk mencoba UI saat ini, buka `index.html` (router otomatis) atau langsung ke `src/pages/home-desktop.html` / `src/pages/home-mobile.html` melalui local server. Service Firebase Functions menggunakan Node.js 18 dan memiliki perintah berikut dari folder `database/`:

```bash
npm install
npm run serve
```

Konfigurasi Firebase dan Jamendo yang diperlukan untuk target arsitektur dijelaskan di [SKILL.md](docs/SKILL.md). Jangan menaruh credential privat di repository. Firebase web config dan Jamendo `client_id` boleh berada di client sesuai rancangan, tetapi akses tetap harus dilindungi dengan Firestore dan Storage Security Rules.

## Konvensi Kontribusi

- Gunakan TypeScript strict mode pada target frontend baru.
- Ikuti token dan komponen dari `DESIGN.md`; jangan membuat warna atau spacing baru tanpa alasan.
- Ikuti bentuk koleksi dan field di `DATABASE.md`.
- Perubahan Firestore harus mempertimbangkan Security Rules dan indexes yang terkait.
- Jamendo lookup harus menggunakan strategi cache, bukan request baru pada setiap render.
- Gunakan Conventional Commits seperti `feat:`, `fix:`, `docs:`, dan `test:`.
- Monetisasi tidak boleh diaktifkan sebelum isu lisensi Jamendo dan payment infrastructure diselesaikan.

## Developer

I Wayan Winanda, frontend developer dari Bali, Indonesia.
