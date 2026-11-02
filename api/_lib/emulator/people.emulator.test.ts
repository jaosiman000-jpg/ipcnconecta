import type { Firestore } from '@google-cloud/firestore'
import { Timestamp } from '@google-cloud/firestore'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { executeMutation } from '../mutationHandlers.js'
import { mutationSchema } from '../schemas.js'
import type { Actor } from '../security.js'
import { actorFor, clearDatabase, createDb, createFakeAuth, expectApiError, services } from './helpers.js'

let db: Firestore
let fake: ReturnType<typeof createFakeAuth>

const run = (input: unknown, actor: Actor) => executeMutation(mutationSchema.parse(input), actor, services(db, fake.auth))
const conselho = actorFor(['conselho'], { id: 'conselho-1' })
const secretaria = actorFor(['secretaria'], { id: 'secretaria-1' })

const person = (extra: Record<string, unknown> = {}) => ({
  id: 'person-1', name: 'Maria da Silva', birthDate: '1990-05-10', sex: 'Feminino', phone: '31999999999',
  tither: false, status: 'ativo', membership: { type: 'Comungante', status: 'Ativo' }, ...extra,
})

beforeAll(() => { db = createDb() })
beforeEach(async () => { await clearDatabase(); fake = createFakeAuth() })

describe('cadastro de pessoas e diretórios', () => {
  it('membro ativo entra no diretório somente com nome e nascimento', async () => {
    await run({ type: 'person.save', person: person() }, conselho)

    const directory = await db.collection('memberDirectory').doc('person-1').get()
    expect(directory.data()).toEqual({ id: 'person-1', name: 'Maria da Silva', birthDate: '1990-05-10' })
    const member = await db.collection('members').doc('person-1').get()
    expect(member.data()).toMatchObject({ status: 'Ativo', memberNumber: 1 })
    expect((await db.collection('audit').get()).docs.map((entry) => entry.data().action)).toEqual(['pessoa.criada'])
  })

  it('situação diferente de Ativo remove a pessoa do diretório, mas mantém o cadastro completo', async () => {
    await run({ type: 'person.save', person: person() }, conselho)
    await run({ type: 'person.save', person: person({ membership: { type: 'Comungante', status: 'Disciplinado' } }) }, conselho)

    expect((await db.collection('memberDirectory').doc('person-1').get()).exists).toBe(false)
    expect((await db.collection('members').doc('person-1').get()).data()?.status).toBe('Disciplinado')
  })

  it('numeração de membro é sequencial e preservada nas edições', async () => {
    await run({ type: 'person.save', person: person() }, conselho)
    await run({ type: 'person.save', person: person({ id: 'person-2', name: 'João Pereira' }) }, conselho)
    await run({ type: 'person.save', person: person({ phone: '31988887777' }) }, conselho)

    expect((await db.collection('people').doc('person-1').get()).data()?.membership.memberNumber).toBe(1)
    expect((await db.collection('people').doc('person-2').get()).data()?.membership.memberNumber).toBe(2)
  })

  it('Secretaria, que tem acesso completo, também define o vínculo de membro', async () => {
    await run({ type: 'person.save', person: person() }, secretaria)
    expect((await db.collection('memberDirectory').doc('person-1').get()).exists).toBe(true)
  })

  it('o papel extinto Administrador não dá mais acesso', async () => {
    await expectApiError(run({ type: 'person.save', person: person() }, actorFor(['administrador' as never], { id: 'admin-legado' })), 'permission_denied', 403)
  })

  it('secretaria cadastra dizimista e o diretório financeiro recebe só o necessário', async () => {
    await run({ type: 'person.save', person: person({ membership: undefined, tither: true }) }, secretaria)
    const finance = await db.collection('financeDirectory').doc('person-1').get()
    expect(finance.data()).toEqual({ id: 'person-1', name: 'Maria da Silva', status: 'ativo', tither: true })
  })

  it('perfis sem gestão de cadastros são recusados', async () => {
    for (const role of ['diacono', 'professor', 'lider', 'acolhimento'] as const) {
      await expectApiError(run({ type: 'person.save', person: person({ membership: undefined, tither: true }) }, actorFor([role])), 'permission_denied', 403)
    }
  })

  it('adulto sem celular é recusado', async () => {
    await expectApiError(run({ type: 'person.save', person: person({ phone: undefined, membership: undefined, tither: true }) }, secretaria), 'adult_phone_required', 400)
  })

  it('exige ao menos um vínculo ao criar a pessoa', async () => {
    await expectApiError(run({ type: 'person.save', person: person({ membership: undefined }) }, secretaria), 'person_module_required', 400)
  })

  it('não permite apontar para uma classe inexistente', async () => {
    await expectApiError(run({ type: 'person.save', person: person({ membership: undefined, ebd: { classId: 'nao-existe', professor: false, status: 'ativo' } }) }, secretaria), 'ebd_class_invalid', 400)
  })
})

