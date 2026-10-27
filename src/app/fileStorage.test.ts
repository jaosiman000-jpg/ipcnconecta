import { describe, expect, it } from 'vitest'
import { validateStoredFile } from './fileStorage'

describe('validateStoredFile', () => {
  it('aceita os formatos previstos', () => {
    expect(() => validateStoredFile(new File(['conteúdo'], 'documento.pdf', { type: 'application/pdf' }))).not.toThrow()
    expect(() => validateStoredFile(new File(['imagem'], 'foto.webp', { type: 'image/webp' }))).not.toThrow()
  })

  it('recusa formato executável', () => {
    expect(() => validateStoredFile(new File(['binário'], 'arquivo.exe', { type: 'application/x-msdownload' }))).toThrow('PDF, Word, JPG, PNG ou WebP')
  })

  it('recusa arquivo maior que 10 MB', () => {
    const largeFile = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'grande.pdf', { type: 'application/pdf' })
    expect(() => validateStoredFile(largeFile)).toThrow('no máximo 10 MB')
  })
})
