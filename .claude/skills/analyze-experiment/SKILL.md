---
name: analyze-experiment
description: Analyze an experiment spec from Notion and produce an implementation plan. Auto-detects reanalysis when a previous plan exists. Use --fresh to force a clean-slate analysis.
disable-model-invocation: true
argument-hint: "[notion-page-id] [output-file-path] [--fresh]"
compatibility:
  requires:
    - mcp: notion
      description: Core dependency — used to fetch the experiment spec and add comments to the Notion page
    - mcp: linear
      description: Used to search for related Linear tickets and prior art
    - cli: gh
      description: GitHub CLI — used to search for related PRs and issues. Must be authenticated (gh auth login)
  optional:
    - cli: curl
      description: Used to download attachments and to call the Notion API for block-level comments. Typically pre-installed.
    - env: MCP_NOTION_TOKEN_WITH_COMMENTS
      description: Notion API token with comment permissions — required for adding block-level comments to the spec page. If missing, skip the annotation step.
---

# Analyze Experiment

Fetch an experiment spec from a Notion page and produce an implementation
plan with tasks, open questions, and risks. If a previous plan already
exists at the output path, the skill automatically runs in reanalysis
mode — comparing against the previous plan and highlighting what changed.
Pass `--fresh` to force a clean-slate analysis even when a previous plan
exists.

## Prerequisites

**Required:**
- **Notion MCP** (`mcp__notion`): Must be connected. Without it the skill cannot fetch the experiment spec.
- **Linear MCP** (`mcp__linear`): Must be connected. Used to search for related tickets.
- **GitHub CLI** (`gh`): Must be installed and authenticated. Run `gh auth status` to verify.

**Optional (graceful degradation):**
- **`MCP_NOTION_TOKEN_WITH_COMMENTS`** env var: Notion API token with comment permissions. Required for adding block-level comments to the spec page (step 4). If missing, skip the annotation step and note it.
- **curl**: Used to download attachments and call the Notion API. Almost always available; if missing, skip downloads and note it.

If a required tool is missing, stop and tell the user what needs to be set up.

## Workflow

### 1. Parse Arguments and Fetch the Experiment Spec from Notion

`$ARGUMENTS` contains: `<notion-page-id> <output-file-path> [--fresh]`

- Parse the first argument as the Notion page ID
- Parse the second argument as the output file path for the plan
- Check if `--fresh` flag is present
- Use `mcp__notion__notion-fetch` with the page ID to retrieve the experiment spec
- If the page cannot be fetched, inform the user and stop
- Extract the experiment name from the page title or heading

### 2. Detect Mode

Determine whether this is a fresh analysis or a reanalysis:

- If the output file at the path from step 1 does NOT exist → **fresh mode**
- If the output file exists AND `--fresh` flag was passed → **fresh mode**
- If the output file exists AND `--fresh` flag was NOT passed → **reanalysis mode**

**If reanalysis mode:**
- Read the existing plan file
- Extract the previous open questions, risks, and task structure
- Note the date of the previous analysis from the plan header
- These will be used for comparison when producing the updated plan

### 3. Gather Context

**Read the spec thoroughly.** Understand the goal, target audience, variants,
success metrics, and any constraints. If in reanalysis mode, pay attention
to what has changed since the previous plan.

**Check existing experiments** for implementation patterns:

- Read `packages/frontend/editor-ui/src/experiments/` directory structure
- Look at `app/constants/experiments.ts` for how experiments are registered
  (`createExperiment()`, `EXPERIMENTS_TO_TRACK`)
- Look at 1-2 existing experiment stores for the PostHog + Pinia + telemetry
  pattern
- Check `experiments/utils.ts` for shared helpers

**Check for related code** that the experiment will modify:

- Search the codebase for components, routes, or stores mentioned in the spec
- Identify integration points where the experiment hooks into existing UI

**Check Linear and GitHub** for any related tickets or prior art:

- Use `mcp__linear__search_issues` to search for the experiment name

- Search issues across all three repos:
  ```
  gh search issues "<experiment name>" --repo n8n-io/n8n --repo n8n-io/n8n-cloud --repo n8n-io/n8n-hosted-frontend --limit 10
  ```

- Search PRs across all three repos:
  ```
  gh search prs "<experiment name>" --repo n8n-io/n8n --repo n8n-io/n8n-cloud --repo n8n-io/n8n-hosted-frontend --limit 10
  ```

- Search code in cloud and hosted repos for experiment-related code:
  ```
  gh search code "<experiment name>" --repo n8n-io/n8n-cloud --repo n8n-io/n8n-hosted-frontend --limit 10
  ```

