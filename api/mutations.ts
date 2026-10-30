import { Timestamp, type DocumentData, type DocumentReference, type Firestore, type WriteBatch } from 'firebase-admin/firestore'
import { AdminSetupError, getAdminServices } from './_lib/firebaseAdmin.js'
import { ApiError, assertSameOrigin, authenticate, isSuperuser, json, parseMutation, readBearerToken, requireRole, type Actor } from './_lib/security.js'
import type { MutationInput, Role } from './_lib/schemas.js'

const SUPERUSER_ROLES: Role[] = ['administrador', 'conselho']
const MEMBER_MANAGER_ROLES: Role[] = [...SUPERUSER_ROLES, 'secretaria']
const VISITOR_ROLES: Role[] = [...MEMBER_MANAGER_ROLES, 'acolhimento']
const EBD_MANAGER_ROLES: Role[] = [...MEMBER_MANAGER_ROLES]
const SOCIETY_MANAGER_ROLES: Role[] = [...SUPERUSER_ROLES]
const FINANCE_ROLES: Role[] = [...SUPERUSER_ROLES, 'diacono']
const ROLE_LABELS: Record<Role, string> = {
  administrador: 'Administrador',
  conselho: 'Conselho',
  secretaria: 'Secretaria',
  diacono: 'Junta Diaconal',
  professor: 'Professor',
  lider: 'Líder de sociedade',
  acolhimento: 'Acolhimento',
}

interface AuditResult {
  action: string
  detail: string
  targetId: string
}

function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clean) as T
  if (value && typeof value === 'object' && !(value instanceof Timestamp)) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, clean(item)])) as T
  }
  return value
}

function addAudit(batch: WriteBatch, db: Firestore, actor: Actor, result: AuditResult) {
  batch.set(db.collection('audit').doc(), {
    actorId: actor.id,
    action: result.action.slice(0, 100),
    detail: result.detail.slice(0, 300),
    targetId: result.targetId,
    at: Timestamp.now(),
  })
}

function profileRoles(data: DocumentData | undefined) {
  return Array.isArray(data?.roles) ? data.roles.map(String) : []
}

function activeSuperuser(data: DocumentData | undefined) {
  const roles = profileRoles(data)
  return data?.status === 'ativo' && roles.some((role) => SUPERUSER_ROLES.includes(role as Role))
}

function normalizedName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

type PersonPayload = Extract<MutationInput, { type: 'person.save' }>['person'] | Extract<MutationInput, { type: 'people.import' }>['people'][number]

function ebdDirectoryData(item: PersonPayload) {
  return clean({
    id: item.id,
    name: item.name,
    birthDate: item.birthDate,
    phone: item.phone,
    status: item.status,
    ebd: item.ebd,
    tither: false,
  })
}

function financeDirectoryData(item: PersonPayload) {
  return clean({
    id: item.id,
    name: item.name,
    status: item.status,
    tither: item.tither,
  })
}

function adultOn(date: string, now = new Date()) {
  const [year, month, day] = date.split('-').map(Number)
  const eighteenth = new Date(Date.UTC(year + 18, month - 1, day))
  return eighteenth.getTime() <= now.getTime()
}

function membershipSignature(value: Record<string, unknown> | undefined) {
  if (!value) return ''
  return JSON.stringify({
    memberNumber: Number(value.memberNumber ?? 0),
    type: value.type ?? '',
    status: value.status ?? '',
    joinedAt: value.joinedAt ?? '',
  })
}

