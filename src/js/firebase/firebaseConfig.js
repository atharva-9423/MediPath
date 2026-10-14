/**
 * CampusWalk AI — Firebase Realtime Database Configuration
 *
 * ============================================================
 *  HOW TO SET UP YOUR FIREBASE PROJECT
 * ============================================================
 *
 *  1. Go to https://console.firebase.google.com/
 *  2. Click "Add project" → give it a name (e.g. "campuswalk-avcoe")
 *  3. Disable Google Analytics (not needed) → Create project
 *  4. In the left sidebar click "Realtime Database" → Create Database
 *     → Start in TEST MODE (you can add security rules later)
 *     → Choose a region close to you (e.g. Asia-Pacific)
 *  5. Go to Project Settings (gear icon) → General → Your apps
 *     → Click "</>" (Web) → Register app → copy the firebaseConfig object
 *  6. Paste the values below replacing each placeholder
 *
 * ============================================================
 */

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAkDJHDTgUqxxCBg-nSukB0uR3ksfW12Yc",
  authDomain: "campuswalk-c69f9.firebaseapp.com",
  databaseURL: "https://campuswalk-c69f9-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "campuswalk-c69f9",
  storageBucket: "campuswalk-c69f9.firebasestorage.app",
  messagingSenderId: "520504888562",
  appId: "1:520504888562:web:ce3a0d6a7bbc18660b546b",
  measurementId: "G-31Q7EXHXRX"
};

/**
 * Admin Panel Password
 * Change this to your preferred admin password.
 */
export const ADMIN_PASSWORD = "avcoe@admin2024";

/**
 * Verify admin password helper
 */
export function verifyAdminPassword(password) {
  return password === ADMIN_PASSWORD;
}

/**
 * RTDB root path — all campus data lives under this key
 */
export const RTDB_ROOT = "campus";
