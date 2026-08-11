/**
 * =================================================================
 * Main Cloud Functions entry point for Spotiwind
 * =================================================================
 * This file acts as a router. It imports functions from other files
 * and exports them so Firebase can deploy them. This helps keep
 * the project organized as it grows.
 *
 * To deploy, use the Firebase CLI: `firebase deploy --only functions`
 */

// Initialize Firebase Admin SDK
const admin = require("firebase-admin");
admin.initializeApp();

// Import and group functions from other files
const userFunctions = require("./src/handlers/users");
// const notificationFunctions = require("./src/handlers/notifications");

// Export all the functions
exports.users = userFunctions;
// exports.notifications = notificationFunctions;