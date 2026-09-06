/** Fiscal integration is not active in this application. Never print stale configured notices. */
export function visibleReceiptLines(lines: readonly string[], hasTax: boolean): string[] {
  return lines
    .flatMap((line) => line.split(/\r?\n/))
    .filter((line) => {
      if (/\b(?:PRA|FBR|PRAL|fiscal)\b|\bsync(?:hroni[sz](?:ation|ed|ing))?\b/i.test(line))
        return false;
      return hasTax || !/\b(?:tax|taxes|taxation|untaxed|NTN|STRN)\b|ٹیکس/i.test(line);
    });
}
