import { useState, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, CheckCircle2, Eye, EyeOff, MailCheck, ShieldCheck } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAuth } from '../app/AuthContext'
import { ROLE_LABELS, roleSummary } from '../app/permissions'
import { createProfileThumbnail, type ProfilePhotoSelection } from '../app/profilePhoto'
import type { Role } from '../app/types'
import { CustomSelect, Field, FormActions, Modal } from '../components/Common'
import { ProfilePhotoField } from '../components/ProfilePhotoField'

const requestableRoles: Role[] = ['conselho', 'secretaria', 'tesouraria', 'professor', 'lider', 'acolhimento']

export function LoginPage() {
  const { data } = useApp()
  const {
    configured, loading, authUser, profile, currentUser, login, logout, requestAccess,
    resendVerification, refreshAccount, resetPassword,
  } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)
  const [requestSent, setRequestSent] = useState(false)
  const [profilePhoto, setProfilePhoto] = useState<ProfilePhotoSelection | null>(null)

  if (currentUser) return <Navigate to="/" replace />

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    const message = await login(email, password)
    setBusy(false)
    if (message) setError(message)
    else navigate('/')
  }

  async function handlePasswordReset() {
    if (!email.trim()) {
      setError('Informe seu e-mail para solicitar uma nova senha.')
      return
    }
    setBusy(true)
    const message = await resetPassword(email)
    setBusy(false)
    if (message) setError(message)
    else {
      setError('')
      setNotice('Se o e-mail estiver cadastrado, você receberá as instruções para redefinir a senha.')
    }
  }

  async function submitAccessRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = new FormData(event.currentTarget)
    const roles = requestableRoles.filter((role) => form.getAll('roles').includes(role))
    const requestPassword = String(form.get('password'))
    const passwordConfirmation = String(form.get('passwordConfirmation'))

    if (!roles.length) return setError('Escolha pelo menos uma atuação.')
    if (requestPassword.length < 8) return setError('A senha precisa ter pelo menos 8 caracteres.')
    if (requestPassword !== passwordConfirmation) return setError('As senhas não coincidem.')
    if (!profilePhoto) return setError('Escolha uma foto de perfil.')

    setBusy(true)
    setError('')
    try {
      const photo = await createProfileThumbnail(profilePhoto.file, profilePhoto.crop)
      const message = await requestAccess({
        name: String(form.get('name')).trim(),
        email: String(form.get('email')).trim().toLowerCase(),
        password: requestPassword,
        photo,
        office: roleSummary(roles),
        requestedRoles: roles,
        classIds: form.get('classId') ? [String(form.get('classId'))] : [],
        societyIds: form.get('societyId') ? [String(form.get('societyId'))] : [],
      })
      if (message) setError(message)
      else setRequestSent(true)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível preparar a foto.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="app-loading">Verificando acesso…</div>

  if (authUser && !authUser.emailVerified) {
    return <AccessState icon={<MailCheck size={42} />} title="Confirme seu e-mail" description={`Enviamos uma mensagem para ${authUser.email ?? 'seu e-mail'}. Depois de confirmar, volte aqui e atualize a verificação.`} actions={<><button className="button primary" onClick={refreshAccount}>Já confirmei, atualizar</button><button className="button secondary" onClick={async () => { const message = await resendVerification(); setError(message ?? 'E-mail reenviado.') }}>Reenviar e-mail</button><button className="text-button" onClick={logout}>Sair</button></>} message={error} />
  }

  if (authUser && profile?.status !== 'ativo') {
    const rejected = profile?.status === 'desativado'
    return <AccessState icon={<ShieldCheck size={42} />} title={rejected ? 'Acesso não liberado' : 'Cadastro em análise'} description={rejected ? 'Este cadastro está desativado. Procure um Administrador ou membro do Conselho.' : 'Seu e-mail foi confirmado. Agora um Administrador ou membro do Conselho precisa revisar suas funções e liberar o acesso.'} actions={<button className="button secondary" onClick={logout}>Sair</button>} />
  }

  return (
    <div className="login-page">
      <section className="login-brand-panel">
        <div className="login-brand-content">
          <img src="/ipcn-logo.png" alt="Igreja Presbiteriana Cidade Nobre" />
          <p className="eyebrow">Igreja Presbiteriana Cidade Nobre</p>
          <h1>IPCN Conecta</h1>
          <p>Um só lugar para cuidar de pessoas, ministérios e da administração da igreja.</p>
          <div className="login-trust"><ShieldCheck size={20} /><span>Acesso individual com permissões por atuação</span></div>
          <div className="login-trust"><MailCheck size={20} /><span>E-mail verificado e aprovação do Conselho</span></div>
        </div>
      </section>
      <main className="login-main">
        <div className="login-card">
          <div className="login-mobile-logo"><img src="/ipcn-logo.png" alt="" /><strong>IPCN Conecta</strong></div>
          <p className="eyebrow">Área restrita</p>
          <h2>Bem-vindo(a)</h2>
          <p className="muted">Entre com o seu acesso individual para continuar.</p>
          <form onSubmit={handleLogin}>
            <Field label="E-mail"><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></Field>
            <Field label="Senha">
              <span className="password-field"><input type={showPassword ? 'text' : 'password'} required value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></span>
            </Field>
            {error && <p className="form-error" role="alert">{error}</p>}
            {notice && <p className="form-notice" role="status">{notice}</p>}
            <button className="button primary button-block" type="submit" disabled={busy || !configured}>{busy ? 'Entrando…' : <>Entrar <ArrowRight size={18} /></>}</button>
          </form>
          <button className="text-button" type="button" onClick={handlePasswordReset} disabled={busy}>Esqueci minha senha</button>
          <button className="text-button" type="button" onClick={() => { setError(''); setRequestSent(false); setRequestOpen(true) }} disabled={!configured}>Primeiro acesso? Solicitar cadastro</button>
          {!configured && <div className="configuration-box"><strong>Firebase não configurado</strong><p>Adicione as variáveis do projeto para ativar o login real.</p></div>}
        </div>
      </main>

      <Modal title="Solicitar acesso" description="Após verificar o e-mail, o Conselho ou Administrador revisará os dados e definirá as permissões." open={requestOpen} onClose={() => setRequestOpen(false)} wide>
        {requestSent ? (
          <div className="success-state"><CheckCircle2 size={40} /><h3>Verifique seu e-mail</h3><p>Enviamos um link de confirmação. Depois disso, seu cadastro ficará disponível para aprovação.</p><button className="button primary" type="button" onClick={() => setRequestOpen(false)}>Concluir</button></div>
        ) : (
          <form onSubmit={submitAccessRequest}>
            <div className="form-grid two-columns access-request-fields">
              <Field className="access-request-name" label="Nome completo"><input name="name" required minLength={3} maxLength={120} autoComplete="name" /></Field>
              <Field className="access-request-email" label="E-mail"><input name="email" type="email" required maxLength={160} autoComplete="email" /></Field>
              <ProfilePhotoField onChange={setProfilePhoto} resetKey={requestOpen} />
              <Field className="access-request-password" label="Senha" hint="Use pelo menos 8 caracteres."><input name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" /></Field>
              <Field className="access-request-confirmation" label="Confirmar senha"><input name="passwordConfirmation" type="password" required minLength={8} maxLength={72} autoComplete="new-password" /></Field>
            </div>
            <fieldset className="role-picker"><legend>Quais atuações você exerce?</legend><div className="checkbox-grid">{requestableRoles.map((role) => <label key={role}><input type="checkbox" name="roles" value={role} /> <span>{ROLE_LABELS[role]}</span></label>)}</div></fieldset>
            <div className="form-grid two-columns">
              <div className="field"><span>Classe da EBD (se professor)</span><CustomSelect name="classId" label="Classe da EBD" options={[{ value: '', label: 'Nenhuma / definir depois' }, ...data.classes.map((item) => ({ value: item.id, label: item.name }))]} /></div>
              <div className="field"><span>Sociedade (se líder)</span><CustomSelect name="societyId" label="Sociedade" options={[{ value: '', label: 'Nenhuma / definir depois' }, ...data.societies.map((item) => ({ value: item.id, label: `${item.code} — ${item.name}` }))]} /></div>
            </div>
            <label className="privacy-acknowledgement"><input type="checkbox" required name="privacyNotice" /><span>Li o aviso de privacidade e estou ciente de que estes dados serão usados para analisar e administrar meu acesso ao IPCN Conecta.</span></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <FormActions onCancel={() => setRequestOpen(false)} submitLabel={busy ? 'Enviando…' : 'Criar conta e verificar e-mail'} disabled={busy} />
          </form>
        )}
      </Modal>
    </div>
  )
}

function AccessState({ icon, title, description, actions, message }: { icon: ReactNode; title: string; description: string; actions: ReactNode; message?: string }) {
  return <div className="access-state-page"><div className="access-state-card"><img src="/ipcn-logo.png" alt="IPCN" /><span className="access-state-icon">{icon}</span><h1>{title}</h1><p>{description}</p>{message && <p className="form-notice" role="status">{message}</p>}<div className="access-state-actions">{actions}</div></div></div>
}
