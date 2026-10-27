import { useMemo, useState, type FormEvent } from 'react'
import { ArrowDownLeft, ArrowUpRight, CircleDollarSign, FileText, Plus } from 'lucide-react'
import { makeId, useApp } from '../app/AppContext'
import { useAuth } from '../app/AuthContext'
import { documentUploadsEnabled, downloadStoredFile, removeStoredFile, uploadStoredFile } from '../app/fileStorage'
import { displayDate, money } from '../app/format'
import { hasCapability } from '../app/permissions'
import type { FinanceEntry } from '../app/types'
import { CustomSelect, EmptyState, Field, FileUploadField, FormActions, Modal, PageHeader, SearchField, StatCard, StatusBadge } from '../components/Common'

const categories = ['Dízimos', 'Ofertas', 'Missões', 'Doações', 'Manutenção', 'Ação social', 'Eventos', 'Outros']

export function FinancePage() {
  const { data, updateData } = useApp()
  const { currentUser } = useAuth()
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [open, setOpen] = useState(false)
  const canManage = hasCapability(currentUser, 'finance.manage')
  const entries = useMemo(() => data.finance.filter((item) => item.date.startsWith(month) && `${item.description} ${item.category} ${item.contributor ?? ''}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date)), [data.finance, month, search])
  const income = entries.filter((item) => item.type === 'entrada').reduce((sum, item) => sum + item.amount, 0)
  const expense = entries.filter((item) => item.type === 'saída').reduce((sum, item) => sum + item.amount, 0)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const file = form.get('receipt')
    const entry: FinanceEntry = {
      id: makeId('finance'),
      type: String(form.get('type')) as FinanceEntry['type'],
      date: String(form.get('date')),
      amount: Number(form.get('amount')),
      category: String(form.get('category')),
      description: String(form.get('description')).trim(),
      account: String(form.get('account')).trim(),
      contributor: String(form.get('contributor')).trim() || undefined,
      createdBy: currentUser?.id ?? '',
    }
    let uploadedPath: string | undefined
    try {
      if (file instanceof File && file.size) {
        entry.receipt = await uploadStoredFile('finance', entry.id, makeId('receipt'), file)
        entry.receiptName = entry.receipt.name
        uploadedPath = entry.receipt.storagePath
      }
      const saved = await updateData((draft) => draft.finance.unshift(entry), 'financeiro.lancamento_criado', `${entry.type}: ${money.format(entry.amount)} — ${entry.category}`)
      if (saved) setOpen(false)
      else await removeStoredFile(uploadedPath)
    } catch (error) {
      await removeStoredFile(uploadedPath)
      window.alert(error instanceof Error ? error.message : 'Não foi possível salvar o lançamento.')
    }
  }

  async function downloadReceipt(entry: FinanceEntry) {
    if (!entry.receipt) return
    try {
      await downloadStoredFile(entry.receipt)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Não foi possível baixar o comprovante.')
    }
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Tesouraria" title="Financeiro" description="Controle básico de entradas e saídas enquanto as regras definitivas são avaliadas pelo Conselho." actions={canManage && <button className="button primary" onClick={() => setOpen(true)}><Plus size={18} /> Novo lançamento</button>} />
      <section className="stats-grid finance-stats"><StatCard label="Entradas" value={money.format(income)} helper="No período filtrado" icon={<ArrowDownLeft size={22} />} /><StatCard label="Saídas" value={money.format(expense)} helper="No período filtrado" icon={<ArrowUpRight size={22} />} /><StatCard label="Saldo" value={money.format(income - expense)} helper={`${entries.length} lançamentos`} icon={<CircleDollarSign size={22} />} /></section>
      <section className="panel table-panel"><div className="table-toolbar"><SearchField value={search} onChange={setSearch} placeholder="Buscar lançamento" /><label className="month-control"><span>Competência</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label></div>{entries.length ? <div className="responsive-table"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Conta</th><th>Tipo</th><th className="amount-column">Valor</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td data-label="Data">{displayDate(entry.date)}</td><td data-label="Descrição"><strong>{entry.description}</strong><small>{entry.contributor ?? '—'}</small>{entry.receipt && <button type="button" className="file-link" onClick={() => downloadReceipt(entry)}><FileText size={14} />{entry.receipt.name}</button>}</td><td data-label="Categoria">{entry.category}</td><td data-label="Conta">{entry.account}</td><td data-label="Tipo"><StatusBadge tone={entry.type === 'entrada' ? 'success' : 'danger'}>{entry.type}</StatusBadge></td><td data-label="Valor" className={`amount-column ${entry.type}`}>{entry.type === 'entrada' ? '+' : '−'} {money.format(entry.amount)}</td></tr>)}</tbody></table></div> : <EmptyState title="Nenhum lançamento" description="Não há movimentações para o período e busca selecionados." />}</section>
      <Modal title="Novo lançamento" description="Registre somente informações confirmadas pela Tesouraria." open={open} onClose={() => setOpen(false)}>
        <form onSubmit={save}><div className="form-grid two-columns"><div className="field"><span>Tipo *</span><CustomSelect name="type" label="Tipo" defaultValue="entrada" options={[{ value: 'entrada', label: 'Entrada' }, { value: 'saída', label: 'Saída' }]} /></div><Field label="Data *"><input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></Field><Field label="Valor *"><input name="amount" type="number" min="0.01" step="0.01" required /></Field><div className="field"><span>Categoria *</span><CustomSelect name="category" label="Categoria" defaultValue={categories[0]} options={categories.map((item) => ({ value: item, label: item }))} /></div><Field label="Conta *"><input name="account" required defaultValue="Caixa" /></Field><Field label="Contribuinte" hint="Opcional"><input name="contributor" /></Field></div><Field label="Descrição *"><input name="description" required /></Field><FileUploadField label="Comprovante" name="receipt" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp" disabled={!documentUploadsEnabled} emptyTitle="Selecionar comprovante" emptyDescription="PDF, Word ou imagem, até 10 MB" hint={documentUploadsEnabled ? 'O arquivo será protegido no Firebase Storage e vinculado ao lançamento.' : 'O campo será liberado após a ativação segura do Firebase Storage.'} resetKey={open} /><FormActions onCancel={() => setOpen(false)} submitLabel="Salvar lançamento" /></form>
      </Modal>
    </div>
  )
}
