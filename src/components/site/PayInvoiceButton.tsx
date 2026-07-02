import { useState, useCallback } from 'react';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getStripe, getStripeEnvironment } from '@/lib/stripe';
import {
  createInvoiceCheckoutSession,
  createMonthlyPlanCheckoutSession,
} from '@/lib/invoice-payments.functions';
import { toast } from 'sonner';

type Props = {
  invoiceId: string;
  invoiceNumber: string;
  mode: 'one_time' | 'monthly';
  studentCount?: number;
  disabled?: boolean;
  label?: string;
  variant?: 'default' | 'outline';
  onPaid?: () => void;
};

export function PayInvoiceButton({
  invoiceId, invoiceNumber, mode, studentCount = 1, disabled, label, variant = 'default', onPaid,
}: Props) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  const buttonLabel = label ?? (mode === 'monthly' ? 'Start Monthly Plan' : 'Pay Now');

  const fetchClientSecret = useCallback(async (): Promise<string> => {
    const returnUrl = `${window.location.origin}/account?checkout=success&inv=${invoiceNumber}&session_id={CHECKOUT_SESSION_ID}`;
    try {
      const result = mode === 'monthly'
        ? await createMonthlyPlanCheckoutSession({
            data: { invoiceId, studentCount, returnUrl, environment: getStripeEnvironment() },
          })
        : await createInvoiceCheckoutSession({
            data: { invoiceId, returnUrl, environment: getStripeEnvironment() },
          });
      if ('error' in result) throw new Error(result.error);
      if (!result.clientSecret) throw new Error('Checkout could not start');
      return result.clientSecret;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Checkout failed';
      toast.error(msg);
      throw e;
    }
  }, [invoiceId, invoiceNumber, mode, studentCount]);

  return (
    <>
      <Button
        variant={variant}
        size="sm"
        disabled={disabled}
        onClick={() => { setKey((k) => k + 1); setOpen(true); }}
      >
        {buttonLabel}
      </Button>
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) onPaid?.(); }}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b">
            <DialogTitle>
              {mode === 'monthly' ? 'Start monthly tuition plan' : `Pay invoice ${invoiceNumber}`}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[75vh] overflow-y-auto">
            {open && (
              <EmbeddedCheckoutProvider
                key={key}
                stripe={getStripe()}
                options={{ fetchClientSecret }}
              >
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}