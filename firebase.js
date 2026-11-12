import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import firebaseConfig from "./firebase-config.js";

const isConfigured = Boolean(
  firebaseConfig &&
  typeof firebaseConfig.apiKey === "string" &&
  firebaseConfig.apiKey &&
  !firebaseConfig.apiKey.startsWith("SUA_") &&
  typeof firebaseConfig.projectId === "string" &&
  firebaseConfig.projectId &&
  !firebaseConfig.projectId.startsWith("SEU_")
);

export const firebaseEnabled = isConfigured;
export const app = isConfigured ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

if (auth) {
  setPersistence(auth, browserLocalPersistence).catch(() => {});
}

export {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot
};
