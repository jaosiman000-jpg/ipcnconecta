import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { BookOpenCheck, CalendarCheck2, Cake, CheckCircle2, Phone, Plus, Save, Trash2, UserRoundPlus, Users } from 'lucide-react'
import { makeId, useApp } from '../app/AppContext'
import { useAuth } from '../app/AuthContext'
import { ageFromBirthDate, displayDate, localIsoDate } from '../app/format'
import { hasCapability, visibleClassIds } from '../app/permissions'
import type { AttendanceSession, AttendanceStatus, AttendanceVisitor, EbdClass, Member } from '../app/types'
import { EmptyState, Field, FormActions, Modal, PageHeader, StatusBadge } from '../components/Common'

const attendanceOptions: { value: AttendanceStatus; label: string }[] = [
  { value: 'presente', label: 'Presente' },
  { value: 'ausente', label: 'Ausente' },
  { value: 'justificado', label: 'Justificado' },
]

export function EbdPage() {
  const { data, updateData } = useApp()
  const { currentUser, accountUsers } = useAuth()
  const scopedIds = visibleClassIds(currentUser)
  const availableClasses = data.classes.filter((item) => item.active && (scopedIds === null || scopedIds.includes(item.id) || item.teacherIds.includes(currentUser?.id ?? '')))
  const [selectedId, setSelectedId] = useState(availableClasses[0]?.id ?? '')
  const [records, setRecords] = useState<Record<string, AttendanceStatus>>({})
  const [attendanceVisitors, setAttendanceVisitors] = useState<AttendanceVisitor[]>([])
  const [promptOpen, setPromptOpen] = useState(false)
  const [attendanceOpen, setAttendanceOpen] = useState(false)
  const [visitorFormOpen, setVisitorFormOpen] = useState(false)
  const [visitorName, setVisitorName] = useState('')
  const [visitorPhone, setVisitorPhone] = useState('')
  const [attendanceError, setAttendanceError] = useState('')
  const [saveFeedback, setSaveFeedback] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmFinalize, setConfirmFinalize] = useState(false)
  const [classOpen, setClassOpen] = useState(false)
  const [editing, setEditing] = useState<EbdClass | null>(null)
  const prompted = useRef(new Set<string>())
  const callDate = localIsoDate()
  const canManage = hasCapability(currentUser, 'ebd.manage')
  const canTakeAttendance = hasCapability(currentUser, 'ebd.attendance')
  const selectedClass = availableClasses.find((item) => item.id === selectedId)
  const students = (selectedClass?.studentIds.map((id) => data.members.find((member) => member.id === id)).filter(Boolean) ?? []) as Member[]
  const currentSession = data.attendance.find((item) => item.classId === selectedId && item.date === callDate)
  const sessionFinalized = currentSession?.status !== 'rascunho' && Boolean(currentSession)

  useEffect(() => {
    if (!availableClasses.some((item) => item.id === selectedId)) setSelectedId(availableClasses[0]?.id ?? '')
  }, [availableClasses, selectedId])

  useEffect(() => {
    if (!canTakeAttendance || !selectedClass || !students.length) return
    const key = `${currentUser?.id}:${selectedClass.id}:${callDate}`
    if (prompted.current.has(key)) return
    prompted.current.add(key)
    setPromptOpen(true)
  }, [callDate, canTakeAttendance, currentUser?.id, selectedClass, students.length])

  const classSessions = useMemo(() => data.attendance.filter((item) => item.classId === selectedId).sort((a, b) => b.date.localeCompare(a.date)), [data.attendance, selectedId])
  const summary = classSessions.filter((session) => session.status !== 'rascunho').reduce((acc, session) => {
    Object.values(session.records).forEach((status) => { acc.total++; if (status === 'presente') acc.present++ })
    return acc
  }, { present: 0, total: 0 })

  const markedCount = students.filter((student) => Boolean(records[student.id])).length
  const presentCount = students.filter((student) => records[student.id] === 'presente').length
  const isReadOnly = sessionFinalized

  function openAttendance() {
    setRecords(currentSession?.records ?? {})
    setAttendanceVisitors(currentSession?.visitors ?? [])
    setAttendanceError('')
    setSaveFeedback('')
    setConfirmFinalize(false)
    setVisitorFormOpen(false)
    setPromptOpen(false)
    setAttendanceOpen(true)
  }

  function closeAttendance() {
    if (saving) return
    setAttendanceOpen(false)
    setConfirmFinalize(false)
  }

  function addAttendanceVisitor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = visitorName.trim()
    const phone = visitorPhone.trim()
    if (name.length < 2) {
      setAttendanceError('Informe o nome do visitante.')
      return
    }
    setAttendanceVisitors((current) => [...current, { id: makeId('attendance-visitor'), name, ...(phone ? { phone } : {}) }])
    setVisitorName('')
    setVisitorPhone('')
    setVisitorFormOpen(false)
    setAttendanceError('')
  }

  async function saveAttendance(status: NonNullable<AttendanceSession['status']>) {
    if (!selectedClass || !currentUser || saving || isReadOnly) return
    const missing = students.length - markedCount
    if (status === 'finalizada' && missing > 0) {
      setAttendanceError(`Marque a presença de ${missing} ${missing === 1 ? 'aluno' : 'alunos'} antes de finalizar.`)
      setConfirmFinalize(false)
      return
    }
    setSaving(true)
    setAttendanceError('')
    setSaveFeedback('')
    const saved = await updateData((draft) => {
      const existing = draft.attendance.find((item) => item.classId === selectedClass.id && item.date === callDate)
      if (existing) {
        existing.records = records
        existing.visitors = attendanceVisitors
        existing.status = status
        existing.createdBy = currentUser.id
      } else {
        draft.attendance.unshift({ id: makeId('attendance'), classId: selectedClass.id, date: callDate, records, visitors: attendanceVisitors, status, createdBy: currentUser.id })
      }
    }, status === 'finalizada' ? 'ebd.chamada_finalizada' : 'ebd.chamada_rascunho', `${selectedClass.name} em ${displayDate(callDate)}`)
    setSaving(false)
    if (!saved) return
    if (status === 'rascunho') {
      setSaveFeedback('Rascunho salvo e sincronizado.')
      return
    }
    setAttendanceOpen(false)
    setConfirmFinalize(false)
    window.alert('Chamada finalizada e sincronizada.')
  }

  async function saveClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const item: EbdClass = {
      id: editing?.id ?? makeId('class'),
      name: String(form.get('name')).trim(),
      description: String(form.get('description')).trim() || undefined,
      teacherIds: form.getAll('teachers').map(String),
      studentIds: form.getAll('students').map(String),
      active: form.get('active') === 'on',
    }
    const saved = await updateData((draft) => {
      const index = draft.classes.findIndex((entry) => entry.id === item.id)
      if (index >= 0) draft.classes[index] = item
      else draft.classes.push(item)
      draft.users.forEach((user) => {
        user.classIds = user.classIds.filter((id) => id !== item.id)
        if (item.teacherIds.includes(user.id)) user.classIds.push(item.id)
      })
    }, editing ? 'ebd.classe_atualizada' : 'ebd.classe_criada', item.name)
    if (saved) {
      setSelectedId(item.id)
      setClassOpen(false)
    }
  }

  const attendanceButtonLabel = sessionFinalized ? 'Ver chamada' : currentSession ? 'Continuar chamada' : 'Fazer chamada'

  return (
    <div className="page">
      <PageHeader eyebrow="Escola Bíblica Dominical" title="Classes da Escola Dominical" description={canManage ? 'Gerencie classes, professores, alunos e frequência.' : 'Consulte seus alunos, faça a chamada e acompanhe a frequência.'} actions={canManage && <button className="button primary" onClick={() => { setEditing(null); setClassOpen(true) }}><Plus size={18} /> Nova classe</button>} />
      {availableClasses.length ? <>
        <div className="class-selector" role="tablist" aria-label="Classes">{availableClasses.map((item) => <button role="tab" aria-selected={item.id === selectedId} className={item.id === selectedId ? 'active' : ''} key={item.id} onClick={() => setSelectedId(item.id)}><BookOpenCheck size={18} /><span>{item.name}</span><small>{item.studentIds.length} alunos</small></button>)}</div>
        <div className="ebd-layout">
          <section className="panel student-panel">
            <div className="panel-header student-panel-header"><div><h2>Alunos da classe</h2><p>{selectedClass?.name} · {students.length} alunos matriculados</p></div>{canTakeAttendance && students.length > 0 && <button className={sessionFinalized ? 'button secondary' : 'button primary'} onClick={openAttendance}><CalendarCheck2 size={18} /> {attendanceButtonLabel}</button>}</div>
            {students.length ? <div className="student-directory">{students.map((student) => <div className="student-directory-row" key={student.id}><div className="member-identity"><span className="avatar small-avatar">{student.name.charAt(0)}</span><div><strong>{student.name}</strong><small>{student.status}</small></div></div><div className="student-contact"><span><Phone size={15} /> {student.phone}</span><span><Cake size={15} /> {ageFromBirthDate(student.birthDate)} anos</span></div></div>)}</div> : <EmptyState title="Classe sem alunos" description={canManage ? 'Edite a classe para matricular membros.' : 'Peça à Secretaria ou ao Conselho para cadastrar os alunos.'} />}
          </section>
          <aside className="panel report-card"><div className="panel-header"><div><h2>Relatório da classe</h2><p>Histórico de frequência</p></div></div><div className="attendance-rate"><strong>{summary.total ? Math.round((summary.present / summary.total) * 100) : 0}%</strong><span>presença geral</span></div><div className="session-list">{classSessions.slice(0, 6).map((session) => { const values = Object.values(session.records); const present = values.filter((item) => item === 'presente').length; return <div key={session.id}><span>{displayDate(session.date)}</span><strong>{present}/{values.length}</strong><StatusBadge tone={session.status === 'rascunho' ? 'neutral' : values.length && present / values.length >= .75 ? 'success' : 'warning'}>{session.status === 'rascunho' ? 'Rascunho' : `${values.length ? Math.round(present / values.length * 100) : 0}%`}</StatusBadge></div> })}{!classSessions.length && <p className="muted">Nenhuma chamada registrada.</p>}</div>{canManage && selectedClass && <button className="button secondary button-block" onClick={() => { setEditing(selectedClass); setClassOpen(true) }}>Editar classe e matrículas</button>}</aside>
        </div>
      </> : <section className="panel"><EmptyState title="Nenhuma classe disponível" description="Não há classes ativas vinculadas ao seu acesso." /></section>}

      <Modal title="Fazer chamada" description={`${selectedClass?.name ?? 'Classe'} · ${displayDate(callDate)}`} open={promptOpen} onClose={() => setPromptOpen(false)} className="attendance-prompt-modal">
        <div className="attendance-prompt-body">
          <span className="attendance-prompt-icon"><CalendarCheck2 size={28} /></span>
          <div><h3>{sessionFinalized ? 'A chamada de hoje já foi finalizada' : currentSession ? 'Há uma chamada em andamento' : 'A chamada da classe está disponível'}</h3><p>{sessionFinalized ? 'Você pode consultar os registros e visitantes desta aula.' : currentSession ? 'Continue de onde parou para concluir o registro.' : 'Marque os presentes, ausentes e visitantes da classe.'}</p></div>
        </div>
        <div className="attendance-prompt-actions"><button className="button secondary" onClick={() => setPromptOpen(false)}>Agora não</button><button className="button primary" onClick={openAttendance}><CalendarCheck2 size={18} /> {attendanceButtonLabel}</button></div>
      </Modal>

      <Modal title={`Chamada — ${selectedClass?.name ?? 'Classe'}`} description={`${displayDate(callDate)} · ${students.length} alunos matriculados`} open={attendanceOpen} onClose={closeAttendance} wide className="attendance-workspace-modal">
        <div className="attendance-workspace">
          <div className="attendance-progress"><div><strong>{markedCount} de {students.length} alunos marcados</strong><span>{presentCount} presentes · {attendanceVisitors.length} {attendanceVisitors.length === 1 ? 'visitante' : 'visitantes'}</span></div><div className="attendance-progress-track" aria-label={`${markedCount} de ${students.length} alunos marcados`}><span style={{ transform: `scaleX(${students.length ? markedCount / students.length : 0})` }} /></div>{isReadOnly && <StatusBadge tone="success">Finalizada</StatusBadge>}</div>

          <div className="attendance-workspace-list">
            {students.map((student) => <div className="attendance-row" key={student.id}><div className="member-identity"><span className="avatar small-avatar">{student.name.charAt(0)}</span><div><strong>{student.name}</strong><small>{records[student.id] ? attendanceOptions.find((option) => option.value === records[student.id])?.label : 'Não marcado'}</small></div></div><div className="segmented-control" aria-label={`Presença de ${student.name}`}>{attendanceOptions.map((option) => <button type="button" disabled={isReadOnly || saving} aria-pressed={records[student.id] === option.value} className={records[student.id] === option.value ? `selected ${option.value}` : ''} key={option.value} onClick={() => { setRecords((current) => ({ ...current, [student.id]: option.value })); setAttendanceError(''); setSaveFeedback('') }}>{option.label}</button>)}</div></div>)}
          </div>

          <section className="attendance-visitors">
            <div className="attendance-section-heading"><div><h3>Visitantes da classe</h3><p>Registre quem participou sem estar matriculado.</p></div>{!isReadOnly && <button className="button secondary small" type="button" onClick={() => setVisitorFormOpen((current) => !current)}><UserRoundPlus size={17} /> Adicionar visitante</button>}</div>
            {visitorFormOpen && !isReadOnly && <form className="attendance-visitor-form" onSubmit={addAttendanceVisitor}><Field label="Nome *"><input value={visitorName} onChange={(event) => setVisitorName(event.target.value)} required autoFocus /></Field><Field label="Celular (opcional)"><input type="tel" value={visitorPhone} onChange={(event) => setVisitorPhone(event.target.value)} /></Field><div className="attendance-visitor-form-actions"><button type="button" className="button secondary small" onClick={() => setVisitorFormOpen(false)}>Cancelar</button><button className="button primary small">Adicionar</button></div></form>}
            {attendanceVisitors.length > 0 ? <div className="attendance-visitor-list">{attendanceVisitors.map((visitor) => <div key={visitor.id}><span className="avatar small-avatar"><Users size={16} /></span><div><strong>{visitor.name}</strong><small>{visitor.phone || 'Celular não informado'}</small></div>{!isReadOnly && <button className="icon-button" type="button" aria-label={`Remover ${visitor.name}`} onClick={() => setAttendanceVisitors((current) => current.filter((item) => item.id !== visitor.id))}><Trash2 size={17} /></button>}</div>)}</div> : !visitorFormOpen && <p className="attendance-empty-visitors">Nenhum visitante registrado nesta chamada.</p>}
          </section>

          {attendanceError && <p className="attendance-message error" role="alert">{attendanceError}</p>}
          {saveFeedback && <p className="attendance-message success"><CheckCircle2 size={17} /> {saveFeedback}</p>}
          {confirmFinalize && !isReadOnly && <div className="attendance-finalize-confirm"><div><strong>Finalizar esta chamada?</strong><p>Depois de finalizada, o professor não poderá alterar os registros.</p></div><div><button className="button secondary small" onClick={() => setConfirmFinalize(false)}>Voltar</button><button className="button primary small" disabled={saving} onClick={() => saveAttendance('finalizada')}>Confirmar finalização</button></div></div>}
        </div>
        <div className="attendance-workspace-footer"><div><strong>{presentCount} presentes</strong><span>{students.length - presentCount} ausentes ou não marcados</span></div>{isReadOnly ? <button className="button primary" onClick={closeAttendance}>Fechar</button> : <div><button className="button secondary" disabled={saving} onClick={() => saveAttendance('rascunho')}><Save size={18} /> {saving ? 'Salvando...' : 'Salvar rascunho'}</button><button className="button primary" disabled={saving} onClick={() => { if (markedCount < students.length) void saveAttendance('finalizada'); else setConfirmFinalize(true) }}><CheckCircle2 size={18} /> Finalizar chamada</button></div>}</div>
      </Modal>

      <Modal title={editing ? 'Editar classe' : 'Nova classe'} description="Somente Conselho, Administrador e responsáveis autorizados podem alterar matrículas." open={classOpen} onClose={() => setClassOpen(false)} wide>
        <form key={editing?.id ?? 'new'} onSubmit={saveClass}>
          <div className="form-grid two-columns"><Field label="Nome da classe *"><input name="name" required defaultValue={editing?.name} /></Field><Field label="Descrição"><input name="description" defaultValue={editing?.description} /></Field></div>
          <label className="check-row inline-check"><input name="active" type="checkbox" defaultChecked={editing?.active ?? true} /><span><strong>Classe ativa</strong></span></label>
          <div className="assignment-grid">
            <fieldset><legend>Professores</legend><div className="selection-list">{accountUsers.filter((user) => user.status === 'ativo' && (user.roles.includes('professor') || user.roles.includes('administrador') || user.roles.includes('conselho'))).map((user) => <label key={user.id}><input type="checkbox" name="teachers" value={user.id} defaultChecked={editing?.teacherIds.includes(user.id)} /><span>{user.name}<small>{user.email}</small></span></label>)}</div></fieldset>
            <fieldset><legend>Alunos</legend><div className="selection-list">{data.members.filter((member) => member.status !== 'Excluído' && member.status !== 'Falecido').map((member) => <label key={member.id}><input type="checkbox" name="students" value={member.id} defaultChecked={editing?.studentIds.includes(member.id)} /><span>{member.name}<small>{member.status}</small></span></label>)}</div></fieldset>
          </div>
          <FormActions onCancel={() => setClassOpen(false)} />
        </form>
      </Modal>
    </div>
  )
}
