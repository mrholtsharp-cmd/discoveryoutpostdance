import * as React from 'react'
import { Body, Container, Head, Heading, Hr, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  name?: string
  subject?: string
  original?: string
  reply?: string
  business?: { name: string; phone: string; email: string; website: string }
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '600px', margin: '0 auto' }
const h1 = { color: '#111827', fontSize: '20px', margin: '0 0 8px' }
const val = { color: '#111827', fontSize: '15px', margin: 0 }

const Email = (p: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reply from Discovery Outpost</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Hi {p.name ?? 'there'},</Heading>
        <Text style={val}>Thanks for reaching out about "{p.subject ?? ''}". Our reply is below.</Text>
        <Hr style={{ borderColor: '#e5e7eb', margin: '16px 0' }} />
        <Text style={{ ...val, whiteSpace: 'pre-wrap' as const }}>{p.reply ?? ''}</Text>
        <Hr style={{ borderColor: '#e5e7eb', margin: '16px 0' }} />
        <Text style={{ ...val, color: '#6b7280', fontSize: 12 }}>Your original message:</Text>
        <Text style={{ ...val, color: '#6b7280', fontSize: 12, whiteSpace: 'pre-wrap' as const }}>{p.original ?? ''}</Text>
        <Hr style={{ borderColor: '#e5e7eb', margin: '16px 0' }} />
        <Text style={{ ...val, color: '#6b7280' }}>
          {(p.business?.name ?? 'Discovery Outpost')} · {p.business?.phone ?? '(940) 249-5390'} · {p.business?.email ?? 'discoveryoutpostdance@gmail.com'}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `Re: ${d?.subject ?? 'Your question'}`,
  displayName: 'Contact Reply',
  previewData: {
    name: 'Jane', subject: 'Class schedule', original: 'When do fall classes start?',
    reply: 'Hi Jane — classes begin August 12. Let us know if you have more questions!',
  },
} satisfies TemplateEntry