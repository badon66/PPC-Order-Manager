import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ScriptItem } from '@/lib/types';
import { MAX_OBJECTIONS, validateScript, withScriptIds } from '@/lib/data/sales-logic';

const line = (over: Partial<ScriptItem>): ScriptItem => ({ id: '', section: 'opening', kind: 'read', text: 'Hello', response: '', options: [], showWhen: '', ...over });

test('withScriptIds keeps existing ids and numbers new rows after the max', () => {
  const out = withScriptIds([line({ id: 's3' }), line({ id: '' }), line({ id: 's1' }), line({ id: '' })]);
  assert.deepEqual(out.map((i) => i.id), ['s3', 's4', 's1', 's5']);
});

test('validateScript normalises rows and rejects bad ones', () => {
  const ok = validateScript([
    { id: 's1', section: 'opening', kind: 'read', text: '  Hi there ', response: '', options: [], showWhen: '' },
    { section: 'objections', kind: 'objection', text: 'Too dear', response: ' We can talk about that ', options: null, showWhen: undefined },
  ]);
  assert.ok(ok.ok);
  if (!ok.ok) return;
  assert.equal(ok.items[0].text, 'Hi there');
  assert.equal(ok.items[1].id, 's2');
  assert.equal(ok.items[1].response, 'We can talk about that');
  assert.deepEqual(ok.items[1].options, []);
  assert.equal(ok.items[1].showWhen, '');

  assert.ok(!validateScript([line({ text: '   ' })]).ok, 'blank text');
  assert.ok(!validateScript([line({ kind: 'dance' as ScriptItem['kind'] })]).ok, 'unknown kind');
  assert.ok(!validateScript([line({ section: 'middle' as ScriptItem['section'] })]).ok, 'unknown section');
  assert.ok(!validateScript('nope').ok, 'not a list');
  const nine = Array.from({ length: MAX_OBJECTIONS + 1 }, (_, i) => line({ section: 'objections', kind: 'objection', text: `Objection ${i}`, response: 'r' }));
  const capped = validateScript(nine);
  assert.ok(!capped.ok);
  if (!capped.ok) assert.match(capped.error, /At most 8/);
});
