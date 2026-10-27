import {
  collection,
  doc,
  documentId,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { firestore } from './firebase'
import { hasCapability, isSuperuser } from './permissions'
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

function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutUndefined) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, withoutUndefined(item)])) as T
  }
  return value
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

function publicMember(member: Member) {
  const { restrictedNotes: _restrictedNotes, documents: _documents, ...publicData } = member
  return publicData
}

function directoryMember(member: Member) {
  return { id: member.id, name: member.name, birthDate: member.birthDate, status: member.status }
}

export async function persistAppChange(before: AppData, after: AppData, user: User, action?: string, detail?: string) {
  if (!firestore) throw new Error('O Firebase não está configurado.')
  const db = firestore
  const batch = writeBatch(db)

  const memberChanges = changed(before.members, after.members)
  memberChanges.upserts.forEach((member) => {
    batch.set(doc(db, 'members', member.id), withoutUndefined(publicMember(member)))
    batch.set(doc(db, 'memberDirectory', member.id), directoryMember(member))
    if (isSuperuser(user)) batch.set(doc(db, 'memberPrivate', member.id), withoutUndefined({ id: member.id, restrictedNotes: member.restrictedNotes, documents: member.documents }))
  })
  memberChanges.removed.forEach((member) => {
    batch.delete(doc(db, 'members', member.id))
    batch.delete(doc(db, 'memberDirectory', member.id))
    if (isSuperuser(user)) batch.delete(doc(db, 'memberPrivate', member.id))
  })

  ;(Object.keys(collectionNames) as DataKey[]).forEach((key) => {
    const changes = changed(before[key] as { id: string }[], after[key] as { id: string }[])
    changes.upserts.forEach((item) => batch.set(doc(db, collectionNames[key], item.id), withoutUndefined(item)))
    changes.removed.forEach((item) => batch.delete(doc(db, collectionNames[key], item.id)))
  })

  if (JSON.stringify(before.settings) !== JSON.stringify(after.settings)) {
    batch.set(doc(db, 'appSettings', 'general'), withoutUndefined(after.settings))
  }
  if (action) {
    const auditRef = doc(collection(db, 'audit'))
    batch.set(auditRef, {
      actorId: user.id,
      action: action.slice(0, 100),
      detail: (detail ?? '').slice(0, 300),
      targetId: '',
      at: serverTimestamp(),
    })
  }
  await batch.commit()
}
