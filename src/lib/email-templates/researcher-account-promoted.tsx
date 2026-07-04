import * as React from 'react'
import { Text } from '@react-email/components'
import { Button, EmailLayout, styles } from './_layout'
import type { TemplateEntry } from './registry'

interface Props {
  firstName?: string
  researcherUrl?: string
}

const ResearcherAccountPromoted = ({
  firstName,
  researcherUrl = 'https://platform.charlotte-labs.com/researcher',
}: Props) => (
  <EmailLayout
    preview="Your account now has researcher access on the Charlotte platform."
    variant="researcher"
  >
    <Text style={styles.h1}>You now have researcher access</Text>
    <Text style={styles.text}>Hi {firstName || 'there'},</Text>
    <Text style={styles.text}>
      Your Charlotte account has been upgraded with researcher access. You can
      now create studies, invite participants, and view aggregate, anonymized
      study data alongside your existing participant access.
    </Text>
    <Button href={researcherUrl}>Open researcher dashboard</Button>
  </EmailLayout>
)

export const template = {
  component: ResearcherAccountPromoted,
  subject: 'You now have researcher access',
  displayName: 'Researcher: account promoted',
  previewData: { firstName: 'Alex' },
} satisfies TemplateEntry
