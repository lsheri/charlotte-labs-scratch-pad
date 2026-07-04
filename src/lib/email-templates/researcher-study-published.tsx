import * as React from 'react'
import { Text } from '@react-email/components'
import { Button, EmailLayout, styles } from './_layout'
import type { TemplateEntry } from './registry'

interface Props {
  firstName?: string
  studyName?: string
  dashboardUrl?: string
}

const ResearcherStudyPublished = ({
  firstName,
  studyName = 'Your study',
  dashboardUrl = 'https://platform.charlotte-labs.com/researcher',
}: Props) => (
  <EmailLayout
    preview="Your study is now live and accepting participants."
    variant="researcher"
  >
    <Text style={styles.h1}>{studyName} is live</Text>
    <Text style={styles.text}>Hi {firstName || 'there'},</Text>
    <Text style={styles.text}>
      {studyName} has been published and is now live on the Charlotte research
      platform. Invitations sent by Charlotte Labs on your behalf are using the
      participant-facing language outlined in the brand guide.
    </Text>
    <Text style={styles.text}>
      You can monitor aggregate enrollment and session activity from your
      research dashboard.
    </Text>
    <Button href={dashboardUrl}>Open research dashboard</Button>
  </EmailLayout>
)

export const template = {
  component: ResearcherStudyPublished,
  subject: 'Your study is live',
  displayName: 'Researcher: study published',
  previewData: { firstName: 'Alex', studyName: 'AI Collaboration Pilot' },
} satisfies TemplateEntry
