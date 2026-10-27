import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { persistAppChange, subscribeAppData } from './firestoreData'
import { createInitialData } from './initialData'
import type { AppData } from './types'
import { useAuth } from './AuthContext'

type Recipe = (draft: AppData) => void

interface AppContextValue {
  data: AppData
  updateData: (recipe: Recipe, action?: string, detail?: string) => Promise<boolean>
}

const AppContext = createContext<AppContextValue | null>(null)

export function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth()
  const [data, setData] = useState<AppData>(createInitialData)

  useEffect(() => {
    setData(createInitialData())
    if (!currentUser) return
    return subscribeAppData(currentUser, (update) => setData((current) => ({ ...current, ...update })))
  }, [currentUser])

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

  const value = useMemo(() => ({ data, updateData }), [data, updateData])
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp deve ser usado dentro de AppProvider')
  return context
}
