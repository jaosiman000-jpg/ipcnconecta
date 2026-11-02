import type { Role, User } from './types'

export type Capability =
  | 'dashboard.view'
  | 'members.view'
  | 'members.manage'
  | 'members.restricted'
  | 'people.view'
  | 'people.manage'
  | 'visitors.view'
  | 'visitors.manage'
  | 'ebd.view'
  | 'ebd.manage'
  | 'ebd.attendance'
  | 'societies.view'
  | 'societies.manage'
  | 'societies.request'
  | 'finance.view'
  | 'finance.manage'
  | 'finance.cancel'
  | 'reports.view'
  | 'users.manage'
  | 'audit.view'
  | 'settings.view'
  | 'settings.manage'

const allCapabilities: Capability[] = [
  'dashboard.view',
  'members.view',
  'members.manage',
  'members.restricted',
  'people.view',
  'people.manage',
  'visitors.view',
  'visitors.manage',
  'ebd.view',
  'ebd.manage',
  'ebd.attendance',
  'societies.view',
  'societies.manage',
  'societies.request',
  'finance.view',
  'finance.manage',
  'finance.cancel',
  'reports.view',
  'users.manage',
  'audit.view',
  'settings.view',
  'settings.manage',
]

export const ROLE_LABELS: Record<Role, string> = {
  administrador: 'Administrador (antigo)',
  conselho: 'Conselho',
  secretaria: 'Secretaria',
  diacono: 'Diácono',
  professor: 'Professor',
  lider: 'Líder de sociedade',
  acolhimento: 'Acolhimento',
}

export function roleSummary(roles: Role[]) {
  return roles.map((role) => ROLE_LABELS[role]).join(', ')
}

/** Papéis que podem ser concedidos hoje. `administrador` é legado e `lider` está em espera (módulo Sociedades oculto). */
export const ASSIGNABLE_ROLES: Role[] = ['conselho', 'secretaria', 'diacono', 'professor', 'acolhimento']

/** Acesso completo: Conselho e Secretaria são equivalentes; `administrador` é um papel antigo mantido até a migração. */
export const FULL_ACCESS_ROLES: Role[] = ['administrador', 'conselho', 'secretaria']

const roleCapabilities: Record<Role, Capability[]> = {
  administrador: allCapabilities,
  conselho: allCapabilities,
  secretaria: allCapabilities,
  diacono: ['dashboard.view', 'finance.view', 'finance.manage', 'settings.view'],
  professor: ['ebd.view', 'ebd.attendance', 'settings.view'],
  lider: ['dashboard.view', 'societies.view', 'societies.request', 'settings.view'],
  acolhimento: ['visitors.view', 'visitors.manage', 'settings.view'],
}

export function hasCapability(user: User | undefined, capability: Capability) {
  if (!user || user.status !== 'ativo') return false
  return user.roles.some((role) => roleCapabilities[role].includes(capability))
}

export function isSuperuser(user: User | undefined) {
  return Boolean(user?.roles.some((role) => FULL_ACCESS_ROLES.includes(role)))
}

/** Primeira tela de cada pessoa: quem não tem a Visão geral entra direto na sua área. */
export function homePath(user: User | undefined) {
  if (hasCapability(user, 'dashboard.view')) return '/'
  if (hasCapability(user, 'visitors.view')) return '/visitantes'
  if (hasCapability(user, 'ebd.view')) return '/ebd'
  return '/configuracoes'
}

export function visibleClassIds(user: User | undefined) {
  return isSuperuser(user) ? null : user?.classIds ?? []
}

export function visibleSocietyIds(user: User | undefined) {
  return isSuperuser(user) ? null : user?.societyIds ?? []
}
