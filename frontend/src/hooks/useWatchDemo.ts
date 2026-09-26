import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { getRecording, getRecordings } from '@/api/endpoints'
import { buildDemoModel } from '@/lib/watchDemo'

const STATIC = { retry: false, staleTime: Infinity } as const

/** Recorded watch runs and the selected one, indexed by tick. */
export function useWatchDemo(recordingId: string | null) {
  const list = useQuery({ queryKey: ['watch-recordings'], queryFn: getRecordings, ...STATIC })
  const id = recordingId ?? list.data?.[0]?.recording_id ?? null
  const events = useQuery({
    queryKey: ['watch-recording', id],
    queryFn: () => getRecording(id ?? ''),
    enabled: id !== null,
    ...STATIC,
  })
  const model = useMemo(() => (events.data ? buildDemoModel(events.data) : undefined), [events.data])
  return {
    recordings: list.data,
    recordingId: id,
    model,
    isPending: list.isPending || (id !== null && events.isPending),
    isError: list.isError || events.isError,
    isEmpty: list.data?.length === 0,
  }
}
