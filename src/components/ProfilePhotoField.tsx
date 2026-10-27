import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from 'react'
import { Camera, Minus, Plus, UserRound } from 'lucide-react'
import { validateProfilePhotoFile, type ProfilePhotoSelection } from '../app/profilePhoto'

const PREVIEW_SIZE = 144

interface ImageSize {
  width: number
  height: number
}

export function ProfilePhotoField({ onChange, resetKey, initialPhoto, required = true }: {
  onChange: (selection: ProfilePhotoSelection | null) => void
  resetKey: string | number | boolean
  initialPhoto?: string
  required?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [imageSize, setImageSize] = useState<ImageSize | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [error, setError] = useState('')

  useEffect(() => {
    setFile(null)
    setPreviewUrl('')
    setImageSize(null)
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    setError('')
    if (inputRef.current) inputRef.current.value = ''
    onChange(null)
  }, [resetKey, onChange])

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  useEffect(() => {
    if (!file) return onChange(null)
    onChange({ file, crop: { zoom, offsetX: offset.x, offsetY: offset.y, previewSize: PREVIEW_SIZE } })
  }, [file, offset, onChange, zoom])

  function limits(nextZoom: number) {
    if (!imageSize) return { x: 0, y: 0 }
    const scale = Math.max(PREVIEW_SIZE / imageSize.width, PREVIEW_SIZE / imageSize.height) * nextZoom
    return {
      x: Math.max(0, (imageSize.width * scale - PREVIEW_SIZE) / 2),
      y: Math.max(0, (imageSize.height * scale - PREVIEW_SIZE) / 2),
    }
  }

  function clamp(next: { x: number; y: number }, nextZoom = zoom) {
    const max = limits(nextZoom)
    return {
      x: Math.max(-max.x, Math.min(max.x, next.x)),
      y: Math.max(-max.y, Math.min(max.y, next.y)),
    }
  }

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0]
    if (!nextFile) return
    try {
      validateProfilePhotoFile(nextFile)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(URL.createObjectURL(nextFile))
      setFile(nextFile)
      setImageSize(null)
      setZoom(1)
      setOffset({ x: 0, y: 0 })
      setError('')
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : 'Não foi possível abrir esta foto.')
      setFile(null)
      setPreviewUrl('')
      setImageSize(null)
      setZoom(1)
      setOffset({ x: 0, y: 0 })
      event.target.value = ''
    }
  }

  function previewFailed() {
    setError('Este formato não pode ser exibido neste navegador. Tente uma foto JPG, PNG ou WebP.')
    setFile(null)
    setPreviewUrl('')
    setImageSize(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  function updateZoom(value: number) {
    setZoom(value)
    setOffset((current) => clamp(current, value))
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (!file) return
    dragRef.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function drag(event: PointerEvent<HTMLDivElement>) {
    const start = dragRef.current
    if (!start) return
    setOffset(clamp({ x: start.offsetX + event.clientX - start.x, y: start.offsetY + event.clientY - start.y }))
  }

  const scale = imageSize ? Math.max(PREVIEW_SIZE / imageSize.width, PREVIEW_SIZE / imageSize.height) * zoom : 1

  return (
    <div className="field profile-photo-field">
      <span>Foto de perfil{required ? ' *' : ''}</span>
      <div className="profile-photo-editor">
        <div className="profile-photo-shell">
          <div
            className={`profile-photo-preview${file ? ' has-photo' : ''}`}
            onPointerDown={startDrag}
            onPointerMove={drag}
            onPointerUp={() => { dragRef.current = null }}
            onPointerCancel={() => { dragRef.current = null }}
            aria-label={file ? 'Prévia da foto. Arraste para ajustar o enquadramento.' : initialPhoto ? 'Foto de perfil atual' : 'Nenhuma foto selecionada'}
          >
            {previewUrl ? <img src={previewUrl} alt="Prévia da foto de perfil" draggable={false} onLoad={(event) => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={previewFailed} style={imageSize ? { width: imageSize.width * scale, height: imageSize.height * scale, left: `calc(50% + ${offset.x}px)`, top: `calc(50% + ${offset.y}px)` } : undefined} /> : initialPhoto ? <img className="profile-photo-current" src={initialPhoto} alt="Foto de perfil atual" draggable={false} /> : <UserRound size={52} aria-hidden="true" />}
          </div>
          <span className="profile-photo-camera"><Camera size={17} aria-hidden="true" /></span>
        </div>
        <div className="profile-photo-controls">
          <input ref={inputRef} className="sr-only" type="file" accept="image/*,.jpg,.jpeg,.png,.webp,.heic,.heif" onChange={choosePhoto} aria-label="Escolher foto de perfil" />
          <button className="button secondary small" type="button" onClick={() => inputRef.current?.click()}><Camera size={17} />{file || initialPhoto ? 'Trocar foto' : 'Escolher foto'}</button>
          {file && <label className="profile-photo-zoom"><span>Zoom</span><span className="profile-photo-slider"><Minus size={15} aria-hidden="true" /><input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => updateZoom(Number(event.target.value))} aria-label="Zoom da foto" /><Plus size={15} aria-hidden="true" /></span></label>}
          <small>{file ? 'Arraste a imagem para ajustar o enquadramento.' : initialPhoto ? 'Escolha outra imagem para substituir a foto atual.' : 'JPG, PNG, WebP ou imagem do celular, até 12 MB.'}</small>
          {error && <small className="profile-photo-error" role="alert">{error}</small>}
        </div>
      </div>
    </div>
  )
}
