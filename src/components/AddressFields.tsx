import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Search } from 'lucide-react'
import { numberAndComplement } from '../app/address'
import { formatCep, isCompleteCep, lookupCep } from '../app/cep'
import type { Person } from '../app/types'
import { Field } from './Common'

type SearchState = 'idle' | 'searching' | 'found' | 'not_found' | 'error'

// Sem texto na tela: o estado aparece no ícone. As frases abaixo são lidas por leitores de tela e viram a dica da lupa.
const MESSAGES: Record<SearchState, string> = {
  idle: '',
  searching: 'Buscando endereço…',
  found: 'Endereço preenchido.',
  not_found: 'CEP não encontrado. Preencha o endereço manualmente.',
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
      <Field label="CEP">
        <span className="cep-input">
          <input name="postalCode" value={cep} onChange={(event) => changeCep(event.target.value)} inputMode="numeric" autoComplete="postal-code" maxLength={9} />
          <span className={`cep-icon ${state}`} title={MESSAGES[state] || undefined} aria-hidden="true">{state === 'searching' ? <LoaderCircle size={19} /> : <Search size={19} />}</span>
          <span className="sr-only" role="status" aria-live="polite">{MESSAGES[state]}</span>
        </span>
      </Field>
      <Field label="Rua"><input name="street" value={street} onChange={(event) => setStreet(event.target.value)} autoComplete="address-line1" /></Field>
      <Field label="Número"><input name="number" ref={numberRef} defaultValue={current.number} maxLength={20} autoComplete="off" /></Field>
      <Field label="Complemento"><input name="complement" defaultValue={current.complement} maxLength={80} autoComplete="off" /></Field>
      <Field label="Bairro"><input name="neighborhood" value={neighborhood} onChange={(event) => setNeighborhood(event.target.value)} /></Field>
      <Field label="Cidade"><input name="city" value={city} onChange={(event) => setCity(event.target.value)} autoComplete="address-level2" /></Field>
    </>
  )
}
