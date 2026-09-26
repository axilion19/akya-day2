import type { AgentTuning, Tier, TuningView } from '@/api/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { t } from '@/i18n'
import { getAt, type SectionDef } from '@/lib/tuningFields'
import type { FieldErrors } from './AdminEditor'
import { NumberField } from './NumberField'
import { TierTable } from './TierTable'

interface Props {
  section: SectionDef
  draft: AgentTuning
  view: TuningView
  errors: FieldErrors
  onChange: (path: string, value: unknown) => void
  onInvalid: (key: string, invalid: boolean) => void
}

/** One pipeline step's thresholds (spec §4, cards 1-5). */
export function RuleSection({ section, draft, view, errors, onChange, onInvalid }: Props) {
  const copy = t.admin.sections[section.id]
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{copy.title}</CardTitle>
        <CardDescription>{copy.body}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {section.tiers.map((def) => (
          <TierTable
            key={def.path}
            def={def}
            tiers={getAt(draft, def.path) as Tier[]}
            defaults={getAt(view.defaults, def.path) as Tier[]}
            error={errors[def.path]}
            onChange={(tiers) => onChange(def.path, tiers)}
            onInvalid={onInvalid}
          />
        ))}
        <div className="divide-y">
          {section.fields.map((field) => {
            const knob = field.path.startsWith('agents.') ? field.path.slice('agents.'.length) : null
            return (
              <NumberField
                key={field.path}
                label={t.admin.fields[field.path] ?? field.path}
                unit={field.unit}
                nullable={field.nullable}
                integer={field.integer}
                value={getAt(draft, field.path) as number | null}
                defaultValue={getAt(view.defaults, field.path) as number | null}
                envValue={knob ? (getAt(view.env_knobs, knob) as number) : undefined}
                error={errors[field.path]}
                onChange={(v) => onChange(field.path, v)}
                onInvalid={(bad) => onInvalid(field.path, bad)}
              />
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
