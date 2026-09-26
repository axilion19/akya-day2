import { USE_MOCKS } from '@/api/client'
import type { ComponentStatus } from '@/api/types'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useHealth } from '@/hooks/useHealth'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'

function Dot({ label, status }: { label: string; status: ComponentStatus | null }) {
  const ok = status?.available ?? false
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden
            className={cn('size-2 rounded-full', ok ? 'bg-emerald-400' : 'bg-zinc-500')}
          />
          <span className="uppercase tracking-wide">{label}</span>
          <span className="sr-only">{ok ? t.status.online : t.status.offline}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{status?.detail ?? t.status.offline}</TooltipContent>
    </Tooltip>
  )
}

export function StatusIndicator() {
  const { data, isError } = useHealth()
  const api: ComponentStatus = isError
    ? { available: false, detail: t.status.offline }
    : { available: Boolean(data), detail: data ? `v${data.version}` : '…' }

  return (
    <div className="flex items-center gap-4">
      {USE_MOCKS && (
        <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700">
          {t.status.mock}
        </span>
      )}
      <Dot label={t.status.api} status={api} />
      <Dot label={t.status.llm} status={data?.llm ?? null} />
      <Dot label={t.status.detector} status={data?.detector ?? null} />
      <Dot label={t.status.data} status={data?.data ?? null} />
    </div>
  )
}
