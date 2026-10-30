export type Role =
  | 'administrador'
  | 'conselho'
  | 'secretaria'
  | 'diacono'
  | 'professor'
  | 'lider'
  | 'acolhimento'

export type UserStatus = 'ativo' | 'pendente' | 'desativado'
export type MemberStatus = 'Ativo' | 'Em análise' | 'Disciplinado' | 'Excluído' | 'Falecido'
export type MembershipType = 'Comungante' | 'Não comungante'
export type PersonSex = 'Feminino' | 'Masculino'
export type MaritalStatus = 'Solteiro' | 'Casado' | 'Divorciado' | 'Viúvo'
export type AttendanceStatus = 'presente' | 'ausente' | 'justificado' | 'visitante'

export interface AttendanceVisitor {
  id: string
  name: string
  phone?: string
}

export interface User {
  id: string
  personId?: string
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
  memberNumber?: number
  membershipType?: MembershipType
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
  visitors?: AttendanceVisitor[]
  status?: 'rascunho' | 'finalizada'
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

export type ContributionCategory = 'Dízimo' | 'Oferta' | 'Missões'
export type PaymentMethod = 'Dinheiro' | 'PIX'
export type ContributionStatus = 'ativo' | 'cancelado'

export interface Person {
  id: string
  authUserId?: string
  name: string
  birthDate?: string
  phone?: string
  homePhone?: string
  email?: string
  sex?: PersonSex
  address?: {
    street?: string
    numberComplement?: string
    neighborhood?: string
    city?: string
    postalCode?: string
  }
  nationality?: string
  birthCity?: string
  birthState?: string
  maritalStatus?: MaritalStatus
  fatherName?: string
  fatherIsMember?: boolean
  motherName?: string
  motherIsMember?: boolean
  ebd?: {
    registrationNumber?: number
    classId?: string
    className?: string
    enrolledAt?: string
    professor: boolean
    status: 'ativo' | 'inativo'
  }
  membership?: {
    memberNumber?: number
    type: MembershipType
    status: MemberStatus
    joinedAt?: string
  }
  tither: boolean
  status: 'ativo' | 'arquivado' | 'falecido'
  source?: 'manual' | 'ipcn-ebd-import'
  createdAt?: string
  updatedAt?: string
}

export type PersonInput = Omit<Person, 'createdAt' | 'updatedAt'>

export interface ContributionBatchItem {
  id: string
  amount: number
  category: ContributionCategory
  method: PaymentMethod
  personId?: string
  contributorName: string
  anonymous: boolean
}

export interface ContributionBatch {
  id: string
  date: string
  status: 'rascunho' | 'finalizado' | 'descartado'
  items: ContributionBatchItem[]
  createdBy: string
  createdByName: string
  createdAt: string
  updatedAt: string
  finalizedAt?: string
  itemCount?: number
  total?: number
}

export interface FinanceEntry {
  id: string
  batchId: string
  date: string
  amount: number
  category: ContributionCategory
  method: PaymentMethod
  personId?: string
  contributorName: string
  anonymous: boolean
  status: ContributionStatus
  createdBy: string
  createdByName: string
  createdAt: string
  cancelledAt?: string
  cancelledBy?: string
  cancelledByName?: string
  cancellationReason?: string
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
  people: Person[]
  financeBatches: ContributionBatch[]
  finance: FinanceEntry[]
  audit: AuditEntry[]
  settings: AppSettings
}
