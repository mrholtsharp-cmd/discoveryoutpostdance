// Central business info + invoice policy. Update here to change everywhere.

export const BUSINESS = {
  name: "Discovery Outpost",
  addressLine1: "2112 SW E Ave",
  addressLine2: "Lawton, OK 73501",
  phone: "(940) 249-5390",
  email: "discoveryoutpostdance@gmail.com",
  website: "https://discoveryoutpost.dance",
} as const;

export const PAYMENT_METHODS = [
  { label: "Cash", detail: "at the studio" },
  { label: "Cash App", detail: "$DOPAdance" },
  { label: "Venmo", detail: "@DOPADance" },
  { label: "PayPal", detail: "discoveryoutpostdance@gmail.com" },
  { label: "Stripe", detail: "when a payment link is provided" },
] as const;

export const PAYMENT_INSTRUCTIONS = [
  "Please submit payment by the invoice due date using one of the approved payment methods above.",
  "If paying by Cash App, Venmo, or PayPal, include the Invoice Number and Student Name in the payment note so your payment can be matched correctly.",
  "If paying with cash, please bring payment to Discovery Outpost during studio hours.",
  "If a Stripe payment link is included with the invoice, you may also pay securely online.",
];

export const INVOICE_FOOTER =
  "Thank you for choosing Discovery Outpost! We appreciate the opportunity to teach and inspire your family. If you have any questions regarding your registration or invoice, please contact us using the information above.";

// Once-per-student-per-semester and once-per-student fees.
export const REGISTRATION_FEE_CENTS = 1000; // $10
export const RECITAL_FEE_CENTS = 1000; // $10

// Cash discount per enrolled class when parent selects "Pay Cash at the Studio".
export const CASH_DISCOUNT_PER_CLASS_CENTS = 500;

// Season is 4 months.
export const SEMESTER_MONTHS = 4;

export function centsToUSD(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function seasonLabel(year: number): string {
  return `Fall ${year}`;
}

// Due date: 14 days from now.
export function defaultDueDateISO(from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}