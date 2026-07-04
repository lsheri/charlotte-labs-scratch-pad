import * as React from 'react'
import { Text } from '@react-email/components'
import { EmailLayout, styles } from './_layout'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({
  token,
}: ReauthenticationEmailProps) => (
  <EmailLayout preview="Your verification code" variant="auth">
    <Text style={styles.h1}>Confirm it’s you</Text>
    <Text style={styles.text}>Use the code below to confirm your identity:</Text>
    <Text
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '24px',
        fontWeight: 700,
        color: '#0b1220',
        letterSpacing: '4px',
        margin: '8px 0 24px',
      }}
    >
      {token}
    </Text>
    <Text style={styles.small}>
      This code expires shortly. If you didn’t request this, ignore this email.
    </Text>
  </EmailLayout>
)

export default ReauthenticationEmail
