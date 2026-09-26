import { FileText } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import type { FieldReport } from '@/api/types'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'

interface Props {
  report: FieldReport
  /** Shown next to the chip: why it was forwarded, which vehicles it is about. */
  detail?: ReactNode
  className?: string
}

/** A field report a watcher passed on: id, source and time; a click shows its untrusted text. */
export function ReportRef({ report, detail, className }: Props) {
  const r = t.watch.report
  const [open, setOpen] = useState(false)
  const official = report.source === 'official'
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={cn(
            'inline-flex items-center gap-1 rounded border px-1 font-mono text-[11px] hover:bg-muted',
            official ? 'border-violet-500/40 text-violet-700' : 'border-slate-400/50 text-slate-600',
          )}
        >
          <FileText aria-hidden className="size-3" />
          {report.report_id} · {r.source[report.source] ?? report.source} · {report.time}
        </button>
        {detail}
      </p>
      {open && (
        <blockquote className="rounded border-l-2 border-muted-foreground/30 bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
          <span className="mb-0.5 block text-[10px] tracking-wider uppercase">{r.untrusted}</span>
          {report.text}
        </blockquote>
      )}
    </div>
  )
}
