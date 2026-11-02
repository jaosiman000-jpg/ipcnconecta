import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { PROJECT_ID } from './helpers.js'

let env: RulesTestEnvironment

const profile = (roles: string[], extra: Record<string, unknown> = {}) => ({
  name: 'Pessoa Teste', email: 'x@example.com', emailVerified: true, roles, status: 'ativo', classIds: [], societyIds: [], ...extra,
})

const people: Record<string, Record<string, unknown>> = {
  legado: profile(['administrador']),
  conselho: profile(['conselho']),
  secretaria: profile(['secretaria']),
  diacono: profile(['diacono']),
  professor: profile(['professor'], { classIds: ['class-1'] }),
  lider: profile(['lider'], { societyIds: ['soc-1'] }),
  acolhimento: profile(['acolhimento']),
  pendente: profile([], { status: 'pendente' }),
  desativado: profile(['conselho'], { status: 'desativado' }),
  naoVerificado: profile(['conselho'], { emailVerified: false }),
}

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '').split(':')
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(process.env.RULES_PATH ?? 'firestore.rules', 'utf8'), host, port: Number(port) },
  })
})

afterAll(async () => { await env?.cleanup() })

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    for (const [uid, data] of Object.entries(people)) await setDoc(doc(db, 'users', uid), data)
    await setDoc(doc(db, 'members/m1'), { name: 'Membro', status: 'Ativo' })
    await setDoc(doc(db, 'memberDirectory/m1'), { name: 'Membro' })
    await setDoc(doc(db, 'memberPrivate/m1'), { restrictedNotes: 'nota pastoral' })
    await setDoc(doc(db, 'people/p1'), { name: 'Pessoa' })
    await setDoc(doc(db, 'visitors/v1'), { name: 'Visitante' })
    await setDoc(doc(db, 'ebdClasses/class-1'), { name: 'Classe 1', teacherIds: [] })
    await setDoc(doc(db, 'ebdClasses/class-2'), { name: 'Classe 2', teacherIds: [] })
    await setDoc(doc(db, 'attendance/a1'), { classId: 'class-1' })
    await setDoc(doc(db, 'attendance/a2'), { classId: 'class-2' })
    await setDoc(doc(db, 'ebdDirectory/e1'), { name: 'Aluno 1', ebd: { classId: 'class-1' } })
    await setDoc(doc(db, 'ebdDirectory/e2'), { name: 'Aluno 2', ebd: { classId: 'class-2' } })
    await setDoc(doc(db, 'societies/soc-1'), { leaderIds: [] })
    await setDoc(doc(db, 'societies/soc-2'), { leaderIds: [] })
    await setDoc(doc(db, 'societyRequests/r1'), { requestedBy: 'lider' })
    await setDoc(doc(db, 'societyRequests/r2'), { requestedBy: 'outro' })
    await setDoc(doc(db, 'financeEntries/f1'), { amount: 10 })
    await setDoc(doc(db, 'financeBatches/b1'), { total: 10 })
    await setDoc(doc(db, 'financeDirectory/p1'), { name: 'Dizimista' })
    await setDoc(doc(db, 'appSettings/general'), { whatsappMessage: 'Olá' })
    await setDoc(doc(db, 'audit/au1'), { action: 'x' })
    await setDoc(doc(db, 'invites/i1'), { email: 'convidado@example.com' })
    await setDoc(doc(db, 'rateLimits/r'), { count: 1 })
    await setDoc(doc(db, 'systemCounters/people'), { nextMemberNumber: 1 })
  })
})

const as = (uid: string) => env.authenticatedContext(uid, { email: 'x@example.com', email_verified: true }).firestore()
const anonymous = () => env.unauthenticatedContext().firestore()

