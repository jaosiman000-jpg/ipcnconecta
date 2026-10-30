import type { PersonInput } from './types'

function text(cell: { text?: string } | undefined) {
  return String(cell?.text ?? '').trim()
}

function isoDate(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return undefined
  const [, day, month, year] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return undefined
  return `${year}-${month}-${day}`
}

function optionalBoolean(value: string) {
  const normalized = value.toUpperCase()
  if (normalized === 'S') return true
  if (normalized === 'N') return false
  return undefined
}

function compact<T extends object>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== '')) as T
}

export interface IpcnImportPreview {
  people: PersonInput[]
  excludedNames: string[]
  classes: string[]
  tithers: number
  professors: number
}

export async function parseIpcnPeopleWorkbook(file: File): Promise<IpcnImportPreview> {
  const ExcelJS = await import('exceljs')
  const Workbook = ExcelJS.Workbook ?? ExcelJS.default.Workbook
  const workbook = new Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  const sheet = workbook.worksheets[0]
  if (!sheet || text(sheet.getCell(1, 1)) !== 'MATRÍCULA' || text(sheet.getCell(1, 2)) !== 'NOME') {
    throw new Error('A planilha não possui o formato esperado do banco da IPCN.')
  }

  const people: PersonInput[] = []
  const excludedNames: string[] = []
  for (let row = 2; row <= sheet.rowCount; row += 1) {
    const name = text(sheet.getCell(row, 2))
    if (!name) continue
    const rawClass = text(sheet.getCell(row, 3))
    if (rawClass.toLocaleUpperCase('pt-BR') === 'LICENCIADOS') {
      excludedNames.push(name)
      continue
    }

    const rawSex = text(sheet.getCell(row, 12)).toUpperCase()
    const rawMaritalStatus = text(sheet.getCell(row, 18)).toUpperCase()
    const registrationNumber = people.length + 1
    const address = compact({
      street: text(sheet.getCell(row, 4)) || undefined,
      numberComplement: text(sheet.getCell(row, 5)) || undefined,
      neighborhood: text(sheet.getCell(row, 6)) || undefined,
      city: text(sheet.getCell(row, 7)) || undefined,
      postalCode: text(sheet.getCell(row, 8)) || undefined,
    })
    const titherValue = sheet.getCell(row, 25).value
    const tither = titherValue === true || String(titherValue).toLowerCase() === 'true'
    const className = rawClass === 'SUPERITEND./PROFESSORES' ? undefined : rawClass || undefined

    people.push(compact({
      id: `person-ipcn-${String(registrationNumber).padStart(4, '0')}`,
      name,
      birthDate: isoDate(text(sheet.getCell(row, 13))),
      phone: text(sheet.getCell(row, 10)) || undefined,
      homePhone: text(sheet.getCell(row, 9)) || undefined,
      email: text(sheet.getCell(row, 11)).toLowerCase() || undefined,
      sex: ['F', 'S', 'G'].includes(rawSex) ? 'Feminino' : rawSex === 'M' ? 'Masculino' : undefined,
      address: Object.keys(address).length ? address : undefined,
      nationality: text(sheet.getCell(row, 14)) || undefined,
      birthCity: text(sheet.getCell(row, 15)) || undefined,
      birthState: text(sheet.getCell(row, 16)) || undefined,
      maritalStatus: rawMaritalStatus === 'S' ? 'Solteiro' : rawMaritalStatus === 'C' ? 'Casado' : rawMaritalStatus === 'D' ? 'Divorciado' : rawMaritalStatus === 'V' ? 'Viúvo' : undefined,
      fatherName: text(sheet.getCell(row, 19)) || undefined,
      fatherIsMember: optionalBoolean(text(sheet.getCell(row, 20))),
      motherName: text(sheet.getCell(row, 21)) || undefined,
      motherIsMember: optionalBoolean(text(sheet.getCell(row, 22))),
      ebd: {
        registrationNumber,
        className,
        enrolledAt: isoDate(text(sheet.getCell(row, 23))),
        professor: text(sheet.getCell(row, 17)).toUpperCase() === 'S',
        status: 'ativo',
      },
      tither,
      status: 'ativo',
      source: 'ipcn-ebd-import',
    }) as PersonInput)
  }

  if (people.length !== 210 || excludedNames.length !== 1) {
    throw new Error(`A conferência encontrou ${people.length} pessoas e ${excludedNames.length} exclusão. O esperado é 210 pessoas e 1 exclusão.`)
  }
  return {
    people,
    excludedNames,
    classes: [...new Set(people.flatMap((person) => person.ebd?.className ? [person.ebd.className] : []))].sort(),
    tithers: people.filter((person) => person.tither).length,
    professors: people.filter((person) => person.ebd?.professor).length,
  }
}
