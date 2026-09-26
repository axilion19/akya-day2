// Presentation metadata for the admin tuning form: which fields, in which order, with which unit.
// Values, defaults and validation come from the API; nothing here decides a risk level.
import type { AgentTuning, PromptName } from '@/api/types'

export type Unit = 'm' | 'ms' | 'deg' | 'min' | 'pts' | 'count' | 'mpm'
export type SectionId = 'behavior' | 'groups' | 'rubric' | 'ceiling' | 'judgment'
export interface FieldDef {
  path: string
  unit: Unit
  nullable?: boolean
  integer?: boolean
}
export interface TierDef {
  path: 'rubric.distance_tiers' | 'rubric.approach_rate_tiers'
  unit: Unit
}
export interface SectionDef {
  id: SectionId
  fields: FieldDef[]
  tiers: TierDef[]
}

// Points and counts are integers in the backend model; everything else is a float.
const f = (path: string, unit: Unit, nullable = false): FieldDef => ({
  path,
  unit,
  nullable,
  integer: unit === 'pts' || unit === 'count',
})

export const SECTIONS: SectionDef[] = [
  {
    id: 'behavior',
    tiers: [],
    fields: [
      f('behavior.loop_sweep_deg', 'deg'),
      f('behavior.orbit_min_path_m', 'm'),
      f('behavior.orbit_max_range_m', 'm'),
      f('behavior.parked_max_path_m', 'm'),
      f('behavior.leaving_start_m', 'm'),
      f('behavior.leaving_gain_m', 'm'),
      f('behavior.approach_gain_m', 'm'),
    ],
  },
  {
    id: 'groups',
    tiers: [],
    fields: [
      f('groups.large_group', 'count'),
      f('groups.group_radius_m', 'm'),
      f('groups.group_min_move_m', 'm'),
    ],
  },
  {
    id: 'rubric',
    tiers: [
      { path: 'rubric.distance_tiers', unit: 'm' },
      { path: 'rubric.approach_rate_tiers', unit: 'mpm' },
    ],
    fields: [
      f('rubric.pattern_points.loops_around_base', 'pts'),
      f('rubric.pattern_points.fixed_range_orbit', 'pts'),
      f('rubric.group_points', 'pts'),
      f('rubric.heading_points', 'pts'),
      f('rubric.heading_tolerance_deg', 'deg'),
      f('rubric.long_stop_min', 'min'),
      f('rubric.stop_near_base_m', 'm'),
      f('rubric.stop_points_first', 'pts'),
      f('rubric.stop_points_extra', 'pts'),
      f('rubric.type_points.truck', 'pts'),
      f('rubric.type_points.bus', 'pts'),
      f('rubric.type_points.van', 'pts'),
      f('rubric.level_step', 'pts'),
    ],
  },
  {
    id: 'ceiling',
    tiers: [],
    fields: [
      f('ceiling.at_base_m', 'm'),
      f('ceiling.pattern_high_m', 'm'),
      f('ceiling.approach_heading_deg', 'deg'),
      f('ceiling.approach_high_m', 'm'),
      f('ceiling.approach_high_eta_min', 'min'),
      f('ceiling.approach_medium_ms', 'ms'),
      f('ceiling.approach_medium_m', 'm'),
      f('ceiling.approach_medium_eta_min', 'min'),
    ],
  },
  {
    id: 'judgment',
    tiers: [],
    fields: [f('judgment.closing_min_m_per_min', 'mpm'), f('agents.watcher_spot_checks', 'count', true)],
  },
]

export const AGENT_FIELDS: Record<PromptName, FieldDef[]> = {
  watcher: [f('agents.watcher_max_tool_calls', 'count', true)],
  supervisor: [f('agents.supervisor_max_tool_calls', 'count', true)],
}

export function getAt(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined),
    obj,
  )
}

export function setAt<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.')
  const node = (obj ?? {}) as Record<string, unknown>
  if (head === undefined) return obj
  return { ...node, [head]: rest.length ? setAt(node[head], rest.join('.'), value) : value } as T
}

const LEAF_PATHS: string[] = [
  ...SECTIONS.flatMap((s) => [...s.fields.map((x) => x.path), ...s.tiers.map((x) => x.path)]),
  ...Object.values(AGENT_FIELDS).flatMap((fs) => fs.map((x) => x.path)),
  'agents.watcher_reasoning_effort',
  'agents.supervisor_reasoning_effort',
  'agents.brief_language',
  'prompts.watcher',
  'prompts.supervisor',
]

/** Leaf paths whose values differ between two tunings. */
export function changedPaths(a: AgentTuning, b: AgentTuning): string[] {
  return LEAF_PATHS.filter((p) => JSON.stringify(getAt(a, p)) !== JSON.stringify(getAt(b, p)))
}

/** "path: code arg; path: code" (backend tuning_problems) -> { path: { code, arg } }. */
export function parseProblems(detail: string): Record<string, { code: string; arg: string }> {
  const out: Record<string, { code: string; arg: string }> = {}
  for (const part of detail.split('; ')) {
    const [path, rest = ''] = part.split(': ')
    if (!path) continue
    const [code = '', ...args] = rest.split(' ')
    out[path] = { code, arg: args.join(' ') }
  }
  return out
}
