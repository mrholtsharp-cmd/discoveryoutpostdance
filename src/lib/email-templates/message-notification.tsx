import * as React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props { fromName?: string; subject?: string; body?: string; direction?: 'to_admin' | 'to_parent' }

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '600px', margin: '0 auto' }
const h1 = { color: '#111827', fontSize: '18px', margin: '0 0 8px' }
const val = { color: '#111827', fontSize: '14px', margin: 0 }

const Email = (p: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{p.subject ?? 'New message'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {p.direction === 'to_admin' ? 'New message from parent' : 'New reply from Discovery Outpost'}
        </Heading>
        <Text style={val}><strong>From:</strong> {p.fromName ?? ''}</Text>
        <Text style={val}><strong>Subject:</strong> {p.subject ?? ''}</Text>
        <Text style={{ ...val, whiteSpace: 'pre-wrap' as const, marginTop: 12 }}>{p.body ?? ''}</Text>
        <Text style={{ ...val, color: '#6b7280', marginTop: 16, fontSize: 12 }}>
          Sign in to your account to reply — do not reply directly to this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `New message: ${d?.subject ?? ''}`,
  displayName: 'Message Notification',
  previewData: { fromName: 'Jane Doe', subject: 'Class question', body: 'Hi! Can we...', direction: 'to_admin' },
} satisfies TemplateEntry