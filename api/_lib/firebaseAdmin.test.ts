import { afterEach, describe, expect, it } from 'vitest'
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

describe('modo emulador', () => {
  const saved = { ...process.env }
  afterEach(() => {
    for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'VERCEL_ENV']) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  })

  it('usa o emulador local sem token OIDC quando os dois hosts estão definidos', () => {
    Object.assign(process.env, { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' })
    delete process.env.VERCEL_ENV

    const services = getAdminServices(new Request('https://localhost/api/mutations'))

    expect(services.db).toBeDefined()
    expect(services.auth).toBeDefined()
  })

  it('nunca ativa o emulador em um deployment da Vercel', () => {
    Object.assign(process.env, { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', VERCEL_ENV: 'production' })

    expect(() => getAdminServices(new Request('https://localhost/api/mutations'))).toThrow()
  })
})
