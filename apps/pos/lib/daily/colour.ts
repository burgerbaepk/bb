/**
 * A brand colour, as an email client can paint it — ADR 0029.
 *
 * The brand theme is stored as whatever CSS the POS itself renders, and the
 * seeded one is `oklch(…)`. Gmail and Outlook drop an `oklch()` declaration
 * without a word, so an email built straight from the theme would arrive with
 * no brand colour at all. This converts the three forms the branding editor
 * produces — `oklch()`, `rgb()` and six-digit hex — to `rgb(r, g, b)`, and
 * falls back when it meets anything else rather than guess.
 *
 * The oklch → sRGB matrices are Björn Ottosson's published reference values
 * (the same ones CSS Color 4 cites).
 */
export function toEmailRgb(value: string, fallback: string): string {
  const css = value.trim().toLowerCase();

  const oklch = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/[^)]*)?\)$/.exec(css);
  if (oklch !== null) {
    const lightness = Number(oklch[1]) / (oklch[2] === '%' ? 100 : 1);
    const chroma = Number(oklch[3]);
    const hue = (Number(oklch[4]) * Math.PI) / 180;
    return oklabToRgb(lightness, chroma * Math.cos(hue), chroma * Math.sin(hue));
  }

  const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/.exec(css);
  if (rgb !== null) return `rgb(${rgb[1]}, ${rgb[2]}, ${rgb[3]})`;

  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(css);
  if (hex !== null) {
    const [r, g, b] = [hex[1], hex[2], hex[3]].map((part) => parseInt(part ?? '0', 16));
    return `rgb(${r}, ${g}, ${b})`;
  }

  return fallback;
}

function oklabToRgb(l: number, a: number, b: number): string {
  const l1 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m1 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s1 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const linear = [
    4.0767416621 * l1 - 3.3077115913 * m1 + 0.2309699292 * s1,
    -1.2684380046 * l1 + 2.6097574011 * m1 - 0.3413193965 * s1,
    -0.0041960863 * l1 - 0.7034186147 * m1 + 1.707614701 * s1,
  ];

  const channels = linear.map((channel) => {
    const gamma =
      channel <= 0.0031308 ? 12.92 * channel : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, gamma)) * 255);
  });
  return `rgb(${channels.join(', ')})`;
}
