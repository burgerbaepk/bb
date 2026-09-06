'use client';

import { Printer } from 'lucide-react';
import { Button } from '@natech/ui';

export function PrintButton() {
  return (
    <Button type="button" tone="secondary" onClick={() => window.print()}>
      <Printer aria-hidden="true" className="size-4" />
      Print QR cards
    </Button>
  );
}
