/**
 * Every label the factory side shows, in one place.
 *
 * English only for now (Keenan, 2026-11-25). Kept as one object so a Mandarin
 * copy can sit beside it and a language switch picks between them — nothing on
 * the factory pages writes its own wording. Text people TYPE (notes, team
 * names) is never translated.
 */
export const FACTORY_TEXT = {
  brand: 'Powerplay Customs · Factory',
  jobs: 'Jobs',
  signOut: 'Sign out',
  todo: 'To do',
  todoEmpty: 'Nothing needs you right now.',
  whatsNew: "What's new from Powerplay",
  whatsNewEmpty: 'No changes yet.',
  newBadge: 'New',
  noJobs: 'No jobs have been sent yet. They appear here the moment Powerplay sends one.',
  step: 'Step',
  due: 'Powerplay needs it by',
  yourDate: 'Your finish date',
  open: 'Open',
  progress: "Where it's at",
  waitingApproval: 'Waiting for Powerplay to approve',
  tracking: 'Tracking number',
  backToJobs: '← All jobs',
  sheet: 'Production sheet',
} as const;
