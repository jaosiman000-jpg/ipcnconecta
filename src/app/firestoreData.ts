import {
  collection,
  doc,
  documentId,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { firestore } from './firebase'
import { hasCapability, isSuperuser } from './permissions'
import { callSecureMutation, type SecureMutation } from './secureApi'
import type { AppData, AuditEntry, Member, User } from './types'

type DataKey = 'visitors' | 'classes' | 'attendance' | 'societies' | 'societyRequests' | 'finance'

const collectionNames: Record<DataKey, string> = {
  visitors: 'visitors',
  classes: 'ebdClasses',
  attendance: 'attendance',
  societies: 'societies',
  societyRequests: 'societyRequests',
  finance: 'financeEntries',
}

function fromFirestore(value: unknown): unknown {
  if (value && typeof value === 'object' && 'toDate' in value) return (value as Timestamp).toDate().toISOString()
  if (Array.isArray(value)) return value.map(fromFirestore)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fromFirestore(item)]))
  return value
}

function snapshotData<T>(snapshot: QueryDocumentSnapshot<DocumentData>) {
  return { ...fromFirestore(snapshot.data()) as object, id: snapshot.id } as T
}

function idQueries(name: string, ids: string[]): Query<DocumentData>[] {
  const unique = [...new Set(ids)]
  const groups: string[][] = []
  for (let index = 0; index < unique.length; index += 30) groups.push(unique.slice(index, index + 30))
  return groups.map((group) => query(collection(firestore!, name), where(documentId(), 'in', group)))
}

function subscribeQueries<T>(queries: Query<DocumentData>[], receive: (items: T[]) => void): Unsubscribe {
  if (!queries.length) {
    receive([])
    return () => undefined
  }
  const buckets = new Map<number, T[]>()
  const emit = () => {
    const items = [...buckets.values()].flat()
    receive([...new Map(items.map((item) => [(item as { id: string }).id, item])).values()])
  }
  const stops = queries.map((item, index) => onSnapshot(item, (snapshot) => {
    buckets.set(index, snapshot.docs.map((entry) => snapshotData<T>(entry)))
    emit()
  }, (error) => {
    if (import.meta.env.DEV) console.warn('Firestore subscription failed:', error.code)
  }))
  return () => stops.forEach((stop) => stop())
}

function fullCollection(name: string) {
  return query(collection(firestore!, name))
}

function basicMember(member: Member): Member {
  return { ...member, phone: member.phone ?? '', documents: member.documents ?? [], createdAt: member.createdAt ?? '' }
}

export function subscribeAppData(user: User, receive: (update: Partial<AppData>) => void) {
  if (!firestore) return () => undefined
  const db = firestore
  const stops: Unsubscribe[] = []
  let publicMembers: Member[] = []
  let privateMembers = new Map<string, Pick<Member, 'restrictedNotes' | 'documents'>>()
  const emitMembers = () => receive({ members: publicMembers.map((member) => ({ ...basicMember(member), ...privateMembers.get(member.id) })) })

  const canReadFullMembers = hasCapability(user, 'members.view')
  const needsMemberDirectory = hasCapability(user, 'ebd.view') || hasCapability(user, 'societies.view')
  if (canReadFullMembers) {
    stops.push(subscribeQueries<Member>([fullCollection('members')], (items) => { publicMembers = items; emitMembers() }))
    if (isSuperuser(user)) {
      stops.push(subscribeQueries<Pick<Member, 'id' | 'restrictedNotes' | 'documents'>>([fullCollection('memberPrivate')], (items) => {
        privateMembers = new Map(items.map((item) => [item.id, { restrictedNotes: item.restrictedNotes, documents: item.documents ?? [] }]))
        emitMembers()
      }))
    }
  } else if (needsMemberDirectory) {
    stops.push(subscribeQueries<Member>([fullCollection('memberDirectory')], (items) => { publicMembers = items; emitMembers() }))
  } else receive({ members: [] })

  const subscriptions: [boolean, DataKey, Query<DocumentData>[]][] = [
    [hasCapability(user, 'visitors.view'), 'visitors', [fullCollection('visitors')]],
    [hasCapability(user, 'ebd.manage'), 'classes', [fullCollection('ebdClasses')]],
    [hasCapability(user, 'ebd.manage'), 'attendance', [fullCollection('attendance')]],
    [hasCapability(user, 'societies.manage'), 'societies', [fullCollection('societies')]],
    [hasCapability(user, 'societies.manage'), 'societyRequests', [fullCollection('societyRequests')]],
    [hasCapability(user, 'finance.view'), 'finance', [fullCollection('financeEntries')]],
  ]

  if (hasCapability(user, 'ebd.view') && !hasCapability(user, 'ebd.manage')) {
    const classQueries = [...idQueries('ebdClasses', user.classIds), query(collection(db, 'ebdClasses'), where('teacherIds', 'array-contains', user.id))]
    let stopAttendance: Unsubscribe = () => undefined
    stops.push(subscribeQueries(classQueries, (items: AppData['classes']) => {
      receive({ classes: items })
      stopAttendance()
      const classIds = items.map((item) => item.id)
      const attendanceQueries: Query<DocumentData>[] = []
      for (let index = 0; index < classIds.length; index += 30) {
        attendanceQueries.push(query(collection(db, 'attendance'), where('classId', 'in', classIds.slice(index, index + 30))))
      }
      stopAttendance = subscribeQueries<AppData['attendance'][number]>(attendanceQueries, (attendance) => receive({ attendance }))
    }))
    stops.push(() => stopAttendance())
  }
  if (hasCapability(user, 'societies.view') && !hasCapability(user, 'societies.manage')) {
    subscriptions.push([true, 'societies', [...idQueries('societies', user.societyIds), query(collection(db, 'societies'), where('leaderIds', 'array-contains', user.id))]])
    subscriptions.push([true, 'societyRequests', [query(collection(db, 'societyRequests'), where('requestedBy', '==', user.id))]])
  }

  subscriptions.forEach(([enabled, key, queries]) => {
    if (enabled) stops.push(subscribeQueries(queries, (items) => receive({ [key]: items })))
    else receive({ [key]: [] })
  })

  if (hasCapability(user, 'audit.view')) {
    stops.push(subscribeQueries<AuditEntry>([fullCollection('audit')], (items) => receive({ audit: items.sort((a, b) => b.at.localeCompare(a.at)) })))
  } else receive({ audit: [] })

  stops.push(onSnapshot(doc(firestore, 'appSettings', 'general'), (snapshot) => {
    if (snapshot.exists()) receive({ settings: snapshot.data() as AppData['settings'] })
  }))

  return () => stops.forEach((stop) => stop())
}

