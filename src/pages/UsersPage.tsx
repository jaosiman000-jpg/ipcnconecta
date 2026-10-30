import { useState, type FormEvent } from 'react'
import { Check, MailCheck, MailWarning, Pencil, ShieldCheck, UserCheck, UserX, X } from 'lucide-react'
import { useApp } from '../app/AppContext'
import { useAuth } from '../app/AuthContext'
import { displayDateTime } from '../app/format'
import { isSuperuser, ROLE_LABELS, roleSummary } from '../app/permissions'
import type { Role, User } from '../app/types'
import { EmptyState, FormActions, Modal, PageHeader, StatusBadge } from '../components/Common'

const roles: Role[] = ['administrador', 'conselho', 'secretaria', 'diacono', 'professor', 'lider', 'acolhimento']

export function UsersPage() {
  const { data } = useApp()
  const { accountUsers, currentUser, saveAccess: saveRemoteAccess, rejectAccess, toggleAccount } = useAuth()
  const [editing, setEditing] = useState<User | null>(null)
  const pending = accountUsers.filter((user) => user.status === 'pendente')
  const active = accountUsers.filter((user) => user.status !== 'pendente')

  async function saveAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing || editing.id === currentUser?.id) return
    const form = new FormData(event.currentTarget)
    const selectedRoles = form.getAll('roles').map(String) as Role[]
    if (!selectedRoles.length) {
      window.alert('Escolha pelo menos um papel de acesso.')
      return
    }
    const wouldRemoveSuperuser = isSuperuser(editing) && !selectedRoles.some((role) => role === 'administrador' || role === 'conselho')
    const otherSuperusers = accountUsers.filter((user) => user.id !== editing.id && user.status === 'ativo' && isSuperuser(user)).length
    if (wouldRemoveSuperuser && otherSuperusers === 0) {
      window.alert('O sistema precisa manter pelo menos um Administrador ou membro do Conselho ativo.')
      return
    }
    const message = await saveRemoteAccess(editing, {
      roles: selectedRoles,
      classIds: form.getAll('classIds').map(String),
      societyIds: form.getAll('societyIds').map(String),
      office: roleSummary(selectedRoles),
    })
    if (message) window.alert(message)
    else setEditing(null)
  }

  async function reject(user: User) {
    if (user.id === currentUser?.id) return
    const message = await rejectAccess(user)
    if (message) window.alert(message)
  }

  async function toggleUser(user: User) {
    if (user.id === currentUser?.id) return
    if (user.status === 'ativo' && isSuperuser(user)) {
      const otherSuperusers = accountUsers.filter((item) => item.id !== user.id && item.status === 'ativo' && isSuperuser(item)).length
      if (!otherSuperusers) {
        window.alert('Não é possível desativar o último Administrador ou membro do Conselho ativo.')
        return
      }
    }
    const message = await toggleAccount(user)
    if (message) window.alert(message)
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Administração" title="Usuários e acessos" description="Aprove cadastros e combine papéis em um único login." />
      <div className="security-rule"><ShieldCheck size={22} /><div><strong>Regra de governança ativa</strong><p>Ninguém altera o próprio acesso ou desativa a si mesmo. O sistema também preserva pelo menos um superusuário ativo.</p></div></div>
      <section className="panel pending-users"><div className="panel-header"><div><h2>Solicitações de cadastro</h2><p>Confira identidade, e-mail, atuações e escopos antes de aprovar.</p></div><StatusBadge tone={pending.length ? 'warning' : 'neutral'}>{pending.length} pendente{pending.length === 1 ? '' : 's'}</StatusBadge></div>{pending.length ? <div className="approval-list">{pending.map((user) => <article key={user.id}><span className="avatar">{user.photo ? <img src={user.photo} alt="" /> : user.name.charAt(0)}</span><div className="approval-info"><strong>{user.name}</strong><p>{user.email}</p><div className={`verification-status ${user.emailVerified ? 'verified' : 'unverified'}`}>{user.emailVerified ? <MailCheck size={15} /> : <MailWarning size={15} />}{user.emailVerified ? 'E-mail verificado' : 'Aguardando verificação do e-mail'}</div><div className="role-tags">{user.requestedRoles?.map((role) => <span key={role}>{ROLE_LABELS[role]}</span>)}</div><small>Solicitado em {displayDateTime(user.createdAt)}</small></div><div className="approval-actions"><button className="button primary small" disabled={!user.emailVerified} title={!user.emailVerified ? 'O usuário precisa confirmar o e-mail primeiro' : undefined} onClick={() => setEditing(user)}><Check size={17} /> Revisar e aprovar</button><button className="button secondary small" onClick={() => reject(user)}><X size={17} /> Recusar</button></div></article>)}</div> : <EmptyState title="Nenhum cadastro pendente" description="Novas solicitações aparecerão aqui." />}</section>
      <section className="panel table-panel"><div className="panel-header"><div><h2>Usuários cadastrados</h2><p>Um usuário pode acumular quantos papéis forem necessários.</p></div></div><div className="responsive-table"><table><thead><tr><th>Usuário</th><th>Papéis de acesso</th><th>Status</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{active.map((user) => <tr key={user.id}><td data-label="Usuário"><div className="user-cell"><span className="avatar small-avatar">{user.photo ? <img src={user.photo} alt="" /> : user.name.charAt(0)}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div></td><td data-label="Papéis"><div className="role-tags">{user.roles.map((role) => <span key={role}>{ROLE_LABELS[role]}</span>)}</div></td><td data-label="Status"><StatusBadge tone={user.status === 'ativo' ? 'success' : 'neutral'}>{user.status}</StatusBadge></td><td className="row-actions"><button className="icon-button" disabled={user.id === currentUser?.id} title={user.id === currentUser?.id ? 'Você não pode alterar o próprio acesso' : 'Editar acesso'} onClick={() => setEditing(user)}><Pencil size={18} /></button><button className="icon-button" disabled={user.id === currentUser?.id} title={user.id === currentUser?.id ? 'Você não pode desativar a si mesmo' : user.status === 'ativo' ? 'Desativar' : 'Reativar'} onClick={() => toggleUser(user)}>{user.status === 'ativo' ? <UserX size={18} /> : <UserCheck size={18} />}</button></td></tr>)}</tbody></table></div></section>

      <Modal title={editing?.status === 'pendente' ? 'Revisar solicitação' : 'Editar acesso'} description="Os papéis se somam. Classes e sociedades limitam somente Professor e Líder." open={Boolean(editing)} onClose={() => setEditing(null)} wide>
        {editing && <form key={editing.id} onSubmit={saveAccess}><div className="review-person"><span className="avatar">{editing.photo ? <img src={editing.photo} alt="" /> : editing.name.charAt(0)}</span><div><strong>{editing.name}</strong><p>{editing.email}</p></div></div><fieldset className="role-picker"><legend>Quais atuações este usuário exerce?</legend><div className="checkbox-grid">{roles.map((role) => <label key={role}><input type="checkbox" name="roles" value={role} defaultChecked={editing.roles.includes(role) || editing.requestedRoles?.includes(role)} /><span>{ROLE_LABELS[role]}</span></label>)}</div></fieldset><div className="assignment-grid"><fieldset><legend>Classes permitidas</legend><div className="selection-list compact">{data.classes.map((item) => <label key={item.id}><input type="checkbox" name="classIds" value={item.id} defaultChecked={editing.classIds.includes(item.id)} /><span>{item.name}</span></label>)}</div></fieldset><fieldset><legend>Sociedades permitidas</legend><div className="selection-list compact">{data.societies.map((item) => <label key={item.id}><input type="checkbox" name="societyIds" value={item.id} defaultChecked={editing.societyIds.includes(item.id)} /><span>{item.code} — {item.name}</span></label>)}</div></fieldset></div><FormActions onCancel={() => setEditing(null)} submitLabel={editing.status === 'pendente' ? 'Aprovar acesso' : 'Salvar permissões'} /></form>}
      </Modal>
    </div>
  )
}
