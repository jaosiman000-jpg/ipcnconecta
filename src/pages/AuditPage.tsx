import { useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { useApp } from '../app/AppContext'
import { useAuth } from '../app/AuthContext'
import { displayDateTime } from '../app/format'
import { EmptyState, PageHeader, SearchField } from '../components/Common'

export function AuditPage() {
  const { data } = useApp()
  const { accountUsers } = useAuth()
  const [search, setSearch] = useState('')
  const actorName = (actorId: string) => accountUsers.find((user) => user.id === actorId)?.name ?? data.users.find((user) => user.id === actorId)?.name ?? 'Acesso público'
  const entries = data.audit.filter((item) => `${item.action} ${item.detail} ${actorName(item.actorId)}`.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="page">
      <PageHeader eyebrow="Segurança" title="Registro de auditoria" description="Histórico sincronizado das alterações realizadas no sistema." />
      <section className="panel table-panel">
        <div className="table-toolbar">
          <SearchField value={search} onChange={setSearch} placeholder="Buscar ação ou usuário" />
          <p className="table-count">{entries.length} eventos</p>
        </div>
        {entries.length ? <div className="audit-list">{entries.map((item) => <article key={item.id}><span className="audit-icon"><ClipboardList size={18} /></span><div><strong>{item.detail || item.action}</strong><p>{item.action}</p></div><div><strong>{actorName(item.actorId)}</strong><time>{displayDateTime(item.at)}</time></div></article>)}</div> : <EmptyState title="Nenhum evento registrado" description="As próximas alterações aparecerão aqui." />}
      </section>
    </div>
  )
}
