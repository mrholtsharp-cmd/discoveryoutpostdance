import * as React from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

type Props = {
  paymentUrl?: string | null;
  invoiceNumber?: string | null;
  totalCents?: number | null;
  onPayStripe?: () => void;
  variant?: "full" | "compact";
  hideStripe?: boolean;
  className?: string;
};

function money(c?: number | null) {
  if (c == null) return "";
  return (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/**
 * Shared payment-methods block. Renders the Stripe Pay button when a link
 * exists (or a "coming soon" note when not), plus Cash App / Venmo / PayPal
 * / cash-at-studio details. Used in parent portal, admin invoice view,
 * tuition page, and registration confirmation.
 */
export function PaymentMethods({
  paymentUrl,
  invoiceNumber,
  totalCents,
  onPayStripe,
  variant = "full",
  hideStripe = false,
  className = "",
}: Props) {
  const showStripeSlot = !hideStripe;
  return (
    <div className={`rounded-lg border bg-muted/30 p-3 sm:p-4 ${className}`}>
      <h3 className="text-sm font-semibold mb-2">Payment methods</h3>

      {showStripeSlot && (
        <div className="mb-3">
          {paymentUrl ? (
            onPayStripe ? (
              <Button size="sm" className="rounded-full" onClick={onPayStripe}>
                Pay online (Stripe){totalCents != null ? ` — ${money(totalCents)}` : ""}
              </Button>
            ) : (
              <a
                href={paymentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Pay online (Stripe){totalCents != null ? ` — ${money(totalCents)}` : ""}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )
          ) : (
            <p className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
              Stripe payment link coming soon — you can pay now using any method below.
            </p>
          )}
        </div>
      )}

      <ul className="text-sm space-y-1">
        <li><strong>Cash App:</strong> $DOPAdance</li>
        <li><strong>Venmo:</strong> @DOPADance</li>
        <li><strong>PayPal:</strong> discoveryoutpostdance@gmail.com</li>
        <li><strong>Cash:</strong> at the studio during class hours</li>
      </ul>

      {variant === "full" && (
        <p className="mt-3 text-xs text-muted-foreground">
          Include invoice number{invoiceNumber ? ` (${invoiceNumber})` : ""} and student name on Cash App / Venmo / PayPal payments so we can match them.
        </p>
      )}
    </div>
  );
}