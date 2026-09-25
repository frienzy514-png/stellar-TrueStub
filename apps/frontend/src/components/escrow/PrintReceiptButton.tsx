"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens the browser print dialog; choose "Save as PDF" to download. */
export function PrintReceiptButton() {
  return (
    <Button type="button" onClick={() => window.print()} className="print:hidden">
      <Printer className="mr-2 h-4 w-4" />
      Print / Save as PDF
    </Button>
  );
}