function changed<T extends { id: string }>(before: T[], after: T[]) {
  const oldItems = new Map(before.map((item) => [item.id, item]))
  const newItems = new Map(after.map((item) => [item.id, item]))
  return {
    upserts: after.filter((item) => JSON.stringify(item) !== JSON.stringify(oldItems.get(item.id))),
    removed: before.filter((item) => !newItems.has(item.id)),
  }
}

function mutationForChange(before: AppData, after: AppData, action?: string): SecureMutation | undefined {
  const memberChanges = changed(before.members, after.members)
  const visitorChanges = changed(before.visitors, after.visitors)
  const classChanges = changed(before.classes, after.classes)
  const attendanceChanges = changed(before.attendance, after.attendance)
  const societyChanges = changed(before.societies, after.societies)
  const requestChanges = changed(before.societyRequests, after.societyRequests)
  const financeChanges = changed(before.finance, after.finance)
  const removed = [memberChanges, visitorChanges, classChanges, attendanceChanges, societyChanges, requestChanges, financeChanges]
    .some((change) => change.removed.length > 0)
  if (removed) throw new Error('Exclusões ainda não estão disponíveis neste fluxo seguro.')

  if (requestChanges.upserts.length === 1) {
    const request = requestChanges.upserts[0]
    const previous = before.societyRequests.find((item) => item.id === request.id)
    if (previous?.status === 'pendente' && request.status !== 'pendente') {
      return { type: 'society.request.review', requestId: request.id, approved: request.status === 'aprovada' }
    }
  }

  const candidates: SecureMutation[] = []
  if (memberChanges.upserts.length === 1) candidates.push({ type: 'member.save', member: memberChanges.upserts[0] })
  if (visitorChanges.upserts.length === 1) {
    const visitor = visitorChanges.upserts[0]
    candidates.push(action === 'visitante.contatado'
      ? { type: 'visitor.contact', visitorId: visitor.id }
      : { type: 'visitor.save', visitor })
  }
  if (classChanges.upserts.length === 1) candidates.push({ type: 'ebd.class.save', item: classChanges.upserts[0] })
  if (attendanceChanges.upserts.length === 1) {
    const item = attendanceChanges.upserts[0]
    candidates.push({ type: 'ebd.attendance.save', id: item.id, classId: item.classId, date: item.date, records: item.records, visitors: item.visitors ?? [], status: item.status ?? 'finalizada' })
  }
  if (societyChanges.upserts.length === 1) candidates.push({ type: 'society.save', item: societyChanges.upserts[0] })
  if (requestChanges.upserts.length === 1) {
    const item = requestChanges.upserts[0]
    if (!before.societyRequests.some((entry) => entry.id === item.id)) {
      candidates.push({ type: 'society.request.create', id: item.id, societyId: item.societyId, memberId: item.memberId })
    }
  }
  if (financeChanges.upserts.length === 1) candidates.push({ type: 'finance.create', entry: financeChanges.upserts[0] })
  if (JSON.stringify(before.settings) !== JSON.stringify(after.settings)) {
    candidates.push({ type: 'settings.update', whatsappMessage: after.settings.whatsappMessage })
  }
  if (!candidates.length) return undefined
  if (candidates.length !== 1) throw new Error('A operação tentou alterar mais de um módulo ao mesmo tempo.')
  return candidates[0]
}

export async function persistAppChange(before: AppData, after: AppData, _user: User, action?: string, _detail?: string) {
  const mutation = mutationForChange(before, after, action)
  if (mutation) await callSecureMutation(mutation)
}
