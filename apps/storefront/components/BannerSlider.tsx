'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@natech/ui';

/**
 * R12 — the alt text names the restaurant from `outlet_config` and describes
 * the banner generically, rather than transcribing the words printed on it.
 *
 * It used to transcribe them, and that was two problems in one string. It hard
 * coded a city and a trading name into a message catalogue, which is exactly
 * the identity R12 keeps in configuration so a rebrand is a row rather than a
 * rebuild. And the banners themselves are supplied per deployment: an alt text
 * that transcribes image copy the deployment can replace is guaranteed to
 * describe the wrong picture eventually, which is worse for a screen-reader
 * user than an accurate general description. Per-banner alt text belongs with
 * the banners when they become manageable; see the M22 runfile.
 */
const BANNERS = ['/images/hero-banner-1.avif', '/images/hero-banner-2.avif'] as const;
const INTERVAL = 6000;

export function BannerSlider({ name }: { readonly name: string }) {
  const t = useTranslations('banners');
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [visible, setVisible] = useState(true);
  const touchStart = useRef<number | null>(null);
  const playing = !paused && !hovered && !reducedMotion && visible;

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(media.matches);
    const updateVisibility = () => setVisible(!document.hidden);
    updateMotion();
    updateVisibility();
    media.addEventListener('change', updateMotion);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      media.removeEventListener('change', updateMotion);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(
      () => setActive((index) => (index + 1) % BANNERS.length),
      INTERVAL,
    );
    return () => window.clearInterval(timer);
  }, [playing]);

  function select(index: number) {
    setPaused(true);
    setActive((index + BANNERS.length) % BANNERS.length);
  }

  const controlClass =
    'inline-flex size-11 items-center justify-center rounded-full text-store-ink hover:bg-store-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-store-accent';

  return (
    <section
      aria-label={t('label')}
      aria-roledescription="carousel"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={(event) => {
        if (!(event.target as HTMLElement).closest('[data-rotation-control]')) setPaused(true);
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          select(active + (event.key === 'ArrowRight' ? 1 : -1));
        }
      }}
      className="bg-store-surface"
    >
      <div
        className="relative mx-auto aspect-[1935/812] max-w-[121rem] overflow-hidden"
        onTouchStart={(event) => {
          touchStart.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const end = event.changedTouches[0]?.clientX;
          if (
            touchStart.current !== null &&
            end !== undefined &&
            Math.abs(end - touchStart.current) > 50
          ) {
            select(active + (end < touchStart.current ? 1 : -1));
          }
          touchStart.current = null;
        }}
        onTouchCancel={() => {
          touchStart.current = null;
        }}
      >
        {BANNERS.map((src, index) => (
          <div
            key={src}
            role="group"
            aria-roledescription="slide"
            aria-label={t('slide', { current: index + 1, total: BANNERS.length })}
            aria-hidden={index !== active}
            className={cn(
              'absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none',
              index === active ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
          >
            <Image
              src={src}
              alt={t('promotionAlt', { name })}
              fill
              sizes="100vw"
              preload={index === 0}
              className="object-contain"
            />
          </div>
        ))}
      </div>
      <div className="border-store-line flex items-center justify-center gap-2 border-b px-4 py-1">
        <button
          type="button"
          className={controlClass}
          aria-label={t('previous')}
          onClick={() => select(active - 1)}
        >
          <ChevronLeft aria-hidden="true" className="size-5" />
        </button>
        {BANNERS.map((src, index) => (
          <button
            key={src}
            type="button"
            aria-label={t('goTo', { number: index + 1 })}
            aria-pressed={index === active}
            onClick={() => select(index)}
            className={controlClass}
          >
            <span
              className={cn(
                'h-2 rounded-full transition-all motion-reduce:transition-none',
                index === active ? 'bg-store-accent w-7' : 'bg-store-ink/30 w-2',
              )}
            />
          </button>
        ))}
        <button
          type="button"
          className={controlClass}
          aria-label={t('next')}
          onClick={() => select(active + 1)}
        >
          <ChevronRight aria-hidden="true" className="size-5" />
        </button>
        {!reducedMotion && (
          <button
            type="button"
            data-rotation-control
            className={controlClass}
            aria-label={t(paused ? 'play' : 'pause')}
            onClick={() => setPaused((value) => !value)}
          >
            {paused ? (
              <Play aria-hidden="true" className="size-4" />
            ) : (
              <Pause aria-hidden="true" className="size-4" />
            )}
          </button>
        )}
        <span className="sr-only" aria-live={playing ? 'off' : 'polite'} aria-atomic="true">
          {t('slide', { current: active + 1, total: BANNERS.length })}
        </span>
      </div>
    </section>
  );
}
