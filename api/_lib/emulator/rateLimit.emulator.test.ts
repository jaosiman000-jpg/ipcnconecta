import type { Firestore } from '@google-cloud/firestore'
import { Timestamp } from '@google-cloud/firestore'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clientIp, consumeRateLimit } from '../rateLimit.js'
import { clearDatabase, createDb, expectApiError } from './helpers.js'

let db: Firestore
const rule = { scope: 'teste', key: '203.0.113.9', limit: 3, windowSeconds: 60 }
const T0 = Date.UTC(2026, 10, 1, 12, 0, 10)

beforeAll(() => { db = createDb() })
beforeEach(async () => { await clearDatabase() })

describe('limite de taxa', () => {
  it('aceita até o limite e recusa o excedente com o tempo de espera', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) await consumeRateLimit(db, rule, T0)
    await expectApiError(consumeRateLimit(db, rule, T0), 'rate_limited', 429)

    const error = await consumeRateLimit(db, rule, T0).then(() => undefined, (reason: unknown) => reason as { retryAfter?: number })
    expect(error?.retryAfter).toBe(50)
  })

  it('libera de novo na janela seguinte', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) await consumeRateLimit(db, rule, T0)
    await consumeRateLimit(db, rule, T0 + 60_000)
  })

  it('chaves diferentes não se afetam', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) await consumeRateLimit(db, rule, T0)
    await consumeRateLimit(db, { ...rule, key: '203.0.113.10' }, T0)
    await consumeRateLimit(db, { ...rule, scope: 'outro' }, T0)
  })

  it('requisições simultâneas respeitam o limite', async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => consumeRateLimit(db, rule, T0)))
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(3)
  })

  it('não grava o IP ou e-mail em texto legível e define a expiração do contador', async () => {
    await consumeRateLimit(db, rule, T0)
    const [entry] = (await db.collection('rateLimits').get()).docs
    expect(JSON.stringify([entry.id, entry.data()])).not.toContain('203.0.113.9')
    expect((entry.data().expiresAt as Timestamp).toMillis()).toBeGreaterThan(T0 + 60_000)
  })
})

describe('identificação do cliente', () => {
  it('prefere x-real-ip, depois o primeiro x-forwarded-for', () => {
    expect(clientIp(new Request('https://x.test', { headers: { 'x-real-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' } }))).toBe('1.1.1.1')
    expect(clientIp(new Request('https://x.test', { headers: { 'x-forwarded-for': '2.2.2.2, 3.3.3.3' } }))).toBe('2.2.2.2')
    expect(clientIp(new Request('https://x.test'))).toBe('unknown')
  })
})
