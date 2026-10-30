import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { BookOpenCheck, FileUp, Pencil, Plus, Users } from 'lucide-react'
import { makeId, useApp } from '../app/AppContext'
import { useAuth } from '../app/AuthContext'
import { parseIpcnPeopleWorkbook, type IpcnImportPreview } from '../app/ipcnPeopleImport'
import { ageFromBirthDate } from '../app/format'
import { isSuperuser } from '../app/permissions'
import { callSecureMutation } from '../app/secureApi'
import type { MaritalStatus, MemberStatus, MembershipType, Person, PersonInput, PersonSex } from '../app/types'
import { CustomSelect, EmptyState, Field, FileUploadField, FormActions, Modal, PageHeader, SearchField, StatusBadge } from '../components/Common'
import { useSearchParams } from 'react-router-dom'

const sexOptions: { value: PersonSex | ''; label: string }[] = [{ value: '', label: 'Não informado' }, { value: 'Feminino', label: 'Feminino' }, { value: 'Masculino', label: 'Masculino' }]
const maritalOptions: { value: MaritalStatus | ''; label: string }[] = [{ value: '', label: 'Não informado' }, { value: 'Solteiro', label: 'Solteiro' }, { value: 'Casado', label: 'Casado' }, { value: 'Divorciado', label: 'Divorciado' }, { value: 'Viúvo', label: 'Viúvo' }]
const membershipTypes: MembershipType[] = ['Comungante', 'Não comungante']
const memberStatuses: MemberStatus[] = ['Ativo', 'Em análise', 'Disciplinado', 'Excluído', 'Falecido']
const yesNoOptions = [{ value: '', label: 'Não informado' }, { value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]

function optionalBoolean(value: FormDataEntryValue | null) {
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

function personInput(person: Person): PersonInput {
  const { authUserId: _authUserId, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = person
  return input
}

export function PeoplePage() {
  const { data } = useApp()
  const { currentUser } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Person | null>(null)
  const [open, setOpen] = useState(false)
  const [ebdSelected, setEbdSelected] = useState(false)
  const [memberSelected, setMemberSelected] = useState(false)
  const [titherSelected, setTitherSelected] = useState(false)
  const [sex, setSex] = useState<PersonSex | ''>('')
  const [maritalStatus, setMaritalStatus] = useState<MaritalStatus | ''>('')
  const [classId, setClassId] = useState('')
  const [professor, setProfessor] = useState(false)
  const [membershipType, setMembershipType] = useState<MembershipType>('Comungante')
  const [memberStatus, setMemberStatus] = useState<MemberStatus>('Ativo')
  const [saving, setSaving] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importPreview, setImportPreview] = useState<IpcnImportPreview | null>(null)
  const canManageMembership = isSuperuser(currentUser)

  const people = useMemo(() => data.people.filter((person) => `${person.name} ${person.phone ?? ''} ${person.email ?? ''}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [data.people, search])

  function openPerson(person?: Person) {
    setEditing(person ?? null)
    setEbdSelected(Boolean(person?.ebd))
    setMemberSelected(Boolean(person?.membership))
    setTitherSelected(Boolean(person?.tither))
    setSex(person?.sex ?? '')
    setMaritalStatus(person?.maritalStatus ?? '')
    setClassId(person?.ebd?.classId ?? '')
    setProfessor(person?.ebd?.professor ?? false)
    setMembershipType(person?.membership?.type ?? 'Comungante')
    setMemberStatus(person?.membership?.status ?? 'Ativo')
    setOpen(true)
  }

  useEffect(() => {
    const editId = searchParams.get('editar')
    const newPerson = searchParams.get('novo') === '1'
    if (editId) {
      const person = data.people.find((item) => item.id === editId)
      if (person) { openPerson(person); setSearchParams({}, { replace: true }) }
    } else if (newPerson) {
      openPerson()
      setSearchParams({}, { replace: true })
    }
  }, [data.people, searchParams, setSearchParams])

  async function savePerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ebdSelected && !memberSelected && !titherSelected) {
      window.alert('Selecione pelo menos um vínculo: EBD, Membro ou Dizimista.')
      return
    }
    const form = new FormData(event.currentTarget)
    const selectedClass = data.classes.find((item) => item.id === classId)
    const base = editing ? personInput(editing) : { id: makeId('person'), name: '', tither: false, status: 'ativo' as const, source: 'manual' as const }
    const address = {
      street: String(form.get('street')).trim() || undefined,
      numberComplement: String(form.get('numberComplement')).trim() || undefined,
      neighborhood: String(form.get('neighborhood')).trim() || undefined,
      city: String(form.get('city')).trim() || undefined,
      postalCode: String(form.get('postalCode')).trim() || undefined,
    }
    const next: PersonInput = {
      ...base,
      name: String(form.get('name')).trim(),
      birthDate: String(form.get('birthDate')) || undefined,
      phone: String(form.get('phone')).trim() || undefined,
      homePhone: String(form.get('homePhone')).trim() || undefined,
      email: String(form.get('email')).trim() || undefined,
      sex: sex || undefined,
      address: Object.values(address).some(Boolean) ? address : undefined,
      nationality: String(form.get('nationality')).trim() || undefined,
      birthCity: String(form.get('birthCity')).trim() || undefined,
      birthState: String(form.get('birthState')).trim() || undefined,
      maritalStatus: maritalStatus || undefined,
      fatherName: String(form.get('fatherName')).trim() || undefined,
      fatherIsMember: optionalBoolean(form.get('fatherIsMember')),
      motherName: String(form.get('motherName')).trim() || undefined,
      motherIsMember: optionalBoolean(form.get('motherIsMember')),
      ebd: ebdSelected ? {
        ...editing?.ebd,
        classId: classId || undefined,
        className: selectedClass?.name,
        enrolledAt: String(form.get('enrolledAt')) || editing?.ebd?.enrolledAt,
        professor,
        status: 'ativo',
      } : editing?.ebd,
      membership: memberSelected ? {
        ...editing?.membership,
        type: membershipType,
        status: memberStatus,
        joinedAt: typeof form.get('joinedAt') === 'string' && form.get('joinedAt') ? String(form.get('joinedAt')) : editing?.membership?.joinedAt,
      } : editing?.membership,
      tither: titherSelected,
      status: memberSelected ? (memberStatus === 'Falecido' ? 'falecido' : 'ativo') : editing?.status ?? 'ativo',
    }

    setSaving(true)
    try {
      await callSecureMutation({ type: 'person.save', person: next })
      setOpen(false)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Não foi possível salvar o cadastro.')
    } finally {
      setSaving(false)
    }
  }

  async function prepareImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const file = new FormData(event.currentTarget).get('peopleWorkbook')
    if (!(file instanceof File) || !file.size) return
    setSaving(true)
    try {
      setImportPreview(await parseIpcnPeopleWorkbook(file))
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Não foi possível analisar a planilha.')
    } finally {
      setSaving(false)
    }
  }

  async function confirmImport() {
    if (!importPreview) return
    setSaving(true)
    try {
      await callSecureMutation({ type: 'people.import', importId: 'ipcn-ebd-2026-10-30', people: importPreview.people })
      setImportOpen(false)
      setImportPreview(null)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Não foi possível importar os cadastros.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page people-page">
      <PageHeader eyebrow="Secretaria" title="Cadastros" description="Uma pessoa, um cadastro. Defina os vínculos com membros, EBD e dízimos." actions={<>{isSuperuser(currentUser) && <button className="button secondary" onClick={() => { setImportPreview(null); setImportOpen(true) }}><FileUp size={18} /> Importar banco da EBD</button>}<button className="button primary" onClick={() => openPerson()}><Plus size={18} /> Nova pessoa</button></>} />
      <section className="panel table-panel"><div className="table-toolbar"><SearchField value={search} onChange={setSearch} placeholder="Buscar por nome, celular ou e-mail" /><p className="table-count">{people.length} cadastro{people.length === 1 ? '' : 's'}</p></div>{people.length ? <div className="responsive-table"><table><thead><tr><th>Pessoa</th><th>EBD</th><th>Membro</th><th>Dízimos</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{people.map((person) => <tr key={person.id}><td data-label="Pessoa"><strong>{person.name}</strong><small>{person.birthDate ? `${ageFromBirthDate(person.birthDate)} anos` : 'Nascimento não informado'} · {person.phone || 'Sem celular'}</small></td><td data-label="EBD">{person.ebd ? <><strong>Matrícula {person.ebd.registrationNumber ?? 'pendente'}</strong><small>{person.ebd.className || 'Sem sala vinculada'}</small></> : <StatusBadge>Não matriculado</StatusBadge>}</td><td data-label="Membro">{person.membership ? <><strong>Nº {person.membership.memberNumber ?? 'pendente'}</strong><small>{person.membership.type} · {person.membership.status}</small></> : <StatusBadge>Não definido</StatusBadge>}</td><td data-label="Dízimos"><StatusBadge tone={person.tither ? 'success' : 'neutral'}>{person.tither ? 'Dizimista' : 'Não'}</StatusBadge></td><td className="row-actions"><button className="icon-button" onClick={() => openPerson(person)} aria-label={`Editar ${person.name}`}><Pencil size={18} /></button></td></tr>)}</tbody></table></div> : <EmptyState title="Nenhuma pessoa cadastrada" description="Cadastre uma pessoa ou importe o banco atual da Escola Dominical." />}</section>

      <Modal title={editing ? 'Editar cadastro' : 'Nova pessoa'} description="Os números de matrícula e de membro são gerados automaticamente." open={open} onClose={() => !saving && setOpen(false)} wide>
        <form key={editing?.id ?? 'new'} onSubmit={savePerson}>
          <div className="form-section"><h3>Dados pessoais</h3><div className="form-grid two-columns"><Field label="Nome completo *"><input name="name" required defaultValue={editing?.name} /></Field><Field label={`Data de nascimento${editing ? '' : ' *'}`}><input name="birthDate" type="date" required={!editing} defaultValue={editing?.birthDate} /></Field><div className="field"><span>{`Sexo${editing ? '' : ' *'}`}</span><CustomSelect label="Sexo" value={sex} onChange={(value) => setSex(value as PersonSex | '')} options={sexOptions} /></div><div className="field"><span>Estado civil</span><CustomSelect label="Estado civil" value={maritalStatus} onChange={(value) => setMaritalStatus(value as MaritalStatus | '')} options={maritalOptions} /></div><Field label="Celular"><input name="phone" inputMode="tel" defaultValue={editing?.phone} /></Field><Field label="Telefone residencial"><input name="homePhone" inputMode="tel" defaultValue={editing?.homePhone} /></Field><Field label="E-mail"><input name="email" type="email" defaultValue={editing?.email} /></Field><Field label="Nacionalidade"><input name="nationality" defaultValue={editing?.nationality} /></Field><Field label="Naturalidade"><input name="birthCity" defaultValue={editing?.birthCity} /></Field><Field label="Estado de nascimento"><input name="birthState" defaultValue={editing?.birthState} /></Field></div></div>
          <div className="form-section"><h3>Endereço</h3><div className="form-grid two-columns"><Field label="Rua"><input name="street" defaultValue={editing?.address?.street} /></Field><Field label="Número e complemento"><input name="numberComplement" defaultValue={editing?.address?.numberComplement} /></Field><Field label="Bairro"><input name="neighborhood" defaultValue={editing?.address?.neighborhood} /></Field><Field label="Cidade"><input name="city" defaultValue={editing?.address?.city} /></Field><Field label="CEP"><input name="postalCode" defaultValue={editing?.address?.postalCode} /></Field></div></div>
          <div className="form-section"><h3>Filiação</h3><div className="form-grid two-columns"><Field label="Nome do pai"><input name="fatherName" defaultValue={editing?.fatherName} /></Field><div className="field"><span>Pai é membro?</span><CustomSelect name="fatherIsMember" label="Pai é membro" defaultValue={editing?.fatherIsMember === undefined ? '' : String(editing.fatherIsMember)} options={yesNoOptions} /></div><Field label="Nome da mãe"><input name="motherName" defaultValue={editing?.motherName} /></Field><div className="field"><span>Mãe é membro?</span><CustomSelect name="motherIsMember" label="Mãe é membro" defaultValue={editing?.motherIsMember === undefined ? '' : String(editing.motherIsMember)} options={yesNoOptions} /></div></div></div>
          <div className="form-section"><h3>Vínculos</h3><div className="person-module-grid"><label><input type="checkbox" checked={ebdSelected} disabled={Boolean(editing?.ebd)} onChange={(event) => setEbdSelected(event.target.checked)} /><BookOpenCheck size={20} /><span><strong>Escola Dominical</strong><small>Matrícula automática</small></span></label><label><input type="checkbox" checked={memberSelected} disabled={!canManageMembership || Boolean(editing?.membership)} onChange={(event) => setMemberSelected(event.target.checked)} /><Users size={20} /><span><strong>Membro</strong><small>{canManageMembership ? 'Número automático' : 'Definido pelo Conselho'}</small></span></label><label><input type="checkbox" checked={titherSelected} onChange={(event) => setTitherSelected(event.target.checked)} /><span><strong>Dizimista</strong><small>Disponível no financeiro</small></span></label></div>
            {ebdSelected && <div className="module-details"><div className="field"><span>Classe da EBD</span><CustomSelect label="Classe da EBD" value={classId} onChange={setClassId} options={[{ value: '', label: professor ? 'Sem sala específica' : 'Selecione a classe' }, ...data.classes.filter((item) => item.active).map((item) => ({ value: item.id, label: item.name }))]} /></div><Field label="Data da matrícula"><input name="enrolledAt" type="date" defaultValue={editing?.ebd?.enrolledAt} /></Field><label className="inline-check"><input type="checkbox" checked={professor} onChange={(event) => setProfessor(event.target.checked)} /> Professor da EBD</label></div>}
            {memberSelected && canManageMembership && <div className="module-details"><div className="field"><span>Tipo de membro *</span><CustomSelect label="Tipo de membro" value={membershipType} onChange={(value) => setMembershipType(value as MembershipType)} options={membershipTypes.map((value) => ({ value, label: value }))} /></div><div className="field"><span>Situação *</span><CustomSelect label="Situação do membro" value={memberStatus} onChange={(value) => setMemberStatus(value as MemberStatus)} options={memberStatuses.map((value) => ({ value, label: value }))} /></div><Field label="Data de admissão"><input name="joinedAt" type="date" defaultValue={editing?.membership?.joinedAt} /></Field></div>}
            {memberSelected && !canManageMembership && editing?.membership && <p className="form-hint">Vínculo atual: {editing.membership.type} · {editing.membership.status}. Somente Conselho e Administradores podem alterá-lo.</p>}
          </div>
          <FormActions onCancel={() => setOpen(false)} submitLabel="Salvar cadastro" disabled={saving} />
        </form>
      </Modal>

      <Modal title="Importar banco da EBD" description="O arquivo é analisado no navegador e não é armazenado. A importação pode ser realizada apenas uma vez." open={importOpen} onClose={() => !saving && setImportOpen(false)} wide>
        {!importPreview ? <form onSubmit={prepareImport}><FileUploadField label="Planilha da igreja" name="peopleWorkbook" accept=".xlsx" required emptyTitle="Selecionar BANCO IPCN (1).xlsx" emptyDescription="Arquivo Excel no formato validado" resetKey={importOpen} /><FormActions onCancel={() => setImportOpen(false)} submitLabel="Analisar planilha" disabled={saving} /></form> : <div className="people-import-preview"><h3>Conferência da importação</h3><dl><div><dt>Pessoas que serão cadastradas</dt><dd>{importPreview.people.length}</dd></div><div><dt>Matrículas novas</dt><dd>1 a {importPreview.people.length}</dd></div><div><dt>Dizimistas</dt><dd>{importPreview.tithers}</dd></div><div><dt>Professores</dt><dd>{importPreview.professors}</dd></div><div><dt>Classes vinculadas</dt><dd>{importPreview.classes.length}</dd></div><div><dt>Excluído da importação</dt><dd>{importPreview.excludedNames.join(', ')}</dd></div></dl><p>Os membros oficiais permanecerão sem definição. O primeiro número de membro será gerado quando o Conselho ou a Administração marcar uma pessoa como membro.</p><div className="form-actions"><button className="button secondary" onClick={() => setImportPreview(null)} disabled={saving}>Trocar arquivo</button><button className="button primary" onClick={confirmImport} disabled={saving}>Importar {importPreview.people.length} pessoas</button></div></div>}
      </Modal>
    </div>
  )
}