type Expectation = 'allow' | 'deny'
const readMatrix: Array<[path: string, expectations: Record<string, Expectation>]> = [
  ['members/m1', { conselho: 'allow', secretaria: 'allow', diacono: 'deny', professor: 'deny', lider: 'deny', acolhimento: 'deny' }],
  ['memberPrivate/m1', { conselho: 'allow', secretaria: 'allow', diacono: 'deny', professor: 'deny', lider: 'deny', acolhimento: 'deny' }],
  ['memberDirectory/m1', { conselho: 'allow', secretaria: 'allow', diacono: 'deny', professor: 'deny', lider: 'deny', acolhimento: 'deny' }],
  ['people/p1', { conselho: 'allow', secretaria: 'allow', diacono: 'deny', professor: 'deny', lider: 'deny', acolhimento: 'deny' }],
  ['visitors/v1', { conselho: 'allow', secretaria: 'allow', diacono: 'deny', professor: 'deny', lider: 'deny', acolhimento: 'allow' }],
  ['financeEntries/f1', { conselho: 'allow', secretaria: 'allow', diacono: 'allow', professor: 'deny', lider: 'deny', acolhimento: 'deny' }],
  ['financeBatches/b1', { conselho: 'allow', secretaria: 'allow', diacono: 'allow', professor: 'deny', lider: 'deny', acolhimento: 'deny' }],
  ['financeDirectory/p1', { conselho: 'allow', secretaria: 'allow', diacono: 'allow', professor: 'deny', lider: 'deny', acolhimento: 'deny' }],
  ['audit/au1', { conselho: 'allow', secretaria: 'allow', diacono: 'deny', professor: 'deny', lider: 'deny', acolhimento: 'deny' }],
  ['invites/i1', { conselho: 'allow', secretaria: 'allow', diacono: 'deny', professor: 'deny', lider: 'deny', acolhimento: 'deny' }],
  ['appSettings/general', { conselho: 'allow', secretaria: 'allow', diacono: 'allow', professor: 'allow', lider: 'allow', acolhimento: 'allow' }],
  ['rateLimits/r', { conselho: 'deny', secretaria: 'deny', diacono: 'deny', professor: 'deny', lider: 'deny', acolhimento: 'deny' }],
  ['systemCounters/people', { conselho: 'deny', secretaria: 'deny', diacono: 'deny', professor: 'deny', lider: 'deny', acolhimento: 'deny' }],
]

describe('leitura por perfil', () => {
  readMatrix.forEach(([path, expectations]) => {
    Object.entries(expectations).forEach(([role, expected]) => {
      it(`${role} ${expected === 'allow' ? 'lê' : 'não lê'} ${path}`, async () => {
        const read = getDoc(doc(as(role), path))
        await (expected === 'allow' ? assertSucceeds(read) : assertFails(read))
      })
    })
  })

  it('professor lê só as classes, chamadas e alunos das suas turmas', async () => {
    const db = as('professor')
    await assertSucceeds(getDoc(doc(db, 'ebdClasses/class-1')))
    await assertFails(getDoc(doc(db, 'ebdClasses/class-2')))
    await assertSucceeds(getDoc(doc(db, 'attendance/a1')))
    await assertFails(getDoc(doc(db, 'attendance/a2')))
    await assertSucceeds(getDoc(doc(db, 'ebdDirectory/e1')))
    await assertFails(getDoc(doc(db, 'ebdDirectory/e2')))
  })

  it('diácono lê o financeiro inteiro, mas nada de pessoas, membros, visitantes ou EBD', async () => {
    const db = as('diacono')
    await assertSucceeds(getDoc(doc(db, 'financeEntries/f1')))
    for (const path of ['people/p1', 'members/m1', 'visitors/v1', 'ebdClasses/class-1', 'ebdDirectory/e1', 'attendance/a1', 'memberDirectory/m1']) await assertFails(getDoc(doc(db, path)))
  })

  it('acolhimento lê só os visitantes', async () => {
    const db = as('acolhimento')
    await assertSucceeds(getDoc(doc(db, 'visitors/v1')))
    for (const path of ['people/p1', 'members/m1', 'memberDirectory/m1', 'financeEntries/f1', 'ebdClasses/class-1', 'users/professor']) await assertFails(getDoc(doc(db, path)))
  })

  it('professor não lê a lista de membros nem as pessoas', async () => {
    const db = as('professor')
    for (const path of ['memberDirectory/m1', 'members/m1', 'people/p1', 'visitors/v1', 'financeEntries/f1']) await assertFails(getDoc(doc(db, path)))
  })

  it('o papel antigo Administrador não dá mais acesso aos dados', async () => {
    const restricted = readMatrix.filter(([path, expectations]) => path !== 'appSettings/general' && expectations.conselho === 'allow')
    for (const [path] of restricted) await assertFails(getDoc(doc(as('legado'), path)))
  })

  it('secretaria lê todas as classes e chamadas', async () => {
    await assertSucceeds(getDoc(doc(as('secretaria'), 'ebdClasses/class-2')))
    await assertSucceeds(getDoc(doc(as('secretaria'), 'attendance/a2')))
  })

  it('líder lê só a própria sociedade e os próprios pedidos', async () => {
    const db = as('lider')
    await assertSucceeds(getDoc(doc(db, 'societies/soc-1')))
    await assertFails(getDoc(doc(db, 'societies/soc-2')))
    await assertSucceeds(getDoc(doc(db, 'societyRequests/r1')))
    await assertFails(getDoc(doc(db, 'societyRequests/r2')))
  })

  it('só Conselho e Secretaria leem a lista de usuários', async () => {
    await assertSucceeds(getDocs(collection(as('conselho'), 'users')))
    await assertSucceeds(getDocs(collection(as('secretaria'), 'users')))
    await assertFails(getDocs(collection(as('diacono'), 'users')))
    await assertFails(getDocs(collection(as('pendente'), 'users')))
  })

  it('cada usuário lê apenas o próprio perfil', async () => {
    await assertSucceeds(getDoc(doc(as('professor'), 'users/professor')))
    await assertFails(getDoc(doc(as('professor'), 'users/lider')))
    await assertSucceeds(getDoc(doc(as('conselho'), 'users/lider')))
  })
})

