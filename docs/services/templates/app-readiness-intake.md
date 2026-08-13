# App Readiness Intake Template

Use at the start of every Shopify App Store Readiness Audit engagement.

## Client / app

- Client name:
- Contact email:
- App name:
- App type: ☐ Embedded public app ☐ Online-store extension ☐ Theme app extension ☐ Other (specify):
- Partner organization name / handle:
- Prior submission? ☐ No ☐ Yes — attach prior review feedback:

## Qualification gate

- [ ] App targets a **public** App Store listing (not custom/private).
- [ ] Repository read access available.
- [ ] App installable on a dev store.
- [ ] `shopify.app.toml` / `shopify.app.json` available.
- [ ] Privacy policy URL and support URL known (or will be provided).
- [ ] No legal/compliance/security-certification requirement (refer out if present).
- [ ] Client understands this is a risk-reduction assessment, not an approval guarantee.

Tier selected: ☐ Static readiness review ☐ Full technical + manual readiness audit

## Access

| Asset | Provided? | Notes / link |
|---|---|---|
| Repository (read) | ☐ | |
| `shopify.app.toml` / `.json` | ☐ | |
| Scopes list | ☐ | |
| OAuth redirect URIs | ☐ | |
| Webhook definitions | ☐ | |
| Extension configs | ☐ | |
| Dev store access | ☐ | |
| Partner Dashboard (listing draft) | ☐ | |
| Prior review feedback | ☐ | |

## Documents collected

- [ ] `shopify.app.toml` / `shopify.app.json`
- [ ] Scopes + OAuth redirect URIs
- [ ] Webhooks (topics + endpoints)
- [ ] Privacy policy URL
- [ ] Support URL
- [ ] App name + description (listing draft)
- [ ] Extension manifests (if theme extension)

## Scan configuration (to assemble)

- commit SHA / tag being reviewed:
- App name:
- App description:
- App version:
- API version:
- Embedded: ☐ true ☐ false
- Scopes (list):
- OAuth redirect URIs (list):
- Webhooks (list):
- Extensions (type + handle):
- Privacy policy URL:
- Support URL:
- Development URLs (if any):
- Mutations (direct DB/mutation flags, if known):
- External dependencies (list):

## Assumptions to record

- App type / applicability assumption:
- Anything the client could not provide (and how the operator handled it):

## Signed off

- Operator:
- Date:
- Tier + fee agreed:
