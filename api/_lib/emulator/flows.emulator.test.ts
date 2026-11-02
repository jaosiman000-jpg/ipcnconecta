import type { Firestore } from '@google-cloud/firestore'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { executeMutation } from '../mutationHandlers.js'
import { mutationSchema } from '../schemas.js'
import { authenticate, type Actor } from '../security.js'
import { actorFor, clearDatabase, createDb, createFakeAuth, expectApiError, seedUser, services } from './helpers.js'

let db: Firestore
let fake: ReturnType<typeof createFakeAuth>

const run = (input: unknown, actor: Actor) => executeMutation(mutationSchema.parse(input), actor, services(db, fake.auth))
const actions = async () => (await db.collection('audit').get()).docs.map((entry) => entry.data().action as string)

beforeAll(() => { db = createDb() })
beforeEach(async () => { await clearDatabase(); fake = createFakeAuth() })

describe('autenticação da API', () => {
  const token = (uid: string, email = `${uid}@example.com`, verified = true) => `${uid}|${email}|${verified}`

  it('carrega papéis e escopos do perfil no Firestore, não do token', async () => {
    await seedUser(db, 'u1', { roles: ['professor'], classIds: ['class-1'] })
    const actor = await authenticate(token('u1'), fake.auth, db)
    expect(actor).toMatchObject({ id: 'u1', roles: ['professor'], classIds: ['class-1'] })
  })

  it('recusa e-mail não verificado no token', async () => {
    await seedUser(db, 'u1', { roles: ['professor'] })
    await expectApiError(authenticate(token('u1', 'u1@example.com', false), fake.auth, db), 'email_unverified', 403)
  })

  it('recusa conta pendente, desativada, sem papéis ou sem perfil', async () => {
    await seedUser(db, 'pendente', { status: 'pendente' })
    await seedUser(db, 'desativado', { status: 'desativado', roles: ['conselho'] })
    await seedUser(db, 'legado', { roles: ['administrador'] })
    await seedUser(db, 'sempapel', { roles: [] })
    for (const uid of ['pendente', 'desativado', 'sempapel', 'legado']) await expectApiError(authenticate(token(uid), fake.auth, db), 'account_inactive', 403)
    await expectApiError(authenticate(token('fantasma'), fake.auth, db), 'profile_missing', 403)
  })

  it('recusa quando o e-mail do token difere do perfil', async () => {
    await seedUser(db, 'u1', { roles: ['conselho'] })
    await expectApiError(authenticate(token('u1', 'outro@example.com'), fake.auth, db), 'account_inactive', 403)
  })

  it('recusa token inválido', async () => {
    await expectApiError(authenticate('lixo', fake.auth, db), 'invalid_token', 401)
  })
})

