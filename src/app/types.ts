export type Role =
  | 'administrador'
  | 'conselho'
  | 'secretaria'
  | 'tesouraria'
  | 'professor'
  | 'lider'
  | 'acolhimento'

export type UserStatus = 'ativo' | 'pendente' | 'desativado'
export type MemberStatus = 'Ativo' | 'Em análise' | 'Disciplinado' | 'Excluído' | 'Falecido'
export type AttendanceStatus = 'presente' | 'ausente' | 'justificado' | 'visitante'

export interface User {
  id: string
  name: string
  email: string
  photo?: string
  office?: string
  emailVerified?: boolean
  roles: Role[]
  requestedRoles?: Role[]
  status: UserStatus
  classIds: string[]
  societyIds: string[]
  createdAt: string
  updatedAt?: string
  approvedAt?: string
  approvedBy?: string
  privacyNoticeVersion?: string
  privacyNoticeAcceptedAt?: string
}

export interface MemberDocument {
  id: string
  name: string
  type: string
  size: number
  addedAt: string
  storagePath?: string
}

export interface Member {
  id: string
  name: string
  birthDate: string
  phone: string
  address?: string
  cpf?: string
  email?: string
  status: MemberStatus
  restrictedNotes?: string
  documents: MemberDocument[]
  createdAt: string
}

export interface Visitor {
  id: string
  name: string
  phone: string
  birthDate?: string
  visitDate: string
  consent: boolean
  contacted: boolean
  doNotContact: boolean
  lastContactAt?: string
  contactOwner?: string
  createdAt: string
}

export interface EbdClass {
  id: string
  name: string
  description?: string
  teacherIds: string[]
  studentIds: string[]
  active: boolean
}

export interface AttendanceSession {
  id: string
  classId: string
  date: string
  records: Record<string, AttendanceStatus>
  createdBy: string
}

export interface SocietyOfficer {
  memberId: string
  role: string
}

export interface Society {
  id: string
  code: 'UCP' | 'UPA' | 'UMP' | 'UPH' | 'SAF'
  name: string
  minAge: number
  maxAge?: number
  leaderIds: string[]
  memberIds: string[]
  officers: SocietyOfficer[]
}

export interface SocietyRequest {
  id: string
  societyId: string
  memberId: string
  requestedBy: string
  requestedAt: string
  status: 'pendente' | 'aprovada' | 'recusada'
  reviewedBy?: string
}

export interface FinanceEntry {
  id: string
  type: 'entrada' | 'saída'
  date: string
  amount: number
  category: string
  description: string
  account: string
  contributor?: string
  receiptName?: string
  receipt?: MemberDocument
  createdBy: string
}

export interface AuditEntry {
  id: string
  at: string
  actorId: string
  action: string
  detail: string
}

export interface AppSettings {
  whatsappMessage: string
}

export interface AppData {
  version: 1
  users: User[]
  members: Member[]
  visitors: Visitor[]
  classes: EbdClass[]
  attendance: AttendanceSession[]
  societies: Society[]
  societyRequests: SocietyRequest[]
  finance: FinanceEntry[]
  audit: AuditEntry[]
  settings: AppSettings
}
