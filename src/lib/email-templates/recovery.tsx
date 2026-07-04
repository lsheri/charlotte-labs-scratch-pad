import * as React from 'react'
import { Text } from '@react-email/components'
import { Button, EmailLayout, styles } from './_layout'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ confirmationUrl }: RecoveryEmailProps) => (
  <EmailLayout preview="Reset your password for the Charlotte research platform" variant="auth">
    <Text style={styles.h1}>Reset your password</Text>
    <Text style={styles.text}>
      We received a request to reset your password. Choose a new password using
      the button below.
    </Text>
    <Button href={confirmationUrl}>Reset password</Button>
    <Text style={styles.small}>
      If you didn’t request this, you can safely ignore this email — your
      password won’t change.
    </Text>
  </EmailLayout>
)

export default RecoveryEmail