- If the experiment name yields no results, retry the searches with key
  terms from the spec (e.g. the feature area or UI component name)

### 4. Produce the Plan

Write the plan to the output file path from step 1.

**If fresh mode**, use this header:

```
> Generated from [Notion spec](https://www.notion.so/{notion-page-id}) on {date}
```

**If reanalysis mode**, use this header and prepend a changes section:

```
> Re-analyzed from [Notion spec](https://www.notion.so/{notion-page-id}) on {date}
> Previous analysis: {date of previous analysis}

## Changes from Previous Analysis

Bullet list of what changed between the previous plan and this one:
- Which open questions were resolved (and how)
- Which risks are no longer relevant
- New requirements or scope changes from the updated spec
- Changes to task structure or effort estimates
```

The rest of the plan structure is the same for both modes:

```markdown
# {Experiment Name} — Implementation Plan

> {header from above}

{Changes from Previous Analysis section — reanalysis mode only}

## Summary

1-2 paragraph synopsis of what the experiment does, who it targets, and
what we hope to learn.

## Tasks

### 1. Implementation

All implementation work in a **single task**: experiment constant
registration, PostHog feature flag setup, Pinia store, frontend
components, backend changes (if any), telemetry events, and tests.

Break it down into a checklist:

- [ ] Register experiment in `app/constants/experiments.ts`
- [ ] Add to `EXPERIMENTS_TO_TRACK`
- [ ] Create experiment store with PostHog variant check
- [ ] Build components (list them)
- [ ] Wire into existing UI (list integration points)
- [ ] Add telemetry tracking events (list them)
- [ ] Write unit tests
- [ ] ...

Include effort estimate (S/M/L) and flag any blockers.

### 2. Design (conditional)

Only include this task if the spec mentions design, mockups, or visual
direction — or if the experiment clearly involves new UI that needs
design input. If included, describe what design deliverables are needed.

### 3. Cleanup

**Always separate from implementation.** This happens after experiment
results are in:

- [ ] Remove feature flag and experiment constant
- [ ] Promote winning variant to default (or remove experiment code)
- [ ] Remove experiment store and components
- [ ] Update tests

## Open Questions

Bullet list of anything unclear or unspecified. For each question:
- State what is ambiguous
- Suggest a sensible default if possible
- Mark as **blocker** if it prevents implementation from starting

In reanalysis mode, previously resolved questions should NOT reappear.

**Design question rule:** If the spec does NOT mention design, mockups,
or visual direction, include an open question asking whether dedicated
design work is needed before implementation begins.

## Risks

Bullet list of technical or product risks:
- What could go wrong
- Likelihood (low/medium/high)
- Mitigation suggestion

## References

- Link to Notion spec page
- Links to related code (files that will be modified)
- Links to any Linear tickets or GitHub issues/PRs found, grouped by repo
```

### 5. Annotate the Notion Spec

Add open questions and risks as block-level comments on the Notion spec
page. In reanalysis mode, only add comments for NEW questions and risks —
do NOT re-add comments that were already in the previous plan.

The Notion MCP tool does not support block-level comments, so use
`curl` to call the Notion API directly with `$MCP_NOTION_TOKEN_WITH_COMMENTS`.

**Block matching strategy:**

The `notion-fetch` response from step 1 includes block IDs for each
content block. For each open question or risk:

1. **Extract the key phrase** — identify the specific spec content the
   question/risk refers to (e.g. "success metric", "variant B behavior",
   "target audience")
2. **Scan all blocks** from the notion-fetch response and find the block
   whose text content best matches — look for the block that contains the
   phrase or describes the concept the question is about
3. **Use block-level comment** with the matched block ID:
   ```bash
   curl -s -X POST https://api.notion.com/v1/comments \
     -H "Authorization: Bearer $MCP_NOTION_TOKEN_WITH_COMMENTS" \
     -H "Notion-Version: 2022-06-28" \
     -H "Content-Type: application/json" \
     -d '{
       "parent": { "block_id": "<matched-block-id>" },
       "rich_text": [{ "type": "text", "text": { "content": "..." } }]
     }'
   ```
4. **Only fall back to page-level** when the question/risk is genuinely
   about the overall experiment and doesn't relate to any specific block
   (e.g. "Is this experiment cloud-only?"). Use `"page_id"` instead of
   `"parent": { "block_id": "..." }` for these.

Page-level comments are the exception, not the default. Always attempt
block matching first.

**Comment prefixes:**
- Open questions: `[Open Question]` (or `[Blocker]` if it blocks implementation)
- Risks: `[Risk]`

