import { describe, expect, it } from 'vitest'
import { createInitialData } from './initialData'

describe('base inicial do sistema', () => {
  it('começa sem registros de pessoas, aulas, finanças ou auditoria', () => {
    const data = createInitialData()

    expect(data.users).toEqual([])
    expect(data.members).toEqual([])
    expect(data.visitors).toEqual([])
    expect(data.classes).toEqual([])
    expect(data.attendance).toEqual([])
    expect(data.societyRequests).toEqual([])
    expect(data.finance).toEqual([])
    expect(data.audit).toEqual([])
  })

  it('mantém apenas a estrutura vazia das sociedades oficiais', () => {
    const societies = createInitialData().societies

    expect(societies.map((society) => society.code)).toEqual(['UCP', 'UPA', 'UMP', 'UPH', 'SAF'])
    expect(societies.every((society) => !society.memberIds.length && !society.leaderIds.length && !society.officers.length)).toBe(true)
  })
})
