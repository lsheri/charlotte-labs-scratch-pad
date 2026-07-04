import * as React from 'react'
import { Text } from '@react-email/components'
import { EmailLayout, styles } from './_layout'
import type { TemplateEntry } from './registry'

interface Props {
  firstName?: string
}

const ParticipantWithdrawalConfirmed = ({ firstName }: Props) => (
  <EmailLayout
    preview="Your withdrawal has been recorded."
    variant="participant"
  >
    <Text style={styles.h1}>Your withdrawal is confirmed</Text>
    <Text style={styles.text}>Hi {firstName || 'there'},</Text>
    <Text style={styles.text}>
      You have withdrawn from the study. You will not receive any further study
      emails. Thank you for the time you contributed.
    </Text>
    <Text style={styles.text}>
      Your account remains active and your existing receipts remain yours to
      keep in your Charlotte dashboard.
    </Text>
  </EmailLayout>
)

export const template = {
  component: ParticipantWithdrawalConfirmed,
  subject: 'Your withdrawal is confirmed',
  displayName: 'Participant: withdrawal confirmed',
  previewData: { firstName: 'Jane' },
} satisfies TemplateEntry