Include the question/suggestion or risk description, likelihood, and
mitigation in the comment text.

### 6. Commit and Push

- Stage the plan file: `git add {plan-file-path}`
- Commit message:
  - Fresh mode: `docs: add implementation plan for {experiment name}`
  - Reanalysis mode: `docs: update implementation plan for {experiment name}`
- Push the current branch

### 7. Write Webhook Summary

Write a user-friendly markdown summary to `/tmp/skill-summary.md`. This
file is picked up by the CI workflow and sent to a webhook for visibility.

The summary should be concise and easy to scan. Derive the GitHub repo
URL from the git remote (e.g. `git remote get-url origin`), then use it
to build markdown links for the plan file and branch.

**Fresh mode — use this structure:**

```markdown
## {Experiment Name} — Analysis Complete

### Summary
1-2 sentence synopsis of the experiment.

### Key Findings
- **Tasks:** {count} ({list task names, e.g. "1 implementation, 1 design, 1 cleanup"})
- **Open Questions:** {count} ({blocker count} blockers)
- **Risks:** {count}
- **Effort Estimate:** {S/M/L from implementation task}

### Open Questions
{For each question, one bullet:}
- ⚠️ **[Blocker]** {question} — Suggested default: {suggestion}
- {question} — Suggested default: {suggestion}

### Risks
{For each risk, one bullet:}
- **{likelihood}** — {risk description}. Mitigation: {mitigation}

### Output
- **Plan file:** [{plan-file-path}]({repo-url}/blob/{branch}/{plan-file-path})
- **Branch:** [{branch-name}]({repo-url}/tree/{branch})
- **Notion comments:** {count} added
- **Notion spec:** [Link](https://www.notion.so/{notion-page-id})
```

**Reanalysis mode — use this structure:**

```markdown
## {Experiment Name} — Re-analysis Complete

### What Changed
{Bullet list of key changes from the previous plan:}
- {resolved question / new requirement / scope change}

### Key Findings
- **Tasks:** {count} ({list task names, e.g. "1 implementation, 1 design, 1 cleanup"})
- **Open Questions:** {count} remaining ({resolved count} resolved, {new count} new, {blocker count} blockers)
- **Risks:** {count}
- **Effort Estimate:** {S/M/L from implementation task}

### Open Questions
{For each question, one bullet:}
- ⚠️ **[Blocker]** {question} — Suggested default: {suggestion}
- {question} — Suggested default: {suggestion}

### Risks
{For each risk, one bullet:}
- **{likelihood}** — {risk description}. Mitigation: {mitigation}

### Output
- **Plan file:** [{plan-file-path}]({repo-url}/blob/{branch}/{plan-file-path})
- **Branch:** [{branch-name}]({repo-url}/tree/{branch})
- **Notion comments:** {count} new comments added
- **Notion spec:** [Link](https://www.notion.so/{notion-page-id})
```

If there are no open questions, replace that section with
"No open questions — spec is clear." Same for risks.

### 8. Present to User

After writing and pushing the plan file, inform the user of:
- The output file path
- The branch name and push status
- A brief summary of key findings: number of tasks, number of open
  questions, and any blockers identified
- Confirmation that questions and risks were added as comments on the
  Notion spec page

**Additionally in reanalysis mode:**
- A summary of what changed from the previous plan
- Number of open questions remaining (and how many were resolved)
- Any new blockers identified

## Rules

- **Single implementation task:** All implementation work — setup,
  frontend, backend, telemetry, testing — goes in ONE task. Only cleanup
  is separate.
- **Design is conditional:** Create a design task only when the spec
  mentions it or the experiment clearly requires new visual work.
  Otherwise, add an open question about whether design is needed.
- **Be pragmatic:** Offer sensible suggestions for open questions. Don't
  just list problems — propose solutions.
- **Mark blockers explicitly:** Any open question or risk that prevents
  work from starting must be marked as a **blocker**.
- **Follow existing patterns:** The plan should align with how existing
  experiments are implemented in the codebase (PostHog, Pinia stores,
  telemetry via `useTelemetry()`).
- **Don't duplicate comments:** In reanalysis mode, only annotate the
  Notion page with NEW questions and risks. Don't re-post comments from
  the previous analysis.
- **Block-level comments first:** Always attempt to match a question or
  risk to a specific block in the Notion spec. Only use page-level
  comments when the question genuinely applies to the whole experiment.
- **Multi-repo search:** Always search n8n-io/n8n, n8n-io/n8n-cloud,
  and n8n-io/n8n-hosted-frontend for prior art. If the experiment name
  yields no results, retry with key terms from the spec.
