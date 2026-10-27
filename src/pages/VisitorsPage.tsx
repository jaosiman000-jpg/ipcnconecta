import { useMemo, useState, type FormEvent } from 'react'
import { Check, MessageCircle, Plus, UserRoundSearch } from 'lucide-react'
import { makeId, useApp } from '../app/AppContext'
import { useAuth } from '../app/AuthContext'
import { displayDate, phoneDigits } from '../app/format'
import type { Visitor } from '../app/types'
import { EmptyState, Field, FormActions, Modal, PageHeader, SearchField, StatusBadge } from '../components/Common'

export function VisitorsPage() {
  const { data, updateData } = useApp()
  const { currentUser } = useAuth()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Visitor | null>(null)
  const [consent, setConsent] = useState(true)
  const [doNotContact, setDoNotContact] = useState(false)
  const filtered = useMemo(() => data.visitors.filter((item) => `${item.name} ${item.phone}`.toLowerCase().includes(search.toLowerCase())), [data.visitors, search])

  function openNew() {
    setEditing(null)
    setConsent(true)
    setDoNotContact(false)
    setOpen(true)
  }

  function openEdit(visitor: Visitor) {
    setEditing(visitor)
    setDoNotContact(visitor.doNotContact)
    setConsent(visitor.doNotContact ? false : visitor.consent)
    setOpen(true)
  }

  function changeConsent(checked: boolean) {
    setConsent(checked)
    if (checked) setDoNotContact(false)
  }

  function changeDoNotContact(checked: boolean) {
    setDoNotContact(checked)
    if (checked) setConsent(false)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const visitor: Visitor = {
      id: editing?.id ?? makeId('visitor'),
      name: String(form.get('name')).trim(),
      phone: String(form.get('phone')).trim(),
      birthDate: String(form.get('birthDate')) || undefined,
      visitDate: String(form.get('visitDate')),
      consent: consent && !doNotContact,
      contacted: editing?.contacted ?? false,
      doNotContact,
      lastContactAt: editing?.lastContactAt,
      contactOwner: editing?.contactOwner,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
    }
    const saved = await updateData((draft) => {
      const index = draft.visitors.findIndex((item) => item.id === visitor.id)
      if (index >= 0) draft.visitors[index] = visitor
      else draft.visitors.unshift(visitor)
    }, editing ? 'visitante.atualizado' : 'visitante.criado', visitor.name)
    if (saved) setOpen(false)
  }

  async function openWhatsapp(visitor: Visitor) {
    const raw = phoneDigits(visitor.phone)
    const phone = raw.startsWith('55') ? raw : `55${raw}`
    const message = data.settings.whatsappMessage.replaceAll('[nome]', visitor.name.split(' ')[0]).replaceAll('[responsável]', currentUser?.name.split(' ')[0] ?? 'nossa equipe')
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
    await updateData((draft) => {
      const item = draft.visitors.find((entry) => entry.id === visitor.id)
      if (item) {
        item.contacted = true
        item.lastContactAt = new Date().toISOString()
        item.contactOwner = currentUser?.name
      }
    }, 'visitante.contatado', visitor.name)
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Acolhimento" title="Visitantes" description="Registre visitas e acompanhe o contato de boas-vindas." actions={<button className="button primary" onClick={openNew}><Plus size={18} /> Novo visitante</button>} />
      <section className="panel table-panel">
        <div className="table-toolbar"><SearchField value={search} onChange={setSearch} placeholder="Buscar visitante" /><p className="table-count">{filtered.length} registro{filtered.length === 1 ? '' : 's'}</p></div>
        {filtered.length ? <div className="responsive-table"><table><thead><tr><th>Visitante</th><th>Data da visita</th><th>Consentimento</th><th>Contato</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{filtered.map((visitor) => {
          const canContact = visitor.consent && !visitor.doNotContact
          return <tr key={visitor.id}><td data-label="Visitante"><strong>{visitor.name}</strong><small>{visitor.phone}</small></td><td data-label="Data da visita">{displayDate(visitor.visitDate)}</td><td data-label="Consentimento"><StatusBadge tone={canContact ? 'success' : 'neutral'}>{canContact ? 'Autorizado' : 'Não autorizado'}</StatusBadge></td><td data-label="Contato">{visitor.contacted ? <span className="contacted"><Check size={16} /> Contatado</span> : 'Pendente'}<small>{visitor.contactOwner ?? ''}</small></td><td className="row-actions"><button className="button secondary small" onClick={() => openEdit(visitor)}>Editar</button>{canContact && <button className="button whatsapp small" onClick={() => openWhatsapp(visitor)}><MessageCircle size={17} /> WhatsApp</button>}</td></tr>
        })}</tbody></table></div> : <EmptyState title="Nenhum visitante encontrado" description="Cadastre o primeiro visitante para iniciar o acompanhamento." />}
      </section>
      <div className="privacy-note"><UserRoundSearch size={20} /><p>Os dados de visitantes não são apagados automaticamente nesta versão. Respeite pedidos de correção, exclusão e interrupção de contato.</p></div>
      <Modal title={editing ? 'Editar visitante' : 'Novo visitante'} description="Colete apenas os dados necessários para o acolhimento." open={open} onClose={() => setOpen(false)}>
        <form key={editing?.id ?? 'new'} onSubmit={save}>
          <div className="form-grid">
            <Field label="Nome *"><input name="name" required defaultValue={editing?.name} /></Field>
            <Field label="Celular *"><input name="phone" required inputMode="tel" defaultValue={editing?.phone} /></Field>
            <Field label="Data da visita *"><input name="visitDate" type="date" required defaultValue={editing?.visitDate ?? new Date().toISOString().slice(0, 10)} /></Field>
            <Field label="Data de nascimento"><input name="birthDate" type="date" defaultValue={editing?.birthDate} /></Field>
            <label className="check-row"><input name="consent" type="checkbox" checked={consent} onChange={(event) => changeConsent(event.target.checked)} /><span><strong>Autorizou contato</strong><small>Confirme que o visitante concordou em receber a mensagem.</small></span></label>
            <label className="check-row"><input name="doNotContact" type="checkbox" checked={doNotContact} onChange={(event) => changeDoNotContact(event.target.checked)} /><span><strong>Não deseja mais contato</strong><small>Impede a abertura do WhatsApp para este cadastro.</small></span></label>
          </div>
          <FormActions onCancel={() => setOpen(false)} />
        </form>
      </Modal>
    </div>
  )
}
