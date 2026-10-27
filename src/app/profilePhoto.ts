const MAX_SOURCE_SIZE = 12 * 1024 * 1024
const MAX_DATA_URL_SIZE = 140_000
const THUMBNAIL_SIZE = 160

export interface ProfilePhotoCrop {
  zoom: number
  offsetX: number
  offsetY: number
  previewSize: number
}

export interface ProfilePhotoSelection {
  file: File
  crop: ProfilePhotoCrop
}

export function validateProfilePhotoFile(file: File) {
  const looksLikeImage = file.type.startsWith('image/') || /\.(avif|heic|heif|jpe?g|png|webp)$/i.test(file.name)
  if (!looksLikeImage) throw new Error('Escolha um arquivo de imagem válido.')
  if (file.size > MAX_SOURCE_SIZE) throw new Error('A foto original deve ter no máximo 12 MB.')
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Este formato de imagem não é compatível com o navegador. Tente uma foto JPG, PNG ou WebP.'))
    }
    image.src = url
  })
}

export async function createProfileThumbnail(file: File, crop?: ProfilePhotoCrop) {
  validateProfilePhotoFile(file)

  const image = await loadImage(file)
  const canvas = document.createElement('canvas')
  canvas.width = THUMBNAIL_SIZE
  canvas.height = THUMBNAIL_SIZE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Este navegador não conseguiu processar a foto.')

  const zoom = crop?.zoom ?? 1
  const baseScale = Math.max(THUMBNAIL_SIZE / image.naturalWidth, THUMBNAIL_SIZE / image.naturalHeight)
  const scale = baseScale * zoom
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  const offsetScale = crop ? THUMBNAIL_SIZE / crop.previewSize : 0

  context.drawImage(image, (THUMBNAIL_SIZE - width) / 2 + (crop?.offsetX ?? 0) * offsetScale, (THUMBNAIL_SIZE - height) / 2 + (crop?.offsetY ?? 0) * offsetScale, width, height)

  const photo = canvas.toDataURL('image/webp', 0.78)
  if (photo.length > MAX_DATA_URL_SIZE) throw new Error('Não foi possível reduzir a foto ao tamanho seguro.')
  return photo
}
