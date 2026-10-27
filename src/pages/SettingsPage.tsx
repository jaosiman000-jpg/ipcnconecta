import { useState, type FormEvent } from 'react'
import { DatabaseBackup, MessageCircle } from 'lucide-react'
import { useApp } from '../app/AppContext'
import { Field, PageHeader } from '../components/Common'

export function SettingsPage() {
  const { data, updateData } = useApp()
  const [saved, setSaved] = useState(false)
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = String(new FormData(event.currentTarget).get('message')).trim()
    const savedOnline = await updateData((draft) => { draft.settings.whatsappMessage = message }, 'configuracao.whatsapp_atualizada', 'Mensagem de acolhimento')
    if (!savedOnline) return
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2500)
  }
  return <div className="page"><PageHeader eyebrow="Sistema" title="Configurações" description="Ajustes gerais do sistema." /><div className="settings-grid"><section className="panel"><div className="settings-heading"><span><MessageCircle size={21} /></span><div><h2>Mensagem de acolhimento</h2><p>Usada no link manual de WhatsApp dos visitantes.</p></div></div><form onSubmit={save}><Field label="Texto da mensagem" hint="Use [nome] e [responsável] para preencher automaticamente."><textarea name="message" rows={8} required defaultValue={data.settings.whatsappMessage} /></Field><button className="button primary" type="submit">Salvar mensagem</button>{saved && <span className="save-feedback">Configuração salva.</span>}</form></section><section className="panel"><div className="settings-heading"><span><DatabaseBackup size={21} /></span><div><h2>Armazenamento e backup</h2><p>Status do sistema.</p></div></div><dl className="settings-list"><div><dt>Contas e permissões</dt><dd>Firebase em tempo real</dd></div><div><dt>Dados dos módulos</dt><dd>Cloud Firestore em tempo real</dd></div><div><dt>Arquivos</dt><dd>Firebase Storage aguardando ativação</dd></div><div><dt>Backup semanal</dt><dd>Ainda não configurado</dd></div></dl></section></div></div>
}
