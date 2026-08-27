import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../adapters/deepseek-harness/plugin.mjs'

function setupPlugin(bridgePayload) {
  const handlers = new Map()
  const bridgeResult = JSON.stringify({ ok: true, ...bridgePayload })
  const ctx = {
    inject() {},
    on(name, handler) {
      handlers.set(name, handler)
    },
    logger: { warn() {} },
    subprocess: {
      async resolveExecutable() {
        return 'python3'
      },
      spawn() {
        return {
          done: Promise.resolve({ exitCode: 0, signal: null }),
          collected: {
            stdout: { readFrom() { return { text: bridgeResult } } },
            stderr: { readFrom() { return { text: '' } } },
          },
        }
      },
    },
  }
  apply(ctx, { enabled: true, projectDir: '/repo/project' })
  return handlers.get('agent/pre-step')
}

async function runPreStep(handler) {
  return handler({
    agent: { session: { header: { cwd: '/repo/project' } } },
    messages: [{
      role: 'user',
      content: [{ type: 'text', text: 'current task' }],
      source: { kind: 'user' },
    }],
    signal: { aborted: false },
  }, async () => ({ kind: 'enter', messages: [] }))
}

test('pre-step keeps recall and Project Skill as separate Harness contexts', async () => {
  const handler = setupPlugin({
    recall_context: '## Relevant Project Memories\n- related memory',
    instructions_context: '## Project Skill\n- follow project rule',
  })
  const decision = await runPreStep(handler)

  assert.deepEqual(
    decision.messages.map(message => message.source?.form),
    ['recall', 'instructions'],
  )
  assert.equal(decision.messages[0].content[0].text, '## Relevant Project Memories\n- related memory')
  assert.match(decision.messages[1].content[0].text, /^<system-reminder>/)
  assert.match(decision.messages[1].content[0].text, /## Project Skill/)
  assert.match(decision.messages[1].content[0].text, /<\/system-reminder>$/)
})

test('pre-step does not add an empty recall context', async () => {
  const handler = setupPlugin({
    recall_context: '',
    instructions_context: '## Project Skill\n- follow project rule',
  })
  const decision = await runPreStep(handler)

  assert.equal(decision.messages.length, 1)
  assert.equal(decision.messages[0].source?.form, 'instructions')
})
