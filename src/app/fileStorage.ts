import { deleteObject, getBlob, ref, uploadBytes } from 'firebase/storage'
import { firebaseStorage } from './firebase'
import type { MemberDocument } from './types'

const MAX_FILE_SIZE = 10 * 1024 * 1024
export const documentUploadsEnabled = import.meta.env.VITE_FIREBASE_STORAGE_ENABLED === 'true'
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
]

function safeFileName(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '-').slice(-120)
}

export function validateStoredFile(file: File) {
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error('Use um arquivo PDF, Word, JPG, PNG ou WebP.')
  if (file.size > MAX_FILE_SIZE) throw new Error('O arquivo deve ter no máximo 10 MB.')
}

export async function uploadStoredFile(folder: 'members' | 'finance', entityId: string, fileId: string, file: File): Promise<MemberDocument> {
  if (!documentUploadsEnabled) throw new Error('O envio de arquivos ainda está em configuração.')
  if (!firebaseStorage) throw new Error('O Firebase Storage ainda não está disponível.')
  validateStoredFile(file)
  const storagePath = `${folder}/${entityId}/${fileId}-${safeFileName(file.name)}`
  try {
    await uploadBytes(ref(firebaseStorage, storagePath), file, {
      contentType: file.type,
      customMetadata: { entityId, fileId },
    })
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
    if (code.includes('bucket-not-found') || code.includes('unknown')) throw new Error('O Firebase Storage precisa ser ativado antes de enviar arquivos.')
    throw new Error('Não foi possível enviar o arquivo. Verifique sua conexão e tente novamente.')
  }
  return { id: fileId, name: file.name, type: file.type, size: file.size, addedAt: new Date().toISOString(), storagePath }
}

export async function removeStoredFile(storagePath?: string) {
  if (firebaseStorage && storagePath) await deleteObject(ref(firebaseStorage, storagePath))
}

export async function downloadStoredFile(file: MemberDocument) {
  if (!firebaseStorage || !file.storagePath) throw new Error('Este arquivo ainda não está disponível no armazenamento online.')
  const blob = await getBlob(ref(firebaseStorage, file.storagePath), MAX_FILE_SIZE)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
