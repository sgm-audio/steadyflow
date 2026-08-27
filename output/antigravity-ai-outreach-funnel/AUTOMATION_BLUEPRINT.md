# Automation Blueprint

## 1. Business-idea qualification

Collect:

- Existing skills and experience
- Available weekly hours
- Preferred delivery mode: writing, design, sales, operations, or video
- Comfort with outbound prospecting
- Desired business model
- Existing audience or professional network

Score candidate services across ease, speed, validation, competition, and longevity. Produce a recommended offer, ideal buyer, visible buying signals, sample deliverable, transcript-supported pricing direction, and first-client action plan.

Never present the recommendation or income potential as guaranteed.

## 2. Signal-based lead enrichment

Enrich leads only when at least one observable signal exists:

- Founder posts frequently but receives weak engagement
- Brand runs relatively few advertising creatives
- Brand captures email but sends weak or inconsistent follow-up
- Creator has an audience but no visible offer
- Founder attempted YouTube but does not maintain the channel
- Business invests in SEO but lacks visible AI-search positioning

Recommended CRM fields:

- `lead_id`
- `company`
- `contact_name`
- `contact_role`
- `source_url`
- `signal_type`
- `signal_evidence`
- `problem_visibility_score`
- `ability_to_pay_score`
- `decision_maker_access_score`
- `sample_opportunity_score`
- `consent_status`
- `suppression_status`
- `human_review_status`
- `next_action`

## 3. Funnel routing

```text
Qualified lead
  -> human evidence review
  -> approved hand-raiser draft
  -> binary reply
  -> qualification form
  -> personalized plan
  -> training registration
  -> engaged lead
  -> optional strategy-call invitation
```

Suggested reply tags: `YES`, `NO`, `NO_RESPONSE`, `SUPPRESSED`, and `NEEDS_REVIEW`.

## 4. Automation boundaries

- Do not send unless consent, suppression, jurisdictional, and human-review gates pass.
- Do not scrape or contact random addresses merely to increase volume.
- Keep every generated email in draft state until approved.
- Record the source URL and evidence for each buying signal.
- Do not infer revenue, budget, or buying authority without evidence.
- Do not claim a deadline, limited capacity, testimonial, or result unless verified.
- Provide a visible unsubscribe or suppression mechanism where applicable.

## 5. Measurement

Track:

- Leads researched
- Leads passing evidence review
- Drafts approved
- Messages actually sent
- Binary reply rate
- Qualification completion rate
- Plan completion rate
- Training registration and attendance
- Strategy calls booked
- Qualified opportunities
- Clients won

Prepared assets, approved drafts, and sent messages must be reported as separate counts.
