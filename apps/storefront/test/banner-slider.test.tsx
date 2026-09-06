import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { BannerSlider } from '@/components/BannerSlider';
import en from '../messages/en.json';

function renderSlider(reducedMotion = false) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: reducedMotion,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <BannerSlider name="Test Kitchen" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function advance() {
  act(() => {
    vi.advanceTimersByTime(6000);
  });
}

describe('homepage banners', () => {
  it('rotates the two supplied banners and wraps back to the first', () => {
    renderSlider();
    expect(screen.getByRole('group', { name: 'Slide 1 of 2' })).toBeInTheDocument();
    advance();
    expect(screen.getByRole('group', { name: 'Slide 2 of 2' })).toBeInTheDocument();
    advance();
    expect(screen.getByRole('group', { name: 'Slide 1 of 2' })).toBeInTheDocument();
  });

  it('supports next, previous, dots and keyboard navigation without auto-advancing afterwards', () => {
    renderSlider();
    fireEvent.click(screen.getByRole('button', { name: 'Next banner' }));
    expect(screen.getByRole('button', { name: 'Show banner 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    advance();
    expect(screen.getByRole('group', { name: 'Slide 2 of 2' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Previous banner' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Next banner' }), { key: 'ArrowRight' });
    expect(screen.getByRole('group', { name: 'Slide 2 of 2' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show banner 1' }));
    expect(screen.getByRole('group', { name: 'Slide 1 of 2' })).toBeInTheDocument();
  });

  it('pauses on hover and focus, and allows explicit pause and resume', () => {
    renderSlider();
    const carousel = screen.getByRole('region', { name: 'Featured offers' });
    fireEvent.mouseEnter(carousel);
    advance();
    expect(screen.getByRole('group', { name: 'Slide 1 of 2' })).toBeInTheDocument();
    fireEvent.mouseLeave(carousel);
    fireEvent.focus(screen.getByRole('button', { name: 'Next banner' }));
    advance();
    expect(screen.getByRole('group', { name: 'Slide 1 of 2' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play slideshow' }));
    advance();
    expect(screen.getByRole('group', { name: 'Slide 2 of 2' })).toBeInTheDocument();
    const pause = screen.getByRole('button', { name: 'Pause slideshow' });
    fireEvent.focus(pause);
    fireEvent.click(pause);
    advance();
    expect(screen.getByRole('group', { name: 'Slide 2 of 2' })).toBeInTheDocument();
  });

  it('respects reduced motion while keeping manual navigation available', () => {
    renderSlider(true);
    advance();
    expect(screen.getByRole('group', { name: 'Slide 1 of 2' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause slideshow' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next banner' }));
    expect(screen.getByRole('group', { name: 'Slide 2 of 2' })).toBeInTheDocument();
  });

  it('supports a horizontal swipe', () => {
    renderSlider();
    const slide = screen.getByRole('group', { name: 'Slide 1 of 2' });
    fireEvent.touchStart(slide, { touches: [{ clientX: 250 }] });
    fireEvent.touchEnd(slide, { changedTouches: [{ clientX: 100 }] });
    expect(screen.getByRole('group', { name: 'Slide 2 of 2' })).toBeInTheDocument();
  });
});
