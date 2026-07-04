import * as React from 'react'
import { Text } from '@react-email/components'
import { Button, EmailLayout, IRBCallout, styles } from './_layout'
import type { TemplateEntry } from './registry'

interface Props {
  firstName?: string
  studyCloseDate?: string
  dashboardUrl?: string
}

const ParticipantSessionReminder = ({
  firstName,
  studyCloseDate = 'the close of the study',
  dashboardUrl = 'https://platform.charlotte-labs.com/participant',
}: Props) => (
  <EmailLayout
    preview="When you’re working with an AI tool, that’s a good time to log a session."
    variant="participant"
  >
    <Text style={styles.h1}>A friendly note about your study sessions</Text>
    <Text style={styles.text}>Hi {firstName || 'there'},</Text>
    <Text style={styles.text}>
      Just a note that your next study session is available on the Charlotte
      research platform.
    </Text>
    <Text style={styles.text}>
      When you have 10–15 minutes and you’re working on something that involves
      an AI tool, that’s a good time to log a session.
    </Text>
    <Text style={styles.text}>
      Sessions are open until {studyCloseDate}. There’s no set schedule — just
      work the way you normally would.
    </Text>
    <IRBCallout>
      <Text style={styles.calloutText}>
        ⚑ As always, participation is voluntary. If you’d prefer not to
        continue, you can withdraw at any time with no consequences.
      </Text>
    </IRBCallout>
    <Button href={dashboardUrl}>Open your study dashboard</Button>
  </EmailLayout>
)

export const template = {
  component: ParticipantSessionReminder,
  subject: 'A note from the Charlotte research platform',
  displayName: 'Participant: session reminder',
  previewData: { firstName: 'Jane', studyCloseDate: 'May 30' },
} satisfies TemplateEntry
