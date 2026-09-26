// English strings, kept in sync with tr.ts by type. Only strings are fully mirrored; switch
// `t` in i18n/index.ts to use it. Narrative templates fall back to Turkish until needed.
import { tr, type Messages } from './tr'

export const en: Messages = {
  ...tr,
  app: { name: 'AKYA', tagline: 'Base Security Decision Support' },
  nav: { overview: 'Overview', map: 'Field Map', watch: 'Watch', admin: 'Admin' },
  auth: {
    title: 'Sign in',
    subtitle: 'Sign in with your account to continue.',
    username: 'Username',
    password: 'Password',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    submit: 'Sign in',
    submitting: 'Signing in…',
    invalid: 'Wrong username or password.',
    failed: 'Sign-in is unavailable right now. Try again.',
    demoAccounts: 'Demo accounts',
    demoHint: 'Click an account to fill the form.',
    roles: { admin: 'Admin', user: 'User' },
    logout: 'Sign out',
    forbiddenTitle: 'You do not have access to this page',
    forbiddenBody: 'Only admin accounts can open this page.',
    backHome: 'Back to home',
    heroTitle: 'Watch the base perimeter from one screen',
    heroBody: 'The agent fuses drone frames, vehicle tracks and field reports and ranks them by risk.',
  },
  admin: { title: 'Admin panel', comingSoon: 'The admin panel will live here soon.' },
} as unknown as Messages
