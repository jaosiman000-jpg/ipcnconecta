import { describe, expect, it } from 'vitest'
import { hasCapability, isSuperuser } from './permissions'
import type { User } from './types'

const user = (roles: User['roles']): User => ({
  id: '1', name: 'Teste', email: 'teste@local', roles, status: 'ativo', classIds: [], societyIds: [], createdAt: '',
})

describe('permissões cumulativas', () => {
  it('dá acesso total ao Conselho', () => {
    expect(isSuperuser(user(['conselho']))).toBe(true)
    expect(hasCapability(user(['conselho']), 'finance.manage')).toBe(true)
    expect(hasCapability(user(['conselho']), 'users.manage')).toBe(true)
  })

  it('soma acessos quando há mais de um papel', () => {
    const combined = user(['professor', 'acolhimento'])
    expect(hasCapability(combined, 'ebd.attendance')).toBe(true)
    expect(hasCapability(combined, 'visitors.manage')).toBe(true)
    expect(hasCapability(combined, 'finance.view')).toBe(false)
  })

  it('não autoriza usuário desativado', () => {
    const disabled = { ...user(['administrador']), status: 'desativado' as const }
    expect(hasCapability(disabled, 'users.manage')).toBe(false)
  })
})
