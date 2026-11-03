import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { persistAppChange, subscribeAppData } from './firestoreData'
import { createInitialData } from './initialData'
import { createLoadTracker, type LoadState } from './loadTracker'
import type { AppData } from './types'
import { useAuth } from './AuthContext'

type Recipe = (draft: AppData) => void

/** Depois deste tempo sem resposta, a tela é liberada e um aviso explica a demora. */
const SLOW_LOAD_MS = 8000

export interface DataStatus {
  /** Esperando os primeiros dados: a tela mostra "Carregando" em vez de listas vazias. */
  loading: boolean
  /** Os dados estão demorando mais que o normal. */
  slow: boolean
  /** Alguma leitura falhou mesmo após novas tentativas. */
  failed: boolean
  /** Código técnico das leituras que falharam, para o suporte. */
  details: string[]
}

interface AppContextValue {
  data: AppData
  status: DataStatus
  reload: () => void
  updateData: (recipe: Recipe, action?: string, detail?: string) => Promise<boolean>
}

const AppContext = createContext<AppContextValue | null>(null)

export function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth()
  const [data, setData] = useState<AppData>(createInitialData)
  const [load, setLoad] = useState<LoadState>({ loading: true, failed: false, details: [] })
  const [slow, setSlow] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const reload = useCallback(() => setAttempt((value) => value + 1), [])

  useEffect(() => {
    setData(createInitialData())
    setSlow(false)
    setLoad({ loading: Boolean(currentUser), failed: false, details: [] })
    if (!currentUser) return
    const tracker = createLoadTracker(setLoad)
    const stop = subscribeAppData(currentUser, (update) => setData((current) => ({ ...current, ...update })), tracker)
    tracker.refresh()
    const timer = window.setTimeout(() => setSlow(true), SLOW_LOAD_MS)
    return () => {
      stop()
      window.clearTimeout(timer)
    }
  }, [currentUser, attempt])

  const updateData = useCallback(async (recipe: Recipe, action?: string, detail?: string) => {
    if (!currentUser) return false
    const next = structuredClone(data)
    recipe(next)
    try {
      await persistAppChange(data, next, currentUser, action, detail)
      return true
    } catch (error) {
      if (import.meta.env.DEV) console.warn('Firestore write failed:', error)
      window.alert('Não foi possível salvar os dados. Verifique sua conexão e tente novamente.')
      return false
    }
  }, [currentUser, data])

  const status = useMemo<DataStatus>(() => ({ loading: load.loading && !slow, slow: slow && load.loading, failed: load.failed, details: load.details }), [load, slow])
  const value = useMemo(() => ({ data, status, reload, updateData }), [data, status, reload, updateData])
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp deve ser usado dentro de AppProvider')
  return context
}
