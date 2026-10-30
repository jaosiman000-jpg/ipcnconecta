import { useMemo, useState, type FormEvent } from 'react'
import { Banknote, Download, MoreHorizontal, Plus, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { displayDate, money } from '../app/format'
import { callSecureMutation } from '../app/secureApi'
import type { ContributionCategory, FinanceEntry, PaymentMethod } from '../app/types'
import { useAuth } from '../app/AuthContext'
import { CustomSelect, EmptyState, Field, FormActions, Modal, PageHeader, SearchField, StatusBadge } from '../components/Common'
import { PixIcon } from '../components/PixIcon'

const categories = ['Todos', 'Dízimo', 'Oferta', 'Missões'] as const
const methods = ['Todos', 'Dinheiro', 'PIX'] as const
const statuses = ['Todos', 'Ativo', 'Cancelado'] as const

export function FinancePage() {
  const { data } = useApp()
  const { currentUser, accountUsers } = useAuth()
  const [tab, setTab] = useState<'entries' | 'contributors'>('entries')
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [category, setCategory] = useState<(typeof categories)[number]>('Todos')
  const [method, setMethod] = useState<(typeof methods)[number]>('Todos')
  const [status, setStatus] = useState<(typeof statuses)[number]>('Todos')
  const [cancelling, setCancelling] = useState<FinanceEntry | null>(null)
  const [saving, setSaving] = useState(false)

  const monthEntries = useMemo(() => data.finance.filter((entry) => entry.date.startsWith(month)), [data.finance, month])
  const activeEntries = monthEntries.filter((entry) => entry.status !== 'cancelado')
  const total = activeEntries.reduce((sum, entry) => sum + entry.amount, 0)
  const categoryTotal = (value: ContributionCategory) => activeEntries.filter((entry) => entry.category === value).reduce((sum, entry) => sum + entry.amount, 0)
  const methodTotal = (value: PaymentMethod) => activeEntries.filter((entry) => entry.method === value).reduce((sum, entry) => sum + entry.amount, 0)

  const entries = useMemo(() => monthEntries.filter((entry) => {
    const text = `${entry.contributorName} ${entry.category} ${entry.createdByName}`.toLowerCase()
    return text.includes(search.toLowerCase())
      && (category === 'Todos' || entry.category === category)
      && (method === 'Todos' || entry.method === method)
      && (status === 'Todos' || (status === 'Ativo' ? entry.status !== 'cancelado' : entry.status === 'cancelado'))
  }).sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`)), [monthEntries, search, category, method, status])

  const contributors = useMemo(() => {
    const grouped = new Map<string, { name: string; entries: number; total: number; lastDate: string }>()
    data.finance.filter((entry) => entry.status !== 'cancelado' && !entry.anonymous).forEach((entry) => {
      const key = entry.personId ?? entry.contributorName
      const current = grouped.get(key) ?? { name: entry.contributorName, entries: 0, total: 0, lastDate: '' }
      current.entries += 1
      current.total += entry.amount
      if (entry.date > current.lastDate) current.lastDate = entry.date
      grouped.set(key, current)
    })
    return [...grouped.values()].filter((item) => item.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [data.finance, search])

  const draft = data.financeBatches.find((batch) => batch.status === 'rascunho' && batch.createdBy === currentUser?.id)

  async function cancelEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!cancelling) return
    const reason = String(new FormData(event.currentTarget).get('reason')).trim()
    setSaving(true)
    try {
      await callSecureMutation({ type: 'finance.entry.cancel', entryId: cancelling.id, reason })
      setCancelling(null)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Não foi possível cancelar a contribuição.')
    } finally {
      setSaving(false)
    }
  }

  async function exportEntries() {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Contribuições')
    sheet.columns = [
      { header: 'Data', key: 'date', width: 14 }, { header: 'Pessoa', key: 'person', width: 30 },
      { header: 'Tipo', key: 'category', width: 16 }, { header: 'Forma', key: 'method', width: 14 },
      { header: 'Responsável', key: 'owner', width: 28 }, { header: 'Situação', key: 'status', width: 14 },
      { header: 'Valor', key: 'amount', width: 16 }, { header: 'Motivo do cancelamento', key: 'reason', width: 40 },
    ]
    entries.forEach((entry) => sheet.addRow({ date: displayDate(entry.date), person: entry.contributorName, category: entry.category, method: entry.method, owner: entry.createdByName, status: entry.status, amount: entry.amount, reason: entry.cancellationReason }))
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF078B44' } }
    sheet.getColumn('amount').numFmt = 'R$ #,##0.00'
    const buffer = await workbook.xlsx.writeBuffer()
    const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `ipcn-contribuicoes-${month}.xlsx`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page finance-page">
      <PageHeader eyebrow="Junta Diaconal" title="Financeiro" description="Registre dízimos, ofertas e missões recebidos pela igreja." actions={<div className="finance-header-actions">{draft && <Link className="button secondary" to={`/financeiro/contribuicoes/novo?lote=${draft.id}`}>Continuar rascunho</Link>}<Link className="button primary" to="/financeiro/contribuicoes/novo"><Plus size={18} /> Registrar contribuições</Link></div>} />
      <div className="finance-tabs" role="tablist" aria-label="Áreas do financeiro"><button type="button" role="tab" aria-selected={tab === 'entries'} className={tab === 'entries' ? 'active' : ''} onClick={() => setTab('entries')}>Lançamentos</button><button type="button" role="tab" aria-selected={tab === 'contributors'} className={tab === 'contributors' ? 'active' : ''} onClick={() => setTab('contributors')}>Contribuintes</button></div>
      <section className="finance-summary" aria-label="Resumo do mês">
        <div className="finance-summary-main"><article><span>Total recebido</span><strong>{money.format(total)}</strong><small>{activeEntries.length} contribuições ativas</small></article><article><span>Dízimos</span><strong>{money.format(categoryTotal('Dízimo'))}</strong><small>No período selecionado</small></article><article><span>Ofertas</span><strong>{money.format(categoryTotal('Oferta'))}</strong><small>No período selecionado</small></article><article><span>Missões</span><strong>{money.format(categoryTotal('Missões'))}</strong><small>No período selecionado</small></article></div>
        <div className="finance-method-summary"><div><span className="finance-method-icon money-icon"><Banknote size={21} /></span><span>Dinheiro</span><strong>{money.format(methodTotal('Dinheiro'))}</strong></div><div><span className="finance-method-icon pix-icon"><PixIcon width={20} height={20} /></span><span>PIX</span><strong>{money.format(methodTotal('PIX'))}</strong></div></div>
      </section>
      {tab === 'entries' ? <section className="panel table-panel finance-table-panel">
        <div className="finance-toolbar"><SearchField value={search} onChange={setSearch} placeholder="Buscar pessoa ou responsável" /><label className="finance-month"><span className="sr-only">Mês</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label><CustomSelect label="Tipo" value={category} onChange={(value) => setCategory(value as typeof category)} options={categories.map((value) => ({ value, label: value }))} /><CustomSelect label="Forma" value={method} onChange={(value) => setMethod(value as typeof method)} options={methods.map((value) => ({ value, label: value }))} /><CustomSelect label="Situação" value={status} onChange={(value) => setStatus(value as typeof status)} options={statuses.map((value) => ({ value, label: value }))} /><button className="button secondary" onClick={exportEntries}><Download size={17} /> Exportar</button></div>
        {entries.length ? <div className="responsive-table"><table><thead><tr><th>Data</th><th>Pessoa</th><th>Tipo</th><th>Forma</th><th>Responsável</th><th>Situação</th><th className="amount-heading">Valor</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id} className={entry.status === 'cancelado' ? 'finance-row-cancelled' : ''}><td data-label="Data">{displayDate(entry.date)}</td><td data-label="Pessoa"><strong>{entry.contributorName}</strong></td><td data-label="Tipo">{entry.category}</td><td data-label="Forma"><span className="payment-method">{entry.method === 'PIX' ? <PixIcon width={17} height={17} /> : <Banknote size={18} />}{entry.method}</span></td><td data-label="Responsável">{entry.createdByName || accountUsers.find((user) => user.id === entry.createdBy)?.name || 'Não informado'}</td><td data-label="Situação"><StatusBadge tone={entry.status === 'cancelado' ? 'danger' : 'success'}>{entry.status === 'cancelado' ? 'Cancelado' : 'Ativo'}</StatusBadge></td><td data-label="Valor" className="amount-column">{money.format(entry.amount)}</td><td className="row-actions">{entry.status !== 'cancelado' && <button className="icon-button" title="Cancelar contribuição" aria-label={`Cancelar contribuição de ${entry.contributorName}`} onClick={() => setCancelling(entry)}><MoreHorizontal size={19} /></button>}</td></tr>)}</tbody></table></div> : <EmptyState title="Nenhuma contribuição encontrada" description="Ajuste os filtros ou registre um novo lote de contribuições." />}
      </section> : <section className="panel table-panel finance-table-panel"><div className="finance-toolbar contributors-toolbar"><SearchField value={search} onChange={setSearch} placeholder="Buscar contribuinte" /></div>{contributors.length ? <div className="responsive-table"><table><thead><tr><th>Contribuinte</th><th>Última contribuição</th><th>Quantidade</th><th className="amount-heading">Total histórico</th></tr></thead><tbody>{contributors.map((item) => <tr key={item.name}><td data-label="Contribuinte"><strong>{item.name}</strong></td><td data-label="Última contribuição">{displayDate(item.lastDate)}</td><td data-label="Quantidade">{item.entries}</td><td data-label="Total histórico" className="amount-column">{money.format(item.total)}</td></tr>)}</tbody></table></div> : <EmptyState title="Nenhum contribuinte encontrado" description="Os contribuintes identificados aparecerão aqui após a finalização dos lotes." />}</section>}
      <Modal title="Cancelar contribuição" description="O registro permanecerá no histórico e deixará de compor os totais." open={Boolean(cancelling)} onClose={() => !saving && setCancelling(null)}><form onSubmit={cancelEntry}>{cancelling && <div className="finance-cancel-summary"><XCircle size={20} /><div><strong>{cancelling.contributorName}</strong><span>{cancelling.category} · {money.format(cancelling.amount)} · {displayDate(cancelling.date)}</span></div></div>}<Field label="Justificativa do cancelamento *" hint="Mínimo de 5 caracteres. Esta justificativa ficará registrada na auditoria."><textarea name="reason" rows={4} minLength={5} maxLength={500} required /></Field><FormActions onCancel={() => setCancelling(null)} submitLabel="Confirmar cancelamento" disabled={saving} /></form></Modal>
    </div>
  )
}
