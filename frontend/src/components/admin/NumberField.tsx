import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { t } from '@/i18n'
import { errorText, type Problem } from '@/lib/tuningErrors'
import type { Unit } from '@/lib/tuningFields'
import { cn } from '@/lib/utils'

interface Props {
  label: string
  unit: Unit
  value: number | null
  defaultValue: number | null
  envValue?: number
  nullable?: boolean
  error?: Problem
  onChange: (value: number | null) => void
  onInvalid: (invalid: boolean) => void
}

/** One number with unit, default hint, changed dot and reset; keeps invalid text locally. */
export function NumberField({ label, unit, value, defaultValue, envValue, nullable, error, onChange, onInvalid }: Props) {
  const [text, setText] = useState(value === null ? '' : String(value))
  const [shown, setShown] = useState(value)
  if (value !== shown) {
    // The value changed from outside (reset, revert): show it instead of the typed text.
    setShown(value)
    setText(value === null ? '' : String(value))
  }
  const changed = value !== defaultValue
  const localInvalid = text.trim() === '' ? !nullable : Number.isNaN(Number(text))
  const message = localInvalid ? t.admin.invalidNumber : errorText(error)
  const hint =
    nullable && envValue !== undefined
      ? t.admin.envValue(String(envValue))
      : t.admin.defaultValue(`${defaultValue ?? ''} ${t.admin.units[unit]}`)

  const handle = (next: string) => {
    setText(next)
    const empty = next.trim() === ''
    const n = Number(next)
    const bad = empty ? !nullable : Number.isNaN(n)
    onInvalid(bad)
    if (!bad) onChange(empty ? null : n)
  }

  return (
    <div className="grid grid-cols-[1fr_9rem_auto] items-center gap-x-3 gap-y-0.5 py-1.5">
      <label className="flex items-center gap-2 text-sm">
        <span className={cn('size-1.5 rounded-full', changed ? 'bg-primary' : 'bg-transparent')} aria-hidden />
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <Input
          inputMode="decimal"
          value={text}
          aria-label={label}
          aria-invalid={Boolean(message)}
          onChange={(e) => handle(e.target.value)}
          className={cn('h-8 font-mono text-right', message && 'border-destructive')}
        />
        <span className="w-8 text-xs text-muted-foreground">{t.admin.units[unit]}</span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label={t.admin.resetField}
        disabled={!changed}
        onClick={() => { onInvalid(false); onChange(defaultValue) }}
      >
        <RotateCcw className="size-3.5" />
      </Button>
      <span className="col-start-1 pl-3.5 text-xs text-muted-foreground">{hint}</span>
      {message && <span className="col-span-2 col-start-2 text-xs text-destructive">{message}</span>}
    </div>
  )
}
