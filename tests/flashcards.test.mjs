// Integrity checks for the flashcard deck, plus the scheduler and typed-answer matcher.
// Run with: node --test tests/flashcards.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('../src/flashcards.js');
await import('../src/flash-ui.js');
const { TT } = globalThis;
const cards = TT.flashcards;

const OBJ_COUNTS = { 1: 13, 2: 9, 3: 5, 4: 9, 5: 10, 6: 7 };
const VALID_OBJ = new Set(Object.entries(OBJ_COUNTS).flatMap(([d, n]) => Array.from({ length: n }, (_, i) => `${d}.${i + 1}`)));
const DOMAIN_OF = { 1: 'fund', 2: 'access', 3: 'ipconn', 4: 'svc', 5: 'sec', 6: 'auto' };
const DECKS = ['ports', 'acronyms', 'protocols', 'defaults', 'commands', 'osi', 'subnetting', 'wireless', 'security', 'automation', 'terms'];

test('at least 450 cards', () => assert.ok(cards.length >= 450, `only ${cards.length}`));

test('deck list matches the expected ids and every deck has cards', () => {
  assert.deepEqual(TT.flashDecks.map((d) => d.id), DECKS);
  for (const d of DECKS) assert.ok(cards.filter((c) => c.deck === d).length >= 20, `deck ${d} is thin`);
});

test('ids are unique and well formed', () => {
  const seen = new Set();
  for (const c of cards) {
    assert.match(c.id, /^fc-\d{4}$/, c.id);
    assert.ok(!seen.has(c.id), `duplicate id ${c.id}`);
    seen.add(c.id);
  }
});

test('required fields present, no unknown fields', () => {
  const allowed = new Set(['id', 'deck', 'domain', 'obj', 'front', 'back', 'extra', 'rev', 'accept']);
  for (const c of cards) {
    for (const k of ['id', 'deck', 'domain', 'obj', 'front', 'back']) assert.ok(typeof c[k] === 'string' && c[k].trim(), `${c.id} missing ${k}`);
    for (const k of Object.keys(c)) assert.ok(allowed.has(k), `${c.id} has unknown field ${k}`);
    if ('extra' in c) assert.ok(typeof c.extra === 'string' && c.extra.trim(), `${c.id} empty extra`);
    if ('rev' in c) assert.equal(c.rev, true, `${c.id} rev must be true when present`);
    if ('accept' in c) assert.ok(Array.isArray(c.accept) && c.accept.length && c.accept.every((a) => typeof a === 'string' && a.trim()), `${c.id} bad accept`);
  }
});

test('valid deck, valid v1.1 objective, domain matches objective', () => {
  for (const c of cards) {
    assert.ok(DECKS.includes(c.deck), `${c.id} bad deck ${c.deck}`);
    assert.ok(VALID_OBJ.has(c.obj), `${c.id} bad objective ${c.obj}`);
    assert.equal(c.domain, DOMAIN_OF[c.obj.split('.')[0]], `${c.id} domain ${c.domain} does not match ${c.obj}`);
  }
});

test('every domain is covered', () => {
  for (const d of Object.values(DOMAIN_OF)) assert.ok(cards.some((c) => c.domain === d), `no cards for ${d}`);
});

test('no duplicate fronts within a deck', () => {
  const seen = {};
  for (const c of cards) {
    const k = c.deck + '|' + c.front.toLowerCase().replace(/\s+/g, ' ').trim();
    assert.ok(!seen[k], `${c.id} repeats the front of ${seen[k]}: "${c.front}"`);
    seen[k] = c.id;
  }
});

test('typeable command cards are a single line and accepted answers differ from the back', () => {
  for (const c of cards.filter((x) => x.deck === 'commands' && !x.rev)) {
    assert.ok(!c.back.includes('\n'), `${c.id} multi-line command`);
    for (const a of c.accept || []) assert.notEqual(a.toLowerCase(), c.back.toLowerCase(), `${c.id} accept duplicates back`);
  }
});

