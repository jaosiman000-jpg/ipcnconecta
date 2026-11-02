import type { Firestore } from '@google-cloud/firestore'
import { Timestamp } from '@google-cloud/firestore'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { inviteIdFor } from '../invites.js'
import { signupSchema } from '../schemas.js'
import { registerInvitedUser } from '../signup.js'
import { clearDatabase, createDb, createFakeAuth, expectApiError, services } from './helpers.js'

let db: Firestore
let fake: ReturnType<typeof createFakeAuth>

const request = (ip = '203.0.113.7') => new Request('https://ipcnconecta.vercel.app/api/signup', { method: 'POST', headers: { 'x-forwarded-for': ip } })
const signup = (email = 'convidado@example.com') => signupSchema.parse({ name: 'Pessoa Convidada', email, password: 'senha-segura-1', photo: 'data:image/png;base64,AAAA', privacyNotice: true })
const register = (email?: string, ip?: string) => registerInvitedUser(request(ip), signup(email), services(db, fake.auth))

async function seedInvite(email = 'convidado@example.com', data: Record<string, unknown> = {}) {
  const id = inviteIdFor(email)
  await db.collection('invites').doc(id).set({
    id, email, roles: ['professor', 'lider'], status: 'pendente', createdBy: 'admin-1', createdByName: 'Admin',
    createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 86_400_000), ...data,
  })
  return id
}

beforeAll(() => { db = createDb() })
beforeEach(async () => { await clearDatabase(); fake = createFakeAuth() })

describe('cadastro por convite', () => {
  it('cria o login e o perfil pendente a partir do convite e consome o convite', async () => {
    const inviteId = await seedInvite()
    await register()

    const [authUser] = [...fake.users.values()]
    expect(authUser).toMatchObject({ email: 'convidado@example.com', emailVerified: false })
    const profile = (await db.collection('users').doc(authUser.uid).get()).data()
    expect(profile).toMatchObject({
      uid: authUser.uid, email: 'convidado@example.com', status: 'pendente', roles: [], requestedRoles: ['professor', 'lider'],
      emailVerified: false, classIds: [], societyIds: [], privacyNoticeVersion: '2026-10-26',
    })
    expect(profile?.photo).toBe('data:image/png;base64,AAAA')
    expect((await db.collection('invites').doc(inviteId).get()).data()).toMatchObject({ status: 'usado', usedBy: authUser.uid })
    expect((await db.collection('audit').get()).docs.map((entry) => entry.data().action)).toEqual(['convite.utilizado'])
  })

  it('o convidado não escolhe os próprios papéis: valem os do convite', async () => {
    await seedInvite('convidado@example.com', { roles: ['acolhimento'] })
    await register()
    const [profile] = (await db.collection('users').get()).docs
    expect(profile.data().requestedRoles).toEqual(['acolhimento'])
    expect(profile.data().roles).toEqual([])
  })

  it('recusa e-mail sem convite e não cria conta', async () => {
    await expectApiError(register(), 'invite_invalid', 403)
    expect(fake.users.size).toBe(0)
    expect((await db.collection('users').get()).empty).toBe(true)
  })

  it('recusa convite vencido', async () => {
    await seedInvite('convidado@example.com', { expiresAt: Timestamp.fromMillis(Date.now() - 1000) })
    await expectApiError(register(), 'invite_invalid', 403)
    expect(fake.users.size).toBe(0)
  })

  it('recusa convite revogado', async () => {
    await seedInvite('convidado@example.com', { status: 'revogado' })
    await expectApiError(register(), 'invite_invalid', 403)
  })

  it('o convite só pode ser usado uma vez', async () => {
    await seedInvite()
    await register()
    await expectApiError(register(undefined, '203.0.113.8'), 'invite_invalid', 403)
    expect(fake.users.size).toBe(1)
  })

  it('não usa convite de outro e-mail', async () => {
    await seedInvite('outra@example.com')
    await expectApiError(register('convidado@example.com'), 'invite_invalid', 403)
  })

  it('informa quando o e-mail já tem conta e preserva o convite', async () => {
    const inviteId = await seedInvite()
    await fake.auth.createUser({ email: 'convidado@example.com', password: 'senha-segura-1' })
    await expectApiError(register(), 'account_exists', 409)
    expect((await db.collection('invites').doc(inviteId).get()).data()?.status).toBe('pendente')
  })

  it('desfaz o login criado quando o convite deixa de valer durante o cadastro', async () => {
    const inviteId = await seedInvite()
    fake.hooks.afterCreate = async () => { await db.collection('invites').doc(inviteId).update({ status: 'revogado' }) }

    await expectApiError(register(), 'invite_invalid', 403)
    expect(fake.users.size).toBe(0)
    expect(fake.calls.deleted).toHaveLength(1)
    expect((await db.collection('users').get()).empty).toBe(true)
  })
})

describe('limite de tentativas do cadastro', () => {
  it('bloqueia a sexta tentativa por e-mail na mesma hora, mesmo sem convite', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) await expectApiError(register('alvo@example.com', `198.51.100.${attempt}`), 'invite_invalid', 403)
    await expectApiError(register('alvo@example.com', '198.51.100.99'), 'rate_limited', 429)
  })

  it('bloqueia a 11ª tentativa por IP com e-mails diferentes', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) await expectApiError(register(`pessoa${attempt}@example.com`, '192.0.2.50'), 'invite_invalid', 403)
    await expectApiError(register('pessoa-final@example.com', '192.0.2.50'), 'rate_limited', 429)
    await expectApiError(register('pessoa-final@example.com', '192.0.2.51'), 'invite_invalid', 403)
  })
})
