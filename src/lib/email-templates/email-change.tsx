import * as React from 'react'
import { Link, Text } from '@react-email/components'
import { Button, EmailLayout, styles } from './_layout'

interface EmailChangeEmailProps {
  siteName: string
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <EmailLayout preview="Confirm your new email for the Charlotte research platform" variant="auth">
    <Text style={styles.h1}>Confirm your new email</Text>
    <Text style={styles.text}>
      You requested to change your account email from{' '}
      <Link href={`mailto:${oldEmail}`} style={styles.link}>
        {oldEmail}
      </Link>{' '}
      to{' '}
      <Link href={`mailto:${newEmail}`} style={styles.link}>
        {newEmail}
      </Link>
      .
    </Text>
    <Button href={confirmationUrl}>Confirm change</Button>
    <Text style={styles.small}>
      If you didn’t request this, please secure your account.
    </Text>
  </EmailLayout>
)

export default EmailChangeEmail
