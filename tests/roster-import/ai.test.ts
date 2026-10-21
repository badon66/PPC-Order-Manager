import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AiError, DEFAULT_ROSTER_MODEL, callClaude, resetModelQuirks, type Tool } from '@/lib/roster-import/ai';

/*
 * The one function that talks to the API, checked against a stand-in fetch:
 * what it sends (key, version, forced tool, temperature 0, the model) and how
 * every way the API can fail comes back as a sentence for the screen.
 */

const tool: Tool = { name: 'report_x', description: 'x', input_schema: { type: 'object', properties: {} } };
const req = { system: 'sys', content: [{ type: 'text' as const, text: 'hi' }], tool, maxTokens: 100, timeoutMs: 5000 };

async function withFetch<T>(
  respond: (url: string, init: RequestInit) => Response | Promise<Response>,
  env: Record<string, string | undefined>,
  run: () => Promise<T>,
): Promise<T> {
  const saved = globalThis.fetch;
  const savedEnv: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    savedEnv[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => respond(String(url), init ?? {})) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = saved;
    for (const k of Object.keys(savedEnv)) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  }
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

test('sends the key, the version, one forced tool at temperature 0, and Opus by default', async () => {
  let seen: { url: string; headers: Record<string, string>; body: Record<string, unknown> } | null = null;
  const out = await withFetch(
    (url, init) => {
      seen = { url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
      return ok({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'report_x', input: { a: 1 } }] });
    },
    { ANTHROPIC_API_KEY: 'test-key', ROSTER_AI_MODEL: undefined, ANTHROPIC_BASE_URL: undefined },
    () => callClaude(req),
  );
  assert.deepEqual(out, { a: 1 });
  assert.ok(seen);
  const s = seen as unknown as { url: string; headers: Record<string, string>; body: Record<string, unknown> };
  assert.equal(s.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(s.headers['x-api-key'], 'test-key');
  assert.equal(s.headers['anthropic-version'], '2023-06-01');
  assert.equal(s.body.model, DEFAULT_ROSTER_MODEL);
  assert.equal(DEFAULT_ROSTER_MODEL, 'claude-opus-5-5');
  assert.equal(s.body.temperature, 0);
  assert.deepEqual(s.body.tool_choice, { type: 'tool', name: 'report_x' });
  assert.equal(s.body.system, 'sys');
});

test('ROSTER_AI_MODEL and ANTHROPIC_BASE_URL override the defaults', async () => {
  let url = '';
  let model = '';
  await withFetch(
    (u, init) => {
      url = u;
      model = JSON.parse(String(init.body)).model;
      return ok({ content: [{ type: 'tool_use', name: 'report_x', input: {} }] });
    },
    { ANTHROPIC_API_KEY: 'k', ROSTER_AI_MODEL: 'claude-sonnet-5-5', ANTHROPIC_BASE_URL: 'http://127.0.0.1:3099/' },
    () => callClaude(req),
  );
  assert.equal(url, 'http://127.0.0.1:3099/v1/messages');
  assert.equal(model, 'claude-sonnet-5-5');
});

test('every failure is a plain sentence, never a crash', async () => {
  const cases: Array<[() => Response, RegExp]> = [
    [() => new Response('{}', { status: 429 }), /busy/],
    [() => new Response('{}', { status: 529 }), /busy/],
    [() => new Response('{}', { status: 401 }), /key was refused/],
    [() => new Response('bad', { status: 500 }), /failed \(500\)/],
    [() => ok({ stop_reason: 'max_tokens', content: [{ type: 'tool_use', name: 'report_x', input: {} }] }), /too long/],
    [() => ok({ content: [{ type: 'text', text: 'Sure! Here you go.' }] }), /came back empty/],
    [() => new Response('not json', { status: 200 }), /garbled/],
  ];
  for (const [respond, message] of cases) {
    await withFetch(respond, { ANTHROPIC_API_KEY: 'k' }, async () => {
      await assert.rejects(callClaude(req), (e: unknown) => e instanceof AiError && message.test((e as Error).message));
    });
  }
});

test('no key: refused before anything is sent', async () => {
  let called = false;
  await withFetch(
    () => { called = true; return ok({}); },
    { ANTHROPIC_API_KEY: undefined },
    async () => {
      await assert.rejects(callClaude(req), /not set up/);
    },
  );
  assert.equal(called, false);
});

