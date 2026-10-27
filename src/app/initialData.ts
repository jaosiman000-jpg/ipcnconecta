import type { AppData, Society } from './types'

export const defaultWhatsappMessage =
  'Olá, [nome]! Aqui é [responsável], da Igreja Presbiteriana Cidade Nobre. Foi muito bom receber você em nossa igreja. Esperamos que tenha se sentido acolhido(a). Se pudermos ajudar ou responder alguma dúvida, estamos à disposição. Deus abençoe você! Se preferir não receber novas mensagens, é só nos avisar.'

const societies: Society[] = [
  { id: 'soc-ucp', code: 'UCP', name: 'União de Crianças Presbiterianas', minAge: 0, maxAge: 11, leaderIds: [], memberIds: [], officers: [] },
  { id: 'soc-upa', code: 'UPA', name: 'União Presbiteriana de Adolescentes', minAge: 12, maxAge: 17, leaderIds: [], memberIds: [], officers: [] },
  { id: 'soc-ump', code: 'UMP', name: 'União de Mocidade Presbiteriana', minAge: 18, maxAge: 35, leaderIds: [], memberIds: [], officers: [] },
  { id: 'soc-uph', code: 'UPH', name: 'União Presbiteriana de Homens', minAge: 18, leaderIds: [], memberIds: [], officers: [] },
  { id: 'soc-saf', code: 'SAF', name: 'Sociedade Auxiliadora Feminina', minAge: 18, leaderIds: [], memberIds: [], officers: [] },
]

export function createInitialData(): AppData {
  return {
    version: 1,
    users: [],
    members: [],
    visitors: [],
    classes: [],
    attendance: [],
    societies: structuredClone(societies),
    societyRequests: [],
    finance: [],
    audit: [],
    settings: { whatsappMessage: defaultWhatsappMessage },
  }
}
