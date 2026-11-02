import { createHash } from 'node:crypto'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { ApiError } from './security.js'

export interface RateRule {
  scope: string
  key: string
  limit: number
  windowSeconds: number
}

export function clientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return request.headers.get('x-real-ip')?.trim() || forwarded || 'unknown'
}

function counterId(rule: RateRule, windowIndex: number) {
  const digest = createHash('sha256').update(rule.key).digest('hex').slice(0, 32)
  return `${rule.scope}_${digest}_${windowIndex}`
}

/**
 * Janela fixa por contador no Firestore. A chave é sempre gravada em hash, então
 * IPs e e-mails não ficam legíveis na coleção. Os contadores expiram sozinhos pelo
 * TTL configurado em `expiresAt` (veja firestore.indexes.json).
 */
export async function consumeRateLimit(db: Firestore, rule: RateRule, now = Date.now()) {
  const windowMs = rule.windowSeconds * 1000
  const windowIndex = Math.floor(now / windowMs)
  const ref = db.collection('rateLimits').doc(counterId(rule, windowIndex))
  const retryAfter = Math.max(1, Math.ceil(((windowIndex + 1) * windowMs - now) / 1000))

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref)
    const count = Number(snapshot.data()?.count ?? 0)
    if (count >= rule.limit) {
      throw new ApiError(429, 'rate_limited', 'Muitas tentativas. Aguarde um pouco e tente novamente.', retryAfter)
    }
    transaction.set(ref, {
      scope: rule.scope,
      count: count + 1,
      expiresAt: Timestamp.fromMillis((windowIndex + 2) * windowMs),
    })
  })
}

export async function consumeRateLimits(db: Firestore, rules: RateRule[], now = Date.now()) {
  for (const rule of rules) await consumeRateLimit(db, rule, now)
}

export const mutationIpLimit = (request: Request): RateRule => ({ scope: 'mutation-ip', key: clientIp(request), limit: 300, windowSeconds: 60 })
export const mutationActorLimit = (actorId: string): RateRule => ({ scope: 'mutation-actor', key: actorId, limit: 90, windowSeconds: 60 })
export const signupLimits = (request: Request, email: string): RateRule[] => [
  { scope: 'signup-ip', key: clientIp(request), limit: 10, windowSeconds: 3600 },
  { scope: 'signup-email', key: email, limit: 5, windowSeconds: 3600 },
  { scope: 'signup-global', key: 'all', limit: 200, windowSeconds: 86400 },
]
