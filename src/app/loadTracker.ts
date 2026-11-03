export interface LoadState {
  /** Ainda há dados essenciais esperando a primeira resposta. */
  loading: boolean
  /** Alguma leitura falhou e não conseguiu se recuperar sozinha. */
  failed: boolean
  /** Detalhe técnico das leituras que falharam, por exemplo "pessoas: permission-denied". */
  details: string[]
}

export interface LoadWatch {
  loaded: () => void
  failed: (reason?: string) => void
}

/**
 * Acompanha as leituras em tempo real do Firestore para que a tela saiba quando os dados chegaram
 * ou quando uma leitura falhou, em vez de mostrar listas vazias como se não houvesse cadastros.
 * Leituras `optional` (por exemplo, o histórico de auditoria) não seguram a tela.
 */
export function createLoadTracker(onChange: (state: LoadState) => void) {
  let pending = 0
  const failures = new Map<number, string>()
  let nextId = 0
  const emit = () => onChange({ loading: pending > 0, failed: failures.size > 0, details: [...failures.values()] })

  return {
    /** Reenvia o estado atual; útil quando nenhuma leitura chegou a ser registrada. */
    refresh: emit,
    add(options: { optional?: boolean; label?: string } = {}): LoadWatch {
      let settled = Boolean(options.optional)
      const id = nextId++
      if (!settled) pending += 1
      const settle = () => {
        if (settled) return
        settled = true
        pending -= 1
      }
      emit()
      return {
        loaded() {
          settle()
          failures.delete(id)
          emit()
        },
        failed(reason = 'erro') {
          settle()
          failures.set(id, options.label ? `${options.label}: ${reason}` : reason)
          emit()
        },
      }
    },
  }
}
