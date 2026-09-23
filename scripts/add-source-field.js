// One-off: add the "How did you hear about us?" answer (`source`) to the website intake.
// Types, parser, enquiry mapping, the enquiry card, and the test fixtures. Idempotent.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const edit = (rel, pairs) => {
  const file = path.join(root, rel);
  let s = fs.readFileSync(file, 'utf8');
  const nl = s.includes('\r\n') ? '\r\n' : '\n';
  let changed = 0;
  for (const [from, to] of pairs) {
    const f = from.replace(/\n/g, nl), t = to.replace(/\n/g, nl);
    if (s.includes(t)) continue;
    if (!s.includes(f)) throw new Error(rel + ': anchor not found: ' + from.slice(0, 60));
    s = s.replace(f, t);
    changed++;
  }
  fs.writeFileSync(file, s);
  console.log(rel, changed ? 'edited' : 'already done');
};

edit('src/lib/types.ts', [[
  "  previousOrder: string;\n  /** ISO instant the enquiry arrived. A timestamp, not a calendar date. */",
  "  previousOrder: string;\n  /** \"How did you hear about us?\" — one of the page's fixed answers, or empty. */\n  source: string;\n  /** ISO instant the enquiry arrived. A timestamp, not a calendar date. */",
]]);

edit('src/lib/data/intake-logic.ts', [
  ["  extraDetails: string;\n  previousOrder: string;\n}", "  extraDetails: string;\n  previousOrder: string;\n  source: string;\n}"],
  ["inspiration: str(b.inspiration), extraDetails: str(b.extraDetails), previousOrder: str(b.previousOrder),", "inspiration: str(b.inspiration), extraDetails: str(b.extraDetails), previousOrder: str(b.previousOrder),\n      source: str(b.source),"],
  ["    previousOrder: input.previousOrder,\n    receivedAt,", "    previousOrder: input.previousOrder,\n    source: input.source,\n    receivedAt,"],
]);

edit('src/components/enquiry-card.tsx', [[
  "    ['Previous order', enquiry.previousOrder],",
  "    ['Previous order', enquiry.previousOrder],\n    ['Heard about us', enquiry.source],",
]]);

// Fixtures: every literal that spells out previousOrder gets source beside it.
for (const rel of ['tests/intake/route-copy.test.ts', 'tests/intake/logic.test.ts', 'tests/intake/intake.test.ts', 'tests/intake/intake-mail.test.ts', 'tests/intake/roster-answer.test.ts']) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) continue;
  let s = fs.readFileSync(file, 'utf8');
  const before = s;
  s = s.replace(/previousOrder: ''(?!, source)/g, "previousOrder: '', source: ''");
  fs.writeFileSync(file, s);
  console.log(rel, s === before ? 'unchanged' : 'fixture updated');
}

// A parse test for the new field.
const logicTest = path.join(root, 'tests/intake/logic.test.ts');
let lt = fs.readFileSync(logicTest, 'utf8');
if (!lt.includes('source passes through')) {
  const nl = lt.includes('\r\n') ? '\r\n' : '\n';
  lt += [
    '',
    "test('source passes through, trimmed, and is empty when the page did not send it', () => {",
    "  const withIt = parseIntake({ ...good, source: '  A friend or another team ' });",
    "  assert.ok(withIt.ok && !withIt.honeypot);",
    "  if (withIt.ok && !withIt.honeypot) assert.equal(withIt.value.source, 'A friend or another team');",
    '  const without = parseIntake({ ...good });',
    "  if (without.ok && !without.honeypot) assert.equal(without.value.source, '');",
    '});',
    '',
  ].join(nl);
  fs.writeFileSync(logicTest, lt);
  console.log('logic.test.ts: test added');
}
