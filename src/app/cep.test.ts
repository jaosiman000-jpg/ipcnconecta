import { describe, expect, it } from 'vitest'
import { digitsOnly, formatCep, isCompleteCep, lookupCep } from './cep'

const reply = (status: number, body: unknown = {}) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('CEP: máscara', () => {
  it('formata enquanto digita e ignora o que não é número', () => {
    expect(formatCep('3')).toBe('3')
    expect(formatCep('30130')).toBe('30130')
    expect(formatCep('301300')).toBe('30130-0')
    expect(formatCep('30130-010')).toBe('30130-010')
    expect(formatCep('30.130-010 99')).toBe('30130-010')
    expect(formatCep('abc')).toBe('')
  })

  it('só considera completo com 8 números', () => {
    expect(isCompleteCep('30130-01')).toBe(false)
    expect(isCompleteCep('30130-010')).toBe(true)
    expect(digitsOnly('30130-010')).toBe('30130010')
  })
})

describe('CEP: consulta', () => {
  it('devolve rua, bairro e cidade', async () => {
    const result = await lookupCep('30130-010', { fetcher: reply(200, { cep: '30130010', state: 'MG', city: ' Belo Horizonte ', neighborhood: 'Centro', street: 'Praça Sete de Setembro', location: { coordinates: {} } }) })
    expect(result).toEqual({ status: 'found', address: { street: 'Praça Sete de Setembro', neighborhood: 'Centro', city: 'Belo Horizonte' } })
  })

  it('CEP genérico, sem rua ou bairro, preenche só o que existe', async () => {
    const result = await lookupCep('35700000', { fetcher: reply(200, { cep: '35700000', city: 'Sete Lagoas', neighborhood: '', street: null }) })
    expect(result).toEqual({ status: 'found', address: { street: undefined, neighborhood: undefined, city: 'Sete Lagoas' } })
  })

  it('envia somente os 8 números do CEP', async () => {
    let requested = ''
    await lookupCep('30130-010', { fetcher: (async (url: string) => { requested = url; return new Response('{}', { status: 200 }) }) as unknown as typeof fetch })
    expect(requested).toBe('https://brasilapi.com.br/api/cep/v2/30130010')
  })

  it('CEP inexistente (404) é tratado como não encontrado', async () => {
    expect(await lookupCep('00000000', { fetcher: reply(404, { name: 'CepPromiseError' }) })).toEqual({ status: 'not_found' })
  })

  it('falhas do serviço, rede e resposta inválida viram erro, sem lançar exceção', async () => {
    expect(await lookupCep('30130010', { fetcher: reply(500) })).toEqual({ status: 'error' })
    expect(await lookupCep('30130010', { fetcher: (async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch })).toEqual({ status: 'error' })
    expect(await lookupCep('30130010', { fetcher: (async () => new Response('não é json', { status: 200 })) as unknown as typeof fetch })).toEqual({ status: 'error' })
  })

  it('CEP incompleto nem chega a consultar', async () => {
    let called = false
    const result = await lookupCep('3013', { fetcher: (async () => { called = true; return new Response('{}') }) as unknown as typeof fetch })
    expect(result).toEqual({ status: 'error' })
    expect(called).toBe(false)
  })

  it('desiste depois do tempo limite', async () => {
    const hanging = ((_: string, init: RequestInit) => new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError'))))) as unknown as typeof fetch
    expect(await lookupCep('30130010', { fetcher: hanging, timeoutMs: 20 })).toEqual({ status: 'error' })
  })

  it('para a consulta quando a tela cancela', async () => {
    const controller = new AbortController()
    const hanging = ((_: string, init: RequestInit) => new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError'))))) as unknown as typeof fetch
    const pending = lookupCep('30130010', { fetcher: hanging, signal: controller.signal, timeoutMs: 5000 })
    controller.abort()
    expect(await pending).toEqual({ status: 'error' })
  })
})
