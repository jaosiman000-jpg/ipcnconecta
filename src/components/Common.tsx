import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Check, ChevronDown, Search, Upload, X } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export function CustomSelect({ name, label, options, value, defaultValue = '', onChange }: {
  name?: string
  label: string
  options: readonly SelectOption[]
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
}) {
  const [internalValue, setInternalValue] = useState(defaultValue)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 220, maxHeight: 280 })
  const selectedValue = value ?? internalValue
  const selectedLabel = options.find((option) => option.value === selectedValue)?.label ?? 'Selecione'

  function toggleMenu() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const width = Math.max(rect.width, 220)
      const estimatedHeight = Math.min(options.length * 42 + 12, window.innerHeight - 24)
      const spaceBelow = window.innerHeight - rect.bottom - 12
      const spaceAbove = rect.top - 12
      const opensBelow = spaceBelow >= Math.min(estimatedHeight, 240) || spaceBelow >= spaceAbove
      const availableHeight = Math.max(140, opensBelow ? spaceBelow - 7 : spaceAbove - 7)
      const maxHeight = Math.min(estimatedHeight, availableHeight)
      const top = opensBelow ? rect.bottom + 7 : Math.max(12, rect.top - maxHeight - 7)
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))
      setMenuPosition({ top, left, width, maxHeight })
    }
    setOpen((current) => !current)
  }

  function selectOption(option: SelectOption) {
    if (option.disabled) return
    if (value === undefined) setInternalValue(option.value)
    onChange?.(option.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return

    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    function closeOnScroll(event: Event) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }

    const closeOnResize = () => setOpen(false)
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', closeOnResize)
    window.addEventListener('scroll', closeOnScroll, true)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', closeOnResize)
      window.removeEventListener('scroll', closeOnScroll, true)
    }
  }, [open])

  return (
    <div className="compact-select" ref={rootRef}>
      {name && <input type="hidden" name={name} value={selectedValue} />}
      <button ref={triggerRef} className="compact-select-trigger" type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}. Selecionado: ${selectedLabel}`} onClick={toggleMenu}>
        <span>{selectedLabel}</span><ChevronDown size={18} aria-hidden="true" />
      </button>
      {open && <div ref={menuRef} className="compact-select-menu" role="listbox" aria-label={label} style={menuPosition}>
        {options.map((option) => <button key={option.value} type="button" role="option" aria-selected={selectedValue === option.value} disabled={option.disabled} onClick={() => selectOption(option)}><span className="compact-select-check">{selectedValue === option.value && <Check size={17} aria-hidden="true" />}</span><span>{option.label}</span></button>)}
      </div>}
    </div>
  )
}

export function PageHeader({ eyebrow, title, description, actions }: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

export function StatCard({ label, value, helper, icon }: { label: string; value: string | number; helper: string; icon: ReactNode }) {
  return (
    <article className="stat-card">
      <span className="stat-icon" aria-hidden="true">{icon}</span>
      <div><p>{label}</p><strong>{value}</strong><small>{helper}</small></div>
    </article>
  )
}

export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }) {
  return <span className={`status status-${tone}`}>{children}</span>
}

export function SearchField({ value, onChange, placeholder = 'Buscar...' }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="search-field">
      <Search size={18} aria-hidden="true" />
      <span className="sr-only">Buscar</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  )
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="empty-state"><strong>{title}</strong><p>{description}</p></div>
}

export function Modal({ title, description, open, onClose, children, wide = false, className = '' }: {
  title: string
  description?: string
  open: boolean
  onClose: () => void
  children: ReactNode
  wide?: boolean
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog ref={ref} className={`${wide ? 'modal modal-wide' : 'modal'}${className ? ` ${className}` : ''}`} onCancel={onClose} onClose={onClose}>
      <div className="modal-header">
        <div><h2>{title}</h2>{description && <p>{description}</p>}</div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
      </div>
      {children}
    </dialog>
  )
}

export function Field({ label, children, hint, className = '' }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return <label className={`field${className ? ` ${className}` : ''}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

export function FileUploadField({ label, name, accept, required = false, disabled = false, hint, emptyTitle = 'Selecionar arquivo', emptyDescription = 'Escolha um arquivo no computador', disabledTitle = 'Envio de arquivos em configuração', disabledDescription = 'O cadastro pode ser salvo sem o anexo.', resetKey }: {
  label: string
  name: string
  accept?: string
  required?: boolean
  disabled?: boolean
  hint?: string
  emptyTitle?: string
  emptyDescription?: string
  disabledTitle?: string
  disabledDescription?: string
  resetKey?: string | number | boolean
}) {
  const [fileName, setFileName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setFileName('')
    if (inputRef.current) inputRef.current.value = ''
  }, [resetKey])

  return (
    <div className="field file-upload-field">
      <span>{label}</span>
      <label className={`document-upload${disabled ? ' is-disabled' : ''}`}>
        <input ref={inputRef} name={name} type="file" accept={accept} required={required} disabled={disabled} aria-label={label} onChange={(event) => setFileName(event.target.files?.[0]?.name ?? '')} />
        <span className="document-upload-icon"><Upload size={21} aria-hidden="true" /></span>
        <span className="document-upload-copy"><strong>{disabled ? disabledTitle : fileName || emptyTitle}</strong><small>{disabled ? disabledDescription : fileName ? 'Arquivo pronto para ser anexado' : emptyDescription}</small></span>
        <span className="document-upload-action">{disabled ? 'Indisponível' : 'Escolher arquivo'}</span>
      </label>
      {hint && <small>{hint}</small>}
    </div>
  )
}

export function FormActions({ onCancel, submitLabel = 'Salvar', disabled = false }: { onCancel: () => void; submitLabel?: string; disabled?: boolean }) {
  return <div className="form-actions"><button className="button secondary" type="button" onClick={onCancel} disabled={disabled}>Cancelar</button><button className="button primary" type="submit" disabled={disabled}>{submitLabel}</button></div>
}

export function ConfirmButton({ children, message, onConfirm, className = 'button danger-subtle' }: {
  children: ReactNode
  message: string
  onConfirm: () => void
  className?: string
}) {
  return <button type="button" className={className} onClick={() => { if (window.confirm(message)) onConfirm() }}>{children}</button>
}

export function stopInvalidSubmit(event: FormEvent<HTMLFormElement>) {
  if (!event.currentTarget.checkValidity()) event.preventDefault()
}
