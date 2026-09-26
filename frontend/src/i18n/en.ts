// English strings, kept in sync with tr.ts by type. Only strings are fully mirrored; switch
// `t` in i18n/index.ts to use it. Narrative templates fall back to Turkish until needed.
import { tr, type Messages } from './tr'

export const en: Messages = {
  ...tr,
  app: { name: 'AKYA', tagline: 'Base Security Decision Support' },
  nav: { overview: 'Overview', map: 'Field Map', watch: 'Watch' },
} as unknown as Messages
