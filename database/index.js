const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

/**
 * Contoh Cloud Function.
 *
 * Anda dapat menjalankan logika sisi server di sini. Misalnya,
 * - Mengirim notifikasi ketika seorang teman mulai mengikuti Anda.
 * - Membersihkan data lama.
 * - Membuat endpoint API kustom.
 *
 * Untuk deploy, gunakan Firebase CLI: `firebase deploy --only functions`
 */
exports.helloSpotiwind = functions.https.onRequest((request, response) => {
  functions.logger.info("Hello Spotiwind logs!", {structuredData: true});
  response.send("Hello from Spotiwind's Backend (Cloud Functions)!");
});