async function savePerson(db: Firestore, actor: Actor, input: Extract<MutationInput, { type: 'person.save' }>) {
  requireRole(actor, MEMBER_MANAGER_ROLES)
  const item = input.person
  const personRef = db.collection('people').doc(item.id)
  const counterRef = db.collection('systemCounters').doc('people')
  let result: AuditResult | undefined

  await db.runTransaction(async (transaction) => {
    const [existing, counter] = await Promise.all([transaction.get(personRef), transaction.get(counterRef)])
    const previous = existing.data() ?? {}
    const oldMembership = previous.membership as Record<string, unknown> | undefined
    if (!isSuperuser(actor) && membershipSignature(item.membership as Record<string, unknown> | undefined) !== membershipSignature(oldMembership)) {
      throw new ApiError(403, 'membership_permission_denied', 'Somente Conselho e Administradores podem alterar o vínculo de membro.')
    }
    if (!existing.exists) {
      if (!item.birthDate || !item.sex) throw new ApiError(400, 'person_required_fields', 'Informe nome, nascimento e sexo.')
      if (!item.ebd && !item.membership && !item.tither) throw new ApiError(400, 'person_module_required', 'Selecione EBD, Membro ou Dizimista.')
      if (adultOn(item.birthDate) && !item.phone) throw new ApiError(400, 'adult_phone_required', 'Informe o celular da pessoa adulta.')
      if (item.ebd && !item.ebd.classId && !item.ebd.professor) throw new ApiError(400, 'ebd_class_required', 'Selecione a classe da EBD.')
    }

    const oldEbd = previous.ebd as Record<string, unknown> | undefined
    const counters = counter.data() ?? {}
    let nextEbd = Number(counters.nextEbdRegistrationNumber ?? 1)
    let nextMember = Number(counters.nextMemberNumber ?? 1)
    const nextEbdData = item.ebd ? { ...item.ebd, registrationNumber: Number(oldEbd?.registrationNumber ?? nextEbd) } : oldEbd
    if (item.ebd && !oldEbd?.registrationNumber) nextEbd += 1
    const nextMembership = item.membership ? { ...item.membership, memberNumber: Number(oldMembership?.memberNumber ?? nextMember) } : oldMembership
    if (item.membership && !oldMembership?.memberNumber) nextMember += 1

    const classIds = [...new Set([String(oldEbd?.classId ?? ''), String(nextEbdData?.classId ?? '')].filter(Boolean))]
    const classSnapshots = await Promise.all(classIds.map((classId) => transaction.get(db.collection('ebdClasses').doc(classId))))
    if (nextEbdData?.classId && !classSnapshots.find((snapshot) => snapshot.id === nextEbdData.classId)?.exists) {
      throw new ApiError(400, 'ebd_class_invalid', 'A classe selecionada não existe.')
    }

    const now = Timestamp.now()
    const saved = clean({
      ...item,
      ebd: nextEbdData,
      membership: nextMembership,
      source: previous.source ?? item.source ?? 'manual',
      createdAt: previous.createdAt ?? now,
      updatedAt: now,
    })
    transaction.set(personRef, saved)
    if (nextEbdData) transaction.set(db.collection('ebdDirectory').doc(item.id), ebdDirectoryData(saved as typeof item))
    else transaction.delete(db.collection('ebdDirectory').doc(item.id))
    if (item.tither) transaction.set(db.collection('financeDirectory').doc(item.id), financeDirectoryData(saved as typeof item))
    else transaction.delete(db.collection('financeDirectory').doc(item.id))
    transaction.set(counterRef, { nextEbdRegistrationNumber: nextEbd, nextMemberNumber: nextMember, updatedAt: now }, { merge: true })

    classSnapshots.forEach((snapshot) => {
      const studentIds = new Set(Array.isArray(snapshot.data()?.studentIds) ? snapshot.data()!.studentIds.map(String) : [])
      studentIds.delete(item.id)
      if (snapshot.id === nextEbdData?.classId && nextEbdData.status === 'ativo') studentIds.add(item.id)
      transaction.set(snapshot.ref, { studentIds: [...studentIds] }, { merge: true })
    })

    if (nextMembership) {
      const address = [item.address?.street, item.address?.numberComplement, item.address?.neighborhood, item.address?.city, item.address?.postalCode].filter(Boolean).join(', ')
      const memberData = clean({
        id: item.id,
        name: item.name,
        birthDate: item.birthDate ?? '',
        phone: item.phone ?? '',
        address: address || undefined,
        email: item.email,
        status: nextMembership.status,
        memberNumber: nextMembership.memberNumber,
        membershipType: nextMembership.type,
        createdAt: previous.createdAt ?? now,
      })
      transaction.set(db.collection('members').doc(item.id), memberData, { merge: true })
      transaction.set(db.collection('memberDirectory').doc(item.id), clean({ id: item.id, name: item.name, birthDate: item.birthDate ?? '', status: nextMembership.status, memberNumber: nextMembership.memberNumber, membershipType: nextMembership.type }), { merge: true })
    }

    result = { action: existing.exists ? 'pessoa.atualizada' : 'pessoa.criada', detail: item.name, targetId: item.id }
    transaction.set(db.collection('audit').doc(), { actorId: actor.id, ...result, at: now })
  })
  return result!
}

