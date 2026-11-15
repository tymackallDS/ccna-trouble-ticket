// Lab Sandbox: builder helpers and every guided project (start fails, reference solution passes).
// Run with: node --test tests/sandbox.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('../src/engine.js');
await import('../src/sandbox.js');
await import('../src/projects.js');
const { TT } = globalThis;
const SB = TT.sandbox;

const blank = () => TT.net.makeWorld({ devices: {}, links: [] });

/* ---------------- builder helpers ---------------- */
test('device templates produce valid interfaces', () => {
  let w = blank();
  const ids = {};
  for (const t of SB.TYPE_ORDER) { const r = SB.addDevice(w, t); w = r.w; ids[t] = r.id; }
  assert.deepEqual(ids, { router: 'R1', switch: 'SW1', mls: 'MLS1', pc: 'PC1', laptop: 'LAP1', server: 'SRV1' });
  const R = w.devices.R1;
  assert.equal(R.kind, 'router');
  assert.equal(R.hostname, 'Router');
  assert.deepEqual(SB.physPorts(R), ['GigabitEthernet0/0', 'GigabitEthernet0/1', 'GigabitEthernet0/2']);
  assert.ok(Object.values(R.interfaces).every((i) => i.shutdown === true), 'router ports start shut down');
  const S = w.devices.SW1;
  assert.equal(S.hostname, 'Switch');
  assert.equal(SB.physPorts(S).length, 26);
  assert.ok(S.interfaces['FastEthernet0/24'] && S.interfaces['GigabitEthernet0/2']);
  assert.ok(Object.values(S.interfaces).every((i) => i.mode === 'access' && i.accessVlan === 1 && !i.shutdown));
  assert.match(S.mac, /^[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}$/);
  const M = w.devices.MLS1;
  assert.equal(M.multilayer, true);
  assert.deepEqual(SB.physPorts(M), Array.from({ length: 24 }, (_, i) => 'GigabitEthernet1/0/' + (i + 1)));
  for (const id of ['PC1', 'LAP1', 'SRV1']) {
    assert.equal(w.devices[id].kind, 'pc');
    assert.deepEqual(SB.physPorts(w.devices[id]), ['NIC']);
  }
  assert.equal(w.devices.SRV1.pc.server, true);
  assert.deepEqual(w.devices.SRV1.pc.pools, []);
  // the CLI works on every template
  const s = new TT.Session(w);
  assert.match(s.run('R1', 'show ip interface brief')[0], /Interface/);
  s.run('MLS1', 'enable');
  assert.deepEqual(s.run('MLS1', 'configure terminal').slice(0, 1), ['Enter configuration commands, one per line.  End with CNTL/Z.']);
  assert.deepEqual(s.run('MLS1', 'interface g1/0/24'), []);
});

test('links reject duplicate ports, self links and unknown ports', () => {
  let w = blank();
  for (const t of ['router', 'switch', 'pc', 'pc']) w = SB.addDevice(w, t).w;
  w = SB.addLink(w, 'R1', 'g0/0', 'SW1', 'Gi0/1');
  assert.deepEqual(w.links[0], ['R1', 'GigabitEthernet0/0', 'SW1', 'GigabitEthernet0/1']);
  assert.throws(() => SB.addLink(w, 'PC1', 'NIC', 'SW1', 'gi0/1'), /already has a cable/);
  assert.throws(() => SB.addLink(w, 'R1', 'Gi0/0', 'PC1', 'NIC'), /already has a cable/);
  assert.throws(() => SB.addLink(w, 'SW1', 'fa0/1', 'SW1', 'fa0/2'), /different device/);
  assert.throws(() => SB.addLink(w, 'SW1', 'fa0/25', 'PC1', 'NIC'), /no port/);
  assert.throws(() => SB.addLink(w, 'R1', 'g0/3', 'PC1', 'NIC'), /no port/);
  w = SB.addLink(w, 'PC1', 'NIC', 'SW1', 'fa0/1');
  assert.throws(() => SB.addLink(w, 'PC1', 'NIC', 'SW1', 'fa0/2'), /already has a cable/);
  assert.deepEqual(SB.freePorts(w, 'PC1'), []);
  assert.equal(SB.freePorts(w, 'SW1').length, 24);
  assert.ok(SB.linkError(w.devices, [['PC2', 'NIC', 'SW1', 'FastEthernet0/3'], ['PC2', 'NIC', 'SW1', 'FastEthernet0/4']]));
});

