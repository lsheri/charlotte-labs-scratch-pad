import * as React from 'react'
import { Text } from '@react-email/components'
import { Button, EmailLayout, styles } from './_layout'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ confirmationUrl }: MagicLinkEmailProps) => (
  <EmailLayout preview="Your sign-in link for the Charlotte research platform" variant="auth">
    <Text style={styles.h1}>Your sign-in link</Text>
    <Text style={styles.text}>
      Click the button below to sign in to the Charlotte research platform.
      This link expires shortly.
    </Text>
    <Button href={confirmationUrl}>Sign in</Button>
    <Text style={styles.small}>
      If you didn’t request this link, you can safely ignore this email.
    </Text>
  </EmailLayout>
)

export default MagicLinkEmail
