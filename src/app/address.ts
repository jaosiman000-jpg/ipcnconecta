import type { Person } from './types'

type Address = NonNullable<Person['address']>

/**
 * Cadastros antigos guardam número e complemento juntos ("61", "61 apto 2", "Casa 3").
 * Separa o número (os algarismos do início, ou "S/N") do restante, que vira complemento.
 * É só uma sugestão: quem abre o cadastro confere antes de salvar.
 */
export function splitNumberComplement(value: string | undefined) {
  const text = (value ?? '').trim()
  if (!text) return { number: '', complement: '' }
  const match = /^(s\/?n|\d+)\b[\s,.\-–/]*(.*)$/i.exec(text)
  if (!match) return { number: '', complement: text }
  return { number: match[1].toUpperCase(), complement: match[2].trim() }
}

/** Número e complemento de um endereço, aceitando o formato novo e o antigo. */
export function numberAndComplement(address: Address | undefined) {
  if (address?.number || address?.complement) return { number: address.number ?? '', complement: address.complement ?? '' }
  return splitNumberComplement(address?.numberComplement)
}
