/**
 * @natech/ui — the design system. BUILD-PLAN.md §18 M01.
 *
 * Three §2 rules are structural here rather than advisory:
 *
 *   R1   `Money` is the render boundary. It takes bigint paisa and formats by
 *        integer arithmetic, so no float exists anywhere in the path.
 *   R13  `Duration` clamps at zero. A caller cannot render `-08:20`.
 *   R15  `StatusPill` requires an icon and a label. Colour alone is not
 *        expressible in the type.
 *
 * R16 is structural in `DataTable`: the header summary is a function of the
 * rows being rendered, so a header cannot disagree with its list.
 */

export { cn, type ClassValue } from './lib/cn';

export {
  Button,
  IconButton,
  type ButtonProps,
  type ButtonSize,
  type ButtonTone,
  type IconButtonProps,
} from './action/Button';
export {
  SegmentedControl,
  type SegmentOption,
  type SegmentedControlProps,
} from './action/SegmentedControl';
export { Switch, type SwitchProps } from './form/Switch';
export {
  FieldShell,
  SelectField,
  TextAreaField,
  TextField,
  type SelectFieldOption,
  type SelectFieldProps,
  type TextAreaFieldProps,
  type TextFieldProps,
} from './form/Field';

export { Money, type MoneyProps } from './money/Money';
export { formatPaisa, type FormatPaisaOptions } from './money/format';

export { Duration, type DurationProps } from './duration/Duration';
export {
  clampSeconds,
  durationState,
  formatDuration,
  formatOverdueBy,
  type DurationState,
  type DurationThresholds,
} from './duration/format';

export {
  StatusPill,
  TABLE_STATE_PRESETS,
  type PillTone,
  type StatusPillProps,
  type TableState,
  type TableStatePreset,
} from './status/StatusPill';

export { StatCard, type StatCardProps } from './stat/StatCard';

export { DataTable, type DataTableColumn, type DataTableProps } from './table/DataTable';

export { Dialog, type DialogProps } from './overlay/Dialog';
export { Sheet, type SheetProps, type SheetSide } from './overlay/Sheet';

export {
  NumericKeypad,
  digitsToPaisa,
  type KeypadMode,
  type NumericKeypadProps,
} from './input/NumericKeypad';

export { EmptyState, type EmptyStateProps } from './feedback/EmptyState';
export { ErrorState, type ErrorStateProps } from './feedback/ErrorState';
export { LoadingState, type LoadingStateProps } from './feedback/LoadingState';
export { OfflineBanner, type OfflineBannerProps } from './feedback/OfflineBanner';
export { ToastProvider, ToastRegion, useToast, type Toast, type ToastTone } from './feedback/Toast';
