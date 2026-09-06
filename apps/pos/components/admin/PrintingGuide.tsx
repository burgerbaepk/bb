'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, Info, Printer, TriangleAlert } from 'lucide-react';
import { Button, SegmentedControl } from '@natech/ui';

type Browser = 'chrome' | 'edge' | 'firefox';
type Platform = 'windows' | 'macos' | 'linux';

const COMMANDS: Record<Platform, Partial<Record<Browser, string>>> = {
  windows: {
    chrome:
      '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --kiosk --kiosk-printing APP_URL',
    edge: '"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --kiosk APP_URL --kiosk-printing',
  },
  macos: {
    chrome: 'open -a "Google Chrome" --args --kiosk --kiosk-printing APP_URL',
    edge: 'open -a "Microsoft Edge" --args --kiosk --kiosk-printing APP_URL',
  },
  linux: {
    chrome: 'google-chrome --kiosk --kiosk-printing APP_URL',
    edge: 'microsoft-edge --kiosk APP_URL --kiosk-printing',
  },
};

export function PrintingGuide() {
  const [browser, setBrowser] = useState<Browser>('chrome');
  const [platform, setPlatform] = useState<Platform>('windows');
  const [copied, setCopied] = useState(false);
  const command = useMemo(() => COMMANDS[platform][browser], [browser, platform]);

  async function copyCommand() {
    if (command === undefined) return;
    await navigator.clipboard.writeText(command.replace('APP_URL', window.location.origin));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-6">
      <section className="border-border bg-surface-raised rounded-base border p-4 sm:p-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="bg-surface-sunken text-primary rounded-base p-2">
            <Printer aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">Printer setup</h2>
            <p className="text-ink-muted text-sm">
              Use a thermal receipt printer set as this device’s default printer.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="border-border rounded-base border p-3 text-sm">
            <p className="font-medium">Receipt roll width</p>
            <p className="text-ink-muted mt-1">
              Match the POS setting to the paper loaded in your printer.
            </p>
            <Link
              className="text-primary mt-2 inline-block font-medium underline underline-offset-2"
              href="/admin/settings?section=receipt"
            >
              Choose paper width
            </Link>
          </div>
          <div className="border-info bg-info-soft text-info rounded-base border p-3 text-sm">
            <Info aria-hidden="true" className="mb-2 size-4" />
            Print a test page from your computer first. If that works, the POS can use the same
            printer.
          </div>
        </div>
      </section>

      <section className="border-border bg-surface-raised rounded-base border p-4 sm:p-5">
        <h2 className="font-semibold">Print without the browser dialog</h2>
        <p className="text-ink-muted mt-1 text-sm">
          Choose this till’s browser and operating system. Firefox does not support this launch
          method.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <SegmentedControl
            label="Browser"
            value={browser}
            onChange={(value) => setBrowser(value as Browser)}
            options={[
              { value: 'chrome', label: 'Chrome' },
              { value: 'edge', label: 'Edge' },
              { value: 'firefox', label: 'Firefox' },
            ]}
          />
          <SegmentedControl
            label="Operating system"
            value={platform}
            onChange={(value) => setPlatform(value as Platform)}
            options={[
              { value: 'windows', label: 'Windows' },
              { value: 'macos', label: 'macOS' },
              { value: 'linux', label: 'Linux' },
            ]}
          />
        </div>

        {command === undefined ? (
          <div className="border-warn bg-warn-soft text-warn mt-4 rounded-base border p-3 text-sm">
            <TriangleAlert aria-hidden="true" className="me-2 inline size-4" />
            Use Chrome or Edge for dialog-free receipt printing. Firefox will show the print dialog.
          </div>
        ) : (
          <div className="border-border bg-surface-sunken mt-4 rounded-base border p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-ink-muted text-xs font-semibold uppercase">Launch command</p>
              <Button size="sm" icon={copied ? Check : Copy} onClick={copyCommand}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <code className="block overflow-x-auto text-xs leading-5">
              {command.replace(
                'APP_URL',
                typeof window === 'undefined' ? 'YOUR_POS_URL' : window.location.origin,
              )}
            </code>
          </div>
        )}

        <ol className="mt-5 space-y-3 text-sm">
          {[
            'Set the receipt printer as the computer’s default printer and print a test page.',
            `Close every ${browser === 'edge' ? 'Edge' : browser === 'chrome' ? 'Chrome' : 'Firefox'} window.`,
            'Create a desktop shortcut using the command above, then always open the till from that shortcut.',
            'Complete a test sale and confirm the receipt prints once, at the correct width.',
          ].map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="bg-surface-sunken text-primary flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-warn bg-warn-soft rounded-base border p-4">
        <h2 className="text-warn flex items-center gap-2 font-semibold">
          <TriangleAlert aria-hidden="true" className="size-4" />
          Before you start
        </h2>
        <ul className="text-ink-muted mt-2 list-disc space-y-1 ps-5 text-sm">
          <li>Dialog-free printing always uses the computer’s default printer.</li>
          <li>A wrong roll width causes clipped text or wide margins.</li>
          <li>
            Kiosk mode hides browser controls; press Alt + F4 on Windows/Linux or Command + Q on
            macOS to exit.
          </li>
        </ul>
      </section>
    </div>
  );
}
