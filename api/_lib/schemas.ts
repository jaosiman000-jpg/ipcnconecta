import { z } from 'zod'

const id = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
const shortText = z.string().trim().max(300)
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}, 'Data inválida')
const optionalText = (max: number) => z.string().trim().max(max).optional()
const ids = z.array(id).max(500).refine((items) => new Set(items).size === items.length, 'IDs duplicados')

const personAddress = z.object({
  street: optionalText(160),
  numberComplement: optionalText(80),
  neighborhood: optionalText(100),
  city: optionalText(100),
  postalCode: optionalText(20),
}).strict()

const personEbd = z.object({
  registrationNumber: z.number().int().positive().max(999_999).optional(),
  classId: id.optional(),
  className: optionalText(120),
  enrolledAt: isoDate.optional(),
  professor: z.boolean(),
  status: z.enum(['ativo', 'inativo']),
}).strict()

const personMembership = z.object({
  memberNumber: z.number().int().positive().max(999_999).optional(),
  type: z.enum(['Comungante', 'Não comungante']),
  status: z.enum(['Ativo', 'Em análise', 'Disciplinado', 'Excluído', 'Falecido']),
  joinedAt: isoDate.optional(),
}).strict()

const person = z.object({
  id,
  name: z.string().trim().min(3).max(120),
  birthDate: isoDate.optional(),
  phone: optionalText(30),
  homePhone: optionalText(30),
  email: z.string().trim().email().max(254).optional(),
  sex: z.enum(['Feminino', 'Masculino']).optional(),
  address: personAddress.optional(),
  nationality: optionalText(80),
  birthCity: optionalText(100),
  birthState: optionalText(30),
  maritalStatus: z.enum(['Solteiro', 'Casado', 'Divorciado', 'Viúvo']).optional(),
  fatherName: optionalText(120),
  fatherIsMember: z.boolean().optional(),
  motherName: optionalText(120),
  motherIsMember: z.boolean().optional(),
  ebd: personEbd.optional(),
  membership: personMembership.optional(),
  tither: z.boolean(),
  status: z.enum(['ativo', 'arquivado', 'falecido']),
  source: z.enum(['manual', 'ipcn-ebd-import']).optional(),
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
const attendanceVisitors = z.array(z.object({
  id,
  name: z.string().trim().min(2).max(120),
  phone: optionalText(30),
}).strict()).max(30)

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

const contributionItem = z.object({
  id,
  amount: z.number().positive().max(1_000_000_000),
  category: z.enum(['Dízimo', 'Oferta', 'Missões']),
  method: z.enum(['Dinheiro', 'PIX']),
  personId: id.optional(),
  contributorName: z.string().trim().min(1).max(120),
  anonymous: z.boolean(),
}).strict().superRefine((item, context) => {
  if (item.category === 'Dízimo' && (item.anonymous || !item.personId)) {
    context.addIssue({ code: 'custom', message: 'O dízimo precisa estar vinculado a uma pessoa.' })
  }
  if (item.anonymous && item.personId) {
    context.addIssue({ code: 'custom', message: 'Uma contribuição anônima não pode ter pessoa vinculada.' })
  }
})

const contributionBatch = z.object({
  id,
  date: isoDate,
  items: z.array(contributionItem).max(200).refine((items) => new Set(items.map((item) => item.id)).size === items.length, 'Itens duplicados'),
}).strict()

const roles = z.array(z.enum(['administrador', 'conselho', 'secretaria', 'diacono', 'professor', 'lider', 'acolhimento']))
  .min(1).max(7).refine((items) => new Set(items).size === items.length, 'Papéis duplicados')

const profilePhoto = z.string()
  .max(140_000)
  .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/)

export const mutationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('person.save'), person }).strict(),
  z.object({
    type: z.literal('people.import'),
    importId: id,
    people: z.array(person).min(1).max(250)
      .refine((items) => new Set(items.map((item) => item.id)).size === items.length, 'Pessoas duplicadas')
      .refine((items) => items.every((item) => item.source === 'ipcn-ebd-import' && item.ebd?.registrationNumber), 'Importação sem matrícula'),
  }).strict(),
  z.object({ type: z.literal('visitor.save'), visitor }).strict(),
  z.object({ type: z.literal('visitor.contact'), visitorId: id }).strict(),
  z.object({ type: z.literal('ebd.class.save'), item: ebdClass }).strict(),
  z.object({ type: z.literal('ebd.attendance.save'), id, classId: id, date: isoDate, records: attendanceRecords, visitors: attendanceVisitors, status: z.enum(['rascunho', 'finalizada']) }).strict(),
  z.object({ type: z.literal('society.save'), item: society }).strict(),
  z.object({ type: z.literal('society.request.create'), id, societyId: id, memberId: id }).strict(),
  z.object({ type: z.literal('society.request.review'), requestId: id, approved: z.boolean() }).strict(),
  z.object({ type: z.literal('finance.batch.save'), batch: contributionBatch }).strict(),
  z.object({ type: z.literal('finance.batch.finalize'), batchId: id }).strict(),
  z.object({ type: z.literal('finance.batch.discard'), batchId: id }).strict(),
  z.object({ type: z.literal('finance.entry.cancel'), entryId: id, reason: z.string().trim().min(5).max(500) }).strict(),
  z.object({ type: z.literal('settings.update'), whatsappMessage: z.string().trim().min(1).max(1000) }).strict(),
  z.object({ type: z.literal('user.profile.update'), name: z.string().trim().min(3).max(120), photo: profilePhoto.optional() }).strict(),
  z.object({ type: z.literal('user.access.save'), userId: id, personId: id, roles, classIds: ids, societyIds: ids }).strict(),
  z.object({ type: z.literal('user.person.link'), userId: id, personId: id }).strict(),
  z.object({ type: z.literal('user.access.reject'), userId: id }).strict(),
  z.object({ type: z.literal('user.access.toggle'), userId: id }).strict(),
])

export type MutationInput = z.infer<typeof mutationSchema>
export type Role = z.infer<typeof roles>[number]

export function safeDetail(value: unknown) {
  return shortText.parse(String(value ?? ''))
}
