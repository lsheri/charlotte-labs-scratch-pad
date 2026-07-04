import type { ComponentType } from 'react'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

import { template as participantStudyInvitation } from './participant-study-invitation'
import { template as participantEnrollmentConfirmed } from './participant-enrollment-confirmed'
import { template as participantSessionReminder } from './participant-session-reminder'
import { template as participantSessionComplete } from './participant-session-complete'
import { template as participantStudyComplete } from './participant-study-complete'
import { template as participantWithdrawalConfirmed } from './participant-withdrawal-confirmed'
import { template as researcherStudyPublished } from './researcher-study-published'
import { template as researcherWeeklyProgress } from './researcher-weekly-progress'
import { template as researcherStudyClosed } from './researcher-study-closed'
import { template as researcherAccountPromoted } from './researcher-account-promoted'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'participant-study-invitation': participantStudyInvitation,
  'participant-enrollment-confirmed': participantEnrollmentConfirmed,
  'participant-session-reminder': participantSessionReminder,
  'participant-session-complete': participantSessionComplete,
  'participant-study-complete': participantStudyComplete,
  'participant-withdrawal-confirmed': participantWithdrawalConfirmed,
  'researcher-study-published': researcherStudyPublished,
  'researcher-weekly-progress': researcherWeeklyProgress,
  'researcher-study-closed': researcherStudyClosed,
  'researcher-account-promoted': researcherAccountPromoted,
}