test('rebuilding the world keeps every device configuration', () => {
  let w = blank();
  w = SB.addDevice(w, 'router').w;
  let s = new TT.Session(w);
  for (const c of ['en', 'conf t', 'hostname KEEP-ME', 'int g0/0', 'ip address 10.9.9.1 255.255.255.0', 'no shut']) s.run('R1', c);
  const r1 = w.devices.R1;
  w = SB.addDevice(w, 'pc').w;
  assert.equal(w.devices.R1, r1, 'the same device object is carried across');
  w = SB.addLink(w, 'R1', 'Gi0/0', 'PC1', 'NIC');
  s = new TT.Session(w);
  assert.equal(w.devices.R1.hostname, 'KEEP-ME');
  assert.equal(w.devices.R1.mode, 'if', 'CLI mode survives too');
  SB.run(s, 'PC1', 'ipconfig 10.9.9.10 255.255.255.0 10.9.9.1');
  assert.equal(TT.net.ping(w, 'PC1', '10.9.9.1').ok, true);
  assert.equal(SB.portState(w, 'R1', 'GigabitEthernet0/0', null), 'up');
  w = SB.removeLink(w, 0);
  assert.equal(w.devices.R1.interfaces['GigabitEthernet0/0'].ip, '10.9.9.1');
  assert.equal(SB.portState(w, 'R1', 'GigabitEthernet0/0', null), 'down');
  w = SB.addLink(w, 'R1', 'Gi0/0', 'PC1', 'NIC');
  w = SB.removeDevice(w, 'PC1');
  assert.equal(w.links.length, 0, 'deleting a device removes its cables');
  assert.equal(w.devices.R1.hostname, 'KEEP-ME');
});

test('STP blocking shows as an amber light', () => {
  let w = blank();
  w = SB.addDevice(w, 'switch').w;
  w = SB.addDevice(w, 'switch').w;
  w = SB.addLink(w, 'SW1', 'Gi0/1', 'SW2', 'Gi0/1');
  w = SB.addLink(w, 'SW1', 'Gi0/2', 'SW2', 'Gi0/2');
  const flat = SB.linkStates(w).flat();
  assert.equal(flat.filter((x) => x === 'block').length, 1);
  assert.equal(flat.filter((x) => x === 'up').length, 3);
});

test('PC and server sandbox commands', () => {
  let w = blank();
  w = SB.addDevice(w, 'server').w;
  const s = new TT.Session(w);
  assert.match(SB.run(s, 'SRV1', 'ipconfig 10.0.0.0 255.255.255.0').join(' '), /network address/);
  assert.match(SB.run(s, 'SRV1', 'ipconfig 10.0.0.5 255.255.0.255').join(' '), /mask/);
  assert.match(SB.run(s, 'SRV1', 'ipconfig 10.0.0.5 255.255.255.0 10.1.0.1').join(' '), /same subnet/);
  SB.run(s, 'SRV1', 'ipconfig 10.0.0.5 /24 10.0.0.1');
  assert.equal(w.devices.SRV1.pc.mask, '255.255.255.0');
  assert.match(SB.run(s, 'SRV1', 'dhcp pool add P1 10.0.0.1 255.255.255.0 10.0.0.1 10.0.0.100 10.0.0.150').join(' '), /network address/);
  assert.match(SB.run(s, 'SRV1', 'dhcp pool add P1 10.0.0.0 255.255.255.0 10.0.0.120 10.0.0.100 10.0.0.150').join(' '), /gateway outside/);
  assert.match(SB.run(s, 'SRV1', 'dhcp pool add P1 10.0.0.0 255.255.255.0 10.0.0.1 10.0.0.100 10.0.0.150').join(' '), /added/);
  assert.match(SB.run(s, 'SRV1', 'dhcp pool add p1 10.0.0.0 255.255.255.0 10.0.0.1 10.0.0.100 10.0.0.150').join(' '), /already/);
  assert.equal(w.devices.SRV1.pc.pools.length, 1);
  assert.match(SB.run(s, 'SRV1', 'help').join('\n'), /dhcp pool add/);
  assert.match(SB.run(s, 'SRV1', 'dhcp pool remove P1').join(' '), /removed/);
});

