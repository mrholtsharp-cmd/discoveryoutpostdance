import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  parent_name?: string
  student_name?: string
  amount_display?: string
  class_name?: string
  receipt_url?: string | null
  paid_at?: string
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '600px', margin: '0 auto' }
const h1 = { color: '#111827', fontSize: '22px', margin: '0 0 8px' }
const p = { color: '#374151', fontSize: '15px', lineHeight: '22px', margin: '8px 0' }
const hr = { borderColor: '#e5e7eb', margin: '20px 0' }
const button = {
  backgroundColor: '#111827',
  color: '#ffffff',
  padding: '10px 18px',
  borderRadius: '999px',
  textDecoration: 'none',
  fontSize: '14px',
  display: 'inline-block',
}

const Email = (props: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Payment received — {props.student_name ?? 'your student'} is enrolled</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Payment received 🎉</Heading>
        <Text style={p}>Hi {props.parent_name ?? 'there'},</Text>
        <Text style={p}>
          We received your payment{props.amount_display ? ` of ${props.amount_display}` : ''} for{' '}
          <strong>{props.student_name ?? 'your student'}</strong>
          {props.class_name ? <> in <strong>{props.class_name}</strong></> : null}.
          Their spot is officially reserved.
        </Text>
        {props.receipt_url ? (
          <Section style={{ margin: '20px 0' }}>
            <Button href={props.receipt_url} style={button}>View receipt</Button>
          </Section>
        ) : null}
        <Hr style={hr} />
        <Text style={p}>
          You can view payment history, update your card, or download receipts any time from your
          parent dashboard at{' '}
          <a href="https://discoveryoutpost.dance/account">discoveryoutpost.dance/account</a>.
        </Text>
        <Text style={p}>See you in the studio!<br />— Discovery Outpost Dance</Text>
        {props.paid_at ? (
          <Text style={{ ...p, color: '#9ca3af', fontSize: '12px' }}>Paid {props.paid_at}</Text>
        ) : null}
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `Payment received for ${data?.student_name ?? 'your student'}`,
  displayName: 'Payment Confirmation (Parent)',
  previewData: {
    parent_name: 'John Doe',
    student_name: 'Jane Doe',
    amount_display: '$95.00',
    class_name: 'Ballet',
    receipt_url: 'https://pay.stripe.com/receipts/example',
  },
} satisfies TemplateEntry