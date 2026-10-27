import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth'
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore'
import { authPersistenceReady, firebaseAuth, firebaseConfigured, firestore } from './firebase'
import { isSuperuser } from './permissions'
import { callSecureMutation } from './secureApi'
import type { Role, User } from './types'

export const PRIVACY_NOTICE_VERSION = '2026-10-26'

export interface AccessRequest {
  name: string
  email: string
  password: string
  photo: string
  office: string
  requestedRoles: Role[]
  classIds: string[]
  societyIds: string[]
}

export interface AccessUpdate {
  roles: Role[]
  classIds: string[]
  societyIds: string[]
  office: string
}

export interface ProfileUpdate {
  name: string
  photo?: string
}

interface AuthContextValue {
  configured: boolean
  loading: boolean
  authUser: FirebaseUser | null
  profile?: User
  currentUser?: User
  accountUsers: User[]
  login: (email: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
  requestAccess: (request: AccessRequest) => Promise<string | null>
  resendVerification: () => Promise<string | null>
  refreshAccount: () => Promise<void>
  resetPassword: (email: string) => Promise<string | null>
  updateOwnProfile: (profile: ProfileUpdate) => Promise<string | null>
  saveAccess: (user: User, access: AccessUpdate) => Promise<string | null>
  rejectAccess: (user: User) => Promise<string | null>
  toggleAccount: (user: User) => Promise<string | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function iso(value: unknown) {
  return value && typeof value === 'object' && 'toDate' in value
    ? (value as Timestamp).toDate().toISOString()
    : typeof value === 'string' ? value : new Date().toISOString()
}

function dataToUser(id: string, data: DocumentData): User {
  return {
    id,
    name: String(data.name ?? ''),
    email: String(data.email ?? ''),
    photo: typeof data.photo === 'string' ? data.photo : undefined,
    office: typeof data.office === 'string' ? data.office : undefined,
    emailVerified: data.emailVerified === true,
    roles: Array.isArray(data.roles) ? data.roles as Role[] : [],
    requestedRoles: Array.isArray(data.requestedRoles) ? data.requestedRoles as Role[] : undefined,
    status: data.status === 'ativo' || data.status === 'desativado' ? data.status : 'pendente',
    classIds: Array.isArray(data.classIds) ? data.classIds.map(String) : [],
    societyIds: Array.isArray(data.societyIds) ? data.societyIds.map(String) : [],
    createdAt: iso(data.createdAt),
    updatedAt: data.updatedAt ? iso(data.updatedAt) : undefined,
    approvedAt: data.approvedAt ? iso(data.approvedAt) : undefined,
    approvedBy: typeof data.approvedBy === 'string' ? data.approvedBy : undefined,
    privacyNoticeVersion: typeof data.privacyNoticeVersion === 'string' ? data.privacyNoticeVersion : undefined,
    privacyNoticeAcceptedAt: data.privacyNoticeAcceptedAt ? iso(data.privacyNoticeAcceptedAt) : undefined,
  }
}

function snapshotToUser(snapshot: QueryDocumentSnapshot<DocumentData>) {
  return dataToUser(snapshot.id, snapshot.data())
}

function authError(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  if (import.meta.env.DEV) console.warn('Firebase authentication error:', code)
  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'Já existe uma conta com este e-mail.',
    'auth/invalid-credential': 'E-mail ou senha inválidos.',
    'auth/invalid-login-credentials': 'E-mail ou senha inválidos.',
    'auth/invalid-email': 'Informe um e-mail válido.',
    'auth/network-request-failed': 'Não foi possível acessar o serviço de login. Verifique sua conexão e tente novamente.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
    'auth/user-disabled': 'Esta conta foi desativada.',
    'auth/weak-password': 'A senha precisa ter pelo menos 8 caracteres.',
    'permission-denied': 'Você não tem permissão para realizar esta ação.',
  }
  return messages[code] ?? 'Não foi possível concluir a operação. Tente novamente.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null)
  const [profile, setProfile] = useState<User>()
  const [accountUsers, setAccountUsers] = useState<User[]>([])

  useEffect(() => {
    if (!firebaseAuth || !firestore) {
      setLoading(false)
      return
    }

    const auth = firebaseAuth
    const db = firestore
    let stopProfile: () => void = () => {}
    const stopAuth = onAuthStateChanged(auth, (user) => {
      stopProfile()
      setAuthUser(user)
      setProfile(undefined)
      setAccountUsers([])
      if (!user) {
        setLoading(false)
        return
      }

      setLoading(true)
      stopProfile = onSnapshot(doc(db, 'users', user.uid), async (snapshot) => {
        if (!snapshot.exists()) {
          setProfile(undefined)
          setLoading(false)
          return
        }
        const nextProfile = dataToUser(snapshot.id, snapshot.data())
        setProfile(nextProfile)
        setLoading(false)

        if (user.emailVerified && !nextProfile.emailVerified) {
          await updateDoc(snapshot.ref, { emailVerified: true, updatedAt: serverTimestamp() })
        }
      }, () => setLoading(false))
    })

    return () => {
      stopProfile()
      stopAuth()
    }
  }, [])

  useEffect(() => {
    if (!firestore || !profile || !isSuperuser(profile) || profile.status !== 'ativo') {
      setAccountUsers(profile ? [profile] : [])
      return
    }
    return onSnapshot(query(collection(firestore, 'users'), orderBy('createdAt', 'desc')), (snapshot) => {
      setAccountUsers(snapshot.docs.map(snapshotToUser))
    })
  }, [profile])

  const currentUser = profile?.status === 'ativo' && authUser?.emailVerified ? profile : undefined

  const login = useCallback(async (email: string, password: string) => {
    if (!firebaseAuth) return 'O Firebase ainda não foi configurado neste ambiente.'
    try {
      await authPersistenceReady
      await signInWithEmailAndPassword(firebaseAuth, email.trim().toLowerCase(), password)
      return null
    } catch (error) {
      return authError(error)
    }
  }, [])

  const logout = useCallback(async () => {
    if (firebaseAuth) await signOut(firebaseAuth)
  }, [])

  const requestAccess = useCallback(async (request: AccessRequest) => {
    if (!firebaseAuth || !firestore) return 'O Firebase ainda não foi configurado neste ambiente.'
    try {
      await authPersistenceReady
      const credential = await createUserWithEmailAndPassword(firebaseAuth, request.email, request.password)
      await updateProfile(credential.user, { displayName: request.name })
      await setDoc(doc(firestore, 'users', credential.user.uid), {
        uid: credential.user.uid,
        name: request.name,
        email: request.email,
        photo: request.photo,
        office: request.office,
        emailVerified: false,
        roles: [],
        requestedRoles: request.requestedRoles,
        status: 'pendente',
        classIds: request.classIds,
        societyIds: request.societyIds,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
        privacyNoticeAcceptedAt: serverTimestamp(),
      })
      await sendEmailVerification(credential.user, { url: window.location.origin + '/login' })
      await signOut(firebaseAuth)
      return null
    } catch (error) {
      if (firebaseAuth.currentUser) await signOut(firebaseAuth)
      return authError(error)
    }
  }, [])

  const resendVerification = useCallback(async () => {
    if (!authUser) return 'Entre novamente para reenviar a verificação.'
    try {
      await sendEmailVerification(authUser, { url: window.location.origin + '/login' })
      return null
    } catch (error) {
      return authError(error)
    }
  }, [authUser])

  const refreshAccount = useCallback(async () => {
    if (!authUser) return
    await reload(authUser)
    setAuthUser(firebaseAuth?.currentUser ?? null)
  }, [authUser])

  const resetPassword = useCallback(async (email: string) => {
    if (!firebaseAuth) return 'O Firebase ainda não foi configurado neste ambiente.'
    try {
      await sendPasswordResetEmail(firebaseAuth, email.trim().toLowerCase(), { url: window.location.origin + '/login' })
      return null
    } catch (error) {
      return authError(error)
    }
  }, [])

  const updateOwnProfile = useCallback(async (nextProfile: ProfileUpdate) => {
    if (!currentUser) return 'Entre novamente para continuar.'
    try {
      await callSecureMutation({ type: 'user.profile.update', name: nextProfile.name, photo: nextProfile.photo })
      return null
    } catch (error) {
      return error instanceof Error ? error.message : authError(error)
    }
  }, [currentUser])

  const saveAccess = useCallback(async (user: User, access: AccessUpdate) => {
    if (!currentUser || !isSuperuser(currentUser) || user.id === currentUser.id) return 'Ação não permitida.'
    if (!user.emailVerified) return 'O e-mail precisa estar verificado antes da aprovação.'
    try {
      await callSecureMutation({ type: 'user.access.save', userId: user.id, roles: access.roles, classIds: access.classIds, societyIds: access.societyIds })
      return null
    } catch (error) {
      return error instanceof Error ? error.message : authError(error)
    }
  }, [currentUser])

  const rejectAccess = useCallback(async (user: User) => {
    if (!currentUser || !isSuperuser(currentUser) || user.id === currentUser.id) return 'Ação não permitida.'
    try {
      await callSecureMutation({ type: 'user.access.reject', userId: user.id })
      return null
    } catch (error) {
      return error instanceof Error ? error.message : authError(error)
    }
  }, [currentUser])

  const toggleAccount = useCallback(async (user: User) => {
    if (!currentUser || !isSuperuser(currentUser) || user.id === currentUser.id) return 'Ação não permitida.'
    const nextStatus = user.status === 'ativo' ? 'desativado' : 'ativo'
    if (nextStatus === 'ativo' && !user.roles.length) return 'Defina pelo menos um papel antes de reativar.'
    try {
      await callSecureMutation({ type: 'user.access.toggle', userId: user.id })
      return null
    } catch (error) {
      return error instanceof Error ? error.message : authError(error)
    }
  }, [currentUser])

  const value = useMemo<AuthContextValue>(() => ({
    configured: firebaseConfigured,
    loading,
    authUser,
    profile,
    currentUser,
    accountUsers,
    login,
    logout,
    requestAccess,
    resendVerification,
    refreshAccount,
    resetPassword,
    updateOwnProfile,
    saveAccess,
    rejectAccess,
    toggleAccount,
  }), [loading, authUser, profile, currentUser, accountUsers, login, logout, requestAccess, resendVerification, refreshAccount, resetPassword, updateOwnProfile, saveAccess, rejectAccess, toggleAccount])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return context
}
