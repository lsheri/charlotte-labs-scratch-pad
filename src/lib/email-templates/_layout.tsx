import * as React from 'react'
import {
  Body,
  Button as REButton,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

export const SITE_NAME = 'Charlotte Labs'
export const PRODUCT_NAME = 'Charlotte Labs Platform'
export const SITE_URL = 'https://platform.charlotte-labs.com'
export const LOGO_URL = `${SITE_URL}/email/charlotte-logo.png`
export const RESEARCH_CONTACT = 'research@charlotte-labs.com'

export const colors = {
  bg: '#ffffff',
  ink: '#0b1220',
  body: '#3f4754',
  muted: '#8a93a3',
  divider: '#e8ebf0',
  callout: '#f5f7fb',
}

export const styles = {
  main: {
    backgroundColor: colors.bg,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    margin: 0,
    padding: '32px 16px',
  } as React.CSSProperties,
  container: {
    backgroundColor: colors.bg,
    maxWidth: '560px',
    margin: '0 auto',
    padding: '32px',
  } as React.CSSProperties,
  logoWrap: { textAlign: 'center' as const, marginBottom: '24px' },
  logo: { width: '140px', height: 'auto', display: 'inline-block' },
  h1: {
    fontSize: '22px',
    fontWeight: 700,
    color: colors.ink,
    margin: '0 0 16px',
    lineHeight: 1.3,
  } as React.CSSProperties,
  text: {
    fontSize: '15px',
    color: colors.body,
    lineHeight: 1.55,
    margin: '0 0 16px',
  } as React.CSSProperties,
  small: {
    fontSize: '13px',
    color: colors.muted,
    lineHeight: 1.5,
    margin: '0 0 8px',
  } as React.CSSProperties,
  button: {
    backgroundColor: colors.ink,
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: 600,
    borderRadius: '8px',
    padding: '14px 22px',
    textDecoration: 'none',
    display: 'inline-block',
  } as React.CSSProperties,
  callout: {
    backgroundColor: colors.callout,
    borderLeft: `3px solid ${colors.ink}`,
    padding: '14px 16px',
    borderRadius: '4px',
    margin: '8px 0 20px',
  } as React.CSSProperties,
  calloutText: {
    fontSize: '14px',
    color: colors.ink,
    lineHeight: 1.55,
    margin: '0 0 6px',
  } as React.CSSProperties,
  hr: {
    border: 'none',
    borderTop: `1px solid ${colors.divider}`,
    margin: '24px 0',
  } as React.CSSProperties,
  footer: {
    fontSize: '12px',
    color: colors.muted,
    lineHeight: 1.5,
    margin: '6px 0',
  } as React.CSSProperties,
  link: { color: colors.ink, textDecoration: 'underline' },
}

export type FooterVariant = 'auth' | 'participant' | 'researcher'

interface EmailLayoutProps {
  preview: string
  variant?: FooterVariant
  children: React.ReactNode
}

export const EmailLayout = ({
  preview,
  variant = 'auth',
  children,
}: EmailLayoutProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.logoWrap}>
          <Img
            src={LOGO_URL}
            alt="Charlotte Labs"
            width="140"
            style={styles.logo}
          />
        </Section>
        {children}
        <Hr style={styles.hr} />
        <Footer variant={variant} />
      </Container>
    </Body>
  </Html>
)

const Footer = ({ variant }: { variant: FooterVariant }) => {
  if (variant === 'participant') {
    return (
      <>
        <Text style={styles.footer}>
          You can withdraw from this study at any time without penalty.
        </Text>
        <Text style={styles.footer}>
          Questions about the study? Email{' '}
          <Link href={`mailto:${RESEARCH_CONTACT}`} style={styles.link}>
            {RESEARCH_CONTACT}
          </Link>
          .
        </Text>
        <Text style={styles.footer}>
          Study conducted in partnership with the University of Washington. IRB
          approved.
        </Text>
        <Text style={styles.footer}>
          {SITE_NAME} · {PRODUCT_NAME}
        </Text>
      </>
    )
  }
  if (variant === 'researcher') {
    return (
      <>
        <Text style={styles.footer}>
          {SITE_NAME} · {PRODUCT_NAME}
        </Text>
        <Text style={styles.footer}>
          Adjust digest frequency in your researcher account settings. Questions?{' '}
          <Link href={`mailto:${RESEARCH_CONTACT}`} style={styles.link}>
            {RESEARCH_CONTACT}
          </Link>
        </Text>
      </>
    )
  }
  return (
    <>
      <Text style={styles.footer}>
        {SITE_NAME} · {PRODUCT_NAME}
      </Text>
      <Text style={styles.footer}>
        Questions?{' '}
        <Link href={`mailto:${RESEARCH_CONTACT}`} style={styles.link}>
          {RESEARCH_CONTACT}
        </Link>
      </Text>
    </>
  )
}

interface CalloutProps {
  children: React.ReactNode
}
export const IRBCallout = ({ children }: CalloutProps) => (
  <Section style={styles.callout}>{children}</Section>
)

interface ButtonProps {
  href: string
  children: React.ReactNode
}
export const Button = ({ href, children }: ButtonProps) => (
  <Section style={{ textAlign: 'center', margin: '24px 0' }}>
    <REButton href={href} style={styles.button}>
      {children}
    </REButton>
  </Section>
)
