/**
 * Report rows to model-readable JSON — ADR 0031, §2 R1.
 *
 * `JSON.stringify` throws on a `bigint`, and every money figure in this
 * repository is one. The two kinds that reach here are told apart by name, the
 * same convention the rest of the codebase already relies on: a field named
 * `qty…` is thousandths (§5.6), and every other `bigint` in a report row is
 * `Paisa`. The rupee string is the render boundary R1 allows — the model reads
 * it the way a person reads a receipt, and nothing it says is written back.
 *
 * The failure this prevents is the obvious one: a model handed `"125000"` for
 * Rs 1,250 reports takings a hundred times too high, and says so confidently.
 */
function rupees(value: bigint): string {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const fraction = (magnitude % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${magnitude / 100n}.${fraction}`;
}

function thousandths(value: bigint): string {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const fraction = (magnitude % 1000n).toString().padStart(3, '0');
  return `${negative ? '-' : ''}${magnitude / 1000n}.${fraction}`;
}

export function toModelJson(value: unknown): string {
  return JSON.stringify(value, (key, field: unknown) =>
    typeof field === 'bigint'
      ? key.startsWith('qty')
        ? thousandths(field)
        : rupees(field)
      : field,
  );
}
