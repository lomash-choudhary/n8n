# (Exp-Free-1) Freemium test with 50 prod exec — Implementation Plan

> Generated from [Notion spec](https://www.notion.so/08f5b6e0c94f834fb4ef815d7b318d93) on 2026-02-25

## Summary

This experiment gives up to 5,000 new cloud sign-ups a **free cloud plan
with 50 monthly production executions** (feature flag `064_free_tier_v1`,
variants `control` / `test`). The goal is to estimate real-world product
adoption of free-tier cloud users — specifically weekly UI activity,
activation rates, and production-execution distribution — so the team can
make informed decisions about the permanent free-plan spec (execution
limits, AI credits, inactivity clean-up policy).

The experiment is part of the broader *"(Exp Series) Estimate free cloud
plan product adoption"* initiative. It explicitly does **not** measure
conversion (no paywalls in place), inactivity-pausing impact, or
lower-resource impact — those are deferred to later iterations (Freemium
v2/v3).

**Current status:** Implementation is **complete** (Linear GRO-244 marked
Done 2026-02-17). The experiment is in the **Measuring** phase with the
PostHog flag active. This plan documents the work that was done and
identifies remaining open questions and risks.

## Tasks

### 1. Implementation

**Status: Complete** — All PRs merged across three repos. Effort: **M**
(medium).

- [x] Register experiment with PostHog feature flag `064_free_tier_v1`
      (variants: `control`, `test`)
- [x] Configure audience gating: max 5,000 total users, max 1,000 new
      users per day
- [x] **n8n core (PR [#25412](https://github.com/n8n-io/n8n/pull/25412))**
  - [x] Update `cloudPlans.ts` API client to support `bannerConfig`
        from cloud backend
  - [x] Update `cloudPlan.store.ts` to consume `bannerConfig` (fields:
        `timeLeft`, `showExecutions`, `dismissible`)
  - [x] Modify `TrialBanner.vue` to render cloud-controlled content
        (hide trial wording, show execution usage, non-dismissible)
  - [x] Add `plan-data-trial.json` Playwright fixture with
        `bannerConfig`
  - [x] Write unit tests for `cloudPlan.store` and `TrialBanner`
- [x] **n8n-cloud (PRs [#3029](https://github.com/n8n-io/n8n-cloud/pull/3029),
      [#3067](https://github.com/n8n-io/n8n-cloud/pull/3067),
      [#3070](https://github.com/n8n-io/n8n-cloud/pull/3070))**
  - [x] Create free-tier SKU / plan with 50 monthly prod executions
        and all Starter features
  - [x] Emit `User is part of experiment` telemetry event for freemium
        cohort
  - [x] Handle free plan like trial everywhere in dashboard backend
  - [x] Configure email suppression: stop trial-related emails, replace
        with upfront comms and pre-termination reminders
  - [x] Instance sleep support (nice-to-have)
- [x] **n8n-hosted-frontend (PR [#879](https://github.com/n8n-io/n8n-hosted-frontend/pull/879))**
  - [x] Handle freemium state on plan-change flows (upgrade button
        present, no trial language)
- [x] Roll out PostHog feature flag
- [x] Move experiment status to Measuring

### 2. Design

**Status: Not required as a separate task.** The spec references a
[Figma board](https://www.figma.com/board/d7vMW2C6oq9D0UDLEppuQo/Freemium-tests)
for shaping, and the UI changes were minimal (banner content control from
cloud). No dedicated design deliverables were needed beyond what was
captured in the Figma board.

### 3. Cleanup

**Status: Pending** — to be done after experiment results are analysed.

- [ ] Remove `064_free_tier_v1` feature flag from PostHog
- [ ] Decide on winning variant: if free tier is promoted, convert
      experiment code to permanent free-plan logic; if not, remove all
      experiment-specific code
- [ ] Remove `bannerConfig`-based conditional rendering in
      `TrialBanner.vue` (or promote to permanent if free plan ships)
- [ ] Remove cloud-side experiment gating (audience caps, variant
      assignment)
- [ ] Update/remove `plan-data-trial.json` Playwright fixture
- [ ] Clean up email configuration (restore trial emails or
      transition to permanent free-plan emails)
- [ ] Close GRO-244 cleanup sub-tasks if any

## Open Questions

- **Telemetry event schema is empty.** The spec defines a telemetry table
  structure (Schema, Description, Event name, snake_case name, Extra
  Payload) but all rows are blank. Are there specific telemetry events
  beyond the existing `User is part of experiment` that should be tracked
  during the measuring phase?
  — *Suggested default:* rely on the existing PostHog experiment tracking
  plus standard cloud plan usage metrics (executions, UI activity) already
  captured. Not a blocker.

- **Experiment termination policy is undefined.** The spec mentions
  email reminders before "experiment free plan" termination ("You have x
  days left", "Your account is no longer active — upgrade or download your
  workflows") but does not specify *when* the experiment ends or what
  happens to users' instances. Is there a defined experiment duration
  (e.g. 90 days per user? a global cutoff date?)
  — *Suggested default:* Treat it like a 90-day trial per user based on
  the GRO-244 description ("As a trial account with 90 day duration").
  Not a blocker for measuring but **blocker** for cleanup planning.

- **"Sleep: yes if possible" — was this implemented?** The spec lists
  instance sleep as a nice-to-have under Infra. It's unclear from the
  available PRs whether this was included.
  — *Suggested default:* Verify with the cloud team. Not a blocker.

- **What defines "activation" for the % activation metric?** The spec
  lists it as a primary success metric but doesn't define the activation
  criteria for free-tier users. Is it the same as the standard cloud
  activation definition (e.g. first successful production execution)?
  — *Suggested default:* Use the existing cloud activation definition.
  Not a blocker.

- **Downgrade bug (GRO-250).** A bug was discovered where downgrading a
  plan keeps the previous max executions due to `Math.max()` in
  `getConfigValue()`. This could affect free-tier users who temporarily
  had higher limits.
  — *Suggested default:* Track as a separate bug fix. Not a blocker for
  the experiment itself, but a **blocker** for cleanup if the experiment
  ends and users need to transition.

## Risks

- **Free-tier abuse / fraud** — Likelihood: **medium**. With up to 5,000
  free instances, there's potential for abuse (crypto mining, spam
  workflows). The support team has raised this concern (SUP-1230: policy
  request for abusive users, driven by freemium launch). Mitigation:
  the 50-execution limit provides a natural ceiling; the support policy
  issue is already in review.

- **Experiment users orphaned without clear transition** — Likelihood:
  **medium**. If the experiment concludes without a clear transition plan
  (permanent free plan vs. forced upgrade), users may lose access to
  active workflows unexpectedly. Mitigation: define the termination
  policy and email communication plan before the experiment's measuring
  period ends; the reminder emails are already configured.

- **Downgrade execution-limit bug (GRO-250)** — Likelihood: **low** (only
  affects plan transitions). If free-tier users are later moved to a
  different plan, the `Math.max()` bug could cause them to retain the
  higher execution limit from a temporary upgrade. Mitigation: fix
  GRO-250 before running cleanup or plan transitions.

- **Measuring validity with small sample** — Likelihood: **low**. The
  5,000-user cap with 1,000/day throttling may take time to fill. If the
  experiment is cut short, the sample may be too small for statistically
  significant conclusions on retention at Month 2-3. Mitigation: the
  sample size was pre-calculated; monitor enrollment rate via PostHog.

## References

- **Notion spec:** [Exp-Free-1 Freemium test with 50 prod exec](https://www.notion.so/08f5b6e0c94f834fb4ef815d7b318d93)
- **Figma board:** [Freemium tests](https://www.figma.com/board/d7vMW2C6oq9D0UDLEppuQo/Freemium-tests)

### Code (files modified)

- `packages/frontend/@n8n/rest-api-client/src/api/cloudPlans.ts` — Cloud plans API client
- `packages/frontend/editor-ui/src/app/stores/cloudPlan.store.ts` — Cloud plan Pinia store
- `packages/frontend/editor-ui/src/features/shared/banners/components/banners/TrialBanner.vue` — Trial banner component
- `packages/frontend/editor-ui/src/app/constants/experiments.ts` — Experiment constants registry
- `packages/frontend/editor-ui/src/app/stores/posthog.store.ts` — PostHog feature flag store
- `packages/testing/playwright/fixtures/plan-data-trial.json` — Playwright test fixture

### Linear tickets

**n8n (Cloud Growth):**
- [GRO-244: Freemium v1](https://linear.app/n8n/issue/GRO-244/freemium-v1) — Done
- [GRO-275: Freemium v2](https://linear.app/n8n/issue/GRO-275/freemium-v2) — Done
- [GRO-282: Freemium v3](https://linear.app/n8n/issue/GRO-282/freemium-v3) — Backlog
- [GRO-250: Downgrade keeps max executions](https://linear.app/n8n/issue/GRO-250/when-downgrading-a-plan-the-user-keeps-the-previous-max-executions) — Backlog

**Other teams:**
- [SUP-1230: Abusive users policy](https://linear.app/n8n/issue/SUP-1230/policy-request-abusive-users-at-n8n) — In Review
- [DATA-8: Freemium data analysis](https://linear.app/n8n/issue/DATA-8/updates-to-freemium-data) — Done
- [AUTO-278: Free accounts reporting](https://linear.app/n8n/issue/AUTO-278/analyzereport-free-cloud-accounts) — Backlog

**Project:** [EXP - Freemium](https://linear.app/n8n/project/exp-freemium-e83b20a77452) (Lead: Filipe Tavares)

### GitHub PRs

**n8n-io/n8n:**
- [PR #25412](https://github.com/n8n-io/n8n/pull/25412) — `chore(editor): Allow control of banner content from cloud` — Merged

**n8n-io/n8n-cloud:**
- [PR #3029](https://github.com/n8n-io/n8n-cloud/pull/3029) — `feat: Support free tier`
- [PR #3067](https://github.com/n8n-io/n8n-cloud/pull/3067) — `chore(dashboard-backend): Emit user is part of experiment for freemium`
- [PR #3070](https://github.com/n8n-io/n8n-cloud/pull/3070) — `chore(dashboard-backend): Handle free plan like trial everywhere`

**n8n-io/n8n-hosted-frontend:**
- [PR #879](https://github.com/n8n-io/n8n-hosted-frontend/pull/879) — `chore: Handle freemium on plan changes`
