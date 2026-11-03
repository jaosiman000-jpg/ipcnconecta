import type { Firestore } from '@google-cloud/firestore'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { executeMutation } from '../mutationHandlers.js'
import { mutationSchema } from '../schemas.js'
import type { Actor } from '../security.js'
import { actorFor, clearDatabase, createDb, createFakeAuth, expectApiError, seedUser, services } from './helpers.js'

let db: Firestore
let fake: ReturnType<typeof createFakeAuth>

const run = (input: unknown, actor: Actor) => executeMutation(mutationSchema.parse(input), actor, services(db, fake.auth))
const secretaria = actorFor(['secretaria'], { id: 'secretaria-1' })

const classItem = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: id, teacherIds: [], studentIds: [], active: true, ...extra,
})
const person = (id: string, ebd?: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id, name: `Pessoa ${id}`, birthDate: '1980-03-04', sex: 'Masculino', phone: '31999999999', tither: false, status: 'ativo',
  ...(ebd ? { ebd: { professor: false, status: 'ativo', ...ebd } } : { membership: { type: 'Comungante', status: 'Ativo' } }), ...extra,
})
const students = async (classId: string) => ((await db.collection('ebdClasses').doc(classId).get()).data()?.studentIds as string[]).sort()

beforeAll(() => { db = createDb() })
beforeEach(async () => {
  await clearDatabase()
  fake = createFakeAuth()
  await run({ type: 'ebd.class.save', item: classItem('sala-1') }, secretaria)
  await run({ type: 'ebd.class.save', item: classItem('oficiais', { name: 'Professores e Oficiais', officersRoom: true }) }, secretaria)
})

describe('sala de Professores e Oficiais', () => {
  it('só pode haver uma sala automática', async () => {
    await expectApiError(run({ type: 'ebd.class.save', item: classItem('outra', { officersRoom: true }) }, secretaria), 'officers_room_exists', 409)
    await run({ type: 'ebd.class.save', item: classItem('oficiais', { name: 'Professores e Oficiais', officersRoom: true, description: 'editada' }) }, secretaria)
  })

  it('professor entra na sala automática e não conta como aluno da sala em que leciona', async () => {
    await run({ type: 'person.save', person: person('prof', { professor: true, classId: 'sala-1', className: 'sala-1' }) }, secretaria)

    expect(await students('oficiais')).toEqual(['prof'])
    expect(await students('sala-1')).toEqual([])
    expect((await db.collection('people').doc('prof').get()).data()?.ebd.classId).toBe('sala-1')
  })

  it('desmarcar professor tira da sala automática e o aluno comum não entra nela', async () => {
    await run({ type: 'person.save', person: person('prof', { professor: true, classId: 'sala-1' }) }, secretaria)
    await run({ type: 'person.save', person: person('aluno', { classId: 'sala-1' }) }, secretaria)
    expect(await students('oficiais')).toEqual(['prof'])
    expect(await students('sala-1')).toEqual(['aluno'])

    await run({ type: 'person.save', person: person('prof', { professor: false, classId: 'sala-1' }) }, secretaria)
    expect(await students('oficiais')).toEqual([])
    expect(await students('sala-1')).toEqual(['aluno', 'prof'])
  })

  it('professor inativo na EBD sai da sala automática', async () => {
    await run({ type: 'person.save', person: person('prof', { professor: true, classId: 'sala-1' }) }, secretaria)
    await run({ type: 'person.save', person: person('prof', { professor: true, classId: 'sala-1', status: 'inativo' }) }, secretaria)
    expect(await students('oficiais')).toEqual([])
  })

  it('a sala automática não pode ser a sala própria de ninguém', async () => {
    await run({ type: 'person.save', person: person('prof', { professor: true, classId: 'oficiais' }) }, secretaria)
    expect((await db.collection('people').doc('prof').get()).data()?.ebd.classId).toBeUndefined()
    await expectApiError(run({ type: 'person.save', person: person('aluno', { classId: 'oficiais' }) }, secretaria), 'ebd_class_required', 400)
  })

  it('quem tem conta de Conselho, Secretaria ou Diácono ligada ao cadastro entra automaticamente', async () => {
    await seedUser(db, 'conta-diacono', { roles: ['diacono'], personId: 'diacono' })
    await seedUser(db, 'conta-presb', { roles: ['conselho'], personId: 'presb' })
    await seedUser(db, 'conta-prof', { roles: ['professor'], personId: 'soprof' })
    await run({ type: 'person.save', person: person('diacono', { classId: 'sala-1' }) }, secretaria)
    await run({ type: 'person.save', person: person('presb') }, secretaria)
    await run({ type: 'person.save', person: person('soprof', { classId: 'sala-1' }) }, secretaria)

    expect(await students('oficiais')).toEqual(['diacono', 'presb'])
    expect(await students('sala-1')).toEqual(['diacono', 'soprof'])
  })

  it('aprovar, mudar o cargo e desativar a conta atualizam a sala automática', async () => {
    fake.users.set('su-1', { uid: 'su-1', email: 'su-1@example.com', emailVerified: true })
    fake.users.set('novo', { uid: 'novo', email: 'novo@example.com', emailVerified: true })
    await seedUser(db, 'su-1', { roles: ['conselho'] })
    await seedUser(db, 'novo', { status: 'pendente', requestedRoles: ['diacono'] })
    await run({ type: 'person.save', person: person('p1', { classId: 'sala-1' }) }, secretaria)
    const su = actorFor(['conselho'], { id: 'su-1' })
    expect(await students('oficiais')).toEqual([])

    await run({ type: 'user.access.save', userId: 'novo', personId: 'p1', roles: ['diacono'], classIds: [], societyIds: [] }, su)
    expect(await students('oficiais')).toEqual(['p1'])

    await run({ type: 'user.access.save', userId: 'novo', personId: 'p1', roles: ['acolhimento'], classIds: [], societyIds: [] }, su)
    expect(await students('oficiais')).toEqual([])

    await run({ type: 'user.access.save', userId: 'novo', personId: 'p1', roles: ['secretaria'], classIds: [], societyIds: [] }, su)
    expect(await students('oficiais')).toEqual(['p1'])
    await run({ type: 'user.access.toggle', userId: 'novo' }, su)
    expect(await students('oficiais')).toEqual([])
  })

  it('Reconstruir diretórios acerta as listas e tira professores da sala em que lecionam', async () => {
    await db.collection('people').doc('prof').set({ ...person('prof', { professor: true, classId: 'sala-1' }) })
    await db.collection('ebdClasses').doc('sala-1').update({ studentIds: ['prof', 'aluno'] })
    await db.collection('people').doc('aluno').set({ ...person('aluno', { classId: 'sala-1' }) })

    await run({ type: 'directories.rebuild' }, secretaria)
    expect(await students('sala-1')).toEqual(['aluno'])
    expect(await students('oficiais')).toEqual(['prof'])
  })

  it('desmarcar a sala automática volta a montar a lista pelas salas próprias', async () => {
    await run({ type: 'person.save', person: person('prof', { professor: true, classId: 'sala-1' }) }, secretaria)
    await run({ type: 'ebd.class.save', item: classItem('oficiais', { name: 'Professores e Oficiais', studentIds: ['prof'] }) }, secretaria)
    expect(await students('oficiais')).toEqual([])
  })
})
