import * as React from 'react'
import { Text } from '@react-email/components'
import { Button, EmailLayout, styles } from './_layout'
import type { TemplateEntry } from './registry'

interface Props {
  firstName?: string
  studyName?: string
  weekOf?: string
  enrolled?: number
  sessionsThisWeek?: number
  sessionsTotal?: number
  sessionsTarget?: number
  studyCloseDate?: string
  daysRemaining?: number
  dashboardUrl?: string
}

const ResearcherWeeklyProgress = ({
  firstName,
  studyName = 'Your study',
  weekOf = 'this week',
  enrolled = 0,
  sessionsThisWeek = 0,
  sessionsTotal = 0,
  sessionsTarget = 0,
  studyCloseDate = 'TBD',
  daysRemaining = 0,
  dashboardUrl = 'https://platform.charlotte-labs.com/researcher',
}: Props) => (
  <EmailLayout
    preview={`${sessionsThisWeek} sessions completed this week. Study closes in ${daysRemaining} days.`}
    variant="researcher"
  >
    <Text style={styles.h1}>{studyName} — study progress</Text>
    <Text style={styles.text}>Hi {firstName || 'there'},</Text>
    <Text style={styles.text}>
      Here’s your weekly progress update for {studyName}, week of {weekOf}.
    </Text>
    <Text style={styles.small}>— Total participants enrolled: {enrolled}</Text>
    <Text style={styles.small}>
      — Sessions completed this week: {sessionsThisWeek}
    </Text>
    <Text style={styles.small}>
      — Total sessions completed to date: {sessionsTotal} of {sessionsTarget} target
    </Text>
    <Text style={styles.small}>
      — Study closes: {studyCloseDate} ({daysRemaining} days remaining)
    </Text>
    <Text style={styles.text}>
      No individual participant data is included in this summary. Full session
      receipts and aggregate analytics are available in your research
      dashboard.
    </Text>
    <Button href={dashboardUrl}>View research dashboard</Button>
  </EmailLayout>
)

export const template = {
  component: ResearcherWeeklyProgress,
  subject: (data: Record<string, any>) =>
    `${data.studyName ?? 'Your study'} — Study Progress, Week of ${data.weekOf ?? 'this week'}`,
  displayName: 'Researcher: weekly progress',
  previewData: {
    firstName: 'Alex',
    studyName: 'AI Collaboration Pilot',
    weekOf: 'May 5',
    enrolled: 42,
    sessionsThisWeek: 18,
    sessionsTotal: 96,
    sessionsTarget: 200,
    studyCloseDate: 'May 30, 2026',
    daysRemaining: 23,
  },
} satisfies TemplateEntry