describe('chamada da EBD', () => {
  const attendance = (extra: Record<string, unknown> = {}) => ({
    type: 'ebd.attendance.save', id: 'att-1', classId: 'class-1', date: '2026-11-01', records: { s1: 'presente', s2: 'ausente' }, visitors: [], status: 'finalizada', ...extra,
  })
  const teacher = actorFor(['professor'], { id: 'teacher-1', classIds: ['class-1'] })

  beforeEach(async () => {
    await db.collection('ebdClasses').doc('class-1').set({ id: 'class-1', name: 'Jovens', teacherIds: ['teacher-1'], studentIds: ['s1', 's2'], active: true })
  })

  it('professor da classe registra a chamada com auditoria', async () => {
    await run(attendance(), teacher)
    const saved = (await db.collection('attendance').doc('class-1_2026-11-01').get()).data()
    expect(saved).toMatchObject({ classId: 'class-1', status: 'finalizada', createdBy: 'teacher-1', records: { s1: 'presente', s2: 'ausente' } })
    expect(await actions()).toEqual(['ebd.chamada_finalizada'])
  })

  it('professor de outra classe é recusado', async () => {
    await expectApiError(run(attendance(), actorFor(['professor'], { id: 'teacher-2', classIds: ['class-9'] })), 'class_not_assigned', 403)
    expect((await db.collection('attendance').get()).empty).toBe(true)
  })

  it('perfis sem relação com a EBD são recusados', async () => {
    for (const role of ['diacono', 'lider', 'acolhimento'] as const) await expectApiError(run(attendance(), actorFor([role])), 'class_not_assigned', 403)
  })

  it('secretaria pode registrar a chamada de qualquer classe', async () => {
    await run(attendance(), actorFor(['secretaria']))
  })

  it('recusa pessoa que não pertence à classe', async () => {
    await expectApiError(run(attendance({ records: { s1: 'presente', intruso: 'presente' } }), teacher), 'attendance_student_invalid', 400)
  })

  it('recusa finalizar sem marcar todos os alunos', async () => {
    await expectApiError(run(attendance({ records: { s1: 'presente' } }), teacher), 'attendance_incomplete', 400)
  })

  it('aceita rascunho incompleto, mas não reabre chamada finalizada', async () => {
    await run(attendance({ records: { s1: 'presente' }, status: 'rascunho' }), teacher)
    await run(attendance(), teacher)
    await expectApiError(run(attendance({ status: 'rascunho' }), teacher), 'attendance_reopen_denied', 409)
  })

  it('edição de chamada finalizada fica registrada como edição', async () => {
    await run(attendance(), teacher)
    await run(attendance({ records: { s1: 'ausente', s2: 'presente' } }), teacher)
    expect(await actions()).toEqual(expect.arrayContaining(['ebd.chamada_finalizada', 'ebd.chamada_editada']))
  })

  it('recusa status "visitante" para aluno da classe', async () => {
    await expectApiError(run(attendance({ records: { s1: 'visitante', s2: 'presente' } }), teacher), 'attendance_status_invalid', 400)
  })
})

