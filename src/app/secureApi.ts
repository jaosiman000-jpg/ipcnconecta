import { firebaseAuth } from './firebase'
import type { AttendanceSession, ContributionBatchItem, EbdClass, PersonInput, Role, Society, Visitor } from './types'

export type SecureMutation =
  | { type: 'person.save'; person: PersonInput }
  | { type: 'people.import'; importId: string; people: PersonInput[] }
  | { type: 'visitor.save'; visitor: Visitor }
  | { type: 'visitor.contact'; visitorId: string }
  | { type: 'ebd.class.save'; item: EbdClass }
  | { type: 'ebd.attendance.save'; id: string; classId: string; date: string; records: AttendanceSession['records']; visitors: NonNullable<AttendanceSession['visitors']>; status: NonNullable<AttendanceSession['status']> }
  | { type: 'society.save'; item: Society }
  | { type: 'society.request.create'; id: string; societyId: string; memberId: string }
  | { type: 'society.request.review'; requestId: string; approved: boolean }
  | { type: 'finance.batch.save'; batch: { id: string; date: string; items: ContributionBatchItem[] } }
  | { type: 'finance.batch.finalize'; batchId: string }
  | { type: 'finance.batch.discard'; batchId: string }
  | { type: 'finance.entry.cancel'; entryId: string; reason: string }
  | { type: 'settings.update'; whatsappMessage: string }
  | { type: 'user.profile.update'; name: string; photo?: string }
  | { type: 'user.access.save'; userId: string; personId: string; roles: Role[]; classIds: string[]; societyIds: string[] }
  | { type: 'user.person.link'; userId: string; personId: string }
  | { type: 'user.access.reject'; userId: string }
  | { type: 'user.access.toggle'; userId: string }

interface ApiResponse {
  ok: boolean
  message?: string
}

async function sendMutation(mutation: SecureMutation, refreshToken: boolean): Promise<Response> {
  const user = firebaseAuth?.currentUser
  if (!user) throw new Error('Entre novamente para continuar.')
  const token = await user.getIdToken(refreshToken)
  return fetch('/api/mutations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(mutation),
    credentials: 'same-origin',
  })
}

export async function callSecureMutation(mutation: SecureMutation) {
  let response = await sendMutation(mutation, false)
  if (response.status === 401) response = await sendMutation(mutation, true)

  let body: ApiResponse | undefined
  try { body = await response.json() as ApiResponse } catch { body = undefined }
  if (!response.ok || !body?.ok) {
    throw new Error(body?.message ?? 'Não foi possível concluir a operação. Tente novamente.')
  }
}
