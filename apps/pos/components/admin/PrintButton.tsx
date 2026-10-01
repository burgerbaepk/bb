'use client';

import { Printer } from 'lucide-react';
import { Button } from '@natech/ui';

export function PrintButton({ label = 'Print QR cards' }: { readonly label?: string }) {
  return (
    <Button type="button" tone="secondary" className="no-print" onClick={() => window.print()}>
      <Printer aria-hidden="true" className="size-4" />
      {label}
    </Button>
  );
}
