import { describe, expect, it } from 'vitest'
import { getAdminServices } from './firebaseAdmin'

describe('inicialização administrativa', () => {
  it('inicia os serviços com identidade federada sem chave privada', () => {
    Object.assign(process.env, {
      GCP_PROJECT_ID: 'ipcnconecta',
      GCP_PROJECT_NUMBER: '476524663325',
      GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-production',
      GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-team',
      GCP_SERVICE_ACCOUNT_EMAIL: 'ipcn-vercel-functions@ipcnconecta.iam.gserviceaccount.com',
    })
    const request = new Request('https://localhost/api/mutations', {
      headers: { 'x-vercel-oidc-token': 'token.teste.local' },
    })

    const services = getAdminServices(request)

    expect(services.app).toBeDefined()
    expect(services.auth).toBeDefined()
    expect(services.db).toBeDefined()
  })
})