async function importPeople(db: Firestore, actor: Actor, input: Extract<MutationInput, { type: 'people.import' }>) {
  requireRole(actor, SUPERUSER_ROLES)
  if (input.importId !== 'ipcn-ebd-2026-10-30' || input.people.length !== 210) {
    throw new ApiError(400, 'import_invalid', 'A importação não corresponde ao banco validado da EBD.')
  }
  input.people.forEach((person, index) => {
    const registrationNumber = index + 1
    if (person.id !== `person-ipcn-${String(registrationNumber).padStart(4, '0')}` || person.ebd?.registrationNumber !== registrationNumber || person.membership || normalizedName(person.ebd?.className ?? '') === 'licenciados') {
      throw new ApiError(400, 'import_invalid', 'A ordem ou o conteúdo da importação foi alterado.')
    }
  })

  const markerRef = db.collection('dataImports').doc(input.importId)
  const counterRef = db.collection('systemCounters').doc('people')
  const personRefs = input.people.map((person) => db.collection('people').doc(person.id))
  const existingClasses = await db.collection('ebdClasses').get()
  const classesByName = new Map(existingClasses.docs.map((entry) => [normalizedName(String(entry.data().name ?? '')), entry.ref]))
  const classAliases = new Map([['cordeirinhos do senhor', 'cordeirinhos']])
  const importedByClass = new Map<string, string[]>()
  const classRefs = new Map<string, DocumentReference>()

  input.people.forEach((person) => {
    const className = person.ebd?.className
    if (!className) return
    const key = normalizedName(className)
    const matchKey = classAliases.get(key) ?? key
    const ref = classesByName.get(key) ?? classesByName.get(matchKey) ?? db.collection('ebdClasses').doc(`ebd-import-${key.replace(/ /g, '-').slice(0, 80)}`)
    classRefs.set(key, ref)
    importedByClass.set(ref.id, [...(importedByClass.get(ref.id) ?? []), person.id])
  })

  let result: AuditResult | undefined
  await db.runTransaction(async (transaction) => {
    const refsToRead = [markerRef, counterRef, ...classRefs.values(), ...personRefs]
    const snapshots = await transaction.getAll(...refsToRead)
    const marker = snapshots[0]
    const counter = snapshots[1]
    if (marker.data()?.status === 'completed') throw new ApiError(409, 'import_already_completed', 'Esta planilha já foi importada.')
    if (marker.data()?.status === 'processing') return
    if (snapshots.slice(2 + classRefs.size).some((snapshot) => snapshot.exists)) throw new ApiError(409, 'import_person_conflict', 'A importação encontrou cadastros já existentes.')

    const classSnapshots = snapshots.slice(2, 2 + classRefs.size)
    const classSnapshotById = new Map(classSnapshots.map((snapshot) => [snapshot.id, snapshot]))
    const now = Timestamp.now()
    input.people.forEach((raw) => {
      const className = raw.ebd?.className
      const classKey = className ? normalizedName(className) : ''
      const classRef = classKey ? classRefs.get(classKey) : undefined
      const resolvedClassName = classRef ? String(classSnapshotById.get(classRef.id)?.data()?.name ?? className) : undefined
      const person = clean({
        ...raw,
        ebd: raw.ebd ? { ...raw.ebd, classId: classRef?.id, className: resolvedClassName } : undefined,
        createdAt: now,
        updatedAt: now,
      })
      transaction.create(db.collection('people').doc(raw.id), person)
      transaction.create(db.collection('ebdDirectory').doc(raw.id), ebdDirectoryData(person as typeof raw))
    })

    classRefs.forEach((ref, key) => {
      const snapshot = classSnapshotById.get(ref.id)
      const studentIds = new Set(Array.isArray(snapshot?.data()?.studentIds) ? snapshot!.data()!.studentIds.map(String) : [])
      ;(importedByClass.get(ref.id) ?? []).forEach((personId) => studentIds.add(personId))
      const sourceName = input.people.find((person) => normalizedName(person.ebd?.className ?? '') === key)?.ebd?.className ?? key
      transaction.set(ref, { id: ref.id, name: snapshot?.data()?.name ?? sourceName, description: snapshot?.data()?.description ?? '', teacherIds: snapshot?.data()?.teacherIds ?? [], studentIds: [...studentIds], active: true }, { merge: true })
    })

    const highestRegistration = Math.max(...input.people.map((person) => Number(person.ebd?.registrationNumber ?? 0)))
    transaction.set(counterRef, {
      nextEbdRegistrationNumber: Math.max(Number(counter.data()?.nextEbdRegistrationNumber ?? 1), highestRegistration + 1),
      nextMemberNumber: Math.max(Number(counter.data()?.nextMemberNumber ?? 1), 1),
      updatedAt: now,
    }, { merge: true })
    transaction.create(markerRef, { id: input.importId, count: input.people.length, source: 'BANCO IPCN (1).xlsx', status: 'processing', importedAt: now, importedBy: actor.id })
  })

  const storedPeople = await db.getAll(...personRefs)
  if (storedPeople.some((snapshot) => !snapshot.exists)) throw new ApiError(409, 'import_incomplete', 'A primeira etapa da importação não foi concluída.')
  const batch = db.batch()
  storedPeople.forEach((snapshot) => {
    const person = snapshot.data() as PersonPayload
    if (person.tither) batch.set(db.collection('financeDirectory').doc(snapshot.id), financeDirectoryData(person))
  })
  const completedAt = Timestamp.now()
  result = { action: 'pessoas.importadas', detail: `${input.people.length} cadastros da EBD`, targetId: input.importId }
  batch.update(markerRef, { status: 'completed', completedAt })
  addAudit(batch, db, actor, result)
  await batch.commit()
  return result!
}

async function saveVisitor(db: Firestore, actor: Actor, input: Extract<MutationInput, { type: 'visitor.save' }>) {
  requireRole(actor, VISITOR_ROLES)
  const item = input.visitor
  const ref = db.collection('visitors').doc(item.id)
  const existing = await ref.get()
  const previous = existing.data()
  const data = clean({
    ...item,
    contacted: existing.exists ? previous?.contacted === true : false,
    lastContactAt: existing.exists ? previous?.lastContactAt : undefined,
    contactOwner: existing.exists ? previous?.contactOwner : undefined,
    createdAt: previous?.createdAt ?? Timestamp.now(),
  })
  const batch = db.batch()
  batch.set(ref, data)
  const result = { action: existing.exists ? 'visitante.atualizado' : 'visitante.criado', detail: item.name, targetId: item.id }
  addAudit(batch, db, actor, result)
  await batch.commit()
  return result
}

async function contactVisitor(db: Firestore, actor: Actor, input: Extract<MutationInput, { type: 'visitor.contact' }>) {
  requireRole(actor, VISITOR_ROLES)
  const ref = db.collection('visitors').doc(input.visitorId)
  const snapshot = await ref.get()
  if (!snapshot.exists) throw new ApiError(404, 'visitor_not_found', 'Visitante não encontrado.')
  const visitor = snapshot.data() ?? {}
  if (visitor.consent !== true || visitor.doNotContact === true) {
    throw new ApiError(409, 'contact_not_allowed', 'Este visitante não autorizou o contato.')
  }
  const batch = db.batch()
  batch.update(ref, { contacted: true, lastContactAt: Timestamp.now(), contactOwner: actor.name })
  const result = { action: 'visitante.contatado', detail: String(visitor.name ?? ''), targetId: input.visitorId }
  addAudit(batch, db, actor, result)
  await batch.commit()
  return result
}

