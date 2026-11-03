export interface LoadState {
  /** Ainda há dados essenciais esperando a primeira resposta. */
  loading: boolean
  /** Alguma leitura falhou e não conseguiu se recuperar sozinha. */
  failed: boolean
}

export interface LoadWatch {
  loaded: () => void
  failed: () => void
}

/**
 * Acompanha as leituras em tempo real do Firestore para que a tela saiba quando os dados chegaram
 * ou quando uma leitura falhou, em vez de mostrar listas vazias como se não houvesse cadastros.
 * Leituras `optional` (por exemplo, o histórico de auditoria) não seguram a tela.
 */
export function createLoadTracker(onChange: (state: LoadState) => void) {
  let pending = 0
  let failures = 0
  const emit = () => onChange({ loading: pending > 0, failed: failures > 0 })

  return {
    /** Reenvia o estado atual; útil quando nenhuma leitura chegou a ser registrada. */
    refresh: emit,
    add(options: { optional?: boolean } = {}): LoadWatch {
      let settled = Boolean(options.optional)
      let hasFailed = false
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
          if (hasFailed) {
            hasFailed = false
            failures -= 1
          }
          emit()
        },
        failed() {
          settle()
          if (!hasFailed) {
            hasFailed = true
            failures += 1
          }
          emit()
        },
      }
    },
  }
}