// Values that must never drift during edits.
const byFront = (deck, front) => {
  const c = cards.find((x) => x.deck === deck && x.front === front);
  assert.ok(c, `missing card ${deck}: ${front}`);
  return c.back;
};
test('known facts stay correct', () => {
  const facts = [
    ['defaults', 'AD: connected route', '0'], ['defaults', 'AD: static route', '1'], ['defaults', 'AD: eBGP', '20'],
    ['defaults', 'AD: internal EIGRP', '90'], ['defaults', 'AD: OSPF', '110'], ['defaults', 'AD: IS-IS', '115'],
    ['defaults', 'AD: RIP', '120'], ['defaults', 'AD: external EIGRP', '170'], ['defaults', 'AD: iBGP', '200'],
    ['defaults', 'OSPF hello/dead: broadcast', '10 / 40 seconds'], ['defaults', 'OSPF hello/dead: point-to-point', '10 / 40 seconds'],
    ['defaults', 'HSRP hello/hold', '3 / 10 seconds'], ['defaults', 'HSRP default priority', '100'],
    ['defaults', 'STP hello timer', '2 seconds'], ['defaults', 'STP forward delay', '15 seconds'], ['defaults', 'STP max age', '20 seconds'],
    ['defaults', 'STP short-mode cost: 10 Mbps', '100'], ['defaults', 'STP short-mode cost: 100 Mbps', '19'],
    ['defaults', 'STP short-mode cost: 1 Gbps', '4'], ['defaults', 'STP short-mode cost: 10 Gbps', '2'],
    ['defaults', 'DSCP EF', '46'], ['defaults', 'CoS value for voice', '5'],
    ['ports', 'TACACS+', 'TCP 49'], ['ports', 'RADIUS authentication', 'UDP 1812'], ['ports', 'RADIUS accounting', 'UDP 1813'],
    ['ports', 'TFTP', 'UDP 69'], ['ports', 'NTP', 'UDP 123'], ['ports', 'CAPWAP control', 'UDP 5246'], ['ports', 'CAPWAP data', 'UDP 5247'],
    ['ports', 'SNMP Trap and Inform', 'UDP 162'], ['ports', 'DHCPv4 server', 'UDP 67'], ['ports', 'DHCPv4 client', 'UDP 68'],
    ['wireless', 'Nonoverlapping 2.4 GHz channels (US)', '1, 6 and 11'],
    ['subnetting', 'IPv6 link-local prefix', 'FE80::/10'], ['subnetting', 'IPv6 multicast range', 'FF00::/8'],
    ['subnetting', 'IPv6 global unicast range', '2000::/3'],
    ['subnetting', 'EUI-64 interface ID for MAC 0050.56A1.2B3C', '0250:56FF:FEA1:2B3C'],
    ['security', 'WPA2 cipher', 'AES-CCMP'], ['security', 'WPA cipher', 'TKIP (still RC4 underneath)'],
  ];
  for (const [d, f, b] of facts) assert.equal(byFront(d, f), b, `${d}: ${f}`);
  const levels = ['Emergency', 'Alert', 'Critical', 'Error', 'Warning', 'Notification', 'Informational', 'Debugging'];
  levels.forEach((n, i) => assert.equal(byFront('defaults', `Syslog level ${i}`), n));
});

test('scheduler: boxes and intervals', () => {
  const { rate, nextBox, INTERVALS } = TT.flashSched;
  assert.equal(INTERVALS.length, 6);
  assert.equal(nextBox(0, 'good'), 1);
  assert.equal(nextBox(0, 'easy'), 2);
  assert.equal(nextBox(0, 'hard'), 1);
  assert.equal(nextBox(4, 'again'), 0);
  assert.equal(nextBox(5, 'easy'), 5);
  const now = 1_000_000;
  const a = rate(undefined, 'good', now);
  assert.deepEqual(a, { box: 1, due: now + INTERVALS[1], seen: 1, lapses: 0 });
  const b = rate({ box: 3, due: 0, seen: 4, lapses: 0 }, 'again', now);
  assert.deepEqual(b, { box: 0, due: now, seen: 5, lapses: 1 });
});

test('typed answers: case and spacing are ignored, ports accept the bare number', () => {
  const { matchAnswer } = TT.flashMatch;
  const cmd = { deck: 'commands', back: 'switchport trunk native vlan 99' };
  assert.ok(matchAnswer(cmd, '  Switchport   TRUNK native vlan 99 '));
  assert.ok(!matchAnswer(cmd, 'switchport trunk native vlan 98'));
  assert.ok(matchAnswer({ deck: 'commands', back: 'configure terminal', accept: ['conf t'] }, 'CONF T'));
  const ntp = { deck: 'ports', back: 'UDP 123' };
  assert.ok(matchAnswer(ntp, '123'));
  assert.ok(matchAnswer(ntp, 'udp 123'));
  assert.ok(!matchAnswer(ntp, 'tcp 123'));
  assert.ok(matchAnswer({ deck: 'ports', back: 'UDP 53 (TCP 53 for zone transfers and large replies)' }, 'udp 53'));
  assert.ok(matchAnswer({ deck: 'ports', back: 'SSH (also SCP and SFTP)', rev: true }, 'ssh'));
  assert.ok(!matchAnswer(ntp, ''));
});
