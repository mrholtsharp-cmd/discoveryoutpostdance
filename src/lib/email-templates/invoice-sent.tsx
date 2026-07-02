import * as React from 'react'
import {
  Body, Container, Head, Heading, Hr, Html, Img, Preview, Section, Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface LineItem {
  description: string
  student_name?: string | null
  amount_cents: number
  category?: string
}

interface Props {
  invoice_number?: string
  invoice_date?: string
  due_date?: string
  parent_name?: string
  semester_label?: string
  tuition_plan?: 'monthly' | 'semester'
  invoice_preference?: 'monthly' | 'semester'
  cash_payment?: boolean
  subtotal_cents?: number
  discount_cents?: number
  total_cents?: number
  line_items?: LineItem[]
  business?: {
    name: string; addressLine1: string; addressLine2: string; phone: string; email: string; website: string
  }
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '640px', margin: '0 auto' }
const h1 = { color: '#111827', fontSize: '22px', margin: '0 0 4px' }
const label = { color: '#6b7280', fontSize: '12px', margin: '10px 0 2px' }
const val = { color: '#111827', fontSize: '14px', margin: 0 }
const total = { color: '#111827', fontSize: '18px', fontWeight: 700 as const, margin: '4px 0' }

function money(c?: number) {
  if (c == null) return '$0.00'
  return (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

const Email = (props: Props) => {
  const {
    invoice_number = '',
    invoice_date = '',
    due_date = '',
    parent_name = 'Parent',
    semester_label = '',
    tuition_plan = 'monthly',
    invoice_preference = 'monthly',
    cash_payment = false,
    subtotal_cents = 0,
    discount_cents = 0,
    total_cents = 0,
    line_items = [],
    business = {
      name: 'Discovery Outpost',
      addressLine1: '2112 SW E Ave',
      addressLine2: 'Lawton, OK 73501',
      phone: '(940) 249-5390',
      email: 'discoveryoutpostdance@gmail.com',
      website: 'https://discoveryoutpost.dance',
    },
  } = props
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Invoice {invoice_number} — {money(total_cents)} due {due_date}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={{ marginBottom: '8px' }}>
            <table role="presentation" width="100%" style={{ width: '100%' }}>
              <tbody>
                <tr>
                  <td style={{ verticalAlign: 'top', width: '72px', paddingRight: '12px' }}>
                    <Img
                      src="https://discoveryoutpost.dance/__l5e/assets-v1/1a608a06-e393-4555-ac56-837c9a6d8276/logo.png"
                      alt={`${business.name} logo`}
                      width="64"
                      height="64"
                      style={{ display: 'block', borderRadius: '6px' }}
                    />
                  </td>
                  <td style={{ verticalAlign: 'top' }}>
                    <Heading style={h1}>{business.name}</Heading>
                    <Text style={{ ...val, color: '#6b7280', margin: 0 }}>
                      {business.addressLine1} · {business.addressLine2} · {business.phone}
                    </Text>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Hr style={{ borderColor: '#e5e7eb', margin: '16px 0' }} />

          <Heading as="h2" style={{ ...h1, fontSize: '18px' }}>Invoice {invoice_number}</Heading>
          <Text style={val}>Hi {parent_name},</Text>
          <Text style={val}>Your invoice for {semester_label} is ready. Details below.</Text>

          <Section style={{ backgroundColor: '#f9fafb', padding: '12px', borderRadius: '6px', marginTop: '12px' }}>
            <Text style={label}>Invoice date</Text><Text style={val}>{invoice_date}</Text>
            <Text style={label}>Due date</Text><Text style={val}>{due_date}</Text>
            <Text style={label}>Tuition plan</Text><Text style={val}>{tuition_plan === 'monthly' ? 'Monthly' : 'Semester (one payment)'}</Text>
            <Text style={label}>Invoice preference</Text><Text style={val}>{invoice_preference === 'monthly' ? 'Monthly invoices' : 'One semester invoice'}</Text>
            {cash_payment ? <Text style={{ ...val, color: '#92400e' }}>Payment Pending — Cash at studio</Text> : null}
          </Section>

          <Hr style={{ borderColor: '#e5e7eb', margin: '16px 0' }} />

          {line_items.map((li, i) => (
            <Section key={i} style={{ borderBottom: '1px solid #f3f4f6', padding: '6px 0' }}>
              <table width="100%" role="presentation" style={{ width: '100%' }}>
                <tbody>
                  <tr>
                    <td style={{ fontSize: 13, color: '#111827', padding: 0 }}>
                      {li.student_name ? <strong>{li.student_name}: </strong> : null}{li.description}
                    </td>
                    <td style={{ fontSize: 13, color: '#111827', textAlign: 'right', padding: 0, whiteSpace: 'nowrap' }}>
                      {money(li.amount_cents)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </Section>
          ))}

          <Section style={{ marginTop: '10px' }}>
            <table width="100%" role="presentation">
              <tbody>
                <tr><td style={val}>Subtotal</td><td style={{ ...val, textAlign: 'right' }}>{money(subtotal_cents)}</td></tr>
                {discount_cents > 0 ? (
                  <tr><td style={val}>Cash discount</td><td style={{ ...val, textAlign: 'right' }}>-{money(discount_cents)}</td></tr>
                ) : null}
                <tr><td style={total}>Total due</td><td style={{ ...total, textAlign: 'right' }}>{money(total_cents)}</td></tr>
              </tbody>
            </table>
          </Section>

          <Hr style={{ borderColor: '#e5e7eb', margin: '16px 0' }} />

          <Heading as="h3" style={{ ...h1, fontSize: '15px' }}>Payment methods</Heading>
          <Text style={val}>• Cash (at the studio)</Text>
          <Text style={val}>• Cash App: $DOPAdance</Text>
          <Text style={val}>• Venmo: @DOPADance</Text>
          <Text style={val}>• PayPal: discoveryoutpostdance@gmail.com</Text>
          <Text style={val}>• Stripe (if payment link provided)</Text>

          <Text style={{ ...val, color: '#6b7280', marginTop: '12px' }}>
            Please include the invoice number and student name on Cash App / Venmo / PayPal payments.
          </Text>

          <Hr style={{ borderColor: '#e5e7eb', margin: '16px 0' }} />
          <Text style={{ ...val, color: '#6b7280' }}>
            Questions? Reply to this email or call {business.phone}. Thank you for choosing {business.name}!
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `Invoice ${d?.invoice_number ?? ''} from Discovery Outpost`.trim(),
  displayName: 'Invoice Sent',
  previewData: {
    invoice_number: 'DO-2026-0001',
    invoice_date: '2026-07-02',
    due_date: '2026-07-16',
    parent_name: 'Jane Doe',
    semester_label: 'Fall 2026',
    tuition_plan: 'monthly',
    invoice_preference: 'monthly',
    cash_payment: false,
    subtotal_cents: 15000,
    discount_cents: 0,
    total_cents: 15000,
    line_items: [
      { description: 'Dance (Ages 7–10) — Monthly Tuition', student_name: 'Ada', amount_cents: 14000 },
      { description: 'Registration Fee — Ada (Fall 2026)', student_name: 'Ada', amount_cents: 1000 },
    ],
  },
} satisfies TemplateEntry