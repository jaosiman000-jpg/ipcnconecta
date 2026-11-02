import { AdminSetupError, getAdminServices } from './_lib/firebaseAdmin.js'
import { signupSchema } from './_lib/schemas.js'
import { ApiError, assertSameOrigin, errorCode, json, parseJson } from './_lib/security.js'
import { registerInvitedUser } from './_lib/signup.js'

export async function POST(request: Request) {
  const requestId = crypto.randomUUID()
  try {
    assertSameOrigin(request, { requireOrigin: true })
    const input = await parseJson(request, signupSchema)
    await registerInvitedUser(request, input, getAdminServices(request))
    console.info(JSON.stringify({ event: 'signup_created', requestId }))
    return json({ ok: true, requestId }, 201)
  } catch (error) {
    const known = error instanceof ApiError
    const setup = error instanceof AdminSetupError
    console.error(JSON.stringify({
      event: 'signup_failed',
      requestId,
      code: known ? error.code : setup ? error.reason : 'internal_error',
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorCode: known ? undefined : errorCode(error),
    }))
    return json({
      ok: false,
      requestId,
      code: known ? error.code : 'internal_error',
      message: known ? error.message : 'Não foi possível concluir o cadastro. Tente novamente.',
    }, known ? error.status : setup ? 503 : 500, known && error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {})
  }
}
