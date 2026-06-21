import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  parent_name?: string
  student_name?: string
  amount_display?: string
  is_full_refund?: boolean
  refunded_at?: string
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '600px', margin: '0 auto' }
const h1 = { color: '#111827', fontSize: '22px', margin: '0 0 8px' }
const p = { color: '#374151', fontSize: '15px', lineHeight: '22px', margin: '8px 0' }
const hr = { borderColor: '#e5e7eb', margin: '20px 0' }

const Email = (props: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Refund issued{props.amount_display ? ` — ${props.amount_display}` : ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {props.is_full_refund ? 'Full refund issued' : 'Partial refund issued'}
        </Heading>
        <Text style={p}>Hi {props.parent_name ?? 'there'},</Text>
        <Text style={p}>
          We've issued a refund {props.amount_display ? <>of <strong>{props.amount_display}</strong></> : null}
          {props.student_name ? <> for {props.student_name}</> : null}. It typically takes 5–10
          business days to appear on your original payment method.
        </Text>
        <Hr style={hr} />
        <Text style={p}>If you have any questions, just reply to this email.</Text>
        <Text style={p}>— Discovery Outpost Dance</Text>
        {props.refunded_at ? (
          <Text style={{ ...p, color: '#9ca3af', fontSize: '12px' }}>Issued {props.refunded_at}</Text>
        ) : null}
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `Refund issued${data?.amount_display ? ` — ${data.amount_display}` : ''}`,
  displayName: 'Refund Issued (Parent)',
  previewData: {
    parent_name: 'John Doe',
    student_name: 'Jane Doe',
    amount_display: '$95.00',
    is_full_refund: true,
  },
} satisfies TemplateEntry