describe('financeiro do Diácono', () => {
  const diacono = actorFor(['diacono'], { id: 'diacono-1', name: 'Diácono Um' })
  const outroDiacono = actorFor(['diacono'], { id: 'diacono-2', name: 'Diácono Dois' })
  const batch = (items?: unknown[]) => ({
    type: 'finance.batch.save',
    batch: { id: 'batch-1', date: '2026-11-01', items: items ?? [{ id: 'i1', amount: 150.5, category: 'Dízimo', method: 'PIX', personId: 'p1', contributorName: 'nome-enviado-pelo-navegador', anonymous: false }] },
  })

  beforeEach(async () => {
    await db.collection('financeDirectory').doc('p1').set({ id: 'p1', name: 'Maria Dizimista', status: 'ativo', tither: true })
    await db.collection('financeDirectory').doc('p2').set({ id: 'p2', name: 'João Sem Dízimo', status: 'ativo', tither: false })
  })

  it('o nome do contribuinte vem do cadastro, não do navegador', async () => {
    await run(batch(), diacono)
    const saved = (await db.collection('financeBatches').doc('batch-1').get()).data()
    expect(saved?.items[0].contributorName).toBe('Maria Dizimista')
    expect(saved).toMatchObject({ status: 'rascunho', createdBy: 'diacono-1' })
  })

  it('recusa contribuinte que não é dizimista ativo', async () => {
    await expectApiError(run(batch([{ id: 'i1', amount: 10, category: 'Oferta', method: 'Dinheiro', personId: 'p2', contributorName: 'x', anonymous: false }]), diacono), 'contributor_unavailable', 400)
    await expectApiError(run(batch([{ id: 'i1', amount: 10, category: 'Oferta', method: 'Dinheiro', personId: 'inexistente', contributorName: 'x', anonymous: false }]), diacono), 'contributor_unavailable', 400)
  })

  it('oferta anônima não guarda a pessoa', async () => {
    await run(batch([{ id: 'i1', amount: 20, category: 'Oferta', method: 'Dinheiro', contributorName: 'Fulano', anonymous: true }]), diacono)
    const item = (await db.collection('financeBatches').doc('batch-1').get()).data()?.items[0]
    expect(item).toMatchObject({ contributorName: 'Anônimo', anonymous: true })
    expect(item.personId).toBeUndefined()
  })

  it('perfis fora do financeiro são recusados', async () => {
    for (const role of ['professor', 'lider', 'acolhimento'] as const) await expectApiError(run(batch(), actorFor([role])), 'permission_denied', 403)
  })

  it('só quem criou o lote o finaliza; depois ele fica imutável', async () => {
    await run(batch(), diacono)
    await expectApiError(run({ type: 'finance.batch.finalize', batchId: 'batch-1' }, outroDiacono), 'finance_batch_owner', 403)

    await run({ type: 'finance.batch.finalize', batchId: 'batch-1' }, diacono)
    const entry = (await db.collection('financeEntries').doc('batch-1_i1').get()).data()
    expect(entry).toMatchObject({ amount: 150.5, status: 'ativo', contributorName: 'Maria Dizimista', createdBy: 'diacono-1' })
    expect((await db.collection('financeBatches').doc('batch-1').get()).data()).toMatchObject({ status: 'finalizado', total: 150.5, itemCount: 1, items: [] })

    await expectApiError(run({ type: 'finance.batch.finalize', batchId: 'batch-1' }, diacono), 'finance_batch_locked', 409)
    await expectApiError(run(batch(), diacono), 'finance_batch_locked', 409)
    await expectApiError(run({ type: 'finance.batch.discard', batchId: 'batch-1' }, diacono), 'finance_batch_locked', 409)
  })

  it('não finaliza lote vazio e permite descartar rascunho', async () => {
    await run(batch([]), diacono)
    await expectApiError(run({ type: 'finance.batch.finalize', batchId: 'batch-1' }, diacono), 'finance_batch_empty', 400)
    await run({ type: 'finance.batch.discard', batchId: 'batch-1' }, diacono)
    expect((await db.collection('financeBatches').doc('batch-1').get()).data()?.status).toBe('descartado')
  })

  it('cancelamento exige justificativa, preserva o lançamento e só ocorre uma vez', async () => {
    await run(batch(), diacono)
    await run({ type: 'finance.batch.finalize', batchId: 'batch-1' }, diacono)

    expect(mutationSchema.safeParse({ type: 'finance.entry.cancel', entryId: 'batch-1_i1', reason: 'x' }).success).toBe(false)
    const cancel = { type: 'finance.entry.cancel', entryId: 'batch-1_i1', reason: 'Lançado em duplicidade' }
    await expectApiError(run(cancel, diacono), 'permission_denied', 403)
    await expectApiError(run(cancel, outroDiacono), 'permission_denied', 403)

    await run(cancel, actorFor(['secretaria'], { id: 'secretaria-1', name: 'Secretaria Um' }))
    expect((await db.collection('financeEntries').doc('batch-1_i1').get()).data()).toMatchObject({ status: 'cancelado', cancellationReason: 'Lançado em duplicidade', cancelledBy: 'secretaria-1', amount: 150.5 })
    await expectApiError(run(cancel, actorFor(['conselho'])), 'finance_entry_cancelled', 409)
    expect(await actions()).toEqual(expect.arrayContaining(['financeiro.lote_finalizado', 'financeiro.contribuicao_cancelada']))
  })
})

