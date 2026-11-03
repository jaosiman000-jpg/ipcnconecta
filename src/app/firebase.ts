import { getApp, getApps, initializeApp } from 'firebase/app'
import { browserLocalPersistence, browserSessionPersistence, connectAuthEmulator, getAuth, setPersistence } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore, initializeFirestore } from 'firebase/firestore'
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
// A detecção automática de long polling evita conexões presas em redes de celular ou proxies que bloqueiam o canal em tempo real.
function createFirestore() {
  if (!app) return null
  try {
    return initializeFirestore(app, { experimentalAutoDetectLongPolling: true })
  } catch {
    return getFirestore(app)
  }
}

export const firestore = createFirestore()
export const firebaseStorage = app ? getStorage(app) : null

// `npm run dev:emulator` usa um projeto de demonstração local, sem tocar nos dados reais.
if (import.meta.env.VITE_USE_EMULATORS === 'true' && firebaseAuth && firestore && !(firebaseAuth as { emulatorConfig?: unknown }).emulatorConfig) {
  connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080)
}

export function configureAuthPersistence(remember: boolean) {
  return firebaseAuth
    ? setPersistence(firebaseAuth, remember ? browserLocalPersistence : browserSessionPersistence)
    : Promise.resolve()
}

if (firebaseAuth) {
  firebaseAuth.languageCode = 'pt-BR'
}
