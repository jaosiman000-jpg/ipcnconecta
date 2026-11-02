// Cria um usuário do Conselho no emulador local para que seja possível entrar e testar o sistema.
// Use depois de `npm run emulators`. Não funciona fora do emulador.
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099'

import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const app = initializeApp({ projectId: 'demo-ipcn' })
const email = 'conselho@example.com'
const password = 'senha-de-teste-123'

const auth = getAuth(app)
const user = await auth.getUserByEmail(email).catch(() => auth.createUser({ email, password, displayName: 'Conselho de Teste', emailVerified: true }))

const now = new Date()
await getFirestore(app).collection('users').doc(user.uid).set({
  uid: user.uid, name: 'Conselho de Teste', email, photo: '', office: 'Conselho', emailVerified: true,
  roles: ['conselho'], requestedRoles: [], status: 'ativo', classIds: [], societyIds: [], createdAt: now, updatedAt: now,
})

console.log(`Usuário de teste pronto: ${email} / ${password}`)
