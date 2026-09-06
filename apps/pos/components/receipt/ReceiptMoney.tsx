import { Money } from '@natech/ui';
import type { Paisa } from '@natech/domain';

/** Receipt presentation rounds paisa to the nearest whole rupee. Accounting values remain unchanged. */
export function ReceiptMoney({
  value,
  symbol,
}: {
  readonly value: Paisa;
  readonly symbol?: string;
}) {
  const rounded = value >= 0n ? ((value + 50n) / 100n) * 100n : ((value - 50n) / 100n) * 100n;
  return <Money value={rounded} symbol={symbol} trimWholeRupees />;
}
