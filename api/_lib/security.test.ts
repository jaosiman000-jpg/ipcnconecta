import { describe, expect, it } from 'vitest'
import { ApiError, assertSameOrigin, readBearerToken, requireRole, type Actor } from './security'

const actor: Actor = {
  id: 'user-1',
  name: 'Pessoa Teste',
  email: 'teste@example.com',
  roles: ['professor'],
  classIds: ['class-1'],
  societyIds: [],
}

describe('proteções HTTP e autorização', () => {
  it('aceita uma requisição da mesma origem', () => {
    const request = new Request('https://ipcnconecta.vercel.app/api/mutations', {
      headers: { origin: 'https://ipcnconecta.vercel.app', host: 'ipcnconecta.vercel.app' },
    })

    expect(() => assertSameOrigin(request)).not.toThrow()
  })

  it('recusa uma origem diferente', () => {
    const request = new Request('https://ipcnconecta.vercel.app/api/mutations', {
      headers: { origin: 'https://site-malicioso.example', host: 'ipcnconecta.vercel.app' },
    })

    expect(() => assertSameOrigin(request)).toThrowError(ApiError)
  })

  it('recusa um papel sem permissão', () => {
    expect(() => requireRole(actor, ['administrador', 'conselho'])).toThrowError(ApiError)
  })

  it('recusa requisição sem token antes de acessar serviços externos', () => {
    const request = new Request('https://ipcnconecta.vercel.app/api/mutations')

    expect(() => readBearerToken(request)).toThrowError(ApiError)
  })
})
