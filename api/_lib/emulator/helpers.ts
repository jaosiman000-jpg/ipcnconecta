import { Firestore, Timestamp } from '@google-cloud/firestore'
import type { AdminServices } from '../firebaseAdmin.js'
import type { Role } from '../schemas.js'
import type { Actor } from '../security.js'

export const PROJECT_ID = 'demo-ipcn'

export function emulatorHost() {
  const host = process.env.FIRESTORE_EMULATOR_HOST
  if (!host) throw new Error('FIRESTORE_EMULATOR_HOST ausente. Rode os testes com `npm run test:emulator`.')
  return host
}

export function createDb() {
  emulatorHost()
  return new Firestore({ projectId: PROJECT_ID })
}

export async function clearDatabase() {
  const response = await fetch(`http://${emulatorHost()}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' })
  if (!response.ok) throw new Error(`Não foi possível limpar o emulador: ${response.status}`)
}

export function actorFor(roles: Role[], overrides: Partial<Actor> = {}): Actor {
  return { id: 'actor-1', name: 'Pessoa Teste', email: 'actor@example.com', roles, classIds: [], societyIds: [], ...overrides }
}

export async function seedUser(db: Firestore, id: string, data: Record<string, unknown> = {}) {
  await db.collection('users').doc(id).set({
    uid: id,
    name: `Usuário ${id}`,
    email: `${id}@example.com`,
    emailVerified: true,
    roles: [],
    requestedRoles: [],
    status: 'ativo',
    classIds: [],
    societyIds: [],
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...data,
  })
}

interface FakeAuthUser { uid: string; email: string; emailVerified: boolean; displayName?: string }

/** Auth falso em memória; os tokens têm o formato `uid|email|verificado`. */
export function createFakeAuth() {
  const users = new Map<string, FakeAuthUser>()
  let counter = 0
  const notFound = () => Object.assign(new Error('not found'), { code: 'auth/user-not-found' })
  const calls = { deleted: [] as string[], revoked: [] as string[] }
  const hooks: { afterCreate?: (uid: string) => Promise<void>; failRevoke?: boolean } = {}

  const auth = {
    async getUser(uid: string) {
      const user = users.get(uid)
      if (!user) throw notFound()
      return user
    },
    async getUserByEmail(email: string) {
      const user = [...users.values()].find((item) => item.email === email)
      if (!user) throw notFound()
      return user
    },
    async createUser(properties: { email: string; password: string; displayName?: string; emailVerified?: boolean }) {
      if ([...users.values()].some((item) => item.email === properties.email)) {
        throw Object.assign(new Error('exists'), { code: 'auth/email-already-exists' })
      }
      counter += 1
      const user = { uid: `auth-user-${counter}`, email: properties.email, emailVerified: properties.emailVerified ?? false, displayName: properties.displayName }
      users.set(user.uid, user)
      await hooks.afterCreate?.(user.uid)
      return user
    },
    async deleteUser(uid: string) {
      calls.deleted.push(uid)
      users.delete(uid)
    },
    async revokeRefreshTokens(uid: string) {
      if (hooks.failRevoke) throw Object.assign(new Error('revoke failed'), { code: 'auth/internal-error' })
      calls.revoked.push(uid)
    },
    async verifyIdToken(token: string) {
      const [uid, email, verified] = token.split('|')
      if (!uid || !email) throw new Error('invalid token')
      return { uid, email, email_verified: verified === 'true' }
    },
  }
  return { auth: auth as unknown as AdminServices['auth'], users, calls, hooks }
}

export function services(db: Firestore, auth: AdminServices['auth']): AdminServices {
  return { db, auth, app: {} as AdminServices['app'] }
}

export async function expectApiError(promise: Promise<unknown>, code: string, status?: number) {
  const { ApiError } = await import('../security.js')
  const error = await promise.then(() => undefined, (reason: unknown) => reason)
  if (!(error instanceof ApiError)) throw new Error(`Esperava ApiError(${code}), recebeu: ${String(error)}`)
  if (error.code !== code) throw new Error(`Esperava o código ${code}, recebeu ${error.code}`)
  if (status !== undefined && error.status !== status) throw new Error(`Esperava status ${status}, recebeu ${error.status}`)
}
