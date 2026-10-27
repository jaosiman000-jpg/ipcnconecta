import { getApp, getApps, initializeApp } from 'firebase/app'
import { browserLocalPersistence, browserSessionPersistence, getAuth, setPersistence } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseConfigured = Object.values(firebaseConfig).every(Boolean)

const app = firebaseConfigured ? (getApps().length ? getApp() : initializeApp(firebaseConfig)) : null

export const firebaseAuth = app ? getAuth(app) : null
export const firestore = app ? getFirestore(app) : null
export const firebaseStorage = app ? getStorage(app) : null

export function configureAuthPersistence(remember: boolean) {
  return firebaseAuth
    ? setPersistence(firebaseAuth, remember ? browserLocalPersistence : browserSessionPersistence)
    : Promise.resolve()
}

if (firebaseAuth) {
  firebaseAuth.languageCode = 'pt-BR'
}
