// Replays every ticket's solution through the simulated CLI and checks the objectives.
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('../src/engine.js');
await import('../src/scenarios.js');
const { TT } = globalThis;

for (const t of TT.tickets) {
  test(`${t.number} starts broken`, () => {
    const w = TT.net.makeWorld(t.world);
    const st = { answers: {} };
    const done = t.objectives.filter((o) => o.check(w, st));
    assert.ok(done.length < t.objectives.length, 'every objective already passes before any work');
  });

  test(`${t.number} "${t.title}" is solvable`, () => {
    const w = TT.net.makeWorld(t.world);
    const s = new TT.Session(w);
    const st = { answers: {} };
    for (const q of t.questions || []) st.answers[q.id] = q.accept.includes(t.answers[q.id]);
    for (const [dev, cmds] of Object.entries(t.solution)) {
      for (const c of cmds) {
        const out = s.run(dev, c);
        const err = out.find((l) => /^% (Invalid|Incomplete|Ambiguous)/.test(l));
        assert.equal(err, undefined, `${dev}: "${c}" -> ${out.join(' | ')}`);
      }
    }
    for (const o of t.objectives) assert.ok(o.check(w, st), `objective failed: ${o.text}`);
  });
}

test('abbreviations resolve like IOS', () => {
  const t = TT.tickets.byId.t01;
  const s = new TT.Session(TT.net.makeWorld(t.world));
  s.run('R1', 'en');
  assert.match(s.run('R1', 'sh ip int br')[0], /Interface/);
  assert.match(s.run('R1', 'sho run').join('\n'), /hostname Router/);
  assert.match(s.run('R1', 'xyz').join('\n'), /Invalid input/);
  assert.match(s.run('R1', 'c').join('\n'), /Ambiguous|Invalid/);
});

test('wrong gateway address breaks the warehouse ping', () => {
  const t = TT.tickets.byId.t02;
  const w = TT.net.makeWorld(t.world);
  const s = new TT.Session(w);
  for (const c of ['en', 'conf t', 'int g0/1', 'ip address 172.16.40.66 255.255.255.192', 'no shut']) s.run('R1', c);
  assert.equal(TT.net.ping(w, 'PCW', '172.16.40.10').ok, false);
});

test('trunk "allowed vlan 20" without add cuts off sales', () => {
  const t = TT.tickets.byId.t04;
  const w = TT.net.makeWorld(t.world);
  const s = new TT.Session(w);
  for (const c of ['en', 'conf t', 'int g0/1', 'switchport trunk allowed vlan 20']) s.run('SW1', c);
  for (const c of ['en', 'conf t', 'vlan 20', 'name HR']) s.run('SW2', c);
  assert.equal(TT.net.ping(w, 'PCH1', '10.20.20.21').ok, true);
  assert.equal(TT.net.ping(w, 'PCS1', '10.10.10.21').ok, false);
});

test('one-way static route fails the ping', () => {
  const t = TT.tickets.byId.t05;
  const w = TT.net.makeWorld(t.world);
  const s = new TT.Session(w);
  for (const c of t.solution.R1) s.run('R1', c);
  const r = TT.net.ping(w, 'PCH', '10.0.2.10');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no-return-path');
});

test('subnet math helpers', () => {
  const { ipToInt, intToIp, maskToPrefix, netOf } = TT.ip;
  assert.equal(maskToPrefix('255.255.255.192'), 26);
  assert.equal(maskToPrefix('255.0.255.0'), null);
  assert.equal(intToIp(netOf(ipToInt('172.16.40.70'), 26)), '172.16.40.64');
});

const run = (t, cmds) => {
  const w = TT.net.makeWorld(t.world);
  const s = new TT.Session(w);
  for (const [dev, list] of cmds) for (const c of list) s.run(dev, c);
  return { w, s };
};

test('STP: by default the old access switch is root and a core uplink blocks', () => {
  const { w } = run(TT.tickets.byId.t08, []);
  const st = TT.net.computeStp(w, 10);
  assert.equal(st.root.dev, 'ACC1');
  assert.equal(st.ports.CORE['GigabitEthernet0/2'].sts, 'BLK');
});

test('EtherChannel: making one side active is not enough while Gi0/2 mismatches', () => {
  const { w } = run(TT.tickets.byId.t09, [['SW1', ['en', 'conf t', 'interface range g0/1 - 2', 'channel-group 1 mode active']]]);
  const g = TT.net.computeEc(w, 'SW2')[1];
  assert.equal(g.members['GigabitEthernet0/1'], 'P');
  assert.equal(g.members['GigabitEthernet0/2'], 's');
});

test('DHCP: renewing before the relay fix falls back to APIPA', () => {
  const { w, s } = run(TT.tickets.byId.t10, []);
  const out = s.run('CL', 'ipconfig /renew').join('\n');
  assert.match(out, /APIPA/);
  assert.match(w.devices.CL.pc.ip, /^169\.254\./);
});

test('ACL: right order but still applied outbound does not stop guests', () => {
  const t = TT.tickets.byId.t11;
  const { w } = run(t, [['R1', ['en', 'conf t', 'no access-list 110', 'access-list 110 deny ip 10.0.20.0 0.0.0.255 host 10.0.30.10', 'access-list 110 permit ip any any']]]);
  assert.equal(TT.net.ping(w, 'GUEST', '10.0.30.10').ok, true);
});

