import { describe, expect, it } from 'vitest'
import { numberAndComplement, splitNumberComplement } from './address'

describe('separar número e complemento de cadastros antigos', () => {
  it.each([
    ['61', '61', ''],
    ['61 apto 2', '61', 'apto 2'],
    ['123, bloco B', '123', 'bloco B'],
    ['123-A', '123', 'A'],
    ['45/ap 101', '45', 'ap 101'],
    ['S/N', 'S/N', ''],
    ['sn casa 2', 'SN', 'casa 2'],
    ['Casa 3', '', 'Casa 3'],
    ['  ', '', ''],
  ])('"%s" vira número "%s" e complemento "%s"', (input, number, complement) => {
    expect(splitNumberComplement(input)).toEqual({ number, complement })
  })

  it('não confunde o complemento com o número', () => {
    expect(splitNumberComplement('Lote 12')).toEqual({ number: '', complement: 'Lote 12' })
  })

  it('o formato novo tem prioridade e o antigo é só reserva', () => {
    expect(numberAndComplement({ number: '10', complement: 'fundos', numberComplement: '99 x' })).toEqual({ number: '10', complement: 'fundos' })
    expect(numberAndComplement({ numberComplement: '61 apto 2' })).toEqual({ number: '61', complement: 'apto 2' })
    expect(numberAndComplement(undefined)).toEqual({ number: '', complement: '' })
  })
})
