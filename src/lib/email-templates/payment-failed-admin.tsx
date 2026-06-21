import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  parent_name?: string
  parent_email?: string
  student_name?: string
  amount_display?: string
  attempt_count?: number
  failure_reason?: string
  registration_id?: string
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '600px', margin: '0 auto' }
const h1 = { color: '#b91c1c', fontSize: '20px', margin: '0 0 8px' }
const p = { color: '#374151', fontSize: '14px', lineHeight: '20px', margin: '6px 0' }

const Email = (props: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Failed payment — {props.student_name ?? 'student'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>⚠ Payment failed</Heading>
        <Text style={p}><strong>Parent:</strong> {props.parent_name ?? '—'} ({props.parent_email ?? '—'})</Text>
        <Text style={p}><strong>Student:</strong> {props.student_name ?? '—'}</Text>
        <Text style={p}><strong>Amount:</strong> {props.amount_display ?? '—'}</Text>
        <Text style={p}><strong>Attempt:</strong> #{props.attempt_count ?? 1}</Text>
        <Text style={p}><strong>Reason:</strong> {props.failure_reason ?? 'Card declined'}</Text>
        {props.registration_id ? (
          <Text style={{ ...p, color: '#6b7280', fontSize: '12px' }}>
            Registration ID: {props.registration_id}
          </Text>
        ) : null}
        <Text style={p}>The parent has been emailed automatically. Stripe will retry per your dunning settings.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `[Studio] Payment failed — ${data?.student_name ?? 'student'}`,
  displayName: 'Payment Failed (Admin)',
  to: 'discoveryoutpostdance@gmail.com',
  previewData: {
    parent_name: 'John Doe',
    parent_email: 'john@example.com',
    student_name: 'Jane Doe',
    amount_display: '$95.00',
    attempt_count: 1,
    failure_reason: 'Your card was declined.',
  },
} satisfies TemplateEntry