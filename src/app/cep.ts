export interface CepAddress {
  street?: string
  neighborhood?: string
  city?: string
}

export type CepLookup =
  | { status: 'found'; address: CepAddress }
  | { status: 'not_found' }
  | { status: 'error' }

const CEP_ENDPOINT = 'https://brasilapi.com.br/api/cep/v2'
const LOOKUP_TIMEOUT_MS = 6000

export function digitsOnly(value: string) {
  return value.replace(/\D/g, '')
}

/** Aplica a máscara 00000-000 enquanto a pessoa digita. */
export function formatCep(value: string) {
  const digits = digitsOnly(value).slice(0, 8)
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits
}

export function isCompleteCep(value: string) {
  return digitsOnly(value).length === 8
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)

/**
 * Consulta a BrasilAPI com o CEP digitado (somente os 8 números saem do navegador).
 * Nunca lança erro: quando a consulta não é possível, o cadastro segue com o preenchimento manual.
 */
export async function lookupCep(cep: string, options: { signal?: AbortSignal; fetcher?: typeof fetch; timeoutMs?: number } = {}): Promise<CepLookup> {
  const digits = digitsOnly(cep)
  if (digits.length !== 8) return { status: 'error' }

  const controller = new AbortController()
  const forwardAbort = () => controller.abort()
  options.signal?.addEventListener('abort', forwardAbort)
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? LOOKUP_TIMEOUT_MS)
  try {
    const response = await (options.fetcher ?? fetch)(`${CEP_ENDPOINT}/${digits}`, { signal: controller.signal, headers: { Accept: 'application/json' } })
    if (response.status === 404) return { status: 'not_found' }
    if (!response.ok) return { status: 'error' }
    const body = await response.json() as Record<string, unknown>
    return { status: 'found', address: { street: text(body.street), neighborhood: text(body.neighborhood), city: text(body.city) } }
  } catch {
    return { status: 'error' }
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', forwardAbort)
  }
}