describe('reconstrução dos diretórios', () => {
  beforeEach(async () => {
    await db.collection('people').doc('p-ativo').set({ id: 'p-ativo', name: 'Ana Ativa', birthDate: '1980-01-01', status: 'ativo', tither: true, phone: '31911112222', membership: { type: 'Comungante', status: 'Ativo', memberNumber: 1 }, ebd: { classId: 'class-1', professor: false, status: 'ativo' } })
    await db.collection('people').doc('p-disciplinado').set({ id: 'p-disciplinado', name: 'Davi Disciplinado', birthDate: '1975-02-02', status: 'ativo', tither: false, membership: { type: 'Comungante', status: 'Disciplinado', memberNumber: 2 } })
    await db.collection('memberDirectory').doc('p-ativo').set({ id: 'p-ativo', name: 'Ana Ativa', birthDate: '1980-01-01', status: 'Ativo', memberNumber: 1, membershipType: 'Comungante' })
    await db.collection('memberDirectory').doc('p-disciplinado').set({ id: 'p-disciplinado', name: 'Davi Disciplinado', birthDate: '1975-02-02', status: 'Disciplinado' })
    await db.collection('memberDirectory').doc('orfao').set({ id: 'orfao', name: 'Sem cadastro', status: 'Ativo' })
  })

  it('recria os diretórios no formato mínimo e remove os que não deveriam existir', async () => {
    await run({ type: 'directories.rebuild' }, conselho)

    const members = await db.collection('memberDirectory').get()
    expect(members.docs.map((entry) => entry.id)).toEqual(['p-ativo'])
    expect(members.docs[0].data()).toEqual({ id: 'p-ativo', name: 'Ana Ativa', birthDate: '1980-01-01' })
    expect((await db.collection('ebdDirectory').doc('p-ativo').get()).exists).toBe(true)
    expect((await db.collection('financeDirectory').doc('p-ativo').get()).data()).toMatchObject({ tither: true })
    expect((await db.collection('audit').get()).docs.map((entry) => entry.data().action)).toContain('diretorios.reconstruidos')
  })

  it('é restrita ao acesso completo', async () => {
    await expectApiError(run({ type: 'directories.rebuild' }, actorFor(['diacono'])), 'permission_denied', 403)
    expect((await db.collection('memberDirectory').doc('orfao').get()).exists).toBe(true)

    await run({ type: 'directories.rebuild' }, secretaria)
    expect((await db.collection('memberDirectory').doc('orfao').get()).exists).toBe(false)
  })
})

describe('convites de cadastro', () => {
  it('Conselho cria convite com e-mail normalizado e validade de 14 dias', async () => {
    await run({ type: 'invite.create', email: '  Novo.Membro@Example.com ', roles: ['professor'] }, conselho)

    const invites = await db.collection('invites').get()
    expect(invites.size).toBe(1)
    const invite = invites.docs[0].data()
    expect(invite).toMatchObject({ email: 'novo.membro@example.com', roles: ['professor'], status: 'pendente', createdBy: 'conselho-1' })
    const days = ((invite.expiresAt as Timestamp).toMillis() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(13.9)
    expect(days).toBeLessThanOrEqual(14)
  })

  it('a auditoria do convite não guarda o e-mail', async () => {
    await run({ type: 'invite.create', email: 'segredo@example.com', roles: ['professor'] }, conselho)
    const audit = (await db.collection('audit').get()).docs.map((entry) => JSON.stringify(entry.data())).join('')
    expect(audit).not.toContain('segredo@example.com')
  })

  it('Secretaria convida como o Conselho; os demais perfis não', async () => {
    await run({ type: 'invite.create', email: 'a@example.com', roles: ['professor'] }, secretaria)
    for (const role of ['diacono', 'professor', 'acolhimento'] as const) {
      await expectApiError(run({ type: 'invite.create', email: 'b@example.com', roles: ['professor'] }, actorFor([role])), 'permission_denied', 403)
    }
  })

  it('não oferece os papéis Administrador (extinto) nem Líder de sociedade em convites', () => {
    expect(mutationSchema.safeParse({ type: 'invite.create', email: 'a@example.com', roles: ['administrador'] }).success).toBe(false)
    expect(mutationSchema.safeParse({ type: 'invite.create', email: 'a@example.com', roles: ['lider'] }).success).toBe(false)
    expect(mutationSchema.safeParse({ type: 'invite.create', email: 'a@example.com', roles: ['diacono', 'acolhimento'] }).success).toBe(true)
  })

  it('não convida quem já possui conta', async () => {
    await fake.auth.createUser({ email: 'ja@example.com', password: 'senha-segura', emailVerified: true })
    await expectApiError(run({ type: 'invite.create', email: 'ja@example.com', roles: ['professor'] }, conselho), 'account_exists', 409)
  })

  it('revoga convite pendente uma única vez', async () => {
    await run({ type: 'invite.create', email: 'a@example.com', roles: ['professor'] }, conselho)
    const id = (await db.collection('invites').get()).docs[0].id

    await run({ type: 'invite.revoke', inviteId: id }, conselho)
    expect((await db.collection('invites').doc(id).get()).data()?.status).toBe('revogado')
    await expectApiError(run({ type: 'invite.revoke', inviteId: id }, conselho), 'invite_not_pending', 409)
    await expectApiError(run({ type: 'invite.revoke', inviteId: 'inexistente' }, conselho), 'invite_not_found', 404)
    await expectApiError(run({ type: 'invite.revoke', inviteId: id }, actorFor(['diacono'])), 'permission_denied', 403)
  })
})

