import * as React from 'react'
import { Text } from '@react-email/components'
import { Button, EmailLayout, styles } from './_layout'
import type { TemplateEntry } from './registry'

interface Props {
  firstName?: string
  receiptsUrl?: string
}

const ParticipantStudyComplete = ({
  firstName,
  receiptsUrl = 'https://platform.charlotte-labs.com/participant',
}: Props) => (
  <EmailLayout
    preview="Thank you for your contribution. Here’s a summary of what we’re studying and why it matters."
    variant="participant"
  >
    <Text style={styles.h1}>You’ve completed the study — here’s what we learned</Text>
    <Text style={styles.text}>Hi {firstName || 'there'},</Text>
    <Text style={styles.text}>
      You’ve completed all your sessions in the AI collaboration study. Thank
      you — your contribution is genuinely valuable.
    </Text>
    <Text style={styles.text}>
      <strong>What this research is about:</strong> Charlotte and the
      University of Washington are studying how people collaborate with
      generative AI in learning and work contexts. Your sessions help us
      understand which patterns of AI collaboration are most associated with
      strong judgment, original thinking, and effective outcomes.
    </Text>
    <Text style={styles.text}>
      <strong>What happens with your data:</strong>
    </Text>
    <Text style={styles.small}>
      — Your session data is anonymized and analyzed as part of the broader
      dataset.
    </Text>
    <Text style={styles.small}>
      — No individual data will be reported in a way that could identify you.
    </Text>
    <Text style={styles.small}>
      — Aggregate findings will be shared through academic publication and with
      Charlotte’s educational partners.
    </Text>
    <Text style={styles.text}>
      Your receipts remain in your Charlotte account and belong to you.
    </Text>
    <Button href={receiptsUrl}>View your study receipts</Button>
  </EmailLayout>
)

export const template = {
  component: ParticipantStudyComplete,
  subject: 'You’ve completed the study — here’s what we learned',
  displayName: 'Participant: study complete',
  previewData: { firstName: 'Jane' },
} satisfies TemplateEntry
