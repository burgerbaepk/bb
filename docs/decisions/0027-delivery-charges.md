# Delivery addresses and charges

Selecting Delivery in the POS shows a required order-specific address (up to 1,000 characters) and an optional fixed charge in rupees. Blank charges mean zero; amounts support two decimal places and must be between zero and Rs. 1,000,000. Dine-in and takeaway totals ignore delivery charges. A saved order retains its type; start a new order to change it.

The address and charge persist on the order, including when staff save changes without adding items. Updates require till staff with payment permission, lock the order against concurrent finalization, and produce an audit event. Closed orders refuse updates. The invoice snapshots the charge at finalization and existing invoice immutability protects it.

Pricing adds delivery after discounts and tax, before final rounding. This is an explicit product assumption: delivery charges are not discounted or taxed. The pricing engine is version 1.1.0. Changing delivery tax treatment later requires a separate policy change.

Checkout, payment previews, booked-order breakdowns, HTML invoices, bill previews, physical invoice printing, offline receipts, and replay use the same charge. Offline payloads retain decimal paisa strings; old queued payloads without delivery fields remain compatible and default to zero. Daily sales and CSV exports show delivery separately. Full credits and register reconciliation already use invoice grand totals and therefore include delivery.

Migration `0006_real_venom.sql` adds order address, order charge, and invoice charge. Existing charges default to zero and existing addresses remain null. Deployments must apply the migration before running the updated application.
