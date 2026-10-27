import { useEffect, useState } from 'react'
import {
  BookOpenCheck, Building2, ChartNoAxesCombined, CircleDollarSign, ClipboardList,
  FileSpreadsheet, LayoutDashboard, LogOut, Menu, Settings, ShieldCheck, Users, UserRoundSearch, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../app/AuthContext'
import { hasCapability, ROLE_LABELS, type Capability } from '../app/permissions'

interface NavItem {
  to: string
  label: string
  capability: Capability
  icon: LucideIcon
}

const navItems: NavItem[] = [
  { to: '/', label: 'Visão geral', capability: 'dashboard.view', icon: LayoutDashboard },
  { to: '/membros', label: 'Membros', capability: 'members.view', icon: Users },
  { to: '/visitantes', label: 'Visitantes', capability: 'visitors.view', icon: UserRoundSearch },
  { to: '/ebd', label: 'Escola dominical', capability: 'ebd.view', icon: BookOpenCheck },
  { to: '/sociedades', label: 'Sociedades', capability: 'societies.view', icon: Building2 },
  { to: '/financeiro', label: 'Financeiro', capability: 'finance.view', icon: CircleDollarSign },
  { to: '/relatorios', label: 'Relatórios', capability: 'reports.view', icon: FileSpreadsheet },
  { to: '/usuarios', label: 'Usuários e acessos', capability: 'users.manage', icon: ShieldCheck },
  { to: '/auditoria', label: 'Auditoria', capability: 'audit.view', icon: ClipboardList },
  { to: '/configuracoes', label: 'Configurações', capability: 'settings.view', icon: Settings },
]

export function AppShell() {
  const { currentUser, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (!currentUser) return null
  const availableItems = navItems.filter((item) => hasCapability(currentUser, item.capability))

  return (
    <div className="app-layout">
      <button className={`menu-backdrop ${menuOpen ? 'visible' : ''}`} aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <img src="/icons/ipcn-192.png?v=3" alt="Igreja Presbiteriana Cidade Nobre" />
          <strong>IPCN Conecta</strong>
          <button className="sidebar-close" type="button" onClick={() => setMenuOpen(false)} aria-label="Fechar menu"><X size={22} /></button>
        </div>
        <nav aria-label="Navegação principal">
          {availableItems.map((item) => {
            const Icon = item.icon
            return <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={() => setMenuOpen(false)}><Icon size={20} /><span>{item.label}</span></NavLink>
          })}
        </nav>
        <div className="sidebar-user">
          <span className="avatar">{currentUser.photo ? <img src={currentUser.photo} alt="" /> : currentUser.name.charAt(0)}</span>
          <div><strong>{currentUser.name}</strong><span>{currentUser.roles.map((role) => ROLE_LABELS[role]).join(' · ')}</span></div>
          <button type="button" onClick={logout} aria-label="Sair"><LogOut size={19} /></button>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <button className="mobile-menu" type="button" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu size={23} /></button>
          <div className="mobile-brand"><img src="/icons/ipcn-192.png?v=3" alt="" /><strong>IPCN Conecta</strong></div>
          <div className={`connection ${online ? 'online' : 'offline'}`} role="status" aria-label={online ? 'Online' : 'Offline'}><span />{!online && 'Offline'}</div>
        </header>
        <main><Outlet /></main>
      </div>
    </div>
  )
}
