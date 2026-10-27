export const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function displayDate(value?: string) {
  if (!value) return '—'
  const [year, month, day] = value.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

export function displayDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

export function isSundayDate(value: string) {
  return Boolean(value) && new Date(`${value}T12:00:00`).getDay() === 0
}

export function mostRecentSunday() {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() - date.getDay())
  return date.toISOString().slice(0, 10)
}

export function phoneDigits(value: string) {
  return value.replace(/\D/g, '')
}

export function ageFromBirthDate(value: string) {
  const birth = new Date(`${value}T12:00:00`)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--
  return age
}
