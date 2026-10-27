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
      roles: ['professor', 'professor'],
      classIds: [],
      societyIds: [],
    })
    const invalidId = mutationSchema.safeParse({ type: 'visitor.contact', visitorId: '../visitor-1' })

    expect(duplicatedRoles.success).toBe(false)
    expect(invalidId.success).toBe(false)
  })

  it('recusa metadados de arquivo acima de 10 MB', () => {
    const parsed = mutationSchema.safeParse({
      type: 'finance.create',
      entry: {
        id: 'finance-1',
        type: 'entrada',
        date: '2026-10-25',
        amount: 100,
        category: 'Dízimos',
        description: 'Registro de teste',
        account: 'Caixa',
        createdBy: 'user-1',
        receipt: {
          id: 'receipt-1',
          name: 'comprovante.pdf',
          type: 'application/pdf',
          size: 10 * 1024 * 1024 + 1,
          addedAt: '2026-10-25T12:00:00.000Z',
          storagePath: 'finance/finance-1/receipt-1.pdf',
        },
      },
    })

    expect(parsed.success).toBe(false)
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
})
