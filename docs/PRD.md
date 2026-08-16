Product Requirements Document (PRD): Spotiwind
Versi: 1.0 Tanggal: 23 Mei 2024 Penulis: Gemini Code Assist (berdasarkan kode dan dokumentasi proyek) Status: Draft

1. Pendahuluan & Visi Produk
1.1. Ringkasan Proyek Spotiwind adalah sebuah platform streaming musik modern yang dirancang untuk memberikan pengalaman mendengarkan yang premium, nyaman, dan visual yang menarik. Dengan filosofi "Feel The Music, Ride The Wind", Spotiwind bertujuan menggabungkan kreativitas, teknologi, dan pengalaman pengguna yang intuitif dalam satu identitas yang unik.

1.2. Masalah yang Diselesaikan Banyak platform musik yang ada terasa generik atau kurang memiliki identitas visual yang kuat. Spotiwind hadir sebagai konsep untuk menjawab kebutuhan akan sebuah platform yang tidak hanya fungsional tetapi juga memiliki estetika desain yang khas (dark mode premium dengan gradien neon) dan antarmuka yang responsif di semua perangkat.

1.3. Tujuan & Sasaran Berdasarkan README.md, tujuan utama pengembangan proyek ini adalah:

Portofolio: Menjadi karya portofolio Frontend Development yang menunjukkan keahlian dalam HTML, CSS, JavaScript, dan integrasi dengan layanan backend (Firebase).
Eksplorasi Desain: Sebagai ajang eksplorasi desain UI/UX modern dan implementasinya.
Latihan Teknis: Melatih kemampuan dalam membangun Responsive Web Design dan mengelola state aplikasi yang kompleks (seperti pemutar musik dan autentikasi).
Konsep Produk: Menyajikan sebuah konsep platform streaming musik yang fungsional dan menarik secara visual.
2. Target Pengguna
Pengguna Utama: Penggemar musik yang menghargai estetika desain modern dan menginginkan pengalaman mendengarkan yang mulus di berbagai perangkat (desktop dan mobile).
Pengguna Sekunder: Perekrut atau manajer teknis yang mengevaluasi kemampuan developer dalam membangun aplikasi web frontend yang kompleks dan terstruktur dengan baik.
3. Fitur & Persyaratan
Berikut adalah rincian fitur yang diidentifikasi dari kode dan dokumentasi, dipecah menjadi beberapa bagian utama (Epic).

Epic 1: Autentikasi & Manajemen Pengguna
Tujuan: Memberikan alur yang aman dan mudah bagi pengguna untuk masuk, mendaftar, dan mengelola identitas mereka.

ID	User Story	Persyaratan Fungsional	Status
1.1	Sebagai pengguna baru, saya ingin bisa mendaftar menggunakan email dan password.	- Form registrasi dengan input: Nama, Email, Password, Konfirmasi Password.- Validasi input (email valid, password cocok).- Terintegrasi dengan createUserWithEmailAndPassword Firebase.	✅ Selesai
1.2	Sebagai pengguna terdaftar, saya ingin bisa masuk ke akun saya.	- Form login dengan input: Email, Password.- Opsi "Remember me" untuk persistensi sesi (browserLocalPersistence).- Terintegrasi dengan signInWithEmailAndPassword Firebase.	✅ Selesai
1.3	Sebagai pengguna, saya ingin bisa masuk menggunakan akun sosial (Google, Facebook, Apple).	- Tombol login untuk setiap provider sosial.- Terintegrasi dengan signInWithPopup Firebase.	✅ Selesai
1.4	Saat mendaftar, profil saya harus dibuat secara otomatis di database.	- Menggunakan Firebase Function (onCreate trigger) untuk membuat dokumen user di Firestore.- Dokumen berisi: email, displayName, photoURL (default dari UI Avatars jika tidak ada), createdAt, isPremium: false.	✅ Selesai
1.5	Sebagai pengguna, saya ingin status online saya terlihat dan saya bisa melihat status teman.	- Menggunakan Firebase Realtime Database untuk melacak status online/offline pengguna.- Status diperbarui saat tab aktif/tidak aktif atau koneksi terputus.	✅ Selesai
1.6	Sebagai pengguna, saya ingin bisa keluar (logout) dari akun saya.	- Tombol logout yang memanggil signOut dari Firebase.- Pengguna diarahkan kembali ke halaman login.	✅ Selesai
Epic 2: Penemuan & Pencarian Musik
Tujuan: Memudahkan pengguna menemukan musik baru atau yang sudah mereka ketahui.