test('a timeout says so', async () => {
  await withFetch(
    () => { const e = new Error('timed out'); e.name = 'TimeoutError'; throw e; },
    { ANTHROPIC_API_KEY: 'k' },
    async () => {
      await assert.rejects(callClaude(req), /took too long/);
    },
  );
});

test('ANTHROPIC_WORKSPACE_ID sends the workspace header; a workspace error says what to set', async () => {
  let headers: Record<string, string> = {};
  await withFetch(
    (_u, init) => { headers = init.headers as Record<string, string>; return ok({ content: [{ type: 'tool_use', name: 'report_x', input: {} }] }); },
    { ANTHROPIC_API_KEY: 'k', ANTHROPIC_WORKSPACE_ID: 'wrkspc_test' },
    () => callClaude(req),
  );
  assert.equal(headers['anthropic-workspace-id'], 'wrkspc_test');
  await withFetch(
    (_u, init) => { headers = init.headers as Record<string, string>; return ok({ content: [{ type: 'tool_use', name: 'report_x', input: {} }] }); },
    { ANTHROPIC_API_KEY: 'k', ANTHROPIC_WORKSPACE_ID: undefined },
    () => callClaude(req),
  );
  assert.ok(!('anthropic-workspace-id' in headers), 'absent unless set');
  await withFetch(
    () => new Response('{"type":"error","error":{"message":"This API key is not scoped to a workspace"}}', { status: 400 }),
    { ANTHROPIC_API_KEY: 'k', ANTHROPIC_WORKSPACE_ID: undefined },
    async () => { await assert.rejects(callClaude(req), /ANTHROPIC_WORKSPACE_ID/); },
  );
});

test('a model that refuses forced tool_choice is asked again with auto, and remembered', async () => {
  resetModelQuirks();
  const bodies: Array<Record<string, unknown>> = [];
  const refuse = () =>
    new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'tool_choice: type "tool" and "any" are not supported for this model.' } }), { status: 400 });
  const respond = (_u: string, init: RequestInit) => {
    const b = JSON.parse(String(init.body));
    bodies.push(b);
    if ((b.tool_choice as { type: string }).type === 'tool') return refuse();
    return ok({ stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'report_x', input: { a: 2 } }] });
  };
  const env = { ANTHROPIC_API_KEY: 'k', ROSTER_AI_MODEL: 'some-model', ANTHROPIC_BASE_URL: undefined };
  assert.deepEqual(await withFetch(respond, env, () => callClaude(req)), { a: 2 });
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[1].tool_choice, { type: 'auto' });
  assert.match(String(bodies[1].system), /only by calling the report_x tool/);
  // Next reading goes straight to auto.
  bodies.length = 0;
  await withFetch(respond, env, () => callClaude(req));
  assert.equal(bodies.length, 1);
  assert.deepEqual(bodies[0].tool_choice, { type: 'auto' });
  resetModelQuirks();
});

test('a refused temperature is dropped; a reply with no tool call is still empty', async () => {
  resetModelQuirks();
  const bodies: Array<Record<string, unknown>> = [];
  await assert.rejects(
    withFetch(
      (_u, init) => {
        const b = JSON.parse(String(init.body));
        bodies.push(b);
        if ('temperature' in b) return new Response('{"error":{"message":"temperature is not supported for this model"}}', { status: 400 });
        return ok({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'here you go' }] });
      },
      { ANTHROPIC_API_KEY: 'k', ROSTER_AI_MODEL: 'other-model', ANTHROPIC_BASE_URL: undefined },
      () => callClaude(req),
    ),
    (e: unknown) => e instanceof AiError && /empty/.test((e as Error).message),
  );
  assert.equal(bodies.length, 2);
  assert.ok(!('temperature' in bodies[1]));
  resetModelQuirks();
});

test('any other 400 is not retried', async () => {
  resetModelQuirks();
  let calls = 0;
  await assert.rejects(
    withFetch(
      () => { calls++; return new Response('{"error":{"message":"messages: bad"}}', { status: 400 }); },
      { ANTHROPIC_API_KEY: 'k', ROSTER_AI_MODEL: undefined, ANTHROPIC_BASE_URL: undefined },
      () => callClaude(req),
    ),
    /AI reading failed \(400\)/,
  );
  assert.equal(calls, 1);
});
