import { useMemo, useState, type FormEvent } from 'react'
import { FileText, Pencil, Plus } from 'lucide-react'
import { makeId, useApp } from '../app/AppContext'
import { useAuth } from '../app/AuthContext'
import { documentUploadsEnabled, downloadStoredFile, removeStoredFile, uploadStoredFile } from '../app/fileStorage'
import { displayDate } from '../app/format'
import { hasCapability } from '../app/permissions'
import type { Member, MemberStatus } from '../app/types'
import { CustomSelect, EmptyState, Field, FileUploadField, FormActions, Modal, PageHeader, SearchField, StatusBadge } from '../components/Common'

const statuses: MemberStatus[] = ['Ativo', 'Em análise', 'Disciplinado', 'Excluído', 'Falecido']
type StatusSelectValue = 'Todos' | MemberStatus

function statusTone(status: MemberStatus) {
  if (status === 'Ativo') return 'success' as const
  if (status === 'Em análise') return 'warning' as const
  if (status === 'Disciplinado' || status === 'Excluído') return 'danger' as const
  return 'neutral' as const
}

export function MembersPage() {
  const { data, updateData } = useApp()
  const { currentUser } = useAuth()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusSelectValue>('Todos')
  const [memberStatus, setMemberStatus] = useState<MemberStatus>('Ativo')
  const [editing, setEditing] = useState<Member | null>(null)
  const [open, setOpen] = useState(false)
  const canManage = hasCapability(currentUser, 'members.manage')
  const canSeeRestricted = hasCapability(currentUser, 'members.restricted')

  const filtered = useMemo(() => data.members.filter((member) => {
    const matchesSearch = `${member.name} ${member.phone} ${member.email ?? ''}`.toLowerCase().includes(search.toLowerCase())
    return matchesSearch && (status === 'Todos' || member.status === status)
  }), [data.members, search, status])

  function openNew() { setEditing(null); setMemberStatus('Ativo'); setOpen(true) }
  function openEdit(member: Member) { setEditing(member); setMemberStatus(member.status); setOpen(true) }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const member: Member = {
      id: editing?.id ?? makeId('member'),
      name: String(form.get('name')).trim(),
      birthDate: String(form.get('birthDate')),
      phone: String(form.get('phone')).trim(),
      address: String(form.get('address')).trim() || undefined,
      cpf: String(form.get('cpf')).trim() || undefined,
      email: String(form.get('email')).trim() || undefined,
      status: memberStatus,
      restrictedNotes: canSeeRestricted ? String(form.get('restrictedNotes')).trim() || undefined : editing?.restrictedNotes,
      documents: [...(editing?.documents ?? [])],
      createdAt: editing?.createdAt ?? new Date().toISOString(),
    }
    const file = form.get('document')
    let uploadedPath: string | undefined
    try {
      if (canSeeRestricted && file instanceof File && file.size > 0) {
        const document = await uploadStoredFile('members', member.id, makeId('doc'), file)
        member.documents.push(document)
        uploadedPath = document.storagePath
      }
      const saved = await updateData((draft) => {
        const index = draft.members.findIndex((item) => item.id === member.id)
        if (index >= 0) draft.members[index] = member
        else draft.members.unshift(member)
      }, editing ? 'membro.atualizado' : 'membro.criado', member.name)
      if (saved) setOpen(false)
      else await removeStoredFile(uploadedPath)
    } catch (error) {
      await removeStoredFile(uploadedPath)
      window.alert(error instanceof Error ? error.message : 'Não foi possível salvar o membro.')
    }
  }

  async function downloadDocument(document: Member['documents'][number]) {
    try {
      await downloadStoredFile(document)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Não foi possível baixar o arquivo.')
    }
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Secretaria" title="Membros" description="Cadastro, contato e situação dos membros da igreja." actions={canManage && <button className="button primary" onClick={openNew}><Plus size={18} /> Novo membro</button>} />
      <section className="panel table-panel members-table-panel">
        <div className="table-toolbar"><SearchField value={search} onChange={setSearch} placeholder="Buscar por nome, telefone ou e-mail" /><CustomSelect value={status} options={['Todos', ...statuses].map((item) => ({ value: item, label: item }))} label="Filtrar por situação" onChange={(value) => setStatus(value as StatusSelectValue)} /></div>
        {filtered.length ? (
          <div className="responsive-table">
            <table><thead><tr><th>Nome</th><th>Contato</th><th>Nascimento</th><th>Situação</th>{canManage && <th><span className="sr-only">Ações</span></th>}</tr></thead>
              <tbody>{filtered.map((member) => <tr key={member.id}><td data-label="Nome"><strong>{member.name}</strong></td><td data-label="Contato">{member.phone}<small>{member.email ?? 'Sem e-mail'}</small></td><td data-label="Nascimento">{displayDate(member.birthDate)}</td><td data-label="Situação"><StatusBadge tone={statusTone(member.status)}>{member.status}</StatusBadge></td>{canManage && <td className="row-actions"><button className="icon-button" onClick={() => openEdit(member)} aria-label={`Editar ${member.name}`}><Pencil size={18} /></button></td>}</tr>)}</tbody>
            </table>
          </div>
        ) : <EmptyState title="Nenhum membro encontrado" description="Ajuste os filtros ou faça o primeiro cadastro." />}
      </section>
      <Modal title={editing ? 'Editar membro' : 'Novo membro'} description="Os campos com asterisco são obrigatórios." open={open} onClose={() => setOpen(false)} wide>
        <form key={editing?.id ?? 'new'} onSubmit={save}>
          <div className="form-grid two-columns">
            <Field label="Nome completo *"><input name="name" required defaultValue={editing?.name} /></Field>
            <Field label="Data de nascimento *"><input name="birthDate" type="date" required defaultValue={editing?.birthDate} /></Field>
            <Field label="Celular *"><input name="phone" required inputMode="tel" defaultValue={editing?.phone} /></Field>
            <Field label="E-mail"><input name="email" type="email" defaultValue={editing?.email} /></Field>
            <Field label="CPF"><input name="cpf" inputMode="numeric" defaultValue={editing?.cpf} /></Field>
            <Field label="Endereço"><input name="address" defaultValue={editing?.address} /></Field>
            <div className="field"><span>Situação</span><CustomSelect value={memberStatus} options={statuses.map((item) => ({ value: item, label: item }))} label="Situação do membro" onChange={(value) => setMemberStatus(value as MemberStatus)} /></div>
          </div>
          {canSeeRestricted && <fieldset className="restricted-section"><legend>Área pastoral restrita</legend><p>Visível apenas para Conselho e Administradores.</p><Field label="Observações reservadas"><textarea name="restrictedNotes" rows={4} defaultValue={editing?.restrictedNotes} /></Field><FileUploadField label="Anexar carta ou documento" name="document" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp" disabled={!documentUploadsEnabled} emptyTitle="Selecionar documento" emptyDescription="PDF, Word ou imagem, até 10 MB" hint={documentUploadsEnabled ? 'O arquivo será protegido no Firebase Storage e vinculado a este cadastro.' : 'O campo será liberado após a ativação segura do Firebase Storage.'} resetKey={`${open}-${editing?.id ?? 'new'}`} />{editing?.documents.length ? <div className="document-list">{editing.documents.map((document) => <button type="button" key={document.id} onClick={() => downloadDocument(document)}><FileText size={16} />{document.name}</button>)}</div> : null}</fieldset>}
          <FormActions onCancel={() => setOpen(false)} />
        </form>
      </Modal>
    </div>
  )
}
