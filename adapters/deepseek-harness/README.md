# DeepSeek Harness Adapter

This adapter is a bundle for the Cordis-based DeepSeek Harness project. It
lives in the Chat2Skill repository and reuses the existing Python runtime:

- `agent/pre-step` retrieves project memory and skills before a model request.
- `agent/turn-stopping` checks the final assistant message with the shared
  response guard, then learns from the session transcript.
- `ctx.subprocess` runs the bridge without adding an algorithm-server route.

## Install

From this checkout, add the repository root as a profile plugin:

```bash
dsh plugin --profile headless add /Users/sac/Desktop/Dev/Chat2Skill
dsh --profile headless
```

Use `web` instead of `headless` for the web profile. The existing
`~/.chat2skill/config.json` remains the source of the Chat2Skill API and LLM
configuration.

## Configuration

The bundle reads these optional environment variables when the profile is
loaded:

- `CHAT2SKILL_DSH_ENABLED=false` disables the adapter.
- `CHAT2SKILL_PYTHON` selects the Python executable; the default is `python3`.
- `CHAT2SKILL_PROJECT_DIR` pins the project namespace; otherwise the Harness
  session `cwd` is used.
- `CHAT2SKILL_RESPONSE_GUARD=off|warn-only|block-once|adaptive|strict`
  controls the shared response guard. The default is `strict`.

The DeepSeek Harness adapter changes only this plugin repository. The existing
algorithm project and its API contract do not need a change for this
integration.
