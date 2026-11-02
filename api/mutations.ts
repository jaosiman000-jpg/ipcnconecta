import { AdminSetupError, getAdminServices } from './_lib/firebaseAdmin.js'
import { executeMutation } from './_lib/mutationHandlers.js'
import { consumeRateLimit, mutationActorLimit, mutationIpLimit } from './_lib/rateLimit.js'
import { ApiError, assertSameOrigin, authenticate, json, parseMutation, readBearerToken } from './_lib/security.js'

export async function POST(request: Request) {
  const requestId = crypto.randomUUID()
  try {
    assertSameOrigin(request)
    const idToken = readBearerToken(request)
    const services = getAdminServices(request)
    await consumeRateLimit(services.db, mutationIpLimit(request))
    const input = await parseMutation(request)
    const actor = await authenticate(idToken, services.auth, services.db)
    await consumeRateLimit(services.db, mutationActorLimit(actor.id))
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
    }, known ? error.status : setup ? 503 : 500, known && error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {})
  }
}
