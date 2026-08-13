import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'chat2skill-deepseek-harness'
export const inject = ['subprocess']

const PLUGIN_ID = 'chat2skill'
const ADAPTER_DIR = dirname(fileURLToPath(import.meta.url))
const CHAT2SKILL_ROOT = join(ADAPTER_DIR, '..', '..')
const BRIDGE_PATH = join(CHAT2SKILL_ROOT, 'scripts', 'deepseek_harness_adapter.py')

export function apply(ctx, rawConfig = {}) {
  const config = resolveConfig(rawConfig)
  if (!config.enabled) return

  ctx.on('agent/pre-step', async ({ agent, messages, signal }, next) => {
    const prompt = latestUserPrompt(messages)
    const downstream = await next()
    if (!prompt || downstream.kind !== 'enter' || signal.aborted) return downstream

    try {
      const result = await runBridge(ctx, config, 'retrieve', {
        project_dir: workspaceFor(agent, config),
        prompt,
      }, signal)
      if (!result.ok || !result.context) {
        if (!result.ok) warn(ctx, 'retrieve', result.error)
        return downstream
      }
      return {
        ...downstream,
        messages: [...downstream.messages, pluginMessage(result.context, 'recall')],
      }
    } catch (error) {
      warn(ctx, 'retrieve', error)
      return downstream
    }
  })

  ctx.on('agent/turn-stopping', async ({ agent, turn, signal }) => {
    if (signal.aborted) return
    const messages = conversationMessages(agent.session.events)
    const assistantMessage = assistantTextForTurn(agent.session.events, turn)
    if (!assistantMessage) return

    try {
      const guard = await runBridge(ctx, config, 'guard', {
        project_dir: workspaceFor(agent, config),
        assistant_message: assistantMessage,
      }, signal)
      if (guard.ok && guard.blocked) {
        agent.steer(pluginMessage(
          guard.reason || 'Rewrite the previous response to satisfy the active Chat2Skill rules.',
          'instructions',
        ))
        return
      }
      if (!guard.ok) warn(ctx, 'guard', guard.error)
    } catch (error) {
      // A local guard failure must not make a completed model turn fail.
      warn(ctx, 'guard', error)
    }

    void runBridge(ctx, config, 'learn', {
      project_dir: workspaceFor(agent, config),
      session_id: String(agent.session.header.id),
      messages,
    }).then(result => {
      if (!result.ok) warn(ctx, 'learn', result.error)
    }).catch(error => warn(ctx, 'learn', error))
  })
}

function resolveConfig(rawConfig) {
  const config = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
  return {
    enabled: config.enabled !== false,
    python: stringOr(config.python, 'python3'),
    projectDir: stringOr(config.projectDir, ''),
    responseGuard: stringOr(config.responseGuard, 'strict'),
  }
}

function workspaceFor(agent, config) {
  return config.projectDir || agent.session.header.cwd || process.cwd()
}

async function runBridge(ctx, config, mode, payload, signal) {
  const python = await ctx.subprocess.resolveExecutable(config.python, undefined, signal)
  const handle = ctx.subprocess.spawn({
    argv: [python, BRIDGE_PATH, '--mode', mode],
    cwd: CHAT2SKILL_ROOT,
    stdio: {
      stdin: { data: JSON.stringify(payload) },
      stdout: { maxBytes: 256 * 1024 },
      stderr: { maxBytes: 32 * 1024 },
    },
    graceMs: 1000,
    signal,
    env: bridgeEnv(config),
  })
  const outcome = await handle.done
  const stdout = handle.collected.stdout?.readFrom(0)?.text?.trim() || ''
  const stderr = handle.collected.stderr?.readFrom(0)?.text?.trim() || ''
  if (outcome.exitCode !== 0 || outcome.signal !== null) {
    throw new Error(`bridge exited with ${outcome.signal || outcome.exitCode}: ${stderr}`)
  }
  const line = stdout.split('\n').filter(Boolean).at(-1)
  if (!line) throw new Error(`bridge returned no JSON${stderr ? `: ${stderr}` : ''}`)
  return JSON.parse(line)
}

function latestUserPrompt(messages) {
  for (const message of [...messages].reverse()) {
    if (message?.role !== 'user') continue
    if (message.source?.kind && message.source.kind !== 'user') continue
    const text = messageText(message)
    if (text) return text
  }
  return ''
}

function conversationMessages(events) {
  const messages = []
  for (const event of events) {
    const message = messageFromEvent(event)
    if (!message || (message.role === 'user' && message.source?.kind !== 'user')) continue
    const content = messageText(message)
    if (content) messages.push({ role: message.role, content })
  }
  return messages
}

function assistantTextForTurn(events, turn) {
  let text = ''
  for (const event of events) {
    if (event.type !== 'assistant/message' || event.data?.turn !== turn) continue
    const message = event.data?.message
    const next = messageText(message)
    if (next) text = next
  }
  return text
}

function messageFromEvent(event) {
  if (event.type === 'user/message') return event.data
  if (event.type === 'assistant/message') return event.data?.message
  return undefined
}

function messageText(message) {
  if (!message) return ''
  if (typeof message.content === 'string') return message.content.trim()
  if (!Array.isArray(message.content)) return ''
  return message.content
    .filter(block => block?.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n')
    .trim()
}

function pluginMessage(text, form) {
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'plugin', plugin: PLUGIN_ID, form },
  }
}

function stringOr(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function bridgeEnv(config) {
  const env = {
    CHAT2SKILL_RESPONSE_GUARD: config.responseGuard,
  }
  // dsh-subprocess intentionally scrubs credential-shaped ambient variables.
  // Forward only the names owned by Chat2Skill, plus the documented OpenAI
  // compatibility names, as an explicit local bridge boundary.
  for (const [key, value] of Object.entries(process.env)) {
    if ((key.startsWith('CHAT2SKILL_') || key === 'OPENAI_API_KEY' || key === 'OPENAI_BASE_URL')
      && value !== undefined) {
      env[key] = value
    }
  }
  env.CHAT2SKILL_RESPONSE_GUARD = config.responseGuard
  return env
}

function warn(ctx, operation, error) {
  ctx.logger.warn(`chat2skill: ${operation} bridge failed: ${String(error || 'unknown error')}`)
}
