/**
 * Terminals — BUILD-PLAN.md §5.2, §14.2.
 *
 * §14.2 binds a shift to a terminal, so at least one has to exist before
 * anybody can sign in. One `PRIMARY` till is seeded for that reason and no
 * other: a deployment with two tills registers the second from the back office,
 * where the change is audited and attributable.
 *
 * `fbr_pos_id` is deliberately null. §7.3 transmits it as `bposid`, and the
 * number is issued by FBR against this deployment's NTN — inventing one would
 * put a fabricated registration on a fiscal document. M11 fills it in when the
 * registration comes back.
 *
 * The label is generic on purpose. A till named after the restaurant would be
 * client identity in source, which R12 and the brand-grep gate exist to stop.
 */
export interface TerminalSeed {
  readonly label: string;
  readonly posType: 'PRIMARY' | 'SECONDARY';
}

export const TERMINALS: readonly TerminalSeed[] = [{ label: 'Till 1', posType: 'PRIMARY' }];
