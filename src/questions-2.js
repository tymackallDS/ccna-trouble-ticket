/* Harbor Point Night Shift: mock-exam question bank, part 2.
 * Domains 3.0 IP Connectivity, 4.0 IP Services, 5.0 Security Fundamentals,
 * 6.0 Automation and Programmability (CCNA 200-301 v1.1).
 * All questions are original. Sim questions carry a starting world for the
 * simulator (src/engine.js) and a check in TT.simChecks.
 */
(function (G) {
  'use strict';
  const TT = (G.TT = G.TT || {});
  TT.questions = TT.questions || [];
  TT.simChecks = TT.simChecks || {};
  const checks = TT.simChecks;

  /* ---- exhibit helpers ------------------------------------------------ */
  // Multi-line text keeps its spacing; a leading and trailing newline are dropped.
  const lines = (t) => t.replace(/^\n/, '').replace(/\n\s*$/, '').split('\n');
  const cli = (title, t) => ({ kind: 'cli', title, lines: lines(t) });
  const table = (rows) => ({ kind: 'table', rows });
  const CODES = `Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP
       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area
       N1 - OSPF NSSA external type 1, N2 - OSPF NSSA external type 2
       E1 - OSPF external type 1, E2 - OSPF external type 2
       i - IS-IS, su - IS-IS summary, L1 - IS-IS level-1, L2 - IS-IS level-2
       ia - IS-IS inter area, * - candidate default, U - per-user static route
       o - ODR, P - periodic downloaded static route, H - NHRP, l - LISP
       + - replicated route, % - next hop override
`;
  /** A show ip route exhibit: prompt line, the codes legend, then the body. */
  const rt = (host, body) => cli(host, host + '# show ip route\n' + CODES + '\n' + body.replace(/^\n/, ''));

  /* ---- sim world helpers ---------------------------------------------- */
  function sw(hostname, n, overrides) {
    const interfaces = {};
    for (let i = 1; i <= n; i++) interfaces['FastEthernet0/' + i] = {};
    interfaces['GigabitEthernet0/1'] = {};
    interfaces['GigabitEthernet0/2'] = {};
    for (const [k, v] of Object.entries(overrides || {})) interfaces[k] = Object.assign({}, interfaces[k], v);
    return { kind: 'switch', hostname, interfaces, vlans: { 1: 'default' } };
  }
  const pc = (hostname, ip, mask, gw, extra) => ({ kind: 'pc', hostname, pc: Object.assign({ ip, mask, gw }, extra || {}) });
  const up = (ip, mask, extra) => Object.assign({ ip, mask, shutdown: false }, extra || {});
  const G0 = 'GigabitEthernet0/0';
  const G1 = 'GigabitEthernet0/1';
  const G2 = 'GigabitEthernet0/2';
  const G3 = 'GigabitEthernet0/3';
  const can = (w, from, ip) => TT.net.ping(w, from, ip).ok;
  const ifc = (w, dev, n) => (w.devices[dev] && w.devices[dev].interfaces[n]) || {};
  const rtHas = (w, dev, pred) => TT.net.routingTable(w, dev).some(pred);
  const ipStr = (n) => TT.ip.intToIp(n);
  const covers = (r, ip) => TT.ip.netOf(TT.ip.ipToInt(ip), r.p) === r.net;
  const isStd = (n) => (n >= 1 && n <= 99) || (n >= 1300 && n <= 1999);
  const isExt = (n) => (n >= 100 && n <= 199) || (n >= 2000 && n <= 2699);
  const adjUp = (w, a, b) => TT.net.computeOspf(w).adj.some((x) => x.a === a && x.b === b && x.usable);
  const natGlobal = (w, from, ip) => {
    const r = TT.net.ping(w, from, ip);
    return r.ok && r.there && r.there.nat ? ipStr(r.there.nat.global) : null;
  };

  const Q = [];

  /* =====================================================================
   * SIMS
   * ===================================================================== */

  checks['q2-static-chain'] = (w) =>
    rtHas(w, 'R1', (r) => r.type === 'S' && r.p === 0) &&
    rtHas(w, 'R2', (r) => r.type === 'S' && r.p > 0 && covers(r, '10.10.0.10')) &&
    rtHas(w, 'R3', (r) => r.type === 'S' && r.p > 0 && covers(r, '10.10.0.10')) &&
    can(w, 'PC1', '10.30.0.10');

  checks['q2-floating-static'] = (w) => {
    const normal = TT.net.routingTable(w, 'R1').find((r) => r.p === 24 && ipStr(r.net) === '10.9.0.0');
    if (!normal || normal.type !== 'O' || !can(w, 'PC1', '10.9.0.10')) return false;
    const f = TT.net.clone(w);
    f.devices.R1.interfaces[G1].shutdown = true;
    f.ospfDr = {};
    const backup = TT.net.routingTable(f, 'R1').find((r) => covers(r, '10.9.0.10') && r.type === 'S');
    return !!backup && backup.ad > 110 && can(f, 'PC1', '10.9.0.10');
  };

  checks['q2-ospf-basic'] = (w) =>
    adjUp(w, 'R2', 'R1') && adjUp(w, 'R2', 'R3') &&
    TT.net.routerId(w.devices.R2) === '2.2.2.2' &&
    (w.devices.R1.ospf.passive || []).includes(G0) &&
    can(w, 'PC1', '10.3.3.10');

  checks['q2-ospf-dr'] = (w) => {
    TT.net.computeOspf(w);
    const r = w.ospfRoles || {};
    return ifc(w, 'R3', G0).ospfPrio === 0 && r['R1|' + G0] === 'DR' && r['R2|' + G0] === 'BDR' && r['R3|' + G0] === 'DROTHER';
  };

  checks['q2-ospf-p2p'] = (w) => {
    const { adj } = TT.net.computeOspf(w);
    const ok = (a, b) => adj.some((x) => x.a === a && x.b === b && x.role === 'P2P' && !x.mism && x.usable);
    return ifc(w, 'R1', G1).ospfNet === 'p2p' && ok('R1', 'R2') && ok('R2', 'R1') && can(w, 'PC1', '10.2.0.10');
  };

  checks['q4-static-nat'] = (w) =>
    (w.devices.R1.natStatic || []).some((m) => m.local === '192.168.10.20' && m.global === '203.0.113.20') &&
    can(w, 'INET', '203.0.113.20') &&
    can(w, 'PC', '198.51.100.10');

  checks['q4-pool-nat'] = (w) => {
    const d = w.devices.R1;
    if (!d.nat || !d.nat.pool || d.nat.overload) return false;
    const pl = (d.natPools || {})[d.nat.pool];
    if (!pl) return false;
    const inPool = (g) => !!g && TT.ip.ipToInt(g) >= TT.ip.ipToInt('203.0.113.41') && TT.ip.ipToInt(g) <= TT.ip.ipToInt('203.0.113.46');
    const g1 = natGlobal(w, 'PC1', '198.51.100.10');
    const g2 = natGlobal(w, 'PC2', '198.51.100.10');
    return inPool(g1) && inPool(g2) && g1 !== g2;
  };

  checks['q4-pat'] = (w) => {
    const d = w.devices.R1;
    return !!d.nat && d.nat.outIf === G1 &&
      natGlobal(w, 'PC1', '192.0.2.80') === '198.51.100.6' &&
      natGlobal(w, 'PC2', '192.0.2.80') === '198.51.100.6';
  };

  checks['q4-dhcp-relay'] = (w) => {
    const h1 = ifc(w, 'R1', G1).helpers || [];
    const h2 = ifc(w, 'R1', G2).helpers || [];
    const ip1 = w.devices.CL1.pc.ip || '';
    const ip2 = w.devices.CL2.pc.ip || '';
    return h1.includes('10.60.10.5') && !h1.includes('10.60.10.50') && h2.includes('10.60.10.5') &&
      ip1.startsWith('10.60.21.') && ip2.startsWith('10.60.22.') &&
      can(w, 'CL1', '10.60.10.5') && can(w, 'CL2', '10.60.10.5');
  };

  checks['q4-ntp-client'] = (w) => {
    const s1 = TT.net.ntpStatus(w, 'R1');
    const s2 = TT.net.ntpStatus(w, 'R2');
    const servers = (w.devices.R1.ntp && w.devices.R1.ntp.servers) || [];
    return s1.synced && s1.ref === '10.0.0.123' && !servers.includes('10.0.0.132') && s2.synced && s2.ref === '10.0.12.1';
  };

  checks['q4-ssh'] = (w) => {
    const d = w.devices.R1;
    const v = d.vty || {};
    return d.hostname === 'HPL-WAN1' && (d.rsa || 0) >= 2048 && d.sshver === 2 &&
      !!((d.users || {}).nightops || {}).secret &&
      JSON.stringify(v.transport) === '["ssh"]' && v.login === 'local' &&
      JSON.stringify(v.timeout) === '[10,0]' &&
      TT.net.remoteLogin(w, 'PC', '10.0.99.1', 'ssh', 'nightops').ok &&
      !TT.net.remoteLogin(w, 'PC', '10.0.99.1', 'telnet').ok;
  };

  checks['q5-std-acl'] = (w) => {
    const d = w.devices.R1;
    const out = ifc(w, 'R1', G2).aclOut;
    const anyIn = Object.values(d.interfaces).some((i) => i.aclIn !== undefined);
    return out !== undefined && isStd(out) && !anyIn &&
      !can(w, 'GUEST', '10.0.40.10') && can(w, 'KIOSK', '10.0.40.10') &&
      can(w, 'STAFF', '10.0.40.10') && can(w, 'GUEST', '10.0.30.20');
  };

  checks['q5-ext-acl'] = (w) => {
    const i1 = ifc(w, 'R1', G1);
    return i1.aclIn !== undefined && isExt(i1.aclIn) && ifc(w, 'R1', G2).aclOut === undefined &&
      !can(w, 'WH', '10.0.99.5') && can(w, 'WH', '10.0.99.6') && can(w, 'OFFICE', '10.0.99.5');
  };

  checks['q5-port-security'] = (w) => {
    const f1 = ifc(w, 'SW', 'FastEthernet0/1');
    const f2 = ifc(w, 'SW', 'FastEthernet0/2');
    const p1 = f1.ps || {};
    const p2 = f2.ps || {};
    return !!(p1.on && p1.sticky && (p1.max || 1) === 1 && p1.viol === 'restrict' && (p1.macs || []).includes('0050.7966.6a01') &&
      f2.mode === 'access' && f2.modeSet && p2.on && p2.max === 2 && !f1.errdis && !f2.errdis &&
      can(w, 'PCA', '10.10.2.50') && can(w, 'PCB', '10.10.2.50'));
  };

  checks['q5-local-passwords'] = (w) => {
    const d = w.devices.R1;
    const con = d.con || {};
    const vty = d.vty || {};
    const users = Object.values(d.users || {});
    const conOk = (con.login === 'password' && !!con.password) || (con.login === 'local' && users.length > 0);
    return !!d.enableSecret && !!d.pwEnc && conOk && JSON.stringify(con.timeout) === '[5,0]' &&
      users.some((u) => u.secret) && vty.login === 'local';
  };

  Q.push(
    {
      id: 'q3-0901', obj: '3.3', type: 'sim', difficulty: 2,
      stem: 'Sim. The Glen Burnie branch (10.10.0.0/24) cannot reach the data-center server at 10.30.0.10. HPL-CORE already knows how to reach the data center. Use static routes only, and keep the branch router simple: it has one way out, so give it a default route.',
      sim: {
        world: {
          devices: {
            R1: { kind: 'router', hostname: 'HPL-BRANCH', interfaces: { [G0]: up('10.10.0.1', '255.255.255.0'), [G1]: up('10.0.12.1', '255.255.255.252') } },
            R2: { kind: 'router', hostname: 'HPL-CORE', interfaces: { [G0]: up('10.0.12.2', '255.255.255.252'), [G1]: up('10.0.23.1', '255.255.255.252') }, routes: [{ net: '10.30.0.0', mask: '255.255.255.0', nh: '10.0.23.2' }] },
            R3: { kind: 'router', hostname: 'HPL-DC', interfaces: { [G0]: up('10.0.23.2', '255.255.255.252'), [G1]: up('10.30.0.1', '255.255.255.0') } },
            PC1: pc('PC-BRANCH', '10.10.0.10', '255.255.255.0', '10.10.0.1'),
            SRV: pc('DC-SRV', '10.30.0.10', '255.255.255.0', '10.30.0.1'),
          },
          links: [['PC1', 'NIC', 'R1', G0], ['R1', G1, 'R2', G0], ['R2', G1, 'R3', G0], ['SRV', 'NIC', 'R3', G1]],
        },
        topology: { nodes: [{ id: 'PC1', x: 60, y: 70, type: 'pc' }, { id: 'R1', x: 200, y: 70, type: 'router' }, { id: 'R2', x: 340, y: 70, type: 'router' }, { id: 'R3', x: 480, y: 70, type: 'router' }, { id: 'SRV', x: 620, y: 70, type: 'pc' }] },
        start: 'R1',
        tasks: [
          'HPL-BRANCH has a default static route toward HPL-CORE',
          'HPL-CORE has a static route to the branch LAN 10.10.0.0/24',
          'HPL-DC has a static route back to 10.10.0.0/24',
          'PC-BRANCH can ping DC-SRV at 10.30.0.10',
        ],
        check: 'q2-static-chain',
        solution: {
          R1: ['enable', 'configure terminal', 'ip route 0.0.0.0 0.0.0.0 10.0.12.2', 'end'],
          R2: ['enable', 'configure terminal', 'ip route 10.10.0.0 255.255.255.0 10.0.12.1', 'end'],
          R3: ['enable', 'configure terminal', 'ip route 10.10.0.0 255.255.255.0 10.0.23.1', 'end'],
        },
      },
      explanation: 'Every router on the path needs a route to the destination, and every router on the return path needs a route back. HPL-BRANCH is a stub with a single exit, so ip route 0.0.0.0 0.0.0.0 10.0.12.2 is the tidy choice: it becomes the gateway of last resort. HPL-CORE already reaches 10.30.0.0/24 but has no idea where 10.10.0.0/24 lives, so it needs ip route 10.10.0.0 255.255.255.0 10.0.12.1. HPL-DC needs the same network route pointing at 10.0.23.1, or replies from the server die there. The classic mistake is fixing only the forward direction: the ping request arrives, the reply has nowhere to go, and the test still fails. Verify with show ip route (look for S and S*) and a ping from the PC.',
      ref: 'Lesson l3-3; card:static',
    },
    {
      id: 'q3-0902', obj: '3.3', type: 'sim', difficulty: 3,
      stem: 'Sim. HPL-BRANCH reaches the HQ server LAN (10.9.0.0/24) over a fiber link with OSPF. A cheap LTE link (10.0.112.0/30) is cabled but unused, and HPL-HQ already has a floating route back to the branch over it. Add a backup route on HPL-BRANCH so traffic uses LTE only when the fiber (Gi0/1) fails.',
      sim: {
        world: {
          devices: {
            R1: {
              kind: 'router', hostname: 'HPL-BRANCH',
              interfaces: { [G0]: up('10.20.0.1', '255.255.255.0'), [G1]: up('10.0.12.1', '255.255.255.252', { desc: 'FIBER' }), [G2]: up('10.0.112.1', '255.255.255.252', { desc: 'LTE-BACKUP' }) },
              ospf: { pid: 1, routerId: '1.1.1.1', networks: [{ net: '10.20.0.0', wild: '0.0.0.255', area: 0 }, { net: '10.0.12.0', wild: '0.0.0.3', area: 0 }], passive: [G0] },
            },
            R2: {
              kind: 'router', hostname: 'HPL-HQ',
              interfaces: { [G0]: up('10.9.0.1', '255.255.255.0'), [G1]: up('10.0.12.2', '255.255.255.252'), [G2]: up('10.0.112.2', '255.255.255.252') },
              ospf: { pid: 1, routerId: '2.2.2.2', networks: [{ net: '10.9.0.0', wild: '0.0.0.255', area: 0 }, { net: '10.0.12.0', wild: '0.0.0.3', area: 0 }], passive: [G0] },
              routes: [{ net: '10.20.0.0', mask: '255.255.255.0', nh: '10.0.112.1', ad: 250 }],
            },
            PC1: pc('PC-BRANCH', '10.20.0.10', '255.255.255.0', '10.20.0.1'),
            SRV: pc('HQ-SRV', '10.9.0.10', '255.255.255.0', '10.9.0.1'),
          },
          links: [['PC1', 'NIC', 'R1', G0], ['R1', G1, 'R2', G1], ['R1', G2, 'R2', G2], ['SRV', 'NIC', 'R2', G0]],
        },
        topology: { nodes: [{ id: 'PC1', x: 60, y: 90, type: 'pc' }, { id: 'R1', x: 220, y: 90, type: 'router' }, { id: 'R2', x: 440, y: 90, type: 'router' }, { id: 'SRV', x: 610, y: 90, type: 'pc' }] },
        start: 'R1',
        tasks: [
          'With the fiber up, HPL-BRANCH still reaches 10.9.0.0/24 through OSPF',
          'HPL-BRANCH has a floating static route to 10.9.0.0/24 via the LTE next hop 10.0.112.2',
          'If Gi0/1 fails, the static route takes over and PC-BRANCH can still ping 10.9.0.10',
        ],
        check: 'q2-floating-static',
        solution: { R1: ['enable', 'configure terminal', 'ip route 10.9.0.0 255.255.255.0 10.0.112.2 200', 'end'] },
      },
      explanation: 'A floating static route is an ordinary static route with an administrative distance higher than the route it backs up. OSPF routes have an AD of 110, so the static must use something above 110, for example ip route 10.9.0.0 255.255.255.0 10.0.112.2 200. While the fiber is up, the router compares the two candidates for 10.9.0.0/24, OSPF wins at 110, and the static stays out of the routing table. When Gi0/1 goes down the OSPF route disappears and the static floats in. If you leave the AD at the default of 1, or pick anything up to 110, the static wins immediately and all traffic shifts to the LTE link: the classic floating-static mistake. AD 255 would be wrong too, because a route with AD 255 is never installed.',
      ref: 'Lesson l3-3; card:static',
    },
    {
      id: 'q3-0903', obj: '3.4', type: 'sim', difficulty: 2,
      stem: 'Sim. HPL-CORE sits between two edge routers in OSPF process 1, area 0. PC-EDGE1 cannot reach PC-EDGE3. Fix HPL-CORE so it forms both adjacencies, give it router ID 2.2.2.2 to match the addressing plan, and stop HPL-EDGE1 from sending hellos onto its user LAN (Gi0/0).',
      sim: {
        world: {
          devices: {
            R1: {
              kind: 'router', hostname: 'HPL-EDGE1',
              interfaces: { [G0]: up('10.1.1.1', '255.255.255.0'), [G1]: up('10.0.12.1', '255.255.255.252') },
              ospf: { pid: 1, routerId: '1.1.1.1', networks: [{ net: '10.1.1.0', wild: '0.0.0.255', area: 0 }, { net: '10.0.12.0', wild: '0.0.0.3', area: 0 }], passive: [] },
            },
            R2: {
              kind: 'router', hostname: 'HPL-CORE',
              interfaces: { [G0]: up('10.0.12.2', '255.255.255.252'), [G1]: up('10.0.23.1', '255.255.255.252') },
              ospf: { pid: 1, networks: [{ net: '10.0.12.0', wild: '0.0.0.3', area: 0 }, { net: '10.0.23.0', wild: '0.0.0.3', area: 1 }], passive: [] },
            },
            R3: {
              kind: 'router', hostname: 'HPL-EDGE3',
              interfaces: { [G0]: up('10.0.23.2', '255.255.255.252'), [G1]: up('10.3.3.1', '255.255.255.0') },
              ospf: { pid: 1, routerId: '3.3.3.3', networks: [{ net: '10.0.23.0', wild: '0.0.0.3', area: 0 }, { net: '10.3.3.0', wild: '0.0.0.255', area: 0 }], passive: [G1] },
            },
            PC1: pc('PC-EDGE1', '10.1.1.10', '255.255.255.0', '10.1.1.1'),
            PC3: pc('PC-EDGE3', '10.3.3.10', '255.255.255.0', '10.3.3.1'),
          },
          links: [['PC1', 'NIC', 'R1', G0], ['R1', G1, 'R2', G0], ['R2', G1, 'R3', G0], ['PC3', 'NIC', 'R3', G1]],
        },
        topology: { nodes: [{ id: 'PC1', x: 60, y: 70, type: 'pc' }, { id: 'R1', x: 200, y: 70, type: 'router' }, { id: 'R2', x: 340, y: 70, type: 'router' }, { id: 'R3', x: 480, y: 70, type: 'router' }, { id: 'PC3', x: 620, y: 70, type: 'pc' }] },
        start: 'R2',
        tasks: [
          'HPL-CORE is an OSPF neighbor of both HPL-EDGE1 and HPL-EDGE3',
          'HPL-CORE uses router ID 2.2.2.2',
          'HPL-EDGE1 Gi0/0 is a passive OSPF interface',
          'PC-EDGE1 can ping PC-EDGE3 at 10.3.3.10',
        ],
        check: 'q2-ospf-basic',
        solution: {
          R2: ['enable', 'configure terminal', 'router ospf 1', 'no network 10.0.23.0 0.0.0.3 area 1', 'network 10.0.23.0 0.0.0.3 area 0', 'router-id 2.2.2.2', 'end', 'clear ip ospf process'],
          R1: ['enable', 'configure terminal', 'router ospf 1', 'passive-interface g0/0', 'end'],
        },
      },
      explanation: 'show ip ospf interface brief on HPL-CORE shows Gi0/1 in area 1 while HPL-EDGE3 has the other end in area 0. OSPF hellos carry the area ID, and neighbors must agree on it (plus subnet, mask, hello and dead timers, authentication and stub flags), so no adjacency forms. Remove the wrong statement with no network 10.0.23.0 0.0.0.3 area 1 and re-enter it in area 0. The router ID is set under router ospf with router-id 2.2.2.2; on real IOS it only takes effect after clear ip ospf process or a reload. passive-interface g0/0 on HPL-EDGE1 keeps 10.1.1.0/24 advertised while stopping hellos toward PCs, which is good practice on any user LAN. The process ID (1) is locally significant and does not need to match.',
      ref: 'Lesson l3-4; card:ospf',
    },
    {
      id: 'q3-0904', obj: '3.4', type: 'sim', difficulty: 3,
      stem: 'Sim. Three routers share the HQ transit LAN 10.0.123.0/24 (OSPF area 0, all at default priority). HPL-R3 is a small branch-class box and is currently the DR. Make HPL-R1 the DR and HPL-R2 the BDR, and make sure HPL-R3 can never become DR or BDR. Verify with show ip ospf neighbor.',
      sim: {
        world: {
          devices: {
            R1: { kind: 'router', hostname: 'HPL-R1', interfaces: { [G0]: up('10.0.123.1', '255.255.255.0') }, ospf: { pid: 1, routerId: '1.1.1.1', networks: [{ net: '10.0.123.0', wild: '0.0.0.255', area: 0 }], passive: [] } },
            R2: { kind: 'router', hostname: 'HPL-R2', interfaces: { [G0]: up('10.0.123.2', '255.255.255.0') }, ospf: { pid: 1, routerId: '2.2.2.2', networks: [{ net: '10.0.123.0', wild: '0.0.0.255', area: 0 }], passive: [] } },
            R3: { kind: 'router', hostname: 'HPL-R3', interfaces: { [G0]: up('10.0.123.3', '255.255.255.0') }, ospf: { pid: 1, routerId: '3.3.3.3', networks: [{ net: '10.0.123.0', wild: '0.0.0.255', area: 0 }], passive: [] } },
            SW: sw('HPL-TRANSIT', 4),
          },
          links: [['R1', G0, 'SW', G1], ['R2', G0, 'SW', G2], ['R3', G0, 'SW', 'FastEthernet0/1']],
          ospfDr: { '10.0.123.0/24': { dr: 'R3', bdr: 'R2' } },
        },
        topology: { nodes: [{ id: 'R1', x: 120, y: 50, type: 'router' }, { id: 'R2', x: 340, y: 50, type: 'router' }, { id: 'R3', x: 560, y: 50, type: 'router' }, { id: 'SW', x: 340, y: 160, type: 'switch' }] },
        start: 'R3',
        tasks: [
          'HPL-R3 Gi0/0 has OSPF priority 0',
          'HPL-R1 is the DR on 10.0.123.0/24',
          'HPL-R2 is the BDR on 10.0.123.0/24',
        ],
        check: 'q2-ospf-dr',
        solution: {
          R3: ['enable', 'configure terminal', 'interface g0/0', 'ip ospf priority 0', 'end'],
          R1: ['enable', 'configure terminal', 'interface g0/0', 'ip ospf priority 100', 'end', 'clear ip ospf process'],
        },
      },
      explanation: 'On a broadcast segment the DR is the router with the highest interface priority, with the highest router ID breaking ties. Priority 0 means the router never becomes DR or BDR, so HPL-R3 gets ip ospf priority 0 under Gi0/0. HPL-R1 needs a priority higher than the default of 1, such as 100. The catch is that the election is not preemptive: a sitting DR or BDR keeps the job when a better router appears. After R3 drops out, the BDR (R2) is promoted to DR and R1 becomes BDR, which is not what the ticket wants. Running clear ip ospf process forces a fresh election, and R1 then wins on priority with R2 as BDR. Priority is set per interface, not under router ospf, and the router ID only matters when priorities tie.',
      ref: 'Lesson l3-4; card:ospf',
    },
    {
      id: 'q3-0905', obj: '3.4', type: 'sim', difficulty: 3,
      stem: 'Sim. HPL-HQ and HPL-BR are joined by a /30 on Gi0/1 and run OSPF area 0. The branch engineer set the link to the point-to-point network type on his end only, and now neither router installs the other\'s LAN route. Make the link point-to-point on both ends so no DR/BDR election happens.',
      sim: {
        world: {
          devices: {
            R1: {
              kind: 'router', hostname: 'HPL-HQ',
              interfaces: { [G0]: up('10.1.0.1', '255.255.255.0'), [G1]: up('10.0.12.1', '255.255.255.252') },
              ospf: { pid: 10, routerId: '10.255.0.1', networks: [{ net: '10.1.0.0', wild: '0.0.0.255', area: 0 }, { net: '10.0.12.0', wild: '0.0.0.3', area: 0 }], passive: [G0] },
            },
            R2: {
              kind: 'router', hostname: 'HPL-BR',
              interfaces: { [G0]: up('10.2.0.1', '255.255.255.0'), [G1]: up('10.0.12.2', '255.255.255.252', { ospfNet: 'p2p' }) },
              ospf: { pid: 10, routerId: '10.255.0.2', networks: [{ net: '0.0.0.0', wild: '255.255.255.255', area: 0 }], passive: [G0] },
            },
            PC1: pc('PC-HQ', '10.1.0.10', '255.255.255.0', '10.1.0.1'),
            PC2: pc('PC-BR', '10.2.0.10', '255.255.255.0', '10.2.0.1'),
          },
          links: [['PC1', 'NIC', 'R1', G0], ['R1', G1, 'R2', G1], ['PC2', 'NIC', 'R2', G0]],
        },
        topology: { nodes: [{ id: 'PC1', x: 70, y: 70, type: 'pc' }, { id: 'R1', x: 240, y: 70, type: 'router' }, { id: 'R2', x: 430, y: 70, type: 'router' }, { id: 'PC2', x: 600, y: 70, type: 'pc' }] },
        start: 'R1',
        tasks: [
          'HPL-HQ Gi0/1 uses OSPF network type point-to-point',
          'The HQ-BR adjacency is FULL with no DR or BDR (FULL/  -)',
          'PC-HQ can ping PC-BR at 10.2.0.10',
        ],
        check: 'q2-ospf-p2p',
        solution: { R1: ['enable', 'configure terminal', 'interface g0/1', 'ip ospf network point-to-point', 'end'] },
      },
      explanation: 'Ethernet defaults to the OSPF broadcast network type, which elects a DR and BDR even when only two routers share the link. On a two-router link that election only adds a wait timer and a type 2 LSA, so ip ospf network point-to-point is a common tuning. Both ends must match. With one end broadcast and the other point-to-point the hello and dead timers still agree (10 and 40), so the neighbors can even reach FULL, but each side describes the link differently in its LSAs and the SPF calculation fails to use it, which is why routes went missing. After the fix, show ip ospf neighbor shows FULL/  - (no DR role) and show ip ospf interface shows Network Type POINT_TO_POINT. The network 0.0.0.0 255.255.255.255 area 0 statement on HPL-BR is legal: it enables OSPF on every interface.',
      ref: 'Lesson l3-4; card:ospf',
    },
    {
      id: 'q4-0901', obj: '4.1', type: 'sim', difficulty: 2,
      stem: 'Sim. The vendor portal server (192.168.10.20) must be reachable from the internet as 203.0.113.20. PAT for the rest of the LAN already works on HPL-EDGE. Add the translation and test it from INET-HOST (198.51.100.10).',
      sim: {
        world: {
          devices: {
            R1: {
              kind: 'router', hostname: 'HPL-EDGE',
              interfaces: { [G0]: up('192.168.10.1', '255.255.255.0', { nat: 'inside' }), [G1]: up('203.0.113.2', '255.255.255.0', { nat: 'outside' }) },
              routes: [{ net: '0.0.0.0', mask: '0.0.0.0', nh: '203.0.113.1' }],
              aclText: { 1: ['permit 192.168.10.0 0.0.0.255'] },
              nat: { list: 1, outIf: G1 },
            },
            ISP: { kind: 'router', hostname: 'ISP-RTR', interfaces: { [G0]: up('203.0.113.1', '255.255.255.0'), [G1]: up('198.51.100.1', '255.255.255.0') } },
            SW: sw('HPL-DMZ-SW', 4),
            SRV: pc('PORTAL-SRV', '192.168.10.20', '255.255.255.0', '192.168.10.1'),
            PC: pc('PC-OFFICE', '192.168.10.30', '255.255.255.0', '192.168.10.1'),
            INET: pc('INET-HOST', '198.51.100.10', '255.255.255.0', '198.51.100.1'),
          },
          links: [['R1', G0, 'SW', G1], ['SRV', 'NIC', 'SW', 'FastEthernet0/1'], ['PC', 'NIC', 'SW', 'FastEthernet0/2'], ['R1', G1, 'ISP', G0], ['INET', 'NIC', 'ISP', G1]],
        },
        topology: { nodes: [{ id: 'SRV', x: 60, y: 40, type: 'pc' }, { id: 'PC', x: 60, y: 150, type: 'pc' }, { id: 'SW', x: 190, y: 95, type: 'switch' }, { id: 'R1', x: 330, y: 95, type: 'router' }, { id: 'ISP', x: 470, y: 95, type: 'router' }, { id: 'INET', x: 610, y: 95, type: 'pc' }] },
        start: 'R1',
        tasks: [
          'HPL-EDGE translates inside local 192.168.10.20 to inside global 203.0.113.20',
          'INET-HOST can ping 203.0.113.20',
          'PC-OFFICE can still reach the internet through PAT',
        ],
        check: 'q4-static-nat',
        solution: { R1: ['enable', 'configure terminal', 'ip nat inside source static 192.168.10.20 203.0.113.20', 'end'], INET: ['ping 203.0.113.20'] },
      },
      explanation: 'Dynamic NAT and PAT only create translations when an inside host starts the conversation, so an outside host has nothing to aim at. A static mapping is permanent and works in both directions: ip nat inside source static 192.168.10.20 203.0.113.20. The order is inside local first, then inside global. The inside and outside interface roles are already set, and static entries take precedence over the PAT rule, so the server also appears as .20 when it starts outbound connections. 203.0.113.20 sits in the outside interface subnet, so the router answers ARP for it and the ISP needs no extra route. show ip nat translations lists the static entry permanently, with --- in the protocol and outside columns.',
      ref: 'Lesson l4-1; card:nat',
    },
    {
      id: 'q4-0902', obj: '4.1', type: 'sim', difficulty: 3,
      stem: 'Sim. The ISP has routed the block 203.0.113.40/29 to HPL-EDGE. Configure dynamic NAT (not PAT) so hosts on 10.20.0.0/24 borrow an address from the pool 203.0.113.41 to 203.0.113.46. Use standard ACL 10 and name the pool HPL-POOL. Inside and outside interfaces are already set.',
      sim: {
        world: {
          devices: {
            R1: {
              kind: 'router', hostname: 'HPL-EDGE',
              interfaces: { [G0]: up('10.20.0.1', '255.255.255.0', { nat: 'inside' }), [G1]: up('203.0.113.2', '255.255.255.252', { nat: 'outside' }) },
              routes: [{ net: '0.0.0.0', mask: '0.0.0.0', nh: '203.0.113.1' }],
            },
            ISP: {
              kind: 'router', hostname: 'ISP-RTR',
              interfaces: { [G0]: up('203.0.113.1', '255.255.255.252'), [G1]: up('198.51.100.1', '255.255.255.0') },
              routes: [{ net: '203.0.113.40', mask: '255.255.255.248', nh: '203.0.113.2' }],
            },
            SW: sw('HPL-LAN-SW', 4),
            PC1: pc('PC-01', '10.20.0.11', '255.255.255.0', '10.20.0.1'),
            PC2: pc('PC-02', '10.20.0.12', '255.255.255.0', '10.20.0.1'),
            WEB: pc('VENDOR-WEB', '198.51.100.10', '255.255.255.0', '198.51.100.1'),
          },
          links: [['R1', G0, 'SW', G1], ['PC1', 'NIC', 'SW', 'FastEthernet0/1'], ['PC2', 'NIC', 'SW', 'FastEthernet0/2'], ['R1', G1, 'ISP', G0], ['WEB', 'NIC', 'ISP', G1]],
        },
        topology: { nodes: [{ id: 'PC1', x: 60, y: 40, type: 'pc' }, { id: 'PC2', x: 60, y: 150, type: 'pc' }, { id: 'SW', x: 190, y: 95, type: 'switch' }, { id: 'R1', x: 330, y: 95, type: 'router' }, { id: 'ISP', x: 470, y: 95, type: 'router' }, { id: 'WEB', x: 610, y: 95, type: 'pc' }] },
        start: 'R1',
        tasks: [
          'ACL 10 matches 10.20.0.0/24',
          'Pool HPL-POOL covers 203.0.113.41 to 203.0.113.46',
          'Dynamic NAT (no overload) translates ACL 10 to HPL-POOL',
          'PC-01 and PC-02 each reach VENDOR-WEB with their own pool address',
        ],
        check: 'q4-pool-nat',
        solution: {
          R1: ['enable', 'configure terminal', 'access-list 10 permit 10.20.0.0 0.0.0.255', 'ip nat pool HPL-POOL 203.0.113.41 203.0.113.46 netmask 255.255.255.248', 'ip nat inside source list 10 pool HPL-POOL', 'end'],
          PC1: ['ping 198.51.100.10'],
          PC2: ['ping 198.51.100.10'],
        },
      },
      explanation: 'Dynamic NAT needs three pieces: an ACL that selects which inside local addresses may be translated (access-list 10 permit 10.20.0.0 0.0.0.255), a pool of inside global addresses (ip nat pool HPL-POOL 203.0.113.41 203.0.113.46 netmask 255.255.255.248), and the rule that ties them together (ip nat inside source list 10 pool HPL-POOL). Without overload each inside host gets its own public address one to one, so the seventh simultaneous host would fail until a translation times out. Adding overload would turn this into PAT with a pool. The ACL here only selects traffic for NAT; it filters nothing. The netmask (or prefix-length) on the pool is required and must contain the start and end addresses. Check results with show ip nat translations and show ip nat statistics.',
      ref: 'Lesson l4-1; card:nat',
    },
    {
      id: 'q4-0903', obj: '4.1', type: 'sim', difficulty: 2,
      stem: 'Sim. The Curtis Bay yard LAN (172.16.30.0/24) shares the single ISP address on Gi0/1 (198.51.100.6). Nobody on the LAN reaches the SaaS app at 192.0.2.80. ACL 1 exists but something about it is off, and the overload rule was never entered. Fix both.',
      sim: {
        world: {
          devices: {
            R1: {
              kind: 'router', hostname: 'HPL-YARD',
              interfaces: { [G0]: up('172.16.30.1', '255.255.255.0', { nat: 'inside' }), [G1]: up('198.51.100.6', '255.255.255.252', { nat: 'outside' }) },
              routes: [{ net: '0.0.0.0', mask: '0.0.0.0', nh: '198.51.100.5' }],
              aclText: { 1: ['permit 172.16.3.0 0.0.0.255'] },
            },
            ISP: { kind: 'router', hostname: 'ISP-RTR', interfaces: { [G0]: up('198.51.100.5', '255.255.255.252'), [G1]: up('192.0.2.1', '255.255.255.0') } },
            SW: sw('HPL-YARD-SW', 4),
            PC1: pc('YARD-01', '172.16.30.11', '255.255.255.0', '172.16.30.1'),
            PC2: pc('YARD-02', '172.16.30.12', '255.255.255.0', '172.16.30.1'),
            SAAS: pc('SAAS-APP', '192.0.2.80', '255.255.255.0', '192.0.2.1'),
          },
          links: [['R1', G0, 'SW', G1], ['PC1', 'NIC', 'SW', 'FastEthernet0/1'], ['PC2', 'NIC', 'SW', 'FastEthernet0/2'], ['R1', G1, 'ISP', G0], ['SAAS', 'NIC', 'ISP', G1]],
        },
        topology: { nodes: [{ id: 'PC1', x: 60, y: 40, type: 'pc' }, { id: 'PC2', x: 60, y: 150, type: 'pc' }, { id: 'SW', x: 190, y: 95, type: 'switch' }, { id: 'R1', x: 330, y: 95, type: 'router' }, { id: 'ISP', x: 470, y: 95, type: 'router' }, { id: 'SAAS', x: 610, y: 95, type: 'pc' }] },
        start: 'R1',
        tasks: [
          'ACL 1 matches the yard LAN, 172.16.30.0/24',
          'PAT overloads the Gi0/1 address',
          'YARD-01 and YARD-02 both reach 192.0.2.80 as 198.51.100.6',
        ],
        check: 'q4-pat',
        solution: {
          R1: ['enable', 'configure terminal', 'no access-list 1', 'access-list 1 permit 172.16.30.0 0.0.0.255', 'ip nat inside source list 1 interface g0/1 overload', 'end'],
        },
      },
      explanation: 'show access-lists shows ACL 1 permitting 172.16.3.0 0.0.0.255, a typo that matches none of the yard hosts, so even with a NAT rule nothing would be translated. Remove it and re-enter access-list 1 permit 172.16.30.0 0.0.0.255. Then add the PAT rule: ip nat inside source list 1 interface g0/1 overload. Overload lets many inside hosts share one inside global address by tracking each flow by its source port (or ICMP query ID). Using the interface keyword means the rule follows whatever address the interface has, which suits ISP links that change. A pool would be wrong here because there is only one public address. Verify with show ip nat translations: each entry shows inside global 198.51.100.6 with a different port.',
      ref: 'Lesson l4-1; card:nat',
    },
    {
      id: 'q4-0904', obj: '4.6', type: 'sim', difficulty: 2,
      stem: 'Sim. The DHCP server (10.60.10.5) has pools for both warehouse LANs, but scanners on both LANs show 169.254 addresses. On HPL-CORE, Gi0/1 faces LAN A (10.60.21.0/24) and Gi0/2 faces LAN B (10.60.22.0/24). Fix the relay, then renew both clients.',
      sim: {
        world: {
          devices: {
            R1: {
              kind: 'router', hostname: 'HPL-CORE',
              interfaces: { [G0]: up('10.60.10.1', '255.255.255.0'), [G1]: up('10.60.21.1', '255.255.255.0', { helpers: ['10.60.10.50'] }), [G2]: up('10.60.22.1', '255.255.255.0') },
            },
            SWS: sw('HPL-SRV-SW', 4),
            SWA: sw('HPL-WHA-SW', 4),
            SWB: sw('HPL-WHB-SW', 4),
            SRV: pc('DHCP-SRV', '10.60.10.5', '255.255.255.0', '10.60.10.1', {
              server: true,
              pools: [
                { name: 'WH-A', network: '10.60.21.0', mask: '255.255.255.0', gw: '10.60.21.1', start: '10.60.21.100', end: '10.60.21.199' },
                { name: 'WH-B', network: '10.60.22.0', mask: '255.255.255.0', gw: '10.60.22.1', start: '10.60.22.100', end: '10.60.22.199' },
              ],
            }),
            CL1: { kind: 'pc', hostname: 'SCAN-A1', pc: { dhcp: true, ip: '169.254.12.40', mask: '255.255.0.0', gw: '' } },
            CL2: { kind: 'pc', hostname: 'SCAN-B1', pc: { dhcp: true, ip: '169.254.77.3', mask: '255.255.0.0', gw: '' } },
          },
          links: [['SRV', 'NIC', 'SWS', 'FastEthernet0/1'], ['R1', G0, 'SWS', G1], ['R1', G1, 'SWA', G1], ['CL1', 'NIC', 'SWA', 'FastEthernet0/1'], ['R1', G2, 'SWB', G1], ['CL2', 'NIC', 'SWB', 'FastEthernet0/1']],
        },
        topology: { nodes: [{ id: 'SRV', x: 60, y: 95, type: 'pc' }, { id: 'SWS', x: 180, y: 95, type: 'switch' }, { id: 'R1', x: 320, y: 95, type: 'router' }, { id: 'SWA', x: 460, y: 40, type: 'switch' }, { id: 'SWB', x: 460, y: 150, type: 'switch' }, { id: 'CL1', x: 610, y: 40, type: 'pc' }, { id: 'CL2', x: 610, y: 150, type: 'pc' }] },
        start: 'R1',
        tasks: [
          'Gi0/1 relays to 10.60.10.5, and the wrong helper address is removed',
          'Gi0/2 relays to 10.60.10.5',
          'SCAN-A1 has a 10.60.21.x address and SCAN-B1 has a 10.60.22.x address',
          'Both scanners can ping the DHCP server',
        ],
        check: 'q4-dhcp-relay',
        solution: {
          R1: ['enable', 'configure terminal', 'interface g0/1', 'no ip helper-address 10.60.10.50', 'ip helper-address 10.60.10.5', 'interface g0/2', 'ip helper-address 10.60.10.5', 'end'],
          CL1: ['ipconfig /renew'],
          CL2: ['ipconfig /renew'],
        },
      },
      explanation: 'A 169.254.x.x address (APIPA) means the client broadcast a DHCP Discover and nobody answered. Routers do not forward broadcasts, so each client-facing interface needs ip helper-address pointing at the server. Gi0/1 points at 10.60.10.50, a typo for .5, and Gi0/2 has no helper at all. When a relay forwards the request it sets the giaddr field to the receiving interface address (10.60.21.1 or 10.60.22.1), and the server uses that to pick the right pool, which is how one server serves many subnets. The helper never goes on the server-facing interface. After the fix, ipconfig /renew on each scanner runs DORA through the relay and the scanner gets an address, mask and gateway from its own pool.',
      ref: 'Lesson l4-6; card:dhcp',
    },
    {
      id: 'q4-0905', obj: '4.2', type: 'sim', difficulty: 2,
      stem: 'Sim. Log timestamps on the HQ and branch routers disagree by minutes. HPL-CORE should take time from the stratum 1 server NTP-SRV (10.0.0.123), and HPL-BRANCH should take time from HPL-CORE over the WAN (10.0.12.1). Check what HPL-CORE is doing now with show ntp associations.',
      sim: {
        world: {
          devices: {
            R1: { kind: 'router', hostname: 'HPL-CORE', interfaces: { [G0]: up('10.0.0.1', '255.255.255.0'), [G1]: up('10.0.12.1', '255.255.255.252') }, ntp: { servers: ['10.0.0.132'] } },
            R2: { kind: 'router', hostname: 'HPL-BRANCH', interfaces: { [G0]: up('10.0.12.2', '255.255.255.252') }, routes: [{ net: '0.0.0.0', mask: '0.0.0.0', nh: '10.0.12.1' }] },
            SW: sw('HPL-SRV-SW', 4),
            NTP: pc('NTP-SRV', '10.0.0.123', '255.255.255.0', '10.0.0.1', { ntp: true, stratum: 1 }),
          },
          links: [['NTP', 'NIC', 'SW', 'FastEthernet0/1'], ['R1', G0, 'SW', G1], ['R1', G1, 'R2', G0]],
        },
        topology: { nodes: [{ id: 'NTP', x: 70, y: 70, type: 'pc' }, { id: 'SW', x: 220, y: 70, type: 'switch' }, { id: 'R1', x: 390, y: 70, type: 'router' }, { id: 'R2', x: 570, y: 70, type: 'router' }] },
        start: 'R1',
        tasks: [
          'HPL-CORE is synchronized to 10.0.0.123, and the wrong server entry is gone',
          'HPL-BRANCH is synchronized to HPL-CORE at 10.0.12.1',
        ],
        check: 'q4-ntp-client',
        solution: {
          R1: ['enable', 'configure terminal', 'no ntp server 10.0.0.132', 'ntp server 10.0.0.123', 'end'],
          R2: ['enable', 'configure terminal', 'ntp server 10.0.12.1', 'end'],
        },
      },
      explanation: 'show ntp associations on HPL-CORE shows 10.0.0.132 stuck in .INIT. at stratum 16, which means unsynchronized: the address is a typo and nothing answers. Replace it with ntp server 10.0.0.123. HPL-CORE then synchronizes at stratum 2 (one more than its source). A Cisco router that is synchronized also serves time to others, so HPL-BRANCH only needs ntp server 10.0.12.1 and ends up at stratum 3. ntp master is not needed on HPL-CORE: that command makes a router trust its own clock as an authoritative source (default stratum 8), which you use only when there is no better source. NTP uses UDP 123. Verify with show ntp status (Clock is synchronized) and look for the asterisk next to the chosen peer in show ntp associations.',
      ref: 'Lesson l4-2; card:ntp',
    },
    {
      id: 'q4-0906', obj: '4.8', type: 'sim', difficulty: 3,
      stem: 'Sim. A new WAN router arrived with almost nothing configured, and it still accepts Telnet. Policy: hostname HPL-WAN1, domain hpl.local, RSA keys of at least 2048 bits, SSH version 2 only, a local account nightops with a hashed password, VTY lines that accept SSH only and use local accounts, and idle VTY sessions closed after 10 minutes. Test from PC-ADMIN.',
      sim: {
        world: {
          devices: {
            R1: { kind: 'router', hostname: 'Router', interfaces: { [G0]: up('10.0.99.1', '255.255.255.0'), [G1]: { shutdown: true } }, vty: { transport: ['telnet'], login: 'password', password: 'cisco' } },
            SW: sw('HPL-MGMT-SW', 4),
            PC: pc('PC-ADMIN', '10.0.99.10', '255.255.255.0', '10.0.99.1'),
          },
          links: [['PC', 'NIC', 'SW', 'FastEthernet0/1'], ['R1', G0, 'SW', G1]],
        },
        topology: { nodes: [{ id: 'PC', x: 110, y: 70, type: 'pc' }, { id: 'SW', x: 330, y: 70, type: 'switch' }, { id: 'R1', x: 550, y: 70, type: 'router' }] },
        start: 'R1',
        tasks: [
          'Hostname HPL-WAN1 and domain name hpl.local are set',
          'RSA keys are at least 2048 bits and SSH version 2 is enabled',
          'Local user nightops exists with a secret',
          'VTY lines: SSH only, login local, exec-timeout 10 minutes',
          'PC-ADMIN can SSH in as nightops, and Telnet is refused',
        ],
        check: 'q4-ssh',
        solution: {
          R1: ['enable', 'configure terminal', 'hostname HPL-WAN1', 'ip domain-name hpl.local', 'crypto key generate rsa modulus 2048', 'ip ssh version 2', 'username nightops secret N1ghtSh1ft!', 'line vty 0 15', 'transport input ssh', 'login local', 'exec-timeout 10 0', 'end'],
          PC: ['ssh -l nightops 10.0.99.1'],
        },
      },
      explanation: 'IOS names its RSA key pair hostname.domain, so crypto key generate rsa refuses to run while the hostname is still the default Router or no domain name is set. Order matters: hostname HPL-WAN1, ip domain-name hpl.local, then crypto key generate rsa modulus 2048. ip ssh version 2 needs a key of at least 768 bits. username nightops secret stores a hash; username ... password would store clear text. Under line vty 0 15, transport input ssh rejects Telnet, login local checks the local user database instead of the line password, and exec-timeout 10 0 closes sessions idle for 10 minutes and 0 seconds. SSH uses TCP 22 and encrypts the whole session; Telnet (TCP 23) sends everything in clear text. Verify with show ip ssh and by connecting from PC-ADMIN.',
      ref: 'Lesson l4-8; card:ssh',
    },
    {
      id: 'q5-0901', obj: '5.6', type: 'sim', difficulty: 3,
      stem: 'Sim. Guest devices (10.0.20.0/24) must not reach the HR server LAN (10.0.40.0/24). The lobby check-in kiosk, 10.0.20.50, is the one exception. Guests must still reach the public web server on 10.0.30.0/24, and staff (10.0.10.0/24) keep full access. Use a numbered standard ACL and place it where a standard ACL belongs.',
      sim: {
        world: {
          devices: {
            R1: {
              kind: 'router', hostname: 'HPL-CORE',
              interfaces: { [G0]: up('10.0.10.1', '255.255.255.0'), [G1]: up('10.0.20.1', '255.255.255.0'), [G2]: up('10.0.40.1', '255.255.255.0'), [G3]: up('10.0.30.1', '255.255.255.0') },
            },
            SWG: sw('HPL-GUEST-SW', 4),
            STAFF: pc('PC-STAFF', '10.0.10.10', '255.255.255.0', '10.0.10.1'),
            GUEST: pc('PC-GUEST', '10.0.20.10', '255.255.255.0', '10.0.20.1'),
            KIOSK: pc('KIOSK', '10.0.20.50', '255.255.255.0', '10.0.20.1'),
            HR: pc('HR-SRV', '10.0.40.10', '255.255.255.0', '10.0.40.1'),
            WEB: pc('WEB-SRV', '10.0.30.20', '255.255.255.0', '10.0.30.1'),
          },
          links: [['STAFF', 'NIC', 'R1', G0], ['R1', G1, 'SWG', G1], ['GUEST', 'NIC', 'SWG', 'FastEthernet0/1'], ['KIOSK', 'NIC', 'SWG', 'FastEthernet0/2'], ['HR', 'NIC', 'R1', G2], ['WEB', 'NIC', 'R1', G3]],
        },
        topology: { nodes: [{ id: 'STAFF', x: 60, y: 30, type: 'pc' }, { id: 'GUEST', x: 60, y: 120, type: 'pc' }, { id: 'KIOSK', x: 60, y: 190, type: 'pc' }, { id: 'SWG', x: 180, y: 150, type: 'switch' }, { id: 'R1', x: 340, y: 100, type: 'router' }, { id: 'HR', x: 560, y: 50, type: 'pc' }, { id: 'WEB', x: 560, y: 160, type: 'pc' }] },
        start: 'R1',
        tasks: [
          'PC-GUEST cannot ping HR-SRV (10.0.40.10)',
          'KIOSK (10.0.20.50) can ping HR-SRV',
          'PC-STAFF can ping HR-SRV, and PC-GUEST can still ping WEB-SRV (10.0.30.20)',
          'A standard ACL is applied outbound on Gi0/2, the HR LAN interface, with no ACL inbound anywhere',
        ],
        check: 'q5-std-acl',
        solution: {
          R1: ['enable', 'configure terminal', 'access-list 40 permit host 10.0.20.50', 'access-list 40 deny 10.0.20.0 0.0.0.255', 'access-list 40 permit any', 'interface g0/2', 'ip access-group 40 out', 'end'],
        },
      },
      explanation: 'A standard ACL matches only the source address, so it cannot tell traffic for the HR LAN from traffic for the web server. Applied inbound on the guest interface it would block guests from everything; that is why standard ACLs go close to the destination, here outbound on Gi0/2. Order is everything because the first match wins: permit host 10.0.20.50 must come before deny 10.0.20.0 0.0.0.255, or the kiosk is caught by the deny. The final permit any is required, because every ACL ends with an implicit deny any, and without it staff would lose HR access too. Verify with show access-lists, where hit counters climb on each line as traffic matches, and show ip interface g0/2 for the outgoing access list.',
      ref: 'Lesson l5-6; card:acl',
    },
    {
      id: 'q5-0902', obj: '5.6', type: 'sim', difficulty: 3,
      stem: 'Sim. Warehouse hosts (10.0.50.0/24) must not reach the jump server 10.0.99.5, but they must still reach the monitoring server 10.0.99.6. Office users (10.0.10.0/24) keep access to both. A colleague wrote extended ACL 120 and now the whole office has lost the jump server too. Fix the ACL and apply it inbound on the warehouse interface, Gi0/1.',
      sim: {
        world: {
          devices: {
            R1: {
              kind: 'router', hostname: 'HPL-CORE',
              interfaces: { [G0]: up('10.0.10.1', '255.255.255.0'), [G1]: up('10.0.50.1', '255.255.255.0'), [G2]: up('10.0.99.1', '255.255.255.0', { aclOut: 120 }) },
              aclText: { 120: ['deny ip 10.0.50.0 0.0.0.255 host 10.0.99.5'] },
            },
            SWM: sw('HPL-MGMT-SW', 4),
            OFFICE: pc('PC-OFFICE', '10.0.10.10', '255.255.255.0', '10.0.10.1'),
            WH: pc('PC-WH', '10.0.50.10', '255.255.255.0', '10.0.50.1'),
            JUMP: pc('JUMP-SRV', '10.0.99.5', '255.255.255.0', '10.0.99.1'),
            NMS: pc('NMS-SRV', '10.0.99.6', '255.255.255.0', '10.0.99.1'),
          },
          links: [['OFFICE', 'NIC', 'R1', G0], ['WH', 'NIC', 'R1', G1], ['R1', G2, 'SWM', G1], ['JUMP', 'NIC', 'SWM', 'FastEthernet0/1'], ['NMS', 'NIC', 'SWM', 'FastEthernet0/2']],
        },
        topology: { nodes: [{ id: 'OFFICE', x: 60, y: 40, type: 'pc' }, { id: 'WH', x: 60, y: 150, type: 'pc' }, { id: 'R1', x: 250, y: 95, type: 'router' }, { id: 'SWM', x: 420, y: 95, type: 'switch' }, { id: 'JUMP', x: 600, y: 40, type: 'pc' }, { id: 'NMS', x: 600, y: 150, type: 'pc' }] },
        start: 'R1',
        tasks: [
          'PC-WH cannot ping JUMP-SRV (10.0.99.5) but can ping NMS-SRV (10.0.99.6)',
          'PC-OFFICE can ping JUMP-SRV',
          'An extended ACL is applied inbound on Gi0/1, and nothing is applied outbound on Gi0/2',
        ],
        check: 'q5-ext-acl',
        solution: {
          R1: ['enable', 'configure terminal', 'access-list 120 permit ip any any', 'interface g0/2', 'no ip access-group 120 out', 'interface g0/1', 'ip access-group 120 in', 'end'],
        },
      },
      explanation: 'ACL 120 holds a single deny, and every ACL ends with an invisible deny any. Applied outbound on the management LAN, it dropped every packet heading there, office traffic included. Appending access-list 120 permit ip any any after the deny lets everything else through. Because the ACL names both the source and the destination, it can sit close to the source, the usual rule for extended ACLs: inbound on Gi0/1, so denied packets are dropped before they use any more of the network. Remove it from Gi0/2 with no ip access-group 120 out and apply it with ip access-group 120 in under Gi0/1. Only one ACL is allowed per interface, per direction, per protocol. show access-lists shows the deny counter climbing when the warehouse tries the jump server.',
      ref: 'Lesson l5-6; card:acl',
    },
    {
      id: 'q5-0903', obj: '5.7', type: 'sim', difficulty: 2,
      stem: 'Sim. Harden the shipping-desk switch. Fa0/1 (PC-A) gets port security with one sticky MAC address, and a violation should drop and log offending frames without shutting the port. Fa0/2 (PC-B, an IP phone will be added later) gets port security allowing two MAC addresses. Fa0/2 has never been hard-coded as an access port. Both PCs must keep reaching the printer (10.10.2.50).',
      sim: {
        world: {
          devices: {
            SW: sw('HPL-SHIP-SW', 8, { 'FastEthernet0/1': { modeSet: true }, 'FastEthernet0/3': { modeSet: true } }),
            PCA: { kind: 'pc', hostname: 'PC-A', pc: { ip: '10.10.2.11', mask: '255.255.255.0', gw: '', mac: '0050.7966.6a01' } },
            PCB: { kind: 'pc', hostname: 'PC-B', pc: { ip: '10.10.2.12', mask: '255.255.255.0', gw: '', mac: '0050.7966.6a02' } },
            PRN: { kind: 'pc', hostname: 'PRINTER', pc: { ip: '10.10.2.50', mask: '255.255.255.0', gw: '', mac: '0050.7966.6a50' } },
          },
          links: [['PCA', 'NIC', 'SW', 'FastEthernet0/1'], ['PCB', 'NIC', 'SW', 'FastEthernet0/2'], ['PRN', 'NIC', 'SW', 'FastEthernet0/3']],
        },
        topology: { nodes: [{ id: 'PCA', x: 90, y: 40, type: 'pc' }, { id: 'PCB', x: 90, y: 150, type: 'pc' }, { id: 'SW', x: 340, y: 95, type: 'switch' }, { id: 'PRN', x: 590, y: 95, type: 'printer' }] },
        start: 'SW',
        tasks: [
          'Fa0/1: port security on, maximum 1, sticky, violation mode restrict, and PC-A\'s MAC learned',
          'Fa0/2: static access mode, port security on, maximum 2',
          'PC-A and PC-B can ping the printer',
        ],
        check: 'q5-port-security',
        solution: {
          SW: ['enable', 'configure terminal', 'interface fa0/1', 'switchport port-security', 'switchport port-security mac-address sticky', 'switchport port-security violation restrict', 'interface fa0/2', 'switchport mode access', 'switchport port-security', 'switchport port-security maximum 2', 'end'],
          PCA: ['ping 10.10.2.50'],
          PCB: ['ping 10.10.2.50'],
        },
      },
      explanation: 'Port security only runs on a port statically set to access (or trunk); on a dynamic port IOS rejects switchport port-security, which is why Fa0/2 needs switchport mode access first. The defaults are maximum 1 and violation shutdown, so Fa0/1 only needs port security enabled, sticky learning, and violation restrict. Restrict drops frames from unknown MACs, sends a syslog message and an SNMP trap, and increments the violation counter while the port stays up. Protect also drops but silently, with no counter. Shutdown puts the port in err-disabled state. Sticky learning writes the learned MAC into the running configuration as switchport port-security mac-address sticky followed by the MAC, so save the config to keep it after a reload. Verify with show port-security interface fa0/1.',
      ref: 'Lesson l5-7; card:portsec',
    },
    {
      id: 'q5-0904', obj: '5.3', type: 'sim', difficulty: 2,
      stem: 'Sim. The dock router HPL-DOCK has no passwords at all. Apply the baseline: a hashed enable secret; a console password with login and a 5-minute idle timeout; encryption for any clear-text passwords in the config; a local user admin with a hashed secret; and VTY lines that authenticate against local accounts.',
      sim: {
        world: {
          devices: {
            R1: { kind: 'router', hostname: 'HPL-DOCK', interfaces: { [G0]: up('10.0.70.1', '255.255.255.0') } },
            SW: sw('HPL-DOCK-SW', 4),
            PC: pc('PC-DOCK', '10.0.70.10', '255.255.255.0', '10.0.70.1'),
          },
          links: [['PC', 'NIC', 'SW', 'FastEthernet0/1'], ['R1', G0, 'SW', G1]],
        },
        topology: { nodes: [{ id: 'PC', x: 110, y: 70, type: 'pc' }, { id: 'SW', x: 330, y: 70, type: 'switch' }, { id: 'R1', x: 550, y: 70, type: 'router' }] },
        start: 'R1',
        tasks: [
          'An enable secret is set',
          'Console: password, login, exec-timeout 5 0',
          'service password-encryption is on',
          'Local user admin exists with a secret, and the VTY lines use login local',
        ],
        check: 'q5-local-passwords',
        solution: {
          R1: ['enable', 'configure terminal', 'enable secret D0ckN1ght!', 'line console 0', 'password C0ns0le!', 'login', 'exec-timeout 5 0', 'exit', 'service password-encryption', 'username admin secret Adm1nP@ss', 'line vty 0 15', 'login local', 'end'],
        },
      },
      explanation: 'enable secret stores a one-way hash of the privileged EXEC password and always wins over an older enable password if both exist. On the console, password sets the line password but does nothing until login tells the line to ask for it; exec-timeout 5 0 logs out a session idle for 5 minutes and 0 seconds. service password-encryption scrambles clear-text passwords in the config (line passwords, username ... password) with type 7, a weak reversible cipher that only stops shoulder surfing, so secrets are still the better choice. username admin secret creates a hashed local account, and login local under line vty makes remote logins ask for a username and password from that local database instead of a shared line password. Verify in show running-config.',
      ref: 'Lesson l5-3; card:secfund',
    },
  );

  /* =====================================================================
   * 3.0 IP CONNECTIVITY
   * ===================================================================== */

  // Shared exhibits for 3.1 and 3.2
  const EX_CORE = rt('HPL-CORE', `
Gateway of last resort is 10.0.0.1 to network 0.0.0.0

S*    0.0.0.0/0 [1/0] via 10.0.0.1
      10.0.0.0/8 is variably subnetted, 10 subnets, 5 masks
C        10.0.0.0/30 is directly connected, GigabitEthernet0/0
L        10.0.0.2/32 is directly connected, GigabitEthernet0/0
C        10.0.12.0/30 is directly connected, GigabitEthernet0/1
L        10.0.12.1/32 is directly connected, GigabitEthernet0/1
C        10.0.13.0/30 is directly connected, GigabitEthernet0/2
L        10.0.13.1/32 is directly connected, GigabitEthernet0/2
O        10.10.0.0/16 [110/3] via 10.0.12.2, 01:14:07, GigabitEthernet0/1
O        10.10.20.0/24 [110/2] via 10.0.12.2, 01:14:07, GigabitEthernet0/1
D        10.10.20.128/25 [90/3072] via 10.0.13.3, 00:42:51, GigabitEthernet0/2
S        10.10.20.130/32 [1/0] via 10.0.13.3
`);
  const EX_BR = rt('HPL-DUNDALK', `
Gateway of last resort is 172.16.0.1 to network 0.0.0.0

O*E2  0.0.0.0/0 [110/1] via 172.16.0.1, 2d03h, GigabitEthernet0/0
      172.16.0.0/16 is variably subnetted, 3 subnets, 3 masks
C        172.16.0.0/29 is directly connected, GigabitEthernet0/0
L        172.16.0.4/32 is directly connected, GigabitEthernet0/0
O IA     172.16.64.0/18 [110/12] via 172.16.0.2, 2d03h, GigabitEthernet0/0
D EX  192.168.50.0/24 [170/2816] via 172.16.0.3, 00:03:12, GigabitEthernet0/0
`);

  Q.push(
    /* ---- 3.1 Components of the routing table ---- */
    {
      id: 'q3-0001', obj: '3.1', type: 'single', difficulty: 1,
      stem: 'Refer to the exhibit. In the entry for 10.10.0.0/16, what do the numbers in [110/3] represent?',
      exhibit: EX_CORE,
      options: ['110 is the administrative distance and 3 is the OSPF cost', '110 is the OSPF cost and 3 is the administrative distance', '110 is the process ID and 3 is the hop count', '110 is the administrative distance and 3 is the number of routers to the destination'],
      answer: 0,
      explanation: 'The bracket always reads [administrative distance/metric]. 110 is the default AD for OSPF, which says how trustworthy the source is. 3 is the metric, which for OSPF is the cumulative cost of every outgoing interface along the path to the prefix. Swapping the two is a common slip: AD comes first. The OSPF process ID never appears in the bracket; it only shows in commands such as show ip protocols. Hop count is the RIP metric, and OSPF cost is not a router count: with the default reference bandwidth every Gigabit and FastEthernet link costs 1, so cost 3 often happens to equal three links, but a slower link would break that pattern.',
      ref: 'Lesson l3-1; card:rtable',
    },
    {
      id: 'q3-0002', obj: '3.1', type: 'single', difficulty: 1,
      stem: 'Refer to the exhibit. What does the line "Gateway of last resort is 10.0.0.1 to network 0.0.0.0" tell you?',
      exhibit: EX_CORE,
      options: ['Packets that match no more specific route are forwarded to 10.0.0.1', 'The router itself is the default gateway for the hosts on the 10.0.0.0/30 link', '10.0.0.1 is used only when every OSPF neighbor is down', 'Every packet is sent to 10.0.0.1 first, and 10.0.0.1 then routes it from there'],
      answer: 0,
      explanation: 'The gateway of last resort is the next hop of the default route (0.0.0.0/0, shown here as S* with the asterisk marking the candidate default). Because a /0 matches every address but is the least specific match possible, it is used only when no longer prefix matches the destination. It has nothing to do with being a gateway for hosts; that is a host setting. It is not a backup that waits for OSPF to fail: a packet for 10.10.20.50 uses the OSPF route even while the default exists, because the /24 is longer. And routers do not hand every packet to the default first; each packet gets its own longest-match lookup.',
      ref: 'Lesson l3-1; card:rtable',
    },
    {
      id: 'q3-0003', obj: '3.1', type: 'single', difficulty: 1,
      stem: 'Refer to the exhibit. Why does the router have the entry L 10.0.12.1/32?',
      exhibit: EX_CORE,
      options: ['It is the address of Gi0/1 itself, installed as a /32 host route so the router recognizes packets sent to it', 'It was learned from a LISP mapping server', 'It is a static host route an administrator added so the router can always reach a server at 10.0.12.1', 'It is the address of the OSPF neighbor on the far end of the /30 link, installed when the adjacency reached FULL'],
      answer: 0,
      explanation: 'Since IOS 15, every interface that has an IP address and is up/up adds two routes: a C (connected) route for the subnet and an L (local) /32 route for the interface address itself. The local route lets the router recognize traffic destined to its own address and process it instead of forwarding it. Lowercase l would be LISP, not uppercase L. A static host route would appear with the code S and a [1/0] bracket. The neighbor on the far end of the /30 would be 10.0.12.2, which is the next hop of the OSPF routes, not a local entry.',
      ref: 'Lesson l3-1; card:rtable',
    },
    {
      id: 'q3-0004', obj: '3.1', type: 'single', difficulty: 2,
      stem: 'Refer to the exhibit. What does the line "10.0.0.0/8 is variably subnetted, 10 subnets, 5 masks" indicate?',
      exhibit: EX_CORE,
      options: ['The router knows 10 prefixes inside the classful 10.0.0.0/8 network, and they use 5 different prefix lengths', 'The router has a summary route for 10.0.0.0/8 with 10 next hops, and it forwards on that summary before any subnet', 'Ten interfaces are configured with addresses from 10.0.0.0/8, and they use 5 different subnet masks between them', 'Only 5 of the 10 subnets are reachable'],
      answer: 0,
      explanation: 'IOS groups routes under their classful parent network. The header counts how many child prefixes it holds (10, including the L /32 entries) and how many distinct masks they use (/16, /24, /25, /30 and /32 make 5). "Variably subnetted" simply means more than one mask is in use. It is a heading, not a route: there is no 10.0.0.0/8 entry to forward with. It does not count interfaces, since only three interfaces appear and the other entries were learned or configured. Nothing in the header speaks to reachability; every listed prefix is installed and usable.',
      ref: 'Lesson l3-1; card:rtable',
    },
    {
      id: 'q3-0005', obj: '3.1', type: 'single', difficulty: 2,
      stem: 'Refer to the exhibit. Which statement about the route to 192.168.50.0/24 is true?',
      exhibit: EX_BR,
      options: ['It was redistributed into EIGRP from another source, so it carries the EIGRP external AD of 170', 'It is an internal EIGRP route, and 170 is its composite metric rather than its AD', 'It is an OSPF external type 2 route', 'It will be preferred over an internal EIGRP route to the same prefix, because the higher AD of 170 wins'],
      answer: 0,
      explanation: 'The code D EX marks an EIGRP external route: a prefix that some router injected into EIGRP from outside, such as static routes or another protocol. External EIGRP routes get an AD of 170, which is why the bracket shows [170/2816]. Internal EIGRP routes use AD 90 and the code D alone. 170 is the AD, not the metric; the metric is 2816. OSPF external routes use E1 or E2, like the O*E2 default route at the top of the table. Because 170 is higher than 90, an internal EIGRP route to the same prefix would win, so the last option has it backwards.',
      ref: 'Lesson l3-1; card:rtable',
    },
    {
      id: 'q3-0006', obj: '3.1', type: 'single', difficulty: 2,
      stem: 'Refer to the exhibit. How did HPL-DUNDALK learn its default route?',
      exhibit: EX_BR,
      options: ['From OSPF: another router is advertising a default route as an external type 2 route', 'From a static default route configured locally on HPL-DUNDALK and flagged as the candidate default', 'From DHCP on GigabitEthernet0/0', 'From an OSPF inter-area summary of 172.16.0.0/16 that the area border router advertises'],
      answer: 0,
      explanation: 'O*E2 reads as OSPF, candidate default, external type 2. That is what you see when a neighboring OSPF router runs default-information originate: the default is injected into OSPF as an external route, and by default E2 routes carry the metric set by the originator (1 here) without adding internal cost. A local static default would show S* with [1/0]. A default from DHCP would appear as S* with AD 254, because IOS installs it as a static route. Inter-area routes show O IA, like the 172.16.64.0/18 entry, and they are not defaults.',
      ref: 'Lesson l3-1; card:rtable',
    },
    {
      id: 'q3-0007', obj: '3.1', type: 'match', difficulty: 1,
      stem: 'Match each routing table code to the route source it identifies.',
      options: ['C', 'L', 'S', 'O', 'D', 'O IA'],
      targets: ['OSPF route from another area', 'Static route', 'EIGRP internal route', 'Directly connected subnet', 'OSPF route from the same area', 'The router\'s own interface address (/32)'],
      answer: [[0, 3], [1, 5], [2, 1], [3, 4], [4, 2], [5, 0]],
      explanation: 'C marks the subnet of an interface that is up/up, and L marks the interface address itself as a /32 host route (IPv6 uses /128). S is any static route, including static defaults (S*). O alone is an OSPF intra-area route, learned from routers in the same area, while O IA is inter-area, learned from an area border router summarizing another area. D is EIGRP, named for its DUAL algorithm; D EX would be an EIGRP external route. Reading codes quickly is half the battle on routing-table questions, so it pays to know the common ones cold.',
      ref: 'Lesson l3-1; card:rtable',
    },
    {
      id: 'q3-0008', obj: '3.1', type: 'match', difficulty: 2,
      stem: 'Match each route source to its default administrative distance on a Cisco router.',
      options: ['Directly connected', 'Static route', 'EIGRP internal', 'OSPF', 'RIP', 'External BGP (eBGP)'],
      targets: ['110', '20', '90', '0', '120', '1'],
      answer: [[0, 3], [1, 5], [2, 2], [3, 0], [4, 4], [5, 1]],
      explanation: 'Lower AD means more trusted. Connected networks get 0 because the router knows them firsthand, and static routes get 1 because an administrator typed them in. eBGP is 20, chosen low so routes learned from another autonomous system beat internal protocols. EIGRP internal is 90, OSPF is 110 and RIP is 120. Other values worth knowing: EIGRP external 170, iBGP 200, a static default learned from DHCP 254, and 255 for a source that is never trusted and never installed. AD only matters when two sources offer exactly the same prefix and prefix length.',
      ref: 'Lesson l3-1; card:rtable',
    },
    {
      id: 'q3-0009', obj: '3.1', type: 'order', difficulty: 2,
      stem: 'Put these route sources in order from most trusted to least trusted, using default administrative distances.',
      options: ['OSPF', 'Static route', 'RIP', 'EIGRP internal', 'Directly connected', 'EIGRP external'],
      answer: [4, 1, 3, 0, 2, 5],
      explanation: 'Trust follows administrative distance, lowest first: connected 0, static 1, EIGRP internal 90, OSPF 110, RIP 120, then EIGRP external 170. External EIGRP routes are deliberately ranked below every common IGP because they were redistributed from somewhere else and are more likely to cause loops. A frequent mistake is to place EIGRP external near EIGRP internal; the code D EX looks similar, but the AD is almost double. Remember that AD is only a tie-breaker between sources offering the identical prefix: it never overrides a longer prefix match.',
      ref: 'Lesson l3-1; card:rtable',
    },
    {
      id: 'q3-0010', obj: '3.1', type: 'single', difficulty: 1,
      stem: 'Refer to the exhibit. In the entry for 10.10.0.0/16, what does 01:14:07 indicate?',
      exhibit: EX_CORE,
      options: ['How long ago the route was learned or last changed (1 hour, 14 minutes, 7 seconds)', 'The time remaining before the route expires and is removed unless an update refreshes it', 'The round-trip delay to the next hop', 'The time of day the route was installed, shown in UTC as hours:minutes:seconds'],
      answer: 0,
      explanation: 'For routes learned from a dynamic routing protocol, IOS shows the age of the route: the time since it was installed or last changed, in hours:minutes:seconds (or forms such as 2d03h for longer periods). It is a useful troubleshooting clue: a route that keeps resetting to a few seconds old is flapping. It is not a countdown; OSPF routes do not expire on a timer shown here. It is not a delay measurement, and it is not a clock timestamp. Static and connected routes have no age field, which is why the S and C entries in the exhibit show none.',
      ref: 'Lesson l3-1; card:rtable',
    },
    {
      id: 'q3-0011', obj: '3.1', type: 'multi', difficulty: 2, pick: 2,
      stem: 'A router shows this entry: O 10.40.8.0/22 [110/21] via 10.0.14.4, 00:06:39, GigabitEthernet0/3. Which two statements are true? (Choose two.)',
      options: ['Packets matching this route are sent out GigabitEthernet0/3 toward 10.0.14.4', 'The route covers 10.40.8.0 through 10.40.11.255', 'The route was learned from an OSPF router in a different area', 'The router is 21 hops from 10.40.8.0/22', 'The administrative distance of this route was changed from its default'],
      answer: [0, 1],
      explanation: 'The via field is the next-hop address and the interface at the end is the exit interface, so matching packets leave Gi0/3 toward 10.0.14.4. A /22 spans four /24s: 10.40.8.0, .9.0, .10.0 and .11.0, so the range ends at 10.40.11.255. The code is O, not O IA, so the route is intra-area, not from another area. 21 is the OSPF cost, which is a sum of interface costs, not a hop count. And 110 is the default OSPF AD, so nothing was changed.',
      ref: 'Lesson l3-1; card:rtable',
    },
    {
      id: 'q3-0012', obj: '3.1', type: 'single', difficulty: 2,
      stem: 'An administrator sees this entry on a router: S 172.20.0.0/16 is directly connected, Serial0/1/0. How was the route configured?',
      options: ['As a static route that names an exit interface instead of a next-hop address', 'As a connected route, because 172.20.0.0/16 is the subnet configured on Serial0/1/0', 'As a static route with administrative distance 0', 'As a host route to the serial interface'],
      answer: 0,
      explanation: 'A static route written with an exit interface, such as ip route 172.20.0.0 255.255.0.0 Serial0/1/0, is displayed as "directly connected" because the router treats the destination as reachable straight out that interface. The code is still S, which is how you tell it from a real connected route (code C). Its AD is 1, not 0, even though older IOS documentation described exit-interface statics as behaving like connected routes. A host route would be a /32. Exit-interface statics are fine on point-to-point serial links; on Ethernet you should add or use a next hop.',
      ref: 'Lesson l3-1; card:static',
    },
    {
      id: 'q3-0013', obj: '3.1', type: 'multi', difficulty: 3, pick: 3,
      stem: 'Refer to the exhibit. Which three statements are true? (Choose three.)',
      exhibit: cli('HPL-HQ', `
HPL-HQ# show ipv6 route
IPv6 Routing Table - default - 6 entries
Codes: C - Connected, L - Local, S - Static, U - Per-user Static route
       B - BGP, R - RIP, O - OSPF Intra, OI - OSPF Inter, OE1 - OSPF ext 1
       OE2 - OSPF ext 2, ON1 - OSPF NSSA ext 1, ON2 - OSPF NSSA ext 2
       D - EIGRP, EX - EIGRP external
S   ::/0 [1/0]
     via 2001:DB8:FFFF::1
C   2001:DB8:10::/64 [0/0]
     via GigabitEthernet0/0, directly connected
L   2001:DB8:10::1/128 [0/0]
     via GigabitEthernet0/0, receive
S   2001:DB8:20::/64 [1/0]
     via 2001:DB8:12::2
C   2001:DB8:12::/64 [0/0]
     via GigabitEthernet0/1, directly connected
L   2001:DB8:12::1/128 [0/0]
     via GigabitEthernet0/1, receive
`),
      options: ['A packet to 2001:DB8:20::50 is forwarded to 2001:DB8:12::2', 'A packet to 2001:DB8:30::50 is forwarded to 2001:DB8:FFFF::1', '2001:DB8:10::1 is this router\'s own address on GigabitEthernet0/0', 'The default route was learned from OSPF', 'The router reaches 2001:DB8:12::/64 through the next hop 2001:DB8:12::2', 'The table holds six routes to remote networks'],
      answer: [0, 1, 2],
      explanation: '2001:DB8:20::50 falls inside 2001:DB8:20::/64, a static route via 2001:DB8:12::2. 2001:DB8:30::50 matches no specific prefix, but it does match the static default ::/0, so it goes to 2001:DB8:FFFF::1 instead of being dropped. 2001:DB8:10::1 is an L (local) /128 entry marked receive: this router\'s own Gi0/0 address. The default is coded S with [1/0], a static route; an OSPF default would show an O, OI or OE code and AD 110. 2001:DB8:12::/64 is a C route, directly connected on Gi0/1, so it needs no next hop. Six entries is the total, but only two (the default and 2001:DB8:20::/64) lead to remote networks; the rest are connected and local entries.',
      ref: 'Lesson l3-1; card:ipv6route',
    },
    {
      id: 'q3-0014', obj: '3.1', type: 'single', difficulty: 3,
      stem: 'Refer to the exhibit. The branch router gets its WAN address from the ISP by DHCP. Which statement explains the default route?',
      exhibit: rt('HPL-ESSEX', `
Gateway of last resort is 100.64.12.1 to network 0.0.0.0

S*    0.0.0.0/0 [254/0] via 100.64.12.1
      10.0.0.0/8 is variably subnetted, 2 subnets, 2 masks
C        10.88.0.0/24 is directly connected, GigabitEthernet0/0
L        10.88.0.1/32 is directly connected, GigabitEthernet0/0
      100.0.0.0/8 is variably subnetted, 2 subnets, 2 masks
C        100.64.12.0/23 is directly connected, GigabitEthernet0/1
L        100.64.12.77/32 is directly connected, GigabitEthernet0/1
`),
      options: ['IOS installed the DHCP-supplied gateway as a static default with AD 254, so any other default source is preferred', 'An administrator configured a floating static default route, and it is currently the active default toward the ISP', 'The route has an AD of 254 because the next hop is unreachable', 'The ISP is advertising the default to the branch with a dynamic routing protocol whose administrative distance is 254'],
      answer: 0,
      explanation: 'When an interface uses ip address dhcp and the DHCP offer includes a default router, IOS adds a static default route toward that gateway with an administrative distance of 254. The high AD is deliberate: a manually configured static default (AD 1) or a default learned from any routing protocol would override it. An administrator could configure a static with AD 254, but nothing else in the scenario suggests that, and the DHCP clue explains it directly. An unreachable next hop removes a route instead of changing its AD, and no common routing protocol uses AD 254.',
      ref: 'Lesson l3-1; card:dhcp',
    },
    {
      id: 'q3-0015', obj: '3.1', type: 'single', difficulty: 1,
      stem: 'What is the role of the metric in a routing table entry?',
      options: ['It ranks paths to the same prefix learned by the same routing protocol; lower is better', 'It ranks routes to the same prefix that were learned from different routing protocols; lower is better', 'It sets which routes are advertised to neighbors', 'It records how many times the route has changed'],
      answer: 0,
      explanation: 'Each routing protocol calculates a metric for its own paths: OSPF uses cost, EIGRP a composite of bandwidth and delay, RIP hop count. The metric lets the protocol choose its best path, and lower is better. Metrics from different protocols are not comparable, so when two protocols offer the same prefix the router uses administrative distance instead. Advertisement decisions are separate, configured with commands such as passive-interface or distribute lists. Route changes show indirectly in the age timer, not the metric.',
      ref: 'Lesson l3-1; card:rtable',
    },
    {
      id: 'q3-0016', obj: '3.1', type: 'single', difficulty: 3,
      stem: 'Refer to the exhibit. What does the router do with a packet destined for 10.6.1.20?',
      exhibit: rt('HPL-CORE2', `
Gateway of last resort is not set

      10.0.0.0/8 is variably subnetted, 6 subnets, 3 masks
C        10.0.12.0/30 is directly connected, GigabitEthernet0/1
L        10.0.12.1/32 is directly connected, GigabitEthernet0/1
C        10.0.13.0/30 is directly connected, GigabitEthernet0/2
L        10.0.13.1/32 is directly connected, GigabitEthernet0/2
O        10.6.0.0/24 [110/2] via 10.0.12.2, 00:21:40, GigabitEthernet0/1
O        10.6.1.0/24 [110/3] via 10.0.12.2, 00:21:40, GigabitEthernet0/1
                     [110/3] via 10.0.13.3, 00:21:40, GigabitEthernet0/2
`),
      options: ['It forwards it to 10.0.12.2 or 10.0.13.3, sharing load across both equal-cost paths', 'It sends it only to 10.0.12.2 because that next hop is listed first', 'It drops it because two routes to the same prefix are a conflict', 'It sends it only to 10.0.13.3, because the path with the higher next-hop IP address wins the tie'],
      answer: 0,
      explanation: '10.6.1.0/24 is listed once with two next hops of identical cost [110/3]. That is equal-cost multipath: OSPF installs up to four equal-cost paths by default, and the router spreads traffic across them (Cisco Express Forwarding balances per destination flow by default, not per packet). Listing order means nothing about preference. Two equal paths are a feature, not a conflict. Next-hop address size plays no part in path selection. If one path had a lower cost, only that one would be installed.',
      ref: 'Lesson l3-1; card:ospf',
    },
    {
      id: 'q3-0017', obj: '3.1', type: 'single', difficulty: 3,
      stem: 'Refer to the exhibit. A user on 10.30.5.0/24 reports that the HQ router drops traffic to an internet site. What is the most likely reason?',
      exhibit: rt('HPL-HQ', `
Gateway of last resort is not set

      10.0.0.0/8 is variably subnetted, 6 subnets, 3 masks
C        10.0.0.0/30 is directly connected, GigabitEthernet0/0
L        10.0.0.2/32 is directly connected, GigabitEthernet0/0
C        10.0.23.0/30 is directly connected, GigabitEthernet0/1
L        10.0.23.1/32 is directly connected, GigabitEthernet0/1
O        10.30.0.0/16 [110/2] via 10.0.23.2, 03:12:44, GigabitEthernet0/1
O        10.40.0.0/16 [110/2] via 10.0.23.2, 03:12:44, GigabitEthernet0/1
`),
      options: ['There is no default route, so packets to destinations that match none of the listed routes are dropped', 'The OSPF routes have aged out of the table and must be reinstalled with clear ip route *', 'The router cannot reach 10.30.5.0/24, because it has only the 10.30.0.0/16 route and no /24 route for it', 'Gi0/0 is down, as shown by the missing S* entry'],
      answer: 0,
      explanation: '"Gateway of last resort is not set" means there is no default route. An internet destination matches none of the listed prefixes, so the router drops the packet and sends an ICMP destination unreachable back toward the source. The fix is a default route toward the ISP, for example ip route 0.0.0.0 0.0.0.0 10.0.0.1. The OSPF routes are current (just over three hours old) and do not expire like this. 10.30.5.0/24 is covered by 10.30.0.0/16, so no /24 is needed. Gi0/0 is up, since its C and L routes are present; the missing S* is a missing configuration.',
      ref: 'Lesson l3-1; card:rtable',
    },
    {
      id: 'q3-0018', obj: '3.1', type: 'single', difficulty: 2,
      stem: 'Refer to the exhibit. Which statement about the output is true?',
      exhibit: cli('HPL-CORE', `
HPL-CORE# show ip route 10.10.20.77
Routing entry for 10.10.20.0/24
  Known via "ospf 1", distance 110, metric 2, type intra area
  Last update from 10.0.12.2 on GigabitEthernet0/1, 01:14:07 ago
  Routing Descriptor Blocks:
  * 10.0.12.2, from 2.2.2.2, 01:14:07 ago, via GigabitEthernet0/1
      Route metric is 2, traffic share count is 1
`),
      options: ['The best match for 10.10.20.77 is the OSPF route 10.10.20.0/24, originated by router ID 2.2.2.2', '10.10.20.77 is reachable through two equal-cost OSPF paths, so traffic is shared between them', 'The route was learned from a router in another OSPF area, so it is installed as an inter-area route', 'The administrative distance has been lowered from the default'],
      answer: 0,
      explanation: 'show ip route followed by an address performs the same longest-prefix lookup the router uses for forwarding and prints the winning entry. Here it is 10.10.20.0/24, known via OSPF process 1, intra-area, with metric 2. "from 2.2.2.2" is the router ID of the router that originated the information, and 10.0.12.2 is the next hop. Only one routing descriptor block appears, so there is a single path; equal-cost paths would list multiple blocks with traffic share counts. Type intra area rules out another area, and distance 110 is the OSPF default.',
      ref: 'Lesson l3-1; card:rtable',
    },
    {
      id: 'q3-0019', obj: '3.1', type: 'multi', difficulty: 1, pick: 2,
      stem: 'Which two routing table entries would you expect to see immediately after configuring ip address 192.168.40.1 255.255.255.0 on an interface and bringing it up/up? (Choose two.)',
      options: ['C 192.168.40.0/24 is directly connected', 'L 192.168.40.1/32 is directly connected', 'S 192.168.40.0/24 [1/0]', 'O 192.168.40.0/24 [110/1]', 'C 192.168.40.1/24 is directly connected'],
      answer: [0, 1],
      explanation: 'An up/up interface with an address installs a C route for the network address of its subnet (192.168.40.0/24) and an L route for the exact interface address as a /32. No static entry appears unless someone configures one. An O route for the subnet would show up on other OSPF routers that learn the network, not as the router\'s own route for its connected subnet, since connected (AD 0) always beats OSPF. C routes always show the network address, never the host address with the subnet mask.',
      ref: 'Lesson l3-1; card:rtable',
    },
    {
      id: 'q3-0020', obj: '3.1', type: 'single', difficulty: 2,
      stem: 'Refer to the exhibit. Which part of the entry O IA 172.16.64.0/18 [110/12] via 172.16.0.2 identifies where the router sends matching packets?',
      exhibit: EX_BR,
      options: ['172.16.0.2, the next-hop address', '172.16.64.0, the network address', '[110/12], the distance and metric', 'IA, the route type'],
      answer: 0,
      explanation: 'The via field holds the next hop: the address of the neighboring router that will receive the packet next. The router resolves that address to a MAC address with ARP and sends the frame out GigabitEthernet0/0, the exit interface at the end of the line. The network address and /18 mask define which destinations match the route. The bracket is the administrative distance and metric used to pick routes. IA only says the route came from another OSPF area through an area border router; it does not change where packets go.',
      ref: 'Lesson l3-1; card:rtable',
    },

    /* ---- 3.2 Forwarding decisions ---- */
    {
      id: 'q3-0021', obj: '3.2', type: 'multi', difficulty: 3, pick: 2,
      stem: 'Refer to the exhibit. Which two destinations does HPL-CORE forward to the next hop 10.0.13.3? (Choose two.)',
      exhibit: EX_CORE,
      options: ['10.10.20.130', '10.10.20.250', '10.10.20.100', '10.10.99.14', '10.11.20.130', '10.0.13.1'],
      answer: [0, 1],
      explanation: 'Do a longest-prefix lookup for each address. 10.10.20.130 matches the /32 host route, the most specific entry possible, via 10.0.13.3. 10.10.20.250 is inside 10.10.20.128/25 (.128 to .255), so the EIGRP route sends it to 10.0.13.3 as well. 10.10.20.100 is below .128, so its longest match is the OSPF /24 via 10.0.12.2. 10.10.99.14 only matches the OSPF 10.10.0.0/16, also via 10.0.12.2. 10.11.20.130 is outside 10.10.0.0/16 and falls to the default route toward 10.0.0.1. 10.0.13.1 is the router\'s own Gi0/2 address (the L entry), so the router processes that traffic itself. Administrative distance plays no part, because every candidate here is a different prefix.',
      ref: 'Lesson l3-2; card:rtable',
    },
    {
      id: 'q3-0022', obj: '3.2', type: 'single', difficulty: 3,
      stem: 'Refer to the exhibit. HPL-CORE receives a packet destined for 10.10.20.200. Which route does it use?',
      exhibit: EX_CORE,
      options: ['D 10.10.20.128/25 via 10.0.13.3', 'O 10.10.20.0/24 via 10.0.12.2, because OSPF has the lower metric', 'O 10.10.0.0/16 via 10.0.12.2', 'S 10.10.20.130/32 via 10.0.13.3'],
      answer: 0,
      explanation: '10.10.20.128/25 covers 10.10.20.128 through 10.10.20.255, so .200 is inside it, and /25 is the longest matching prefix. The /24 and /16 also match but are less specific. Metrics from different protocols are never compared, and even AD is irrelevant here, because longest match is evaluated across different prefixes first: the EIGRP route wins even though OSPF\'s [110/2] looks smaller than [90/3072]. The /32 host route only matches exactly 10.10.20.130.',
      ref: 'Lesson l3-2; card:rtable',
    },
    {
      id: 'q3-0023', obj: '3.2', type: 'single', difficulty: 2,
      stem: 'Refer to the exhibit. HPL-CORE receives a packet destined for 10.10.99.14. What is the next hop?',
      exhibit: EX_CORE,
      options: ['10.0.12.2', '10.0.13.3', '10.0.0.1', 'None; the packet is dropped'],
      answer: 0,
      explanation: '10.10.99.14 does not fall in 10.10.20.0/24, 10.10.20.128/25 or the /32 host route, but it does fall in 10.10.0.0/16 (10.10.0.0 to 10.10.255.255). That /16 is longer than the /0 default, so the OSPF route wins and the next hop is 10.0.12.2. 10.0.13.3 is only used for the EIGRP /25 and the host route. The default route to 10.0.0.1 would be used only if nothing longer matched. The packet is not dropped, because a matching route exists, and even without one the default route would catch it.',
      ref: 'Lesson l3-2; card:rtable',
    },
    {
      id: 'q3-0024', obj: '3.2', type: 'single', difficulty: 1,
      stem: 'Refer to the exhibit. HPL-CORE receives a packet destined for 10.11.4.4. Where does it go?',
      exhibit: EX_CORE,
      options: ['To 10.0.0.1, the gateway of last resort', 'To 10.0.12.2, because 10.11.4.4 is close to 10.10.0.0/16', 'It is dropped, because 10.11.0.0 is not in the table', 'To every OSPF neighbor'],
      answer: 0,
      explanation: '10.11.4.4 is outside 10.10.0.0/16 (which ends at 10.10.255.255) and outside every other specific prefix, so the only match is the default route 0.0.0.0/0, and the packet goes to the gateway of last resort, 10.0.0.1. Routers match exact bit patterns, not "close" numbers. Drops happen only when nothing at all matches, and a default route matches everything. Routers never flood unicast packets to neighbors; that behavior belongs to switches with unknown MAC addresses.',
      ref: 'Lesson l3-2; card:rtable',
    },
    {
      id: 'q3-0025', obj: '3.2', type: 'single', difficulty: 2,
      stem: 'A router learns 10.50.0.0/16 from EIGRP and 10.50.4.0/24 from OSPF. Both are installed. A packet arrives for 10.50.4.9. Which route is used and why?',
      options: ['The OSPF /24, because longest prefix match picks the route; AD never compares different prefixes', 'The EIGRP /16, because EIGRP has the lower administrative distance and AD is checked before prefix length', 'The EIGRP /16, because it was learned first', 'Both, because the router load-balances between the two protocols when their routes overlap'],
      answer: 0,
      explanation: 'This is the most common routing trap on the exam. AD only decides between routes for the identical prefix and length; it decides what gets into the routing table. These are two different prefixes, so both are installed. For each packet, the router then picks the most specific match, and 10.50.4.0/24 is longer than 10.50.0.0/16. EIGRP\'s lower AD of 90 is irrelevant here. Learning order has no effect, and a router never load-balances across different protocols or different prefixes; equal-cost load sharing happens only among paths to the same prefix from one source.',
      ref: 'Lesson l3-2; card:rtable',
    },
    {
      id: 'q3-0026', obj: '3.2', type: 'single', difficulty: 1,
      stem: 'A router learns 192.168.70.0/24 from both OSPF and EIGRP (internal). Which route is placed in the routing table?',
      options: ['The EIGRP route, because AD 90 is lower than OSPF\'s 110', 'The OSPF route, because OSPF is an open standard and is trusted more', 'Whichever route has the lower metric, since metrics decide between protocols', 'Both, so the router can load-balance between the two protocols'],
      answer: 0,
      explanation: 'When two sources offer the exact same prefix, the router uses administrative distance to choose, and lower wins. Internal EIGRP is 90 and OSPF is 110, so EIGRP\'s route is installed; the OSPF route stays in the OSPF database as a backup and is installed only if the EIGRP route disappears. Being an open standard has nothing to do with it. Metrics cannot be compared across protocols because each protocol calculates them differently. Routers do not load-balance across different routing protocols.',
      ref: 'Lesson l3-2; card:rtable',
    },
    {
      id: 'q3-0027', obj: '3.2', type: 'single', difficulty: 1,
      stem: 'OSPF on a router finds two paths to 10.80.0.0/16: one with cost 20 and one with cost 30. What happens?',
      options: ['Only the cost 20 path is installed', 'Both are installed and load-balanced in a 2:3 ratio', 'The cost 30 path is installed because higher cost means more bandwidth', 'Both are installed, and the router uses the one learned first'],
      answer: 0,
      explanation: 'Within a single routing protocol, the metric picks the best path, and for OSPF lower cost is better. Only the lowest-cost path (20) is installed. If both had cost 20, OSPF would install both and share load equally. OSPF does not do unequal-cost load balancing; that is an EIGRP feature (variance) and beyond CCNA scope. Cost is inversely related to bandwidth, so a higher cost means a slower path, not a faster one. Learning order never decides.',
      ref: 'Lesson l3-2; card:ospf',
    },
    {
      id: 'q3-0028', obj: '3.2', type: 'order', difficulty: 2,
      stem: 'A router receives an Ethernet frame carrying an IPv4 packet for a remote network. Put the router\'s actions in order.',
      options: ['Look up the destination IP address in the routing table (longest match)', 'Check the frame\'s FCS and strip the Ethernet header', 'Build a new Ethernet frame with its own MAC as source and the next hop\'s MAC as destination', 'Decrement the TTL and recalculate the IPv4 header checksum', 'Resolve the next-hop MAC address from the ARP cache (or ARP for it)', 'Transmit the frame out the exit interface'],
      answer: [1, 3, 0, 4, 2, 5],
      explanation: 'The router first checks the frame for errors and discards the Layer 2 header, since frames only live for one hop. It then decrements the TTL (dropping the packet and sending ICMP time exceeded if it reaches 0) and updates the header checksum. Next comes the routing table lookup, which chooses the exit interface and next hop by longest prefix match. The router needs the next hop\'s MAC address, from its ARP table or by sending an ARP request, then wraps the packet in a fresh frame and sends it. Real routers may look up the route and adjust TTL in parallel, but logically the source and destination IP addresses never change hop by hop (without NAT); the MAC addresses do.',
      ref: 'Lesson l3-2; card:packet',
    },
    {
      id: 'q3-0029', obj: '3.2', type: 'order', difficulty: 1,
      stem: 'Put the criteria a Cisco router uses to choose where to forward a packet in the order they are applied.',
      options: ['Lowest metric among paths from the same routing protocol', 'Longest matching prefix', 'Lowest administrative distance among sources for the same prefix'],
      answer: [1, 2, 0],
      explanation: 'Think of it as three filters. Longest prefix match is applied per packet at forwarding time and always wins: the most specific matching route is used no matter its source. Administrative distance decides, among different sources offering the exact same prefix, which one goes into the routing table. Metric decides, inside one routing protocol, which path to that prefix is best (equal metrics produce equal-cost multipath). Students often put AD first because it sounds most important, but AD never overrides a longer match.',
      ref: 'Lesson l3-2; card:rtable',
    },
    {
      id: 'q3-0030', obj: '3.2', type: 'single', difficulty: 3,
      stem: 'Refer to the exhibit. HPL-YARD receives a packet for 172.16.5.140. Which next hop is used?',
      exhibit: rt('HPL-YARD', `
Gateway of last resort is 172.31.0.1 to network 0.0.0.0

S*    0.0.0.0/0 [1/0] via 172.31.0.1
      172.16.0.0/16 is variably subnetted, 4 subnets, 4 masks
D        172.16.0.0/16 [90/3328] via 172.31.1.2, 00:12:10, GigabitEthernet0/1
O        172.16.5.0/25 [110/2] via 172.31.2.2, 00:40:02, GigabitEthernet0/2
O        172.16.5.128/26 [110/3] via 172.31.2.2, 00:40:02, GigabitEthernet0/2
S        172.16.5.128/27 [1/0] via 172.31.3.2
      172.31.0.0/16 is variably subnetted, 8 subnets, 2 masks
C        172.31.0.0/30 is directly connected, GigabitEthernet0/0
L        172.31.0.2/32 is directly connected, GigabitEthernet0/0
C        172.31.1.0/30 is directly connected, GigabitEthernet0/1
L        172.31.1.1/32 is directly connected, GigabitEthernet0/1
C        172.31.2.0/30 is directly connected, GigabitEthernet0/2
L        172.31.2.1/32 is directly connected, GigabitEthernet0/2
C        172.31.3.0/30 is directly connected, GigabitEthernet0/3
L        172.31.3.1/32 is directly connected, GigabitEthernet0/3
`),
      options: ['172.31.3.2', '172.31.2.2', '172.31.1.2', '172.31.0.1'],
      answer: 0,
      explanation: 'Work out each range. 172.16.5.0/25 is .0 to .127, so .140 is outside it. 172.16.5.128/26 is .128 to .191, which contains .140. 172.16.5.128/27 is .128 to .159, which also contains .140, and /27 is the longest match. So the static route wins and the next hop is 172.31.3.2. The EIGRP /16 and the default also match but are less specific. AD differences between the static (1), OSPF (110) and EIGRP (90) routes are irrelevant because the prefixes differ.',
      ref: 'Lesson l3-2; card:vlsm',
    },
    {
      id: 'q3-0031', obj: '3.2', type: 'single', difficulty: 3,
      stem: 'Using the same HPL-YARD routing table, the router receives a packet for 172.16.5.200. Which next hop is used?',
      exhibit: rt('HPL-YARD', `
Gateway of last resort is 172.31.0.1 to network 0.0.0.0

S*    0.0.0.0/0 [1/0] via 172.31.0.1
      172.16.0.0/16 is variably subnetted, 4 subnets, 4 masks
D        172.16.0.0/16 [90/3328] via 172.31.1.2, 00:12:10, GigabitEthernet0/1
O        172.16.5.0/25 [110/2] via 172.31.2.2, 00:40:02, GigabitEthernet0/2
O        172.16.5.128/26 [110/3] via 172.31.2.2, 00:40:02, GigabitEthernet0/2
S        172.16.5.128/27 [1/0] via 172.31.3.2
`),
      options: ['172.31.1.2', '172.31.2.2', '172.31.3.2', '172.31.0.1'],
      answer: 0,
      explanation: '172.16.5.200 is outside 172.16.5.0/25 (.0 to .127), outside 172.16.5.128/26 (.128 to .191) and outside 172.16.5.128/27 (.128 to .159). The longest remaining match is the EIGRP route 172.16.0.0/16, so the packet goes to 172.31.1.2. It is tempting to pick an OSPF next hop because the /26 "looks close", but .200 is past its last address. The default route matches too, but a /16 beats a /0. The trick in questions like this is to calculate the block size (a /26 is 64 addresses) instead of eyeballing.',
      ref: 'Lesson l3-2; card:vlsm',
    },
    {
      id: 'q3-0032', obj: '3.2', type: 'multi', difficulty: 2, pick: 2,
      stem: 'Which two statements correctly describe how a Cisco router selects routes? (Choose two.)',
      options: ['Administrative distance is compared only between routes to the identical prefix and prefix length', 'A more specific route is used even if it has a higher administrative distance than a less specific route', 'The route with the lowest metric is always used, regardless of routing protocol', 'A default route is used only when every dynamic routing protocol has failed', 'When two OSPF paths to a prefix have equal cost, only the one with the lower router ID is installed'],
      answer: [0, 1],
      explanation: 'AD is a tie-breaker between sources offering exactly the same prefix, and longest match is applied per packet, so a more specific route wins even with a worse AD (a /24 from OSPF beats a /16 from EIGRP). Metrics cannot be compared across protocols, since OSPF cost and EIGRP composite metrics measure different things. A default route is used for any packet that matches nothing more specific; it does not wait for protocols to fail. Equal-cost OSPF paths are all installed (up to four by default) for load sharing; router ID is not a tie-breaker for paths.',
      ref: 'Lesson l3-2; card:rtable',
    },
    {
      id: 'q3-0033', obj: '3.2', type: 'multi', difficulty: 2, pick: 3,
      stem: 'A router forwards an IPv4 packet from one Ethernet LAN to another. No NAT is configured. Which three fields does the router change? (Choose three.)',
      options: ['Destination MAC address', 'Source MAC address', 'IP time to live (TTL)', 'Destination IP address', 'Source IP address', 'TCP destination port'],
      answer: [0, 1, 2],
      explanation: 'Each hop gets a new Ethernet frame: the source MAC becomes the router\'s exit-interface MAC and the destination MAC becomes the next hop\'s (or the final host\'s) MAC. The router also decrements the TTL, which forces it to recompute the IPv4 header checksum. The source and destination IP addresses stay the same end to end; only NAT or a proxy changes them. Routers do not touch Layer 4 port numbers during normal forwarding; PAT changes source ports, but NAT is not configured here.',
      ref: 'Lesson l3-2; card:packet',
    },
    {
      id: 'q3-0034', obj: '3.2', type: 'single', difficulty: 2,
      stem: 'A router receives a packet whose TTL is 1 and whose destination is a remote network in its routing table. What does the router do?',
      options: ['Drops it and sends an ICMP time exceeded message to the source', 'Forwards it with TTL 0, and the next router drops it instead', 'Forwards it and resets the TTL to 64 because the route is valid', 'Drops it silently without notifying the source'],
      answer: 0,
      explanation: 'Before forwarding, the router decrements the TTL. Going from 1 to 0 means the packet has used up its hop budget, so the router discards it and sends an ICMP time exceeded (type 11) message back to the source. That behavior is what traceroute exploits: it sends probes with TTL 1, 2, 3 and so on, and each router that drops one reveals itself. A packet is never forwarded with TTL 0. Routers do not reset TTL, which is what makes it a loop-prevention tool. The drop is not silent, unless ICMP unreachables have been rate-limited or disabled.',
      ref: 'Lesson l3-2; card:ipv4hdr',
    },
    {
      id: 'q3-0035', obj: '3.2', type: 'single', difficulty: 3,
      stem: 'HPL-HQ learns 10.20.0.0/16 from OSPF over the primary fiber. Last week a technician added ip route 10.20.30.0 255.255.255.0 10.0.99.2 200 as a "backup" over a slow DSL link. Users on 10.20.30.0/24 now complain about slow file transfers even though the fiber is up. What explains it?',
      options: ['The static /24 is more specific than the OSPF /16, so it carries traffic to 10.20.30.0/24 whatever its AD', 'AD 200 is lower than OSPF\'s 110 in this case, so the static route wins and the OSPF route is removed', 'The router load-balances between the OSPF /16 and the static /24, so half the flows take the DSL link', 'Floating static routes are always active as long as their next hop is reachable, whatever their AD is set to'],
      answer: 0,
      explanation: 'A floating static route only floats when it backs up the same prefix. Here the static is a /24 and the OSPF route is a /16, so they are different prefixes and both are installed. AD never gets a say. For traffic to 10.20.30.0/24 the /24 is the longest match, so it goes over DSL. The fix is to make the static match the OSPF prefix (10.20.0.0/16 with AD above 110) or to have OSPF advertise the /24. 200 is higher than 110, not lower. Routers do not load-balance across different prefixes or protocols.',
      ref: 'Lesson l3-2; card:static',
    },
    {
      id: 'q3-0036', obj: '3.2', type: 'single', difficulty: 2,
      stem: 'A router has the static route ip route 10.70.0.0 255.255.0.0 10.0.45.5. How does it find the exit interface for packets to 10.70.1.1?',
      options: ['It does a second (recursive) lookup for 10.0.45.5 and uses the interface of the route that matches', 'It floods the packet out every interface until 10.0.45.5 replies, then caches that interface', 'It uses the up/up interface with the lowest number, since the route itself names no exit interface', 'It sends an ICMP redirect to 10.0.45.5 and uses the interface the reply comes back on'],
      answer: 0,
      explanation: 'A static route that names only a next-hop address is recursive. The router matches 10.70.1.1 to 10.70.0.0/16, then looks up 10.0.45.5 in the routing table, typically finding a connected route such as 10.0.45.0/30 on Gi0/2, and uses that interface. If no route reaches the next hop, the static route is not installed at all. Routers do not flood unicast packets. Interface numbering is irrelevant. ICMP redirects are messages a router sends to hosts to suggest a better gateway; they are not part of route resolution.',
      ref: 'Lesson l3-2; card:static',
    },
    {
      id: 'q3-0037', obj: '3.2', type: 'single', difficulty: 2,
      stem: 'A router has a static route ip route 10.90.0.0 255.255.255.0 10.0.56.6 (AD 1) and also learns 10.90.0.0/24 from OSPF. The administrator wants OSPF to be preferred. Which change achieves this with the least effort?',
      options: ['Re-enter the static route with an administrative distance greater than 110, such as 111', 'Increase the OSPF cost on the interface toward 10.0.56.6 so the OSPF path looks better', 'Change the static route mask to 255.255.0.0 so it covers the whole 10.90.0.0/16 range instead', 'Re-enter the static route with an administrative distance of 100 so that it floats behind OSPF'],
      answer: 0,
      explanation: 'Both routes describe the identical prefix, so administrative distance decides. Static at AD 1 beats OSPF at 110. Raising the static\'s AD above 110 makes it a floating static: OSPF is used, and the static only installs if OSPF loses the route. Changing OSPF cost affects which OSPF path wins, not whether OSPF beats a static. Changing the mask to /16 makes the static a different, less specific prefix; it would no longer compete, but it also changes what it covers and is not what was asked. AD 100 is still lower than 110, so the static would still win.',
      ref: 'Lesson l3-2; card:static',
    },
    {
      id: 'q3-0038', obj: '3.2', type: 'single', difficulty: 3,
      stem: 'Refer to the exhibit. PC-A (10.1.1.10/24, gateway 10.1.1.1) pings 10.2.2.20. The ping fails. HPL-R1 shows a route to 10.2.2.0/24, and HPL-R2 has the host directly connected. What is the most likely cause?',
      exhibit: cli('HPL-R2', `
HPL-R2# show ip route | begin Gateway
Gateway of last resort is not set

      10.0.0.0/8 is variably subnetted, 4 subnets, 2 masks
C        10.0.12.0/30 is directly connected, GigabitEthernet0/1
L        10.0.12.2/32 is directly connected, GigabitEthernet0/1
C        10.2.2.0/24 is directly connected, GigabitEthernet0/0
L        10.2.2.1/32 is directly connected, GigabitEthernet0/0
`),
      options: ['HPL-R2 has no route back to 10.1.1.0/24, so the echo replies are dropped', 'HPL-R2 cannot reach 10.2.2.0/24, because the host is not in its routing table', 'The packet is dropped at HPL-R1 because its TTL expires', 'HPL-R2 needs a static route to 10.0.12.0/30 before it can reach HPL-R1 at all'],
      answer: 0,
      explanation: 'Routing is one way at a time. The echo request reaches HPL-R2 and the host, but the reply is addressed to 10.1.1.10, and HPL-R2 has only its two connected networks and no default route. The reply matches nothing and is dropped. Adding ip route 10.1.1.0 255.255.255.0 10.0.12.1 (or a default route toward HPL-R1) fixes it. HPL-R2 is directly connected to 10.2.2.0/24 and to 10.0.12.0/30, so the second and fourth options are wrong. A two-hop path cannot exhaust a normal starting TTL.',
      ref: 'Lesson l3-2; card:static',
    },
    {
      id: 'q3-0039', obj: '3.2', type: 'single', difficulty: 2,
      stem: 'A router has three routes that match 192.168.10.70: 192.168.10.0/24 learned from EIGRP, 192.168.10.64/26 learned from OSPF, and a static route to 192.168.10.64/27. Which route forwards the packet?',
      options: ['The static 192.168.10.64/27', 'The OSPF 192.168.10.64/26', 'The EIGRP 192.168.10.0/24, because EIGRP has the lowest AD of the dynamic protocols', 'The OSPF route, because it was learned more recently'],
      answer: 0,
      explanation: '192.168.10.64/27 covers .64 to .95, which includes .70. The /26 covers .64 to .127 and the /24 covers .0 to .255, so all three match, but /27 is the most specific. The router uses the static route. Administrative distance is irrelevant because the three prefixes differ, and route age never influences forwarding.',
      ref: 'Lesson l3-2; card:rtable',
    },
    {
      id: 'q3-0040', obj: '3.2', type: 'single', difficulty: 2,
      stem: 'A router has ip route 0.0.0.0 0.0.0.0 203.0.113.1 and learns 0.0.0.0/0 from OSPF (O*E2). Which default route is installed?',
      options: ['The static default, because AD 1 beats OSPF\'s 110', 'The OSPF default, because external routes are preferred', 'Both, because default routes are always load-balanced', 'Neither; the conflict removes both'],
      answer: 0,
      explanation: 'Both offer the same prefix and length, 0.0.0.0/0, so administrative distance decides. The static wins with AD 1, and the OSPF default stays in the OSPF database as a backup. If you wanted OSPF\'s default to be used and the static to serve as backup, you would give the static an AD above 110. External OSPF routes are not preferred over statics. Defaults from different sources are not load-balanced, and IOS never removes both routes because of a conflict.',
      ref: 'Lesson l3-2; card:static',
    },
  );

  Q.push(
    /* ---- 3.3 IPv4 and IPv6 static routing ---- */
    {
      id: 'q3-0041', obj: '3.3', type: 'single', difficulty: 1,
      stem: 'Which command configures an IPv4 default route that sends unmatched traffic to the ISP router at 203.0.113.1?',
      options: ['ip route 0.0.0.0 0.0.0.0 203.0.113.1', 'ip route 0.0.0.0 255.255.255.255 203.0.113.1', 'ip default-gateway 203.0.113.1', 'ip route 203.0.113.1 0.0.0.0 0.0.0.0'],
      answer: 0,
      explanation: 'A default route is a static route to network 0.0.0.0 with mask 0.0.0.0, a prefix length of zero that matches every address. The syntax is ip route network mask next-hop. A mask of 255.255.255.255 would make it a host route to the single address 0.0.0.0, which is useless. ip default-gateway is for devices that do not route, such as a Layer 2 switch or a router with ip routing disabled; a routing device ignores it. The last option puts the next hop where the network belongs, and IOS rejects it as an inconsistent address and mask.',
      ref: 'Lesson l3-3; card:static',
    },
    {
      id: 'q3-0042', obj: '3.3', type: 'single', difficulty: 1,
      stem: 'A network server at 10.44.0.25 must be reached through 10.0.0.6 while the rest of 10.44.0.0/24 uses another path. Which command creates the route for the server?',
      options: ['ip route 10.44.0.25 255.255.255.255 10.0.0.6', 'ip route 10.44.0.25 255.255.255.0 10.0.0.6', 'ip route 10.44.0.0 0.0.0.255 10.0.0.6', 'ip route host 10.44.0.25 10.0.0.6'],
      answer: 0,
      explanation: 'A host route uses a /32 mask (255.255.255.255) so it matches exactly one address. Because it is more specific than the /24, longest-prefix match sends the server\'s traffic through 10.0.0.6 while everything else in 10.44.0.0/24 follows the /24 route. With a /24 mask, IOS would reject 10.44.0.25 as an inconsistent address and mask, because the host bits are not zero. Static routes take a subnet mask, not a wildcard mask; wildcards belong to ACLs and OSPF network statements. There is no host keyword in the ip route command.',
      ref: 'Lesson l3-3; card:static',
    },
    {
      id: 'q3-0043', obj: '3.3', type: 'single', difficulty: 2,
      stem: 'HPL-HQ learns 10.60.0.0/16 through EIGRP (internal). An administrator wants a static route over a backup link to take over only if the EIGRP route is lost. Which command meets the requirement?',
      options: ['ip route 10.60.0.0 255.255.0.0 10.0.88.2 95', 'ip route 10.60.0.0 255.255.0.0 10.0.88.2', 'ip route 10.60.0.0 255.255.0.0 10.0.88.2 85', 'ip route 10.60.0.0 255.255.0.0 10.0.88.2 255'],
      answer: 0,
      explanation: 'A floating static route needs an administrative distance higher than the route it backs up. Internal EIGRP has an AD of 90, so 95 keeps the static out of the routing table until the EIGRP route disappears. Without an AD the static uses 1 and immediately replaces EIGRP. AD 85 is still lower than 90, so the static would also win. AD 255 means "never trust this source", so the route would never be installed, not even as a backup. If the primary were OSPF, the floating AD would have to be above 110.',
      ref: 'Lesson l3-3; card:static',
    },
    {
      id: 'q3-0044', obj: '3.3', type: 'single', difficulty: 3,
      stem: 'Refer to the exhibit. The administrator configured ip route 10.33.0.0 255.255.0.0 10.0.0.9, but the route does not appear in the routing table. Why?',
      exhibit: cli('HPL-CANTON', `
HPL-CANTON# show running-config | include ip route
ip route 10.33.0.0 255.255.0.0 10.0.0.9
HPL-CANTON# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet0/0     10.0.0.5        YES manual up                    up
GigabitEthernet0/1     10.12.1.1       YES manual up                    up
GigabitEthernet0/2     unassigned      YES unset  administratively down down
HPL-CANTON# show running-config interface g0/0
interface GigabitEthernet0/0
 ip address 10.0.0.5 255.255.255.252
`),
      options: ['The next hop 10.0.0.9 is outside every connected subnet (Gi0/0 is 10.0.0.4/30), so it cannot be resolved', 'Static routes only appear in the table after copy running-config startup-config is run', 'The mask must be 255.255.255.0 for a 10.x network, so IOS keeps the route out of the table', 'Gi0/2 is administratively down, and IOS installs static routes only when every routed interface is up/up'],
      answer: 0,
      explanation: 'IOS installs a next-hop static route only if it can reach the next hop through some other route. Gi0/0 is 10.0.0.5/30, subnet 10.0.0.4 with usable hosts .5 and .6, so the neighbor is almost certainly 10.0.0.6. 10.0.0.9 is in a different /30, and nothing else in the table covers it, so the route sits in the config but never enters the routing table. Replace it with ip route 10.33.0.0 255.255.0.0 10.0.0.6. Saving the config has no effect on the routing table. Any valid mask works for any network. Gi0/2 being down is unrelated, since the route does not point there.',
      ref: 'Lesson l3-3; card:static',
    },
    {
      id: 'q3-0045', obj: '3.3', type: 'multi', difficulty: 2, pick: 2,
      stem: 'Which two commands correctly create a default route on a router? (Choose two.)',
      options: ['ip route 0.0.0.0 0.0.0.0 198.51.100.1', 'ip route 0.0.0.0 0.0.0.0 Serial0/0/0', 'ip default-network 0.0.0.0 198.51.100.1', 'ip route 0.0.0.0/0 198.51.100.1', 'ipv4 route default 198.51.100.1'],
      answer: [0, 1],
      explanation: 'A default static route can point at a next-hop address or at an exit interface. Naming the interface works well on a point-to-point link such as a serial line, where there is only one possible neighbor. On Ethernet, an exit-interface-only default makes the router ARP for every destination and rely on proxy ARP, so use a next hop there. ip default-network is a different, legacy command that takes only a network and does not accept a next hop like this. IOS does not accept slash notation in ip route, and there is no ipv4 route default command.',
      ref: 'Lesson l3-3; card:static',
    },
    {
      id: 'q3-0046', obj: '3.3', type: 'single', difficulty: 2,
      stem: 'Which command is a fully specified IPv4 static route?',
      options: ['ip route 10.5.0.0 255.255.0.0 GigabitEthernet0/1 10.0.15.2', 'ip route 10.5.0.0 255.255.0.0 10.0.15.2', 'ip route 10.5.0.0 255.255.0.0 GigabitEthernet0/1', 'ip route 10.5.0.0 255.255.0.0 10.0.15.2 1'],
      answer: 0,
      explanation: 'A fully specified static route names both the exit interface and the next-hop address. The router does not need a recursive lookup, and on a multi-access link such as Ethernet it knows exactly which neighbor to ARP for. A next-hop-only route is recursive: the router must look up 10.0.15.2 to find the interface. An exit-interface-only route on Ethernet makes the router ARP for each final destination and depend on proxy ARP. The last option is a next-hop route that just spells out the default AD of 1.',
      ref: 'Lesson l3-3; card:static',
    },
    {
      id: 'q3-0047', obj: '3.3', type: 'single', difficulty: 3,
      stem: 'A router has ip route 10.70.0.0 255.255.0.0 GigabitEthernet0/2 and no next hop. Users report that 10.70.0.0/16 is reachable, but the router\'s ARP table has grown to hundreds of 10.70.x.x entries all pointing at the same MAC address. What is happening?',
      options: ['The router treats every 10.70.x.x destination as on-link and ARPs for each; the neighbor answers by proxy ARP', 'The neighbor router is under an ARP spoofing attack, so a single host is answering for the whole 10.70.0.0/16', 'The static route has created a routing loop, and each pass through the loop adds another ARP entry', 'The router is flooding traffic out Gi0/2 because the next hop is unknown, and it caches every reply'],
      answer: 0,
      explanation: 'With only an exit interface on Ethernet, the router assumes each destination is on the link and sends an ARP request for every destination address. The neighbor router has proxy ARP enabled (the IOS default), so it answers each request with its own MAC address. Traffic works, but the ARP cache bloats and every new destination costs an ARP exchange. The usual fix is a next-hop or fully specified route. Many entries sharing one MAC is the expected proxy-ARP signature, not proof of an attack, and nothing here loops or floods.',
      ref: 'Lesson l3-3; card:static',
    },
    {
      id: 'q3-0048', obj: '3.3', type: 'single', difficulty: 3,
      stem: 'Refer to the exhibit. The fiber link to HPL-HQ is up and OSPF is running, but traffic to 10.9.0.0/24 is crossing the LTE backup link. What is wrong?',
      exhibit: cli('HPL-BRANCH', `
HPL-BRANCH# show running-config | include ip route
ip route 10.9.0.0 255.255.255.0 10.0.112.2 100
HPL-BRANCH# show ip route 10.9.0.0
Routing entry for 10.9.0.0/24
  Known via "static", distance 100, metric 0
  Routing Descriptor Blocks:
  * 10.0.112.2
      Route metric is 0, traffic share count is 1
HPL-BRANCH# show ip ospf neighbor
Neighbor ID     Pri   State           Dead Time   Address         Interface
2.2.2.2           0   FULL/  -        00:00:36    10.0.12.2       GigabitEthernet0/1
`),
      options: ['The floating static has AD 100, lower than OSPF\'s 110, so it replaces the OSPF route', 'The OSPF adjacency is not fully formed, so no OSPF route to 10.9.0.0/24 has been installed yet', 'Static routes always win over OSPF routes to the same prefix, whatever AD they are given', 'The OSPF route is a /16, so the static /24 is more specific and wins by longest match'],
      answer: 0,
      explanation: 'The static route is meant to float but its AD of 100 beats OSPF\'s 110 for the same /24, so it is installed and the OSPF route stays in the OSPF database unused. Re-enter it with an AD above 110, for example 120 or 200 (remove the old line first). The neighbor is FULL on a point-to-point link (the dash means no DR/BDR role), so OSPF is healthy. A static with a high enough AD does lose to OSPF; that is the whole idea of a floating static. Nothing in the output shows an OSPF /16, and the static entry is for the exact /24.',
      ref: 'Lesson l3-3; card:static',
    },
    {
      id: 'q3-0049', obj: '3.3', type: 'single', difficulty: 3,
      stem: 'Branches use 10.50.0.0/24, 10.50.1.0/24, 10.50.2.0/24 and 10.50.3.0/24, all reached through 10.0.0.2. Which single static route covers all four and nothing more?',
      options: ['ip route 10.50.0.0 255.255.252.0 10.0.0.2', 'ip route 10.50.0.0 255.255.248.0 10.0.0.2', 'ip route 10.50.0.0 255.255.254.0 10.0.0.2', 'ip route 10.50.0.0 255.255.0.0 10.0.0.2'],
      answer: 0,
      explanation: 'Four contiguous /24s that start on a multiple of four (0, 1, 2, 3) summarize to a /22: two bits of the third octet are borrowed back, giving a mask of 255.255.252.0 and a range of 10.50.0.0 to 10.50.3.255. A /21 (255.255.248.0) would also include 10.50.4.0 through 10.50.7.255, which may live elsewhere. A /23 (255.255.254.0) covers only 10.50.0.0 and 10.50.1.0. A /16 covers 256 /24s, far more than needed. Summary statics shrink the routing table but must not swallow networks that sit behind other paths.',
      ref: 'Lesson l3-3; card:vlsm',
    },
    {
      id: 'q3-0050', obj: '3.3', type: 'match', difficulty: 2,
      stem: 'Match each static route command to the type of route it creates.',
      options: ['ip route 0.0.0.0 0.0.0.0 10.0.0.1', 'ip route 172.16.8.0 255.255.248.0 10.0.0.1', 'ip route 172.16.8.9 255.255.255.255 10.0.0.1', 'ip route 172.16.8.0 255.255.248.0 10.0.9.1 130', 'ipv6 route ::/0 2001:DB8:0:FF::1'],
      targets: ['Floating static network route', 'IPv4 default route', 'IPv4 host route', 'IPv6 default route', 'IPv4 network route'],
      answer: [[0, 1], [1, 4], [2, 2], [3, 0], [4, 3]],
      explanation: 'A network of 0.0.0.0 with mask 0.0.0.0 is the IPv4 default; IPv6 writes the default as ::/0. A mask of 255.255.255.255 matches one host. 172.16.8.0/21 is an ordinary network route. The same network with an administrative distance on the end (130, above OSPF\'s 110 and EIGRP\'s 90) is a floating static: it stays out of the routing table until the preferred route to that prefix disappears. On the exam, look at three things in any static route: the mask, the next hop and whether an AD is tacked on.',
      ref: 'Lesson l3-3; card:static',
    },
    {
      id: 'q3-0051', obj: '3.3', type: 'single', difficulty: 1,
      stem: 'Which command configures an IPv6 default route through the next-hop router 2001:DB8:ACAD:1::1?',
      options: ['ipv6 route ::/0 2001:DB8:ACAD:1::1', 'ipv6 route 0::0 0::0 2001:DB8:ACAD:1::1', 'ipv6 route ::/128 2001:DB8:ACAD:1::1', 'ip route ::/0 2001:DB8:ACAD:1::1'],
      answer: 0,
      explanation: 'IPv6 static routes use ipv6 route prefix/length next-hop, and the default route is ::/0 (all zeros, prefix length zero). IPv6 does not use dotted masks, so a separate mask argument is wrong. ::/128 is a host route to the unspecified address, the opposite of a default. ip route is the IPv4 command and does not accept IPv6 prefixes. Remember that the router also needs ipv6 unicast-routing to forward IPv6 packets at all.',
      ref: 'Lesson l3-3; card:ipv6route',
    },
    {
      id: 'q3-0052', obj: '3.3', type: 'single', difficulty: 2,
      stem: 'An engineer wants an IPv6 static route to 2001:DB8:77::/64 using the neighbor\'s link-local address FE80::2 on GigabitEthernet0/1. Which command works?',
      options: ['ipv6 route 2001:DB8:77::/64 GigabitEthernet0/1 FE80::2', 'ipv6 route 2001:DB8:77::/64 FE80::2', 'ipv6 route 2001:DB8:77::/64 FE80::2 GigabitEthernet0/1', 'ipv6 route 2001:DB8:77::/64 link-local FE80::2'],
      answer: 0,
      explanation: 'Every IPv6 interface has a link-local address, and the same FE80:: address can exist on several links at once, so a link-local next hop is ambiguous unless you say which interface it lives on. IOS therefore requires the fully specified form, with the exit interface before the next hop: ipv6 route 2001:DB8:77::/64 GigabitEthernet0/1 FE80::2. Leaving out the interface is rejected. The interface goes before the address, not after it, and there is no link-local keyword. With a global unicast next hop, the interface is optional.',
      ref: 'Lesson l3-3; card:ipv6route',
    },
    {
      id: 'q3-0053', obj: '3.3', type: 'single', difficulty: 2,
      stem: 'A new router has IPv6 addresses on all interfaces and correct ipv6 route statements. Hosts can ping the router\'s interfaces but not hosts on other subnets through it. What is missing?',
      options: ['ipv6 unicast-routing', 'ipv6 enable on every interface', 'ip routing', 'An IPv6 default gateway on the router'],
      answer: 0,
      explanation: 'Cisco routers accept IPv6 addresses and answer pings to their own interfaces without any global setting, but they do not forward IPv6 packets between interfaces until ipv6 unicast-routing is configured. That command also makes the router send router advertisements, which SLAAC clients need. ipv6 enable only creates a link-local address, and an interface with a global address already has one. ip routing controls IPv4 and is on by default on routers. A router does not use a default gateway; it uses routes.',
      ref: 'Lesson l3-3; card:ipv6route',
    },
    {
      id: 'q3-0054', obj: '3.3', type: 'single', difficulty: 3,
      stem: 'Refer to the exhibit. Which statement about the IPv6 route to 2001:DB8:30::/64 is true?',
      exhibit: cli('HPL-HQ', `
HPL-HQ# show running-config | include ipv6 route
ipv6 route 2001:DB8:30::/64 2001:DB8:12::2
ipv6 route 2001:DB8:30::/64 2001:DB8:13::3 5
HPL-HQ# show ipv6 route 2001:DB8:30::/64
Routing entry for 2001:DB8:30::/64
  Known via "static", distance 1, metric 0
  Route count is 1/1, share count 0
  Routing paths:
    2001:DB8:12::2
      Last updated 00:09:51 ago
`),
      options: ['The route via 2001:DB8:13::3 is a floating static that installs only if the other route is removed', 'Both routes are installed and traffic is shared equally between the two next hops', 'The route via 2001:DB8:13::3 has a metric of 5, so it is installed beside the other as a less preferred path', 'The router prefers 2001:DB8:13::3 because 5 is a higher priority than the default of 1'],
      answer: 0,
      explanation: 'Both statements cover the same prefix. The first uses the default AD of 1; the second ends in 5, which is an administrative distance, not a metric. AD 1 wins, so only the path via 2001:DB8:12::2 is installed, exactly as the output shows (route count 1/1). If that next hop becomes unreachable, the route with AD 5 floats in. Equal sharing would require equal AD. For AD, lower is better, so 5 is a worse value, not a higher priority. IPv6 floating statics work exactly like IPv4 ones.',
      ref: 'Lesson l3-3; card:ipv6route',
    },
    {
      id: 'q3-0055', obj: '3.3', type: 'multi', difficulty: 2, pick: 2,
      stem: 'A router\'s only exit to HQ is Gi0/1, and it has ip route 10.0.0.0 255.0.0.0 10.0.12.2. Gi0/1 goes down (down/down). Which two statements describe what happens to the static route? (Choose two.)',
      options: ['It is removed from the routing table, because 10.0.12.2 is no longer reachable through a connected route', 'The ip route command stays in the running configuration, and the route is reinstalled automatically when Gi0/1 comes back up', 'It stays in the routing table, and traffic to 10.0.0.0/8 is black-holed until Gi0/1 returns', 'It is deleted from the running configuration and must be re-entered after Gi0/1 comes back up', 'It moves to the next available interface that is still up/up, using the same next hop'],
      answer: [0, 1],
      explanation: 'When Gi0/1 goes down its connected route 10.0.12.0/30 disappears, so the router can no longer resolve 10.0.12.2 and withdraws the static route from the routing table. The command itself stays in the running configuration, and the route is reinstalled on its own when the link comes back. This is what makes floating static routes work: when the primary route vanishes, the backup can take over. Static routes never migrate to other interfaces. The weak spot is an Ethernet link where the interface stays up but the far end fails, which needs features such as IP SLA tracking.',
      ref: 'Lesson l3-3; card:static',
    },
    {
      id: 'q3-0056', obj: '3.3', type: 'multi', difficulty: 2, pick: 2,
      stem: 'Which two statements about floating static routes are true? (Choose two.)',
      options: ['They are configured with an administrative distance higher than the primary route\'s', 'They stay in the configuration but are not installed in the routing table while the primary route exists', 'They are configured with a lower metric than the primary route, so they are used only as a tiebreaker', 'They are automatically advertised to OSPF neighbors as backup routes', 'They require the floating keyword at the end of the ip route command'],
      answer: [0, 1],
      explanation: 'A floating static is a standard static route whose AD is set above the AD of the route it backs up, for example 111 or more for OSPF, 91 or more for internal EIGRP. While the primary exists, the floating route loses the AD comparison and stays out of the routing table, waiting. Static routes have no metric to tune in this sense; their bracket shows 0. Statics are not advertised to OSPF neighbors unless you redistribute them. There is no floating keyword; the AD at the end of the command is what makes the route float.',
      ref: 'Lesson l3-3; card:static',
    },
    {
      id: 'q3-0057', obj: '3.3', type: 'single', difficulty: 3,
      stem: 'A Catalyst 9300 at a branch has SVIs for VLANs 10 and 20 and must reach the WAN router at 10.0.99.1. It was configured with ip default-gateway 10.0.99.1, then later with ip routing so it can route between the VLANs. Now the VLANs can reach each other but nothing beyond the switch. What should be added?',
      options: ['ip route 0.0.0.0 0.0.0.0 10.0.99.1', 'ip default-network 10.0.99.1', 'no ip routing', 'A second ip default-gateway command'],
      answer: 0,
      explanation: 'ip default-gateway is only used when the device is not routing. Once ip routing is enabled, the multilayer switch behaves like a router: it ignores ip default-gateway and forwards using its routing table, which holds only the connected SVI subnets. A static default route, ip route 0.0.0.0 0.0.0.0 10.0.99.1, gives it a gateway of last resort. ip default-network takes a classful network, not an address, and is a legacy method. Turning routing off would break inter-VLAN routing. Adding the default-gateway again changes nothing.',
      ref: 'Lesson l3-3; card:static',
    },
    {
      id: 'q3-0058', obj: '3.3', type: 'single', difficulty: 1,
      stem: 'Which IPv6 static route is a host route?',
      options: ['ipv6 route 2001:DB8:5::10/128 2001:DB8:1::2', 'ipv6 route 2001:DB8:5::/64 2001:DB8:1::2', 'ipv6 route 2001:DB8:5::10/64 2001:DB8:1::2', 'ipv6 route ::/0 2001:DB8:5::10'],
      answer: 0,
      explanation: 'An IPv6 host route uses a /128 prefix length, the IPv6 version of an IPv4 /32: it matches exactly one address. A /64 is a normal subnet route. Writing the host address with /64 still describes the 2001:DB8:5::/64 subnet; IOS just normalizes it, so it is not a host route. ::/0 is the default route, and in that option 2001:DB8:5::10 is the next hop, not the destination.',
      ref: 'Lesson l3-3; card:ipv6route',
    },
    {
      id: 'q3-0059', obj: '3.3', type: 'single', difficulty: 2,
      stem: 'On HPL-HQ, a static route to the branch LAN 10.2.0.0/24 must be removed. The running configuration contains ip route 10.2.0.0 255.255.255.0 10.0.12.2. Which command removes it?',
      options: ['no ip route 10.2.0.0 255.255.255.0 10.0.12.2', 'no ip route 10.2.0.0', 'clear ip route 10.2.0.0', 'ip route 10.2.0.0 255.255.255.0 null0'],
      answer: 0,
      explanation: 'Use no in front of the full original command: no ip route 10.2.0.0 255.255.255.0 10.0.12.2. Including the next hop matters when several statics to the same prefix exist, since you remove only the one you name. IOS also accepts no ip route with the prefix and mask alone, but without the mask it cannot identify the route. clear ip route only refreshes the routing table; the configuration line remains. Pointing the prefix at Null0 adds a discard route, which silently drops traffic instead of removing the route.',
      ref: 'Lesson l3-3; card:static',
    },
    {
      id: 'q3-0060', obj: '3.3', type: 'single', difficulty: 3,
      stem: 'Refer to the exhibit. PC-A at 10.1.1.10 cannot ping PC-C at 10.3.3.10. Which change fixes the problem?',
      exhibit: cli('Exhibit', `
HPL-R1# show running-config | include ip route
ip route 10.3.3.0 255.255.255.0 10.0.12.2

HPL-R2# show running-config | include ip route
ip route 10.3.3.0 255.255.255.0 10.0.23.2
ip route 10.1.1.0 255.255.255.0 10.0.12.1

HPL-R3# show running-config | include ip route
ip route 10.1.1.0 255.255.255.0 10.0.23.2

Links: R1 Gi0/1 10.0.12.1/30 -- R2 Gi0/0 10.0.12.2/30
       R2 Gi0/1 10.0.23.1/30 -- R3 Gi0/0 10.0.23.2/30
LANs:  10.1.1.0/24 on R1, 10.3.3.0/24 on R3
`),
      options: ['On HPL-R3, replace the next hop 10.0.23.2 with 10.0.23.1', 'On HPL-R1, change the next hop for 10.3.3.0/24 to 10.0.23.3', 'On HPL-R2, remove the route to 10.1.1.0/24 so the replies use the connected link', 'On HPL-R2, add a default route pointing to 10.0.23.3'],
      answer: 0,
      explanation: 'Trace both directions. R1 sends traffic for 10.3.3.0/24 to R2 (10.0.12.2), and R2 forwards it to R3 at 10.0.23.2, so the request arrives. The reply to 10.1.1.10 is the problem: R3 points 10.1.1.0/24 at 10.0.23.2, which is its own Gi0/0 address. IOS will not install a static route whose next hop is a local address, so R3 has no route back and drops the replies. Pointing it at R2\'s address, 10.0.23.1, fixes the return path. R1\'s next hop must be on its own link, so 10.0.23.3 is wrong. R2 needs its 10.1.1.0/24 route for the replies to continue toward R1. A default route on R2 toward R3 adds nothing, and 10.0.23.3 does not exist.',
      ref: 'Lesson l3-3; card:static',
    },
    {
      id: 'q3-0061', obj: '3.3', type: 'single', difficulty: 2,
      stem: 'Which IPv6 static route is a directly attached route, appropriate only on a point-to-point link?',
      options: ['ipv6 route 2001:DB8:40::/64 Serial0/1/0', 'ipv6 route 2001:DB8:40::/64 2001:DB8:12::2', 'ipv6 route 2001:DB8:40::/64 Serial0/1/0 FE80::2', 'ipv6 route 2001:DB8:40::/64 2001:DB8:12::2 200'],
      answer: 0,
      explanation: 'A directly attached static route names only the exit interface. On a serial point-to-point link that is fine, because anything sent out reaches the single neighbor. On a multi-access link such as Ethernet the router would not know which neighbor to send to, so Cisco recommends a next hop there. The second option is recursive (next hop only). The third is fully specified, with both interface and next hop, which is mandatory when the next hop is link-local. The last is a recursive floating static with AD 200.',
      ref: 'Lesson l3-3; card:ipv6route',
    },
    {
      id: 'q3-0062', obj: '3.3', type: 'single', difficulty: 2,
      stem: 'After adding ip route 192.168.200.0 255.255.255.0 10.0.5.2, which command best confirms that the route is actually being used for forwarding?',
      options: ['show ip route 192.168.200.0', 'show running-config | include ip route', 'show ip interface brief', 'show ip protocols'],
      answer: 0,
      explanation: 'The running configuration only proves the command was entered. The routing table proves it was accepted and installed: show ip route 192.168.200.0 shows the entry, the source (static), the AD and the next hop, or "Network not in table" if the next hop cannot be resolved or a better source is in use. show ip interface brief shows interface status and addresses, useful when the next hop is unreachable but not proof of the route. show ip protocols covers dynamic routing protocols, not static routes.',
      ref: 'Lesson l3-3; card:static',
    },
  );

  const EX_NBR = cli('HPL-R4', `
HPL-R4# show ip ospf neighbor

Neighbor ID     Pri   State           Dead Time   Address         Interface
1.1.1.1         100   FULL/DR         00:00:34    10.0.123.1      GigabitEthernet0/0
2.2.2.2           1   FULL/BDR        00:00:38    10.0.123.2      GigabitEthernet0/0
3.3.3.3           1   2WAY/DROTHER    00:00:31    10.0.123.3      GigabitEthernet0/0
5.5.5.5           0   FULL/  -        00:00:39    10.0.45.5       GigabitEthernet0/1
`);

  Q.push(
    /* ---- 3.4 Single-area OSPFv2 ---- */
    {
      id: 'q3-0063', obj: '3.4', type: 'order', difficulty: 2,
      stem: 'Put the OSPF neighbor states in the order a router moves through them while forming a full adjacency.',
      options: ['Exchange', 'Init', 'Full', 'Down', 'ExStart', '2-Way', 'Loading'],
      answer: [3, 1, 5, 4, 0, 6, 2],
      explanation: 'Down: no hellos heard yet. Init: a hello arrived, but it does not list this router\'s ID. 2-Way: each router sees its own ID in the other\'s hello, so communication is bidirectional; DR/BDR election happens here on broadcast networks. ExStart: the pair decide who is master for the database exchange. Exchange: they swap database description (DBD) packets that summarize their LSDBs. Loading: each requests the LSAs it lacks with link-state requests and receives updates. Full: databases are synchronized. Two DROTHERs on the same segment intentionally stop at 2-Way.',
      ref: 'Lesson l3-4; card:ospf',
    },
    {
      id: 'q3-0064', obj: '3.4', type: 'single', difficulty: 3,
      stem: 'Refer to the exhibit. Which statement about HPL-R4 is true?',
      exhibit: EX_NBR,
      options: ['HPL-R4 is a DROTHER on Gi0/0, and its 2WAY state with 3.3.3.3 is normal', 'The adjacency with 3.3.3.3 is broken at 2WAY and needs clear ip ospf process to recover', 'HPL-R4 is the BDR on the 10.0.123.0 segment', '5.5.5.5 is not working, because its priority is 0'],
      answer: 0,
      explanation: 'On a broadcast segment, every router goes FULL with the DR and BDR but stays at 2-Way with other DROTHERs. That keeps the number of full adjacencies, and LSA flooding, down. HPL-R4 is FULL with the DR (1.1.1.1) and BDR (2.2.2.2) and 2WAY with 3.3.3.3, so R4 itself must also be a DROTHER: if it were the DR or BDR it would be FULL with everyone. Nothing is broken, so clearing the process is pointless. On Gi0/1, FULL/  - is a point-to-point adjacency; there is no DR there, so priority plays no role and the neighbor is healthy.',
      ref: 'Lesson l3-4; card:ospf',
    },
    {
      id: 'q3-0065', obj: '3.4', type: 'single', difficulty: 2,
      stem: 'Refer to the exhibit. Why is 1.1.1.1 the DR on Gi0/0?',
      exhibit: EX_NBR,
      options: ['Its priority (100) is the highest on the segment, or it was elected first and kept the role', 'It has the lowest router ID on the segment, and the lowest router ID always wins the election', 'It has the lowest interface IP address on the segment, which wins when priorities differ', 'The DR is always the router with router ID 1.1.1.1, whatever the priorities are'],
      answer: 0,
      explanation: 'The DR is elected by highest interface priority, then highest router ID as a tie-breaker. 1.1.1.1 has priority 100 against 1 for the others, so it wins on priority even though its router ID is the lowest. The election is also non-preemptive, so a router that already holds the role keeps it until it fails or the OSPF process is reset, which is why "elected first" matters in real networks. Lowest router ID and lowest IP address never win an election, and there is nothing special about the number 1.1.1.1.',
      ref: 'Lesson l3-4; card:ospf',
    },
    {
      id: 'q3-0066', obj: '3.4', type: 'multi', difficulty: 2, pick: 3,
      stem: 'Two routers are connected on GigabitEthernet0/0 and both run OSPF. Which three settings must match for them to become neighbors? (Choose three.)',
      options: ['Area ID', 'Subnet and subnet mask on the link', 'Hello and dead intervals', 'OSPF process ID (router ospf number)', 'Router ID on both routers', 'Interface priority for the DR election'],
      answer: [0, 1, 2],
      explanation: 'Each hello carries the area ID, the subnet mask (on broadcast links) and the hello and dead intervals, and a router ignores hellos whose values differ from its own. Authentication settings and the stub area flag must match too, and an MTU mismatch lets neighbors see each other but leaves them stuck in ExStart or Exchange. The process ID is only locally significant: router ospf 1 can peer with router ospf 99. Router IDs must be different, not equal. Priority only affects the DR election and may differ freely.',
      ref: 'Lesson l3-4; card:ospf',
    },
    {
      id: 'q3-0067', obj: '3.4', type: 'multi', difficulty: 3, pick: 2,
      stem: 'Refer to the exhibit. HPL-R1 and HPL-R2 are directly connected on Gi0/0, but show ip ospf neighbor on each router is empty. R2\'s only change from the defaults is ip ospf hello-interval 5. Which two changes would each, on its own, let the routers become neighbors? (Choose two.)',
      exhibit: cli('Exhibit', `
HPL-R1# show ip ospf interface g0/0 | include Area|Timer|Network
  Internet Address 10.0.12.1/30, Area 0, Attached via Network Statement
  Process ID 1, Router ID 1.1.1.1, Network Type BROADCAST, Cost: 1
  Timer intervals configured, Hello 10, Dead 40, Wait 40, Retransmit 5

HPL-R2# show ip ospf interface g0/0 | include Area|Timer|Network
  Internet Address 10.0.12.2/30, Area 0, Attached via Network Statement
  Process ID 7, Router ID 2.2.2.2, Network Type BROADCAST, Cost: 1
  Timer intervals configured, Hello 5, Dead 20, Wait 20, Retransmit 5
`),
      options: ['On HPL-R2 Gi0/0, enter no ip ospf hello-interval', 'On HPL-R1 Gi0/0, enter ip ospf hello-interval 5', 'On HPL-R2, change the OSPF process ID to 1', 'On HPL-R2 Gi0/0, enter ip ospf dead-interval 40', 'On both routers, enter ip ospf network point-to-point on Gi0/0', 'On HPL-R2, change the router ID to 1.1.1.1'],
      answer: [0, 1],
      explanation: 'OSPF neighbors must agree on the hello and dead intervals, and here R1 uses 10/40 while R2 uses 5/20. When only the hello interval is configured, IOS sets the dead interval to four times the hello. Removing the command on R2 puts it back to 10/40, and setting hello 5 on R1 gives it 5/20; either way the timers match. Setting only dead 40 on R2 leaves the hellos at 5 against 10, still a mismatch. Process IDs are local and do not need to match. The point-to-point type keeps the same 10/40 defaults on R1 and R2 keeps its configured 5, so it fixes nothing. Copying R1\'s router ID would create a duplicate-ID problem.',
      ref: 'Lesson l3-4; card:ospf',
    },
    {
      id: 'q3-0068', obj: '3.4', type: 'single', difficulty: 3,
      stem: 'Two OSPF routers on a WAN Ethernet circuit see each other, but the adjacency keeps sitting in EXSTART and EXCHANGE and never reaches FULL. Hello timers, area and subnet all match. What is the most likely cause?',
      options: ['An IP MTU mismatch between the two interfaces', 'Duplicate OSPF process IDs on the two routers', 'A DR priority of 0 on one of the two routers', 'Missing passive-interface commands on the WAN link'],
      answer: 0,
      explanation: 'Database description packets carry the interface MTU. If the values differ, the router with the smaller MTU rejects DBDs from the other and the pair loop in ExStart/Exchange. That typically happens when a provider or tunnel lowers the MTU on one side only. Fix it by matching ip mtu on both ends (ip ospf mtu-ignore exists but only hides the problem). Process IDs are local and can match or differ without effect. Priority 0 only stops a router from becoming DR or BDR; it still reaches FULL with the DR and BDR. passive-interface would stop hellos entirely, so the routers would not see each other at all.',
      ref: 'Lesson l3-4; card:ospf',
    },
    {
      id: 'q3-0069', obj: '3.4', type: 'single', difficulty: 2,
      stem: 'A router has Loopback0 192.168.255.4, GigabitEthernet0/0 10.200.1.1 and GigabitEthernet0/1 172.16.9.1, all up. No router-id command is configured. Which OSPF router ID does it use?',
      options: ['192.168.255.4', '10.200.1.1', '172.16.9.1', '0.0.0.0'],
      answer: 0,
      explanation: 'IOS picks the OSPF router ID in this order: the router-id command; otherwise the highest IPv4 address on an up loopback interface; otherwise the highest IPv4 address on any up physical interface. A loopback is preferred even when a physical interface has a numerically higher address, because loopbacks never go down on their own and give a stable ID. Here only one loopback exists, so 192.168.255.4 is used. 10.200.1.1 is higher than 172.16.9.1 but loses to the loopback, and 0.0.0.0 would mean no usable address at all, in which case OSPF will not start.',
      ref: 'Lesson l3-4; card:ospf',
    },
    {
      id: 'q3-0070', obj: '3.4', type: 'single', difficulty: 2,
      stem: 'An administrator adds router-id 9.9.9.9 under router ospf 1 on a router that has been running OSPF for weeks. show ip ospf still shows the old router ID. What must the administrator do?',
      options: ['Run clear ip ospf process (or reload) so the new router ID takes effect', 'Remove and re-add every network statement under router ospf 1 so OSPF rereads the ID', 'Configure the same router ID on all neighbors so the adjacencies match', 'Nothing; OSPF never changes its router ID once it has chosen one'],
      answer: 0,
      explanation: 'IOS warns that the new router ID takes effect after a reload or clear ip ospf process. Clearing the process tears down and rebuilds all adjacencies, so do it in a maintenance window. Re-entering network statements does not touch the router ID. Neighbors must have unique router IDs, so copying the same value would cause a duplicate-ID problem. The ID does change, just not until the process restarts.',
      ref: 'Lesson l3-4; card:ospf',
    },
    {
      id: 'q3-0071', obj: '3.4', type: 'single', difficulty: 1,
      stem: 'Which network statement enables OSPF area 0 on an interface addressed 10.0.12.1/30 and on nothing else in 10.0.0.0/8?',
      options: ['network 10.0.12.0 0.0.0.3 area 0', 'network 10.0.12.0 255.255.255.252 area 0', 'network 10.0.0.0 0.255.255.255 area 0', 'network 10.0.12.1 0.0.0.255 area 0'],
      answer: 0,
      explanation: 'OSPF network statements use a wildcard mask, the inverse of the subnet mask. A /30 mask of 255.255.255.252 inverts to 0.0.0.3, so network 10.0.12.0 0.0.0.3 area 0 matches 10.0.12.0 through 10.0.12.3. IOS would read 255.255.255.252 as a wildcard, which does not mean /30 and is wrong here. 0.255.255.255 matches every 10.x.x.x interface, more than asked. 0.0.0.255 matches the whole 10.0.12.0/24, also more than asked; the host part of the address is ignored where wildcard bits are 1.',
      ref: 'Lesson l3-4; card:ospf',
    },
    {
      id: 'q3-0072', obj: '3.4', type: 'single', difficulty: 3,
      stem: 'Refer to the exhibit. Which interfaces are enabled for OSPF in area 0?',
      exhibit: cli('HPL-R7', `
HPL-R7# show running-config | section router ospf
router ospf 1
 network 172.16.0.0 0.0.15.255 area 0
HPL-R7# show ip interface brief | exclude unassigned
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet0/0     172.16.4.1      YES manual up                    up
GigabitEthernet0/1     172.16.15.254   YES manual up                    up
GigabitEthernet0/2     172.16.16.1     YES manual up                    up
Loopback0              172.16.255.7    YES manual up                    up
`),
      options: ['Gi0/0 and Gi0/1 only', 'Gi0/0, Gi0/1 and Gi0/2', 'All four interfaces', 'Gi0/0 only'],
      answer: 0,
      explanation: 'A wildcard of 0.0.15.255 with 172.16.0.0 means the first two octets must match exactly and the third octet may vary only in its low four bits, so it covers 172.16.0.0 through 172.16.15.255 (a /20). Gi0/0 (172.16.4.1) and Gi0/1 (172.16.15.254) fall inside. Gi0/2 (172.16.16.1) is the first address of the next /20, and the loopback (172.16.255.7) is far outside. The network statement only selects interfaces; each one advertises its own subnet with its own mask.',
      ref: 'Lesson l3-4; card:ospf',
    },
    {
      id: 'q3-0073', obj: '3.4', type: 'single', difficulty: 2,
      stem: 'Which interface command enables OSPF process 1 in area 0 directly on GigabitEthernet0/1, without a network statement?',
      options: ['ip ospf 1 area 0', 'ospf 1 area 0 enable', 'ip ospf area 0 process 1', 'router ospf 1 area 0'],
      answer: 0,
      explanation: 'Under interface configuration, ip ospf process-id area area-id enables OSPF on that interface. It is more precise than wildcard network statements and is easy to read in the interface config. show ip ospf interface reports "Attached via Interface Enable" for interfaces enabled this way, versus "Attached via Network Statement". The other options are not valid IOS syntax; router ospf 1 is a global command that enters router configuration mode and takes no area argument.',
      ref: 'Lesson l3-4; card:ospf',
    },
    {
      id: 'q3-0074', obj: '3.4', type: 'single', difficulty: 2,
      stem: 'Three routers share a broadcast segment, all with OSPF priority 1. Their router IDs are 10.1.1.1, 10.1.1.9 and 10.1.1.22. They all boot at the same moment. Which router becomes the DR?',
      options: ['10.1.1.22', '10.1.1.1', '10.1.1.9', 'None; a DR is elected only when priorities differ'],
      answer: 0,
      explanation: 'With equal priorities, the highest router ID wins. 10.1.1.22 beats 10.1.1.9 and 10.1.1.1, so it becomes DR and 10.1.1.9 becomes BDR. Router IDs are compared as 32-bit numbers, so .22 is higher than .9 despite looking shorter. The election always happens on broadcast and non-broadcast multi-access networks whenever at least one router has priority above 0. "Boot at the same moment" matters because the election is non-preemptive: if 10.1.1.1 had come up alone first, it would keep the DR role.',
      ref: 'Lesson l3-4; card:ospf',
    },
    {
      id: 'q3-0075', obj: '3.4', type: 'single', difficulty: 1,
      stem: 'What is the effect of ip ospf priority 0 on an interface?',
      options: ['The router can never become DR or BDR there, but it still forms adjacencies', 'OSPF is disabled on that interface, and its subnet is no longer advertised', 'The router always becomes the DR, because 0 is the best priority value', 'The interface becomes passive, sending no hellos but still advertising its subnet'],
      answer: 0,
      explanation: 'Priority ranges from 0 to 255, with 1 as the default. Priority 0 makes the router ineligible for the DR and BDR roles; it still sends hellos, still becomes a DROTHER and still goes FULL with the DR and BDR. It is often used on small branch routers sharing a segment with core routers. It does not disable OSPF or make the interface passive, which would stop hellos. The highest priority, not 0, gives the best chance of becoming DR, and only if no DR already exists.',
      ref: 'Lesson l3-4; card:ospf',
    },
    {
      id: 'q3-0076', obj: '3.4', type: 'match', difficulty: 2,
      stem: 'Match each OSPF value to what it is.',
      options: ['224.0.0.5', '224.0.0.6', '10 seconds', '40 seconds', 'IP protocol 89'],
      targets: ['Default dead interval on broadcast and point-to-point links', 'Multicast address for all OSPF routers', 'How OSPF is carried, directly over IP', 'Default hello interval on broadcast and point-to-point links', 'Multicast address for the DR and BDR'],
      answer: [[0, 1], [1, 4], [2, 3], [3, 0], [4, 2]],
      explanation: 'OSPF hellos and most updates go to 224.0.0.5, which every OSPF router listens on. DROTHERs send updates to 224.0.0.6, which only the DR and BDR listen on; the DR then floods them to everyone on 224.0.0.5. On broadcast and point-to-point networks the hello interval defaults to 10 seconds and the dead interval to four times that, 40 seconds (non-broadcast networks use 30 and 120). OSPF does not use TCP or UDP; it rides directly in IP as protocol number 89, so ACLs that only permit TCP and UDP will break it.',
      ref: 'Lesson l3-4; card:ospf',
    },
    {
      id: 'q3-0077', obj: '3.4', type: 'single', difficulty: 2,
      stem: 'With the default reference bandwidth, which OSPF cost does IOS assign to a 10-Gigabit Ethernet interface, and why can that be a problem?',
      options: ['1, the same as Gigabit and FastEthernet, so OSPF cannot prefer the faster links', '10, which makes OSPF prefer slower links whenever both kinds are available', '0.01, which OSPF rounds down to 0 and then treats the link as unreachable', '100, which makes 10-Gigabit links look slower than FastEthernet links to every OSPF router'],
      answer: 0,
      explanation: 'OSPF cost is reference bandwidth divided by interface bandwidth, and the default reference is 100 Mbps. FastEthernet gives 100/100 = 1, and anything faster would be below 1, but cost cannot be a fraction, so it is rounded up to the minimum of 1. FastEthernet, Gigabit and 10-Gigabit all cost 1, and OSPF cannot tell them apart. The fix is auto-cost reference-bandwidth (for example 100000 for 100 Gbps) under router ospf, set the same on every router. Cost is never 0, and a 10-Gigabit link never costs more than FastEthernet.',
      ref: 'Lesson l3-4; card:ospf',
    },
    {
      id: 'q3-0078', obj: '3.4', type: 'single', difficulty: 3,
      stem: 'Refer to the exhibit. All routers use auto-cost reference-bandwidth 10000 (10 Gbps). What OSPF cost does HPL-A install for the path to the LAN behind HPL-C?',
      exhibit: table([
        ['Link', 'Bandwidth', 'Interface'],
        ['HPL-A to HPL-B', '1 Gbps', 'HPL-A Gi0/1 (outgoing)'],
        ['HPL-B to HPL-C', '100 Mbps', 'HPL-B Fa0/1 (outgoing)'],
        ['HPL-C LAN', '1 Gbps', 'HPL-C Gi0/0 (outgoing onto the LAN)'],
      ]),
      options: ['120', '111', '30', '3'],
      answer: 0,
      explanation: 'With a reference of 10,000 Mbps, a 1 Gbps interface costs 10,000/1,000 = 10 and a 100 Mbps interface costs 10,000/100 = 100. OSPF adds the cost of each outgoing interface along the path, including the interface onto the destination LAN: 10 (A Gi0/1) + 100 (B Fa0/1) + 10 (C Gi0/0) = 120. 111 mixes up the reference values, 30 forgets the slow link, and 3 is what you would get with the default 100 Mbps reference, where every one of these links costs 1.',
      ref: 'Lesson l3-4; card:ospf',
    },
    {
      id: 'q3-0079', obj: '3.4', type: 'multi', difficulty: 2, pick: 2,
      stem: 'An administrator configures passive-interface GigabitEthernet0/0 under router ospf 1. Gi0/0 connects to a user LAN and is covered by a network statement. Which two results does this have? (Choose two.)',
      options: ['Gi0/0\'s subnet is still advertised to OSPF neighbors on other links', 'No OSPF hellos are sent out Gi0/0, so no adjacency can form there', 'The LAN subnet is no longer advertised', 'Gi0/0 is forced to be the DR', 'IP routing is disabled on Gi0/0', 'Hellos are still sent out Gi0/0, but neighbors there are ignored'],
      answer: [0, 1],
      explanation: 'A passive interface stays in OSPF, so its subnet is still advertised to neighbors on other links, but the router sends no hellos out of it and therefore forms no adjacencies there. On a user LAN that saves a little CPU and bandwidth and, more importantly, stops a rogue device from forming an adjacency and injecting routes. To stop advertising the subnet you would remove it from OSPF entirely. Passive has nothing to do with DR election, and packets are still routed through the interface normally. The hellos themselves stop, which is the whole point.',
      ref: 'Lesson l3-4; card:ospf',
    },
    {
      id: 'q3-0080', obj: '3.4', type: 'single', difficulty: 2,
      stem: 'The internet edge router HPL-EDGE has a static default route to the ISP. The administrator wants every other OSPF router in area 0 to learn a default route from HPL-EDGE. Which command should be added on HPL-EDGE?',
      options: ['default-information originate under router ospf', 'network 0.0.0.0 255.255.255.255 area 0 under router ospf', 'ip default-network 0.0.0.0 in global configuration', 'redistribute connected under router ospf'],
      answer: 0,
      explanation: 'default-information originate makes an OSPF router advertise a default route into OSPF, as long as it has a default route itself (add always to advertise regardless). The other routers then show it as O*E2 0.0.0.0/0. The network statement 0.0.0.0 255.255.255.255 enables OSPF on every interface; it does not advertise a default route. ip default-network is a legacy command for classful default networks. redistribute connected injects connected subnets, not the static default route.',
      ref: 'Lesson l3-4; card:ospf',
    },
    {
      id: 'q3-0081', obj: '3.4', type: 'single', difficulty: 2,
      stem: 'Refer to the exhibit. Which statement is true about HPL-R3\'s Gi0/0?',
      exhibit: cli('HPL-R3', `
HPL-R3# show ip ospf interface g0/0
GigabitEthernet0/0 is up, line protocol is up
  Internet Address 10.0.123.3/24, Area 0, Attached via Network Statement
  Process ID 1, Router ID 3.3.3.3, Network Type BROADCAST, Cost: 1
  Topology-MTID    Cost    Disabled    Shutdown      Topology Name
        0           1         no          no            Base
  Transmit Delay is 1 sec, State DROTHER, Priority 1
  Designated Router (ID) 1.1.1.1, Interface address 10.0.123.1
  Backup Designated router (ID) 2.2.2.2, Interface address 10.0.123.2
  Timer intervals configured, Hello 10, Dead 40, Wait 40, Retransmit 5
    Hello due in 00:00:06
  Neighbor Count is 3, Adjacent neighbor count is 2
    Adjacent with neighbor 1.1.1.1  (Designated Router)
    Adjacent with neighbor 2.2.2.2  (Backup Designated Router)
`),
      options: ['R3 sees three neighbors but is fully adjacent only with the DR and BDR, which is expected for a DROTHER', 'R3 should be the DR because it has the highest router ID, so the DR election failed and must be rerun now', 'R3 has a problem with its third neighbor, which is stuck at 2WAY, and should be restarted', 'R3 cannot become DR because its priority is 1'],
      answer: 0,
      explanation: 'Neighbor Count is the number of routers R3 sees in hellos (three) and Adjacent neighbor count is how many it is FULL with (two: the DR and BDR). A DROTHER stays at 2-Way with the other DROTHER, which is exactly the third neighbor. R3 has the highest router ID, but DR elections are not preemptive and priority is checked first, so the DR could have been elected earlier or with a higher priority. Priority 1 is the default and makes R3 eligible; only 0 would make it ineligible.',
      ref: 'Lesson l3-4; card:ospf',
    },
    {
      id: 'q3-0082', obj: '3.4', type: 'multi', difficulty: 2, pick: 2,
      stem: 'Two routers are connected by a single Ethernet link, and both use ip ospf network point-to-point on it. Which two statements are true? (Choose two.)',
      options: ['No DR or BDR is elected on the link', 'show ip ospf neighbor shows the neighbor as FULL/  -', 'The routers stay in the 2-Way state and never go FULL', 'Hellos are sent every 30 seconds instead of every 10', 'The link\'s subnet is no longer advertised in the router LSA'],
      answer: [0, 1],
      explanation: 'The point-to-point network type skips the DR/BDR election, because with only two routers there is nothing to gain from it, and it skips the 40-second wait timer, so adjacencies form faster. The neighbor table shows FULL followed by a dash in the role column. Point-to-point neighbors always go FULL, never stop at 2-Way. Hello and dead timers stay at 10 and 40 seconds, the same as broadcast; 30 and 120 belong to non-broadcast networks. The link subnet is still advertised as part of the router LSA.',
      ref: 'Lesson l3-4; card:ospf',
    },
    {
      id: 'q3-0083', obj: '3.4', type: 'single', difficulty: 3,
      stem: 'Refer to the exhibit. HPL-R1 logs this message repeatedly after a new router is installed. What is the problem?',
      exhibit: cli('HPL-R1', `
*Nov 14 02:41:17.366: %OSPF-4-DUP_RTRID_NBR: OSPF detected duplicate router-id 10.255.0.1 from 10.0.12.2 on interface GigabitEthernet0/1
*Nov 14 02:41:27.398: %OSPF-4-DUP_RTRID_NBR: OSPF detected duplicate router-id 10.255.0.1 from 10.0.12.2 on interface GigabitEthernet0/1
`),
      options: ['The new router at 10.0.12.2 reuses HPL-R1\'s router ID; give it a unique ID and clear its OSPF process', 'The new router has a duplicate IP address on Gi0/1, so the two routers reject each other\'s hellos outright', 'The OSPF process IDs on the two routers match, and OSPF requires them to differ between neighbors', 'HPL-R1 needs a higher priority on Gi0/1 so it can win the DR election against the new router'],
      answer: 0,
      explanation: 'Every OSPF router in a domain must have a unique router ID, because LSAs are identified by the ID of the router that originated them. The message says a neighbor at 10.0.12.2 is advertising 10.255.0.1, which is HPL-R1\'s own ID; this usually happens when a configuration is copied from another router, router-id line included. OSPF refuses the adjacency. Set a unique router-id on the new router and run clear ip ospf process. Interface addresses differ (10.0.12.2 is not R1\'s), process IDs can match or not without effect, and priority does not affect this.',
      ref: 'Lesson l3-4; card:ospf',
    },
    {
      id: 'q3-0084', obj: '3.4', type: 'single', difficulty: 3,
      stem: 'show ip ospf neighbor on HPL-R2 lists HPL-R1 in the INIT state, and the state never advances. What does INIT indicate?',
      options: ['HPL-R2 hears HPL-R1\'s hellos, but those hellos do not list HPL-R2, so HPL-R1 is not hearing HPL-R2', 'Both routers have finished exchanging their databases and are now waiting for the DR to confirm the adjacency', 'The routers are electing a DR and BDR and will move on once the election ends', 'HPL-R1 has OSPF priority 0, so it cannot move past INIT with any neighbor'],
      answer: 0,
      explanation: 'A router moves a neighbor to Init when it receives a hello from it, and to 2-Way only when that hello lists its own router ID, proving the other side hears it too. Stuck in Init means traffic flows one way only: R1\'s hellos arrive at R2, but R2\'s hellos are not reaching or being accepted by R1. Common causes are an inbound ACL on R1 that blocks OSPF (IP protocol 89) or multicast, or a one-way physical or Layer 2 problem. Database exchange happens later, in Exchange and Loading. DR election happens at 2-Way. Priority 0 does not stall the state machine.',
      ref: 'Lesson l3-4; card:ospf',
    },
    {
      id: 'q3-0085', obj: '3.4', type: 'multi', difficulty: 1, pick: 2,
      stem: 'Which two statements describe OSPFv2? (Choose two.)',
      options: ['It is a link-state protocol that runs Dijkstra\'s SPF algorithm on a database of LSAs', 'Its metric is cost, based on interface bandwidth', 'Its metric is hop count, with a maximum of 15 hops before a route is unreachable', 'It sends its full routing table to neighbors every 30 seconds', 'It is a Cisco-proprietary advanced distance vector protocol that uses DUAL'],
      answer: [0, 1],
      explanation: 'OSPF is an open-standard link-state protocol. Each router floods link-state advertisements describing its links, every router in an area builds the same link-state database, and each runs the SPF (Dijkstra) algorithm to compute its own shortest-path tree. The metric is cost, derived from reference bandwidth divided by interface bandwidth. Hop count with a 15-hop limit and full-table updates every 30 seconds describe RIP. EIGRP is the Cisco-originated advanced distance vector protocol.',
      ref: 'Lesson l3-4; card:dynrouting',
    },
    {
      id: 'q3-0086', obj: '3.4', type: 'single', difficulty: 1,
      stem: 'HPL-R1 runs router ospf 10 and its neighbor HPL-R2 runs router ospf 20. Both interfaces are in area 0 with matching timers and subnet. What happens?',
      options: ['They form a full adjacency, because the process ID is only locally significant', 'No adjacency forms until the process IDs match, because the process ID is carried in hellos', 'They form an adjacency but exchange no routes, since each process keeps its own database', 'The router with the lower process ID becomes the DR, regardless of priority'],
      answer: 0,
      explanation: 'The OSPF process ID identifies a process on the local router only. It is never carried in hellos, so neighbors with different process IDs become neighbors normally and exchange full routing information. Many networks use the same number everywhere simply for tidiness. What must match is the area, subnet, timers, authentication and stub settings. The DR is chosen by interface priority and router ID, not by process ID.',
      ref: 'Lesson l3-4; card:ospf',
    },
    {
      id: 'q3-0087', obj: '3.4', type: 'multi', difficulty: 3, pick: 2,
      stem: 'Refer to the exhibit. The DR on the 10.0.123.0/24 segment, 1.1.1.1, loses power. Which two statements describe what happens on that segment? (Choose two.)',
      exhibit: EX_NBR,
      options: ['2.2.2.2, the current BDR, takes over as DR without a new DR election', 'A new BDR is elected from the remaining routers by priority, then highest router ID', 'A full new election is held, and the BDR has no advantage', 'When 1.1.1.1 comes back, it takes the DR role again because its priority of 100 is the highest', 'The segment runs without a DR until 1.1.1.1 returns'],
      answer: [0, 1],
      explanation: 'The BDR exists for this moment: it already has full adjacencies with every router on the segment, so 2.2.2.2 becomes DR at once with no database resync. The remaining routers then elect a new BDR by priority, with highest router ID as the tie-breaker. When 1.1.1.1 returns it does not reclaim the role, even with priority 100, because DR elections are non-preemptive; it becomes a DROTHER until the DR or BDR fails or the OSPF process is cleared. The segment is never left without a DR while an eligible router remains.',
      ref: 'Lesson l3-4; card:ospf',
    },
    {
      id: 'q3-0088', obj: '3.4', type: 'single', difficulty: 2,
      stem: 'Which command shows, for each OSPF-enabled interface, its area, cost, state (such as DR, BDR, DROTHER or P2P) and neighbor count on one line?',
      options: ['show ip ospf interface brief', 'show ip ospf neighbor', 'show ip protocols', 'show ip ospf database'],
      answer: 0,
      explanation: 'show ip ospf interface brief prints one line per OSPF interface with the process ID, area, address and mask, cost, state and neighbor counts (full and total). It is the quickest way to spot an interface in the wrong area or one with no neighbors. show ip ospf neighbor lists neighbors and their states, not your interfaces\' costs. show ip protocols summarizes the router ID, network statements, passive interfaces and AD. show ip ospf database lists LSAs in the link-state database.',
      ref: 'Lesson l3-4; card:ospf',
    },
    {
      id: 'q3-0089', obj: '3.4', type: 'single', difficulty: 3,
      stem: 'Refer to the exhibit. HPL-R2 has no OSPF neighbor on Gi0/1, although HPL-R3 on the same link has the matching configuration in area 0. What is the cause?',
      exhibit: cli('HPL-R2', `
HPL-R2# show running-config | section router ospf
router ospf 1
 router-id 2.2.2.2
 passive-interface default
 no passive-interface GigabitEthernet0/0
 network 10.0.0.0 0.0.255.255 area 0
HPL-R2# show ip ospf interface brief
Interface    PID   Area            IP Address/Mask    Cost  State Nbrs F/C
Gi0/1        1     0               10.0.23.1/30       1     DR    0/0
Gi0/0        1     0               10.0.12.2/30       1     BDR   1/1
`),
      options: ['passive-interface default makes every interface passive, and Gi0/1 was never made non-passive', 'Gi0/1 is not covered by the network statement, so OSPF never runs on it', 'Gi0/1 is in the wrong area compared with HPL-R3', 'HPL-R2 is the DR on Gi0/1, so it does not need neighbors there and stops sending hellos to save bandwidth'],
      answer: 0,
      explanation: 'passive-interface default turns every interface passive, and you then enable hellos only where you want adjacencies with no passive-interface. Only Gi0/0 was exempted, so Gi0/1 advertises its subnet but sends no hellos and forms no neighbors. Notice it shows itself as DR with zero neighbors: a router alone on a segment elects itself. Add no passive-interface GigabitEthernet0/1. The network statement covers 10.0.x.x, which includes 10.0.23.1, and the area shown is 0, matching R3.',
      ref: 'Lesson l3-4; card:ospf',
    },
  );

  const EX_STBY = cli('HPL-GW1', `
HPL-GW1# show standby
GigabitEthernet0/0 - Group 10
  State is Standby
    4 state changes, last state change 00:31:12
  Virtual IP address is 10.1.10.1
  Active virtual MAC address is 0000.0c07.ac0a (MAC Not In Use)
    Local virtual MAC address is 0000.0c07.ac0a (v1 default)
  Hello time 3 sec, hold time 10 sec
    Next hello sent in 0.848 secs
  Preemption disabled
  Active router is 10.1.10.3, priority 100 (expires in 8.912 sec)
  Standby router is local
  Priority 150 (configured 150)
  Group name is "hsrp-Gi0/0-10" (default)
`);

  Q.push(
    /* ---- 3.5 First hop redundancy ---- */
    {
      id: 'q3-0090', obj: '3.5', type: 'single', difficulty: 1,
      stem: 'What problem does a first hop redundancy protocol such as HSRP solve?',
      options: ['Hosts have one default gateway; an FHRP lets several routers share a virtual gateway address so one failure does not strand them', 'It lets the routers on a segment share their routing tables with each other, so they converge faster after any link in the network fails', 'It load-balances traffic across the available WAN links by comparing routing metrics in real time on each router', 'It assigns a working default gateway to each host through DHCP whenever the current gateway fails'],
      answer: 0,
      explanation: 'A host is configured (statically or by DHCP) with one default gateway address and has no idea how to pick another if that router dies. HSRP, VRRP and GLBP solve this by having several routers present one virtual IP address and virtual MAC address. One router answers for them; if it fails, another takes over the same addresses within seconds, and the hosts never need to change anything. Sharing routes and choosing WAN paths are jobs for routing protocols. DHCP can hand out the virtual IP as the gateway, but it provides no redundancy.',
      ref: 'Lesson l3-5; card:fhrp',
    },
    {
      id: 'q3-0091', obj: '3.5', type: 'multi', difficulty: 3, pick: 2,
      stem: 'Refer to the exhibit. HPL-GW1 is configured with priority 150 so that it will be the active router, yet it is in the Standby state. Which two actions would make HPL-GW1 the active router? (Choose two.)',
      exhibit: EX_STBY,
      options: ['Configure standby 10 preempt on HPL-GW1', 'Reload 10.1.10.3 or briefly shut its Gi0/0, so HPL-GW1 takes over as active', 'Raise HPL-GW1\'s priority to 255 so it outranks every other router in the group', 'Configure standby 10 preempt on 10.1.10.3', 'Lower the priority on 10.1.10.3 to 90, below HPL-GW1\'s priority of 150', 'Change the hello and hold timers to 1 and 3 seconds'],
      answer: [0, 1],
      explanation: 'HSRP elects the highest priority as active only while roles are being decided. The output shows "Preemption disabled", so GW1 (150) waits behind 10.1.10.3 (100), which probably came up first. standby 10 preempt lets GW1 take over at once and keeps it in charge after future reboots. Failing the active router works too: the standby takes over when the hold timer expires, and without preempt on .3 it stays active when .3 returns, although that is the disruptive way. Without preempt on GW1, raising its priority or lowering .3\'s changes nothing. Preempt on .3 only affects .3. Timers change failover speed, not who is active.',
      ref: 'Lesson l3-5; card:fhrp',
    },
    {
      id: 'q3-0092', obj: '3.5', type: 'single', difficulty: 2,
      stem: 'Refer to the exhibit. Which MAC address will hosts on this VLAN have in their ARP cache for 10.1.10.1?',
      exhibit: EX_STBY,
      options: ['0000.0c07.ac0a', 'The burned-in MAC address of HPL-GW1\'s Gi0/0', 'The burned-in MAC address of 10.1.10.3', '0000.5e00.010a'],
      answer: 0,
      explanation: 'The active router answers ARP for the virtual IP with the virtual MAC, not with its own interface MAC. That is what allows failover without updating any host: the new active router takes over the same virtual MAC. HSRP version 1 builds the virtual MAC as 0000.0c07.acXX, where XX is the group number in hex; group 10 is 0x0a, giving 0000.0c07.ac0a. HSRP version 2 uses 0000.0c9f.fXXX. 0000.5e00.01XX is the VRRP format. Physical MACs are not used for the virtual gateway.',
      ref: 'Lesson l3-5; card:fhrp',
    },
    {
      id: 'q3-0093', obj: '3.5', type: 'match', difficulty: 2,
      stem: 'Match each description to the first hop redundancy protocol it fits best.',
      options: ['Cisco proprietary; one active and one standby router per group', 'Open standard (RFC 9568, which replaced RFC 5798); uses master and backup roles', 'Cisco proprietary; an AVG hands out different virtual MACs so several routers forward at once', 'Preemption is enabled by default'],
      targets: ['GLBP', 'VRRP', 'HSRP'],
      answer: [[0, 2], [1, 1], [2, 0], [3, 1]],
      explanation: 'HSRP is Cisco\'s original FHRP: one active router forwards, one standby waits, and preemption must be turned on manually. VRRP is the IETF standard, described for version 3 in RFC 9568 (2024), which replaced RFC 5798,; it calls the roles master and backup, multicasts advertisements to 224.0.0.18 and preempts by default. GLBP, also Cisco proprietary, adds load balancing: the active virtual gateway (AVG) answers ARP requests with the virtual MACs of up to four active virtual forwarders (AVFs) in turn, so hosts spread their traffic across several routers while sharing one gateway IP.',
      ref: 'Lesson l3-5; card:fhrp',
    },
    {
      id: 'q3-0094', obj: '3.5', type: 'multi', difficulty: 2, pick: 2,
      stem: 'Which two statements about HSRP are true? (Choose two.)',
      options: ['The default priority is 100, and the highest priority becomes active', 'If priorities tie, the router with the highest interface IP address becomes active', 'Preemption is enabled by default, so a higher-priority router takes over as soon as it comes up', 'Both routers forward traffic for the virtual IP at the same time, sharing the load equally', 'The virtual IP must be the address of one of the routers\' physical interfaces'],
      answer: [0, 1],
      explanation: 'HSRP priority ranges from 0 to 255 with a default of 100; the highest becomes active, and the highest interface IP address breaks ties. Preemption is off by default in HSRP, unlike VRRP. Only the active router forwards for a given group; to use both routers, administrators create several groups (for example per VLAN) with different active routers, or use GLBP. The virtual IP must be in the subnet but is normally a separate, unused address, not a physical interface address (VRRP is the protocol that allows using an owner\'s real address).',
      ref: 'Lesson l3-5; card:fhrp',
    },
    {
      id: 'q3-0095', obj: '3.5', type: 'single', difficulty: 1,
      stem: 'In an HSRP design, which address should hosts on the VLAN use as their default gateway?',
      options: ['The HSRP virtual IP address', 'The interface address of the active router', 'The interface address of the standby router', 'The multicast address 224.0.0.2'],
      answer: 0,
      explanation: 'The whole point of HSRP is that hosts point at the virtual IP, which follows whichever router is active. If hosts used the active router\'s real interface address, they would lose their gateway when that router failed, and the standby taking over the virtual IP would not help them. 224.0.0.2 is the all-routers multicast group that HSRP version 1 uses for its hello messages; it is never a gateway.',
      ref: 'Lesson l3-5; card:fhrp',
    },
    {
      id: 'q3-0096', obj: '3.5', type: 'single', difficulty: 2,
      stem: 'What are the default HSRP hello and hold timers?',
      options: ['Hello 3 seconds, hold 10 seconds', 'Hello 10 seconds, hold 40 seconds', 'Hello 1 second, hold 3 seconds', 'Hello 5 seconds, hold 15 seconds'],
      answer: 0,
      explanation: 'HSRP routers exchange hellos every 3 seconds by default, and a standby router declares the active router dead after 10 seconds without hearing it, then takes over. Timers can be tuned down to sub-second values with standby timers msec for faster failover. 10 and 40 are the OSPF hello and dead defaults on broadcast links, a common mix-up. VRRP sends advertisements every 1 second by default, which is not the same as HSRP either.',
      ref: 'Lesson l3-5; card:fhrp',
    },
    {
      id: 'q3-0097', obj: '3.5', type: 'single', difficulty: 3,
      stem: 'After a change window, show standby brief on both HSRP routers for VLAN 20 shows the local router as Active and the standby router as "unknown". Users report intermittent gateway problems. What is the most likely cause?',
      options: ['The routers are not hearing each other\'s hellos, for example because the VLAN or trunk between them is broken', 'Both routers have preemption enabled, so each one keeps taking the active role back from the other in turn', 'Both routers have the same priority, so neither can win the election and both stay active', 'The virtual IP is configured on both routers instead of only on the one that is supposed to be active for VLAN 20'],
      answer: 0,
      explanation: 'Two active routers means each has stopped hearing the other: each waits out the hold time, then declares itself active. Both then answer ARP for the virtual IP with the same virtual MAC from different places, and switches keep relearning that MAC on different ports, which causes exactly this kind of intermittent failure. Look for a VLAN missing from a trunk\'s allowed list, a pruned or shut link, an ACL blocking UDP 1985, or a group number or version mismatch. Preemption and equal priorities only influence which router wins while they can hear each other, and the virtual IP is supposed to be configured on both.',
      ref: 'Lesson l3-5; card:fhrp',
    },
    {
      id: 'q3-0098', obj: '3.5', type: 'single', difficulty: 2,
      stem: 'An administrator wants both distribution routers to forward user traffic for the same VLAN at the same time, using a single gateway IP address on the hosts. Which FHRP does this natively?',
      options: ['GLBP', 'HSRP version 2', 'VRRP', 'HSRP version 1'],
      answer: 0,
      explanation: 'GLBP was designed for this. The active virtual gateway answers each host\'s ARP request for the single virtual IP with a different virtual MAC, each owned by an active virtual forwarder, so different hosts send traffic to different routers. HSRP (either version) and VRRP elect one forwarding router per group; you can approximate load sharing with multiple groups and different gateway addresses for different hosts or VLANs, but not with one gateway address. HSRP version 2 adds IPv6 support, more group numbers (0 to 4095) and the multicast address 224.0.0.102, not load balancing.',
      ref: 'Lesson l3-5; card:fhrp',
    },
    {
      id: 'q3-0099', obj: '3.5', type: 'multi', difficulty: 3, pick: 2,
      stem: 'HPL-GW1 should be HSRP active for group 10 on Gi0/0 whenever it is up, and should take the role back after a reboot. HPL-GW2 uses the defaults. Which two commands on HPL-GW1\'s Gi0/0 meet the requirement? (Choose two.)',
      options: ['standby 10 priority 110', 'standby 10 preempt', 'standby 10 priority 90', 'standby 10 timers 10 40', 'standby version 1'],
      answer: [0, 1],
      explanation: 'GW1 must beat GW2\'s default priority of 100, so anything from 101 to 255 works, such as 110. On its own, a higher priority only matters during an election; after a reboot GW1 would find GW2 already active and wait as standby. standby 10 preempt lets it take the active role back as soon as it is up with the higher priority. Priority 90 would make GW1 lose. Changing timers to 10 and 40 only slows failover. Version 1 is already the default and has nothing to do with which router is active.',
      ref: 'Lesson l3-5; card:fhrp',
    },
    {
      id: 'q3-0100', obj: '3.5', type: 'single', difficulty: 2,
      stem: 'Which statement about VRRP is true?',
      options: ['It is an IETF standard, sends advertisements to 224.0.0.18 and uses virtual MACs 0000.5e00.01XX', 'It is Cisco proprietary, sends hellos on UDP port 1985 and uses virtual MACs 0000.0c07.acXX', 'It requires a separate gateway address for every router in the group, and the hosts are given all of them', 'It elects an active virtual gateway that load-balances with several forwarders'],
      answer: 0,
      explanation: 'VRRP is the open-standard FHRP, so it works between vendors. Its advertisements go to multicast 224.0.0.18 as IP protocol 112, and the virtual MAC is 0000.5e00.01XX, where XX is the virtual router ID in hex. UDP 1985 is HSRP. All routers in a VRRP group share one virtual IP, which hosts use as their single gateway. The AVG and AVF roles belong to GLBP.',
      ref: 'Lesson l3-5; card:fhrp',
    },

    /* ---- 3.1 more ---- */
    {
      id: 'q3-0101', obj: '3.1', type: 'single', difficulty: 2,
      stem: 'A router shows: S 10.77.0.0/16 [5/0] via 10.0.9.2. What can you conclude?',
      options: ['An administrator configured the static route with an administrative distance of 5', 'The route is 5 hops away from the router', 'The route was learned from EIGRP and redistributed, which is why its first value is 5', 'The route has a metric of 5 and an AD of 0'],
      answer: 0,
      explanation: 'A normal static route displays [1/0]: AD 1 and metric 0. A first value of 5 means someone appended an AD to the command, for example ip route 10.77.0.0 255.255.0.0 10.0.9.2 5, usually to make it a floating static that a lower-AD static to the same prefix can override. Static routes have no hop count, and their metric is 0, which is the second number. The code S shows it is static; redistributed EIGRP routes would appear with D EX on other routers.',
      ref: 'Lesson l3-1; card:static',
    },
    {
      id: 'q3-0102', obj: '3.1', type: 'multi', difficulty: 3, pick: 2,
      stem: 'Refer to the exhibit. Which two statements are true? (Choose two.)',
      exhibit: EX_BR,
      options: ['The router has three interfaces up on 172.16.0.0/29', 'Traffic to 172.16.70.1 is sent to 172.16.0.2', 'Traffic to 8.8.8.8 is sent to 172.16.0.1', 'The default route was configured with ip route 0.0.0.0 0.0.0.0 172.16.0.1', 'Traffic to 172.16.200.1 is dropped because no specific route matches'],
      answer: [1, 2],
      explanation: '172.16.64.0/18 covers 172.16.64.0 through 172.16.127.255, so 172.16.70.1 matches it and goes to 172.16.0.2. 8.8.8.8 matches only the default route, whose next hop (the gateway of last resort) is 172.16.0.1. There is only one C/L pair on Gi0/0, so the router has a single interface on 172.16.0.0/29; the other neighbors are other routers on that segment. The default was learned through OSPF (O*E2), not configured as a static. 172.16.200.1 is not in the /18, but the default route catches it, so it is forwarded, not dropped.',
      ref: 'Lesson l3-1; card:rtable',
    },
    {
      id: 'q3-0103', obj: '3.1', type: 'single', difficulty: 1,
      stem: 'What does an asterisk (*) next to a route code, as in S* or O*E2, indicate?',
      options: ['The route is a candidate default route', 'The route is being used for equal-cost load balancing', 'The route was learned in the last minute', 'The route is a backup that is not currently used'],
      answer: 0,
      explanation: 'The legend at the top of show ip route says "* - candidate default". It marks routes that can serve as the gateway of last resort, almost always 0.0.0.0/0. Older IOS versions also placed an asterisk in front of the next hop used for the next packet in per-packet load sharing, but next to the code it means candidate default. Recency shows in the age timer. Backup routes that are not in use, such as floating statics, do not appear in the routing table at all.',
      ref: 'Lesson l3-1; card:rtable',
    },
    {
      id: 'q3-0104', obj: '3.1', type: 'single', difficulty: 2,
      stem: 'Which routing table component tells the router how many bits of the destination address must match the route?',
      options: ['The prefix length (network mask)', 'The administrative distance', 'The metric', 'The next-hop address'],
      answer: 0,
      explanation: 'The prefix length, such as /24, or the equivalent mask 255.255.255.0, says how many leading bits of a destination address must equal the route\'s network address. It is the basis of longest-prefix matching: the more bits a route requires, the more specific it is. AD ranks the trustworthiness of a source, the metric ranks paths within one protocol, and the next hop says where to send matching packets. None of those decide whether a packet matches the route in the first place.',
      ref: 'Lesson l3-1; card:rtable',
    },
    {
      id: 'q3-0105', obj: '3.1', type: 'single', difficulty: 3,
      stem: 'Refer to the exhibit. An engineer wants to know whether OSPF is offering a route to 10.10.20.0/24 that HPL-CORE is not using. Which statement is true?',
      exhibit: cli('HPL-CORE', `
HPL-CORE# show ip route 10.10.20.0 255.255.255.0
Routing entry for 10.10.20.0/24
  Known via "eigrp 100", distance 90, metric 3072, type internal
  Redistributing via eigrp 100
  Last update from 10.0.13.3 on GigabitEthernet0/2, 00:02:10 ago
  Routing Descriptor Blocks:
  * 10.0.13.3, from 10.0.13.3, 00:02:10 ago, via GigabitEthernet0/2
      Route metric is 3072, traffic share count is 1
      Total delay is 20 microseconds, minimum bandwidth is 1000000 Kbit
`),
      options: ['Only the winning source is installed; an OSPF /24 would lose on AD (110 vs 90) and stay in the OSPF database', 'OSPF cannot be offering the route, or it would be listed as a second routing descriptor block under the same /24 entry', 'OSPF\'s route would be installed alongside it, because OSPF uses a different metric and both can coexist', 'EIGRP won because its metric of 3072 is lower than OSPF\'s cost, and the lower metric always wins'],
      answer: 0,
      explanation: 'The routing table holds only the best source per prefix. Internal EIGRP (AD 90) beats OSPF (AD 110), so an OSPF route to the same /24 would stay in OSPF\'s link-state database and would only be installed if the EIGRP route disappeared. To see it, look at show ip ospf database or check the routing table after the EIGRP path fails. Multiple descriptor blocks appear only for equal-cost paths from the same source. Routes from different protocols are never installed together, and metrics are not compared across protocols.',
      ref: 'Lesson l3-1; card:rtable',
    },
  );

  /* =====================================================================
   * 4.0 IP SERVICES
   * ===================================================================== */
  const EX_NAT = cli('HPL-EDGE', `
HPL-EDGE# show ip nat translations
Pro  Inside global         Inside local          Outside local         Outside global
icmp 203.0.113.2:7         192.168.50.11:7       198.51.100.10:7       198.51.100.10:7
tcp  203.0.113.2:1031      192.168.50.12:51544   192.0.2.80:443        192.0.2.80:443
tcp  203.0.113.2:1032      192.168.50.13:51544   192.0.2.80:443        192.0.2.80:443
---  203.0.113.20          192.168.50.20         ---                   ---
`);

  Q.push(
    /* ---- 4.1 NAT ---- */
    {
      id: 'q4-0001', obj: '4.1', type: 'match', difficulty: 2,
      stem: 'A PC at 192.168.50.12 browses to a web server at 192.0.2.80 through a router that translates the PC to 203.0.113.2. Match each NAT term to its address in this flow.',
      options: ['Inside local', 'Inside global', 'Outside global', 'Outside local'],
      targets: ['192.0.2.80, as the outside host is known on the internet', '192.168.50.12', '203.0.113.2', '192.0.2.80, as the outside host appears to inside hosts'],
      answer: [[0, 1], [1, 2], [2, 0], [3, 3]],
      explanation: 'Inside and outside say which side of the NAT router the host lives on; local and global say from whose point of view the address is seen (local is the inside network\'s view, global the outside world\'s). The PC\'s real private address is the inside local, and the public address it is translated to is the inside global. The server\'s real address is the outside global. Because inside source NAT does not translate the outside host, its outside local is the same 192.0.2.80. Outside local only differs when destination NAT is in use, which is rare and beyond CCNA scope.',
      ref: 'Lesson l4-1; card:nat',
    },
    {
      id: 'q4-0002', obj: '4.1', type: 'single', difficulty: 2,
      stem: 'Refer to the exhibit. Which statement about the translations on HPL-EDGE is true?',
      exhibit: EX_NAT,
      options: ['Hosts .12 and .13 both use 203.0.113.2 and are kept apart by different inside global port numbers', 'Two hosts cannot share 203.0.113.2 at the same time, so one of the two TCP sessions will fail', '203.0.113.20 is a dynamic pool address that is currently in use by inside host 192.168.50.20', 'The web server sees the traffic arriving from 192.168.50.12 and 192.168.50.13 as their real source addresses'],
      answer: 0,
      explanation: 'This is PAT (overload). Hosts .12 and .13 happened to choose the same source port, 51544, so the router rewrote them to different ports on the shared address, 1031 and 1032, which lets it match return traffic to the right host. Thousands of flows can share one inside global address this way. The line with --- in the protocol and outside columns is a static NAT entry, a permanent one-to-one mapping, not a dynamic pool address. The web server only ever sees 203.0.113.2, never the private inside local addresses.',
      ref: 'Lesson l4-1; card:nat',
    },
    {
      id: 'q4-0003', obj: '4.1', type: 'single', difficulty: 3,
      stem: 'Refer to the exhibit. Users report that the first six people to log in each morning reach the internet but later users cannot. What is the cause?',
      exhibit: cli('HPL-EDGE', `
HPL-EDGE# show running-config | include nat
 ip nat inside
 ip nat outside
ip nat pool HPL-PUB 203.0.113.41 203.0.113.46 netmask 255.255.255.248
ip nat inside source list 10 pool HPL-PUB
HPL-EDGE# show ip nat statistics | include pool|Misses|Total
Total active translations: 6 (0 static, 6 dynamic; 0 extended)
Hits: 41228  Misses: 1873
 pool HPL-PUB: netmask 255.255.255.248
        start 203.0.113.41 end 203.0.113.46
        type generic, total addresses 6, allocated 6 (100%), misses 1873
`),
      options: ['Without overload, dynamic NAT gives each host its own pool address and all six are taken; overload would let hosts share', 'The NAT ACL permits only six hosts, so every host after the sixth fails to match and is sent untranslated', 'The pool netmask is wrong and hides the rest of the pool, so only six of the configured addresses can ever be handed out', 'The inside and outside interfaces are reversed, so translations are built only for the first few sessions'],
      answer: 0,
      explanation: 'Without the overload keyword, dynamic NAT maps one inside local address to one inside global address for as long as the translation lives. The pool has six addresses, all six are allocated, and misses keep climbing: every additional host is refused until a translation times out. Appending overload (ip nat inside source list 10 pool HPL-PUB overload) turns on PAT, and every host can share the pool addresses using ports. An ACL matches address ranges, not a host count. The /29 netmask is consistent with .41 to .46. If the interfaces were reversed, nobody would be translated, including the first six.',
      ref: 'Lesson l4-1; card:nat',
    },
    {
      id: 'q4-0004', obj: '4.1', type: 'multi', difficulty: 2, pick: 2,
      stem: 'Which two statements about static NAT are true? (Choose two.)',
      options: ['It creates a permanent one-to-one mapping between an inside local and an inside global address', 'It lets outside hosts start connections to the inside host using the inside global address', 'It requires an ACL to select which inside hosts are translated to the global address', 'It lets many inside hosts share one public address using port numbers', 'Its entries are removed by clear ip nat translation * and rebuilt when traffic next flows'],
      answer: [0, 1],
      explanation: 'ip nat inside source static local global builds a mapping that exists whether or not traffic flows, which is why it suits servers that must be reachable from outside: an outside host aims at the inside global, and the router translates the destination to the inside local. No ACL is involved; ACLs select traffic for dynamic NAT and PAT. Sharing one address across many hosts is PAT. clear ip nat translation * clears only dynamic entries; static entries stay until the command is removed.',
      ref: 'Lesson l4-1; card:nat',
    },
    {
      id: 'q4-0005', obj: '4.1', type: 'single', difficulty: 2,
      stem: 'Which command shows how many NAT translations are active, the hit and miss counters, and which interfaces are inside and outside?',
      options: ['show ip nat statistics', 'show ip nat translations', 'show ip interface brief', 'debug ip nat detailed'],
      answer: 0,
      explanation: 'show ip nat statistics summarizes NAT: total active translations (static, dynamic and extended), the inside and outside interfaces, hits and misses, and pool usage. It is the quickest way to spot reversed interface roles or an exhausted pool. show ip nat translations lists the individual entries, which is great for checking a particular host but does not show the interface roles. show ip interface brief knows nothing about NAT. debug ip nat shows translations as they happen, but it is noisy and risky on a busy router.',
      ref: 'Lesson l4-1; card:nat',
    },

    /* ---- 4.2 NTP ---- */
    {
      id: 'q4-0006', obj: '4.2', type: 'multi', difficulty: 3, pick: 2,
      stem: 'Refer to the exhibit. Which two statements about HPL-BRANCH are true? (Choose two.)',
      exhibit: cli('HPL-BRANCH', `
HPL-BRANCH# show ntp status
Clock is synchronized, stratum 3, reference is 10.0.12.1
nominal freq is 250.0000 Hz, actual freq is 249.9990 Hz, precision is 2**10
ntp uptime is 1209500 (1/100 of seconds), resolution is 4000
reference time is E8A1B2C3.1A2B3C4D (02:44:19.102 EST Sat Nov 14 2026)
clock offset is -0.4120 msec, root delay is 2.31 msec
root dispersion is 8.47 msec, peer dispersion is 0.98 msec
`),
      options: ['It is synchronized to 10.0.12.1, which is a stratum 2 source', 'A device that synchronizes to HPL-BRANCH would run at stratum 4', 'It is configured with ntp master and is the reference for the network', 'It is not synchronized, because the clock offset is not zero', 'It exchanges time with 10.0.12.1 over TCP port 123'],
      answer: [0, 1],
      explanation: 'Stratum counts the distance from an authoritative clock: a device always runs one stratum higher than the source it synchronizes to. HPL-BRANCH is stratum 3 with reference 10.0.12.1, so 10.0.12.1 is stratum 2, and a client of HPL-BRANCH would be stratum 4. A synchronized IOS device serves time to others automatically. An NTP master would show its own local clock (127.127.1.1) as the reference. A sub-millisecond offset is normal; "Clock is synchronized" settles that question. NTP uses UDP 123, not TCP.',
      ref: 'Lesson l4-2; card:ntp',
    },
    {
      id: 'q4-0007', obj: '4.2', type: 'single', difficulty: 2,
      stem: 'A lab router has no path to any external time source, but the lab switches must agree on time. Which command makes the router serve its own clock as the reference, and at what stratum by default?',
      options: ['ntp master, stratum 8', 'ntp server 127.0.0.1, stratum 1', 'ntp peer, stratum 16', 'ntp master, stratum 1'],
      answer: 0,
      explanation: 'ntp master tells IOS to treat its internal clock as authoritative and serve it to clients. With no number it advertises stratum 8, a deliberately mediocre value so that clients prefer any real source; you can give a value such as ntp master 3. Set the clock first with clock set. Pointing ntp server at a loopback address does not create a time source. ntp peer creates a symmetric association with another device that can sync in either direction. Stratum 16 means unsynchronized, and stratum 1 belongs to devices attached directly to a reference clock such as GPS.',
      ref: 'Lesson l4-2; card:ntp',
    },
    {
      id: 'q4-0008', obj: '4.2', type: 'multi', difficulty: 1, pick: 2,
      stem: 'Which two statements about NTP are true? (Choose two.)',
      options: ['It uses UDP port 123', 'Lower stratum numbers are closer to an authoritative time source', 'It uses TCP port 123 for reliable delivery', 'Stratum 0 is the value shown by unsynchronized devices', 'A Cisco router can be an NTP client or server, but never both'],
      answer: [0, 1],
      explanation: 'NTP runs over UDP 123; it measures delay and offset itself and does not need TCP\'s retransmissions. Stratum 0 is the reference clock itself (GPS, atomic clock), stratum 1 servers attach to it, and each hop adds one, so lower is closer to the truth. Unsynchronized devices report stratum 16. A router that synchronizes from an upstream server automatically serves time to downstream clients, so it is both client and server at once, which is exactly how hierarchical NTP designs work.',
      ref: 'Lesson l4-2; card:ntp',
    },
    {
      id: 'q4-0009', obj: '4.2', type: 'single', difficulty: 3,
      stem: 'During an incident review, syslog messages from three routers cannot be lined up because their timestamps differ by several minutes. All three log to the same syslog server. What is the best long-term fix?',
      options: ['Make every device an NTP client of the same reliable source, and add service timestamps log datetime msec', 'Set each router\'s clock manually with clock set every week, and also add service timestamps log datetime msec', 'Configure ntp master on every router so that each one serves accurate time to the syslog server', 'Have the syslog server rewrite each message\'s timestamp with its own clock when the message arrives'],
      answer: 0,
      explanation: 'Correlating events across devices needs clocks that agree. NTP from a common, trusted source keeps every device within milliseconds of the others, and service timestamps log datetime msec stamps each message with the date and time down to milliseconds instead of uptime. Manual clock set drifts again and does not scale. ntp master on every router would make each trust its own drifting clock, the opposite of agreement. Arrival time at the server is skewed by queuing and transit delay, and it hides when the event really happened on the device.',
      ref: 'Lesson l4-2; card:ntp',
    },

    /* ---- 4.3 DHCP and DNS ---- */
    {
      id: 'q4-0010', obj: '4.3', type: 'order', difficulty: 1,
      stem: 'Put the DHCP messages in the order they are exchanged when a client gets a new address.',
      options: ['Request', 'Offer', 'Acknowledgment', 'Discover'],
      answer: [3, 1, 0, 2],
      explanation: 'DORA: the client broadcasts a Discover because it has no address and does not know where the servers are. Servers reply with an Offer of an address and options. The client broadcasts a Request for one offer, which also tells any other servers their offers were declined. The chosen server confirms with an Acknowledgment, and the client starts using the address. The client uses UDP port 68 and the server UDP port 67. A NAK instead of the ACK means the server refused, for example because the client asked for an address from the wrong subnet.',
      ref: 'Lesson l4-3; card:dhcp',
    },
    {
      id: 'q4-0011', obj: '4.3', type: 'match', difficulty: 2,
      stem: 'Match each DNS record type to what it holds.',
      options: ['A', 'AAAA', 'CNAME', 'MX', 'PTR'],
      targets: ['An alias that points to another hostname', 'A hostname for an IP address (reverse lookup)', 'An IPv6 address for a hostname', 'The mail server for a domain', 'An IPv4 address for a hostname'],
      answer: [[0, 4], [1, 2], [2, 0], [3, 3], [4, 1]],
      explanation: 'An A record maps a name to an IPv4 address, and AAAA (four times the bits, hence quad A) maps a name to an IPv6 address. CNAME makes one name an alias of another, such as www pointing at a hosting provider\'s name. MX lists the mail exchangers for a domain, with preference values. PTR records live in the reverse zones (in-addr.arpa and ip6.arpa) and map an address back to a name, which is what you see when traceroute shows names. DNS queries normally use UDP 53 and fall back to TCP 53 for large responses and zone transfers.',
      ref: 'Lesson l4-3; card:dns',
    },
    {
      id: 'q4-0012', obj: '4.3', type: 'single', difficulty: 2,
      stem: 'Which set of commands makes a Cisco router a DHCP server for 10.40.0.0/24, keeps .1 to .20 for static devices, and gives clients a gateway and DNS server?',
      options: [
        'ip dhcp excluded-address 10.40.0.1 10.40.0.20, then ip dhcp pool LAN40 with network 10.40.0.0 255.255.255.0, default-router 10.40.0.1 and dns-server 10.40.0.53',
        'ip dhcp pool LAN40 with range 10.40.0.21 10.40.0.254, gateway 10.40.0.1 and dns 10.40.0.53',
        'ip helper-address 10.40.0.1 on the LAN interface, then ip dhcp pool LAN40',
        'ip dhcp excluded-address 10.40.0.21 10.40.0.254, then ip dhcp pool LAN40 with network 10.40.0.0 0.0.0.255, default-router 10.40.0.1 and dns-server 10.40.0.53',
      ],
      answer: 0,
      explanation: 'IOS hands out every address in the pool\'s network except those excluded, so you exclude the static block globally with ip dhcp excluded-address 10.40.0.1 10.40.0.20. Inside ip dhcp pool, network sets the subnet (with a subnet mask or prefix length, not a wildcard), default-router sets the gateway and dns-server the DNS server; lease changes the default one-day lease. IOS pools have no range, gateway or dns subcommands. ip helper-address is for relaying to a server elsewhere, not for a local server. Excluding .21 to .254 would leave only the addresses you wanted to keep.',
      ref: 'Lesson l4-3; card:dhcp',
    },
    {
      id: 'q4-0013', obj: '4.3', type: 'single', difficulty: 2,
      stem: 'Every time an administrator mistypes a command at the router prompt, the router hangs for several seconds with "Translating...domain server (255.255.255.255)". Which command stops this?',
      options: ['no ip domain-lookup', 'no ip name-server', 'ip dns server', 'no service dhcp'],
      answer: 0,
      explanation: 'With ip domain-lookup on (the default), IOS treats an unknown word at the EXEC prompt as a hostname to Telnet to and tries to resolve it. With no name server configured it broadcasts the query to 255.255.255.255 and waits for a timeout. no ip domain-lookup turns name resolution off. Removing name servers only changes where the query goes. ip dns server makes the router answer DNS queries for others. no service dhcp disables the DHCP server and relay functions, which is unrelated.',
      ref: 'Lesson l4-3; card:dns',
    },
    {
      id: 'q4-0014', obj: '4.3', type: 'single', difficulty: 3,
      stem: 'A user can reach a partner portal by typing https://198.51.100.44 but not https://portal.partner.example. Ping to 198.51.100.44 also works. What is the most likely problem?',
      options: ['Name resolution: the PC\'s DNS server is wrong, unreachable or lacks a record for the name', 'The PC\'s default gateway is wrong, so traffic to the portal\'s subnet is not being routed out', 'The partner portal is blocking the user\'s IP address at its firewall for HTTPS requests', 'The PC has an APIPA address, so it can reach only some destinations outside its subnet'],
      answer: 0,
      explanation: 'Reaching the server by IP address proves that routing, the default gateway and the server itself are fine; the difference is that the name must first be turned into an address. That points to DNS: check the DNS server setting with ipconfig /all, test with nslookup portal.partner.example, and confirm UDP 53 to the DNS server is allowed. A wrong gateway would break the IP address test too. A block on the user\'s address would also affect the direct IP connection. An APIPA (169.254.x.x) address would break access to any off-subnet address.',
      ref: 'Lesson l4-3; card:dns',
    },

    /* ---- 4.4 SNMP ---- */
    {
      id: 'q4-0015', obj: '4.4', type: 'single', difficulty: 1,
      stem: 'Which UDP ports does SNMP use by default?',
      options: ['161 for requests to agents, 162 for traps and informs to the manager', '161 for traps and informs to the manager, 162 for polling the agents', '514 for both requests to agents and traps to the manager', '69 for Get and GetNext requests, and 123 for Set requests and traps'],
      answer: 0,
      explanation: 'The SNMP manager (the network management station) polls agents on managed devices at UDP 161 with Get, GetNext, GetBulk and Set requests. Agents send unsolicited notifications, traps and informs, to the manager at UDP 162. 514 is syslog, 69 is TFTP and 123 is NTP, all common distractors in port questions.',
      ref: 'Lesson l4-4; card:snmp',
    },
    {
      id: 'q4-0016', obj: '4.4', type: 'match', difficulty: 2,
      stem: 'Match each SNMP message to its description.',
      options: ['Get', 'Set', 'Trap', 'Inform', 'GetBulk'],
      targets: ['Agent notifies the manager and expects an acknowledgment', 'Manager changes a value on the agent', 'Manager retrieves many values in one request (SNMPv2c and later)', 'Manager reads a value from the agent', 'Agent notifies the manager without acknowledgment'],
      answer: [[0, 3], [1, 1], [2, 4], [3, 0], [4, 2]],
      explanation: 'Get and GetNext let the manager read objects from the agent\'s MIB, identified by OIDs, and GetBulk, added in SNMPv2, retrieves large tables efficiently. Set writes a value, for example to shut an interface, which is why read-write access needs tight control. Traps are fire-and-forget notifications such as linkDown: if the packet is lost, the manager never knows. Informs, also added in v2, are acknowledged notifications that the agent resends until the manager confirms receipt.',
      ref: 'Lesson l4-4; card:snmp',
    },
    {
      id: 'q4-0017', obj: '4.4', type: 'single', difficulty: 2,
      stem: 'Security policy requires that SNMP traffic be both authenticated and encrypted. Which choice meets the requirement?',
      options: ['SNMPv3 with the authPriv security level', 'SNMPv2c with a long community string', 'SNMPv3 with the authNoPriv security level', 'SNMPv1 with a read-only community'],
      answer: 0,
      explanation: 'SNMPv3 replaces community strings with users and offers three security levels: noAuthNoPriv (username only), authNoPriv (authenticated with HMAC, not encrypted) and authPriv (authenticated and encrypted, for example with AES). Only authPriv meets both requirements. SNMPv1 and v2c send their community strings in clear text, so a long string still crosses the network readable by anyone capturing packets, and read-only does not change that. authNoPriv protects integrity but leaves the data readable.',
      ref: 'Lesson l4-4; card:snmp',
    },
    {
      id: 'q4-0018', obj: '4.4', type: 'single', difficulty: 2,
      stem: 'What is a MIB in SNMP?',
      options: ['A structured database of objects, each identified by an OID, that an agent exposes to managers', 'The software process that runs on each managed device and answers the requests sent by the manager', 'The encrypted channel that SNMPv3 builds between the manager and each agent', 'The central server that collects traps and informs sent by the agents'],
      answer: 0,
      explanation: 'The Management Information Base defines the variables a device exposes, such as interface counters, CPU load and system name, arranged in a tree. Each object has an object identifier (OID), a dotted number such as 1.3.6.1.2.1.1.5 for sysName, and managers read or set objects by OID. The software on the device is the agent. The collector is the NMS or SNMP manager. SNMPv3 security comes from its user-based security model, not from the MIB.',
      ref: 'Lesson l4-4; card:snmp',
    },
    {
      id: 'q4-0019', obj: '4.4', type: 'multi', difficulty: 3, pick: 2,
      stem: 'A network team wants the NMS to learn about interface failures within seconds instead of waiting for the next 5-minute poll, and wants confirmation that each notification arrived. Which two items are needed? (Choose two.)',
      options: ['Configure the routers to send SNMP informs to the NMS', 'Use SNMPv2c or SNMPv3, because informs do not exist in SNMPv1', 'Shorten the polling interval to 10 seconds with Get requests', 'Send traps over TCP 162', 'Configure the NMS to send Set requests when links fail'],
      answer: [0, 1],
      explanation: 'Notifications are pushed by the agent the moment an event occurs, so they solve the waiting-for-the-poll problem, and informs add acknowledgment: the agent retries until the manager confirms. Informs were introduced in SNMPv2, so the devices must run v2c or v3. Polling every 10 seconds burns CPU and bandwidth and still lags behind events. SNMP notifications use UDP 162, not TCP. Set requests change device values; they do not report events.',
      ref: 'Lesson l4-4; card:snmp',
    },

    /* ---- 4.5 Syslog ---- */
    {
      id: 'q4-0020', obj: '4.5', type: 'order', difficulty: 2,
      stem: 'Put the syslog severity levels in order from most severe (level 0) to least severe (level 7).',
      options: ['Warning', 'Alert', 'Debugging', 'Error', 'Emergency', 'Informational', 'Critical', 'Notification'],
      answer: [4, 1, 6, 3, 0, 7, 5, 2],
      explanation: 'The eight levels are 0 emergency (system unusable), 1 alert (immediate action needed), 2 critical, 3 error, 4 warning, 5 notification (normal but significant, such as a line protocol changing state), 6 informational and 7 debugging. A common memory aid is "Even After Coffee, Everyone Wants Naps In December". IOS keywords are plural in places: emergencies, alerts, critical, errors, warnings, notifications, informational and debugging. Lower numbers are more severe.',
      ref: 'Lesson l4-5; card:syslog',
    },
    {
      id: 'q4-0021', obj: '4.5', type: 'multi', difficulty: 3, pick: 2,
      stem: 'Refer to the exhibit. The router is configured with logging host 10.0.0.50 and logging trap warnings. Which two statements are true? (Choose two.)',
      exhibit: cli('HPL-CORE', `
*Nov 15 03:12:07.441: %LINEPROTO-5-UPDOWN: Line protocol on Interface GigabitEthernet0/1, changed state to down
`),
      options: ['The facility is LINEPROTO, the severity is 5 (notification) and the mnemonic is UPDOWN', 'This message is not sent to the syslog server at 10.0.0.50', 'Severity 5 is more severe than an error message, so it is always sent to the server', 'The asterisk means the message was delivered to the syslog server', 'UPDOWN is the facility, LINEPROTO is the mnemonic and 5 is the warning level'],
      answer: [0, 1],
      explanation: 'IOS messages follow %FACILITY-SEVERITY-MNEMONIC: description, so LINEPROTO is the facility, 5 the severity (notification) and UPDOWN the event name. logging trap warnings sends level 4 and everything more severe (0 to 4) to the server, so a level 5 message stays local; logging trap notifications or a lower threshold would include it. Lower numbers are more severe, so 5 is less severe than error (3) and warning (4). The leading asterisk means the clock is not authoritative, typically because it is not synchronized to NTP; it says nothing about delivery.',
      ref: 'Lesson l4-5; card:syslog',
    },
    {
      id: 'q4-0022', obj: '4.5', type: 'single', difficulty: 2,
      stem: 'A router is configured with logging host 10.0.0.50 and logging trap warnings. Which messages reach the syslog server?',
      options: ['Severity 0 through 4', 'Severity 4 only', 'Severity 4 through 7', 'All severities, with warnings marked'],
      answer: 0,
      explanation: 'A logging level acts as a threshold: the device sends messages at that severity and everything more severe, meaning numerically lower. warnings is level 4, so levels 0 (emergencies) through 4 (warnings) are sent, while notifications (5), informational (6) and debugging (7) are not. The default logging trap level is informational (6). Interface up and down notifications at level 5 would therefore not reach this server, which is a common surprise.',
      ref: 'Lesson l4-5; card:syslog',
    },
    {
      id: 'q4-0023', obj: '4.5', type: 'single', difficulty: 3,
      stem: 'An administrator connected by SSH runs debug ip ospf adj but sees no debug output, although the console shows it. What should the administrator do?',
      options: ['Run terminal monitor in the SSH session', 'Configure logging console debugging', 'Configure logging buffered informational', 'Configure logging trap debugging'],
      answer: 0,
      explanation: 'Log messages, including debug output, go to the console by default, but not to VTY sessions such as SSH or Telnet. terminal monitor (an EXEC command, per session) copies log messages to the current remote session, subject to the logging monitor level, which defaults to debugging. logging console controls the console, which already works. logging buffered sends messages to a RAM buffer you can read with show logging, and logging trap sets the level sent to syslog servers. Neither shows messages live in the SSH session.',
      ref: 'Lesson l4-5; card:syslog',
    },
    {
      id: 'q4-0024', obj: '4.5', type: 'multi', difficulty: 2, pick: 2,
      stem: 'Which two statements about syslog on Cisco devices are true? (Choose two.)',
      options: ['Messages are normally sent to a syslog server over UDP port 514', 'show logging displays the messages held in the local logging buffer', 'Syslog servers poll each device for new messages at a configured interval', 'Severity 7 messages are the most urgent and are sent before all others', 'Messages are encrypted by default with TLS on their way to the server'],
      answer: [0, 1],
      explanation: 'Devices push messages to a syslog server, classically over UDP 514, which is unreliable and unencrypted (secure transports exist but are not the default). show logging shows the logging settings and the contents of the buffer filled by logging buffered. Syslog is push-based; polling is the SNMP model. Severity 7 is debugging, the least urgent; 0 (emergency) is the most urgent.',
      ref: 'Lesson l4-5; card:syslog',
    },

    /* ---- 4.6 DHCP client and relay ---- */
    {
      id: 'q4-0025', obj: '4.6', type: 'multi', difficulty: 2, pick: 2,
      stem: 'An engineer enters ip address dhcp on Gi0/1, which faces an ISP. The ISP\'s DHCP server grants a lease and offers a default router. Which two statements are true? (Choose two.)',
      options: ['Gi0/1 takes the address and mask from the lease', 'IOS installs a static default route toward the offered gateway with administrative distance 254', 'IOS installs the default route with administrative distance 1, so it overrides any other default', 'The router starts relaying its LAN clients\' DHCP requests to the ISP', 'The router becomes a DHCP server for the WAN subnet'],
      answer: [0, 1],
      explanation: 'ip address dhcp in interface configuration makes the interface a DHCP client: it sends a Discover, accepts the lease and configures the leased address and mask. When the offer includes a default router, IOS adds a static default route toward it with AD 254, so a manually configured default (AD 1) or one from a routing protocol would win. show dhcp lease shows the lease details. Relaying LAN clients needs ip helper-address on the LAN interface, and serving addresses needs an ip dhcp pool; neither is created by this command.',
      ref: 'Lesson l4-6; card:dhcp',
    },
    {
      id: 'q4-0026', obj: '4.6', type: 'single', difficulty: 2,
      stem: 'A router relays DHCP for a client LAN with ip helper-address. How does the DHCP server know which pool to assign from?',
      options: ['From the giaddr field, which the relay sets to the address of the interface where it received the request', 'From the client\'s MAC address, which the server looks up in a table of known subnets', 'From the source port of the relayed packet, which the relay sets per receiving interface', 'From the VLAN tag on the relayed frame, which the relay keeps when it forwards the request on to the server'],
      answer: 0,
      explanation: 'When the relay agent forwards the client\'s broadcast to the server as a unicast, it writes its receiving interface address into the gateway IP address field (giaddr). The server picks the pool whose subnet contains that address and sends its reply back to the relay, which delivers it to the client. That is how one central server serves many subnets. A MAC address only matters for reservations. Port numbers stay 67 and 68. VLAN tags do not cross a routed hop.',
      ref: 'Lesson l4-6; card:dhcp',
    },
    {
      id: 'q4-0027', obj: '4.6', type: 'single', difficulty: 3,
      stem: 'Refer to the exhibit. Clients on VLAN 30 get 169.254 addresses. The DHCP server at 10.99.0.10 has a 10.30.0.0/24 pool and can ping 10.30.0.1. What is wrong?',
      exhibit: cli('HPL-DIST1', `
HPL-DIST1# show running-config interface vlan 30
interface Vlan30
 ip address 10.30.0.1 255.255.255.0
 ip helper-address 10.30.0.10
HPL-DIST1# show running-config interface vlan 99
interface Vlan99
 ip address 10.99.0.1 255.255.255.0
`),
      options: ['The helper address on VLAN 30 points to 10.30.0.10 instead of the server at 10.99.0.10', 'The helper address must be configured on Vlan99, the server side, rather than on Vlan30', 'The DHCP server also needs a pool for 10.99.0.0/24 before it will answer relayed requests', 'A Layer 3 switch cannot act as a DHCP relay; only a router interface can'],
      answer: 0,
      explanation: 'ip helper-address must name the DHCP server. The configured 10.30.0.10 is in the client subnet, probably a typo for 10.99.0.10, so the relayed requests go nowhere useful. The helper belongs exactly where it is, on the interface that receives the clients\' broadcasts (Vlan30), not on the server side. The server needs a pool for the clients\' subnet, which it already has. Layer 3 switches relay DHCP on SVIs just as routers do on their interfaces.',
      ref: 'Lesson l4-6; card:dhcp',
    },
    {
      id: 'q4-0028', obj: '4.6', type: 'multi', difficulty: 2, pick: 2,
      stem: 'Which two statements about ip helper-address are true? (Choose two.)',
      options: ['It is configured on the interface facing the DHCP clients', 'It converts the client\'s broadcast into a unicast sent to the configured server', 'It is configured on the interface facing the DHCP server', 'It is needed even when the DHCP server is on the same subnet as the clients', 'It makes the router act as a DHCP server'],
      answer: [0, 1],
      explanation: 'Clients without an address broadcast, and routers do not forward broadcasts, so the helper must sit where those broadcasts arrive: the client-facing interface or SVI. The router then sends the request as a unicast to the server address, with giaddr set. A server on the same subnet hears the broadcast directly, so no relay is needed. The relay only forwards; the router does not hand out addresses unless you configure an ip dhcp pool. Note that by default the helper also forwards a few other UDP broadcasts, such as DNS and TFTP.',
      ref: 'Lesson l4-6; card:dhcp',
    },

    /* ---- 4.7 QoS ---- */
    {
      id: 'q4-0029', obj: '4.7', type: 'match', difficulty: 2,
      stem: 'Match each QoS term to its description.',
      options: ['Classification', 'Marking', 'Policing', 'Shaping', 'Queuing'],
      targets: ['Buffering traffic above a rate and sending it later, smoothing it to the rate', 'Holding packets in separate queues and choosing which to send next when an interface is congested', 'Identifying traffic by examining fields such as addresses, ports or existing markings', 'Dropping or re-marking traffic that exceeds a rate', 'Writing a value such as DSCP or CoS into the header'],
      answer: [[0, 2], [1, 4], [2, 3], [3, 0], [4, 1]],
      explanation: 'Classification sorts packets into classes, for example by ACL, protocol or NBAR. Marking records the class in a header field (DSCP in IPv4 and IPv6, CoS in the 802.1Q tag) so later devices can classify with a quick look. Queuing, such as CBWFQ and LLQ, decides the sending order when an interface has more traffic than it can transmit. Policing enforces a rate by dropping or re-marking the excess, with no added delay. Shaping enforces a rate by buffering the excess, adding delay but avoiding drops; it is typically used outbound toward a provider that polices.',
      ref: 'Lesson l4-7; card:qos',
    },
    {
      id: 'q4-0030', obj: '4.7', type: 'single', difficulty: 1,
      stem: 'Which DSCP marking is recommended for voice payload (RTP) traffic?',
      options: ['EF (46)', 'AF41 (34)', 'CS1 (8)', 'AF11 (10)'],
      answer: 0,
      explanation: 'Expedited Forwarding, decimal 46 (binary 101110), is the standard marking for voice bearer traffic, which is usually placed in a strict-priority queue (LLQ). AF41 (34) is commonly used for interactive video. CS1 (8) marks scavenger or bulk traffic that should get less than best effort. AF11 (10) is a low-priority assured forwarding class. Values like these are recommendations from RFC 4594 and Cisco designs, so check the local policy, but EF for voice is near universal.',
      ref: 'Lesson l4-7; card:qos',
    },
    {
      id: 'q4-0031', obj: '4.7', type: 'single', difficulty: 3,
      stem: 'Packets marked AF21, AF22 and AF23 share the same queue. During congestion, which are most likely to be dropped first by WRED, and why?',
      options: ['AF23, because the second digit is drop precedence and a higher value is dropped first', 'AF21, because a lower second digit means lower priority within the class', 'All three equally, because packets that share a queue share one drop profile', 'AF22, because the middle value sits closest to the WRED minimum threshold of the queue'],
      answer: 0,
      explanation: 'Assured Forwarding names are AFxy: x is the class (1 to 4, which selects the queue) and y is the drop precedence (1 to 3). Within a class, WRED starts discarding packets with higher drop precedence earlier, so AF23 goes first, then AF22, then AF21. The decimal values follow 8x + 2y: AF21 is 18, AF22 is 20 and AF23 is 22. Sharing a queue is exactly why drop precedence exists: it lets the network discard the less important traffic in a class before the rest.',
      ref: 'Lesson l4-7; card:qos',
    },
    {
      id: 'q4-0032', obj: '4.7', type: 'single', difficulty: 2,
      stem: 'A company buys a 50 Mbps service on a 1 Gbps Ethernet handoff. The provider drops any traffic above 50 Mbps. What should the company configure on its outbound WAN interface to avoid losing packets to the provider\'s policer?',
      options: ['Shaping to 50 Mbps', 'Policing to 50 Mbps', 'WRED with default thresholds', 'Marking all traffic as EF'],
      answer: 0,
      explanation: 'The provider polices at 50 Mbps, so bursts above that rate are discarded. Shaping on the customer side buffers bursts and releases them at 50 Mbps, so traffic stays under the policer, and the customer\'s own queuing decides what goes first. Policing at 50 Mbps outbound would drop the excess locally, which is no better than letting the provider drop it. WRED manages queue depth but does not limit the sending rate. Marking everything EF removes any distinction between traffic classes and does nothing about rate.',
      ref: 'Lesson l4-7; card:qos',
    },
    {
      id: 'q4-0033', obj: '4.7', type: 'single', difficulty: 2,
      stem: 'In a campus QoS design, where is the trust boundary usually placed?',
      options: ['At the access switch port, trusting markings from Cisco IP phones but re-marking traffic from PCs', 'At the internet edge router, where traffic first leaves the campus and the WAN links are slowest', 'At the core switches, so the access switches can remain unconfigured', 'On every PC, by letting users choose the DSCP values their own applications send into the network'],
      answer: 0,
      explanation: 'The trust boundary is the point where the network starts believing the markings in packets. It should be as close to the source as possible, so traffic is classified correctly from the first hop, but not on devices users control, because users could mark their downloads as EF. A common design trusts a Cisco IP phone (detected by CDP) on the access port while re-marking or ignoring PC markings. Placing it at the core or edge leaves the access layer forwarding unclassified or untrusted traffic.',
      ref: 'Lesson l4-7; card:qos',
    },
    {
      id: 'q4-0034', obj: '4.7', type: 'multi', difficulty: 3, pick: 2,
      stem: 'Users report choppy calls when the WAN link is busy. Voice is marked EF. Which two statements describe what low latency queuing (LLQ) contributes? (Choose two.)',
      options: ['It services voice in a strict-priority queue ahead of all other queues', 'It polices the priority queue to its configured bandwidth during congestion so voice cannot starve other classes', 'It removes the need to classify and mark voice traffic, because LLQ detects calls on its own', 'It guarantees zero packet loss for every class, not only for voice', 'It buffers excess voice traffic until the link is idle, so no voice packet is ever dropped'],
      answer: [0, 1],
      explanation: 'LLQ adds a strict-priority queue to class-based weighted fair queuing: packets there are always sent first, which keeps delay and jitter low for voice (one-way targets are around 150 ms delay, 30 ms jitter and 1 percent loss). To stop an oversized priority class from starving everything else, the priority queue is policed to its configured rate when the interface is congested. LLQ still relies on classification and marking to know what is voice. It guarantees nothing for other classes. Buffering voice until idle would add the very delay LLQ is meant to remove.',
      ref: 'Lesson l4-7; card:qos',
    },

    /* ---- 4.8 SSH ---- */
    {
      id: 'q4-0035', obj: '4.8', type: 'order', difficulty: 2,
      stem: 'Put the steps for enabling SSH version 2 on a new router in a working order.',
      options: ['Generate RSA keys with crypto key generate rsa modulus 2048', 'Set a domain name with ip domain-name', 'Configure line vty 0 15 with transport input ssh and login local', 'Set a hostname other than Router', 'Enable version 2 with ip ssh version 2', 'Create a local user with username ... secret'],
      answer: [3, 1, 0, 4, 5, 2],
      explanation: 'The RSA key pair is named hostname.domain, so the hostname and domain name must exist before crypto key generate rsa will run. Generating the keys enables SSH. ip ssh version 2 needs keys of at least 768 bits; 2048 is the usual choice. The local user and the VTY settings can be done in either order, but users must exist before login local is useful, or you can lock yourself out of remote access. transport input ssh disables Telnet on those lines.',
      ref: 'Lesson l4-8; card:ssh',
    },
    {
      id: 'q4-0036', obj: '4.8', type: 'single', difficulty: 2,
      stem: 'Refer to the exhibit. An administrator cannot SSH to the router. What must be done?',
      exhibit: cli('HPL-WAN2', `
HPL-WAN2# show ip ssh
SSH Disabled - version 1.99
%Please create RSA keys to enable SSH (and of atleast 768 bits for SSH v2).
Authentication methods:publickey,keyboard-interactive,password
Authentication timeout: 120 secs; Authentication retries: 3
`),
      options: ['Generate an RSA key pair with crypto key generate rsa', 'Enter ip ssh version 1.99 so that both SSH versions are accepted', 'Configure transport input telnet on the VTY lines', 'Disable the HTTP server'],
      answer: 0,
      explanation: 'SSH stays disabled until the router has an RSA key pair. Generate one with crypto key generate rsa modulus 2048, which needs a non-default hostname and a domain name. Version 1.99 in the output is not something you configure: it means the router would accept both SSH 1 and 2, and ip ssh version 2 restricts it to version 2. Allowing Telnet undermines the goal of encrypted management. The HTTP server is unrelated to SSH.',
      ref: 'Lesson l4-8; card:ssh',
    },
    {
      id: 'q4-0037', obj: '4.8', type: 'single', difficulty: 3,
      stem: 'A switch is configured with SSH, a local user and transport input ssh on its VTY lines. The administrator can SSH to it from the same VLAN but not from the management subnet behind the core router. Pings from the management subnet to the switch fail too. What is the most likely cause?',
      options: ['The Layer 2 switch has no ip default-gateway, so it cannot reply to devices on other subnets', 'SSH works only within a single VLAN, because it is not a routed protocol', 'The VTY lines need transport input all instead of transport input ssh to accept remote sessions', 'The RSA key is too short for SSH sessions that arrive from remote subnets'],
      answer: 0,
      explanation: 'A Layer 2 switch is a host on its management VLAN: it needs an SVI address and a default gateway to answer devices on other subnets. Without ip default-gateway, replies to the management subnet have nowhere to go, which is why both ping and SSH fail from there while same-VLAN access works. SSH is ordinary TCP 22 and routes like anything else. transport input all would also allow Telnet without fixing reachability. Key length affects whether SSH v2 is enabled at all, not where clients connect from.',
      ref: 'Lesson l4-8; card:ssh',
    },

    /* ---- 4.9 TFTP and FTP ---- */
    {
      id: 'q4-0038', obj: '4.9', type: 'multi', difficulty: 2, pick: 2,
      stem: 'Which two statements correctly compare TFTP and FTP? (Choose two.)',
      options: ['TFTP uses UDP port 69 and has no authentication', 'FTP uses TCP, with port 21 for control and a separate data connection', 'TFTP supports directory listings and requires user logins before any transfer', 'FTP uses UDP port 69 for faster transfers than TFTP', 'TFTP encrypts files in transit, which is why it is used for IOS images'],
      answer: [0, 1],
      explanation: 'TFTP is deliberately tiny: UDP 69, no usernames or passwords, no directory browsing, and simple lock-step acknowledgments, which makes it easy to build into network devices for config and image transfers on trusted networks. FTP runs over TCP with a control connection on port 21 and separate data connections (port 20 in active mode, a server-chosen port in passive mode), and it requires a login. Neither encrypts data; for that use SCP or SFTP, which run over SSH on TCP 22.',
      ref: 'Lesson l4-9; card:ftp',
    },
    {
      id: 'q4-0039', obj: '4.9', type: 'single', difficulty: 2,
      stem: 'Which command backs up a router\'s running configuration to a TFTP server at 10.0.0.69?',
      options: ['copy running-config tftp:', 'copy tftp: running-config', 'copy startup-config flash:', 'tftp put running-config 10.0.0.69'],
      answer: 0,
      explanation: 'The IOS copy command always reads source then destination. copy running-config tftp: prompts for the server address (10.0.0.69) and a destination file name, then uploads the config. copy tftp: running-config does the reverse and merges a file from the server into the running configuration. Copying startup-config to flash makes a local copy, not a backup on another device. tftp put is not an IOS command.',
      ref: 'Lesson l4-9; card:ftp',
    },
    {
      id: 'q4-0040', obj: '4.9', type: 'single', difficulty: 3,
      stem: 'An engineer must load a 900 MB IOS XE image onto a remote router over a WAN that drops some packets. The file server supports TFTP and FTP. Which choice is most appropriate, and why?',
      options: ['FTP, because it runs over TCP, which recovers lost segments, and it supports authentication', 'TFTP, because UDP has no handshake and is therefore faster and more reliable on lossy links', 'TFTP, because it encrypts the image in transit and checks it on arrival', 'FTP, because it uses UDP 69 with large block sizes that suit big image files'],
      answer: 0,
      explanation: 'TFTP sends one block and waits for its acknowledgment before sending the next, so on a long or lossy WAN it is slow and fragile, and some implementations struggle with very large files. FTP uses TCP, which retransmits lost segments and keeps many segments in flight, so it handles big files over a WAN far better, and it requires a login. On IOS you would set credentials with ip ftp username and ip ftp password, then copy ftp: flash:. Neither protocol encrypts, and FTP does not use UDP 69, which is TFTP\'s port.',
      ref: 'Lesson l4-9; card:ftp',
    },
  );

  /* =====================================================================
   * 5.0 SECURITY FUNDAMENTALS
   * ===================================================================== */
  const EX_ACL = cli('HPL-CORE', `
HPL-CORE# show access-lists
Standard IP access list 15
    10 permit 10.0.99.0, wildcard bits 0.0.0.255 (212 matches)
    20 deny   any log (37 matches)
Extended IP access list 130
    10 permit tcp 10.0.50.0 0.0.0.255 host 10.0.30.20 eq 443 (1884 matches)
    20 permit tcp 10.0.50.0 0.0.0.255 host 10.0.30.20 eq www (0 matches)
    30 deny   ip 10.0.50.0 0.0.0.255 10.0.30.0 0.0.0.255 (96 matches)
    40 permit ip any any (40213 matches)
HPL-CORE# show running-config | include access-group|access-class
 ip access-group 130 in
 access-class 15 in
`);

  Q.push(
    /* ---- 5.6 ACLs ---- */
    {
      id: 'q5-0001', obj: '5.6', type: 'multi', difficulty: 3, pick: 2,
      stem: 'Refer to the exhibit. ACL 15 is applied with access-class 15 in under line vty 0 15, and ACL 130 is applied inbound on the warehouse interface (10.0.50.0/24). Which two statements are true? (Choose two.)',
      exhibit: EX_ACL,
      options: ['Only hosts on 10.0.99.0/24 can open Telnet or SSH sessions to HPL-CORE; other attempts are denied and logged', 'A warehouse host that tries SSH to 10.0.30.20 is denied by line 30 of ACL 130', 'ACL 15 filters all traffic routed through HPL-CORE, permitting only packets sourced from 10.0.99.0/24', 'Warehouse hosts cannot reach the internet, because line 30 of ACL 130 denies their traffic first', 'ACL 15 has no effect, because standard ACLs cannot be used on VTY lines'],
      answer: [0, 1],
      explanation: 'access-class applies an ACL to the VTY lines, so ACL 15 filters only remote management sessions to the router itself: 10.0.99.0/24 is permitted and everything else hits deny any log, which records each refused attempt. Standard ACLs are the usual choice there because only the source matters. In ACL 130, SSH (TCP 22) to 10.0.30.20 matches neither line 10 (443) nor line 20 (80), so line 30 denies it. Routed traffic is filtered with ip access-group, not access-class. Internet traffic from the warehouse is not destined for 10.0.30.0/24, so it skips line 30 and is permitted by line 40.',
      ref: 'Lesson l5-6; card:acl',
    },
    {
      id: 'q5-0002', obj: '5.6', type: 'single', difficulty: 3,
      stem: 'Refer to the exhibit. ACL 130 is applied inbound on the warehouse interface (10.0.50.0/24). Users say the old HTTP inventory page on 10.0.30.20 does not load, while the HTTPS version does. Which statement is true?',
      exhibit: EX_ACL,
      options: ['Line 20 permits HTTP but shows 0 matches, so HTTP is not reaching this ACL or the server is not listening on 80', 'Line 30 is blocking HTTP, because a deny is always checked before the permit lines around it', 'The implicit deny at the end of ACL 130 is blocking HTTP, because no line permits TCP 80 by name', 'Line 10 matches the HTTP traffic first, because www and 443 are treated as the same web service, so line 20 never runs'],
      answer: 0,
      explanation: 'ACLs are checked top down and stop at the first match. HTTP from the warehouse to 10.0.30.20 on TCP 80 (www) does not match line 10, which needs port 443, and does match line 20, which comes before the deny on line 30. So if HTTP were arriving, line 20 would be counting it. Zero matches means the ACL is not the problem: look at the client, the path, or whether the server listens on port 80 at all. The implicit deny is never reached, because line 40 permits everything else.',
      ref: 'Lesson l5-6; card:acl',
    },
    {
      id: 'q5-0003', obj: '5.6', type: 'single', difficulty: 1,
      stem: 'Which wildcard mask matches every address in 172.16.32.0/20?',
      options: ['0.0.15.255', '0.0.31.255', '255.255.240.0', '0.0.16.255'],
      answer: 0,
      explanation: 'A wildcard mask is the inverse of the subnet mask: subtract each octet from 255. A /20 has the mask 255.255.240.0, so the wildcard is 0.0.15.255, which lets the low four bits of the third octet and the whole fourth octet vary: 172.16.32.0 through 172.16.47.255. 0.0.31.255 would be a /19, twice as large. 255.255.240.0 is the subnet mask itself, which in an ACL would mean something entirely different. 0.0.16.255 is not a contiguous wildcard and does not describe a subnet.',
      ref: 'Lesson l5-6; card:acl',
    },
    {
      id: 'q5-0004', obj: '5.6', type: 'single', difficulty: 2,
      stem: 'An administrator creates ACL 50 with a single line, access-list 50 deny host 10.0.20.66, and applies it outbound on the server LAN interface to block one PC. What happens?',
      options: ['All traffic out to the server LAN is blocked, because the implicit deny drops everything not permitted', 'Only 10.0.20.66 is blocked, because a standard ACL permits any traffic it does not explicitly deny', 'Nothing is blocked, because standard ACLs cannot use the host keyword and IOS ignores the line', 'Only traffic from 10.0.20.0/24 is blocked, because standard ACLs match whole subnets rather than single hosts'],
      answer: 0,
      explanation: 'Every ACL ends with an invisible deny any. With only a deny line, nothing is ever permitted, so all traffic leaving that interface is dropped, not just the one PC. The fix is to add access-list 50 permit any after the deny. The host keyword is valid in standard ACLs and is shorthand for a wildcard of 0.0.0.0. The ACL matches a single host, not the /24, so a subnet-wide block would only happen by accident through the implicit deny.',
      ref: 'Lesson l5-6; card:acl',
    },
    {
      id: 'q5-0005', obj: '5.6', type: 'multi', difficulty: 2, pick: 2,
      stem: 'Which two statements about ACL placement follow Cisco best practice? (Choose two.)',
      options: ['Place extended ACLs as close as possible to the source of the traffic being filtered', 'Place standard ACLs as close as possible to the destination', 'Place standard ACLs as close as possible to the source, so unwanted traffic is dropped early', 'Place extended ACLs as close as possible to the destination', 'Apply every ACL outbound on the internet interface, so all filtering happens in one place'],
      answer: [0, 1],
      explanation: 'Extended ACLs can match source, destination, protocol and ports, so they can be precise near the source, and dropping unwanted traffic early saves bandwidth on every link it would have crossed. Standard ACLs match only the source address. Placed near the source, they would block that source from every destination behind the interface, so they go near the destination where the only traffic left is headed for the protected network. Putting everything on the internet interface ignores internal traffic and the specific goals of each ACL.',
      ref: 'Lesson l5-6; card:acl',
    },
    {
      id: 'q5-0006', obj: '5.6', type: 'single', difficulty: 2,
      stem: 'Which extended ACL entry permits hosts on 10.5.5.0/24 to reach the web server 10.9.9.80 over HTTPS?',
      options: ['permit tcp 10.5.5.0 0.0.0.255 host 10.9.9.80 eq 443', 'permit tcp 10.5.5.0 0.0.0.255 eq 443 host 10.9.9.80', 'permit udp 10.5.5.0 0.0.0.255 host 10.9.9.80 eq 443', 'permit tcp host 10.9.9.80 10.5.5.0 0.0.0.255 eq 443'],
      answer: 0,
      explanation: 'Extended ACL syntax is action, protocol, source (and optional source port), destination (and optional destination port). HTTPS is TCP with destination port 443, so the port goes after the destination. Placing eq 443 after the source would require the client\'s source port to be 443, which it almost never is, since clients use random high ports. Classic HTTPS is TCP, not UDP (HTTP/3 over QUIC uses UDP 443, but that is not what this rule targets). The last option swaps source and destination, so it would only match traffic from the server.',
      ref: 'Lesson l5-6; card:acl',
    },
    {
      id: 'q5-0007', obj: '5.6', type: 'single', difficulty: 3,
      stem: 'Refer to the exhibit. A named ACL needs a new line that blocks SSH from 10.0.50.0/24 to the server 10.0.30.20, and it must be checked before the existing permit on line 10. Which commands do this without retyping the ACL?',
      exhibit: cli('HPL-CORE', `
HPL-CORE# show ip access-lists WH-IN
Extended IP access list WH-IN
    10 permit tcp 10.0.50.0 0.0.0.255 host 10.0.30.20 (522 matches)
    20 deny   ip 10.0.50.0 0.0.0.255 10.0.30.0 0.0.0.255 (14 matches)
    30 permit ip any any (9120 matches)
`),
      options: ['ip access-list extended WH-IN, then 5 deny tcp 10.0.50.0 0.0.0.255 host 10.0.30.20 eq 22', 'ip access-list extended WH-IN, then deny tcp 10.0.50.0 0.0.0.255 host 10.0.30.20 eq 22', 'access-list WH-IN 5 deny tcp 10.0.50.0 0.0.0.255 host 10.0.30.20 eq 22', 'no ip access-list extended WH-IN, then re-create it with the new deny entered before the permit'],
      answer: 0,
      explanation: 'Named ACLs (and numbered ACLs edited in ip access-list mode) use sequence numbers, so you can insert an entry anywhere: in ip access-list extended WH-IN, enter 5 deny tcp ... eq 22 and it lands before line 10. Without a number, IOS appends the entry after the last line (sequence 40), behind the permit ip any any, so it would never match. The access-list global command is for numbered ACLs only. Deleting and re-creating works but drops protection while you type, which is exactly what the question asks you to avoid. ip access-list resequence can renumber the entries afterward.',
      ref: 'Lesson l5-6; card:acl',
    },
    {
      id: 'q5-0008', obj: '5.6', type: 'order', difficulty: 2,
      stem: 'A packet arrives on an interface with an inbound extended ACL. Put the steps of ACL processing in order.',
      options: ['If no entry matches, drop the packet (implicit deny)', 'Compare the packet with the first entry in the list', 'If the entry does not match, move to the next entry', 'If an entry matches, apply its permit or deny action and stop checking'],
      answer: [1, 3, 2, 0],
      explanation: 'An ACL is a top-down list. The router compares the packet with the first entry; on a match it performs that action and stops, so later entries are never consulted. If the entry does not match, it tries the next one. If the packet reaches the end without matching anything, the implicit deny any drops it. That first-match logic is why specific entries must sit above general ones, and why an ACL needs at least one permit unless you really mean to block everything.',
      ref: 'Lesson l5-6; card:acl',
    },
    {
      id: 'q5-0009', obj: '5.6', type: 'single', difficulty: 2,
      stem: 'An administrator wants to stop the warehouse subnet 10.0.50.0/24 from using Telnet to any device, while allowing all other traffic. Which ACL does this?',
      options: ['access-list 110 deny tcp 10.0.50.0 0.0.0.255 any eq 23, then access-list 110 permit ip any any', 'access-list 10 deny 10.0.50.0 0.0.0.255 eq 23, then access-list 10 permit any', 'access-list 110 deny tcp any 10.0.50.0 0.0.0.255 eq 23, then access-list 110 permit ip any any', 'access-list 110 deny udp 10.0.50.0 0.0.0.255 any eq 23, then access-list 110 permit ip any any'],
      answer: 0,
      explanation: 'Matching a port requires an extended ACL (100 to 199 or 2000 to 2699, or a named extended ACL). Telnet is TCP port 23, and the warehouse is the source, so the rule is deny tcp 10.0.50.0 0.0.0.255 any eq 23, followed by permit ip any any so that everything else passes. Standard ACLs (1 to 99) cannot match ports, so IOS rejects eq 23 there. The third option blocks Telnet to the warehouse, the reverse direction. Telnet does not use UDP. Apply the ACL inbound on the warehouse interface.',
      ref: 'Lesson l5-6; card:acl',
    },
    {
      id: 'q5-0010', obj: '5.6', type: 'multi', difficulty: 1, pick: 2,
      stem: 'Which two number ranges identify standard IPv4 ACLs on Cisco IOS? (Choose two.)',
      options: ['1 to 99', '1300 to 1999', '100 to 199', '2000 to 2699', '200 to 299'],
      answer: [0, 1],
      explanation: 'Standard numbered ACLs use 1 to 99 and the expanded range 1300 to 1999. Extended numbered ACLs use 100 to 199 and the expanded range 2000 to 2699. Ranges such as 200 to 299 belong to other legacy protocol filters, not IPv4. Named ACLs avoid the number question entirely and say what type they are: ip access-list standard NAME or ip access-list extended NAME.',
      ref: 'Lesson l5-6; card:acl',
    },
    {
      id: 'q5-0011', obj: '5.6', type: 'single', difficulty: 3,
      stem: 'ACL 120 is applied with ip access-group 120 out on Gi0/1. Its only entries are deny icmp any any followed by permit ip any any. An administrator on the router itself runs ping to a host beyond Gi0/1, and the ping succeeds. Why?',
      options: ['Outbound ACLs do not filter packets generated by the router itself', 'ICMP is never matched by extended ACLs, which only filter TCP and UDP ports', 'The permit ip any any line matches the ping first, because permits are processed before denies', 'Pings from the router use UDP'],
      answer: 0,
      explanation: 'An outbound interface ACL filters traffic routed through the router. Packets the router originates, such as its own pings, routing protocol hellos and syslog messages, are not checked by outbound ACLs on the router that sends them. A PC behind the router would be blocked by this ACL. Extended ACLs match ICMP with the icmp keyword, and the deny line is first, so it would match. IOS ping uses ICMP echo, not UDP. To test an ACL, generate traffic from a host on the other side.',
      ref: 'Lesson l5-6; card:acl',
    },
    {
      id: 'q5-0012', obj: '5.6', type: 'single', difficulty: 2,
      stem: 'An interface already has ip access-group 110 in. The administrator enters ip access-group 120 in on the same interface. What is the result?',
      options: ['ACL 120 replaces ACL 110, because an interface takes one ACL per direction per protocol', 'Both ACLs are applied in order, 110 first and then 120, and a packet must pass both', 'IOS rejects the command with an error until ACL 110 is removed from the interface', 'ACL 120 is applied outbound automatically, because the inbound direction is already in use'],
      answer: 0,
      explanation: 'An interface accepts one IPv4 ACL per direction. Entering a second ip access-group in on the same interface overwrites the first, so ACL 110 silently stops filtering that interface. That is a classic way to lose protection during a change. If you need both sets of rules, combine them into one ACL. IOS does not stack them, does not reject the command, and never changes the direction you typed. IPv6 ACLs are separate, applied with ipv6 traffic-filter, so one of each protocol can coexist.',
      ref: 'Lesson l5-6; card:acl',
    },
    {
      id: 'q5-0013', obj: '5.6', type: 'single', difficulty: 3,
      stem: 'Users inside 10.0.0.0/8 must browse the web, but nothing on the internet may start a TCP session inward. An inbound ACL on the internet interface should allow return traffic for sessions the users started. Which entry is a simple way to do this for TCP?',
      options: ['permit tcp any 10.0.0.0 0.255.255.255 established', 'permit tcp 10.0.0.0 0.255.255.255 any established', 'permit tcp any any eq www', 'permit ip any 10.0.0.0 0.255.255.255'],
      answer: 0,
      explanation: 'The established keyword matches TCP segments with the ACK or RST bit set. The first segment of a new connection (a bare SYN) has neither, so outside hosts cannot open sessions inward, while replies to sessions started from inside, which always carry ACK, are allowed. On the inbound internet interface the source is the internet and the destination is the inside network, so the order is any, then 10.0.0.0 0.255.255.255. The second option has the direction reversed. eq www would permit new connections to inside port 80. permit ip lets everything in. Stateful firewalls do this job more completely.',
      ref: 'Lesson l5-6; card:acl',
    },
    {
      id: 'q5-0014', obj: '5.6', type: 'single', difficulty: 2,
      stem: 'Which command shows which ACL, if any, is applied inbound and outbound on GigabitEthernet0/1?',
      options: ['show ip interface GigabitEthernet0/1', 'show access-lists', 'show interfaces GigabitEthernet0/1', 'show ip interface brief'],
      answer: 0,
      explanation: 'show ip interface name lists the Layer 3 settings of an interface, including "Outgoing access list is ..." and "Inbound access list is ...". show access-lists displays the entries and hit counters of every ACL but not where they are applied. show interfaces shows Layer 1 and 2 status and counters. show ip interface brief shows only the address and up/down status. show running-config interface also works, by looking for ip access-group lines.',
      ref: 'Lesson l5-6; card:acl',
    },
    {
      id: 'q5-0015', obj: '5.6', type: 'single', difficulty: 2,
      stem: 'Which ACL entry matches only the single host 192.168.7.25?',
      options: ['permit 192.168.7.25 0.0.0.0', 'permit 192.168.7.25 255.255.255.255', 'permit 192.168.7.0 0.0.0.25', 'permit any 192.168.7.25'],
      answer: 0,
      explanation: 'A wildcard of 0.0.0.0 says every bit must match, so it describes exactly one address; IOS displays and accepts it as host 192.168.7.25. 255.255.255.255 is the opposite, "ignore every bit", which matches any address. 0.0.0.25 is a non-contiguous wildcard and matches a scattered set of addresses in 192.168.7.0/24. permit any is followed by nothing in a standard ACL; the extra address makes the line invalid.',
      ref: 'Lesson l5-6; card:acl',
    },
    {
      id: 'q5-0016', obj: '5.6', type: 'single', difficulty: 3,
      stem: 'An ACL meant to block DNS queries from the guest network (10.0.20.0/24) to outside servers reads deny udp 10.0.20.0 0.0.0.255 eq 53 any, then permit ip any any. Guests can still use outside DNS servers. Why?',
      options: ['eq 53 follows the source, so it matches source port 53; DNS queries are sent to destination port 53', 'DNS queries use TCP 53 only, so a UDP rule can never match them', 'permit ip any any is processed before the deny line, because permit entries are always checked first', 'Wildcard 0.0.0.255 matches only one host in 10.0.20.0/24, so the other guests are not covered'],
      answer: 0,
      explanation: 'In an extended ACL a port operator applies to whichever address it follows. Placing eq 53 after the source matches traffic from source port 53, but a client sends queries from a random high port to destination port 53. The correct entry is deny udp 10.0.20.0 0.0.0.255 any eq 53 (add a TCP entry too if large responses matter). DNS queries normally use UDP 53, falling back to TCP 53 when needed. The deny is listed first, so it is checked first. 0.0.0.255 matches the whole /24.',
      ref: 'Lesson l5-6; card:acl',
    },

    /* ---- 5.7 Layer 2 security ---- */
    {
      id: 'q5-0017', obj: '5.7', type: 'single', difficulty: 2,
      stem: 'Users on VLAN 10 are getting addresses from 192.168.0.0/24 and losing network access. The real DHCP server hands out 10.10.10.0/24. What feature prevents this, and how?',
      options: ['DHCP snooping, which drops DHCP server messages such as OFFER and ACK on untrusted ports', 'Dynamic ARP inspection, which drops DHCP Discover messages sent from unknown MAC addresses', 'Port security, which blocks all DHCP traffic on ports that exceed their MAC limit', 'BPDU guard, which err-disables any access port that sends DHCP OFFER or ACK messages'],
      answer: 0,
      explanation: 'A rogue DHCP server, often a consumer router plugged in backwards, answers clients faster than the real server and hands out wrong addresses and gateways. DHCP snooping classifies switch ports as trusted (toward real servers and uplinks) or untrusted (everything else, by default) and drops server-to-client DHCP messages arriving on untrusted ports. It also builds a binding table of legitimate leases. DAI validates ARP, not DHCP. Port security limits MAC addresses per port but does not inspect DHCP. BPDU guard reacts to spanning tree BPDUs only.',
      ref: 'Lesson l5-7; card:snooping',
    },
    {
      id: 'q5-0018', obj: '5.7', type: 'single', difficulty: 3,
      stem: 'After ip dhcp snooping and ip dhcp snooping vlan 20 were enabled on an access switch, VLAN 20 clients stopped getting addresses. The DHCP server is on another subnet, reached through a router acting as relay, and the uplink is trusted. Debugging on the relay router shows "inconsistent relay information" for client requests that arrive with option 82 and a giaddr of 0.0.0.0. What is the most likely fix?',
      options: ['Stop option 82 insertion with no ip dhcp snooping information option, or make the relay trust the option', 'Make every access port trusted', 'Enable DAI on VLAN 20 so the switch validates the client bindings before forwarding requests', 'Remove the ip helper-address from the router so the switch can forward the requests to the server itself'],
      answer: 0,
      explanation: 'By default, a Catalyst switch running DHCP snooping inserts option 82 (relay agent information) into client requests but leaves giaddr at 0.0.0.0, since the switch itself is not a relay. An IOS relay agent treats that combination as inconsistent and drops the request on an untrusted interface, so it never reaches the server. The common fixes are no ip dhcp snooping information option on the access switch, or telling the relay to trust option 82 (ip dhcp relay information trusted on the interface, or ip dhcp relay information trust-all globally). Trusting every access port would let rogue servers back in. DAI depends on snooping but does not fix DHCP. Removing the helper would stop relaying altogether.',
      ref: 'Lesson l5-7; card:snooping',
    },
    {
      id: 'q5-0019', obj: '5.7', type: 'single', difficulty: 2,
      stem: 'What does dynamic ARP inspection use to decide whether an ARP reply on an untrusted port is legitimate?',
      options: ['The DHCP snooping binding table (or ARP ACLs for static hosts), matching IP to MAC', 'The switch\'s MAC address table only, checking that the sender MAC was learned on that port', 'The routing table of the default gateway, checking that the sender IP is in a known subnet', 'The spanning tree root bridge ID'],
      answer: 0,
      explanation: 'DAI intercepts ARP packets on untrusted ports and checks that the sender IP and MAC pair matches an entry in the DHCP snooping binding table on that VLAN and port. Statically addressed hosts have no binding, so they need an ARP ACL or must sit on trusted ports. Packets that fail are dropped and logged, which stops ARP spoofing and the man-in-the-middle attacks built on it. The MAC table alone knows nothing about IP addresses. Routing tables and spanning tree have no role. Uplinks to other switches and routers are normally set as trusted.',
      ref: 'Lesson l5-7; card:snooping',
    },
    {
      id: 'q5-0020', obj: '5.7', type: 'match', difficulty: 2,
      stem: 'Match each port security violation mode to its behavior.',
      options: ['shutdown', 'restrict', 'protect'],
      targets: ['Drops frames from unknown MACs silently; no log or counter increase', 'Puts the port in err-disabled state and logs the violation', 'Drops frames from unknown MACs, logs, sends an SNMP trap and increments the violation counter'],
      answer: [[0, 1], [1, 2], [2, 0]],
      explanation: 'shutdown is the default: one violation and the port goes err-disabled until an administrator runs shutdown and no shutdown, or errdisable recovery brings it back. restrict keeps the port up for the allowed MACs, drops the rest, and tells you about it with syslog, SNMP and the violation counter. protect also keeps the port up and drops unknown MACs, but says nothing, which makes problems hard to troubleshoot. Remember the order of noise: shutdown makes the most, protect the least.',
      ref: 'Lesson l5-7; card:portsec',
    },
    {
      id: 'q5-0021', obj: '5.7', type: 'multi', difficulty: 3, pick: 2,
      stem: 'Refer to the exhibit. Which two statements about Fa0/7 are true? (Choose two.)',
      exhibit: cli('HPL-ACC3', `
HPL-ACC3# show port-security interface fa0/7
Port Security              : Enabled
Port Status                : Secure-shutdown
Violation Mode             : Shutdown
Aging Time                 : 0 mins
Aging Type                 : Absolute
SecureStatic Address Aging : Disabled
Maximum MAC Addresses      : 1
Total MAC Addresses        : 1
Configured MAC Addresses   : 0
Sticky MAC Addresses       : 1
Last Source Address:Vlan   : 3c52.82aa.91f0:10
Security Violation Count   : 1
`),
      options: ['A frame from 3c52.82aa.91f0 arrived while a different sticky MAC already filled the one allowed address, so the port was err-disabled', 'The port stays down until it is bounced with shutdown and no shutdown, unless errdisable recovery is configured', 'An administrator shut the port down with the shutdown command after the violation was logged', 'The sticky MAC address aged out, and the port shut down because no secure address was left', 'Port security is in restrict mode, so it dropped one frame from the unknown MAC and logged it'],
      answer: [0, 1],
      explanation: 'Secure-shutdown means port security err-disabled the port. The maximum is 1 and one sticky MAC is already learned, so a frame from another MAC (the last source address, 3c52.82aa.91f0 on VLAN 10) raised the violation count to 1 and the default shutdown mode disabled the port. It recovers only with shutdown then no shutdown, or automatically if errdisable recovery cause psecure-violation is set; remove the old sticky entry first if the new device is legitimate. An administrative shutdown would show as administratively down. Aging is off (0 mins), and the mode shown is shutdown, not restrict.',
      ref: 'Lesson l5-7; card:portsec',
    },
    {
      id: 'q5-0022', obj: '5.7', type: 'single', difficulty: 2,
      stem: 'An attacker connects a laptop and runs a tool that sends thousands of frames per second, each from a different fake source MAC address. Which attack is this, and which feature mitigates it?',
      options: ['MAC flooding (MAC address table overflow), mitigated by port security limits per port', 'ARP spoofing, mitigated by DHCP snooping alone without dynamic ARP inspection', 'VLAN hopping, mitigated by root guard on every access port facing the attacker', 'DHCP starvation, mitigated by BPDU guard shutting the port down on the first fake frame'],
      answer: 0,
      explanation: 'Flooding a switch with random source MACs fills its MAC address table. Once it is full, frames to unknown destinations are flooded out every port in the VLAN, letting the attacker capture traffic meant for others. Port security caps the number of MACs a port can learn, which stops the attack at the edge. ARP spoofing is countered by DAI (which needs DHCP snooping). VLAN hopping is countered by disabling DTP and using an unused native VLAN. DHCP starvation, many fake DHCP requests, is countered by DHCP snooping rate limits and port security.',
      ref: 'Lesson l5-7; card:portsec',
    },
    {
      id: 'q5-0023', obj: '5.7', type: 'multi', difficulty: 2, pick: 2,
      stem: 'An access switch runs DHCP snooping and DAI on VLAN 30. Which two ports should normally be configured as trusted? (Choose two.)',
      options: ['The uplink trunk toward the distribution switch and DHCP relay', 'The port connected to the site\'s DHCP server', 'Access ports connected to user PCs that get their addresses by DHCP', 'The port connected to a guest kiosk', 'Every port in VLAN 30, to avoid outages'],
      answer: [0, 1],
      explanation: 'Trust ports that lead toward legitimate infrastructure: the uplink that carries DHCP replies from the relay or server, and a port with a DHCP server attached directly. For DAI, uplinks are trusted because ARP from routers and other switches is not in this switch\'s binding table. User and kiosk ports stay untrusted, the default, because that is where rogue DHCP servers and ARP spoofing come from. Trusting every port turns both features off in practice.',
      ref: 'Lesson l5-7; card:snooping',
    },
    {
      id: 'q5-0024', obj: '5.7', type: 'single', difficulty: 2,
      stem: 'Which command shows the IP address, MAC address, lease time, VLAN and port that DHCP snooping recorded for each client?',
      options: ['show ip dhcp snooping binding', 'show ip dhcp binding', 'show mac address-table dynamic', 'show ip arp inspection'],
      answer: 0,
      explanation: 'show ip dhcp snooping binding displays the switch\'s binding table, built by watching DHCP exchanges on untrusted ports: MAC, IP, lease, type, VLAN and interface. DAI and IP Source Guard depend on this table. show ip dhcp binding shows leases handed out by a router or switch acting as the DHCP server, which is a different thing. The MAC address table has no IP information. show ip arp inspection shows DAI settings and statistics, not the bindings themselves.',
      ref: 'Lesson l5-7; card:snooping',
    },
    {
      id: 'q5-0025', obj: '5.7', type: 'single', difficulty: 3,
      stem: 'Several access ports in a lab go err-disabled every few days because of port security violations, and staff want them to come back on their own after five minutes while keeping shutdown mode. What should be configured?',
      options: ['errdisable recovery cause psecure-violation and errdisable recovery interval 300', 'switchport port-security violation protect on each of the affected ports', 'switchport port-security aging time 5, so the ports re-enable after five minutes', 'spanning-tree portfast so that the ports come back up faster'],
      answer: 0,
      explanation: 'errdisable recovery cause psecure-violation tells the switch to re-enable ports that were err-disabled by port security, and errdisable recovery interval 300 sets the wait to 300 seconds (the default is also 300). The port still shuts down on each violation, which keeps the strong response. Changing to protect would stop the shutdowns entirely, which is not what was asked. Aging controls how long secure MAC addresses are kept, not err-disabled recovery. PortFast speeds up spanning tree on edge ports and has nothing to do with port security.',
      ref: 'Lesson l5-7; card:portsec',
    },

    /* ---- 5.1 Key security concepts ---- */
    {
      id: 'q5-0026', obj: '5.1', type: 'match', difficulty: 1,
      stem: 'Match each security term to its definition.',
      options: ['Vulnerability', 'Exploit', 'Threat', 'Mitigation'],
      targets: ['A technique that reduces the chance or impact of an attack', 'Something or someone that could take advantage of a weakness to cause harm', 'A weakness in a system that could be used to compromise it', 'Code or a method that takes advantage of a specific weakness'],
      answer: [[0, 2], [1, 3], [2, 1], [3, 0]],
      explanation: 'A vulnerability is the weakness itself, such as an unpatched IOS bug or Telnet left enabled. An exploit is the tool or technique that uses that weakness. A threat is the potential danger: an attacker, malware or even an insider who could use an exploit against a vulnerability. Mitigation is anything that lowers the risk: patching, disabling the service, ACLs, training. Exam questions often describe a scenario and ask which term it is, so tie each word to its role.',
      ref: 'Lesson l5-1; card:secfund',
    },
    {
      id: 'q5-0027', obj: '5.1', type: 'single', difficulty: 2,
      stem: 'An attacker sends small DNS queries with a spoofed source address, the victim\'s, to many open resolvers, which then send large responses to the victim. What type of attack is this?',
      options: ['A reflection and amplification DDoS attack', 'A man-in-the-middle attack using DNS spoofing', 'A reconnaissance attack', 'A brute-force password attack'],
      answer: 0,
      explanation: 'Reflection means the attacker bounces traffic off third parties by spoofing the victim as the source, so the replies go to the victim. Amplification means each small request produces a much larger response, multiplying the attacker\'s bandwidth. Together, across many resolvers, they form a distributed denial of service. A man-in-the-middle attack sits between two parties to intercept or alter traffic. Reconnaissance gathers information, as with ping sweeps and port scans. Brute force tries passwords repeatedly.',
      ref: 'Lesson l5-1; card:secfund',
    },
    {
      id: 'q5-0028', obj: '5.1', type: 'single', difficulty: 2,
      stem: 'A finance clerk receives an email that appears to come from the CEO, addressed to her by name and referencing a real vendor, urgently asking her to wire money to a new account. What is this attack called?',
      options: ['Spear phishing', 'Whaling', 'Vishing', 'Smishing'],
      answer: 0,
      explanation: 'Phishing is fraudulent email sent to trick people into acting. Spear phishing targets a specific person or group with researched, personalized details, like this message. Whaling is spear phishing aimed at high-value targets such as executives; here the CEO is being impersonated, but the target is a clerk. Vishing is voice phishing over the phone, and smishing uses SMS text messages. The defense is mostly people and process: awareness training and out-of-band verification for any payment change.',
      ref: 'Lesson l5-1; card:secfund',
    },
    {
      id: 'q5-0029', obj: '5.1', type: 'multi', difficulty: 2, pick: 2,
      stem: 'Which two statements correctly describe types of malware? (Choose two.)',
      options: ['A worm spreads on its own across the network without needing a user to run a host file', 'A trojan horse disguises itself as legitimate software to get a user to install it', 'A virus spreads only through network broadcasts, without attaching to any file', 'Ransomware improves system performance by compressing files until a fee is paid', 'A worm always requires the user to open an email attachment'],
      answer: [0, 1],
      explanation: 'A worm is self-propagating: once on one machine it scans for and exploits other vulnerable machines with no user action. A trojan pretends to be useful software, so the user installs it willingly and the hidden payload runs. A virus attaches to a host file or program and spreads when that file is run or shared, not specifically through broadcasts. Ransomware encrypts data and demands payment for the key. Worms are defined by not needing a user to launch them.',
      ref: 'Lesson l5-1; card:secfund',
    },
    {
      id: 'q5-0030', obj: '5.1', type: 'single', difficulty: 3,
      stem: 'A user\'s PC suddenly shows the router\'s IP address 10.0.40.1 mapped to an unfamiliar MAC address in its ARP cache, and traffic to the internet is slow. Another PC on the same VLAN is sending unsolicited ARP replies. Which attack is likely in progress, and which feature directly prevents it?',
      options: ['ARP spoofing for a man-in-the-middle attack; dynamic ARP inspection', 'MAC flooding; BPDU guard', 'DHCP starvation; port security aging', 'A DNS amplification attack; an extended ACL on the router blocking UDP 53'],
      answer: 0,
      explanation: 'Gratuitous ARP replies claiming that 10.0.40.1 belongs to the attacker\'s MAC poison the hosts\' ARP caches, so their traffic goes to the attacker first, who forwards it (slowly) to the real gateway while reading or changing it: a man-in-the-middle attack. DAI drops ARP packets on untrusted ports whose IP-to-MAC pairing does not match the DHCP snooping bindings. MAC flooding fills the switch\'s table rather than poisoning hosts, and BPDU guard deals with spanning tree. DHCP starvation exhausts the server\'s pool. DNS amplification is a DDoS against a remote target.',
      ref: 'Lesson l5-1; card:snooping',
    },
    {
      id: 'q5-0031', obj: '5.1', type: 'single', difficulty: 1,
      stem: 'Which security goal is violated when an attacker changes the contents of a configuration file in transit, without being able to read encrypted data?',
      options: ['Integrity', 'Confidentiality', 'Availability', 'Non-repudiation'],
      answer: 0,
      explanation: 'The CIA triad covers confidentiality (only authorized parties can read data), integrity (data is not altered without detection) and availability (systems and data are usable when needed). Changing data in transit attacks integrity; hashes and HMACs, as used in SNMPv3 and IPsec, detect it. The attacker cannot read the data, so confidentiality holds. Availability would be hit by a DoS. Non-repudiation, proving who sent something, is a related goal, but the scenario is about modification.',
      ref: 'Lesson l5-1; card:secfund',
    },

    /* ---- 5.2 Security program elements ---- */
    {
      id: 'q5-0032', obj: '5.2', type: 'match', difficulty: 1,
      stem: 'Match each security program element to its example.',
      options: ['User awareness', 'User training', 'Physical access control'],
      targets: ['Badge readers and a mantrap at the data center door', 'Posters and regular emails reminding staff about phishing warning signs', 'A required course where help desk staff practice verifying callers before resetting passwords'],
      answer: [[0, 1], [1, 2], [2, 0]],
      explanation: 'Awareness keeps security on everyone\'s mind with ongoing, general reminders, such as simulated phishing tests, posters and newsletters. Training is more formal and teaches specific skills or procedures, often tied to a job role, sometimes with a test. Physical access control keeps unauthorized people away from equipment: locks, badges, mantraps, cameras and guards. A network can be perfectly configured and still lost to someone who walks into the wiring closet with a console cable.',
      ref: 'Lesson l5-2; card:secfund',
    },
    {
      id: 'q5-0033', obj: '5.2', type: 'single', difficulty: 2,
      stem: 'An employee holds the badge-controlled door open for a friendly stranger carrying boxes, who then walks into the network room. Which threat does this describe, and which control most directly addresses it?',
      options: ['Tailgating; a mantrap or access vestibule that admits one person per badge', 'Phishing; email filtering', 'Shoulder surfing; privacy filters and badge readers placed away from the door', 'Vishing; caller verification before granting door access'],
      answer: 0,
      explanation: 'Tailgating (or piggybacking) is following an authorized person through a secured door. A mantrap, two doors where the second opens only after the first closes and a single badge is read, physically prevents it, and training staff not to hold doors helps too. Phishing and vishing are email and phone tricks. Shoulder surfing is reading someone\'s screen or keystrokes over their shoulder. All are social engineering, but only tailgating matches this scene.',
      ref: 'Lesson l5-2; card:secfund',
    },
    {
      id: 'q5-0034', obj: '5.2', type: 'single', difficulty: 2,
      stem: 'A company sends employees fake phishing emails each month and gives a short lesson to anyone who clicks the link. Which security program element is this?',
      options: ['A user awareness program', 'Physical access control', 'A firewall policy', 'Multifactor authentication'],
      answer: 0,
      explanation: 'Simulated phishing campaigns are a classic user awareness tool: they keep the threat visible and teach recognition through experience, with a short follow-up lesson for those who fall for it. Physical access control covers doors and locks. A firewall policy filters network traffic. MFA limits the damage when a password is phished, but it does not teach people to spot phishing.',
      ref: 'Lesson l5-2; card:secfund',
    },
  );

  Q.push(
    /* ---- 5.3 Local passwords ---- */
    {
      id: 'q5-0035', obj: '5.3', type: 'single', difficulty: 2,
      stem: 'A router has both enable password Dock123 and enable secret Harb0r!9 configured. Which password does a user type at the enable prompt?',
      options: ['Harb0r!9, because the enable secret takes precedence', 'Dock123, because the first password configured takes precedence', 'Either one', 'Both, one after the other'],
      answer: 0,
      explanation: 'When both commands exist, IOS uses only the enable secret, which is stored as a one-way hash; the enable password is ignored (IOS even warns if you try to set them to the same value). enable password is a legacy command that stores clear text, or weak type 7 with service password-encryption, so it should be removed. Configuration order does not matter, and IOS never asks for two enable passwords in a row.',
      ref: 'Lesson l5-3; card:pwpolicy',
    },
    {
      id: 'q5-0036', obj: '5.3', type: 'multi', difficulty: 3, pick: 2,
      stem: 'Refer to the exhibit. Which two statements about this configuration are true? (Choose two.)',
      exhibit: cli('HPL-DOCK', `
service password-encryption
!
username ops password 7 0822455D0A16544541
username admin secret 9 $9$nhEmQVczB7dqsO$X.HsgL6x1il0RxkOSSvyQYwucySCt7qFm4v7pqCxkKM
!
line con 0
 password 7 104D000A0618
 login
line vty 0 15
 login local
 transport input ssh
`),
      options: ['The ops and console passwords are stored as type 7, which can be decoded easily', 'The admin secret is stored as a type 9 (scrypt) one-way hash', 'All three passwords are hashed and cannot be recovered', 'The console asks for a username because of service password-encryption', 'The admin account cannot log in over SSH because its password is type 9', 'Entering no service password-encryption turns the type 7 strings back into clear text'],
      answer: [0, 1],
      explanation: 'service password-encryption converts clear-text passwords in the configuration to type 7, a reversible encoding that free tools decode instantly, so it only stops casual shoulder surfing. username ... secret stores a hash: type 9 is scrypt, type 8 is PBKDF2-SHA-256 and type 5 is MD5. The console uses login, so it asks only for the line password; login local would ask for a username. Secret types do not restrict SSH, and login local accepts both forms of local user. Turning service password-encryption off only affects passwords entered afterward; existing type 7 strings stay encoded.',
      ref: 'Lesson l5-3; card:pwpolicy',
    },
    {
      id: 'q5-0037', obj: '5.3', type: 'single', difficulty: 1,
      stem: 'An administrator enters password C0ns0le! under line console 0, but the console still opens without asking for a password. What is missing?',
      options: ['The login command under line console 0', 'service password-encryption', 'enable secret', 'transport input ssh under line console 0'],
      answer: 0,
      explanation: 'The password command only stores a line password; the login command tells the line to require it. Without login, IOS lets the session in. Use login local instead if you want a username and password from the local user database. service password-encryption only changes how passwords are stored. enable secret protects privileged EXEC mode, not access to the line. transport input applies to VTY lines; the console is a physical serial port.',
      ref: 'Lesson l5-3; card:pwpolicy',
    },
    {
      id: 'q5-0038', obj: '5.3', type: 'multi', difficulty: 3, pick: 2,
      stem: 'An audit of the router HPL-EDGE requires that local passwords be at least 12 characters and that repeated failed logins be slowed. Which two commands help meet these requirements? (Choose two.)',
      options: ['security passwords min-length 12', 'login block-for 120 attempts 5 within 60', 'service password-encryption', 'exec-timeout 12 0', 'enable password 12'],
      answer: [0, 1],
      explanation: 'security passwords min-length 12 makes IOS reject any new password or secret shorter than 12 characters. login block-for 120 attempts 5 within 60 blocks login attempts for 120 seconds after 5 failures within 60 seconds, which slows brute-force and dictionary attacks. service password-encryption only obscures stored passwords with weak type 7. exec-timeout logs out idle sessions after a time limit, useful but unrelated to password length or failed logins. enable password 12 would simply set the enable password to the text "12".',
      ref: 'Lesson l5-3; card:pwpolicy',
    },

    /* ---- 5.4 Password policy ---- */
    {
      id: 'q5-0039', obj: '5.4', type: 'single', difficulty: 1,
      stem: 'A remote-access VPN asks for a password and then for a code from an app on the user\'s phone. Which factors are being combined?',
      options: ['Something you know and something you have', 'Something you know and something you are', 'Something you have and something you are', 'Two instances of something you know'],
      answer: 0,
      explanation: 'Multifactor authentication combines different categories of evidence. A password is something you know. A one-time code from an authenticator app proves possession of the enrolled phone, so it is something you have (a hardware token or smart card fits here too). Something you are means biometrics such as a fingerprint or face. Two passwords, or a password plus a security question, are still a single factor used twice, which is far weaker.',
      ref: 'Lesson l5-4; card:pwpolicy',
    },
    {
      id: 'q5-0040', obj: '5.4', type: 'multi', difficulty: 2, pick: 2,
      stem: 'Which two practices reflect current password policy guidance? (Choose two.)',
      options: ['Favor long passphrases and check new passwords against lists of known breached passwords', 'Add multifactor authentication for remote and administrative access', 'Require users to change their password every 15 days, even with no sign of compromise', 'Allow at most 8 characters so users can remember their passwords without writing them down', 'Share one administrator password among the team for easier recovery'],
      answer: [0, 1],
      explanation: 'Length is the biggest factor in password strength, so long passphrases beat short complex ones, and screening against breached-password lists stops the most common guesses. MFA makes a stolen password far less useful, which matters most for remote and admin logins. Very frequent forced changes push people toward predictable patterns, so modern guidance (such as NIST SP 800-63B) recommends changing passwords when compromise is suspected rather than on a short timer. An 8-character maximum caps strength. Shared accounts destroy accountability; give admins individual accounts, ideally through AAA.',
      ref: 'Lesson l5-4; card:pwpolicy',
    },
    {
      id: 'q5-0041', obj: '5.4', type: 'single', difficulty: 2,
      stem: 'Which authentication method uses a digitally signed file, issued by a trusted authority and tied to a private key, to prove a device\'s or user\'s identity?',
      options: ['A digital certificate', 'A one-time password token', 'A biometric scan', 'A pre-shared key'],
      answer: 0,
      explanation: 'A digital certificate (X.509) binds an identity to a public key and is signed by a certificate authority that both sides trust. The holder proves its identity by using the matching private key, which never leaves the device, so there is no shared secret to steal from a server. Certificates are common for 802.1X EAP-TLS, VPNs and HTTPS. An OTP token generates short-lived codes. Biometrics measure a physical trait. A pre-shared key is one secret known to every party, which is simpler but harder to protect and to change.',
      ref: 'Lesson l5-4; card:pwpolicy',
    },
    {
      id: 'q5-0042', obj: '5.4', type: 'single', difficulty: 3,
      stem: 'Attackers obtained a database of user passwords from a breached website and are now trying those username and password pairs against Harbor Point\'s VPN portal. Which single control most directly defeats this credential-stuffing attack?',
      options: ['Requiring multifactor authentication on the VPN', 'Requiring passwords of at least 8 characters', 'Enabling service password-encryption on the VPN headend', 'Changing the VPN portal\'s TCP port'],
      answer: 0,
      explanation: 'Credential stuffing works because people reuse passwords: a correct, stolen password is still correct. MFA means the attacker also needs the user\'s second factor, such as a phone, token or certificate, so stolen passwords alone fail. A minimum length does not help when the attacker already has the real password. service password-encryption only obscures passwords stored in a Cisco config. Moving the port is obscurity that a scan defeats in minutes. Lockout and rate limiting help too, but MFA addresses the root cause.',
      ref: 'Lesson l5-4; card:pwpolicy',
    },

    /* ---- 5.5 IPsec VPNs ---- */
    {
      id: 'q5-0043', obj: '5.5', type: 'single', difficulty: 1,
      stem: 'Harbor Point wants its Dundalk warehouse LAN and its headquarters LAN to communicate securely over the internet, with no software on user PCs. Which solution fits?',
      options: ['A site-to-site IPsec VPN between the two edge routers or firewalls', 'A remote-access VPN client installed on every PC at both sites', 'A clientless SSL VPN portal that every warehouse user logs in to daily', 'A GRE tunnel between the two edge routers, without IPsec'],
      answer: 0,
      explanation: 'A site-to-site VPN builds a permanent encrypted tunnel between two gateways. Hosts send ordinary traffic to their local gateway, which encrypts it, so users need nothing installed and do not even know the VPN exists. Remote-access VPNs, whether with a client such as Cisco Secure Client (formerly AnyConnect) or clientless through a browser, connect individual users, typically when they are traveling or at home. GRE alone builds a tunnel but provides no encryption, which is why it is usually run over IPsec.',
      ref: 'Lesson l5-5; card:ipsec',
    },
    {
      id: 'q5-0044', obj: '5.5', type: 'multi', difficulty: 2, pick: 2,
      stem: 'Which two statements about IPsec are true? (Choose two.)',
      options: ['ESP (IP protocol 50) can provide encryption, integrity and authentication', 'IKE negotiates the security associations and keys, using UDP 500 (UDP 4500 when NAT is detected)', 'AH (IP protocol 51) encrypts the payload', 'IPsec can natively carry multicast routing protocol traffic between sites without GRE', 'IPsec works only over TCP port 443'],
      answer: [0, 1],
      explanation: 'Encapsulating Security Payload provides confidentiality through encryption plus integrity, origin authentication and anti-replay. Internet Key Exchange (IKEv1 or IKEv2) authenticates the peers and negotiates the algorithms and keys, on UDP 500, switching to UDP 4500 with NAT traversal. Authentication Header (protocol 51) gives integrity and authentication but no encryption, and it breaks through NAT. Classic policy-based IPsec carries unicast only, which is why GRE over IPsec or virtual tunnel interfaces are used to run routing protocols. TCP 443 is used by TLS-based remote-access VPNs, not IPsec.',
      ref: 'Lesson l5-5; card:ipsec',
    },
    {
      id: 'q5-0045', obj: '5.5', type: 'single', difficulty: 2,
      stem: 'A night-shift supervisor needs to reach internal web apps from home through a browser, without installing VPN software. Which VPN type fits?',
      options: ['A clientless SSL/TLS VPN portal', 'A site-to-site IPsec VPN from her home router', 'GRE over IPsec', 'A DMVPN spoke'],
      answer: 0,
      explanation: 'A clientless remote-access VPN runs inside the user\'s web browser over HTTPS (TLS). The user logs in to a portal on the VPN headend, such as a Cisco ASA or Firepower device, and reaches published internal web applications through it. Full-tunnel remote access uses a client such as Cisco Secure Client. Site-to-site IPsec, GRE over IPsec and DMVPN all connect network gateways rather than individual users with only a browser.',
      ref: 'Lesson l5-5; card:ipsec',
    },
    {
      id: 'q5-0046', obj: '5.5', type: 'single', difficulty: 3,
      stem: 'Harbor Point runs OSPF between HQ and 30 branches and wants encrypted tunnels across the internet that carry OSPF multicast hellos, with branches able to build tunnels to each other on demand. Which design fits best?',
      options: ['DMVPN, which uses multipoint GRE tunnels protected by IPsec', 'A separate policy-based IPsec tunnel from each branch to HQ, with no GRE', 'A clientless SSL VPN at each branch', 'An AH-only tunnel to each branch'],
      answer: 0,
      explanation: 'Dynamic Multipoint VPN combines multipoint GRE, which carries multicast and therefore routing protocols, with NHRP, which lets spokes discover each other and build direct spoke-to-spoke tunnels on demand, all protected by IPsec. It scales to many sites with little hub configuration. Policy-based IPsec alone does not carry OSPF multicast, and full meshes of static tunnels do not scale. SSL VPNs serve individual users. AH provides no encryption at all.',
      ref: 'Lesson l5-5; card:ipsec',
    },
    {
      id: 'q5-0047', obj: '5.5', type: 'single', difficulty: 2,
      stem: 'In IPsec tunnel mode, what does the gateway do with the original IP packet?',
      options: ['Encrypts the whole original packet, header included, and adds a new outer IP header between the gateways', 'Encrypts only the payload and keeps the original IP header so routers along the path can still read the addresses', 'Leaves the packet unencrypted and only adds an authentication trailer after the payload', 'Converts the packet to IPv6'],
      answer: 0,
      explanation: 'Tunnel mode, the normal mode for site-to-site VPNs, protects the whole original packet, so internal addresses are hidden. It wraps the result in ESP and a new IP header addressed from one VPN gateway to the other. Transport mode protects only the payload and keeps the original header, which suits host-to-host protection or GRE over IPsec, where GRE already adds its own outer header. Adding only an authentication trailer is closer to what AH does. IPsec does not change the IP version.',
      ref: 'Lesson l5-5; card:ipsec',
    },

    /* ---- 5.8 AAA ---- */
    {
      id: 'q5-0048', obj: '5.8', type: 'match', difficulty: 1,
      stem: 'Match each AAA function to the question it answers.',
      options: ['Authentication', 'Authorization', 'Accounting'],
      targets: ['What did you do, and when?', 'Who are you?', 'What are you allowed to do?'],
      answer: [[0, 1], [1, 2], [2, 0]],
      explanation: 'Authentication verifies identity, for example with a username and password, a certificate or MFA. Authorization decides what that identity may do once logged in, such as privilege level 15 or only show commands. Accounting records what happened: login and logout times, commands entered, and session length, which is vital for audits and investigations. Cisco devices usually do all three against a central server such as Cisco ISE using TACACS+ or RADIUS, with a local fallback account.',
      ref: 'Lesson l5-8; card:aaa',
    },
    {
      id: 'q5-0049', obj: '5.8', type: 'multi', difficulty: 2, pick: 3,
      stem: 'Which three statements correctly compare TACACS+ and RADIUS? (Choose three.)',
      options: ['TACACS+ uses TCP port 49', 'RADIUS uses UDP, with ports 1812 and 1813 for authentication and accounting', 'TACACS+ encrypts the entire packet body, while RADIUS encrypts only the password', 'RADIUS separates authentication and authorization into independent exchanges', 'TACACS+ is mainly used for network access by end users, such as 802.1X'],
      answer: [0, 1, 2],
      explanation: 'TACACS+ (Cisco-developed, documented in RFC 8907) runs on TCP 49, encrypts the whole payload and handles authentication, authorization and accounting separately, which allows per-command authorization. That makes it the usual choice for device administration. RADIUS is an open standard on UDP 1812 and 1813 (older 1645 and 1646), encrypts only the password field, and combines authentication and authorization in one response. It is the usual choice for network access, such as 802.1X, VPN and Wi-Fi users. The last two options reverse the protocols.',
      ref: 'Lesson l5-8; card:aaa',
    },
    {
      id: 'q5-0050', obj: '5.8', type: 'multi', difficulty: 2, pick: 2,
      stem: 'Which two statements describe the switch\'s role in 802.1X port-based access control? (Choose two.)',
      options: ['It is the authenticator, which keeps the port closed to user traffic until access is approved', 'It relays EAP messages between the supplicant (EAPOL) and the authentication server (RADIUS)', 'It is the supplicant that requests access', 'It is the authentication server that validates the credentials', 'It is the certificate authority that issues certificates for EAP-TLS'],
      answer: [0, 1],
      explanation: 'The supplicant is the client device requesting access (software on the PC). The authenticator is the switch (or wireless controller) that controls the port: it relays EAP messages between the supplicant, using EAPOL on the LAN, and the authentication server, using RADIUS, and opens the port only when the server says yes. The authentication server, such as Cisco ISE, checks the credentials. A certificate authority may issue certificates for EAP-TLS, but it is not one of the three 802.1X roles.',
      ref: 'Lesson l5-8; card:aaa',
    },
    {
      id: 'q5-0051', obj: '5.8', type: 'single', difficulty: 3,
      stem: 'Refer to the exhibit. Both TACACS+ servers are unreachable after a WAN outage. What happens when an administrator connects to the console?',
      exhibit: cli('HPL-CORE', `
aaa new-model
aaa authentication login default group tacacs+ local
aaa authorization exec default group tacacs+ local
!
tacacs server ISE-1
 address ipv4 10.0.99.21
 key 7 <removed>
tacacs server ISE-2
 address ipv4 10.0.99.22
 key 7 <removed>
!
username breakglass privilege 15 secret 9 <removed>
`),
      options: ['After the servers fail to respond, IOS falls back to the local database, so the breakglass account can log in', 'Nobody can log in until a TACACS+ server is reachable again, because AAA does not fall back once servers are configured', 'The console bypasses AAA entirely and opens without asking for any password', 'IOS uses the enable secret as the login password whenever no TACACS+ server responds'],
      answer: 0,
      explanation: 'A method list is tried left to right. group tacacs+ is tried first; IOS moves to the next method, local, only if the servers give no response (an error). If a server answered and rejected the password, IOS would not fall back. With both servers down, the local user breakglass can log in with its secret. The default login list covers all lines, the console included, unless a named list is applied there. The enable secret is not used for login with this method list.',
      ref: 'Lesson l5-8; card:aaa',
    },
    {
      id: 'q5-0052', obj: '5.8', type: 'single', difficulty: 2,
      stem: 'A security team wants a record of every configuration command each administrator enters on the core switches, sent to a central server. Which AAA function provides this?',
      options: ['Accounting, such as TACACS+ command accounting', 'Authentication, such as TACACS+ login authentication', 'Authorization, such as TACACS+ command authorization', 'Encryption'],
      answer: 0,
      explanation: 'Accounting creates records of what users did. With TACACS+, IOS can send accounting records for EXEC sessions and individual commands at chosen privilege levels, giving an audit trail of who changed what and when. Authentication only proves who logged in. Authorization decides whether a command is allowed but does not keep a history. Encryption protects data in transit and is not an AAA function.',
      ref: 'Lesson l5-8; card:aaa',
    },

    /* ---- 5.9 Wireless security protocols ---- */
    {
      id: 'q5-0053', obj: '5.9', type: 'match', difficulty: 2,
      stem: 'Match each wireless security standard to the feature most closely associated with it.',
      options: ['WEP', 'WPA', 'WPA2', 'WPA3'],
      targets: ['AES-CCMP encryption, based on 802.11i', 'SAE authentication and mandatory protected management frames', 'Static RC4 keys that can be cracked in minutes', 'TKIP as an interim fix for WEP hardware'],
      answer: [[0, 2], [1, 3], [2, 0], [3, 1]],
      explanation: 'WEP used RC4 with short, static keys and weak initialization vectors; it is long broken. WPA was a stopgap that introduced TKIP, still RC4-based, plus a message integrity check, so older hardware could be upgraded by firmware. WPA2 implements the full 802.11i standard with AES in CCMP mode and has been required for Wi-Fi certification since 2006. WPA3 replaces the PSK handshake with SAE (Simultaneous Authentication of Equals), requires protected management frames and offers a 192-bit mode for enterprise.',
      ref: 'Lesson l5-9; card:wifisec',
    },
    {
      id: 'q5-0054', obj: '5.9', type: 'multi', difficulty: 3, pick: 2,
      stem: 'Which two statements explain why WPA3-Personal is more secure than WPA2-Personal? (Choose two.)',
      options: ['SAE requires each password guess to be an interactive exchange with the AP, so a captured handshake cannot be cracked offline', 'SAE provides forward secrecy, so learning the passphrase later does not decrypt traffic captured earlier', 'WPA3 uses a longer SSID that is harder to guess', 'WPA3-Personal requires a RADIUS server to check every passphrase', 'WPA3 transmits the passphrase in encrypted form instead of in clear text', 'WPA3-Personal uses TKIP alongside AES for backward compatibility with WPA2 clients'],
      answer: [0, 1],
      explanation: 'With WPA2-PSK, an attacker who captures the four-way handshake can test millions of passphrases per second offline, and anyone who knows the passphrase can decrypt recorded sessions. WPA3-Personal uses SAE, a password-authenticated key exchange based on the Dragonfly handshake: a captured exchange gives nothing to test offline, so each guess needs a live attempt against the AP, and every session gets fresh keys, which provides forward secrecy. SSID length is irrelevant. RADIUS belongs to Enterprise mode. Neither version sends the passphrase over the air, and WPA3 does not use TKIP.',
      ref: 'Lesson l5-9; card:wifisec',
    },
    {
      id: 'q5-0055', obj: '5.9', type: 'multi', difficulty: 2, pick: 2,
      stem: 'Which two statements about WPA2 and WPA3 Enterprise mode are true? (Choose two.)',
      options: ['Users authenticate individually with 802.1X and EAP against an authentication server such as RADIUS', 'Each user session gets its own encryption keys, so a departing employee does not force a change for everyone', 'All users share one pre-shared key, which the RADIUS server hands out at login', 'Enterprise mode is the same as an open network with a captive portal', 'Enterprise mode uses TKIP only, because AES is reserved for Personal mode'],
      answer: [0, 1],
      explanation: 'Enterprise mode replaces the shared passphrase with 802.1X: each user or device proves its identity with EAP, for example EAP-TLS with certificates or PEAP with credentials, to a RADIUS server such as Cisco ISE. Each session derives its own keys, and revoking one account affects only that user. A shared PSK is the Personal mode. A captive portal is web authentication on an open or OWE network, not 802.1X. WPA2 and WPA3 Enterprise use AES-based ciphers (CCMP, or GCMP-256 in WPA3\'s 192-bit mode), not TKIP.',
      ref: 'Lesson l5-9; card:wifisec',
    },
    {
      id: 'q5-0056', obj: '5.9', type: 'single', difficulty: 3,
      stem: 'A coffee-shop-style guest SSID must stay open, with no password, but the café owner wants each guest\'s traffic encrypted so other guests cannot sniff it. Which feature meets this?',
      options: ['Opportunistic Wireless Encryption (Wi-Fi Enhanced Open)', 'WPA2-Personal with the passphrase printed on a sign at the counter', 'WEP with a 128-bit key', 'MAC address filtering'],
      answer: 0,
      explanation: 'OWE, certified as Wi-Fi Enhanced Open and introduced alongside WPA3, performs an unauthenticated Diffie-Hellman exchange when a client associates, so each client gets unique encryption keys without any password. A shared WPA2 passphrase on the wall lets anyone who knows it derive other clients\' keys from captured handshakes, and it is not open anyway. WEP is broken. MAC filtering is not encryption, and MAC addresses are easily spoofed.',
      ref: 'Lesson l5-9; card:wifisec',
    },
    {
      id: 'q5-0057', obj: '5.9', type: 'single', difficulty: 1,
      stem: 'Which encryption protocol does WPA2 use to protect data frames?',
      options: ['AES-CCMP', 'TKIP with RC4', 'DES', '3DES'],
      answer: 0,
      explanation: 'WPA2 requires CCMP, AES in counter mode with CBC-MAC for integrity, which comes from the IEEE 802.11i amendment. TKIP with RC4 belongs to the original WPA, and WPA2 devices may still offer it for compatibility, but it is deprecated and slows modern 802.11n and later rates. DES and 3DES are old block ciphers that were never part of Wi-Fi security standards. WPA3 keeps AES and adds GCMP-256 for its 192-bit enterprise mode.',
      ref: 'Lesson l5-9; card:wifisec',
    },

    /* ---- 5.10 WLAN GUI with WPA2 PSK ---- */
    {
      id: 'q5-0058', obj: '5.10', type: 'single', difficulty: 2,
      stem: 'Refer to the exhibit. The new HPL-SCANNERS WLAN on the controller should use WPA2-Personal. Clients cannot connect. Which setting is wrong?',
      exhibit: table([
        ['WLAN setting (Security > Layer 2)', 'Value'],
        ['Layer 2 Security', 'WPA+WPA2'],
        ['WPA2 Policy', 'Enabled'],
        ['WPA2 Encryption', 'AES'],
        ['Authentication Key Management: 802.1X', 'Enabled'],
        ['Authentication Key Management: PSK', 'Disabled'],
        ['PSK Format', 'ASCII'],
      ]),
      options: ['Key management is set to 802.1X instead of PSK', 'AES should be TKIP, because WPA2-Personal requires TKIP', 'The PSK format must be HEX', 'Layer 2 Security must be set to None for WPA2-Personal to work'],
      answer: 0,
      explanation: 'For WPA2-Personal on a Cisco WLC, set Layer 2 Security to WPA+WPA2, enable the WPA2 policy with AES encryption, then under Authentication Key Management disable 802.1X, enable PSK, choose ASCII (8 to 63 characters) or HEX (64 hex digits), and enter the key. With 802.1X selected the WLAN expects a RADIUS server, so PSK clients cannot join. AES is the correct WPA2 cipher. ASCII is the common, valid choice. Layer 2 Security None would make the WLAN open.',
      ref: 'Lesson l5-10; card:wificfg',
    },
    {
      id: 'q5-0059', obj: '5.10', type: 'order', difficulty: 2,
      stem: 'Put the steps for creating a WPA2-PSK WLAN in the Cisco WLC (AireOS) GUI in order.',
      options: ['Under Security > Layer 2, choose WPA+WPA2, WPA2 with AES, and PSK key management, then enter the passphrase', 'On the WLANs tab, choose Create New and enter the profile name and SSID', 'Click Apply and confirm clients can associate', 'On the General tab, set Status to Enabled and pick the interface (VLAN) for client traffic'],
      answer: [1, 3, 0, 2],
      explanation: 'Start on the WLANs tab with Create New, giving a profile name, the SSID clients will see, and a WLAN ID. On the General tab, enable the WLAN and map it to an interface or interface group, which decides the VLAN client traffic lands in. On Security > Layer 2, configure WPA+WPA2 with the WPA2 policy, AES, and PSK instead of 802.1X, plus the passphrase. Then apply the changes and test. QoS and Advanced tab settings, such as the QoS profile (Platinum for voice), session timeout and FlexConnect, can be adjusted before applying.',
      ref: 'Lesson l5-10; card:wificfg',
    },
    {
      id: 'q5-0060', obj: '5.10', type: 'single', difficulty: 3,
      stem: 'A WPA2-PSK WLAN was created on the WLC and its security settings are correct, but clients that connect get addresses in the management VLAN instead of the scanner VLAN 40. What should be changed?',
      options: ['The interface selected on the WLAN\'s General tab, so the WLAN maps to the dynamic interface for VLAN 40', 'The PSK passphrase, which also decides the VLAN each client is placed in', 'The QoS profile on the QoS tab, which sets the 802.1Q VLAN tag the WLC applies to each client\'s traffic', 'The radio policy, changed to 5 GHz only so that clients join the scanner VLAN instead'],
      answer: 0,
      explanation: 'On a Cisco WLC each WLAN is mapped to an interface, either the management interface or a dynamic interface tied to a VLAN, and client traffic is bridged into that VLAN, where DHCP hands out addresses. Clients landing in the management VLAN means the WLAN is still mapped to the management interface. Select the dynamic interface for VLAN 40 (create it first if it does not exist). The passphrase affects whether clients can join, not where they land. QoS profiles affect priority. Radio policy decides which bands advertise the SSID.',
      ref: 'Lesson l5-10; card:wificfg',
    },

    /* ---- 5.7 more ---- */
    {
      id: 'q5-0061', obj: '5.7', type: 'single', difficulty: 2,
      stem: 'With DHCP snooping enabled, an attacker\'s laptop on an untrusted port sends hundreds of DHCP Discover messages per second with random MAC addresses to empty the DHCP pool. Which command limits this on the access port?',
      options: ['ip dhcp snooping limit rate 15', 'ip dhcp snooping trust', 'switchport port-security violation protect', 'ip arp inspection limit rate 15'],
      answer: 0,
      explanation: 'A DHCP starvation attack requests leases with fake client MACs until the pool is exhausted, often followed by a rogue server offering bad settings. ip dhcp snooping limit rate 15 caps the DHCP packets per second accepted on the port; if the rate is exceeded the port is err-disabled. Port security limiting MACs also helps, though attackers can vary the client hardware address inside the DHCP message instead. Trusting the port would make things worse. ip arp inspection limit rate limits ARP packets, not DHCP.',
      ref: 'Lesson l5-7; card:snooping',
    },
  );

  /* =====================================================================
   * 6.0 AUTOMATION AND PROGRAMMABILITY
   * ===================================================================== */
  const EX_JSON = cli('GET /api/v1/devices/HPL-CORE (response body)', `
{
  "hostname": "HPL-CORE",
  "platform": "C9300-48P",
  "managed": true,
  "uptimeDays": 41,
  "location": null,
  "interfaces": [
    { "name": "GigabitEthernet1/0/1", "enabled": true,  "vlan": 10 },
    { "name": "GigabitEthernet1/0/2", "enabled": false, "vlan": 20 }
  ],
  "ntp": { "servers": ["10.0.0.123", "10.0.0.124"], "synced": true }
}
`);

  Q.push(
    /* ---- 6.1 Automation impact ---- */
    {
      id: 'q6-0001', obj: '6.1', type: 'multi', difficulty: 1, pick: 2,
      stem: 'Harbor Point plans to push VLAN and ACL changes to 300 switches with automation instead of typing them by hand. Which two benefits should it expect? (Choose two.)',
      options: ['Consistent configurations, with fewer typing errors', 'Changes deployed to many devices far faster', 'No further need for staff to understand networking', 'Elimination of all outages caused by changes', 'Devices that no longer need a management plane'],
      answer: [0, 1],
      explanation: 'Automation applies the same tested template every time, so configurations stay consistent and the typos that cause many outages disappear, and it scales: 300 switches take about as long as 3. It does not remove the need for networking skill; someone must design the templates, review the changes and troubleshoot. A bad template can break 300 devices as quickly as a good one fixes them, so testing and staged rollouts still matter, and automation cannot eliminate outages. Devices still need a management plane, which is how automation tools reach them.',
      ref: 'Lesson l6-1; card:netauto',
    },
    {
      id: 'q6-0002', obj: '6.1', type: 'single', difficulty: 2,
      stem: 'Over two years, engineers fixed problems on individual switches by hand, and the switches no longer match the approved standard configuration. What is this called, and how does automation help?',
      options: ['Configuration drift; automated compliance checks compare devices with the source of truth and restore it', 'Route flapping; automation shortens the routing timers so the switches converge back to the standard', 'Bit rot; automation reformats and replaces the device flash so the saved configuration stops decaying', 'Split brain; automation enables HSRP so that only one switch at a time holds the standard configuration'],
      answer: 0,
      explanation: 'Configuration drift is the gradual divergence of real device configurations from the intended standard, usually through one-off manual changes. Automation tools and controllers keep a source of truth (templates and variables, often in version control), regularly compare running configurations against it and report or correct the differences. Route flapping is a routing instability. Split brain describes two devices both believing they are active, as in a broken FHRP. Bit rot is not a networking term here.',
      ref: 'Lesson l6-1; card:netauto',
    },
    {
      id: 'q6-0003', obj: '6.1', type: 'single', difficulty: 2,
      stem: 'What does intent-based networking mean?',
      options: ['Administrators state the desired outcome, and a controller turns it into device configuration and keeps checking it', 'Each device is configured by hand from a printed intent document that records why every command was added', 'Routers infer the intent of each flow from packet sizes and timing, then choose a path to match it', 'The network uses only static routes, so every path is chosen deliberately by the administrator'],
      answer: 0,
      explanation: 'In intent-based networking, an operator describes what should happen, such as "guest users may reach only the internet", and the controller (Cisco Catalyst Center, formerly DNA Center, in campus networks) turns that intent into policy and configuration on many devices. It then keeps verifying, using telemetry and assurance, that the network still behaves as intended. Manual configuration from a document is the traditional model. Guessing intent from packets is not a thing, and routing method is unrelated.',
      ref: 'Lesson l6-1; card:sdn',
    },
    {
      id: 'q6-0004', obj: '6.1', type: 'single', difficulty: 3,
      stem: 'A script that adds a VLAN to every access switch fails halfway through, leaving 150 switches changed and 150 untouched. Which practice best reduces the impact of this kind of failure in future?',
      options: ['Use idempotent tools with pre-checks, staged rollouts and an automated rollback or verification step', 'Go back to manual changes on every switch, so that each change is checked by an engineer', 'Run the script only during business hours, so that staff are on hand to fix failures as they happen', 'Disable logging so the script runs faster and finishes before any device can time out'],
      answer: 0,
      explanation: 'Automation should be designed for partial failure. Idempotent tasks (the result is the same no matter how many times they run) let you simply rerun the job to finish the remaining switches without harming those already done. Pre-checks catch problems early, staged rollouts limit the blast radius to a small group first, and post-change verification or rollback catches mistakes. Abandoning automation brings back the error rate it replaced. Business hours increase user impact. Logging is how you find out what happened.',
      ref: 'Lesson l6-1; card:cfgmgmt',
    },

    /* ---- 6.2 Traditional vs controller-based ---- */
    {
      id: 'q6-0005', obj: '6.2', type: 'single', difficulty: 1,
      stem: 'How does controller-based networking differ from traditional networking?',
      options: ['A central controller holds the network-wide view and pushes configuration and policy, instead of each device being configured and deciding on its own', 'Controller-based networks do not use routers or switches; the controller itself forwards all user traffic between endpoints', 'In traditional networks a central controller computes every forwarding decision, while controller-based devices each run their own protocols', 'Controller-based networks remove the data plane from the devices, so packets are forwarded only by software in the controller'],
      answer: 0,
      explanation: 'Traditionally, every device is configured one at a time and runs a distributed control plane: each router runs OSPF and builds its own table, each switch runs its own spanning tree. In controller-based networking, a controller centralizes the view and much of the control and management, configuring devices through southbound APIs and exposing northbound APIs to applications. Devices still exist and still forward traffic, so the data plane remains on the devices. The third option describes the controller model, not the traditional one.',
      ref: 'Lesson l6-2; card:sdn',
    },
    {
      id: 'q6-0006', obj: '6.2', type: 'match', difficulty: 2,
      stem: 'Match each function to the plane it belongs to.',
      options: ['Forwarding a frame out the port listed in the MAC address table', 'Exchanging OSPF LSAs to build the routing table', 'An administrator connecting with SSH to change the configuration', 'Sending ARP replies and spanning tree BPDUs', 'Polling interface counters with SNMP'],
      targets: ['Data plane', 'Control plane', 'Management plane'],
      answer: [[0, 0], [1, 1], [2, 2], [3, 1], [4, 2]],
      explanation: 'The data (forwarding) plane moves user traffic, using tables that are already built: switching frames, routing packets, applying ACLs and NAT. The control plane is the device\'s decision-making and builds those tables, through routing protocols, spanning tree, ARP and similar exchanges. The management plane is how people and tools operate the device: SSH, SNMP, syslog, NETCONF and the like. SDN moves some or all control and management functions to a controller, while the data plane stays on the devices.',
      ref: 'Lesson l6-2; card:sdn',
    },
    {
      id: 'q6-0007', obj: '6.2', type: 'multi', difficulty: 2, pick: 2,
      stem: 'Which two statements describe traditional (non-controller) network management? (Choose two.)',
      options: ['Each device is configured individually, usually through the CLI', 'The control plane is distributed: every device runs its own protocols and makes its own decisions', 'Policy is defined once on a central controller and pushed to every device automatically', 'Devices are managed only through northbound REST APIs exposed by each device', 'Fabric overlays are built automatically between all the access switches'],
      answer: [0, 1],
      explanation: 'In the traditional model an engineer logs in to each box, by console, Telnet or SSH, and configures it one by one, while every device runs its own control plane protocols (OSPF, STP and so on) and reaches decisions independently. Defining policy once and pushing it everywhere, exposing northbound REST APIs and building fabric overlays automatically are all hallmarks of controller-based networking, such as Cisco Catalyst Center with SD-Access.',
      ref: 'Lesson l6-2; card:sdn',
    },
    {
      id: 'q6-0008', obj: '6.2', type: 'single', difficulty: 2,
      stem: 'In a controller-based network, what normally happens to user traffic if the controller becomes unreachable for a short time?',
      options: ['Devices keep forwarding with their current configuration; new changes and some central functions wait for the controller', 'All traffic stops immediately, because user traffic is carried through the controller and only the controller forwards packets', 'Devices reboot to factory defaults so they can be rediscovered and reprovisioned when the controller returns', 'Devices switch to Telnet management automatically and keep running the last policy until an engineer logs in'],
      answer: 0,
      explanation: 'In Cisco\'s controller-based designs, the controller handles management, policy and parts of the control plane, but devices still forward traffic in their own data planes. If the controller is briefly lost, devices keep running with what they already have, while new provisioning, policy changes and analytics pause until it returns. That is why controllers are deployed in clusters for redundancy. User traffic does not flow through the controller, devices do not wipe themselves, and management protocols do not change on their own.',
      ref: 'Lesson l6-2; card:sdn',
    },
    {
      id: 'q6-0009', obj: '6.2', type: 'single', difficulty: 3,
      stem: 'A new campus policy says contractors may reach only the ticketing system, on every floor. In the traditional model this means editing ACLs on 120 switches. How would a controller-based solution such as Cisco Catalyst Center with SD-Access handle it?',
      options: ['Define the policy once between the contractor and ticketing groups; the controller renders and deploys it everywhere', 'Have the controller export a CLI script with the new ACL that engineers then paste into each switch over SSH', 'Push a new OSPF area to every switch so contractor subnets can reach only the ticketing system\'s area', 'Configure the policy on one switch and have every other switch learn it from its neighbors through CDP'],
      answer: 0,
      explanation: 'Controller-based networks define policy in terms of groups and intent, not individual interfaces. In SD-Access, users and devices are placed into scalable groups (security group tags) and the policy is written once as which groups may talk. Catalyst Center then pushes the needed configuration across the fabric, and the policy follows the user wherever they connect. Exporting scripts to paste by hand is still per-device work. OSPF areas control routing, not access policy. CDP discovers neighbors; it does not distribute policy.',
      ref: 'Lesson l6-2; card:sdn',
    },

    /* ---- 6.3 SDN architecture ---- */
    {
      id: 'q6-0010', obj: '6.3', type: 'match', difficulty: 2,
      stem: 'Match each SDN term to its description.',
      options: ['Northbound API', 'Southbound API', 'Underlay', 'Overlay', 'Fabric'],
      targets: ['Virtual tunnels or networks built on top of the physical network', 'Interface the controller uses to program network devices', 'Interface applications use to talk to the controller', 'The whole system of underlay, overlay and devices managed as one', 'The physical network and its routing that provide basic IP connectivity'],
      answer: [[0, 2], [1, 1], [2, 4], [3, 0], [4, 3]],
      explanation: 'Picture the controller in the middle. Above it, applications and scripts use northbound APIs, typically REST with JSON, to ask for information or request changes. Below it, the controller uses southbound APIs, such as NETCONF, RESTCONF, OpenFlow or plain SSH and CLI, to program devices. The underlay is the physical network of links and an IGP that gives every device IP reachability. The overlay is the logical network of tunnels (VXLAN in SD-Access) running over it. The fabric is the combination, managed as one.',
      ref: 'Lesson l6-3; card:sdn',
    },
    {
      id: 'q6-0011', obj: '6.3', type: 'multi', difficulty: 2, pick: 2,
      stem: 'Which two are examples of southbound interfaces a controller can use to configure network devices? (Choose two.)',
      options: ['NETCONF', 'OpenFlow', 'A REST API used by a ticketing app to query the controller', 'A web dashboard used by the operations team', 'JSON'],
      answer: [0, 1],
      explanation: 'Southbound interfaces connect the controller to the devices it manages. NETCONF (over SSH, with YANG data models) and OpenFlow (which programs flow tables directly) are classic examples, and RESTCONF, SNMP and CLI over SSH are also used. A ticketing app calling the controller\'s REST API uses a northbound interface. A dashboard is a user interface, not a device API. JSON is a data format that may be carried by either kind of API; it is not an interface by itself.',
      ref: 'Lesson l6-3; card:sdn',
    },
    {
      id: 'q6-0012', obj: '6.3', type: 'single', difficulty: 3,
      stem: 'In Cisco SD-Access, which protocols provide the overlay data plane and control plane?',
      options: ['VXLAN for the data plane and LISP for the control plane', 'OSPF for the data plane and BGP for the control plane', 'GRE for the data plane and EIGRP for the control plane', 'MPLS for the data plane and RIP for the control plane'],
      answer: 0,
      explanation: 'SD-Access builds its overlay with VXLAN encapsulation, which carries Layer 2 or Layer 3 traffic across the routed underlay along with a group tag. LISP (Locator/ID Separation Protocol) is the control plane: fabric control-plane nodes keep a database mapping endpoint identities to the fabric edge nodes where they live, so edges can look up where to tunnel traffic. Cisco TrustSec security group tags form the policy plane. The underlay itself typically runs IS-IS when Catalyst Center automates it. OSPF, BGP, EIGRP and RIP are not the SD-Access overlay protocols.',
      ref: 'Lesson l6-3; card:sdn',
    },
    {
      id: 'q6-0013', obj: '6.3', type: 'single', difficulty: 2,
      stem: 'What is the main purpose of separating the control plane from the data plane in SDN?',
      options: ['So traffic-flow decisions can be made centrally with a network-wide view, while devices concentrate on forwarding', 'So devices can stop forwarding traffic and leave all packet handling to the central controller', 'So every device can run more routing protocols at once, each in its own separate control plane', 'So management traffic between the controller and the devices is always encrypted end to end'],
      answer: 0,
      explanation: 'In classic SDN, a centralized controller takes over the control plane, computing forwarding behavior from a full view of the network, and programs the devices, which then just forward according to what they were told. This enables global optimization, consistent policy and programmability through APIs. Devices still forward; that is the data plane. The goal is fewer, central decisions, not more protocols per box. Encryption of management traffic depends on the protocols used (SSH, HTTPS) and is not the purpose of the separation.',
      ref: 'Lesson l6-3; card:sdn',
    },
    {
      id: 'q6-0014', obj: '6.3', type: 'single', difficulty: 2,
      stem: 'Which component in an SD-Access fabric connects the fabric to external networks such as the data center, the WAN or the internet?',
      options: ['The fabric border node', 'The fabric edge node', 'The control-plane node', 'The wireless access point'],
      answer: 0,
      explanation: 'Border nodes are the gateways between the SD-Access fabric and everything outside it; they translate between fabric virtual networks and external routing domains. Edge nodes are the access switches where endpoints connect; they register endpoints and encapsulate traffic into VXLAN. Control-plane nodes run the LISP map server and resolver that track where endpoints are. Access points attach to edge nodes and carry wireless clients into the fabric.',
      ref: 'Lesson l6-3; card:sdn',
    },
    {
      id: 'q6-0015', obj: '6.3', type: 'single', difficulty: 1,
      stem: 'An operations team writes a Python script that asks the campus controller for a list of all devices with high CPU. Which interface does the script use?',
      options: ['The controller\'s northbound API', 'The controller\'s southbound API', 'The device console port', 'The data plane'],
      answer: 0,
      explanation: 'Northbound APIs face upward toward applications, scripts and orchestration tools; Cisco Catalyst Center exposes a REST API with JSON for exactly this kind of query. The controller then uses its southbound interfaces, such as NETCONF, SNMP or CLI, to gather and push information to the devices. The script never touches device consoles or the data plane; the controller abstracts those details.',
      ref: 'Lesson l6-3; card:sdn',
    },
    {
      id: 'q6-0016', obj: '6.3', type: 'multi', difficulty: 3, pick: 2,
      stem: 'Which two statements about underlay and overlay networks are true? (Choose two.)',
      options: ['The overlay depends on the underlay for IP reachability between tunnel endpoints', 'An underlay problem, such as a failed link with no alternate path, can break overlay traffic even with a correct overlay', 'The overlay replaces the underlay, so physical links and underlay routing are no longer needed', 'Overlay tunnels can carry only Layer 2 traffic, so routed traffic must stay in the underlay', 'The underlay must use static routing only, so that tunnel endpoints never move'],
      answer: [0, 1],
      explanation: 'An overlay is a set of logical tunnels, and tunnel endpoints must reach each other through the underlay\'s routing. If the underlay cannot deliver packets between two endpoints, the overlay between them is down too, no matter how correct its own configuration is, which is why troubleshooting a fabric often starts with underlay reachability. The overlay rides on physical links; it does not replace them. Overlays such as VXLAN can carry both Layer 2 and Layer 3 traffic. Underlays usually run a dynamic IGP such as IS-IS or OSPF for fast convergence.',
      ref: 'Lesson l6-3; card:sdn',
    },

    /* ---- 6.4 AI and ML ---- */
    {
      id: 'q6-0017', obj: '6.4', type: 'single', difficulty: 1,
      stem: 'A network assurance platform analyzes months of interface statistics and warns that a WAN link is likely to exceed 90 percent utilization within three weeks. Which kind of AI is this?',
      options: ['Predictive AI', 'Generative AI', 'Rule-based scripting only', 'A routing protocol'],
      answer: 0,
      explanation: 'Predictive AI uses machine learning models trained on historical data to forecast future values or flag likely events: capacity trends, failing optics, unusual traffic. Generative AI creates new content such as text, configuration drafts or summaries. A fixed threshold rule ("alert at 90 percent") reacts only after the fact and does not forecast. Routing protocols choose paths; they do not forecast utilization.',
      ref: 'Lesson l6-4; card:aiml',
    },
    {
      id: 'q6-0018', obj: '6.4', type: 'single', difficulty: 2,
      stem: 'An engineer asks an AI assistant built into the network management tool, in plain English, to draft an ACL that blocks guest VLAN traffic to the finance subnet. Which statement best describes good practice?',
      options: ['This is generative AI; a person should review and test its output before deploying it, because it can be plausibly wrong', 'This is predictive AI, and because it forecasts from past changes its output can be deployed without review', 'AI assistants can only summarize logs and alerts, so the engineer must write the ACL by hand instead', 'The AI output is guaranteed correct because it was trained on Cisco documentation, so testing it adds nothing'],
      answer: 0,
      explanation: 'Generating new text such as a configuration from a natural-language request is generative AI. These models can be very helpful, but they can also hallucinate, producing commands or logic that look right and are wrong: a reversed source and destination, a missing permit, the wrong wildcard. Treat the output as a draft, review it, test it in a lab or with change validation, and follow normal change control. Predictive AI forecasts. Assistants can generate configuration, and no training data guarantees correctness.',
      ref: 'Lesson l6-4; card:aiml',
    },
    {
      id: 'q6-0019', obj: '6.4', type: 'multi', difficulty: 2, pick: 2,
      stem: 'Which two are realistic uses of machine learning in network operations? (Choose two.)',
      options: ['Learning a baseline of normal behavior and flagging anomalies, such as a DNS traffic spike from one host', 'Grouping similar client onboarding failures to point at a likely root cause', 'Replacing IP addressing with addresses the model learns from traffic patterns', 'Guaranteeing that no security incident can occur once the model is trained', 'Eliminating the need to collect telemetry, because the model predicts it instead'],
      answer: [0, 1],
      explanation: 'Machine learning finds patterns in large amounts of data. Unsupervised models can learn what "normal" looks like for a site, a time of day or a device type and flag deviations, which suits anomaly detection. Clustering and correlation help group thousands of failure events into a few likely causes, cutting troubleshooting time. ML does not replace protocols such as IP addressing, cannot guarantee security, and depends heavily on telemetry: without data there is nothing to learn from.',
      ref: 'Lesson l6-4; card:aiml',
    },
    {
      id: 'q6-0020', obj: '6.4', type: 'single', difficulty: 2,
      stem: 'What is the difference between supervised and unsupervised machine learning?',
      options: ['Supervised learning trains on labeled examples with known answers; unsupervised learning finds structure in unlabeled data', 'Supervised learning needs a human watching it in real time; unsupervised learning runs overnight', 'Supervised learning is used only for routing decisions, while unsupervised learning is used only for switching decisions', 'There is no difference; the terms are interchangeable and describe the same training process with different vendors'],
      answer: 0,
      explanation: 'Supervised learning is given inputs paired with correct outputs, for example past incidents labeled "fiber cut" or "power failure", and learns to predict the label for new data. Unsupervised learning has no labels; it discovers groupings or outliers by itself, which suits anomaly detection where you cannot list every possible problem in advance. "Supervised" does not mean a person watches it run, and neither type is tied to routing or switching.',
      ref: 'Lesson l6-4; card:aiml',
    },

    /* ---- 6.5 REST APIs ---- */
    {
      id: 'q6-0021', obj: '6.5', type: 'match', difficulty: 1,
      stem: 'Match each CRUD operation to the HTTP method normally used for it in a REST API.',
      options: ['Create', 'Read', 'Update (replace)', 'Update (partial)', 'Delete'],
      targets: ['PATCH', 'GET', 'DELETE', 'POST', 'PUT'],
      answer: [[0, 3], [1, 1], [2, 4], [3, 0], [4, 2]],
      explanation: 'POST creates a new resource, often in a collection, with the server choosing its identifier. GET reads a resource and must not change anything. PUT replaces a resource with the representation in the request body, while PATCH changes only the fields supplied. DELETE removes the resource. Some APIs also use PUT to create a resource at a URL the client specifies, but on the exam POST maps to Create and PUT and PATCH to Update.',
      ref: 'Lesson l6-5; card:rest',
    },
    {
      id: 'q6-0022', obj: '6.5', type: 'multi', difficulty: 2, pick: 2,
      stem: 'Refer to the exhibit. Which two statements about this API call are true? (Choose two.)',
      exhibit: cli('REST call', `
POST /api/v1/vlans HTTP/1.1
Host: controller.hpl.local
Authorization: Bearer eyJhbGciOi...
Content-Type: application/json

{ "id": 40, "name": "SCANNERS" }

HTTP/1.1 201 Created
Location: /api/v1/vlans/40
Content-Type: application/json

{ "id": 40, "name": "SCANNERS", "status": "pending-deploy" }
`),
      options: ['The VLAN resource was created, and its URL is /api/v1/vlans/40', 'The client authenticated with a bearer token in the Authorization header', 'The request body was encoded as XML, and the response as JSON', 'The VLAN already existed and was replaced with the new values', 'The server had an internal error but still returned the VLAN'],
      answer: [0, 1],
      explanation: 'A 2xx code means success, and 201 Created specifically means a new resource was created; the Location header gives its URL. The Authorization: Bearer header carries a token obtained earlier, the usual way controllers authenticate API calls. Content-Type: application/json says the body is JSON, not XML. Replacing an existing resource would usually be a PUT answered with 200 OK or 204 No Content. Server errors are 5xx codes, such as 500. The body adds that deployment to devices is still pending, which the controller does asynchronously.',
      ref: 'Lesson l6-5; card:rest',
    },
    {
      id: 'q6-0023', obj: '6.5', type: 'match', difficulty: 2,
      stem: 'Match each HTTP status code to its meaning.',
      options: ['200', '204', '400', '401', '404', '500'],
      targets: ['Not Found: the URL does not identify an existing resource', 'OK: the request succeeded and a body is returned', 'Unauthorized: authentication is missing or invalid', 'No Content: success, with no body returned', 'Internal Server Error: the server failed while processing', 'Bad Request: the request is malformed, such as invalid JSON'],
      answer: [[0, 1], [1, 3], [2, 5], [3, 2], [4, 0], [5, 4]],
      explanation: 'The first digit gives the class: 2xx success, 3xx redirection, 4xx client errors (fix your request), 5xx server errors (the server broke). 200 OK is the general success code, often with data in the body, and 204 No Content is common after a successful DELETE or PUT. 400 means the server could not parse or accept the request. 401 means the client is not authenticated, despite the name; 403 Forbidden means authenticated but not allowed. 404 means no resource at that URL. 500 means something failed on the server.',
      ref: 'Lesson l6-5; card:rest',
    },
    {
      id: 'q6-0024', obj: '6.5', type: 'multi', difficulty: 2, pick: 2,
      stem: 'Which two statements describe REST APIs? (Choose two.)',
      options: ['They are stateless: each request carries everything the server needs, including authentication', 'They identify resources with URIs and use standard HTTP methods to act on them', 'They require a persistent TCP session that stores the client\'s state on the server', 'They can only exchange data encoded as XML, never JSON or YAML', 'They require SNMP to carry their messages between client and server'],
      answer: [0, 1],
      explanation: 'REST is an architectural style built on HTTP. Statelessness means the server keeps no client session between requests, so every request includes its own credentials, often a token in the Authorization header, and any context it needs. Resources such as /api/v1/devices/42 are addressed by URIs and manipulated with GET, POST, PUT, PATCH and DELETE. Responses can be in any format both sides agree on through the Content-Type and Accept headers; JSON is the most common, with XML and YAML possible. SNMP is a separate management protocol.',
      ref: 'Lesson l6-5; card:rest',
    },
    {
      id: 'q6-0025', obj: '6.5', type: 'single', difficulty: 3,
      stem: 'A script authenticates to a controller API with the header Authorization: Basic aHBsYWRtaW46TmlnaHQyMDI2IQ==. A colleague says the credentials are safe because they are encrypted. What is the correct response?',
      options: ['Basic authentication only Base64-encodes username:password, which anyone can decode, so it needs HTTPS', 'The colleague is right; Base64 is strong encryption, so the header is safe even over plain HTTP', 'Basic authentication uses a one-time token, so capturing the header is harmless after the first call', 'The header is a salted hash of the password, so the password cannot be recovered from a capture'],
      answer: 0,
      explanation: 'HTTP Basic authentication joins the username and password with a colon and Base64-encodes them. Base64 is an encoding, not encryption: decoding that string yields the username and password immediately. That is acceptable only inside TLS (HTTPS), which encrypts the whole request. Many controllers, including Cisco Catalyst Center, use Basic authentication once to obtain a short-lived token, then use the token on later calls, which limits exposure. Basic credentials are neither one-time nor hashed.',
      ref: 'Lesson l6-5; card:rest',
    },
    {
      id: 'q6-0026', obj: '6.5', type: 'single', difficulty: 2,
      stem: 'A client sends a request with the header Accept: application/json. What does it tell the server?',
      options: ['The client wants the response body encoded as JSON', 'The body of this request is formatted as JSON', 'The client accepts any authentication method the server offers', 'The server must answer using HTTP/2'],
      answer: 0,
      explanation: 'Accept tells the server which media types the client can handle in the response, so the server can choose its format, here JSON. Content-Type describes the format of the body being sent, in the request or the response, so a POST with a JSON body carries Content-Type: application/json. Authentication goes in the Authorization header (or a vendor-specific token header). Accept has nothing to do with the HTTP version.',
      ref: 'Lesson l6-5; card:rest',
    },
    {
      id: 'q6-0027', obj: '6.5', type: 'single', difficulty: 2,
      stem: 'A script must change only the description of one interface through a REST API, leaving every other attribute as it is. Which method is most appropriate?',
      options: ['PATCH', 'PUT', 'POST', 'GET'],
      answer: 0,
      explanation: 'PATCH sends a partial update: only the fields included, here the description, are changed. PUT replaces the entire resource with the body sent, so any attribute left out may be reset to a default, which is risky for this task unless you first GET the full resource and send it all back. POST is for creating new resources or triggering actions. GET only reads. Check the API documentation, because some APIs implement only PUT for updates.',
      ref: 'Lesson l6-5; card:rest',
    },
    {
      id: 'q6-0028', obj: '6.5', type: 'single', difficulty: 3,
      stem: 'A script calls GET https://controller.hpl.local/api/v1/devices with a token that worked yesterday and now receives 401 Unauthorized. Other users can still reach the API. What is the most likely cause and fix?',
      options: ['The token has expired; request a new token and retry', 'The URL is wrong; use POST instead of GET', 'The controller is down; wait for a 500 error to clear', 'The script\'s account was deleted, which always returns 404'],
      answer: 0,
      explanation: '401 means the request lacks valid authentication. API tokens usually have a limited lifetime, often an hour or so, so a token from yesterday has almost certainly expired: the script should authenticate again for a fresh token, ideally automatically whenever it sees a 401. A wrong URL or method would produce 404 or 405 Method Not Allowed. Other users reach the API, so it is not down, and a down server returns 5xx or no response. Deleted accounts fail authentication with 401 too, but that is far less likely than an expired token.',
      ref: 'Lesson l6-5; card:rest',
    },

    /* ---- 6.6 Configuration management: Ansible and Terraform ---- */
    {
      id: 'q6-0029', obj: '6.6', type: 'multi', difficulty: 2, pick: 3,
      stem: 'Which three statements describe Ansible? (Choose three.)',
      options: ['It is agentless, connecting to network devices over SSH or APIs', 'Playbooks are written in YAML', 'It uses a push model: the control node sends changes to managed devices', 'It requires an agent installed on every switch', 'Its configuration files are written in HCL and tracked in a state file'],
      answer: [0, 1, 2],
      explanation: 'Ansible runs from a control node and needs nothing installed on the targets: for network gear it connects with SSH (the network_cli connection) or with APIs such as NETCONF and RESTCONF. Playbooks are YAML files listing plays and tasks, which call modules such as cisco.ios.ios_config against hosts from an inventory. It pushes changes when you run the playbook. Agents on devices are a feature of tools like Puppet and Chef in their classic form. HCL and a state file describe Terraform.',
      ref: 'Lesson l6-6; card:cfgmgmt',
    },
    {
      id: 'q6-0030', obj: '6.6', type: 'multi', difficulty: 2, pick: 3,
      stem: 'Which three statements describe Terraform? (Choose three.)',
      options: ['It is declarative: configuration files written in HCL describe the desired end state', 'It records the resources it manages in a state file', 'terraform plan shows the changes before terraform apply makes them', 'It uses agents on each device that pull Ruby manifests every 30 minutes', 'Its playbooks are YAML task lists executed in the order written', 'It is a monitoring protocol that replaces SNMP'],
      answer: [0, 1, 2],
      explanation: 'Terraform, from HashiCorp, is declarative: you describe the desired end state in HashiCorp Configuration Language (HCL). It compares that with its state file, which records what it manages, and with the real infrastructure, then terraform plan shows the creates, changes and destroys, and terraform apply makes only those. Providers translate resources into API calls for clouds, controllers and some network platforms. Pull-based agents with Ruby manifests describe Puppet or Chef. YAML playbooks run in order belong to Ansible. Terraform does not monitor anything.',
      ref: 'Lesson l6-6; card:cfgmgmt',
    },
    {
      id: 'q6-0031', obj: '6.6', type: 'single', difficulty: 3,
      stem: 'An engineer deletes a resource definition from a Terraform configuration file and runs terraform plan. The plan shows that Terraform will destroy the real resource. Why?',
      options: ['Terraform is declarative: the resource is in state but no longer in the configuration, so it plans to remove it', 'Terraform always destroys and re-creates every resource on each run, whether or not the configuration changed', 'The state file is corrupted, so Terraform no longer recognizes the resource and plans to delete it', 'Terraform cannot track existing resources, so it destroys what it finds and rebuilds only what the file lists'],
      answer: 0,
      explanation: 'Terraform reconciles three things: the configuration (what you want), the state file (what Terraform knows it manages) and the real infrastructure. If a resource is in state but no longer in the configuration, the desired state no longer includes it, so the plan proposes destroying it. That is exactly why terraform plan exists: review before apply. Terraform changes only what differs, it does not rebuild everything. Nothing here suggests corruption, and tracking existing resources is the purpose of the state file.',
      ref: 'Lesson l6-6; card:cfgmgmt',
    },
    {
      id: 'q6-0032', obj: '6.6', type: 'single', difficulty: 2,
      stem: 'Refer to the exhibit. What is this file?',
      exhibit: cli('ntp.yml', `
---
- name: Standard NTP on access switches
  hosts: access_switches
  gather_facts: no
  tasks:
    - name: Configure NTP servers
      cisco.ios.ios_config:
        lines:
          - ntp server 10.0.0.123
          - ntp server 10.0.0.124
    - name: Save configuration
      cisco.ios.ios_config:
        save_when: modified
`),
      options: ['An Ansible playbook, written in YAML, that runs two tasks against the access_switches group', 'A Terraform configuration written in HCL that declares the NTP servers for the access switches', 'A JSON payload for a REST API call that adds the NTP servers to each switch', 'A Python script that uses Netmiko to push the NTP lines over SSH'],
      answer: 0,
      explanation: 'The leading ---, the hosts and tasks keys, the indentation-based structure and the module name cisco.ios.ios_config all mark this as an Ansible playbook in YAML. It targets the access_switches group from the inventory and runs two tasks: add the NTP server lines, then save the configuration only if something changed. ios_config only pushes lines that are missing, which makes the play idempotent. HCL uses blocks with braces, such as resource "type" "name" { ... }. JSON uses braces and quoted keys throughout. A Python script would contain import statements and code.',
      ref: 'Lesson l6-6; card:cfgmgmt',
    },
    {
      id: 'q6-0033', obj: '6.6', type: 'match', difficulty: 2,
      stem: 'Match each characteristic to the tool it describes.',
      options: ['Written in YAML playbooks', 'Written in HCL', 'Keeps a state file of managed resources', 'Runs tasks in the order written in the playbook', 'Shows a plan of changes before applying them'],
      targets: ['Ansible', 'Terraform'],
      answer: [[0, 0], [1, 1], [2, 1], [3, 0], [4, 1]],
      explanation: 'Ansible playbooks are YAML lists of tasks executed in order against inventory hosts, which is why Ansible is often called procedural, even though its individual modules aim to be idempotent. Terraform configurations are HCL descriptions of desired resources. Terraform records what it manages in a state file, works out the dependency order itself, and shows a plan of creates, changes and destroys before apply. Ansible has a check mode for dry runs, but the plan-and-state workflow is Terraform\'s signature. Both are agentless.',
      ref: 'Lesson l6-6; card:cfgmgmt',
    },
    {
      id: 'q6-0034', obj: '6.6', type: 'single', difficulty: 2,
      stem: 'What does it mean that an Ansible task is idempotent?',
      options: ['Running it several times gives the same end state as running it once, changing nothing if already correct', 'It runs on only one device at a time, so a failure on one device cannot affect the others', 'It can never fail, because Ansible rolls the device back automatically on any error', 'It requires a reboot after each run so the device loads the new configuration cleanly'],
      answer: 0,
      explanation: 'An idempotent task checks the current state and acts only when needed: if the NTP server line is already present, ios_config reports ok (no change) instead of re-adding it. That makes it safe to rerun a whole playbook after a partial failure or on a schedule to correct drift. Idempotence says nothing about how many devices run at once (Ansible runs in parallel by default), does not prevent failures, and does not involve reboots.',
      ref: 'Lesson l6-6; card:cfgmgmt',
    },

    /* ---- 6.7 JSON ---- */
    {
      id: 'q6-0035', obj: '6.7', type: 'single', difficulty: 2,
      stem: 'Refer to the exhibit. What is the JSON data type of the value of "interfaces"?',
      exhibit: EX_JSON,
      options: ['An array of objects', 'An object of arrays', 'A string', 'A list of key-value strings'],
      answer: 0,
      explanation: 'Square brackets [ ] mark a JSON array: an ordered list of values separated by commas. Each element here is enclosed in curly braces { }, which makes it an object, an unordered set of "key": value pairs. So "interfaces" is an array of two objects, each with name, enabled and vlan keys. "ntp" is the opposite case: an object that contains an array ("servers"). A string would be in double quotes. JSON has no separate list-of-strings type; arrays can hold any values.',
      ref: 'Lesson l6-7; card:dataformats',
    },
    {
      id: 'q6-0036', obj: '6.7', type: 'multi', difficulty: 2, pick: 2,
      stem: 'Refer to the exhibit. Which two statements about the values are true? (Choose two.)',
      exhibit: EX_JSON,
      options: ['"managed" and "synced" are booleans', '"location" is null, meaning it has no value', '"uptimeDays" is a string', '"vlan" values are strings because they are inside objects', '"platform" is a number'],
      answer: [0, 1],
      explanation: 'JSON has six value types: string, number, boolean, null, object and array. true and false without quotes are booleans, and null without quotes means "no value". Numbers such as 41 and 10 have no quotes, so uptimeDays and every vlan value are numbers; being inside an object does not change their type. "C9300-48P" is in double quotes, so platform is a string. If the API had sent "41" in quotes, it would be a string, a detail that breaks scripts doing arithmetic.',
      ref: 'Lesson l6-7; card:dataformats',
    },
    {
      id: 'q6-0037', obj: '6.7', type: 'single', difficulty: 3,
      stem: 'A script fails to parse this payload: { "hostname": "HPL-EDGE", "vlans": [10, 20, 30,], "enabled": True }. Which statement identifies the problems?',
      options: ['The trailing comma after 30 is not allowed, and the boolean must be lowercase true', 'Keys must be in single quotes, and the booleans must be written as the strings "True" or "False"', 'Arrays must contain strings, not numbers, so the VLANs must be written as "10", "20" and "30"', 'Objects must be enclosed in square brackets, and the trailing comma after 30 is allowed'],
      answer: 0,
      explanation: 'Strict JSON does not allow a comma after the last element of an array or object, so [10, 20, 30,] is invalid. Booleans are the lowercase literals true and false; True (the Python spelling) is not valid JSON. Keys and strings must use double quotes, never single quotes. Arrays may hold numbers, strings, booleans, null, objects or other arrays, in any mix. Objects use curly braces; square brackets are for arrays. JSON also allows no comments, another common reason pasted payloads fail.',
      ref: 'Lesson l6-7; card:dataformats',
    },
    {
      id: 'q6-0038', obj: '6.7', type: 'single', difficulty: 2,
      stem: 'Refer to the exhibit. How many key-value pairs does the top-level object contain?',
      exhibit: EX_JSON,
      options: ['7', '6', '5', '11'],
      answer: 0,
      explanation: 'Count the keys at the outermost level only: hostname, platform, managed, uptimeDays, location, interfaces and ntp, which makes 7. Keys inside nested objects (name, enabled, vlan inside each interface; servers and synced inside ntp) belong to those inner objects, not to the top level. Counting nested keys too, or skipping the null-valued location, produces the wrong answers. A key with a null value is still a key-value pair.',
      ref: 'Lesson l6-7; card:dataformats',
    },
    {
      id: 'q6-0039', obj: '6.7', type: 'single', difficulty: 1,
      stem: 'Which is a valid JSON object?',
      options: ['{"name": "HPL-CORE", "vlans": [10, 20]}', "{'name': 'HPL-CORE', 'vlans': [10, 20]}", '{name: "HPL-CORE", vlans: [10, 20]}', '["name": "HPL-CORE", "vlans": [10, 20]]'],
      answer: 0,
      explanation: 'A JSON object is wrapped in curly braces and holds key-value pairs separated by commas, with a colon between each key and its value. Keys must be strings in double quotes, and string values use double quotes too. Single quotes are valid in Python and JavaScript but not in JSON. Unquoted keys are allowed in JavaScript object literals, not in JSON. Square brackets hold arrays of values; they cannot contain key: value pairs.',
      ref: 'Lesson l6-7; card:dataformats',
    },
    {
      id: 'q6-0040', obj: '6.7', type: 'single', difficulty: 3,
      stem: 'Refer to the exhibit. A Python script has loaded the response into a variable named data. Which expression returns the second NTP server address, "10.0.0.124"?',
      exhibit: EX_JSON,
      options: ['data["ntp"]["servers"][1]', 'data["ntp"]["servers"][2]', 'data["servers"][1]', 'data["ntp"][1]["servers"]'],
      answer: 0,
      explanation: 'Walk the structure one level at a time. The top-level object has a key "ntp" whose value is an object, and that object has a key "servers" whose value is an array. Arrays are indexed from 0, so [0] is "10.0.0.123" and [1] is "10.0.0.124". Index [2] does not exist and would raise an error. "servers" is not a top-level key, so data["servers"] fails. data["ntp"] is an object, so it is indexed by key names, not by position.',
      ref: 'Lesson l6-7; card:dataformats',
    },
  );

  for (const q of Q) {
    if (!q.domain) q.domain = q.id.charAt(1) + '.0';
    TT.questions.push(q);
  }
})(globalThis);
