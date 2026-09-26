import type { Tier } from '@/api/types'
import { t } from '@/i18n'
import type { TierDef } from '@/lib/tuningFields'
import { errorText } from '@/lib/tuningErrors'
import { NumberField } from './NumberField'

interface Props {
  def: TierDef
  tiers: Tier[]
  defaults: Tier[]
  error?: { code: string; arg: string }
  onChange: (tiers: Tier[]) => void
  onInvalid: (key: string, invalid: boolean) => void
}

/** Rubric tiers as rows: "<limit> -> <points>"; the tier count is fixed by the backend. */
export function TierTable({ def, tiers, defaults, error, onChange, onInvalid }: Props) {
  const labels = t.admin.tiers[def.path]
  const update = (i: number, patch: Partial<Tier>) =>
    onChange(tiers.map((tier, j) => (j === i ? { ...tier, ...patch } : tier)))
  return (
    <div className="rounded-md border p-3">
      <p className="text-sm font-medium">{labels.title}</p>
      {tiers.map((tier, i) => (
        <div key={i} className="grid grid-cols-2 gap-3">
          <NumberField
            label={`${labels.row} (${i + 1})`}
            unit={def.unit}
            value={tier.limit}
            defaultValue={defaults[i]?.limit ?? null}
            onChange={(v) => update(i, { limit: v ?? 0 })}
            onInvalid={(bad) => onInvalid(`${def.path}.${i}.limit`, bad)}
          />
          <NumberField
            label={t.admin.units.pts}
            unit="pts"
            integer
            value={tier.points}
            defaultValue={defaults[i]?.points ?? null}
            onChange={(v) => update(i, { points: Math.round(v ?? 0) })}
            onInvalid={(bad) => onInvalid(`${def.path}.${i}.points`, bad)}
          />
        </div>
      ))}
      {error && <p className="mt-1 text-xs text-destructive">{errorText(error)}</p>}
    </div>
  )
}
