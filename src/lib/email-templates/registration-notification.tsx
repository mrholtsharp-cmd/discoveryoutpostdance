import * as React from 'react'
import {
  Body,
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
  student_name?: string
  parent_name?: string
  email?: string
  phone?: string
  age?: number | string
  desired_class?: string
  experience_level?: string
  emergency_contact?: string
  medical_notes?: string | null
  is_trial?: boolean
  registration_id?: string
  submitted_at?: string
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '600px', margin: '0 auto' }
const h1 = { color: '#111827', fontSize: '22px', margin: '0 0 8px' }
const label = { color: '#6b7280', fontSize: '12px', textTransform: 'uppercase' as const, margin: '12px 0 2px', letterSpacing: '0.5px' }
const value = { color: '#111827', fontSize: '15px', margin: '0' }
const hr = { borderColor: '#e5e7eb', margin: '20px 0' }
const badge = (trial?: boolean) => ({
  display: 'inline-block',
  padding: '4px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 600 as const,
  backgroundColor: trial ? '#fef3c7' : '#dcfce7',
  color: trial ? '#92400e' : '#166534',
})

const Email = (props: Props) => {
  const {
    student_name = '—',
    parent_name = '—',
    email = '—',
    phone = '—',
    age = '—',
    desired_class = '—',
    experience_level = '—',
    emergency_contact = '—',
    medical_notes,
    is_trial,
    registration_id,
    submitted_at,
  } = props
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>New registration: {student_name} — {desired_class}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>New Registration</Heading>
          <Text style={{ margin: '0 0 12px' }}>
            <span style={badge(is_trial)}>{is_trial ? 'Trial Class' : 'Full Registration'}</span>
          </Text>

          <Section>
            <Text style={label}>Student</Text>
            <Text style={value}>{student_name} (age {String(age)})</Text>

            <Text style={label}>Parent / Guardian</Text>
            <Text style={value}>{parent_name}</Text>

            <Text style={label}>Email</Text>
            <Text style={value}>{email}</Text>

            <Text style={label}>Phone</Text>
            <Text style={value}>{phone}</Text>

            <Hr style={hr} />

            <Text style={label}>Desired Class</Text>
            <Text style={value}>{desired_class}</Text>

            <Text style={label}>Experience Level</Text>
            <Text style={value}>{experience_level}</Text>

            <Text style={label}>Emergency Contact</Text>
            <Text style={value}>{emergency_contact}</Text>

            {medical_notes ? (
              <>
                <Text style={label}>Medical Notes</Text>
                <Text style={value}>{medical_notes}</Text>
              </>
            ) : null}

            <Hr style={hr} />

            {registration_id ? (
              <Text style={{ ...value, color: '#6b7280', fontSize: '12px' }}>
                Registration ID: {registration_id}
              </Text>
            ) : null}
            {submitted_at ? (
              <Text style={{ ...value, color: '#6b7280', fontSize: '12px' }}>
                Submitted: {submitted_at}
              </Text>
            ) : null}
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `New ${data?.is_trial ? 'trial' : 'registration'}: ${data?.student_name ?? 'Student'} — ${data?.desired_class ?? ''}`.trim(),
  displayName: 'Registration Notification (Admin)',
  to: 'discoveryoutpostdance@gmail.com',
  previewData: {
    student_name: 'Jane Doe',
    parent_name: 'John Doe',
    email: 'parent@example.com',
    phone: '555-123-4567',
    age: 8,
    desired_class: 'Ballet',
    experience_level: 'Beginner',
    emergency_contact: 'Aunt Mary 555-987-6543',
    medical_notes: 'None',
    is_trial: false,
  },
} satisfies TemplateEntry