ID	User Story	Persyaratan Fungsional	Status
2.1	Sebagai pengguna, saya ingin mencari lagu, artis, dan album.	- Input pencarian di header (desktop & mobile).- Menampilkan dropdown hasil pencarian secara real-time saat mengetik.- Hasil pencarian mencakup lagu dan artis, dibedakan secara visual.- Terintegrasi dengan Jamendo API dan data lagu lokal.	✅ Selesai
2.2	Sebagai pengguna, saya ingin melihat lagu-lagu yang sedang populer.	- Menampilkan grid lagu "Popular Right Now".- Data diambil dari Jamendo API (order=popularity_total).- Menampilkan skeleton loader saat data sedang dimuat.	✅ Selesai
2.3	Sebagai pengguna, saya ingin melihat artis-artis teratas.	- Menampilkan grid "Top Artists".- Data diambil dari Jamendo API.- Menampilkan skeleton loader saat data sedang dimuat.	✅ Selesai
2.4	Sebagai pengguna, saya ingin menelusuri musik berdasarkan mood (Chill, Focus, dll.).	- Menampilkan grid kategori "Browse By Mood".- Setiap kartu mood memiliki ikon dan warna yang unik.	✅ Selesai
2.5	Sebagai pengguna, saya ingin melihat halaman detail seorang artis.	- Saat mengklik kartu artis, aplikasi menavigasi ke halaman detail artis.- Halaman menampilkan foto hero artis dengan efek parallax, nama, dan daftar lagu populer.- Fungsionalitas ini sudah ada di versi mobile.	✅ Selesai
Epic 3: Pemutar Musik (Player)
Tujuan: Menyediakan kontrol pemutaran musik yang persisten dan kaya fitur.

ID	User Story	Persyaratan Fungsional	Status
3.1	Sebagai pengguna, saya ingin kontrol pemutar musik selalu terlihat.	- Terdapat bottom player bar di desktop.- Terdapat mini player bar dan full-screen player di mobile.- Player bar hanya muncul setelah lagu pertama dimainkan.	✅ Selesai
3.2	Sebagai pengguna, saya ingin bisa memutar, menjeda, dan melanjutkan lagu.	- Tombol Play/Pause di semua antarmuka player (kartu lagu, player bar, dll).- Ikon tombol berubah sesuai status (play/pause).- Status pemutaran disinkronkan di semua UI.	✅ Selesai
3.3	Sebagai pengguna, saya ingin bisa pindah ke lagu selanjutnya atau sebelumnya.	- Tombol Next/Previous di player.- Logika playNext() dan playPrevious() mengelola antrian lagu saat ini.	✅ Selesai
3.4	Sebagai pengguna, saya ingin bisa mengacak (shuffle) dan mengulang (repeat) playlist.	- Tombol Shuffle dan Repeat di player.- Status aktif/non-aktif ditandai secara visual.- Logika isShuffle dan isRepeat mengontrol perilaku onended dari audio.	✅ Selesai
3.5	Sebagai pengguna, saya ingin melihat progres lagu dan bisa melompat ke waktu tertentu.	- Terdapat progress bar yang menunjukkan durasi dan waktu saat ini.- Pengguna dapat mengklik atau menyeret progress bar untuk mencari (seek).	✅ Selesai
3.6	Sebagai pengguna, saya ingin melihat antrian lagu "Up Next".	- Di full-screen player mobile, terdapat daftar lagu yang akan diputar selanjutnya.- Daftar ini diperbarui secara dinamis berdasarkan playlist saat ini (termasuk saat shuffle).	✅ Selesai
Epic 4: Personalisasi & Perpustakaan (Library)
Tujuan: Memungkinkan pengguna untuk menyimpan dan mengorganisir musik favorit mereka.

