import * as React from 'react'
import { Text } from '@react-email/components'
import { Button, EmailLayout, styles } from './_layout'
import type { TemplateEntry } from './registry'

interface Props {
  firstName?: string
  studyName?: string
  totalSessions?: number
  fullCompleters?: number
  totalParticipants?: number
  partialCompleters?: number
  dashboardUrl?: string
}

const ResearcherStudyClosed = ({
  firstName,
  studyName = 'Your study',
  totalSessions = 0,
  fullCompleters = 0,
  totalParticipants = 0,
  partialCompleters = 0,
  dashboardUrl = 'https://platform.charlotte-labs.com/researcher',
}: Props) => (
  <EmailLayout
    preview="The session window has closed. Your dataset is ready."
    variant="researcher"
  >
    <Text style={styles.h1}>{studyName} — session window closed</Text>
    <Text style={styles.text}>Hi {firstName || 'there'},</Text>
    <Text style={styles.text}>
      The session window for {studyName} has closed.
    </Text>
    <Text style={styles.small}>— Total sessions collected: {totalSessions}</Text>
    <Text style={styles.small}>
      — Participants who completed all sessions: {fullCompleters} of {totalParticipants}
    </Text>
    <Text style={styles.small}>— Partial completers: {partialCompleters}</Text>
    <Text style={styles.text}>
      Your anonymized session dataset and aggregate receipt analytics are now
      available in your research dashboard. Participant accounts remain active
      and participants retain access to their own receipts.
    </Text>
    <Button href={dashboardUrl}>View &amp; export study data</Button>
  </EmailLayout>
)

export const template = {
  component: ResearcherStudyClosed,
  subject: (data: Record<string, any>) =>
    `${data.studyName ?? 'Your study'} — session window closed`,
  displayName: 'Researcher: study closed',
  previewData: {
    firstName: 'Alex',
    studyName: 'AI Collaboration Pilot',
    totalSessions: 184,
    fullCompleters: 38,
    totalParticipants: 42,
    partialCompleters: 4,
  },
} satisfies TemplateEntry
