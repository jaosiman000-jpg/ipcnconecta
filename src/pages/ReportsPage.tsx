import { useState } from 'react'
import { BookOpenCheck, Building2, CircleDollarSign, Download, FileSpreadsheet, UserRoundSearch, Users } from 'lucide-react'
import { useApp } from '../app/AppContext'
import { useAuth } from '../app/AuthContext'
import { hasCapability, isSuperuser } from '../app/permissions'
import { PageHeader } from '../components/Common'

type ReportKey = 'members' | 'visitors' | 'ebd' | 'societies' | 'finance' | 'all'

export function ReportsPage() {
  const { data } = useApp()
  const { currentUser } = useAuth()
  const [exporting, setExporting] = useState<ReportKey | null>(null)
  const reports = [
    { key: 'members' as const, title: 'Membros', description: `${data.members.length} cadastros`, icon: Users, allowed: hasCapability(currentUser, 'members.view') },
    { key: 'visitors' as const, title: 'Visitantes', description: `${data.visitors.length} cadastros`, icon: UserRoundSearch, allowed: hasCapability(currentUser, 'visitors.view') },
    { key: 'ebd' as const, title: 'Escola dominical', description: `${data.attendance.length} chamadas`, icon: BookOpenCheck, allowed: hasCapability(currentUser, 'ebd.view') },
    { key: 'societies' as const, title: 'Sociedades', description: `${data.societies.length} sociedades`, icon: Building2, allowed: hasCapability(currentUser, 'societies.view') },
    { key: 'finance' as const, title: 'Financeiro', description: `${data.finance.length} lançamentos`, icon: CircleDollarSign, allowed: hasCapability(currentUser, 'finance.view') },
    { key: 'all' as const, title: 'Exportação completa', description: 'Todas as áreas permitidas', icon: FileSpreadsheet, allowed: isSuperuser(currentUser) },
  ].filter((item) => item.allowed)

  async function exportReport(key: ReportKey) {
    setExporting(key)
    try {
      const ExcelJS = await import('exceljs')
      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'IPCN Conecta'
      const addSheet = (name: string, rows: Record<string, string | number | boolean | undefined>[]) => {
        const sheet = workbook.addWorksheet(name)
        const headers = rows.length ? Object.keys(rows[0]) : ['Informação']
        sheet.columns = headers.map((header) => ({ header, key: header, width: Math.max(14, Math.min(35, header.length + 8)) }))
        rows.forEach((row) => sheet.addRow(row))
        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF078B44' } }
        sheet.views = [{ state: 'frozen', ySplit: 1 }]
        sheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + Math.min(headers.length, 26))}1` }
      }
      if (key === 'members' || key === 'all') addSheet('Membros', data.members.map((item) => ({ Nome: item.name, Nascimento: item.birthDate, Celular: item.phone, Endereço: item.address, CPF: item.cpf, Email: item.email, Situação: item.status, ...(isSuperuser(currentUser) ? { 'Observações restritas': item.restrictedNotes } : {}) })))
      if (key === 'visitors' || key === 'all') addSheet('Visitantes', data.visitors.map((item) => ({ Nome: item.name, Celular: item.phone, Nascimento: item.birthDate, Visita: item.visitDate, Consentimento: item.consent ? 'Sim' : 'Não', Contatado: item.contacted ? 'Sim' : 'Não', 'Não contatar': item.doNotContact ? 'Sim' : 'Não' })))
      if (key === 'ebd' || key === 'all') addSheet('EBD', data.attendance.flatMap((session) => [
        ...Object.entries(session.records).map(([memberId, status]) => ({ Classe: data.classes.find((item) => item.id === session.classId)?.name, Data: session.date, Aluno: data.members.find((item) => item.id === memberId)?.name, Telefone: data.members.find((item) => item.id === memberId)?.phone, Presença: status })),
        ...(session.visitors ?? []).map((visitor) => ({ Classe: data.classes.find((item) => item.id === session.classId)?.name, Data: session.date, Aluno: visitor.name, Telefone: visitor.phone, Presença: 'visitante' })),
      ]))
      if (key === 'societies' || key === 'all') addSheet('Sociedades', data.societies.flatMap((society) => society.memberIds.map((memberId) => ({ Sociedade: society.code, Nome: data.members.find((item) => item.id === memberId)?.name, 'Idade mínima': society.minAge, 'Idade máxima': society.maxAge }))))
      if (key === 'finance' || key === 'all') addSheet('Financeiro', data.finance.map((item) => ({ Data: item.date, Tipo: item.type, Valor: item.amount, Categoria: item.category, Descrição: item.description, Conta: item.account, Contribuinte: item.contributor, Comprovante: item.receiptName })))
      const buffer = await workbook.xlsx.writeBuffer()
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `ipcn-conecta-${key}-${new Date().toISOString().slice(0, 10)}.xlsx`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error(error)
      window.alert('Não foi possível gerar a planilha. Tente novamente.')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="page"><PageHeader eyebrow="Dados" title="Relatórios e exportações" description="Gere planilhas apenas com as áreas disponíveis no seu acesso." /><div className="report-grid">{reports.map((report) => { const Icon = report.icon; return <article key={report.key}><span className="report-icon"><Icon size={24} /></span><div><h2>{report.title}</h2><p>{report.description}</p></div><button className="button secondary" disabled={Boolean(exporting)} onClick={() => exportReport(report.key)}><Download size={18} /> {exporting === report.key ? 'Gerando...' : 'Exportar XLSX'}</button></article> })}</div><div className="privacy-note"><FileSpreadsheet size={20} /><p>As planilhas podem conter dados pessoais. Salve-as apenas em local autorizado e evite compartilhamentos fora da finalidade administrativa.</p></div></div>
  )
}
