# Archived Documents

This directory contains documents that have been **superseded** by the current v1 Scope Decision and are kept for historical reference only.

## `PUBLIC_RELEASE_PROMPT_CHAIN.md`

**Archived:** 2026-08-03
**Superseded by:** [v1 Scope Decision](../SURFACE_MATRIX.md#recommended-v100-scope)

This document described a public open-source release program (Apache-2.0 license, npm publishing, OSS governance, public SDK, etc.) that was **not approved**. The v1 Scope Decision locks SteadyFlow to a **private pilot** model:

- **License:** UNLICENSED (proprietary) — no public OSS program
- **SDK:** Internal build artifact only — no public npm publishing
- **Governance:** No public CODEOWNERS, Contributor Covenant, or Discussions
- **Scope:** Three pillars only — everything else is experimental

The prompt chain remains here as a reference for a **future productization program** that may be executed after the commercial and reliability gates are met (3 paid audits, 1 paid sprint, 1 recurring monitoring customer, >70% gross margin, >30% audit-to-sprint conversion).

**Do not execute the prompts in this document against the current codebase.** They reference packages (`packages/sdk`, `packages/contracts`, `packages/crypto`) and surfaces (Drizzle ORM, public npm publishing, OSS governance) that are explicitly out of scope for v1.
