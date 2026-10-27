import { firebaseAuth } from './firebase'
import type { EbdClass, FinanceEntry, Member, Role, Society, Visitor } from './types'

export type SecureMutation =
  | { type: 'member.save'; member: Member }
  | { type: 'visitor.save'; visitor: Visitor }
  | { type: 'visitor.contact'; visitorId: string }
  | { type: 'ebd.class.save'; item: EbdClass }
  | { type: 'ebd.attendance.save'; id: string; classId: string; date: string; records: Record<string, string> }
  | { type: 'society.save'; item: Society }
  | { type: 'society.request.create'; id: string; societyId: string; memberId: string }
  | { type: 'society.request.review'; requestId: string; approved: boolean }
  | { type: 'finance.create'; entry: FinanceEntry }
  | { type: 'settings.update'; whatsappMessage: string }
  | { type: 'user.profile.update'; name: string; photo?: string }
  | { type: 'user.access.save'; userId: string; roles: Role[]; classIds: string[]; societyIds: string[] }
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
