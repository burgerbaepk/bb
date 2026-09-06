# print-bridge

Local ESC/POS agent. BUILD-PLAN.md §12.

Scaffolded in M00, implemented in M10. Rasterization for Urdu (§15.3) lands in M15.

Three print paths exist and all three are built; the active one is selectable
per terminal in Settings:

1. **print-bridge (this package) — primary.** Owns the queue, paper-out, retry,
   and offline buffering. Without it, a paper jam silently loses a print job.
2. **WebUSB / WebSerial — fallback.** Chrome only, gesture-gated.
3. **80mm HTML + browser print dialog — universal fallback.**

Two templates: **check** and **tax invoice**. The two must be distinguishable
at a glance — R17.