test('ACL: blocked ping shows U.U.U on the router', () => {
  const t = TT.tickets.byId.t11;
  const { s } = run(t, [['R1', ['en', 'conf t', 'access-list 120 deny icmp any any', 'int g0/2', 'ip access-group 120 out', 'end']]]);
  assert.match(s.run('R1', 'ping 10.0.30.20').join('\n'), /U\.U\.U/);
});

test('NAT: swapped inside/outside means no return path', () => {
  const { w } = run(TT.tickets.byId.t12, []);
  const r = TT.net.ping(w, 'PC', '198.51.100.10');
  assert.equal(r.ok, false);
});

test('router-on-a-stick refuses duplicate VLAN tags', () => {
  const { s } = run(TT.tickets.byId.t07, []);
  for (const c of ['en', 'conf t', 'int g0/0.20']) s.run('R1', c);
  assert.match(s.run('R1', 'encapsulation dot1q 10').join('\n'), /not permitted/);
});

test('course map covers all 63 days and every link resolves', async () => {
  await import('../src/guide.js');
  await import('../src/course.js');
  const TT = globalThis.TT;
  assert.equal(TT.course.length, 63);
  TT.course.forEach((d, k) => assert.equal(d[0], k + 1));
  const ids = new Set(TT.cards.map((c) => c.id));
  for (const [day, , x] of TT.course) {
    for (const c of x.c || []) assert.ok(ids.has(c), `day ${day}: card ${c}`);
    for (const t of x.t || []) assert.ok(TT.tickets.byId[t], `day ${day}: ticket ${t}`);
    assert.ok((x.c || []).length || (x.t || []).length || x.hw || x.drill, `day ${day} has practice`);
  }
  for (const t of TT.tickets) assert.ok(TT.course.some((d) => (d[2].t || []).includes(t.id)), `${t.id} on the map`);
  for (const c of TT.cards) for (const q of c.q) assert.ok(q[2] >= 0 && q[2] < q[1].length, c.id);
});

test('t15 half-fix: bouncing the port before removing the old sticky MAC re-violates', () => {
  const t = TT.tickets.byId.t15;
  const w = TT.net.makeWorld(t.world);
  const s = new TT.Session(w);
  const dev = 'SW';
  for (const c of ['en', 'conf t', 'int fa0/3', 'shutdown', 'no shutdown', 'end']) s.run(dev, c);
  assert.ok(w.devices.SW.interfaces['FastEthernet0/3'].errdis);
});

test('t16 half-fix: priority without fixing GW2 fails the failover check', () => {
  const t = TT.tickets.byId.t16;
  const w = TT.net.makeWorld(t.world);
  const s = new TT.Session(w);
  const dev = 'R1';
  for (const c of ['en', 'conf t', 'int g0/0', 'standby 1 priority 110', 'standby 1 preempt', 'end']) s.run(dev, c);
  assert.ok(!t.objectives[3].check(w));
});

test('t18: renewing before snooping still hands out a rogue address', () => {
  const t = TT.tickets.byId.t18;
  const w = TT.net.makeWorld(t.world);
  new TT.Session(w).run('PCA', 'ipconfig /renew');
  assert.ok(w.devices.PCA.pc.ip.startsWith('192.168.1.'));
});

test('v1.1 blueprint lists all 53 objectives with valid links', async () => {
  await import('../src/guide.js');
  await import('../src/course.js');
  await import('../src/wlc.js');
  const { TT } = globalThis;
  assert.equal(TT.blueprint.length, 53);
  const ids = new Set(TT.cards.map((c) => c.id));
  for (const [obj, , x] of TT.blueprint) {
    for (const c of x.c || []) assert.ok(ids.has(c), `${obj}: card ${c}`);
    for (const t of x.t || []) assert.ok(TT.tickets.byId[t], `${obj}: ticket ${t}`);
    assert.ok((x.c || []).length || (x.t || []).length || x.hw, `${obj} has practice`);
  }
});

test('WLC tasks fail on a fresh controller', async () => {
  await import('../src/wlc.js');
  const fresh = { wlans: [] };
  for (const t of globalThis.TT.wlcTasks) assert.ok(t.check(fresh).length > 0, t.id);
});

test('t21 half-fix: correcting static NAT but not adding overload still strands a PC', () => {
  const t = TT.tickets.byId.t21;
  const w = TT.net.makeWorld(t.world);
  const s = new TT.Session(w);
  for (const c of ['en', 'conf t', 'no ip nat inside source static 203.0.113.5 192.168.50.10', 'ip nat inside source static 192.168.50.10 203.0.113.5', 'end']) s.run('R1', c);
  assert.ok(t.objectives[1].check(w));
  assert.ok(!t.objectives[2].check(w));
});

test('t19 half-fix: priorities alone do not move the DR until the process is cleared', () => {
  const t = TT.tickets.byId.t19;
  const w = TT.net.makeWorld(t.world);
  const s = new TT.Session(w);
  for (const c of ['en', 'conf t', 'int g0/0', 'ip ospf priority 255', 'end']) s.run('R1', c);
  for (const c of ['en', 'conf t', 'int g0/0', 'ip ospf priority 200', 'end']) s.run('R2', c);
  assert.ok(!t.objectives[0].check(w));
});

test('t22: root guard alone leaves the BPDU-filter loop', () => {
  const t = TT.tickets.byId.t22;
  const w = TT.net.makeWorld(t.world);
  const s = new TT.Session(w);
  for (const c of ['en', 'conf t', 'int fa0/10', 'spanning-tree guard root', 'end']) s.run('A1', c);
  assert.ok(t.objectives[0].check(w));
  assert.ok(!t.objectives[2].check(w));
});
