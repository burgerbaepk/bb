import type { Paisa } from '@natech/domain';

/**
 * Format paisa the way the reference invoice prints it, for assertions only.
 *
 * A duplicate of the `@natech/ui` render boundary rather than an import,
 * because `@natech/contracts` must not depend on the design system. Integer
 * arithmetic and string padding, so no float touches a figure under test.
 */
export function formatDataset(value: Paisa): string {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const rupees = (magnitude / 100n).toString();
  const fraction = (magnitude % 100n).toString().padStart(2, '0');

  let grouped = '';
  for (let i = 0; i < rupees.length; i += 1) {
    if (i > 0 && (rupees.length - i) % 3 === 0) grouped += ',';
    grouped += rupees[i];
  }

  return `${negative ? '-' : ''}${grouped}.${fraction}`;
}