async function saveClass(db: Firestore, actor: Actor, input: Extract<MutationInput, { type: 'ebd.class.save' }>) {
  requireRole(actor, EBD_MANAGER_ROLES)
  const item = input.item
  const userRefs = item.teacherIds.map((id) => db.collection('users').doc(id))
  const memberRefs = item.studentIds.map((id) => db.collection('people').doc(id))
  const [teachers, students, allUsers, existing] = await Promise.all([
    userRefs.length ? db.getAll(...userRefs) : [],
    memberRefs.length ? db.getAll(...memberRefs) : [],
    db.collection('users').get(),
    db.collection('ebdClasses').doc(item.id).get(),
  ])
  const existingStudents = existing.exists && Array.isArray(existing.data()?.studentIds) ? existing.data()!.studentIds.map(String).sort() : []
  if (JSON.stringify([...item.studentIds].sort()) !== JSON.stringify(existingStudents)) {
    throw new ApiError(403, 'student_assignment_denied', 'As matrículas devem ser alteradas pelo cadastro da pessoa.')
  }
  if (teachers.some((entry) => !entry.exists || entry.data()?.status !== 'ativo' || !profileRoles(entry.data()).some((role) => ['professor', ...SUPERUSER_ROLES].includes(role)))) {
    throw new ApiError(400, 'invalid_teacher', 'Selecione somente professores ativos.')
  }
  if (students.some((entry) => !entry.exists || entry.data()?.status !== 'ativo' || entry.data()?.ebd?.status !== 'ativo')) {
    throw new ApiError(400, 'invalid_student', 'Um aluno selecionado não está disponível para matrícula.')
  }
  if (allUsers.size > 400) throw new ApiError(409, 'user_limit', 'A atualização excede o limite seguro de usuários.')

  const batch = db.batch()
  batch.set(db.collection('ebdClasses').doc(item.id), clean(item))
  allUsers.docs.forEach((user) => {
    const current: string[] = Array.isArray(user.data().classIds) ? (user.data().classIds as unknown[]).map(String) : []
    const next = current.filter((id) => id !== item.id)
    if (item.teacherIds.includes(user.id)) next.push(item.id)
    if (JSON.stringify(current) !== JSON.stringify(next)) batch.update(user.ref, { classIds: next, updatedAt: Timestamp.now() })
  })
  const result = { action: existing.exists ? 'ebd.classe_atualizada' : 'ebd.classe_criada', detail: item.name, targetId: item.id }
  addAudit(batch, db, actor, result)
  await batch.commit()
  return result
}

async function saveAttendance(db: Firestore, actor: Actor, input: Extract<MutationInput, { type: 'ebd.attendance.save' }>) {
  const classRef = db.collection('ebdClasses').doc(input.classId)
  const classSnapshot = await classRef.get()
  if (!classSnapshot.exists) throw new ApiError(404, 'class_not_found', 'Classe não encontrada.')
  const classData = classSnapshot.data() ?? {}
  const manager = actor.roles.some((role) => EBD_MANAGER_ROLES.includes(role))
  const assigned = actor.roles.includes('professor') && (actor.classIds.includes(input.classId) || (Array.isArray(classData.teacherIds) && classData.teacherIds.includes(actor.id)))
  if (!manager && !assigned) throw new ApiError(403, 'class_not_assigned', 'Você não está autorizado a realizar a chamada desta classe.')
  const students = new Set(Array.isArray(classData.studentIds) ? classData.studentIds.map(String) : [])
  if (Object.keys(input.records).some((memberId) => !students.has(memberId))) {
    throw new ApiError(400, 'attendance_student_invalid', 'A chamada contém uma pessoa que não pertence à classe.')
  }
  if (Object.values(input.records).some((status) => status === 'visitante')) {
    throw new ApiError(400, 'attendance_status_invalid', 'Visitantes devem ser registrados na área própria da chamada.')
  }
  if (input.status === 'finalizada' && [...students].some((memberId) => !input.records[memberId])) {
    throw new ApiError(400, 'attendance_incomplete', 'Marque a presença de todos os alunos antes de finalizar a chamada.')
  }

  const existing = await db.collection('attendance').where('classId', '==', input.classId).where('date', '==', input.date).limit(1).get()
  const existingDocument = existing.docs[0]
  if (existingDocument && existingDocument.data().status !== 'rascunho' && !manager) {
    throw new ApiError(409, 'attendance_finalized', 'Esta chamada já foi finalizada.')
  }
  const ref = existingDocument?.ref ?? db.collection('attendance').doc(`${input.classId}_${input.date}`)
  const batch = db.batch()
  batch.set(ref, clean({ id: ref.id, classId: input.classId, date: input.date, records: input.records, visitors: input.visitors, status: input.status, createdBy: actor.id, updatedAt: Timestamp.now() }))
  const result = { action: input.status === 'finalizada' ? 'ebd.chamada_finalizada' : 'ebd.chamada_rascunho', detail: `${String(classData.name ?? 'Classe')} em ${input.date}`, targetId: ref.id }
  addAudit(batch, db, actor, result)
  await batch.commit()
  return result
}