test('saved labs round-trip and bad imports are rejected', () => {
  const p = TT.labProjects.byId.vlans;
  const w = SB.worldFromSpec(p.start);
  const snap = SB.snapshot(w, p.start.positions, p.id);
  assert.equal(SB.validateState(JSON.parse(JSON.stringify(snap))), null);
  const back = SB.loadState(JSON.parse(JSON.stringify(snap)));
  assert.equal(back.w.devices.SW1.hostname, 'CAN-SW1');
  assert.equal(back.w.links.length, 4);
  assert.deepEqual(back.positions.SW1, p.start.positions.SW1);
  assert.ok(SB.validateState(null));
  assert.ok(SB.validateState({ devices: {} }));
  assert.ok(SB.validateState(Object.assign({}, snap, { links: [['SW1', 'FastEthernet0/1', 'GHOST', 'NIC']] })));
  assert.ok(SB.validateState(Object.assign({}, snap, { links: snap.links.concat([['SW1', 'FastEthernet0/1', 'D1', 'NIC']]) })));
  assert.ok(SB.validateState(Object.assign({}, snap, { devices: Object.assign({}, snap.devices, { X1: { kind: 'toaster', hostname: 'x' } }) })));
  assert.ok(SB.validateState(Object.assign({}, snap, { positions: { SW1: { x: 'a', y: 1 } } })));
});

/* ---------------- projects ---------------- */
test('project data is complete and consistent', () => {
  const P = TT.labProjects;
  assert.ok(P.length >= 12 && P.length <= 15, `${P.length} projects`);
  assert.equal(new Set(P.map((p) => p.id)).size, P.length, 'ids unique');
  const levels = new Set();
  for (const p of P) {
    assert.match(p.id, /^[a-z0-9-]+$/);
    for (const k of ['title', 'day', 'brief', 'takeaway']) assert.ok(typeof p[k] === 'string' && p[k].length > 3, `${p.id}.${k}`);
    assert.match(p.day, /^Days? \d+/);
    assert.ok(['Starter', 'Core', 'Challenge'].includes(p.level));
    levels.add(p.level);
    assert.ok(Number.isInteger(p.minutes) && p.minutes > 0);
    assert.ok(p.steps.length >= 3 && p.steps.every((s) => typeof s === 'string'));
    assert.ok(p.hints.length >= 1 && p.checks.length >= 3);
    for (const c of p.checks) assert.ok(typeof c.text === 'string' && typeof c.fn === 'function');
    for (const id of Object.keys(p.start.devices)) assert.ok(p.start.positions[id], `${p.id}: position for ${id}`);
    const w = SB.worldFromSpec(p.start); // throws on a bad cable
    for (const [dev] of SB.solutionSteps(p)) if (dev !== '_build') assert.ok(w.devices[dev] || SB.solutionSteps(p).some(([d, c]) => d === '_build' && c.some((x) => x.split(/\s+/)[2] === dev)), `${p.id}: solution device ${dev}`);
  }
  assert.equal(levels.size, 3);
  assert.ok(P.filter((p) => SB.solutionSteps(p).some(([d, c]) => d === '_build' && c.some((x) => /^(add|cable)/.test(x)))).length >= 4, 'several projects need placing or cabling');
});

for (const p of TT.labProjects) {
  test(`project "${p.title}" starts unfinished and its solution passes`, () => {
    let w = SB.worldFromSpec(p.start);
    const start = p.checks.map((c) => { try { return !!c.fn(w); } catch (e) { return false; } });
    assert.ok(start.some((x) => !x), 'every check already passes at the start');
    let s = new TT.Session(w);
    for (const [dev, cmds] of SB.solutionSteps(p)) {
      for (const c of cmds) {
        if (dev === '_build') { w = SB.applyBuild(w, c).w; s = new TT.Session(w); continue; }
        const out = SB.run(s, dev, c);
        const bad = out.find((l) => /^% (Invalid|Incomplete|Ambiguous)/.test(l) || /^% (Access denied|Please|There is|No pool)/.test(l) || /not recognized/.test(l));
        assert.equal(bad, undefined, `${dev}: "${c}" -> ${out.join(' | ')}`);
      }
    }
    p.checks.forEach((c, i) => assert.ok(c.fn(w), `check ${i + 1} failed: ${c.text}`));
  });
}

