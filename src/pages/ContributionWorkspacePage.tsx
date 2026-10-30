import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, Banknote, Check, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { makeId, useApp } from '../app/AppContext'
import { useAuth } from '../app/AuthContext'
import { money } from '../app/format'
import { callSecureMutation } from '../app/secureApi'
import type { ContributionBatchItem, ContributionCategory, PaymentMethod, Person } from '../app/types'
import { CustomSelect, Field, Modal } from '../components/Common'
import { PixIcon } from '../components/PixIcon'

const categoryOptions = ['Dízimo', 'Oferta', 'Missões'] as const
const currencyFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function formatCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 12)
  return digits ? currencyFormatter.format(Number(digits) / 100) : ''
}

function currencyInputToNumber(value: string) {
  const digits = value.replace(/\D/g, '')
  return digits ? Number(digits) / 100 : 0
}

export function ContributionWorkspacePage() {
  const { data } = useApp()
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedBatch = searchParams.get('lote')
  const ownDraft = data.financeBatches.find((batch) => batch.status === 'rascunho' && batch.createdBy === currentUser?.id && (!requestedBatch || batch.id === requestedBatch))
  const initialBatchId = useRef(requestedBatch ?? ownDraft?.id ?? makeId('batch'))
  const loadedDraftId = useRef<string | null>(null)
  const personSearchRef = useRef<HTMLInputElement>(null)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [items, setItems] = useState<ContributionBatchItem[]>([])
  const [category, setCategory] = useState<ContributionCategory>('Dízimo')
  const [method, setMethod] = useState<PaymentMethod>('Dinheiro')
  const [amountInput, setAmountInput] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [personSearch, setPersonSearch] = useState('')
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!ownDraft || loadedDraftId.current === ownDraft.id) return
    loadedDraftId.current = ownDraft.id
    setDate(ownDraft.date)
    setItems(ownDraft.items)
  }, [ownDraft])

  useEffect(() => {
    if (category === 'Dízimo') setAnonymous(false)
  }, [category])

  const people = useMemo(() => data.people.filter((person) => person.status === 'ativo' && person.tither), [data.people])
  const matches = useMemo(() => personSearch.trim().length < 2 || selectedPerson ? [] : people.filter((person) => person.name.toLowerCase().includes(personSearch.trim().toLowerCase())).slice(0, 8), [people, personSearch, selectedPerson])
  const total = items.reduce((sum, item) => sum + item.amount, 0)

  function resetComposer() {
    setEditingId(null)
    setSelectedPerson(null)
    setPersonSearch('')
    setAnonymous(false)
    setAmountInput('')
    requestAnimationFrame(() => personSearchRef.current?.focus())
  }

  function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amount = currencyInputToNumber(amountInput)
    if (!amount || amount <= 0) return
    if (!anonymous && !selectedPerson) {
      personSearchRef.current?.focus()
      return
    }
    const item: ContributionBatchItem = {
      id: editingId ?? makeId('item'),
      amount,
      category,
      method,
      personId: anonymous ? undefined : selectedPerson?.id,
      contributorName: anonymous ? 'Anônimo' : selectedPerson?.name ?? '',
      anonymous,
    }
    setItems((current) => editingId ? current.map((entry) => entry.id === editingId ? item : entry) : [...current, item])
    resetComposer()
  }

  function editItem(item: ContributionBatchItem) {
    setEditingId(item.id)
    setCategory(item.category)
    setMethod(item.method)
    setAmountInput(currencyFormatter.format(item.amount))
    setAnonymous(item.anonymous)
    setSelectedPerson(item.personId ? people.find((person) => person.id === item.personId) ?? { id: item.personId, name: item.contributorName, status: 'ativo', tither: true } : null)
    setPersonSearch(item.anonymous ? '' : item.contributorName)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function saveDraft(showFeedback = true) {
    setSaving(true)
    try {
      await callSecureMutation({ type: 'finance.batch.save', batch: { id: initialBatchId.current, date, items } })
      if (showFeedback) window.alert('Rascunho salvo.')
      return true
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Não foi possível salvar o rascunho.')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function finalizeBatch() {
    setSaving(true)
    try {
      await callSecureMutation({ type: 'finance.batch.save', batch: { id: initialBatchId.current, date, items } })
      await callSecureMutation({ type: 'finance.batch.finalize', batchId: initialBatchId.current })
      navigate('/financeiro', { replace: true })
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Não foi possível finalizar o lote.')
    } finally {
      setSaving(false)
      setConfirmOpen(false)
    }
  }

  async function discardDraft() {
    if (!window.confirm('Descartar este rascunho? Esta ação não poderá ser desfeita.')) return
    setSaving(true)
    try {
      if (ownDraft) await callSecureMutation({ type: 'finance.batch.discard', batchId: initialBatchId.current })
      navigate('/financeiro', { replace: true })
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Não foi possível descartar o rascunho.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page contribution-workspace-page">
      <header className="contribution-workspace-header"><div><Link to="/financeiro" className="workspace-back"><ArrowLeft size={18} /> Voltar ao financeiro</Link><p className="eyebrow">Junta Diaconal</p><h1>Registrar contribuições</h1><p>Adicione os recebimentos do dia e finalize o lote após a conferência.</p></div><span className="draft-badge">Rascunho</span></header>
      <div className="contribution-layout">
        <section className="panel contribution-composer"><div className="contribution-section-title"><div><span>1</span><div><h2>Nova contribuição</h2><p>Preencha uma pessoa por vez.</p></div></div><Field label="Data do recebimento"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></Field></div>
          <form onSubmit={addItem}>
            <div className="contribution-type-row"><div className="field"><span>Tipo *</span><CustomSelect label="Tipo" value={category} onChange={(value) => setCategory(value as ContributionCategory)} options={categoryOptions.map((value) => ({ value, label: value }))} /></div><fieldset className="identity-choice"><legend>Identificação *</legend><label><input type="radio" checked={!anonymous} onChange={() => setAnonymous(false)} /> Identificada</label><label className={category === 'Dízimo' ? 'disabled' : ''}><input type="radio" checked={anonymous} disabled={category === 'Dízimo'} onChange={() => { setAnonymous(true); setSelectedPerson(null); setPersonSearch('') }} /> Anônima</label></fieldset></div>
            {!anonymous && <div className="person-search-field"><label><span>Pessoa *</span><div className={selectedPerson ? 'person-search-input selected' : 'person-search-input'}><Search size={18} /><input ref={personSearchRef} value={personSearch} onChange={(event) => { setPersonSearch(event.target.value); setSelectedPerson(null) }} placeholder="Busque pelo nome" autoComplete="off" />{selectedPerson && <Check size={18} />}</div></label>{matches.length > 0 && <div className="person-results">{matches.map((person) => <button key={person.id} type="button" onClick={() => { setSelectedPerson(person); setPersonSearch(person.name) }}><strong>{person.name}</strong><span>{person.phone || 'Sem telefone informado'}</span></button>)}</div>}<p className="form-hint">Pessoas novas devem ser incluídas pela aba Cadastros antes do lançamento.</p></div>}
            {anonymous && <div className="anonymous-note">Esta contribuição será registrada como <strong>Anônimo</strong>.</div>}
            <div className="contribution-value-row"><Field label="Valor *"><div className="currency-input"><span>R$</span><input name="amount" type="text" inputMode="numeric" autoComplete="off" value={amountInput} onChange={(event) => setAmountInput(formatCurrencyInput(event.target.value))} placeholder="0,00" aria-label="Valor da contribuição" required /></div></Field><fieldset className="payment-choice"><legend>Forma de recebimento *</legend><button type="button" className={method === 'Dinheiro' ? 'selected' : ''} onClick={() => setMethod('Dinheiro')}><Banknote size={21} /> Dinheiro</button><button type="button" className={method === 'PIX' ? 'selected' : ''} onClick={() => setMethod('PIX')}><PixIcon width={20} height={20} /> PIX</button></fieldset><button className="button primary add-contribution-button" type="submit"><Plus size={18} /> {editingId ? 'Atualizar' : 'Adicionar'}</button></div>
          </form>
        </section>
        <aside className="panel contribution-batch-summary"><div className="contribution-section-title"><div><span>2</span><div><h2>Lote do dia</h2><p>Confira antes de finalizar.</p></div></div></div><div className="batch-count"><span>{items.length} contribuiç{items.length === 1 ? 'ão' : 'ões'}</span><strong>{money.format(total)}</strong></div>{items.length ? <div className="batch-items">{items.map((item) => <article key={item.id}><span className={item.method === 'PIX' ? 'batch-method pix' : 'batch-method money'}>{item.method === 'PIX' ? <PixIcon width={18} height={18} /> : <Banknote size={19} />}</span><div><strong>{item.contributorName}</strong><small>{item.category} · {item.method}</small></div><b>{money.format(item.amount)}</b><div className="batch-item-actions"><button type="button" onClick={() => editItem(item)} aria-label={`Editar contribuição de ${item.contributorName}`}><Pencil size={15} /></button><button type="button" onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))} aria-label={`Remover contribuição de ${item.contributorName}`}><Trash2 size={15} /></button></div></article>)}</div> : <div className="batch-empty"><Banknote size={28} /><strong>Nenhuma contribuição</strong><p>Os itens adicionados aparecerão aqui.</p></div>}</aside>
      </div>
      <footer className="contribution-footer"><button className="button danger-subtle" type="button" onClick={discardDraft} disabled={saving}>Descartar</button><div><button className="button secondary" type="button" onClick={() => void saveDraft()} disabled={saving}>Salvar rascunho</button><button className="button primary" type="button" onClick={() => setConfirmOpen(true)} disabled={saving || !items.length}>Finalizar lote</button></div></footer>
      <Modal title="Finalizar lote?" description="Após a finalização, os lançamentos não poderão ser editados ou apagados." open={confirmOpen} onClose={() => !saving && setConfirmOpen(false)}><div className="finalize-batch-confirm"><strong>{items.length} contribuiç{items.length === 1 ? 'ão' : 'ões'}</strong><span>{money.format(total)}</span><p>Confira os nomes, tipos, formas de recebimento e valores antes de continuar.</p><div><button className="button secondary" onClick={() => setConfirmOpen(false)} disabled={saving}>Voltar e conferir</button><button className="button primary" onClick={finalizeBatch} disabled={saving}>Confirmar e finalizar</button></div></div></Modal>
    </div>
  )
}
