import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

/** Shared error card with a retry button. Never leaves users on an infinite spinner. */
export function LoadError({
  title = "We couldn't load this page",
  message = "Something went wrong while loading. Please try again — if the problem continues, refresh the page or contact us.",
  onRetry,
  retrying = false,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <Card className="p-6 border-red-200 bg-red-50/40">
      <h2 className="font-display text-lg text-red-900">{title}</h2>
      <p className="mt-2 text-sm text-red-900/80">{message}</p>
      {onRetry && (
        <div className="mt-4">
          <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
            Try again
          </Button>
        </div>
      )}
    </Card>
  );
}