describe('aprovação e governança de acessos', () => {
  const conselho = actorFor(['conselho'], { id: 'su-1' })
  const approve = (extra: Record<string, unknown> = {}) => ({
    type: 'user.access.save', userId: 'novo', personId: 'p1', roles: ['professor'], classIds: ['class-1'], societyIds: [], ...extra,
  })

  beforeEach(async () => {
    await seedUser(db, 'su-1', { roles: ['conselho'] })
    await seedUser(db, 'novo', { status: 'pendente', requestedRoles: ['professor'], emailVerified: true })
    fake.users.set('novo', { uid: 'novo', email: 'novo@example.com', emailVerified: true })
    fake.users.set('su-1', { uid: 'su-1', email: 'su-1@example.com', emailVerified: true })
    await db.collection('people').doc('p1').set({ id: 'p1', name: 'Pessoa Um', status: 'ativo', tither: false })
    await db.collection('ebdClasses').doc('class-1').set({ id: 'class-1', name: 'Jovens', teacherIds: [], studentIds: [] })
  })

  it('aprova, ativa o perfil, vincula a pessoa e atribui a classe', async () => {
    await run(approve(), conselho)
    expect((await db.collection('users').doc('novo').get()).data()).toMatchObject({
      status: 'ativo', roles: ['professor'], classIds: ['class-1'], personId: 'p1', approvedBy: 'su-1', requestedRoles: [],
    })
    expect((await db.collection('people').doc('p1').get()).data()?.authUserId).toBe('novo')
    expect((await db.collection('ebdClasses').doc('class-1').get()).data()?.teacherIds).toEqual(['novo'])
    expect(await actions()).toContain('usuario.aprovado')
  })

  it('só Conselho e Secretaria aprovam acessos', async () => {
    for (const role of ['diacono', 'professor', 'lider', 'acolhimento'] as const) await expectApiError(run(approve(), actorFor([role])), 'permission_denied', 403)
    await run(approve(), actorFor(['secretaria'], { id: 'secretaria-1' }))
    expect((await db.collection('users').doc('novo').get()).data()?.status).toBe('ativo')
  })

  it('não concede o papel extinto Administrador nem o Líder de sociedade', () => {
    expect(mutationSchema.safeParse(approve({ roles: ['administrador'] })).success).toBe(false)
    expect(mutationSchema.safeParse(approve({ roles: ['lider'] })).success).toBe(false)
  })

  it('ninguém altera o próprio acesso', async () => {
    await expectApiError(run(approve({ userId: 'su-1' }), conselho), 'self_access_change', 403)
  })

  it('recusa aprovação com e-mail não verificado no Firebase Auth', async () => {
    fake.users.set('novo', { uid: 'novo', email: 'novo@example.com', emailVerified: false })
    await expectApiError(run(approve(), conselho), 'target_email_unverified', 409)
  })

  it('uma pessoa só pode estar ligada a uma conta', async () => {
    await db.collection('people').doc('p1').update({ authUserId: 'outra-conta' })
    await expectApiError(run(approve(), conselho), 'person_already_linked', 409)
  })

  it('recusa classe inexistente', async () => {
    await expectApiError(run(approve({ classIds: ['nao-existe'] }), conselho), 'access_scope_invalid', 400)
  })

  it('preserva sempre ao menos um Conselho ou Secretaria ativo', async () => {
    fake.users.set('su-2', { uid: 'su-2', email: 'su-2@example.com', emailVerified: true })
    await expectApiError(run(approve({ userId: 'su-1', roles: ['professor'] }), actorFor(['conselho'], { id: 'su-2' })), 'last_superuser', 409)
    await expectApiError(run({ type: 'user.access.toggle', userId: 'su-1' }, actorFor(['conselho'], { id: 'su-2' })), 'last_superuser', 409)
  })

  it('encerra as sessões de quem é desativado e não de quem é reativado', async () => {
    await run(approve(), conselho)
    await run({ type: 'user.access.toggle', userId: 'novo' }, conselho)
    expect(fake.calls.revoked).toEqual(['novo'])

    await run({ type: 'user.access.toggle', userId: 'novo' }, conselho)
    expect(fake.calls.revoked).toEqual(['novo'])
  })

  it('a desativação vale mesmo que a revogação de sessões falhe', async () => {
    await run(approve(), conselho)
    fake.hooks.failRevoke = true
    await run({ type: 'user.access.toggle', userId: 'novo' }, conselho)
    expect((await db.collection('users').doc('novo').get()).data()?.status).toBe('desativado')
    expect(fake.calls.revoked).toEqual([])
  })

  it('encerra as sessões de um pedido recusado', async () => {
    await seedUser(db, 'outro', { status: 'pendente' })
    await run({ type: 'user.access.reject', userId: 'outro' }, conselho)
    expect(fake.calls.revoked).toEqual(['outro'])
  })

  it('desativa e reativa contas, e recusa pedidos pendentes', async () => {
    await run(approve(), conselho)
    await run({ type: 'user.access.toggle', userId: 'novo' }, conselho)
    expect((await db.collection('users').doc('novo').get()).data()?.status).toBe('desativado')
    await run({ type: 'user.access.toggle', userId: 'novo' }, conselho)
    expect((await db.collection('users').doc('novo').get()).data()?.status).toBe('ativo')

    await seedUser(db, 'outro', { status: 'pendente' })
    await run({ type: 'user.access.reject', userId: 'outro' }, conselho)
    expect((await db.collection('users').doc('outro').get()).data()).toMatchObject({ status: 'desativado', roles: [] })
    await expectApiError(run({ type: 'user.access.reject', userId: 'novo' }, conselho), 'user_not_pending', 409)
  })
})
