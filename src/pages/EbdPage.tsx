import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { BookOpenCheck, CalendarCheck2, Plus, Save } from 'lucide-react'
import { makeId, useApp } from '../app/AppContext'
import { useAuth } from '../app/AuthContext'
import { displayDate, isSundayDate, mostRecentSunday } from '../app/format'
import { hasCapability, visibleClassIds } from '../app/permissions'
import type { AttendanceStatus, EbdClass } from '../app/types'
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
  const [date, setDate] = useState(mostRecentSunday)
  const [records, setRecords] = useState<Record<string, AttendanceStatus>>({})
  const [classOpen, setClassOpen] = useState(false)
  const [editing, setEditing] = useState<EbdClass | null>(null)
  const canManage = hasCapability(currentUser, 'ebd.manage')
  const canTakeAttendance = hasCapability(currentUser, 'ebd.attendance')
  const selectedClass = availableClasses.find((item) => item.id === selectedId)
  const students = selectedClass?.studentIds.map((id) => data.members.find((member) => member.id === id)).filter(Boolean) ?? []

  useEffect(() => {
    if (!availableClasses.some((item) => item.id === selectedId)) setSelectedId(availableClasses[0]?.id ?? '')
  }, [availableClasses, selectedId])

  useEffect(() => {
    const saved = data.attendance.find((item) => item.classId === selectedId && item.date === date)
    const initial: Record<string, AttendanceStatus> = {}
    students.forEach((student) => { if (student) initial[student.id] = saved?.records[student.id] ?? 'presente' })
    setRecords(initial)
  }, [selectedId, date, data.attendance, selectedClass?.studentIds.join(',')])

  const classSessions = useMemo(() => data.attendance.filter((item) => item.classId === selectedId && isSundayDate(item.date)).sort((a, b) => b.date.localeCompare(a.date)), [data.attendance, selectedId])
  const summary = classSessions.reduce((acc, session) => {
    Object.values(session.records).forEach((status) => { acc.total++; if (status === 'presente') acc.present++ })
    return acc
  }, { present: 0, total: 0 })

  async function saveAttendance() {
    if (!selectedClass || !currentUser) return
    if (!isSundayDate(date)) {
      window.alert('A chamada da EBD só pode ser registrada aos domingos.')
      return
    }
    const saved = await updateData((draft) => {
      const existing = draft.attendance.find((item) => item.classId === selectedClass.id && item.date === date)
      if (existing) {
        existing.records = records
        existing.createdBy = currentUser.id
      } else {
        draft.attendance.unshift({ id: makeId('attendance'), classId: selectedClass.id, date, records, createdBy: currentUser.id })
      }
    }, 'ebd.chamada_salva', `${selectedClass.name} em ${displayDate(date)}`)
    if (saved) window.alert('Chamada salva e sincronizada.')
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

  return (
    <div className="page">
      <PageHeader eyebrow="Escola Bíblica Dominical" title="Classes e chamada" description={canManage ? 'Gerencie classes, professores, alunos e frequência.' : 'Faça a chamada e consulte o relatório das suas classes.'} actions={canManage && <button className="button primary" onClick={() => { setEditing(null); setClassOpen(true) }}><Plus size={18} /> Nova classe</button>} />
      {availableClasses.length ? <>
        <div className="class-selector" role="tablist" aria-label="Classes">{availableClasses.map((item) => <button role="tab" aria-selected={item.id === selectedId} className={item.id === selectedId ? 'active' : ''} key={item.id} onClick={() => setSelectedId(item.id)}><BookOpenCheck size={18} /><span>{item.name}</span><small>{item.studentIds.length} alunos</small></button>)}</div>
        <div className="ebd-layout">
          <section className="panel attendance-panel">
            <div className="panel-header"><div><h2>Chamada</h2><p>{selectedClass?.name} · {students.length} alunos matriculados</p></div><label className="date-control"><span>Domingo</span><input type="date" min="2020-01-05" step="7" required value={date} onChange={(event) => { if (isSundayDate(event.target.value)) setDate(event.target.value) }} /></label></div>
            {students.length ? <div className="attendance-list">{students.map((student) => student && <div className="attendance-row" key={student.id}><div className="member-identity"><span className="avatar small-avatar">{student.name.charAt(0)}</span><div><strong>{student.name}</strong><small>{student.status}</small></div></div><div className="segmented-control">{attendanceOptions.map((option) => <button type="button" disabled={!canTakeAttendance} className={records[student.id] === option.value ? `selected ${option.value}` : ''} key={option.value} onClick={() => setRecords((current) => ({ ...current, [student.id]: option.value }))}>{option.label}</button>)}</div></div>)}</div> : <EmptyState title="Classe sem alunos" description={canManage ? 'Edite a classe para matricular membros.' : 'Peça à Secretaria ou ao Conselho para cadastrar os alunos.'} />}
            {canTakeAttendance && students.length > 0 && <div className="sticky-save"><p>{Object.values(records).filter((item) => item === 'presente').length} presentes de {students.length}</p><button className="button primary" onClick={saveAttendance}><Save size={18} /> Salvar chamada</button></div>}
          </section>
          <aside className="panel report-card"><div className="panel-header"><div><h2>Relatório da classe</h2><p>Histórico de frequência</p></div></div><div className="attendance-rate"><strong>{summary.total ? Math.round((summary.present / summary.total) * 100) : 0}%</strong><span>presença geral</span></div><div className="session-list">{classSessions.slice(0, 6).map((session) => { const values = Object.values(session.records); const present = values.filter((item) => item === 'presente').length; return <div key={session.id}><span>{displayDate(session.date)}</span><strong>{present}/{values.length}</strong><StatusBadge tone={values.length && present / values.length >= .75 ? 'success' : 'warning'}>{values.length ? Math.round(present / values.length * 100) : 0}%</StatusBadge></div> })}{!classSessions.length && <p className="muted">Nenhuma chamada registrada.</p>}</div>{canManage && selectedClass && <button className="button secondary button-block" onClick={() => { setEditing(selectedClass); setClassOpen(true) }}>Editar classe e matrículas</button>}</aside>
        </div>
      </> : <section className="panel"><EmptyState title="Nenhuma classe disponível" description="Não há classes ativas vinculadas ao seu acesso." /></section>}

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