describe('contas sem acesso ativo', () => {
  const paths = readMatrix.filter(([, expectations]) => expectations.conselho === 'allow').map(([path]) => path)

  ;['pendente', 'desativado', 'naoVerificado'].forEach((account) => {
    it(`${account} não lê nenhum dado administrativo`, async () => {
      for (const path of paths) await assertFails(getDoc(doc(as(account), path)))
    })
  })

  it('visitante anônimo não lê nada', async () => {
    for (const [path] of readMatrix) await assertFails(getDoc(doc(anonymous(), path)))
    await assertFails(getDoc(doc(anonymous(), 'users/admin')))
  })
})

describe('escritas pelo navegador', () => {
  const targets = ['members/m1', 'memberDirectory/m1', 'memberPrivate/m1', 'people/p1', 'visitors/v1', 'ebdClasses/class-1', 'attendance/a1', 'societies/soc-1',
    'societyRequests/r1', 'financeEntries/f1', 'financeBatches/b1', 'financeDirectory/p1', 'ebdDirectory/e1', 'appSettings/general', 'audit/au1', 'invites/i1', 'rateLimits/r', 'systemCounters/people']

  it('nenhum perfil, nem o Conselho, grava diretamente', async () => {
    for (const role of ['conselho', 'secretaria', 'diacono', 'professor', 'lider', 'acolhimento']) {
      for (const path of targets) await assertFails(setDoc(doc(as(role), path), { hacked: true }))
    }
  })

  it('ninguém apaga perfis', async () => {
    const { deleteDoc } = await import('firebase/firestore')
    await assertFails(deleteDoc(doc(as('conselho'), 'users/professor')))
  })
})

describe('perfis de usuário', () => {
  const newProfile = (uid: string) => ({
    uid, name: 'Nova Pessoa', email: 'x@example.com', photo: '', office: 'Professor', emailVerified: true,
    roles: [], requestedRoles: ['professor'], status: 'pendente', classIds: [], societyIds: [],
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(), privacyNoticeVersion: '2026-10-26', privacyNoticeAcceptedAt: serverTimestamp(),
  })

  it('o navegador não cria mais perfis (cadastro só por convite, via servidor)', async () => {
    const db = env.authenticatedContext('novo', { email: 'x@example.com', email_verified: true }).firestore()
    await assertFails(setDoc(doc(db, 'users/novo'), newProfile('novo')))
  })

  it('não permite se promover nem se ativar', async () => {
    await assertFails(updateDoc(doc(as('pendente'), 'users/pendente'), { roles: ['conselho'], status: 'ativo', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(as('professor'), 'users/professor'), { roles: ['conselho'], updatedAt: serverTimestamp() }))
  })

  it('permite sincronizar a verificação do próprio e-mail', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/pendente'), profile([], { status: 'pendente', emailVerified: false }))
    })
    await assertSucceeds(updateDoc(doc(as('pendente'), 'users/pendente'), { emailVerified: true, updatedAt: serverTimestamp() }))
  })

  it('não permite declarar e-mail verificado sem estar verificado', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/pendente'), profile([], { status: 'pendente', emailVerified: false }))
    })
    const db = env.authenticatedContext('pendente', { email: 'x@example.com', email_verified: false }).firestore()
    await assertFails(updateDoc(doc(db, 'users/pendente'), { emailVerified: true, updatedAt: serverTimestamp() }))
  })
})
