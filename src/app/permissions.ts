import type { Role, User } from './types'

export type Capability =
  | 'dashboard.view'
  | 'members.view'
  | 'members.manage'
  | 'members.restricted'
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
  | 'settings.manage'

const allCapabilities: Capability[] = [
  'dashboard.view',
  'members.view',
  'members.manage',
  'members.restricted',
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
  'settings.manage',
]

export const ROLE_LABELS: Record<Role, string> = {
  administrador: 'Administrador',
  conselho: 'Conselho',
  secretaria: 'Secretaria',
  tesouraria: 'Tesouraria',
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
    'dashboard.view', 'members.view', 'members.manage', 'visitors.view', 'visitors.manage',
    'ebd.view', 'ebd.manage', 'societies.view', 'reports.view',
  ],
  tesouraria: ['dashboard.view', 'finance.view', 'finance.manage', 'reports.view'],
  professor: ['dashboard.view', 'ebd.view', 'ebd.attendance'],
  lider: ['dashboard.view', 'societies.view', 'societies.request'],
  acolhimento: ['dashboard.view', 'visitors.view', 'visitors.manage'],
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
