import { z } from 'zod'

const id = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
const shortText = z.string().trim().max(300)
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Data inválida')
const optionalText = (max: number) => z.string().trim().max(max).optional()
const ids = z.array(id).max(500).refine((items) => new Set(items).size === items.length, 'IDs duplicados')

const storedFile = z.object({
  id,
  name: z.string().trim().min(1).max(255),
  type: z.enum([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp',
  ]),
  size: z.number().int().positive().max(10 * 1024 * 1024),
  addedAt: z.string().datetime(),
  storagePath: z.string().min(1).max(500),
}).strict()

const member = z.object({
  id,
  name: z.string().trim().min(3).max(120),
  birthDate: isoDate,
  phone: z.string().trim().min(5).max(30),
  address: optionalText(300),
  cpf: optionalText(20),
  email: z.string().trim().email().max(254).optional(),
  status: z.enum(['Ativo', 'Em análise', 'Disciplinado', 'Excluído', 'Falecido']),
  restrictedNotes: optionalText(5000),
  documents: z.array(storedFile).max(20),
  createdAt: z.string().datetime(),
}).strict()

const visitor = z.object({
  id,
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(5).max(30),
  birthDate: isoDate.optional(),
  visitDate: isoDate,
  consent: z.boolean(),
  contacted: z.boolean(),
  doNotContact: z.boolean(),
  lastContactAt: z.string().datetime().optional(),
  contactOwner: optionalText(120),
  createdAt: z.string().datetime(),
}).strict().refine((value) => !(value.consent && value.doNotContact), 'Consentimento e bloqueio de contato são incompatíveis')

const ebdClass = z.object({
  id,
  name: z.string().trim().min(2).max(120),
  description: optionalText(300),
  teacherIds: ids,
  studentIds: ids,
  active: z.boolean(),
}).strict()

const attendanceRecords = z.record(id, z.enum(['presente', 'ausente', 'justificado', 'visitante']))

const societyOfficer = z.object({
  memberId: id,
  role: z.enum(['Presidente', 'Vice-presidente', '1º secretário', '2º secretário', 'Tesoureiro', 'Secretário executivo']),
}).strict()

const society = z.object({
  id,
  code: z.enum(['UCP', 'UPA', 'UMP', 'UPH', 'SAF']),
  name: z.string().trim().min(2).max(120),
  minAge: z.number().int().min(0).max(130),
  maxAge: z.number().int().min(0).max(130).optional(),
  leaderIds: ids,
  memberIds: ids,
  officers: z.array(societyOfficer).max(6),
}).strict().refine((value) => value.maxAge === undefined || value.maxAge >= value.minAge, 'Faixa etária inválida')

const financeEntry = z.object({
  id,
  type: z.enum(['entrada', 'saída']),
  date: isoDate,
  amount: z.number().positive().max(1_000_000_000),
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(300),
  account: z.string().trim().min(1).max(120),
  contributor: optionalText(120),
  receiptName: optionalText(255),
  receipt: storedFile.optional(),
  createdBy: z.string().max(160),
}).strict()

const roles = z.array(z.enum(['administrador', 'conselho', 'secretaria', 'tesouraria', 'professor', 'lider', 'acolhimento']))
  .min(1).max(7).refine((items) => new Set(items).size === items.length, 'Papéis duplicados')

const profilePhoto = z.string()
  .max(140_000)
  .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/)

export const mutationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('member.save'), member }).strict(),
  z.object({ type: z.literal('visitor.save'), visitor }).strict(),
  z.object({ type: z.literal('visitor.contact'), visitorId: id }).strict(),
  z.object({ type: z.literal('ebd.class.save'), item: ebdClass }).strict(),
  z.object({ type: z.literal('ebd.attendance.save'), id, classId: id, date: isoDate, records: attendanceRecords }).strict(),
  z.object({ type: z.literal('society.save'), item: society }).strict(),
  z.object({ type: z.literal('society.request.create'), id, societyId: id, memberId: id }).strict(),
  z.object({ type: z.literal('society.request.review'), requestId: id, approved: z.boolean() }).strict(),
  z.object({ type: z.literal('finance.create'), entry: financeEntry }).strict(),
  z.object({ type: z.literal('settings.update'), whatsappMessage: z.string().trim().min(1).max(1000) }).strict(),
  z.object({ type: z.literal('user.profile.update'), name: z.string().trim().min(3).max(120), photo: profilePhoto.optional() }).strict(),
  z.object({ type: z.literal('user.access.save'), userId: id, roles, classIds: ids, societyIds: ids }).strict(),
  z.object({ type: z.literal('user.access.reject'), userId: id }).strict(),
  z.object({ type: z.literal('user.access.toggle'), userId: id }).strict(),
])

export type MutationInput = z.infer<typeof mutationSchema>
export type Role = z.infer<typeof roles>[number]

export function safeDetail(value: unknown) {
  return shortText.parse(String(value ?? ''))
}
