import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
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
  attempt_count?: number
  next_attempt_at?: string | null
  update_url?: string
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '600px', margin: '0 auto' }
const h1 = { color: '#b91c1c', fontSize: '22px', margin: '0 0 8px' }
const p = { color: '#374151', fontSize: '15px', lineHeight: '22px', margin: '8px 0' }
const button = {
  backgroundColor: '#b91c1c',
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
    <Preview>Action needed — your tuition payment didn't go through</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Your tuition payment didn't go through</Heading>
        <Text style={p}>Hi {props.parent_name ?? 'there'},</Text>
        <Text style={p}>
          We weren't able to charge your card on file
          {props.amount_display ? ` for ${props.amount_display}` : ''}
          {props.student_name ? <> for <strong>{props.student_name}</strong>'s tuition</> : null}.
        </Text>
        <Text style={p}>
          Stripe will automatically retry the payment{props.next_attempt_at ? ` on ${props.next_attempt_at}` : ' over the next few days'}.
          To avoid any interruption to class, please update your payment method now.
        </Text>
        <Section style={{ margin: '20px 0' }}>
          <Button
            href={props.update_url ?? 'https://discoveryoutpost.dance/account'}
            style={button}
          >
            Update payment method
          </Button>
        </Section>
        <Text style={p}>
          Questions? Reply to this email or call the studio.
        </Text>
        <Text style={p}>— Discovery Outpost Dance</Text>
        {props.attempt_count ? (
          <Text style={{ ...p, color: '#9ca3af', fontSize: '12px' }}>
            Attempt #{props.attempt_count}
          </Text>
        ) : null}
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `Action needed: tuition payment failed${data?.student_name ? ` for ${data.student_name}` : ''}`,
  displayName: 'Payment Failed (Parent)',
  previewData: {
    parent_name: 'John Doe',
    student_name: 'Jane Doe',
    amount_display: '$95.00',
    attempt_count: 1,
    update_url: 'https://discoveryoutpost.dance/account',
  },
} satisfies TemplateEntry