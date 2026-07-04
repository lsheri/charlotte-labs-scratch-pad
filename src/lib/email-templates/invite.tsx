import * as React from 'react'
import { Text } from '@react-email/components'
import { Button, EmailLayout, styles } from './_layout'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ confirmationUrl }: InviteEmailProps) => (
  <EmailLayout preview="You’ve been invited to the Charlotte research platform" variant="auth">
    <Text style={styles.h1}>You’ve been invited</Text>
    <Text style={styles.text}>
      You’ve been invited to join the Charlotte research platform. Accept the
      invitation to create your account.
    </Text>
    <Button href={confirmationUrl}>Accept invitation</Button>
    <Text style={styles.small}>
      Participation in any associated study is voluntary. If this wasn’t
      expected, you can ignore this email.
    </Text>
  </EmailLayout>
)

export default InviteEmail
