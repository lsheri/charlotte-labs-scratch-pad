import * as React from 'react'
import { Text } from '@react-email/components'
import { Button, EmailLayout, IRBCallout, styles } from './_layout'
import type { TemplateEntry } from './registry'

interface Props {
  firstName?: string
  studyName?: string
  enrollUrl?: string
}

const ParticipantStudyInvitation = ({
  firstName,
  studyName = 'an AI collaboration study',
  enrollUrl = 'https://platform.charlotte-labs.com',
}: Props) => (
  <EmailLayout
    preview="You’re invited to take part in a Charlotte Labs research study"
    variant="participant"
  >
    <Text style={styles.h1}>You’re invited to take part in a study</Text>
    <Text style={styles.text}>Hi {firstName || 'there'},</Text>
    <Text style={styles.text}>
      You’re being invited to take part in {studyName}. The research team is
      studying how people collaborate with generative AI in real work and
      learning.
    </Text>
    <IRBCallout>
      <Text style={styles.calloutText}>
        ⚑ Participation is completely voluntary. Choosing not to participate
        will not affect your grades, employment, or any professional or
        academic relationship.
      </Text>
    </IRBCallout>
    <Text style={styles.text}>
      You can read the full study description and decide whether to enroll.
    </Text>
    <Button href={enrollUrl}>Read study details &amp; enroll</Button>
  </EmailLayout>
)

export const template = {
  component: ParticipantStudyInvitation,
  subject: 'You’re invited to take part in a Charlotte Labs study',
  displayName: 'Participant: study invitation',
  previewData: {
    firstName: 'Jane',
    studyName: 'the AI Collaboration Study',
    enrollUrl: 'https://platform.charlotte-labs.com/enroll',
  },
} satisfies TemplateEntry
