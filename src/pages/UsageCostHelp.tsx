import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

export function UsageCostHelp() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <CircleHelp size={15} />
          How costs are recorded
        </Button>
      </DialogTrigger>
      <DialogContent className="usage-help">
        <DialogHeader>
          <DialogTitle>How costs are recorded</DialogTitle>
          <DialogDescription>
            Only generations recorded in this project are included. Amounts are
            in USD.
          </DialogDescription>
        </DialogHeader>
        <dl>
          <dt>Reported charges</dt>
          <dd>
            Charges returned by provider receipts, including a genuine reported
            zero.
          </dd>
          <dt>Estimated, unconfirmed</dt>
          <dd>
            Recorded preflight estimates for requests without confirmed charges.
            These may differ from invoices.
          </dd>
          <dt>Unknown charges</dt>
          <dd>
            Requests with neither a price estimate nor a reported charge.
            Unknown charges are not counted as free.
          </dd>
          <dt>Refresh charges</dt>
          <dd>
            Checks requests on the current page without generating media. Totals
            cover this project's recorded requests, not your provider account
            balance or all account activity.
          </dd>
        </dl>
        <p>
          Gemini estimates use published rates; its generation API does not
          return a monetary receipt. Local compute estimates use your saved
          rate; hardware and electricity costs are otherwise unknown.
        </p>
        <p>
          Open a request's Details to inspect receipt IDs, price sources and any
          reason a charge remains unconfirmed.
        </p>
      </DialogContent>
    </Dialog>
  );
}
