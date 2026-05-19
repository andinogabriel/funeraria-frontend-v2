# Review agents

Read-only Claude Code subagents that codify this repo's review checklists. Claude Code
discovers them automatically when you open the repo in a session — no setup, no API key,
no GitHub Action.

| File | Role |
| --- | --- |
| [`frontend-architect.md`](frontend-architect.md) | Standalone + OnPush, signals over `BehaviorSubject`, `@if`/`@for`, `minmax(0,...)` grids, URL-sync for paginated lists, `[disabled]` mixed with FormControl, locale registration, Material system tokens, ARIA basics. Run before `gh pr create`. |
| [`test-coverage-auditor.md`](test-coverage-auditor.md) | The branches humans forget: stale service mocks after a method rename, the 403 path, the empty-optional-params branch, URL ↔ form round-trip on paginated lists. Run after the architect passes. |

## Quick invocation (inside a Claude Code session)

```text
Agent({ subagent_type: "frontend-architect",    prompt: "Review the diff against main" })
Agent({ subagent_type: "test-coverage-auditor", prompt: "Audit coverage for the current branch" })
```

Each agent returns a structured report (Blockers / Worth fixing / Follow-ups) with file:line
citations. They never edit files, run `npm test`, or push commits — they only read, grep,
and report.

See [`../../CLAUDE.md`](../../CLAUDE.md) for the full guidance and the conventions each
agent enforces.
