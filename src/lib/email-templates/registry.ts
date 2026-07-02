import type { ComponentType } from 'react'
import { template as registrationNotification } from './registration-notification'
import { template as paymentConfirmation } from './payment-confirmation'
import { template as paymentFailedParent } from './payment-failed-parent'
import { template as paymentFailedAdmin } from './payment-failed-admin'
import { template as refundIssued } from './refund-issued'
import { template as invoiceSent } from './invoice-sent'
import { template as contactReply } from './contact-reply'
import { template as contactReceived } from './contact-received'
import { template as messageNotification } from './message-notification'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 *
 * Example:
 *   import { template as welcomeTemplate } from './welcome'
 *   // then add to TEMPLATES: 'welcome': welcomeTemplate
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  'registration-notification': registrationNotification,
  'payment-confirmation': paymentConfirmation,
  'payment-failed-parent': paymentFailedParent,
  'payment-failed-admin': paymentFailedAdmin,
  'refund-issued': refundIssued,
  'invoice-sent': invoiceSent,
  'contact-reply': contactReply,
  'contact-received': contactReceived,
  'message-notification': messageNotification,
}
