import { Timestamp } from 'firebase-admin/firestore'
import type { AdminServices } from './firebaseAdmin.js'
import { inviteIdFor } from './invites.js'
import { consumeRateLimits, signupLimits } from './rateLimit.js'
import type { SignupInput, Role } from './schemas.js'
import { ApiError } from './security.js'

// Versão dos Termos de Uso e da Política de Privacidade aceitos no cadastro; igual a LEGAL_VERSION em src/app/legal.ts.
export const PRIVACY_NOTICE_VERSION = '2026-11-03'

const ROLE_LABELS: Record<Role, string> = {
  conselho: 'Conselho',
  secretaria: 'Secretaria',
  diacono: 'Diácono',
  professor: 'Professor',
  lider: 'Líder de sociedade',
  acolhimento: 'Acolhimento',
}

const INVALID_INVITE = new ApiError(403, 'invite_invalid', 'Não há convite válido para este e-mail. Peça um novo convite ao Conselho ou à Administração.')

function authCode(error: unknown) {
  return typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
}

/**
 * Cria a conta de uma pessoa convidada. Somente o servidor cria o login e o perfil
 * pendente; o navegador não escreve mais em `users`.
 */
export async function registerInvitedUser(request: Request, input: SignupInput, services: AdminServices) {
  const { auth, db } = services
  await consumeRateLimits(db, signupLimits(request, input.email))

  const inviteRef = db.collection('invites').doc(inviteIdFor(input.email))
  const invite = await inviteRef.get()
  const inviteData = invite.data()
  const expiresAt = typeof inviteData?.expiresAt?.toMillis === 'function' ? Number(inviteData.expiresAt.toMillis()) : 0
  if (!invite.exists || inviteData?.status !== 'pendente' || inviteData.email !== input.email || expiresAt <= Date.now()) {
    throw INVALID_INVITE
  }
  const roles = (Array.isArray(inviteData.roles) ? inviteData.roles : []) as Role[]

  let uid: string
  try {
    uid = (await auth.createUser({ email: input.email, password: input.password, displayName: input.name, emailVerified: false })).uid
  } catch (error) {
    if (authCode(error) === 'auth/email-already-exists') throw new ApiError(409, 'account_exists', 'Já existe uma conta com este e-mail. Use "Esqueci minha senha" na tela de entrada.')
    if (authCode(error) === 'auth/invalid-password' || authCode(error) === 'auth/invalid-email') throw new ApiError(400, 'payload_invalid', 'Revise os dados informados e tente novamente.')
    throw error
  }

  try {
    await db.runTransaction(async (transaction) => {
      const fresh = await transaction.get(inviteRef)
      if (fresh.data()?.status !== 'pendente') throw INVALID_INVITE
      const now = Timestamp.now()
      transaction.set(db.collection('users').doc(uid), {
        uid,
        name: input.name,
        email: input.email,
        photo: input.photo,
        office: roles.map((role) => ROLE_LABELS[role]).join(', '),
        emailVerified: false,
        roles: [],
        requestedRoles: roles,
        status: 'pendente',
        classIds: [],
        societyIds: [],
        createdAt: now,
        updatedAt: now,
        privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
        privacyNoticeAcceptedAt: now,
      })
      transaction.update(inviteRef, { status: 'usado', usedBy: uid, usedAt: now })
      transaction.set(db.collection('audit').doc(), { actorId: uid, action: 'convite.utilizado', detail: 'Conta criada a partir de convite', targetId: inviteRef.id, at: now })
    })
  } catch (error) {
    await auth.deleteUser(uid).catch(() => undefined)
    throw error
  }
}
