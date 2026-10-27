import { Timestamp, type DocumentData, type Firestore, type WriteBatch } from 'firebase-admin/firestore'
import { AdminSetupError, getAdminServices } from './_lib/firebaseAdmin.js'
import { ApiError, assertSameOrigin, authenticate, isSuperuser, json, parseMutation, readBearerToken, requireRole, type Actor } from './_lib/security.js'
import type { MutationInput, Role } from './_lib/schemas.js'

const SUPERUSER_ROLES: Role[] = ['administrador', 'conselho']
const MEMBER_MANAGER_ROLES: Role[] = [...SUPERUSER_ROLES, 'secretaria']
const VISITOR_ROLES: Role[] = [...MEMBER_MANAGER_ROLES, 'acolhimento']
const EBD_MANAGER_ROLES: Role[] = [...MEMBER_MANAGER_ROLES]
const SOCIETY_MANAGER_ROLES: Role[] = [...SUPERUSER_ROLES]
const FINANCE_ROLES: Role[] = [...SUPERUSER_ROLES, 'tesouraria']
const ROLE_LABELS: Record<Role, string> = {
  administrador: 'Administrador',
  conselho: 'Conselho',
  secretaria: 'Secretaria',
  tesouraria: 'Tesouraria',
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

function isSunday(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay() === 0
}

function storedFilePathIsValid(file: { storagePath?: string } | undefined, prefix: string) {
  return !file || Boolean(file.storagePath?.startsWith(prefix))
}

function profileRoles(data: DocumentData | undefined) {
  return Array.isArray(data?.roles) ? data.roles.map(String) : []
}

function activeSuperuser(data: DocumentData | undefined) {
  const roles = profileRoles(data)
  return data?.status === 'ativo' && roles.some((role) => SUPERUSER_ROLES.includes(role as Role))
}

async function saveMember(db: Firestore, actor: Actor, input: Extract<MutationInput, { type: 'member.save' }>) {
  requireRole(actor, MEMBER_MANAGER_ROLES)
  const item = input.member
  if (!isSuperuser(actor) && (item.restrictedNotes || item.documents.length)) {
    throw new ApiError(403, 'restricted_member_data', 'Somente Conselho e Administradores podem alterar a área pastoral restrita.')
  }
  if (item.documents.some((file) => !storedFilePathIsValid(file, `members/${item.id}/`))) {
    throw new ApiError(400, 'invalid_storage_path', 'Um anexo possui vínculo inválido.')
  }

  const memberRef = db.collection('members').doc(item.id)
  const existing = await memberRef.get()
  const batch = db.batch()
  const createdAt = existing.data()?.createdAt ?? Timestamp.now()
  const { restrictedNotes, documents, ...publicData } = item
  batch.set(memberRef, clean({ ...publicData, createdAt }))
  batch.set(db.collection('memberDirectory').doc(item.id), {
    id: item.id,
    name: item.name,
    birthDate: item.birthDate,
    status: item.status,
  })
  if (isSuperuser(actor)) {
    batch.set(db.collection('memberPrivate').doc(item.id), clean({
      id: item.id,
      restrictedNotes,
      documents,
    }))
  }
  const result = { action: existing.exists ? 'membro.atualizado' : 'membro.criado', detail: item.name, targetId: item.id }
  addAudit(batch, db, actor, result)
  await batch.commit()
  return result
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
  const memberRefs = item.studentIds.map((id) => db.collection('members').doc(id))
  const [teachers, students, allUsers, existing] = await Promise.all([
    userRefs.length ? db.getAll(...userRefs) : [],
    memberRefs.length ? db.getAll(...memberRefs) : [],
    db.collection('users').get(),
    db.collection('ebdClasses').doc(item.id).get(),
  ])
  if (teachers.some((entry) => !entry.exists || entry.data()?.status !== 'ativo' || !profileRoles(entry.data()).some((role) => ['professor', ...SUPERUSER_ROLES].includes(role)))) {
    throw new ApiError(400, 'invalid_teacher', 'Selecione somente professores ativos.')
  }
  if (students.some((entry) => !entry.exists || ['Excluído', 'Falecido'].includes(String(entry.data()?.status)))) {
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
  if (!isSunday(input.date)) throw new ApiError(400, 'attendance_not_sunday', 'A chamada da EBD só pode ser registrada aos domingos.')
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

  const existing = await db.collection('attendance').where('classId', '==', input.classId).where('date', '==', input.date).limit(1).get()
  const ref = existing.docs[0]?.ref ?? db.collection('attendance').doc(input.id)
  const batch = db.batch()
  batch.set(ref, { id: ref.id, classId: input.classId, date: input.date, records: input.records, createdBy: actor.id })
  const result = { action: 'ebd.chamada_salva', detail: `${String(classData.name ?? 'Classe')} em ${input.date}`, targetId: ref.id }
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

async function createFinanceEntry(db: Firestore, actor: Actor, input: Extract<MutationInput, { type: 'finance.create' }>) {
  requireRole(actor, FINANCE_ROLES)
  const item = input.entry
  if (!storedFilePathIsValid(item.receipt, `finance/${item.id}/`)) throw new ApiError(400, 'invalid_storage_path', 'O comprovante possui vínculo inválido.')
  const ref = db.collection('financeEntries').doc(item.id)
  if ((await ref.get()).exists) throw new ApiError(409, 'finance_id_conflict', 'Não foi possível registrar o lançamento. Tente novamente.')
  const batch = db.batch()
  batch.set(ref, clean({ ...item, createdBy: actor.id }))
  const result = { action: 'financeiro.lancamento_criado', detail: `${item.type}: ${item.category}`, targetId: item.id }
  addAudit(batch, db, actor, result)
  await batch.commit()
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
    case 'member.save': return saveMember(db, actor, input)
    case 'visitor.save': return saveVisitor(db, actor, input)
    case 'visitor.contact': return contactVisitor(db, actor, input)
    case 'ebd.class.save': return saveClass(db, actor, input)
    case 'ebd.attendance.save': return saveAttendance(db, actor, input)
    case 'society.save': return saveSociety(db, actor, input)
    case 'society.request.create': return createSocietyRequest(db, actor, input)
    case 'society.request.review': return reviewSocietyRequest(db, actor, input)
    case 'finance.create': return createFinanceEntry(db, actor, input)
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
