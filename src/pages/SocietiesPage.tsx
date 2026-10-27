import { useEffect, useState, type FormEvent } from 'react'
import { Building2, Check, Clock3, Plus, X } from 'lucide-react'
import { makeId, useApp } from '../app/AppContext'
import { useAuth } from '../app/AuthContext'
import { ageFromBirthDate, displayDateTime } from '../app/format'
import { hasCapability, visibleSocietyIds } from '../app/permissions'
import type { Society } from '../app/types'
import { CustomSelect, EmptyState, Field, FormActions, Modal, PageHeader, StatusBadge } from '../components/Common'

const officerRoles = ['Presidente', 'Vice-presidente', '1º secretário', '2º secretário', 'Tesoureiro', 'Secretário executivo']

export function SocietiesPage() {
  const { data, updateData } = useApp()
  const { currentUser, accountUsers } = useAuth()
  const scope = visibleSocietyIds(currentUser)
  const societies = data.societies.filter((item) => scope === null || scope.includes(item.id) || item.leaderIds.includes(currentUser?.id ?? ''))
  const [selectedId, setSelectedId] = useState(societies[0]?.id ?? '')
  const [editOpen, setEditOpen] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)
  const canManage = hasCapability(currentUser, 'societies.manage')
  const canRequest = hasCapability(currentUser, 'societies.request')
  const selected = societies.find((item) => item.id === selectedId)
  const pendingRequests = data.societyRequests.filter((item) => item.societyId === selectedId && item.status === 'pendente')

  useEffect(() => {
    if (!societies.some((item) => item.id === selectedId)) setSelectedId(societies[0]?.id ?? '')
  }, [societies, selectedId])

  async function saveSociety(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    const form = new FormData(event.currentTarget)
    const updated: Society = {
      ...selected,
      minAge: Number(form.get('minAge')),
      maxAge: form.get('maxAge') ? Number(form.get('maxAge')) : undefined,
      leaderIds: form.getAll('leaders').map(String),
      memberIds: form.getAll('members').map(String),
      officers: officerRoles.flatMap((role) => {
        const memberId = String(form.get(`officer-${role}`) ?? '')
        return memberId ? [{ role, memberId }] : []
      }),
    }
    const saved = await updateData((draft) => {
      const index = draft.societies.findIndex((item) => item.id === updated.id)
      draft.societies[index] = updated
      draft.users.forEach((user) => {
        user.societyIds = user.societyIds.filter((id) => id !== updated.id)
        if (updated.leaderIds.includes(user.id)) user.societyIds.push(updated.id)
      })
    }, 'sociedade.atualizada', selected.code)
    if (saved) setEditOpen(false)
  }

  async function requestMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || !currentUser) return
    const memberId = String(new FormData(event.currentTarget).get('memberId'))
    if (!memberId) {
      window.alert('Selecione um membro cadastrado.')
      return
    }
    if (data.societyRequests.some((item) => item.societyId === selected.id && item.memberId === memberId && item.status === 'pendente')) {
      window.alert('Já existe um pedido pendente para este membro.')
      return
    }
    const saved = await updateData((draft) => draft.societyRequests.unshift({ id: makeId('society-request'), societyId: selected.id, memberId, requestedBy: currentUser.id, requestedAt: new Date().toISOString(), status: 'pendente' }), 'sociedade.inclusao_solicitada', selected.code)
    if (saved) setRequestOpen(false)
  }

  async function reviewRequest(id: string, approved: boolean) {
    await updateData((draft) => {
      const request = draft.societyRequests.find((item) => item.id === id)
      if (!request || !currentUser) return
      request.status = approved ? 'aprovada' : 'recusada'
      request.reviewedBy = currentUser.id
      if (approved) {
        const society = draft.societies.find((item) => item.id === request.societyId)
        if (society && !society.memberIds.includes(request.memberId)) society.memberIds.push(request.memberId)
      }
    }, approved ? 'sociedade.inclusao_aprovada' : 'sociedade.inclusao_recusada', selected?.code)
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Sociedades internas" title="UCP, UPA, UMP, UPH e SAF" description="Acompanhe membros, lideranças e pedidos de inclusão." actions={<>{canRequest && selected && <button className="button primary" onClick={() => setRequestOpen(true)}><Plus size={18} /> Solicitar inclusão</button>}{canManage && selected && <button className="button secondary" onClick={() => setEditOpen(true)}>Editar sociedade</button>}</>} />
      {societies.length ? <>
        <div className="society-tabs">{societies.map((item) => <button className={item.id === selectedId ? 'active' : ''} onClick={() => setSelectedId(item.id)} key={item.id}><strong>{item.code}</strong><span>{item.memberIds.length} membros</span></button>)}</div>
        {selected && <div className="society-layout">
          <section className="panel society-overview"><div className="society-title"><span className="society-mark"><Building2 size={25} /></span><div><p className="eyebrow">{selected.code}</p><h2>{selected.name}</h2><p>Faixa etária: {selected.minAge} anos {selected.maxAge ? `a ${selected.maxAge} anos` : 'ou mais'}</p></div></div><div className="society-metrics"><div><strong>{selected.memberIds.length}</strong><span>Membros</span></div><div><strong>{selected.leaderIds.length}</strong><span>Líderes</span></div><div><strong>{selected.officers.length}</strong><span>Cargos preenchidos</span></div></div></section>
          <section className="panel"><div className="panel-header"><div><h2>Membros da sociedade</h2><p>Pessoas aprovadas pelo Conselho ou Administração.</p></div></div>{selected.memberIds.length ? <div className="people-grid">{selected.memberIds.map((id) => data.members.find((member) => member.id === id)).filter(Boolean).map((member) => member && <div key={member.id}><span className="avatar small-avatar">{member.name.charAt(0)}</span><div><strong>{member.name}</strong><small>{ageFromBirthDate(member.birthDate)} anos</small></div></div>)}</div> : <EmptyState title="Nenhum membro incluído" description="Os líderes podem solicitar inclusões para análise." />}</section>
          {canManage && <section className="panel pending-panel"><div className="panel-header"><div><h2>Pedidos pendentes</h2><p>Confirme a elegibilidade antes de aprovar.</p></div><StatusBadge tone={pendingRequests.length ? 'warning' : 'neutral'}>{pendingRequests.length}</StatusBadge></div>{pendingRequests.length ? <div className="request-list">{pendingRequests.map((request) => { const member = data.members.find((item) => item.id === request.memberId); const requester = accountUsers.find((item) => item.id === request.requestedBy) ?? data.users.find((item) => item.id === request.requestedBy); return <div key={request.id}><div><strong>{member?.name}</strong><p>Solicitado por {requester?.name} · {displayDateTime(request.requestedAt)}</p></div><div><button className="icon-button approve" onClick={() => reviewRequest(request.id, true)} aria-label="Aprovar"><Check size={18} /></button><button className="icon-button reject" onClick={() => reviewRequest(request.id, false)} aria-label="Recusar"><X size={18} /></button></div></div> })}</div> : <EmptyState title="Tudo analisado" description="Não há pedidos pendentes nesta sociedade." />}</section>}
        </div>}
      </> : <section className="panel"><EmptyState title="Nenhuma sociedade disponível" description="Não há sociedades vinculadas ao seu acesso." /></section>}

      <Modal title={`Editar ${selected?.code ?? ''}`} description="Faixa etária e composição são controladas pelo Conselho e Administração." open={editOpen} onClose={() => setEditOpen(false)} wide>
        {selected && <form key={selected.id} onSubmit={saveSociety}><div className="form-grid two-columns"><Field label="Idade mínima"><input name="minAge" type="number" min="0" required defaultValue={selected.minAge} /></Field><Field label="Idade máxima" hint="Deixe vazio quando não houver limite."><input name="maxAge" type="number" min="0" defaultValue={selected.maxAge} /></Field></div><div className="assignment-grid"><fieldset><legend>Líderes autorizados</legend><div className="selection-list">{accountUsers.filter((user) => user.status === 'ativo' && user.roles.includes('lider')).map((user) => <label key={user.id}><input name="leaders" type="checkbox" value={user.id} defaultChecked={selected.leaderIds.includes(user.id)} /><span>{user.name}</span></label>)}</div></fieldset><fieldset><legend>Membros</legend><div className="selection-list">{data.members.filter((member) => member.status === 'Ativo').map((member) => <label key={member.id}><input name="members" type="checkbox" value={member.id} defaultChecked={selected.memberIds.includes(member.id)} /><span>{member.name}<small>{ageFromBirthDate(member.birthDate)} anos</small></span></label>)}</div></fieldset></div><fieldset className="officers-fieldset"><legend>Diretoria</legend><div className="form-grid two-columns">{officerRoles.map((role) => <div className="field" key={role}><span>{role}</span><CustomSelect name={`officer-${role}`} label={role} defaultValue={selected.officers.find((item) => item.role === role)?.memberId ?? ''} options={[{ value: '', label: 'Não definido' }, ...selected.memberIds.map((id) => data.members.find((member) => member.id === id)).filter((member) => member !== undefined).map((member) => ({ value: member.id, label: member.name }))]} /></div>)}</div></fieldset><FormActions onCancel={() => setEditOpen(false)} /></form>}
      </Modal>

      <Modal title="Solicitar inclusão" description={`O pedido será enviado ao Conselho ou Administração para incluir o membro em ${selected?.code ?? 'uma sociedade'}.`} open={requestOpen} onClose={() => setRequestOpen(false)}>
        <form onSubmit={requestMember}><div className="field"><span>Membro *</span><CustomSelect name="memberId" label="Membro" options={[{ value: '', label: 'Selecione um membro cadastrado', disabled: true }, ...data.members.filter((member) => member.status === 'Ativo' && !selected?.memberIds.includes(member.id)).map((member) => ({ value: member.id, label: member.name }))]} /></div><FormActions onCancel={() => setRequestOpen(false)} submitLabel="Enviar pedido" /></form>
      </Modal>
    </div>
  )
}
