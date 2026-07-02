import * as React from 'react'
import { Body, Container, Head, Heading, Hr, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props { name?: string; email?: string; phone?: string; subject?: string; message?: string }

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '600px', margin: '0 auto' }
const h1 = { color: '#111827', fontSize: '20px', margin: '0 0 8px' }
const label = { color: '#6b7280', fontSize: '12px', margin: '10px 0 2px' }
const val = { color: '#111827', fontSize: '14px', margin: 0 }

const Email = (p: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New contact from {p.name ?? ''}: {p.subject ?? ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>New contact form submission</Heading>
        <Text style={label}>From</Text><Text style={val}>{p.name} &lt;{p.email}&gt;</Text>
        {p.phone ? (<><Text style={label}>Phone</Text><Text style={val}>{p.phone}</Text></>) : null}
        <Text style={label}>Subject</Text><Text style={val}>{p.subject}</Text>
        <Hr style={{ borderColor: '#e5e7eb', margin: '12px 0' }} />
        <Text style={{ ...val, whiteSpace: 'pre-wrap' as const }}>{p.message}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `[Contact] ${d?.subject ?? 'New message'}`,
  displayName: 'Contact Form Received (Admin)',
  to: 'discoveryoutpostdance@gmail.com',
  previewData: { name: 'Jane', email: 'jane@example.com', phone: '555-0100', subject: 'Question', message: 'When do fall classes start?' },
} satisfies TemplateEntry