ID	User Story	Persyaratan Fungsional	Status
4.1	Sebagai pengguna, saya ingin bisa menyukai (like) sebuah lagu.	- Tombol "Like" (hati) di samping lagu yang sedang diputar.- Saat diklik, lagu disimpan ke sub-koleksi liked_songs di Firestore.- Status "liked" disinkronkan di semua UI dan persisten.	✅ Selesai
4.2	Sebagai pengguna, saya ingin bisa membuat playlist baru.	- Tombol "Create Playlist" di sidebar kiri (desktop).- (Fungsionalitas penuh belum terimplementasi di kode).	⏳ Sebagian
4.3	Sebagai pengguna, saya ingin melihat semua lagu yang saya sukai dan playlist saya.	- Terdapat menu "Library" di navigasi.- (Halaman detail Library belum terimplementasi di kode).	⏳ Sebagian
4. Desain & Pengalaman Pengguna (UX)
Tampilan: Mengusung tema dark mode premium dengan kombinasi warna gradien neon (ungu, pink, biru).
Tipografi: Menggunakan font 'Poppins' untuk nuansa modern dan keterbacaan yang baik.
Responsivitas: Antarmuka harus beradaptasi dengan mulus untuk tiga ukuran layar utama: desktop, tablet, dan mobile. Kode sudah memisahkan desktop.html dan mobile.html untuk menangani ini.
Animasi: Transisi antar halaman dan interaksi mikro (seperti klik tombol) harus terasa halus dan responsif untuk meningkatkan pengalaman pengguna. Efek shimmer pada skeleton loader dan fade-in pada konten adalah contoh yang sudah ada.
Aksesibilitas: Penggunaan atribut aria-label, role, dan title pada elemen interaktif untuk membantu pengguna dengan teknologi asistif.
5. Persyaratan Non-Fungsional
Performa: Aplikasi harus memuat dengan cepat. Lazy loading atau pemuatan progresif untuk gambar dan daftar lagu harus diimplementasikan untuk mencegah waktu tunggu yang lama. Skeleton loader sudah digunakan untuk tujuan ini.
Keamanan: Kunci API dan konfigurasi Firebase tidak boleh diekspos secara mentah di repositori publik.
Catatan: Saat ini, firebase-config.js berisi apiKey yang terlihat. Untuk produksi, ini harus dipindahkan ke environment variables.
Skalabilitas: Penggunaan Firebase (Firestore, RTDB, Functions) menyediakan fondasi yang dapat diskalakan jika proyek ini berkembang menjadi lebih dari sekadar portofolio.
Teknologi:
Frontend: HTML5, CSS3, JavaScript (ES6 Modules, Vanilla JS).
Backend: Firebase (Authentication, Firestore, Realtime Database, Functions).
API Pihak Ketiga: Jamendo API untuk data musik dan streaming.
6. Rencana Rilis & Masa Depan (Out of Scope untuk v1.0)
Fitur Playlist Penuh: Implementasi penuh untuk membuat, menambah lagu, dan mengedit playlist.
Halaman Library: Halaman khusus untuk melihat semua lagu yang disukai, playlist, dan artis yang diikuti.
Sistem Notifikasi: Halaman notifikasi yang lebih interaktif (misalnya, notifikasi untuk rilis baru dari artis yang diikuti).
Halaman Profil Pengguna: Halaman di mana pengguna dapat mengedit profil mereka dan melihat statistik pendengaran.
Dukungan Tablet: Optimasi layout khusus untuk mode tablet.