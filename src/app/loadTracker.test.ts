import { describe, expect, it } from 'vitest'
import { createLoadTracker, type LoadState } from './loadTracker'

function setup() {
  const states: LoadState[] = []
  const tracker = createLoadTracker((state) => states.push(state))
  return { tracker, last: () => states[states.length - 1] }
}

describe('acompanhamento do carregamento', () => {
  it('fica carregando até todas as leituras essenciais responderem', () => {
    const { tracker, last } = setup()
    const a = tracker.add()
    const b = tracker.add()
    expect(last()).toEqual({ loading: true, failed: false })
    a.loaded()
    expect(last().loading).toBe(true)
    b.loaded()
    expect(last()).toEqual({ loading: false, failed: false })
  })

  it('leitura opcional não segura a tela', () => {
    const { tracker, last } = setup()
    const optional = tracker.add({ optional: true })
    expect(last()).toEqual({ loading: false, failed: false })
    optional.loaded()
    expect(last().loading).toBe(false)
  })

  it('uma falha libera a tela, mas avisa até a leitura se recuperar', () => {
    const { tracker, last } = setup()
    const a = tracker.add()
    a.failed()
    expect(last()).toEqual({ loading: false, failed: true })
    a.loaded()
    expect(last()).toEqual({ loading: false, failed: false })
  })

  it('falha de leitura opcional também é avisada', () => {
    const { tracker, last } = setup()
    tracker.add({ optional: true }).failed()
    expect(last()).toEqual({ loading: false, failed: true })
  })

  it('sem nenhuma leitura registrada, a conferência final libera a tela', () => {
    const { tracker, last } = setup()
    tracker.refresh()
    expect(last()).toEqual({ loading: false, failed: false })
  })

  it('respostas repetidas não desequilibram a contagem', () => {
    const { tracker, last } = setup()
    const a = tracker.add()
    a.loaded()
    a.loaded()
    a.failed()
    a.failed()
    a.loaded()
    expect(last()).toEqual({ loading: false, failed: false })
    tracker.add()
    expect(last().loading).toBe(true)
  })
})
