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
  'reports.view',
  'users.manage',
  'audit.view',
  'settings.view',
  'settings.manage',
]

export const ROLE_LABELS: Record<Role, string> = {
  administrador: 'Administrador',
  conselho: 'Conselho',
  secretaria: 'Secretaria',
  diacono: 'Junta Diaconal',
  professor: 'Professor',
  lider: 'Líder de sociedade',
  acolhimento: 'Acolhimento',
}

export function roleSummary(roles: Role[]) {
  return roles.map((role) => ROLE_LABELS[role]).join(', ')
}

const roleCapabilities: Record<Role, Capability[]> = {
  administrador: allCapabilities,
  conselho: allCapabilities,
  secretaria: [
    'dashboard.view', 'people.view', 'people.manage', 'members.view', 'members.manage', 'visitors.view', 'visitors.manage',
    'ebd.view', 'ebd.manage', 'societies.view', 'reports.view', 'settings.view',
  ],
  diacono: ['dashboard.view', 'finance.view', 'finance.manage', 'reports.view', 'settings.view'],
  professor: ['dashboard.view', 'ebd.view', 'ebd.attendance', 'settings.view'],
  lider: ['dashboard.view', 'societies.view', 'societies.request', 'settings.view'],
  acolhimento: ['dashboard.view', 'visitors.view', 'visitors.manage', 'settings.view'],
}

export function hasCapability(user: User | undefined, capability: Capability) {
  if (!user || user.status !== 'ativo') return false
  return user.roles.some((role) => roleCapabilities[role].includes(capability))
}

export function isSuperuser(user: User | undefined) {
  return Boolean(user?.roles.some((role) => role === 'administrador' || role === 'conselho'))
}

export function visibleClassIds(user: User | undefined) {
  return isSuperuser(user) || user?.roles.includes('secretaria') ? null : user?.classIds ?? []
}

export function visibleSocietyIds(user: User | undefined) {
  return isSuperuser(user) || user?.roles.includes('secretaria') ? null : user?.societyIds ?? []
}