async function saveSociety(db: Firestore, actor: Actor, input: Extract<MutationInput, { type: 'society.save' }>) {
  requireRole(actor, SOCIETY_MANAGER_ROLES)
  const item = input.item
  const ref = db.collection('societies').doc(item.id)
  const [existing, allUsers, leaders, members] = await Promise.all([
    ref.get(),
    db.collection('users').get(),
    item.leaderIds.length ? db.getAll(...item.leaderIds.map((id) => db.collection('users').doc(id))) : [],
    item.memberIds.length ? db.getAll(...item.memberIds.map((id) => db.collection('members').doc(id))) : [],
  ])
  if (!existing.exists) throw new ApiError(404, 'society_not_found', 'Sociedade não encontrada.')
  const previous = existing.data() ?? {}
  if (previous.code !== item.code || previous.name !== item.name) throw new ApiError(400, 'society_identity_changed', 'A identificação da sociedade não pode ser alterada.')
  if (leaders.some((entry) => !entry.exists || entry.data()?.status !== 'ativo' || !profileRoles(entry.data()).includes('lider'))) {
    throw new ApiError(400, 'invalid_society_leader', 'Selecione somente líderes ativos.')
  }
  if (members.some((entry) => !entry.exists || entry.data()?.status !== 'Ativo')) {
    throw new ApiError(400, 'invalid_society_member', 'Selecione somente membros ativos.')
  }
  const memberIds = new Set(item.memberIds)
  if (item.officers.some((officer) => !memberIds.has(officer.memberId)) || new Set(item.officers.map((officer) => officer.role)).size !== item.officers.length) {
    throw new ApiError(400, 'invalid_society_officer', 'A diretoria contém uma indicação inválida.')
  }
  if (allUsers.size > 400) throw new ApiError(409, 'user_limit', 'A atualização excede o limite seguro de usuários.')

  const batch = db.batch()
  batch.set(ref, clean(item))
  allUsers.docs.forEach((user) => {
    const current: string[] = Array.isArray(user.data().societyIds) ? (user.data().societyIds as unknown[]).map(String) : []
    const next = current.filter((id) => id !== item.id)
    if (item.leaderIds.includes(user.id)) next.push(item.id)
    if (JSON.stringify(current) !== JSON.stringify(next)) batch.update(user.ref, { societyIds: next, updatedAt: Timestamp.now() })
  })
  const result = { action: 'sociedade.atualizada', detail: item.code, targetId: item.id }
  addAudit(batch, db, actor, result)
  await batch.commit()
  return result
}

async function createSocietyRequest(db: Firestore, actor: Actor, input: Extract<MutationInput, { type: 'society.request.create' }>) {
  requireRole(actor, ['lider'])
  const [society, member, pending] = await Promise.all([
    db.collection('societies').doc(input.societyId).get(),
    db.collection('members').doc(input.memberId).get(),
    db.collection('societyRequests').where('societyId', '==', input.societyId).where('memberId', '==', input.memberId).where('status', '==', 'pendente').limit(1).get(),
  ])
  if (!society.exists) throw new ApiError(404, 'society_not_found', 'Sociedade não encontrada.')
  const societyData = society.data() ?? {}
  const assigned = actor.societyIds.includes(input.societyId) || (Array.isArray(societyData.leaderIds) && societyData.leaderIds.includes(actor.id))
  if (!assigned) throw new ApiError(403, 'society_not_assigned', 'Você não está autorizado a solicitar inclusões nesta sociedade.')
  if (!member.exists || member.data()?.status !== 'Ativo') throw new ApiError(400, 'member_not_active', 'Selecione um membro ativo.')
  if (Array.isArray(societyData.memberIds) && societyData.memberIds.includes(input.memberId)) throw new ApiError(409, 'member_already_added', 'Este membro já pertence à sociedade.')
  if (!pending.empty) throw new ApiError(409, 'request_already_pending', 'Já existe um pedido pendente para este membro.')
  const ref = db.collection('societyRequests').doc(input.id)
  if ((await ref.get()).exists) throw new ApiError(409, 'request_id_conflict', 'Não foi possível registrar o pedido. Tente novamente.')

  const batch = db.batch()
  batch.set(ref, {
    id: input.id,
    societyId: input.societyId,
    memberId: input.memberId,
    requestedBy: actor.id,
    requestedAt: Timestamp.now(),
    status: 'pendente',
  })
  const result = { action: 'sociedade.inclusao_solicitada', detail: String(societyData.code ?? ''), targetId: input.id }
  addAudit(batch, db, actor, result)
  await batch.commit()
  return result
}

async function reviewSocietyRequest(db: Firestore, actor: Actor, input: Extract<MutationInput, { type: 'society.request.review' }>) {
  requireRole(actor, SOCIETY_MANAGER_ROLES)
  let result: AuditResult | undefined
  await db.runTransaction(async (transaction) => {
    const requestRef = db.collection('societyRequests').doc(input.requestId)
    const request = await transaction.get(requestRef)
    if (!request.exists) throw new ApiError(404, 'request_not_found', 'Pedido não encontrado.')
    const requestData = request.data() ?? {}
    if (requestData.status !== 'pendente') throw new ApiError(409, 'request_already_reviewed', 'Este pedido já foi analisado.')
    const societyRef = db.collection('societies').doc(String(requestData.societyId))
    const society = await transaction.get(societyRef)
    if (!society.exists) throw new ApiError(404, 'society_not_found', 'Sociedade não encontrada.')
    const member = await transaction.get(db.collection('members').doc(String(requestData.memberId)))
    if (!member.exists || member.data()?.status !== 'Ativo') {
      throw new ApiError(409, 'member_not_active', 'O membro precisa estar ativo para ser incluído na sociedade.')
    }
    transaction.update(requestRef, { status: input.approved ? 'aprovada' : 'recusada', reviewedBy: actor.id })
    if (input.approved) {
      const memberIds = Array.isArray(society.data()?.memberIds) ? society.data()!.memberIds.map(String) : []
      if (!memberIds.includes(String(requestData.memberId))) memberIds.push(String(requestData.memberId))
      transaction.update(societyRef, { memberIds })
    }
    result = {
      action: input.approved ? 'sociedade.inclusao_aprovada' : 'sociedade.inclusao_recusada',
      detail: String(society.data()?.code ?? ''),
      targetId: input.requestId,
    }
    transaction.set(db.collection('audit').doc(), { actorId: actor.id, ...result, at: Timestamp.now() })
  })
  return result!
}

