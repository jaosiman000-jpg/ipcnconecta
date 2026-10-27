import { BookOpenCheck, CalendarCheck2, CircleDollarSign, ShieldAlert, UserRoundSearch, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAuth } from '../app/AuthContext'
import { money } from '../app/format'
import { hasCapability, ROLE_LABELS } from '../app/permissions'
import { PageHeader, StatCard, StatusBadge } from '../components/Common'

export function DashboardPage() {
  const { data } = useApp()
  const { currentUser, accountUsers } = useAuth()
  const activeMembers = data.members.filter((member) => member.status === 'Ativo').length
  const month = new Date().toISOString().slice(0, 7)
  const monthlyEntries = data.finance.filter((entry) => entry.date.startsWith(month))
  const balance = monthlyEntries.reduce((total, entry) => total + (entry.type === 'entrada' ? entry.amount : -entry.amount), 0)
  const pending = accountUsers.filter((user) => user.status === 'pendente').length + data.societyRequests.filter((item) => item.status === 'pendente').length
  const recentAudit = data.audit.slice(0, 5)

  return (
    <div className="page">
      <PageHeader eyebrow="Visão geral" title={`Olá, ${currentUser?.name.split(' ')[0]}`} description={`Acesso: ${currentUser?.roles.map((role) => ROLE_LABELS[role]).join(' · ')}`} />
      <section className="stats-grid" aria-label="Indicadores">
        {hasCapability(currentUser, 'members.view') && <StatCard label="Membros ativos" value={activeMembers} helper={`${data.members.length} cadastros no total`} icon={<Users size={22} />} />}
        {hasCapability(currentUser, 'visitors.view') && <StatCard label="Visitantes" value={data.visitors.length} helper={`${data.visitors.filter((item) => !item.contacted).length} aguardando contato`} icon={<UserRoundSearch size={22} />} />}
        {hasCapability(currentUser, 'ebd.view') && <StatCard label="Classes da EBD" value={data.classes.filter((item) => item.active).length} helper={`${data.attendance.length} chamadas registradas`} icon={<BookOpenCheck size={22} />} />}
        {hasCapability(currentUser, 'finance.view') && <StatCard label="Saldo do mês" value={money.format(balance)} helper={`${monthlyEntries.length} lançamentos`} icon={<CircleDollarSign size={22} />} />}
      </section>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><div><h2>Atalhos</h2><p>Acesse as tarefas mais frequentes.</p></div></div>
          <div className="quick-actions">
            {hasCapability(currentUser, 'members.manage') && <Link to="/membros"><Users size={20} /><span><strong>Novo membro</strong><small>Cadastro e situação</small></span></Link>}
            {hasCapability(currentUser, 'visitors.manage') && <Link to="/visitantes"><UserRoundSearch size={20} /><span><strong>Novo visitante</strong><small>Cadastro e contato</small></span></Link>}
            {hasCapability(currentUser, 'ebd.attendance') && <Link to="/ebd"><CalendarCheck2 size={20} /><span><strong>Fazer chamada</strong><small>Presença na EBD</small></span></Link>}
            {hasCapability(currentUser, 'users.manage') && <Link to="/usuarios"><ShieldAlert size={20} /><span><strong>Revisar acessos</strong><small>{pending} pendências</small></span></Link>}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><div><h2>Atividade recente</h2><p>Últimas alterações registradas.</p></div>{hasCapability(currentUser, 'audit.view') && <Link to="/auditoria" className="text-link">Ver todas</Link>}</div>
          <div className="activity-list">
            {!recentAudit.length && <p className="muted">Nenhuma atividade registrada.</p>}
            {recentAudit.map((item) => {
              const actor = accountUsers.find((user) => user.id === item.actorId)?.name ?? data.users.find((user) => user.id === item.actorId)?.name ?? 'Acesso público'
              return <div key={item.id}><span className="activity-dot" /><div><strong>{item.detail || item.action}</strong><p>{actor} · {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.at))}</p></div></div>
            })}
          </div>
        </section>
      </div>
      {pending > 0 && hasCapability(currentUser, 'users.manage') && <div className="bottom-callout"><div><StatusBadge tone="warning">Ação necessária</StatusBadge><h2>{pending} solicitação{pending > 1 ? 'ões' : ''} aguardando análise</h2><p>Revise acessos e pedidos de inclusão antes de aprovar.</p></div><Link className="button primary" to="/usuarios">Revisar agora</Link></div>}
    </div>
  )
}
