import { useEffect, useState, type FormEvent } from 'react'
import { ShieldCheck, UserRound } from 'lucide-react'
import { useAuth } from '../app/AuthContext'
import { ROLE_LABELS } from '../app/permissions'
import { createProfileThumbnail, type ProfilePhotoSelection } from '../app/profilePhoto'
import { Field, PageHeader } from '../components/Common'
import { ProfilePhotoField } from '../components/ProfilePhotoField'

export function SettingsPage() {
  const { currentUser, updateOwnProfile } = useAuth()
  const [name, setName] = useState(currentUser?.name ?? '')
  const [profilePhoto, setProfilePhoto] = useState<ProfilePhotoSelection | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (currentUser) setName(currentUser.name)
  }, [currentUser?.name])

  if (!currentUser) return null

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setSaved(false)
    setError('')
    try {
      const photo = profilePhoto ? await createProfileThumbnail(profilePhoto.file, profilePhoto.crop) : undefined
      const message = await updateOwnProfile({ name: name.trim(), photo })
      if (message) setError(message)
      else {
        setSaved(true)
        window.setTimeout(() => setSaved(false), 2500)
      }
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : 'Não foi possível preparar a foto.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Conta" title="Configurações" description="Atualize seus dados pessoais e consulte os acessos liberados para sua conta." />
      <section className="panel profile-settings-panel">
        <div className="settings-heading"><span><UserRound size={21} /></span><div><h2>Seu perfil</h2><p>As alterações aparecem automaticamente nos dispositivos conectados.</p></div></div>
        <form className="account-settings-form" onSubmit={save}>
          <div className="account-settings-layout">
            <ProfilePhotoField onChange={setProfilePhoto} resetKey={currentUser.updatedAt ?? currentUser.id} initialPhoto={currentUser.photo} required={false} />
            <div className="account-settings-details">
              <Field label="Nome"><input value={name} onChange={(event) => setName(event.target.value)} required minLength={3} maxLength={120} autoComplete="name" /></Field>
              <div className="account-access" aria-labelledby="account-access-title">
                <div className="account-access-heading"><ShieldCheck size={19} aria-hidden="true" /><h3 id="account-access-title">Seus acessos</h3></div>
                <p>Somente Administradores e Conselho podem alterar estas permissões.</p>
                <div className="role-tags">{currentUser.roles.map((role) => <span key={role}>{ROLE_LABELS[role]}</span>)}</div>
              </div>
            </div>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="profile-settings-actions"><button className="button primary" type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar alterações'}</button>{saved && <span className="save-feedback" role="status">Perfil atualizado.</span>}</div>
        </form>
      </section>
    </div>
  )
}
