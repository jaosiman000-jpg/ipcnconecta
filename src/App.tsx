import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './app/AuthContext'
import { hasCapability, homePath, type Capability } from './app/permissions'
import { AppShell } from './components/AppShell'
import { AuditPage } from './pages/AuditPage'
import { DashboardPage } from './pages/DashboardPage'
import { EbdPage } from './pages/EbdPage'
import { FinancePage } from './pages/FinancePage'
import { ContributionWorkspacePage } from './pages/ContributionWorkspacePage'
import { LoginPage } from './pages/LoginPage'
import { PrivacyPage, TermsPage } from './pages/LegalPages'
import { MembersPage } from './pages/MembersPage'
import { PeoplePage } from './pages/PeoplePage'
import { ReportsPage } from './pages/ReportsPage'
import { SettingsPage } from './pages/SettingsPage'
import { UsersPage } from './pages/UsersPage'
import { VisitorsPage } from './pages/VisitorsPage'

function ProtectedApp() {
  const { currentUser, loading } = useAuth()
  if (loading) return <div className="app-loading">Carregando acesso…</div>
  return currentUser ? <AppShell /> : <Navigate to="/login" replace />
}

function Guard({ capability, children }: { capability: Capability; children: React.ReactNode }) {
  const { currentUser } = useAuth()
  return hasCapability(currentUser, capability) ? children : <Navigate to={homePath(currentUser)} replace />
}

function Home() {
  const { currentUser } = useAuth()
  return hasCapability(currentUser, 'dashboard.view') ? <DashboardPage /> : <Navigate to={homePath(currentUser)} replace />
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/termos" element={<TermsPage />} />
      <Route path="/privacidade" element={<PrivacyPage />} />
      <Route element={<ProtectedApp />}>
        <Route index element={<Home />} />
        <Route path="membros" element={<Guard capability="members.view"><MembersPage /></Guard>} />
        <Route path="cadastros" element={<Guard capability="people.view"><PeoplePage /></Guard>} />
        <Route path="visitantes" element={<Guard capability="visitors.view"><VisitorsPage /></Guard>} />
        <Route path="ebd" element={<Guard capability="ebd.view"><EbdPage /></Guard>} />
        <Route path="financeiro" element={<Guard capability="finance.view"><FinancePage /></Guard>} />
        <Route path="financeiro/contribuicoes/novo" element={<Guard capability="finance.manage"><ContributionWorkspacePage /></Guard>} />
        <Route path="relatorios" element={<Guard capability="reports.view"><ReportsPage /></Guard>} />
        <Route path="usuarios" element={<Guard capability="users.manage"><UsersPage /></Guard>} />
        <Route path="auditoria" element={<Guard capability="audit.view"><AuditPage /></Guard>} />
        <Route path="configuracoes" element={<Guard capability="settings.view"><SettingsPage /></Guard>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
