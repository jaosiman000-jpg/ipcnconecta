import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('versão dos Termos de Uso e da Política de Privacidade', () => {
  it('é a mesma no site e no servidor que registra o aceite', () => {
    const site = /LEGAL_VERSION = '([^']+)'/.exec(read('../../src/app/legal.ts'))?.[1]
    const server = /PRIVACY_NOTICE_VERSION = '([^']+)'/.exec(read('./signup.ts'))?.[1]
    expect(site).toBeTruthy()
    expect(server).toBe(site)
  })
})
