import { createHash } from 'node:crypto'
import { Firestore } from '@google-cloud/firestore'
import { deleteApp, getApps, initializeApp, type App, type Credential } from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'
import { ExternalAccountClient } from 'google-auth-library'

interface AdminServices {
  app: App
  auth: Auth
  db: Firestore
}

export class AdminSetupError extends Error {
  constructor(public reason: string, cause?: unknown) {
    super('Não foi possível iniciar os serviços administrativos.', { cause })
  }
}

const serviceCache = new Map<string, AdminServices>()

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new AdminSetupError(`missing_${name.toLowerCase()}`)
  return value
}

function oidcToken(request: Request) {
  const token = request.headers.get('x-vercel-oidc-token') ?? process.env.VERCEL_OIDC_TOKEN
  if (!token) throw new AdminSetupError('vercel_oidc_token_missing')
  return token
}

function createCredential(token: string) {
  const projectNumber = required('GCP_PROJECT_NUMBER')
  const poolId = required('GCP_WORKLOAD_IDENTITY_POOL_ID')
  const providerId = required('GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID')
  const serviceAccountEmail = required('GCP_SERVICE_ACCOUNT_EMAIL')
  let client: ReturnType<typeof ExternalAccountClient.fromJSON>
  try {
    client = ExternalAccountClient.fromJSON({
      type: 'external_account',
      audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      token_url: 'https://sts.googleapis.com/v1/token',
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      subject_token_supplier: { getSubjectToken: async () => token },
    })
  } catch (error) {
    throw new AdminSetupError('federated_credential_invalid', error)
  }
  if (!client) throw new AdminSetupError('federated_credential_unavailable')

  const credential: Credential = {
    async getAccessToken() {
      const access = await client.getAccessToken()
      if (!access.token) throw new Error('O Google Cloud não forneceu um token de acesso.')
      const expiry = client.credentials.expiry_date ?? Date.now() + 3_600_000
      return {
        access_token: access.token,
        expires_in: Math.max(60, Math.floor((expiry - Date.now()) / 1000)),
      }
    },
  }
  return { client, credential }
}

export function getAdminServices(request: Request): AdminServices {
  const token = oidcToken(request)
  const cacheKey = createHash('sha256').update(token).digest('hex')
  const cached = serviceCache.get(cacheKey)
  if (cached) return cached

  const projectId = required('GCP_PROJECT_ID')
  const appName = `ipcn-${cacheKey.slice(0, 20)}`
  const federated = createCredential(token)
  let app: App
  try {
    app = getApps().find((item) => item.name === appName) ?? initializeApp({
      projectId,
      credential: federated.credential,
    }, appName)
  } catch (error) {
    if (error instanceof AdminSetupError) throw error
    throw new AdminSetupError('firebase_app_init_failed', error)
  }
  let auth: Auth
  try {
    auth = getAuth(app)
  } catch (error) {
    throw new AdminSetupError('firebase_auth_init_failed', error)
  }
  let db: Firestore
  try {
    db = new Firestore({ projectId, authClient: federated.client, preferRest: true })
  } catch (error) {
    throw new AdminSetupError('firestore_init_failed', error)
  }
  const services = { app, auth, db }
  serviceCache.set(cacheKey, services)

  if (serviceCache.size > 3) {
    const oldestKey = serviceCache.keys().next().value as string | undefined
    const oldest = oldestKey ? serviceCache.get(oldestKey) : undefined
    if (oldestKey && oldest && oldestKey !== cacheKey) {
      serviceCache.delete(oldestKey)
      void deleteApp(oldest.app).catch(() => undefined)
      void oldest.db.terminate().catch(() => undefined)
    }
  }
  return services
}
