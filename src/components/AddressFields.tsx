import { useEffect, useRef, useState } from 'react'
import { numberAndComplement } from '../app/address'
import { formatCep, isCompleteCep, lookupCep } from '../app/cep'
import type { Person } from '../app/types'
import { Field } from './Common'

type SearchState = 'idle' | 'searching' | 'found' | 'not_found' | 'error'

const MESSAGES: Record<SearchState, string> = {
  idle: 'Digite o CEP para preencher o endereço automaticamente.',
  searching: 'Buscando endereço…',
  found: 'Endereço preenchido. Informe o número e, se houver, o complemento.',
  not_found: 'CEP não encontrado. Confira os números ou preencha o endereço manualmente.',
  error: 'Não foi possível buscar o CEP agora. Preencha o endereço manualmente.',
}

/**
 * Campos de endereço com busca automática pelo CEP: ao completar os 8 números, preenche rua, bairro e cidade
 * e leva o cursor para o número. Todos os campos continuam editáveis e a busca é só uma ajuda.
 * Os nomes dos campos são lidos pelo formulário de cadastro, que deve recriar este componente a cada pessoa (`key`).
 */
export function AddressFields({ initial }: { initial?: Person['address'] }) {
  const current = numberAndComplement(initial)
  const [cep, setCep] = useState(initial?.postalCode ?? '')
  const [street, setStreet] = useState(initial?.street ?? '')
  const [neighborhood, setNeighborhood] = useState(initial?.neighborhood ?? '')
  const [city, setCity] = useState(initial?.city ?? '')
  const [state, setState] = useState<SearchState>('idle')
  const numberRef = useRef<HTMLInputElement>(null)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => controller.current?.abort(), [])

  async function search(value: string) {
    controller.current?.abort()
    const current = new AbortController()
    controller.current = current
    setState('searching')
    const result = await lookupCep(value, { signal: current.signal })
    if (current.signal.aborted) return
    if (result.status !== 'found') {
      setState(result.status)
      return
    }
    // Só substitui o que a busca trouxe; o que não veio (CEP genérico, sem rua) fica como está.
    if (result.address.street) setStreet(result.address.street)
    if (result.address.neighborhood) setNeighborhood(result.address.neighborhood)
    if (result.address.city) setCity(result.address.city)
    setState('found')
    numberRef.current?.focus()
  }

  function changeCep(raw: string) {
    const next = formatCep(raw)
    setCep(next)
    if (isCompleteCep(next)) void search(next)
    else {
      controller.current?.abort()
      setState('idle')
    }
  }

  return (
    <>
      <Field label="CEP" className="address-cep"><input name="postalCode" value={cep} onChange={(event) => changeCep(event.target.value)} inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" maxLength={9} /><small role="status" aria-live="polite" className={state === 'not_found' || state === 'error' ? 'address-warning' : undefined}>{MESSAGES[state]}</small></Field>
      <Field label="Rua"><input name="street" value={street} onChange={(event) => setStreet(event.target.value)} autoComplete="address-line1" /></Field>
      <Field label="Número"><input name="number" ref={numberRef} defaultValue={current.number} maxLength={20} placeholder="Ex.: 61 ou S/N" autoComplete="off" /></Field>
      <Field label="Complemento" hint="Se houver: apartamento, bloco, casa…"><input name="complement" defaultValue={current.complement} maxLength={80} autoComplete="off" /></Field>
      <Field label="Bairro"><input name="neighborhood" value={neighborhood} onChange={(event) => setNeighborhood(event.target.value)} /></Field>
      <Field label="Cidade"><input name="city" value={city} onChange={(event) => setCity(event.target.value)} autoComplete="address-level2" /></Field>
    </>
  )
}
