# Square Payment & Contract — Operations Runbook

> Scope: How we **actually take money** for the Shopify Revenue Leak Audit.
> Services-led, manual-first, sole-prop Saskatoon SK. **No live checkout is
> wired in code** — every transaction is initiated and confirmed by hand until
> the hivyr.io spike validates automation.
>
> Anything that says "ship it" here means *operator action*, not code.

## The offer (locked, do not improvise)

| Field | Value |
|---|---|
| Service | Shopify Revenue Leak Audit |
| Price | **$1,500 USD** (or CAD equivalent at invoice) |
| Deposit | **$500** — credited against the final invoice, non-refundable once the audit starts |
| Balance | **$1,000** — due on delivery of the 200-pt report |
| Delivery | ~72h from kickoff (working days, Saskatchewan time) |
| Currency | USD preferred; CAD acceptable on request |
| Tax (CAD customers) | **GST 5% + SK PST 6%** shown as separate lines on the invoice; HST provinces get the combined rate |

Do **not** quote or promise a different shape (no payment plans, no monthly
retainer for the audit itself, no upsells before the audit is delivered).
Priority Fix Sprint and Optimization Partnership are *post-audit* offers and
have their own runsheets.

## Channels (in priority order)

| Step | Channel | Why | When to use |
|---|---|---|---|
| 1 | **hivyr.io** (Square Invoices) | Single source of truth for invoice + payment + contract + e-sign in one URL | Every audit unless customer explicitly asks for alternatives |
| 2 | **Square Contracts** (standalone) | Backup if hivyr.io misbehaves | Only if hivyr rejects a customer or fails to send |
| 3 | **Docusign** (fallback contract) + Square invoice | Contract e-sign + payment kept separate | Only on customer request |

> **Never** send a Stripe link, a bank-transfer-only request, or an
> Interac-e-Transfer request. Those bypass the audit trail and the tax lines.

## The end-to-end run (manual-first)

```
[1] Lead says yes
    ↓
[2] Open hivyr.io  →  create customer (legal name, email, billing address)
    ↓
[3] Create Invoice #1: $500 deposit, due-on-receipt, tax lines auto
    ↓
[4] Create Square Contract: scope + 72h SLA + IP assignment + confidentiality
    ↓
[5] Send BOTH links in one email — contract first, invoice second
    ↓
[6] Wait for: signed contract + paid deposit
    ↓
[7] Kickoff email: gather Shopify store URL, collaborator request, read-only
    API scopes (read_orders, read_products, read_inventory, read_apps)
    ↓
[8] Run audit (see docs/runbooks/audit-pipeline.md)
    ↓
[9] Create Invoice #2: $1,000 balance (deposit is already credited — DO NOT
    subtract on the invoice; the deposit invoice is closed/reconciled in
    Square and the second invoice is for the remaining balance)
    ↓
[10] Deliver report  →  on payment confirmation, close-out email
```

> ponytail: deposit is "credited" in *messaging*, not in *invoicing*. The
> $500 deposit invoice is closed when paid; the $1,000 balance invoice is
> drawn against the remaining work. This keeps Square's accounting clean
> and matches what the customer actually sees on their card statement.

## Tax lines (Saskatchewan / Canada)

| Customer in | Tax lines on invoice |
|---|---|
| SK | GST 5% + PST 6% (two separate lines, $75 + $90 on $1,000; $25 + $30 on $500) |
| AB / BC / rest of non-HST | GST 5% only on the balance at provincial rate |
| ON / NB / NL / NS / PE | HST 13–15% (single line, Square picks it up automatically) |
| QC | GST 5% + QST 9.975% (two lines, Square picks it up automatically) |
| US | No tax — federal income only, customer handles use tax |
| International (non-US, non-Canadian) | Zero-rated, GST/PST lines off |

> Double-check the tax-line preview before sending. Square's automatic
> detection is right ~95% of the time but has been wrong on PE and NB.

## E-sign verification (every time)

After the customer "signs":

1. Open the contract PDF in the Square Dashboard.
2. Confirm the **signed-by** email matches the address on the invoice.
3. Confirm the **signature timestamp** is before the deposit was paid (if it
   isn't, refund the deposit, re-send the contract, wait for re-sign).
4. Save the signed PDF to the engagement folder (`output/engagements/<YYYY-MM-DD>-<shop>/contract.pdf`).

If any of these fail, do not start the audit.

## What "done" looks like

- Both invoices **paid** in Square (not "scheduled", not "pending").
- Signed contract PDF + both invoice PDFs in the engagement folder.
- Report delivered, acknowledgement received.
- Engagement entry added to the spreadsheet (date, shop, USD/CAD, tax lines,
  payment IDs, contract ID, follow-up date for the Priority Fix Sprint pitch
  at +14 days).

## Failure modes

### Customer asks for a payment plan
- Decline politely. The audit is $1,500 with a $500 deposit; the deposit
  IS the plan. Re-route to the post-audit Priority Fix Sprint if cash-flow
  is the actual blocker.

### Customer wants to pay in crypto / wire / Interac e-Transfer only
- Decline. These bypass the contract e-sign and the tax-line audit trail.
- If they push: offer to invoice via Docusign + Square invoice as the
  fallback path (step 3 above). If they still refuse, **no engagement**.

### hivyr.io is down or rejects the customer
- Fall back to Square Contracts (step 2). Do not skip the e-sign.
- Log the incident in `docs/runbooks/incidents.md` (create the file if
  it doesn't exist yet).

### Customer is in Quebec and wants the French contract
- We don't have a French contract version yet. Offer the English contract
  plus a side-channel email summary in French. **TODO**: commission a
  French version before any Quebec-led outreach.

### Refund request mid-audit
- The $500 deposit is non-refundable once the audit starts (contract clause).
- The $1,000 balance can be refunded if we miss the 72h SLA and the customer
  asks within 7 days of delivery — refund via Square, log the incident, fix
  the root cause.

## Numbers we do not invent

- "Average revenue lift", "typical audit outcome", "client X saw Y%".  None of
  these are real until we have a permissioned, signed delivery and the
  customer agrees in writing to be cited. Until then, marketing copy stays
  qualitative.

## What's deliberately not in this runbook yet

- A live Square Checkout button on the marketing site.  Blocked on
  `hivyr.io` automation spike (TODO D1.next).
- Subscription billing for the Optimization Partnership (different offer,
  different runbook — to be written when that offer ships).
- Recurring invoicing for monthly retainers — not in v0.x scope.
