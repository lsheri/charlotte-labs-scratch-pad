import * as React from 'react'
import { Link, Text } from '@react-email/components'
import { Button, EmailLayout, styles } from './_layout'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <EmailLayout preview="Confirm your email to join the Charlotte research platform" variant="auth">
    <Text style={styles.h1}>Confirm your email</Text>
    <Text style={styles.text}>
      Welcome to the Charlotte research platform. Please confirm{' '}
      <Link href={`mailto:${recipient}`} style={styles.link}>
        {recipient}
      </Link>{' '}
      to activate your account.
    </Text>
    <Button href={confirmationUrl}>Verify email</Button>
    <Text style={styles.small}>
      If you didn’t create an account, you can safely ignore this email.
    </Text>
  </EmailLayout>
)

export default SignupEmail
