import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './app/AuthContext'
import { hasCapability, type Capability } from './app/permissions'
import { AppShell } from './components/AppShell'
import { AuditPage } from './pages/AuditPage'
import { DashboardPage } from './pages/DashboardPage'
import { EbdPage } from './pages/EbdPage'
import { FinancePage } from './pages/FinancePage'
import { LoginPage } from './pages/LoginPage'
import { MembersPage } from './pages/MembersPage'
import { ReportsPage } from './pages/ReportsPage'
import { SettingsPage } from './pages/SettingsPage'
import { SocietiesPage } from './pages/SocietiesPage'
import { UsersPage } from './pages/UsersPage'
import { VisitorsPage } from './pages/VisitorsPage'

function ProtectedApp() {
  const { currentUser, loading } = useAuth()
  if (loading) return <div className="app-loading">Carregando acesso…</div>
  return currentUser ? <AppShell /> : <Navigate to="/login" replace />
}

function Guard({ capability, children }: { capability: Capability; children: React.ReactNode }) {
  const { currentUser } = useAuth()
  return hasCapability(currentUser, capability) ? children : <Navigate to="/" replace />
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedApp />}>
        <Route index element={<DashboardPage />} />
        <Route path="membros" element={<Guard capability="members.view"><MembersPage /></Guard>} />
        <Route path="visitantes" element={<Guard capability="visitors.view"><VisitorsPage /></Guard>} />
        <Route path="ebd" element={<Guard capability="ebd.view"><EbdPage /></Guard>} />
        <Route path="sociedades" element={<Guard capability="societies.view"><SocietiesPage /></Guard>} />
        <Route path="financeiro" element={<Guard capability="finance.view"><FinancePage /></Guard>} />
        <Route path="relatorios" element={<Guard capability="reports.view"><ReportsPage /></Guard>} />
        <Route path="usuarios" element={<Guard capability="users.manage"><UsersPage /></Guard>} />
        <Route path="auditoria" element={<Guard capability="audit.view"><AuditPage /></Guard>} />
        <Route path="configuracoes" element={<Guard capability="settings.view"><SettingsPage /></Guard>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
