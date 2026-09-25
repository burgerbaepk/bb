'use server';

import Anthropic from '@anthropic-ai/sdk';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { DateRange } from '@natech/contracts';
import { readAdvanceBalances, readAdvanceEntries } from '../advances/queries';
import { readMonth } from '../attendance/queries';
import { daysElapsed, formatHours, monthBounds, summariseMonth } from '../attendance/register';
import { assertPermission, requireOperator } from '../auth/session';
import { readDemandSheets } from '../demand/queries';
import { readExpenses } from '../expenses/queries';
import { readCurrentBusinessDate } from '../outlet/queries';
import { readExceptions } from '../reports/exceptions';
import { readCoversPerWaiter, readFloorPerformance } from '../reports/floor';
import {
  readCategoryMix,
  readChannelMix,
  readItemSales,
  readPaymentMix,
  readSalesByDate,
} from '../reports/sales';
import { readTaxLiability } from '../reports/tax';
import { showQty } from '../stock/ledger';
import { readStock } from '../stock/queries';
import { canUseAssistant } from './access';
import { toModelJson } from './serialise';

/**
 * The back-office assistant — ADR 0031.
 *
 * **Read-only, and that is the whole design.** Every tool below is an existing
 * §17 report query, called exactly as its own screen calls it, so the figure
 * the assistant quotes and the figure on `/admin/reports` are one number (R16).
 * No tool writes. There is therefore no R7 audit row to write and no R5/R9
 * surface to guard: the assistant cannot void, refund, discount, change a
 * price or touch an invoice, because it holds nothing that could. A request
 * to give it a write tool is a new ADR, not an edit here.
 *
 * Conversation state lives in the browser and is sent back whole each turn.
 * Nothing is stored — no table, no migration, no contract change after the
 * Phase 1 freeze (§0 rule 4).
 */

const MODEL = 'claude-opus-5';
/** A long year, so "this year against last" is one call and a runaway range is not. */
const MAX_RANGE_DAYS = 366;
/** Enough for a real conversation; bounds what one browser can make the server send. */
const MAX_TURNS = 24;
const MAX_TURN_CHARS = 4000;

const BusinessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const Range = z
  .object({
    from: BusinessDate.describe('First business date, inclusive (YYYY-MM-DD).'),
    to: BusinessDate.describe('Last business date, inclusive (YYYY-MM-DD).'),
  })
  .refine((r) => r.from <= r.to, 'from must not be after to')
  .refine(
    (r) => (Date.parse(r.to) - Date.parse(r.from)) / 86_400_000 < MAX_RANGE_DAYS,
    `A range may cover at most ${MAX_RANGE_DAYS} days.`,
  );

const toRange = (r: { from: string; to: string }): DateRange => ({
  fromBusinessDate: r.from,
  toBusinessDate: r.to,
});

/** One report query as one tool. The description is what the model chooses by. */
function report(name: string, description: string, read: (r: z.infer<typeof Range>) => unknown) {
  return betaZodTool({
    name,
    description,
    inputSchema: Range,
    run: async (input) => toModelJson(await read(input)),
  });
}

const TOOLS = [
  report(
    'sales_by_date',
    'Daily totals from finalized invoices: invoice count, covers, net sales, tax collected, service and delivery charges, gross takings.',
    (r) => readSalesByDate(toRange(r)),
  ),
  report('item_sales', 'Quantity sold and net sales per menu item.', (r) =>
    readItemSales(toRange(r)),
  ),
  report('category_mix', 'Net sales per menu category.', (r) => readCategoryMix(toRange(r))),
  report('channel_mix', 'Sales split by order channel (POS till, web, phone).', (r) =>
    readChannelMix(toRange(r)),
  ),
  report('payment_mix', 'Takings split by payment method (cash, card, wallet, QR).', (r) =>
    readPaymentMix(toRange(r)),
  ),
  report(
    'exceptions',
    'Voids, refunds, discounts, overrides and bills shown to a customer but never finalized, with who did each and who approved it.',
    (r) => readExceptions(toRange(r)),
  ),
  report('expenses', 'Recorded expenses: date, category, vendor, description, amount.', (r) =>
    readExpenses(r.from, r.to),
  ),
  report('demand_sheets', 'Demand (shopping) sheets raised by managers, and their status.', (r) =>
    readDemandSheets(r.from, r.to),
  ),
  report('floor_performance', 'Per-table turns, occupied time and revenue per seat-hour.', (r) =>
    readFloorPerformance(toRange(r)),
  ),
  report('covers_per_waiter', 'Covers and sales per waiter.', (r) =>
    readCoversPerWaiter(toRange(r)),
  ),
  // M26–M28 — the people and stock modules, read-only like everything here.
  report(
    'staff_advances',
    "Staff advances: every person's advanced, recovered and outstanding balance to date, plus the advance and recovery entries dated within the range. Advances are owed back and are not expenses.",
    async (r) => ({
      balances: await readAdvanceBalances(),
      entries: (await readAdvanceEntries(r.from)).filter((entry) => entry.occurredOn <= r.to),
    }),
  ),
  betaZodTool({
    name: 'attendance_month',
    description:
      'Staff attendance for one calendar month: per person, days present, absent, on leave and off, days nobody marked so far, and hours worked. Records attendance only; it does not calculate pay.',
    inputSchema: z.object({
      month: z
        .string()
        .regex(/^\d{4}-\d{2}$/, 'YYYY-MM')
        .describe('Calendar month (YYYY-MM).'),
    }),
    run: async ({ month }) => {
      const { first, last } = monthBounds(month);
      const [data, today] = await Promise.all([readMonth(first, last), readCurrentBusinessDate()]);
      return toModelJson(
        summariseMonth(data.people, data.rows, daysElapsed(month, today)).map(
          ({ employeeId: _id, minutes, ...person }) => ({ ...person, hours: formatHours(minutes) }),
        ),
      );
    },
  }),
  betaZodTool({
    name: 'stock_on_hand',
    description:
      'Stock on the book now, per catalogue item that has ever moved: quantity, unit, list and last movement date. It is not linked to sales, so it is only as current as the last delivery, issue and count recorded.',
    inputSchema: z.object({}),
    // Quantities go as display strings, never raw `Qty`: `toModelJson` reads
    // every bigint not named `qty…` as paisa, and would divide a stock level
    // by a hundred instead of a thousand.
    run: async () =>
      toModelJson(
        (await readStock()).flatMap((row) =>
          row.onHand === null
            ? []
            : [
                {
                  item: row.name,
                  list: row.category,
                  onHand: showQty(row.onHand),
                  unit: row.unit,
                  lastMovedOn: row.lastMovedOn,
                },
              ],
        ),
      ),
  }),
  report(
    'tax_liability',
    'Taxable value and tax collected per rate, from finalized invoices.',
    (r) => readTaxLiability(toRange(r)),
  ),
];