async function canonicalContributionItems(db: Firestore, items: Extract<MutationInput, { type: 'finance.batch.save' }>['batch']['items']) {
  const personIds = [...new Set(items.flatMap((item) => item.personId ? [item.personId] : []))]
  const snapshots = personIds.length ? await db.getAll(...personIds.map((personId) => db.collection('financeDirectory').doc(personId))) : []
  const people = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot.data()]))
  return items.map((item) => {
    if (item.anonymous) return { ...item, contributorName: 'Anônimo', personId: undefined }
    const person = item.personId ? people.get(item.personId) : undefined
    if (!person || person.status !== 'ativo' || person.tither !== true) throw new ApiError(400, 'contributor_unavailable', 'Selecione um dizimista ativo para a contribuição.')
    return { ...item, contributorName: String(person.name ?? '').slice(0, 120) }
  })
}

async function saveFinanceBatch(db: Firestore, actor: Actor, input: Extract<MutationInput, { type: 'finance.batch.save' }>) {
  requireRole(actor, FINANCE_ROLES)
  const ref = db.collection('financeBatches').doc(input.batch.id)
  const items = await canonicalContributionItems(db, input.batch.items)
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref)
    if (existing.exists && (existing.data()?.createdBy !== actor.id || existing.data()?.status !== 'rascunho')) {
      throw new ApiError(409, 'finance_batch_locked', 'Este lote não pode mais ser alterado.')
    }
    const now = Timestamp.now()
    transaction.set(ref, clean({
      id: input.batch.id,
      date: input.batch.date,
      items,
      status: 'rascunho',
      createdBy: actor.id,
      createdByName: actor.name,
      createdAt: existing.data()?.createdAt ?? now,
      updatedAt: now,
    }))
  })
  return { action: 'financeiro.lote_salvo', detail: `${items.length} contribuição(ões)`, targetId: input.batch.id }
}

async function finalizeFinanceBatch(db: Firestore, actor: Actor, input: Extract<MutationInput, { type: 'finance.batch.finalize' }>) {
  requireRole(actor, FINANCE_ROLES)
  let result: AuditResult | undefined
  await db.runTransaction(async (transaction) => {
    const ref = db.collection('financeBatches').doc(input.batchId)
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists) throw new ApiError(404, 'finance_batch_not_found', 'Lote não encontrado.')
    const data = snapshot.data() ?? {}
    if (data.createdBy !== actor.id) throw new ApiError(403, 'finance_batch_owner', 'Somente quem criou o lote pode finalizá-lo.')
    if (data.status !== 'rascunho') throw new ApiError(409, 'finance_batch_locked', 'Este lote já foi encerrado.')
    const items = Array.isArray(data.items) ? data.items : []
    if (!items.length) throw new ApiError(400, 'finance_batch_empty', 'Adicione pelo menos uma contribuição antes de finalizar.')
    const now = Timestamp.now()
    let total = 0
    items.forEach((raw) => {
      const item = raw as Record<string, unknown>
      const amount = Number(item.amount)
      total += amount
      const entryId = `${input.batchId}_${String(item.id)}`
      transaction.create(db.collection('financeEntries').doc(entryId), clean({
        id: entryId,
        batchId: input.batchId,
        date: data.date,
        amount,
        category: item.category,
        method: item.method,
        personId: item.personId,
        contributorName: item.contributorName,
        anonymous: item.anonymous === true,
        status: 'ativo',
        createdBy: actor.id,
        createdByName: actor.name,
        createdAt: now,
      }))
    })
    transaction.update(ref, { status: 'finalizado', finalizedAt: now, updatedAt: now, itemCount: items.length, total, items: [] })
    result = { action: 'financeiro.lote_finalizado', detail: `${items.length} contribuição(ões)`, targetId: input.batchId }
    transaction.set(db.collection('audit').doc(), { actorId: actor.id, ...result, at: now })
  })
  return result!
}

async function discardFinanceBatch(db: Firestore, actor: Actor, input: Extract<MutationInput, { type: 'finance.batch.discard' }>) {
  requireRole(actor, FINANCE_ROLES)
  const ref = db.collection('financeBatches').doc(input.batchId)
  const result = { action: 'financeiro.lote_descartado', detail: 'Rascunho descartado', targetId: input.batchId }
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists) throw new ApiError(404, 'finance_batch_not_found', 'Lote não encontrado.')
    if (snapshot.data()?.createdBy !== actor.id || snapshot.data()?.status !== 'rascunho') throw new ApiError(409, 'finance_batch_locked', 'Este lote não pode ser descartado.')
    const now = Timestamp.now()
    transaction.update(ref, { status: 'descartado', items: [], updatedAt: now })
    transaction.set(db.collection('audit').doc(), { actorId: actor.id, ...result, at: now })
  })
  return result
}

