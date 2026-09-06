import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { readPublicMenuItem } from '@/lib/menu/queries';

/**
 * §13.5 — "generateMetadata per route with canonicals and next/og images
 * from item photos." Next picks this file up automatically for the route's
 * `openGraph.images`.
 */
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function priceLabel(paisa: bigint): string {
  const rupees = paisa / 100n;
  const paise = paisa % 100n;
  return `Rs. ${rupees}.${paise.toString().padStart(2, '0')}`;
}

export default async function Image({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}) {
  const { category, slug } = await params;
  const item = await readPublicMenuItem(category, slug);

  let photo: string | undefined;
  if (item?.imageUrl && /^\/images\/[a-zA-Z0-9_-]+\.(png|jpe?g)$/.test(item.imageUrl)) {
    try {
      const bytes = await readFile(join(process.cwd(), 'public', item.imageUrl));
      const type = item.imageUrl.endsWith('.png') ? 'image/png' : 'image/jpeg';
      photo = `data:${type};base64,${bytes.toString('base64')}`;
    } catch {
      /* The text and price still produce a usable card if a photo is missing. */
    }
  }

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        backgroundColor: '#1a1a1a', // brand-grep-allow: a fixed photo-legibility scrim, not a restaurant brand colour — `next/og`'s satori renderer needs a literal value, not a CSS token
        backgroundImage: photo ? `url(${photo})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '48px 56px',
          background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0))',
        }}
      >
        <span style={{ fontSize: 56, color: 'rgb(255, 255, 255)', fontWeight: 700 }}>
          {' '}
          {/* brand-grep-allow: fixed scrim contrast, not a brand colour */}
          {item?.name ?? 'On the menu'}
        </span>
        {item !== null && (
          <span style={{ fontSize: 32, color: 'rgb(240, 240, 240)', marginTop: 12 }}>
            {' '}
            {/* brand-grep-allow: fixed scrim contrast, not a brand colour */}
            {priceLabel(item.priceExTax)}
          </span>
        )}
      </div>
    </div>,
    size,
  );
}