const SYSTEM = `You are the back-office assistant for a single restaurant in Pakistan, speaking to its owner or manager.

Answer from the tools, never from memory. Every figure you give must come from a tool result in this conversation; if the tools cannot answer, say so plainly and name the back-office screen that might.

Money in tool results is Pakistani rupees as a decimal string ("1250.50" is Rs 1,250.50). Write amounts as "Rs 1,250". Quantities are decimal strings.

Figures come only from finalized invoices. Open orders are not sales yet.

You can read reports but cannot change anything. If asked to void, refund, discount, edit the menu or change a setting, explain where in the back office to do it.

Be brief. Lead with the answer, then at most a few lines of supporting figures. Suggest one practical action when the numbers point to one. Reply in the language the user writes in (English or Urdu).`;

export interface AssistantTurn {
  readonly role: 'user' | 'assistant';
  readonly text: string;
}

const Conversation = z
  .array(
    z.object({ role: z.enum(['user', 'assistant']), text: z.string().min(1).max(MAX_TURN_CHARS) }),
  )
  .min(1)
  .max(MAX_TURNS)
  .refine((turns) => turns[0]?.role === 'user' && turns.at(-1)?.role === 'user', {
    message: 'A conversation starts and ends with the user.',
  });

export type AssistantReply =
  { readonly ok: true; readonly text: string } | { readonly ok: false; readonly error: string };

export async function askAssistantAction(turns: readonly AssistantTurn[]): Promise<AssistantReply> {
  const operator = await requireOperator();
  // §14.1 — the shell hid the button; this is the check that counts.
  if (!canUseAssistant(operator.role)) {
    return { ok: false, error: 'The assistant is for owners and managers.' };
  }
  assertPermission(operator, 'reports.read');

  const parsed = Conversation.safeParse(turns);
  if (!parsed.success)
    return { ok: false, error: 'That conversation is too long. Start a new one.' };

  // Unset key is a deployment choice, not a fault — the outlet runs without it.
  if (process.env['ANTHROPIC_API_KEY'] === undefined) {
    return { ok: false, error: 'The assistant is not configured on this deployment.' };
  }

  const today = await readCurrentBusinessDate();

  try {
    const message = await new Anthropic().beta.messages.toolRunner({
      model: MODEL,
      max_tokens: 16000,
      // A chat panel between services: medium keeps replies quick, and the
      // tools, not the reasoning, carry the facts.
      output_config: { effort: 'medium' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      max_iterations: 8,
      system: `${SYSTEM}\n\nToday's business date is ${today}. Signed in: ${operator.displayName} (${operator.role}).`,
      tools: TOOLS,
      messages: parsed.data.map((turn) => ({ role: turn.role, content: turn.text })),
    });

    if (message.stop_reason === 'refusal') {
      return { ok: false, error: 'The assistant could not answer that one.' };
    }
    const text = message.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('\n')
      .trim();
    return text === ''
      ? { ok: false, error: 'The assistant did not reply. Try asking again.' }
      : { ok: true, text };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: false, error: 'The assistant is busy. Try again in a minute.' };
    }
    if (error instanceof Anthropic.APIError) {
      console.error('assistant: API error', error.status, error.message);
      return { ok: false, error: 'The assistant is unavailable right now.' };
    }
    throw error;
  }
}