async function cancelFinanceEntry(db: Firestore, actor: Actor, input: Extract<MutationInput, { type: 'finance.entry.cancel' }>) {
  requireRole(actor, FINANCE_ROLES)
  const ref = db.collection('financeEntries').doc(input.entryId)
  const result = { action: 'financeiro.contribuicao_cancelada', detail: input.reason, targetId: input.entryId }
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    if (!snapshot.exists) throw new ApiError(404, 'finance_entry_not_found', 'Contribuição não encontrada.')
    if (snapshot.data()?.status !== 'ativo') throw new ApiError(409, 'finance_entry_cancelled', 'Esta contribuição já foi cancelada.')
    const now = Timestamp.now()
    transaction.update(ref, { status: 'cancelado', cancelledAt: now, cancelledBy: actor.id, cancelledByName: actor.name, cancellationReason: input.reason })
    transaction.set(db.collection('audit').doc(), { actorId: actor.id, ...result, at: now })
  })
  return result
}

async function updateSettings(db: Firestore, actor: Actor, input: Extract<MutationInput, { type: 'settings.update' }>) {
  requireRole(actor, SUPERUSER_ROLES)
  const batch = db.batch()
  batch.set(db.collection('appSettings').doc('general'), { whatsappMessage: input.whatsappMessage })
  const result = { action: 'configuracao.whatsapp_atualizada', detail: 'Mensagem de acolhimento', targetId: 'general' }
  addAudit(batch, db, actor, result)
  await batch.commit()
  return result
}

async function updateOwnProfile(db: Firestore, actor: Actor, input: Extract<MutationInput, { type: 'user.profile.update' }>) {
  const ref = db.collection('users').doc(actor.id)
  const update: Record<string, unknown> = { name: input.name, updatedAt: Timestamp.now() }
  if (input.photo !== undefined) update.photo = input.photo
  const batch = db.batch()
  batch.update(ref, update)
  const result = { action: 'usuario.perfil_atualizado', detail: 'Perfil próprio', targetId: actor.id }
  addAudit(batch, db, actor, result)
  await batch.commit()
  return result
}

async function assertReferencedAccess(db: Firestore, classIds: string[], societyIds: string[]) {
  const refs = [
    ...classIds.map((id) => db.collection('ebdClasses').doc(id)),
    ...societyIds.map((id) => db.collection('societies').doc(id)),
  ]
  if (!refs.length) return
  const snapshots = await db.getAll(...refs)
  if (snapshots.some((snapshot) => !snapshot.exists)) throw new ApiError(400, 'access_scope_invalid', 'Uma classe ou sociedade selecionada não existe.')
}

async function saveUserAccess(db: Firestore, actor: Actor, input: Extract<MutationInput, { type: 'user.access.save' }>, auth: ReturnType<typeof getAdminServices>['auth']) {
  requireRole(actor, SUPERUSER_ROLES)
  if (input.userId === actor.id) throw new ApiError(403, 'self_access_change', 'Você não pode alterar o próprio acesso.')
  const classIds = input.roles.includes('professor') ? input.classIds : []
  const societyIds = input.roles.includes('lider') ? input.societyIds : []
  await assertReferencedAccess(db, classIds, societyIds)
  const authUser = await auth.getUser(input.userId)
  if (!authUser.emailVerified) throw new ApiError(409, 'target_email_unverified', 'O e-mail precisa estar verificado antes da aprovação.')

  let result: AuditResult | undefined
  await db.runTransaction(async (transaction) => {
    const [target, users, classes, societies] = await Promise.all([
      transaction.get(db.collection('users').doc(input.userId)),
      transaction.get(db.collection('users')),
      transaction.get(db.collection('ebdClasses')),
      transaction.get(db.collection('societies')),
    ])
    if (!target.exists) throw new ApiError(404, 'user_not_found', 'Usuário não encontrado.')
    const targetData = target.data() ?? {}
    const nextIsSuperuser = input.roles.some((role) => SUPERUSER_ROLES.includes(role))
    if (activeSuperuser(targetData) && !nextIsSuperuser && !users.docs.some((user) => user.id !== input.userId && activeSuperuser(user.data()))) {
      throw new ApiError(409, 'last_superuser', 'O sistema precisa manter pelo menos um Administrador ou membro do Conselho ativo.')
    }
    transaction.update(target.ref, {
      roles: input.roles,
      requestedRoles: [],
      classIds,
      societyIds,
      office: input.roles.map((role) => ROLE_LABELS[role]).join(', '),
      status: 'ativo',
      emailVerified: true,
      approvedAt: Timestamp.now(),
      approvedBy: actor.id,
      updatedAt: Timestamp.now(),
    })
    classes.docs.forEach((entry) => {
      const teacherIds: string[] = Array.isArray(entry.data().teacherIds) ? (entry.data().teacherIds as unknown[]).map(String).filter((id) => id !== input.userId) : []
      if (classIds.includes(entry.id)) teacherIds.push(input.userId)
      transaction.update(entry.ref, { teacherIds })
    })
    societies.docs.forEach((entry) => {
      const leaderIds: string[] = Array.isArray(entry.data().leaderIds) ? (entry.data().leaderIds as unknown[]).map(String).filter((id) => id !== input.userId) : []
      if (societyIds.includes(entry.id)) leaderIds.push(input.userId)
      transaction.update(entry.ref, { leaderIds })
    })
    result = {
      action: targetData.status === 'pendente' ? 'usuario.aprovado' : 'usuario.permissoes_atualizadas',
      detail: String(targetData.name ?? ''),
      targetId: input.userId,
    }
    transaction.set(db.collection('audit').doc(), { actorId: actor.id, ...result, at: Timestamp.now() })
  })
  return result!
}

