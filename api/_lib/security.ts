import type { Auth, DecodedIdToken } from 'firebase-admin/auth'
import type { Firestore } from 'firebase-admin/firestore'
import { mutationSchema, type MutationInput, type Role } from './schemas.js'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

export interface Actor {
  id: string
  name: string
  email: string
  roles: Role[]
  classIds: string[]
  societyIds: string[]
}

const validRoles = new Set<Role>(['administrador', 'conselho', 'secretaria', 'diacono', 'professor', 'lider', 'acolhimento'])

export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (!origin || !host) return
  let originHost = ''
  try { originHost = new URL(origin).host } catch { throw new ApiError(403, 'origin_invalid', 'Origem da requisição inválida.') }
  if (originHost !== host) throw new ApiError(403, 'origin_denied', 'Origem da requisição não permitida.')
}

export function readBearerToken(request: Request) {
  const header = request.headers.get('authorization') ?? ''
  const match = header.match(/^Bearer ([A-Za-z0-9._~-]+)$/)
  if (!match || match[1].length > 5000) throw new ApiError(401, 'authentication_required', 'Entre novamente para continuar.')
  return match[1]
}

function decodedEmail(token: DecodedIdToken) {
  return typeof token.email === 'string' ? token.email.toLowerCase() : ''
}

export async function authenticate(idToken: string, auth: Auth, db: Firestore): Promise<Actor> {
  let token: DecodedIdToken
  try {
    token = await auth.verifyIdToken(idToken)
  } catch {
    throw new ApiError(401, 'invalid_token', 'Sua sessão expirou. Entre novamente.')
  }
  if (!token.email_verified) throw new ApiError(403, 'email_unverified', 'Confirme seu e-mail antes de continuar.')

  const snapshot = await db.collection('users').doc(token.uid).get()
  if (!snapshot.exists) throw new ApiError(403, 'profile_missing', 'Seu perfil de acesso não foi encontrado.')
  const profile = snapshot.data() ?? {}
  const roles = Array.isArray(profile.roles) ? profile.roles.filter((role): role is Role => validRoles.has(role as Role)) : []
  const profileEmail = typeof profile.email === 'string' ? profile.email.toLowerCase() : ''
  if (profile.status !== 'ativo' || profile.emailVerified !== true || !roles.length || profileEmail !== decodedEmail(token)) {
    throw new ApiError(403, 'account_inactive', 'Sua conta não possui acesso ativo.')
  }
  return {
    id: token.uid,
    name: typeof profile.name === 'string' ? profile.name.slice(0, 120) : 'Usuário',
    email: profileEmail,
    roles,
    classIds: Array.isArray(profile.classIds) ? profile.classIds.map(String) : [],
    societyIds: Array.isArray(profile.societyIds) ? profile.societyIds.map(String) : [],
  }
}

export async function parseMutation(request: Request): Promise<MutationInput> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new ApiError(415, 'content_type_invalid', 'Formato da requisição inválido.')
  }
  const declaredLength = Number(request.headers.get('content-length') ?? '0')
  if (declaredLength > 512 * 1024) throw new ApiError(413, 'payload_too_large', 'A requisição excede o limite permitido.')

  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > 512 * 1024) {
    throw new ApiError(413, 'payload_too_large', 'A requisição excede o limite permitido.')
  }
  let body: unknown
  try { body = JSON.parse(text) } catch { throw new ApiError(400, 'json_invalid', 'Dados enviados em formato inválido.') }
  const result = mutationSchema.safeParse(body)
  if (!result.success) throw new ApiError(400, 'payload_invalid', 'Revise os dados informados e tente novamente.')
  return result.data
}

export function hasAnyRole(actor: Actor, roles: Role[]) {
  return actor.roles.some((role) => roles.includes(role))
}

export function requireRole(actor: Actor, roles: Role[]) {
  if (!hasAnyRole(actor, roles)) throw new ApiError(403, 'permission_denied', 'Você não tem permissão para realizar esta ação.')
}

export function isSuperuser(actor: Actor) {
  return hasAnyRole(actor, ['administrador', 'conselho'])
}
