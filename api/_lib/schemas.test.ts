import { describe, expect, it } from 'vitest'
import { mutationSchema } from './schemas'

const visitor = {
  id: 'visitor-1',
  name: 'Pessoa Teste',
  phone: '31999999999',
  visitDate: '2026-10-25',
  consent: true,
  contacted: false,
  doNotContact: false,
  createdAt: '2026-10-25T12:00:00.000Z',
}

describe('contrato das mutações seguras', () => {
  it('aceita somente uma mutação conhecida e bem formada', () => {
    const parsed = mutationSchema.safeParse({ type: 'visitor.save', visitor })
    expect(parsed.success).toBe(true)
  })

  it('recusa campos extras no corpo da requisição', () => {
    const parsed = mutationSchema.safeParse({ type: 'visitor.contact', visitorId: 'visitor-1', role: 'administrador' })
    expect(parsed.success).toBe(false)
  })

  it('recusa consentimento e bloqueio de contato simultâneos', () => {
    const parsed = mutationSchema.safeParse({
      type: 'visitor.save',
      visitor: { ...visitor, doNotContact: true },
    })
    expect(parsed.success).toBe(false)
  })

  it('recusa papéis duplicados e identificadores inválidos', () => {
    const duplicatedRoles = mutationSchema.safeParse({
      type: 'user.access.save',
      userId: 'user-1',
      personId: 'person-1',
      roles: ['professor', 'professor'],
      classIds: [],
      societyIds: [],
    })
    const invalidId = mutationSchema.safeParse({ type: 'visitor.contact', visitorId: '../visitor-1' })

    expect(duplicatedRoles.success).toBe(false)
    expect(invalidId.success).toBe(false)
  })

  it('exige pessoa na aprovação e valida o vínculo direto', () => {
    const missingPerson = mutationSchema.safeParse({
      type: 'user.access.save', userId: 'user-1', roles: ['administrador'], classIds: [], societyIds: [],
    })
    const validLink = mutationSchema.safeParse({ type: 'user.person.link', userId: 'user-1', personId: 'person-1' })

    expect(missingPerson.success).toBe(false)
    expect(validLink.success).toBe(true)
  })

  it('aceita lote de contribuições e recusa dízimo anônimo', () => {
    const valid = mutationSchema.safeParse({
      type: 'finance.batch.save',
      batch: {
        id: 'batch-1',
        date: '2026-10-25',
        items: [{ id: 'item-1', amount: 100, category: 'Dízimo', method: 'PIX', personId: 'person-1', contributorName: 'Pessoa Teste', anonymous: false }],
      },
    })
    const anonymousTithe = mutationSchema.safeParse({
      type: 'finance.batch.save',
      batch: { id: 'batch-2', date: '2026-10-25', items: [{ id: 'item-1', amount: 100, category: 'Dízimo', method: 'Dinheiro', contributorName: 'Anônimo', anonymous: true }] },
    })

    expect(valid.success).toBe(true)
    expect(anonymousTithe.success).toBe(false)
  })

  it('aceita rascunho de chamada com visitante e recusa campos extras', () => {
    const attendance = {
      type: 'ebd.attendance.save',
      id: 'attendance-1',
      classId: 'class-1',
      date: '2026-10-28',
      records: { 'member-1': 'presente' },
      visitors: [{ id: 'visitor-1', name: 'Visitante Teste', phone: '31999999999' }],
      status: 'rascunho',
    }

    expect(mutationSchema.safeParse(attendance).success).toBe(true)
    expect(mutationSchema.safeParse({ ...attendance, sundayOverride: true }).success).toBe(false)
  })

  it('permite atualizar somente os dados pessoais do próprio perfil', () => {
    const valid = mutationSchema.safeParse({
      type: 'user.profile.update',
      name: 'Pessoa Teste',
      photo: 'data:image/webp;base64,AAAA',
    })
    const accessInjection = mutationSchema.safeParse({
      type: 'user.profile.update',
      name: 'Pessoa Teste',
      roles: ['administrador'],
    })

    expect(valid.success).toBe(true)
    expect(accessInjection.success).toBe(false)
  })

  it('aceita cadastro unificado sem números definidos pelo navegador', () => {
    const parsed = mutationSchema.safeParse({
      type: 'person.save',
      person: {
        id: 'person-1',
        name: 'Pessoa Teste',
        birthDate: '2000-01-01',
        phone: '31999999999',
        sex: 'Feminino',
        ebd: { classId: 'class-1', professor: false, status: 'ativo' },
        membership: { type: 'Comungante', status: 'Ativo' },
        tither: true,
        status: 'ativo',
        source: 'manual',
      },
    })

    expect(parsed.success).toBe(true)
  })

  it('recusa vínculo, sexo e situação fora dos valores permitidos', () => {
    const parsed = mutationSchema.safeParse({
      type: 'person.save',
      person: {
        id: 'person-1',
        name: 'Pessoa Teste',
        sex: 'Outro valor',
        membership: { type: 'Visitante', status: 'Ativo' },
        tither: false,
        status: 'ativo',
      },
    })

    expect(parsed.success).toBe(false)
  })
})