async function rejectUserAccess(db: Firestore, actor: Actor, input: Extract<MutationInput, { type: 'user.access.reject' }>) {
  requireRole(actor, SUPERUSER_ROLES)
  if (input.userId === actor.id) throw new ApiError(403, 'self_access_change', 'Você não pode alterar o próprio acesso.')
  const ref = db.collection('users').doc(input.userId)
  const target = await ref.get()
  if (!target.exists) throw new ApiError(404, 'user_not_found', 'Usuário não encontrado.')
  if (target.data()?.status !== 'pendente') throw new ApiError(409, 'user_not_pending', 'Somente solicitações pendentes podem ser recusadas.')
  const batch = db.batch()
  batch.update(ref, { status: 'desativado', roles: [], requestedRoles: [], classIds: [], societyIds: [], updatedAt: Timestamp.now() })
  const result = { action: 'usuario.pedido_recusado', detail: String(target.data()?.name ?? ''), targetId: input.userId }
  addAudit(batch, db, actor, result)
  await batch.commit()
  return result
}

async function toggleUserAccess(db: Firestore, actor: Actor, input: Extract<MutationInput, { type: 'user.access.toggle' }>, auth: ReturnType<typeof getAdminServices>['auth']) {
  requireRole(actor, SUPERUSER_ROLES)
  if (input.userId === actor.id) throw new ApiError(403, 'self_access_change', 'Você não pode desativar a si mesmo.')
  const authUser = await auth.getUser(input.userId)
  let result: AuditResult | undefined
  await db.runTransaction(async (transaction) => {
    const [target, users] = await Promise.all([
      transaction.get(db.collection('users').doc(input.userId)),
      transaction.get(db.collection('users')),
    ])
    if (!target.exists) throw new ApiError(404, 'user_not_found', 'Usuário não encontrado.')
    const data = target.data() ?? {}
    const nextStatus = data.status === 'ativo' ? 'desativado' : 'ativo'
    if (nextStatus === 'desativado' && activeSuperuser(data) && !users.docs.some((user) => user.id !== input.userId && activeSuperuser(user.data()))) {
      throw new ApiError(409, 'last_superuser', 'Não é possível desativar o último Administrador ou membro do Conselho ativo.')
    }
    if (nextStatus === 'ativo') {
      if (!profileRoles(data).length) throw new ApiError(409, 'roles_missing', 'Defina pelo menos um papel antes de reativar.')
      if (!authUser.emailVerified) throw new ApiError(409, 'target_email_unverified', 'O e-mail precisa estar verificado antes da reativação.')
    }
    transaction.update(target.ref, { status: nextStatus, emailVerified: nextStatus === 'ativo' ? true : data.emailVerified, updatedAt: Timestamp.now() })
    result = {
      action: nextStatus === 'ativo' ? 'usuario.reativado' : 'usuario.desativado',
      detail: String(data.name ?? ''),
      targetId: input.userId,
    }
    transaction.set(db.collection('audit').doc(), { actorId: actor.id, ...result, at: Timestamp.now() })
  })
  return result!
}

async function executeMutation(input: MutationInput, actor: Actor, services: ReturnType<typeof getAdminServices>) {
  const { db, auth } = services
  switch (input.type) {
    case 'person.save': return savePerson(db, actor, input)
    case 'people.import': return importPeople(db, actor, input)
    case 'visitor.save': return saveVisitor(db, actor, input)
    case 'visitor.contact': return contactVisitor(db, actor, input)
    case 'ebd.class.save': return saveClass(db, actor, input)
    case 'ebd.attendance.save': return saveAttendance(db, actor, input)
    case 'society.save': return saveSociety(db, actor, input)
    case 'society.request.create': return createSocietyRequest(db, actor, input)
    case 'society.request.review': return reviewSocietyRequest(db, actor, input)
    case 'finance.batch.save': return saveFinanceBatch(db, actor, input)
    case 'finance.batch.finalize': return finalizeFinanceBatch(db, actor, input)
    case 'finance.batch.discard': return discardFinanceBatch(db, actor, input)
    case 'finance.entry.cancel': return cancelFinanceEntry(db, actor, input)
    case 'settings.update': return updateSettings(db, actor, input)
    case 'user.profile.update': return updateOwnProfile(db, actor, input)
    case 'user.access.save': return saveUserAccess(db, actor, input, auth)
    case 'user.access.reject': return rejectUserAccess(db, actor, input)
    case 'user.access.toggle': return toggleUserAccess(db, actor, input, auth)
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID()
  try {
    assertSameOrigin(request)
    const idToken = readBearerToken(request)
    const input = await parseMutation(request)
    const services = getAdminServices(request)
    const actor = await authenticate(idToken, services.auth, services.db)
    const result = await executeMutation(input, actor, services)
    console.info(JSON.stringify({ event: 'secure_mutation', requestId, actorId: actor.id, type: input.type, targetId: result.targetId }))
    return json({ ok: true, requestId })
  } catch (error) {
    const known = error instanceof ApiError
    const setup = error instanceof AdminSetupError
    console.error(JSON.stringify({
      event: 'secure_mutation_failed',
      requestId,
      code: known ? error.code : setup ? error.reason : 'internal_error',
      errorName: error instanceof Error ? error.name : 'UnknownError',
    }))
    return json({
      ok: false,
      requestId,
      code: known ? error.code : 'internal_error',
      message: known ? error.message : 'Não foi possível concluir a operação. Tente novamente.',
    }, known ? error.status : setup ? 503 : 500)
  }
}
