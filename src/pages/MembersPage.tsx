import { useMemo, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAuth } from '../app/AuthContext'
import { displayDate } from '../app/format'
import { hasCapability } from '../app/permissions'
import type { MemberStatus } from '../app/types'
import { CustomSelect, EmptyState, PageHeader, SearchField, StatusBadge } from '../components/Common'

const statuses: MemberStatus[] = ['Ativo', 'Em análise', 'Disciplinado', 'Excluído', 'Falecido']
type StatusSelectValue = 'Todos' | MemberStatus

function statusTone(status: MemberStatus) {
  if (status === 'Ativo') return 'success' as const
  if (status === 'Em análise') return 'warning' as const
  if (status === 'Disciplinado' || status === 'Excluído') return 'danger' as const
  return 'neutral' as const
}

export function MembersPage() {
  const { data } = useApp()
  const { currentUser } = useAuth()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusSelectValue>('Todos')
  const canManage = hasCapability(currentUser, 'members.manage')

  const filtered = useMemo(() => data.members.filter((member) => {
    const matchesSearch = `${member.name} ${member.phone} ${member.email ?? ''}`.toLowerCase().includes(search.toLowerCase())
    return matchesSearch && (status === 'Todos' || member.status === status)
  }), [data.members, search, status])

  return (
    <div className="page">
      <PageHeader eyebrow="Secretaria" title="Membros" description="Cadastro, contato e situação dos membros da igreja." actions={canManage && <Link className="button primary" to="/cadastros?novo=1"><Plus size={18} /> Novo cadastro</Link>} />
      <section className="panel table-panel members-table-panel">
        <div className="table-toolbar"><SearchField value={search} onChange={setSearch} placeholder="Buscar por nome, telefone ou e-mail" /><CustomSelect value={status} options={['Todos', ...statuses].map((item) => ({ value: item, label: item }))} label="Filtrar por situação" onChange={(value) => setStatus(value as StatusSelectValue)} /></div>
        {filtered.length ? (
          <div className="responsive-table">
            <table><thead><tr><th>Nome</th><th>Contato</th><th>Nascimento</th><th>Situação</th>{canManage && <th><span className="sr-only">Ações</span></th>}</tr></thead>
              <tbody>{filtered.map((member) => <tr key={member.id}><td data-label="Nome"><strong>{member.name}</strong><small>Nº de membro {member.memberNumber ?? 'não informado'}</small></td><td data-label="Contato">{member.phone}<small>{member.email ?? 'Sem e-mail'}</small></td><td data-label="Nascimento">{displayDate(member.birthDate)}</td><td data-label="Situação"><StatusBadge tone={statusTone(member.status)}>{member.status}</StatusBadge></td>{canManage && <td className="row-actions"><Link className="icon-button" to={`/cadastros?editar=${member.id}`} aria-label={`Editar ${member.name}`}><Pencil size={18} /></Link></td>}</tr>)}</tbody>
            </table>
          </div>
        ) : <EmptyState title="Nenhum membro encontrado" description="Ajuste os filtros ou faça o primeiro cadastro." />}
      </section>
    </div>
  )
}
