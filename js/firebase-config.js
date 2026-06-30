// ════════════════════════════════════════════════════
// TRADEHUB — Firebase Configuration
// ════════════════════════════════════════════════════
// NOTE: This currently points at the same Firebase project used for
// NGL Zone, just for early testing. Tradehub uses its own collections
// (tradehub_products, tradehub_users, tradehub_orders, tradehub_cart)
// so nothing collides with NGL Zone's data (profiles, messages).
//
// When you're ready to separate them for real, create a dedicated
// Tradehub Firebase project and just swap the config values below —
// nothing else in the codebase needs to change.
// ════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, doc, setDoc, getDoc, updateDoc,
  addDoc, query, where, orderBy, limit, getDocs, deleteDoc, serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAew565gWZsGK8CogCbQjeKfDArrOrfKDY",
    authDomain: "tradehub3.firebaseapp.com",
    projectId: "tradehub3",
    storageBucket: "tradehub3.firebasestorage.app",
    messagingSenderId: "244820908009",
    appId: "1:244820908009:web:c8d1066a06f95ec1fa5d78",
};

// ── Cloudinary (for product photos) ──
export const CLOUDINARY_CLOUD_NAME    = "djuzdip8d";
export const CLOUDINARY_UPLOAD_PRESET = "tradehub_uploads";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export {
  collection, doc, setDoc, getDoc, updateDoc,
  addDoc, query, where, orderBy, limit, getDocs, deleteDoc, serverTimestamp,
  runTransaction
};
