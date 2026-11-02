import { describe, expect, it } from 'vitest'
import { ASSIGNABLE_ROLES, hasCapability, homePath, isSuperuser, ROLE_LABELS } from './permissions'
import type { User } from './types'

const user = (roles: User['roles']): User => ({
  id: '1', name: 'Teste', email: 'teste@local', roles, status: 'ativo', classIds: [], societyIds: [], createdAt: '',
})

describe('permissões cumulativas', () => {
  it('dá acesso total ao Conselho e à Secretaria, com os mesmos poderes', () => {
    for (const role of ['conselho', 'secretaria'] as const) {
      expect(isSuperuser(user([role]))).toBe(true)
      expect(hasCapability(user([role]), 'finance.manage')).toBe(true)
      expect(hasCapability(user([role]), 'finance.cancel')).toBe(true)
      expect(hasCapability(user([role]), 'users.manage')).toBe(true)
      expect(hasCapability(user([role]), 'audit.view')).toBe(true)
      expect(hasCapability(user([role]), 'members.restricted')).toBe(true)
    }
  })

  it('mantém o papel antigo Administrador com acesso total até a migração', () => {
    expect(isSuperuser(user(['administrador']))).toBe(true)
    expect(hasCapability(user(['administrador']), 'users.manage')).toBe(true)
  })

  it('o Diácono só lança e consulta o financeiro, sem cancelar nem relatórios', () => {
    const diacono = user(['diacono'])
    expect(hasCapability(diacono, 'finance.view')).toBe(true)
    expect(hasCapability(diacono, 'finance.manage')).toBe(true)
    expect(hasCapability(diacono, 'finance.cancel')).toBe(false)
    expect(hasCapability(diacono, 'reports.view')).toBe(false)
    for (const capability of ['people.view', 'members.view', 'visitors.view', 'ebd.view', 'users.manage', 'audit.view'] as const) {
      expect(hasCapability(diacono, capability)).toBe(false)
    }
  })

  it('o Professor só acessa a Escola Dominical e as próprias configurações', () => {
    const professor = user(['professor'])
    expect(hasCapability(professor, 'ebd.view')).toBe(true)
    expect(hasCapability(professor, 'ebd.attendance')).toBe(true)
    expect(hasCapability(professor, 'ebd.manage')).toBe(false)
    for (const capability of ['dashboard.view', 'members.view', 'people.view', 'visitors.view', 'finance.view', 'societies.view', 'reports.view'] as const) {
      expect(hasCapability(professor, capability)).toBe(false)
    }
  })

  it('o Acolhimento só acessa Visitantes e as próprias configurações', () => {
    const acolhimento = user(['acolhimento'])
    expect(hasCapability(acolhimento, 'visitors.view')).toBe(true)
    expect(hasCapability(acolhimento, 'visitors.manage')).toBe(true)
    for (const capability of ['dashboard.view', 'members.view', 'people.view', 'ebd.view', 'finance.view', 'reports.view', 'users.manage'] as const) {
      expect(hasCapability(acolhimento, capability)).toBe(false)
    }
  })

  it('soma acessos quando há mais de um papel', () => {
    const combined = user(['professor', 'acolhimento'])
    expect(hasCapability(combined, 'ebd.attendance')).toBe(true)
    expect(hasCapability(combined, 'visitors.manage')).toBe(true)
    expect(hasCapability(combined, 'finance.view')).toBe(false)
  })

  it('todos consultam o próprio perfil; só o acesso completo altera configurações gerais', () => {
    const roles: User['roles'] = ['administrador', 'conselho', 'secretaria', 'diacono', 'professor', 'lider', 'acolhimento']
    roles.forEach((role) => expect(hasCapability(user([role]), 'settings.view')).toBe(true))
    roles.slice(3).forEach((role) => expect(hasCapability(user([role]), 'settings.manage')).toBe(false))
    expect(hasCapability(user(['secretaria']), 'settings.manage')).toBe(true)
  })

  it('não autoriza usuário desativado', () => {
    const disabled = { ...user(['conselho']), status: 'desativado' as const }
    expect(hasCapability(disabled, 'users.manage')).toBe(false)
  })
})

describe('navegação e nomes', () => {
  it('quem não tem Visão geral entra direto na própria área', () => {
    expect(homePath(user(['conselho']))).toBe('/')
    expect(homePath(user(['diacono']))).toBe('/')
    expect(homePath(user(['acolhimento']))).toBe('/visitantes')
    expect(homePath(user(['professor']))).toBe('/ebd')
  })

  it('o Líder de sociedade e o Administrador antigo não são oferecidos para novos convites', () => {
    expect(ASSIGNABLE_ROLES).toEqual(['conselho', 'secretaria', 'diacono', 'professor', 'acolhimento'])
  })

  it('usa o nome Diácono', () => {
    expect(ROLE_LABELS.diacono).toBe('Diácono')
  })
})
