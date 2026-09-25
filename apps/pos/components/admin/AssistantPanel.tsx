'use client';

import { Sparkles, SendHorizontal, RotateCcw } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Button, IconButton, Sheet, TextAreaField, cn } from '@natech/ui';
import { askAssistantAction, type AssistantTurn } from '@/lib/assistant/actions';

/**
 * The assistant, on every back-office screen — ADR 0031.
 *
 * A trailing sheet rather than a page, so the owner can ask "why is today
 * down?" while looking at the screen that prompted the question. The
 * conversation is component state: closing the sheet keeps it, a reload clears
 * it, and nothing about it is stored on the server.
 */
const SUGGESTIONS = [
  'How did we do today compared with the same day last week?',
  'What were the best and worst selling items this month?',
  'Any voids, refunds or unfinalized bills this week I should look at?',
  'What did we spend against what we took in the last 7 days?',
];

export function AssistantPanel() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ask = (question: string) => {
    const text = question.trim();
    if (text === '' || pending) return;
    const next: AssistantTurn[] = [...turns, { role: 'user', text }];
    setTurns(next);
    setDraft('');
    setError(null);
    startTransition(async () => {
      const reply = await askAssistantAction(next);
      if (reply.ok) {
        setTurns([...next, { role: 'assistant', text: reply.text }]);
      } else {
        // The question goes back into the box rather than sitting unanswered
        // in the transcript, where the next turn would send it twice.
        setTurns(turns);
        setDraft(text);
        setError(reply.error);
      }
    });
  };

  return (
    <>
      <Button
        tone="primary"
        icon={Sparkles}
        onClick={() => setOpen(true)}
        className="fixed bottom-4 end-4 z-40 shadow-lg"
      >
        Assistant
      </Button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Assistant"
        description="Asks the reports for you. It can read figures but cannot change anything."
        footer={
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              ask(draft);
            }}
          >
            <div className="min-w-0 flex-1">
              <TextAreaField
                label="Your question"
                rows={2}
                value={draft}
                onChange={setDraft}
                placeholder="Ask about sales, items, expenses, voids…"
                {...(error === null ? {} : { error })}
              />
            </div>
            <IconButton
              icon={SendHorizontal}
              label="Send"
              type="submit"
              tone="primary"
              disabled={pending || draft.trim() === ''}
            />
          </form>
        }
      >
        <div className="flex flex-col gap-3 p-4" aria-live="polite">
          {turns.length === 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-ink-muted text-sm">Try one of these:</p>
              {SUGGESTIONS.map((suggestion) => (
                <Button
                  key={suggestion}
                  tone="secondary"
                  size="sm"
                  onClick={() => ask(suggestion)}
                  className="h-auto justify-start py-2 text-start whitespace-normal"
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          ) : (
            turns.map((turn, index) => (
              <p
                key={index}
                className={cn(
                  'max-w-[90%] rounded-md px-3 py-2 text-sm whitespace-pre-wrap',
                  turn.role === 'user'
                    ? 'bg-primary text-primary-ink self-end'
                    : 'bg-surface-sunken text-ink self-start',
                )}
              >
                {turn.text}
              </p>
            ))
          )}
          {pending ? <p className="text-ink-subtle text-sm">Reading the reports…</p> : null}
          {turns.length > 0 && !pending ? (
            <Button
              tone="ghost"
              size="sm"
              icon={RotateCcw}
              onClick={() => {
                setTurns([]);
                setError(null);
              }}
              className="self-start"
            >
              New conversation
            </Button>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}
