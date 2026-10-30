import "./firebase-config-runtime.js";

export function getFirebaseConfig(hostname = globalThis.location?.hostname || "") {
  if (typeof globalThis.getAppFirebaseConfig !== "function") {
    throw new Error("No se pudo cargar la configuración de Firebase para este despliegue.");
  }
  return globalThis.getAppFirebaseConfig(hostname);
}

export { initializeApp } from "firebase/app";
export {
  getAuth,
  getIdTokenResult,
  onAuthStateChanged,
  browserLocalPersistence,
  signInAnonymously,
  signInWithEmailAndPassword,
  setPersistence,
  signOut,
} from "firebase/auth";
export {
  collection,
  documentId,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  getFirestore,
  initializeFirestore,
  limit,
  onSnapshot,
  orderBy,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
