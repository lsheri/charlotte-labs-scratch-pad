import * as React from 'react'
import { Text } from '@react-email/components'
import { Button, EmailLayout, styles } from './_layout'
import type { TemplateEntry } from './registry'

interface Props {
  firstName?: string
  sessionName?: string
  completedAt?: string
  tools?: string
  receiptUrl?: string
}

const ParticipantSessionComplete = ({
  firstName,
  sessionName = 'Your session',
  completedAt,
  tools,
  receiptUrl = 'https://platform.charlotte-labs.com/participant',
}: Props) => (
  <EmailLayout
    preview="Your contribution has been recorded."
    variant="participant"
  >
    <Text style={styles.h1}>Session received — thank you</Text>
    <Text style={styles.text}>Hi {firstName || 'there'},</Text>
    <Text style={styles.text}>
      Your AI collaboration session has been received and your receipt has been
      generated.
    </Text>
    <Text style={styles.small}>— Session: {sessionName}</Text>
    {completedAt && <Text style={styles.small}>— Completed: {completedAt}</Text>}
    {tools && <Text style={styles.small}>— Tools captured: {tools}</Text>}
    <Text style={styles.text}>
      Your session data will be reviewed by the research team in anonymized
      form. You can view your own receipt in your dashboard — it’s yours to
      keep.
    </Text>
    <Button href={receiptUrl}>View your receipt</Button>
  </EmailLayout>
)

export const template = {
  component: ParticipantSessionComplete,
  subject: 'Session received — thank you',
  displayName: 'Participant: session complete',
  previewData: {
    firstName: 'Jane',
    sessionName: 'Session 02',
    completedAt: 'May 7, 2026',
    tools: 'ChatGPT, Claude',
  },
} satisfies TemplateEntry
