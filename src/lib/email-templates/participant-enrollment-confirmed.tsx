import * as React from 'react'
import { Text } from '@react-email/components'
import { Button, EmailLayout, IRBCallout, styles } from './_layout'
import type { TemplateEntry } from './registry'

interface Props {
  firstName?: string
  dashboardUrl?: string
}

const ParticipantEnrollmentConfirmed = ({
  firstName,
  dashboardUrl = 'https://platform.charlotte-labs.com/participant',
}: Props) => (
  <EmailLayout
    preview="Your consent is confirmed. Here’s how the study works."
    variant="participant"
  >
    <Text style={styles.h1}>You’re enrolled — here’s what happens next</Text>
    <Text style={styles.text}>Hi {firstName || 'there'},</Text>
    <Text style={styles.text}>
      Thank you for enrolling in the AI collaboration study. Your electronic
      consent has been recorded.
    </Text>
    <IRBCallout>
      <Text style={styles.calloutText}>
        ⚑ A few things to keep in mind as you participate:
      </Text>
      <Text style={styles.calloutText}>
        — Participation is voluntary. You can withdraw at any time without
        penalty.
      </Text>
      <Text style={styles.calloutText}>
        — Your session data will be anonymized before the research team reviews
        it.
      </Text>
      <Text style={styles.calloutText}>
        — This study is not connected to any grading or performance evaluation.
      </Text>
      <Text style={styles.calloutText}>
        — You can contact the research team at any time with questions.
      </Text>
    </IRBCallout>
    <Button href={dashboardUrl}>Open your study dashboard</Button>
  </EmailLayout>
)

export const template = {
  component: ParticipantEnrollmentConfirmed,
  subject: 'You’re enrolled — here’s what happens next',
  displayName: 'Participant: enrollment confirmed',
  previewData: { firstName: 'Jane' },
} satisfies TemplateEntry
