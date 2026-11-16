/* Harbor Point Night Shift — the six tickets.
 * Each ticket: story, topology (for the diagram), a starting world with faults,
 * objectives checked live against the network model, hints, and a debrief.
 */
(function (G) {
  'use strict';
  const TT = (G.TT = G.TT || {});

  const yt = (q) => 'https://www.youtube.com/results?search_query=' + encodeURIComponent("Jeremy's IT Lab Free CCNA " + q);

  /** A 2960-style switch with Fa0/1-n and Gi0/1-2, merged with overrides. */
  function sw(hostname, n, overrides, vlans) {
    const interfaces = {};
    for (let i = 1; i <= n; i++) interfaces['FastEthernet0/' + i] = {};
    interfaces['GigabitEthernet0/1'] = {};
    interfaces['GigabitEthernet0/2'] = {};
    for (const [k, v] of Object.entries(overrides || {})) interfaces[k] = Object.assign({}, interfaces[k], v);
    return { kind: 'switch', hostname, interfaces, vlans: vlans || { 1: 'default' } };
  }
  const pc = (hostname, ip, mask, gw) => ({ kind: 'pc', hostname, pc: { ip, mask, gw } });
  const can = (w, from, ip) => TT.net.ping(w, from, ip).ok;
  const iface = (w, dev, n) => w.devices[dev].interfaces[n] || {};

  const tickets = [
    /* ------------------------------------------------------------ */
    {
      id: 't01',
      number: 'TT-1001',
      title: 'The router nobody turned on',
      topic: 'IOS basics',
      priority: 'P3',
      jitl: { label: 'Day 4: Intro to the CLI', url: yt('Day 4 Intro to the CLI') },
      ptLab: 'Day 4 lab: navigate the CLI modes, set a hostname, save the configuration.',
      story: [
        'Welcome to the night shift at Harbor Point Logistics. Facilities installed a new edge router in the Canton warehouse this afternoon and left it powered on with the default configuration.',
        'The warehouse PC cannot reach its gateway. Your lead wants the router named to the standard, its LAN port brought up, and the configuration saved before the day shift arrives.',
      ],
      topology: {
        nodes: [
          { id: 'R1', x: 110, y: 70, type: 'router' },
          { id: 'SW1', x: 320, y: 70, type: 'switch' },
          { id: 'PC1', x: 530, y: 70, type: 'pc' },
        ],
      },
      world: {
        devices: {
          R1: {
            kind: 'router',
            hostname: 'Router',
            interfaces: {
              'GigabitEthernet0/0': { ip: '192.168.1.1', mask: '255.255.255.0', shutdown: true },
              'GigabitEthernet0/1': { shutdown: true },
            },
          },
          SW1: sw('Switch', 8),
          PC1: pc('PC1', '192.168.1.10', '255.255.255.0', '192.168.1.1'),
        },
        links: [
          ['R1', 'GigabitEthernet0/0', 'SW1', 'FastEthernet0/1'],
          ['PC1', 'NIC', 'SW1', 'FastEthernet0/2'],
        ],
      },
      start: 'R1',
      objectives: [
        { text: 'Enter privileged EXEC mode on the router', check: (w) => !!w.devices.R1.flags.priv },
        { text: 'Rename the router to HPL-EDGE', check: (w) => w.devices.R1.hostname === 'HPL-EDGE' },
        { text: 'Bring up interface Gi0/0', check: (w) => !iface(w, 'R1', 'GigabitEthernet0/0').shutdown },
        { text: 'PC1 can ping its gateway, 192.168.1.1', check: (w) => can(w, 'PC1', '192.168.1.1') },
        {
          text: 'Save the configuration so it survives a reload',
          check: (w) => {
            const s = w.devices.R1.flags.saved;
            if (!s) return false;
            const c = JSON.parse(s);
            return c.hostname === 'HPL-EDGE' && !c.interfaces['GigabitEthernet0/0'].shutdown;
          },
        },
      ],
      hints: [
        'You start in user EXEC mode (the prompt ends in >). Type enable, then configure terminal.',
        'Router interfaces are shut down by default. Use interface g0/0, then no shutdown.',
        'hostname HPL-EDGE in global config. Then end, and copy running-config startup-config (or write memory).',
      ],
      solution: {
        R1: ['enable', 'configure terminal', 'hostname HPL-EDGE', 'interface g0/0', 'no shutdown', 'end', 'copy running-config startup-config'],
      },
      debrief: {
        what: 'Router interfaces ship in the shutdown state, so a correct IP address does nothing until you run no shutdown. The running-config lives in RAM and is lost on reload unless you copy it to the startup-config in NVRAM.',
        exam: 'Know the prompts: Router> is user EXEC, Router# is privileged EXEC, Router(config)# is global config, Router(config-if)# is interface config. "administratively down" in show ip interface brief always means someone typed shutdown (or never typed no shutdown).',
      },
    },

    /* ------------------------------------------------------------ */
    {
      id: 't02',
      number: 'TT-1002',
      title: 'Fifty scanners, one /24',
      topic: 'Subnetting',
      priority: 'P2',
      jitl: { label: 'Days 13 to 15: Subnetting', url: yt('Day 13 Subnetting') },
      ptLab: 'Days 13 to 15: work the subnetting practice questions until each takes under a minute.',
      story: [
        'The Dundalk warehouse is getting 50 handheld scanners on their own network. Engineering split 172.16.40.0/24 into equal subnets that each fit the scanners with the least waste. The office already uses the first one.',
        'The warehouse uses the second subnet. Its first usable address goes on the core router\'s Gi0/1, and the warehouse PC is already set up to match. Work out the numbers, then configure the interface.',
      ],
      topology: {
        nodes: [
          { id: 'PCO', x: 90, y: 70, type: 'pc' },
          { id: 'SW1', x: 220, y: 70, type: 'switch' },
          { id: 'R1', x: 340, y: 70, type: 'router' },
          { id: 'SW2', x: 460, y: 70, type: 'switch' },
          { id: 'PCW', x: 590, y: 70, type: 'pc' },
        ],
      },
      world: {
        devices: {
          R1: {
            kind: 'router',
            hostname: 'HPL-CORE',
            interfaces: {
              'GigabitEthernet0/0': { ip: '172.16.40.1', mask: '255.255.255.192', shutdown: false },
              'GigabitEthernet0/1': { shutdown: true },
            },
          },
          SW1: sw('HPL-OFF-SW', 8),
          SW2: sw('HPL-WH-SW', 8),
          PCO: pc('PC-OFFICE', '172.16.40.10', '255.255.255.192', '172.16.40.1'),
          PCW: pc('PC-WH', '172.16.40.70', '255.255.255.192', '172.16.40.65'),
        },
        links: [
          ['R1', 'GigabitEthernet0/0', 'SW1', 'GigabitEthernet0/1'],
          ['PCO', 'NIC', 'SW1', 'FastEthernet0/1'],
          ['R1', 'GigabitEthernet0/1', 'SW2', 'GigabitEthernet0/1'],
          ['PCW', 'NIC', 'SW2', 'FastEthernet0/1'],
        ],
      },
      start: 'R1',
      questions: [
        { id: 'q1', q: 'Which prefix length gives at least 50 usable hosts with the least waste?', accept: ['/26', '26', '255.255.255.192'], explain: '/26 leaves 6 host bits: 2^6 - 2 = 62 usable. /27 gives only 30.' },
        { id: 'q2', q: 'What is the network address of the second /26 in 172.16.40.0/24?', accept: ['172.16.40.64'], explain: 'Block size is 256 - 192 = 64. Subnets start at .0, .64, .128, .192.' },
        { id: 'q3', q: 'What is the broadcast address of that subnet?', accept: ['172.16.40.127'], explain: 'One less than the next subnet (.128).' },
        { id: 'q4', q: 'What is its first usable address (the gateway)?', accept: ['172.16.40.65'], explain: 'Network address + 1.' },
      ],
      objectives: [
        { text: 'Answer all four subnetting questions', check: (w, st) => (TT.tickets.byId.t02.questions.every((q) => st.answers && st.answers[q.id] === true)) },
        {
          text: 'Gi0/1 has the gateway address with a /26 mask and is up',
          check: (w) => {
            const i = iface(w, 'R1', 'GigabitEthernet0/1');
            return i.ip === '172.16.40.65' && i.mask === '255.255.255.192' && TT.net.linkUp(w, 'R1', 'GigabitEthernet0/1');
          },
        },
        { text: 'PC-WH can ping its gateway', check: (w) => can(w, 'PCW', '172.16.40.65') },
        { text: 'PC-WH can ping PC-OFFICE at 172.16.40.10', check: (w) => can(w, 'PCW', '172.16.40.10') },
      ],
      hints: [
        '50 hosts needs 6 host bits (2^6 - 2 = 62). 32 - 6 = /26, which is 255.255.255.192.',
        'A /26 has a block size of 64, so the second subnet is 172.16.40.64 to 172.16.40.127.',
        'enable, conf t, interface g0/1, ip address 172.16.40.65 255.255.255.192, no shutdown.',
      ],
      solution: {
        R1: ['en', 'conf t', 'int g0/1', 'ip address 172.16.40.65 255.255.255.192', 'no shut', 'end'],
      },
      answers: { q1: '/26', q2: '172.16.40.64', q3: '172.16.40.127', q4: '172.16.40.65' },
      debrief: {
        what: 'Subnetting is arithmetic on the block size. For a /26 the interesting octet\'s mask is 192, so the block size is 256 - 192 = 64. Every subnet starts on a multiple of 64. Get that one number and the network, broadcast and usable range follow.',
        exam: 'Expect to do this in under a minute without a calculator. Also watch for questions that give you a host address (like 172.16.40.70/26) and ask which subnet it belongs to: find the multiple of the block size at or below it.',
      },
    },

    /* ------------------------------------------------------------ */
    {
      id: 't03',
      number: 'TT-1003',
      title: 'Sales can\'t print',
      topic: 'VLANs',
      priority: 'P2',
      jitl: { label: 'Day 16: VLANs (Part 1)', url: yt('Day 16 VLANs Part 1') },
      ptLab: 'Day 16 lab: create VLANs, name them, and assign access ports.',
      story: [
        'The sales team moved to the third floor and their new printer went in yesterday. Both sales PCs can see each other, but neither can reach the printer at 10.10.10.50.',
        'Everything is on one access switch. While you are in there, the VLAN for sales should be named SALES to match the documentation.',
      ],
      topology: {
        nodes: [
          { id: 'PCS1', x: 110, y: 40, type: 'pc' },
          { id: 'PCS2', x: 110, y: 130, type: 'pc' },
          { id: 'SW1', x: 330, y: 85, type: 'switch' },
          { id: 'PRN', x: 550, y: 85, type: 'printer' },
        ],
      },
      world: {
        devices: {
          SW1: sw(
            'HPL-ACC1',
            16,
            {
              'FastEthernet0/1': { accessVlan: 10, modeSet: true },
              'FastEthernet0/2': { accessVlan: 10, modeSet: true },
              'FastEthernet0/12': { accessVlan: 1 },
            },
            { 1: 'default', 10: 'VLAN0010' }
          ),
          PCS1: pc('SALES-PC1', '10.10.10.11', '255.255.255.0', ''),
          PCS2: pc('SALES-PC2', '10.10.10.12', '255.255.255.0', ''),
          PRN: pc('PRINTER', '10.10.10.50', '255.255.255.0', ''),
        },
        links: [
          ['PCS1', 'NIC', 'SW1', 'FastEthernet0/1'],
          ['PCS2', 'NIC', 'SW1', 'FastEthernet0/2'],
          ['PRN', 'NIC', 'SW1', 'FastEthernet0/12'],
        ],
      },
      start: 'SW1',
      objectives: [
        { text: 'VLAN 10 is named SALES', check: (w) => w.devices.SW1.vlans[10] === 'SALES' },
        { text: 'The printer port Fa0/12 is an access port in VLAN 10', check: (w) => { const i = iface(w, 'SW1', 'FastEthernet0/12'); return i.mode === 'access' && i.accessVlan === 10; } },
        { text: 'SALES-PC1 can ping the printer at 10.10.10.50', check: (w) => can(w, 'PCS1', '10.10.10.50') },
        { text: 'SALES-PC2 can still ping SALES-PC1', check: (w) => can(w, 'PCS2', '10.10.10.11') },
      ],
      hints: [
        'Start with show vlan brief. Which VLAN is Fa0/12 in, and which are the sales PCs in?',
        'In global config: vlan 10, then name SALES.',
        'interface fa0/12, switchport mode access, switchport access vlan 10.',
      ],
      solution: {
        SW1: ['en', 'conf t', 'vlan 10', 'name SALES', 'exit', 'int fa0/12', 'switchport mode access', 'switchport access vlan 10', 'end'],
      },
      debrief: {
        what: 'A VLAN is a separate broadcast domain. Two devices in the same IP subnet still cannot talk if their switch ports sit in different VLANs, because ARP broadcasts never cross from one VLAN to another without a router.',
        exam: 'Every switch port starts in VLAN 1. show vlan brief lists access ports only, not trunks. Hard-code access ports with switchport mode access so they never negotiate a trunk.',
      },
    },

    /* ------------------------------------------------------------ */
    {
      id: 't04',
      number: 'TT-1004',
      title: 'HR is cut in half',
      topic: 'Trunking',
      priority: 'P1',
      jitl: { label: 'Day 17: VLANs (Part 2)', url: yt('Day 17 VLANs Part 2') },
      ptLab: 'Day 17 lab: configure 802.1Q trunks and control the allowed VLAN list.',
      story: [
        'HR has staff on two floors, each with its own access switch, joined by a trunk on Gi0/1. Since a change window last night, HR-PC1 on the first floor cannot reach HR-PC2 on the second. Sales, on the same switches, is fine.',
        'The change was supposed to "tighten the trunk". Find what changed, fix it, and do not break sales.',
      ],
      topology: {
        nodes: [
          { id: 'PCS1', x: 70, y: 40, type: 'pc' },
          { id: 'PCH1', x: 70, y: 140, type: 'pc' },
          { id: 'SW1', x: 230, y: 90, type: 'switch' },
          { id: 'SW2', x: 440, y: 90, type: 'switch' },
          { id: 'PCS2', x: 600, y: 40, type: 'pc' },
          { id: 'PCH2', x: 600, y: 140, type: 'pc' },
        ],
      },
      world: {
        devices: {
          SW1: sw(
            'HPL-ACC1',
            8,
            {
              'FastEthernet0/1': { accessVlan: 10, modeSet: true },
              'FastEthernet0/5': { accessVlan: 20, modeSet: true },
              'GigabitEthernet0/1': { mode: 'trunk', trunkAllowed: [10] },
            },
            { 1: 'default', 10: 'SALES', 20: 'HR' }
          ),
          SW2: sw(
            'HPL-ACC2',
            8,
            {
              'FastEthernet0/1': { accessVlan: 10, modeSet: true },
              'FastEthernet0/5': { accessVlan: 20, modeSet: true },
              'GigabitEthernet0/1': { mode: 'trunk' },
            },
            { 1: 'default', 10: 'SALES' }
          ),
          PCS1: pc('SALES-PC1', '10.10.10.11', '255.255.255.0', ''),
          PCS2: pc('SALES-PC2', '10.10.10.21', '255.255.255.0', ''),
          PCH1: pc('HR-PC1', '10.20.20.11', '255.255.255.0', ''),
          PCH2: pc('HR-PC2', '10.20.20.21', '255.255.255.0', ''),
        },
        links: [
          ['PCS1', 'NIC', 'SW1', 'FastEthernet0/1'],
          ['PCH1', 'NIC', 'SW1', 'FastEthernet0/5'],
          ['SW1', 'GigabitEthernet0/1', 'SW2', 'GigabitEthernet0/1'],
          ['PCS2', 'NIC', 'SW2', 'FastEthernet0/1'],
          ['PCH2', 'NIC', 'SW2', 'FastEthernet0/5'],
        ],
      },
      start: 'SW1',
      objectives: [
        { text: 'VLAN 20 exists on HPL-ACC2 and is named HR', check: (w) => w.devices.SW2.vlans[20] === 'HR' },
        { text: 'HR-PC1 can ping HR-PC2 at 10.20.20.21', check: (w) => can(w, 'PCH1', '10.20.20.21') },
        { text: 'SALES-PC1 can still ping SALES-PC2 at 10.10.10.21', check: (w) => can(w, 'PCS1', '10.10.10.21') },
      ],
      hints: [
        'Compare show interfaces trunk on both switches. Which VLANs are allowed, and which are active?',
        'HPL-ACC1 only allows VLAN 10 on the trunk: switchport trunk allowed vlan add 20 on Gi0/1.',
        'On HPL-ACC2, show vlan brief has no VLAN 20, so Fa0/5 is inactive. Create it: vlan 20, name HR.',
      ],
      solution: {
        SW1: ['en', 'conf t', 'int g0/1', 'switchport trunk allowed vlan add 20', 'end'],
        SW2: ['en', 'conf t', 'vlan 20', 'name HR', 'end'],
      },
      debrief: {
        what: 'Two separate faults hid behind one symptom. The trunk on HPL-ACC1 only carried VLAN 10, and HPL-ACC2 had no VLAN 20 in its database, which leaves any access port assigned to VLAN 20 inactive. Both had to be fixed before HR could talk.',
        exam: 'switchport trunk allowed vlan 20 REPLACES the list; add appends to it. Typing it without add is a classic way to cut off every other VLAN on a trunk. The third section of show interfaces trunk ("allowed and active") shows VLANs that are both allowed and exist on the switch.',
      },
    },

    /* ------------------------------------------------------------ */
    {
      id: 't05',
      number: 'TT-1005',
      title: 'The branch is an island',
      topic: 'Static routing',
      priority: 'P1',
      jitl: { label: 'Day 11: Static Routing', url: yt('Day 11 Static Routing') },
      ptLab: 'Day 11 Lab 2: troubleshooting static routes.',
      story: [
        'The Glen Burnie branch router went live today on a /30 point-to-point link to headquarters. Nobody at the branch can reach the HQ file server, and HQ cannot reach the branch.',
        'The installer says he "added the route at HQ". Check his work, then make the traffic work both ways.',
      ],
      topology: {
        nodes: [
          { id: 'PCH', x: 70, y: 70, type: 'pc' },
          { id: 'R1', x: 240, y: 70, type: 'router' },
          { id: 'R2', x: 430, y: 70, type: 'router' },
          { id: 'PCB', x: 600, y: 70, type: 'pc' },
        ],
      },
      world: {
        devices: {
          R1: {
            kind: 'router',
            hostname: 'HPL-HQ',
            interfaces: {
              'GigabitEthernet0/0': { ip: '10.0.1.1', mask: '255.255.255.0', shutdown: false },
              'GigabitEthernet0/1': { ip: '10.0.12.1', mask: '255.255.255.252', shutdown: false },
            },
            routes: [{ net: '10.0.2.0', mask: '255.255.255.0', nh: '10.0.12.6' }],
          },
          R2: {
            kind: 'router',
            hostname: 'HPL-BRANCH',
            interfaces: {
              'GigabitEthernet0/0': { ip: '10.0.2.1', mask: '255.255.255.0', shutdown: false },
              'GigabitEthernet0/1': { ip: '10.0.12.2', mask: '255.255.255.252', shutdown: false },
            },
          },
          PCH: pc('PC-HQ', '10.0.1.10', '255.255.255.0', '10.0.1.1'),
          PCB: pc('PC-BRANCH', '10.0.2.10', '255.255.255.0', '10.0.2.1'),
        },
        links: [
          ['PCH', 'NIC', 'R1', 'GigabitEthernet0/0'],
          ['R1', 'GigabitEthernet0/1', 'R2', 'GigabitEthernet0/1'],
          ['PCB', 'NIC', 'R2', 'GigabitEthernet0/0'],
        ],
      },
      start: 'R1',
      objectives: [
        {
          text: 'HPL-HQ has a working route to 10.0.2.0/24',
          check: (w) => TT.net.routingTable(w, 'R1').some((r) => r.type === 'S' && TT.ip.intToIp(r.net) === '10.0.2.0' && r.p === 24),
        },
        {
          text: 'HPL-BRANCH has a route back to 10.0.1.0/24 (a default route counts)',
          check: (w) => TT.net.routingTable(w, 'R2').some((r) => r.type === 'S' && ((TT.ip.intToIp(r.net) === '10.0.1.0' && r.p === 24) || r.p === 0)),
        },
        { text: 'PC-HQ can ping PC-BRANCH at 10.0.2.10', check: (w) => can(w, 'PCH', '10.0.2.10') },
      ],
      hints: [
        'show ip route on HPL-HQ. Is there an S route to 10.0.2.0/24? If not, show running-config and look at the ip route line.',
        '10.0.12.6 is not in 10.0.12.0/30 (usable .1 and .2), so the route never installs. Remove it with no ip route, then add one via 10.0.12.2.',
        'Packets need a path back. On HPL-BRANCH: ip route 10.0.1.0 255.255.255.0 10.0.12.1 (or a default route, 0.0.0.0 0.0.0.0 10.0.12.1).',
      ],
      solution: {
        R1: ['en', 'conf t', 'no ip route 10.0.2.0 255.255.255.0 10.0.12.6', 'ip route 10.0.2.0 255.255.255.0 10.0.12.2', 'end'],
        R2: ['en', 'conf t', 'ip route 10.0.1.0 255.255.255.0 10.0.12.1', 'end'],
      },
      debrief: {
        what: 'A static route only goes into the routing table when its next hop is reachable through a connected network. The installer typed .6, which falls outside the /30, so the router quietly ignored the route. Even with HQ fixed, pings fail until the branch also knows the way back.',
        exam: 'Routing is per-direction: every ping needs a route there and a route back. A /30 has exactly two usable addresses. Static routes have an administrative distance of 1, so they beat OSPF (110) for the same prefix unless you raise the AD to make a floating static route.',
      },
    },

    /* ------------------------------------------------------------ */
    {
      id: 't06',
      number: 'TT-1006',
      title: 'The data center went quiet',
      topic: 'OSPF',
      priority: 'P1',
      jitl: { label: 'Days 26 to 28: OSPF', url: yt('Day 26 OSPF Part 1') },
      ptLab: 'Days 26 to 28 labs: single-area OSPF, neighbor troubleshooting.',
      story: [
        'Harbor Point runs single-area OSPF, area 0, across three routers. A contractor rebuilt the data center router HPL-DC this evening and now the HQ PC cannot reach the server LAN at 192.168.30.0/24.',
        'HPL-HQ and HPL-CORE look normal. Start your investigation from HPL-CORE.',
      ],
      topology: {
        nodes: [
          { id: 'PC1', x: 60, y: 70, type: 'pc' },
          { id: 'R1', x: 190, y: 70, type: 'router' },
          { id: 'R2', x: 340, y: 70, type: 'router' },
          { id: 'R3', x: 490, y: 70, type: 'router' },
          { id: 'PC3', x: 620, y: 70, type: 'pc' },
        ],
      },
      world: {
        devices: {
          R1: {
            kind: 'router',
            hostname: 'HPL-HQ',
            interfaces: {
              'GigabitEthernet0/0': { ip: '192.168.10.1', mask: '255.255.255.0', shutdown: false },
              'GigabitEthernet0/1': { ip: '10.1.12.1', mask: '255.255.255.252', shutdown: false },
            },
            ospf: {
              pid: 1,
              routerId: '1.1.1.1',
              passive: ['GigabitEthernet0/0'],
              networks: [
                { net: '192.168.10.0', wild: '0.0.0.255', area: 0 },
                { net: '10.1.12.0', wild: '0.0.0.3', area: 0 },
              ],
            },
          },
          R2: {
            kind: 'router',
            hostname: 'HPL-CORE',
            interfaces: {
              'GigabitEthernet0/0': { ip: '10.1.12.2', mask: '255.255.255.252', shutdown: false },
              'GigabitEthernet0/1': { ip: '10.1.23.1', mask: '255.255.255.252', shutdown: false },
            },
            ospf: {
              pid: 1,
              routerId: '2.2.2.2',
              passive: [],
              networks: [
                { net: '10.1.12.0', wild: '0.0.0.3', area: 0 },
                { net: '10.1.23.0', wild: '0.0.0.3', area: 0 },
              ],
            },
          },
          R3: {
            kind: 'router',
            hostname: 'HPL-DC',
            interfaces: {
              'GigabitEthernet0/0': { ip: '192.168.30.1', mask: '255.255.255.0', shutdown: false },
              'GigabitEthernet0/1': { ip: '10.1.23.2', mask: '255.255.255.252', shutdown: false },
            },
            ospf: {
              pid: 1,
              routerId: '3.3.3.3',
              passive: [],
              networks: [{ net: '10.1.23.0', wild: '0.0.0.3', area: 1 }],
            },
          },
          PC1: pc('PC-HQ', '192.168.10.10', '255.255.255.0', '192.168.10.1'),
          PC3: pc('SRV-DC', '192.168.30.10', '255.255.255.0', '192.168.30.1'),
        },
        links: [
          ['PC1', 'NIC', 'R1', 'GigabitEthernet0/0'],
          ['R1', 'GigabitEthernet0/1', 'R2', 'GigabitEthernet0/0'],
          ['R2', 'GigabitEthernet0/1', 'R3', 'GigabitEthernet0/1'],
          ['PC3', 'NIC', 'R3', 'GigabitEthernet0/0'],
        ],
      },
      start: 'R2',
      objectives: [
        { text: 'HPL-CORE and HPL-DC are OSPF neighbors', check: (w) => TT.net.computeOspf(w).adj.some((a) => a.a === 'R2' && a.b === 'R3') },
        {
          text: 'HPL-HQ learns 192.168.30.0/24 through OSPF',
          check: (w) => TT.net.routingTable(w, 'R1').some((r) => r.type === 'O' && TT.ip.intToIp(r.net) === '192.168.30.0' && r.p === 24),
        },
        { text: 'PC-HQ can ping SRV-DC at 192.168.30.10', check: (w) => can(w, 'PC1', '192.168.30.10') },
      ],
      hints: [
        'show ip ospf neighbor on HPL-CORE lists only HPL-HQ. Compare show ip ospf interface brief on HPL-CORE and HPL-DC. Look at the Area column.',
        'Neighbors must agree on the area. On HPL-DC: router ospf 1, no network 10.1.23.0 0.0.0.3 area 1, network 10.1.23.0 0.0.0.3 area 0.',
        'HPL-DC also never advertises its server LAN. Add network 192.168.30.0 0.0.0.255 area 0 (and make Gi0/0 passive for good practice).',
      ],
      solution: {
        R3: ['en', 'conf t', 'router ospf 1', 'no network 10.1.23.0 0.0.0.3 area 1', 'network 10.1.23.0 0.0.0.3 area 0', 'network 192.168.30.0 0.0.0.255 area 0', 'passive-interface g0/0', 'end'],
      },
      debrief: {
        what: 'The link between HPL-CORE and HPL-DC was in area 0 on one side and area 1 on the other. OSPF routers refuse to form an adjacency when the area ID in their hellos does not match. Once the adjacency came up, the server LAN was still missing because no network statement covered it.',
        exam: 'OSPF neighbors must match area, subnet and mask, hello and dead timers, authentication and stub flags, and must have unique router IDs. A passive interface is still advertised; it just sends no hellos. OSPF administrative distance is 110 and cost is reference bandwidth (100 Mbps by default) divided by interface bandwidth.',
      },
    },

    /* ------------------------------------------------------------ */
    {
      id: 't07',
      number: 'TT-1007',
      title: 'Two VLANs, one cable',
      topic: 'Router-on-a-stick',
      priority: 'P2',
      jitl: { label: 'Day 18: VLANs (Part 3)', url: yt('Day 18 VLANs Part 3') },
      ptLab: 'Day 18 lab: router-on-a-stick with 802.1Q subinterfaces.',
      story: [
        'The Canton warehouse has sales and HR on one access switch, and a single cable to the core router. A junior tech set up "router-on-a-stick" so the two VLANs can reach each other through the router.',
        'Neither VLAN can reach its gateway. Check both ends of that one cable.',
      ],
      topology: {
        nodes: [
          { id: 'R1', x: 340, y: 40, type: 'router' },
          { id: 'PCS', x: 140, y: 150, type: 'pc' },
          { id: 'SW1', x: 340, y: 150, type: 'switch' },
          { id: 'PCH', x: 540, y: 150, type: 'pc' },
        ],
      },
      world: {
        devices: {
          R1: {
            kind: 'router',
            hostname: 'HPL-CORE',
            interfaces: {
              'GigabitEthernet0/0': { shutdown: false },
              'GigabitEthernet0/0.10': { encap: 10, ip: '10.10.10.1', mask: '255.255.255.0', shutdown: false },
              'GigabitEthernet0/0.20': { encap: 21, ip: '10.20.20.1', mask: '255.255.255.0', shutdown: false },
              'GigabitEthernet0/1': { shutdown: true },
            },
          },
          SW1: sw(
            'HPL-ACC1',
            8,
            {
              'FastEthernet0/1': { accessVlan: 10, modeSet: true },
              'FastEthernet0/2': { accessVlan: 20, modeSet: true },
            },
            { 1: 'default', 10: 'SALES', 20: 'HR' }
          ),
          PCS: pc('SALES-PC', '10.10.10.11', '255.255.255.0', '10.10.10.1'),
          PCH: pc('HR-PC', '10.20.20.11', '255.255.255.0', '10.20.20.1'),
        },
        links: [
          ['R1', 'GigabitEthernet0/0', 'SW1', 'GigabitEthernet0/1'],
          ['PCS', 'NIC', 'SW1', 'FastEthernet0/1'],
          ['PCH', 'NIC', 'SW1', 'FastEthernet0/2'],
        ],
      },
      start: 'SW1',
      objectives: [
        { text: 'The switch port to the router (Gi0/1) is a trunk', check: (w) => iface(w, 'SW1', 'GigabitEthernet0/1').mode === 'trunk' },
        { text: 'SALES-PC can ping its gateway, 10.10.10.1', check: (w) => can(w, 'PCS', '10.10.10.1') },
        { text: 'HR-PC can ping its gateway, 10.20.20.1', check: (w) => can(w, 'PCH', '10.20.20.1') },
        { text: 'SALES-PC can ping HR-PC across VLANs', check: (w) => can(w, 'PCS', '10.20.20.11') },
      ],
      hints: [
        'show interfaces trunk on HPL-ACC1 shows nothing. The uplink to the router is still an access port.',
        'On the switch: interface g0/1, switchport mode trunk.',
        'On HPL-CORE, show running-config: Gi0/0.20 is tagged for VLAN 21. interface g0/0.20, encapsulation dot1q 20.',
      ],
      solution: {
        SW1: ['en', 'conf t', 'int g0/1', 'switchport mode trunk', 'end'],
        R1: ['en', 'conf t', 'int g0/0.20', 'encapsulation dot1q 20', 'end'],
      },
      debrief: {
        what: 'Router-on-a-stick carries several VLANs to one router port over an 802.1Q trunk. Each VLAN gets a subinterface whose encapsulation dot1Q number must match the VLAN ID on the switch, and whose IP address is that VLAN\'s gateway. The physical interface needs no IP, but it must be up.',
        exam: 'Know the three inter-VLAN routing options: a router interface per VLAN, router-on-a-stick, and SVIs on a Layer 3 switch (interface vlan 10 plus ip routing). The encapsulation command comes before the IP address on a subinterface.',
      },
    },

    /* ------------------------------------------------------------ */
    {
      id: 't08',
      number: 'TT-1008',
      title: 'The closet switch is in charge',
      topic: 'Spanning Tree',
      priority: 'P2',
      jitl: { label: 'Days 20 to 22: Spanning Tree', url: yt('Day 20 Spanning Tree Protocol Part 1') },
      ptLab: 'Days 20 to 22 labs: root bridge election, port roles, PortFast and BPDU Guard.',
      story: [
        'Three switches form a triangle: the core switch and two access switches. Users complain that traffic between floors is slow, and a quick look shows one of the core uplinks blocking.',
        'An eight-year-old access switch with the lowest MAC address won the root bridge election. Make the core switch the root for every VLAN, then harden the PC port on HPL-ACC1 so nobody can plug in a rogue switch there.',
      ],
      topology: {
        nodes: [
          { id: 'CORE', x: 340, y: 40, type: 'switch' },
          { id: 'ACC1', x: 170, y: 150, type: 'switch' },
          { id: 'ACC2', x: 510, y: 150, type: 'switch' },
          { id: 'PC1', x: 60, y: 150, type: 'pc' },
          { id: 'PC2', x: 620, y: 150, type: 'pc' },
        ],
      },
      world: {
        devices: {
          CORE: Object.assign(
            sw('HPL-CORE-SW', 4, { 'GigabitEthernet0/1': { mode: 'trunk' }, 'GigabitEthernet0/2': { mode: 'trunk' } }, { 1: 'default', 10: 'SALES' }),
            { mac: '00d0.bc11.9a01' }
          ),
          ACC1: Object.assign(
            sw('HPL-ACC1', 4, { 'FastEthernet0/1': { accessVlan: 10, modeSet: true }, 'GigabitEthernet0/1': { mode: 'trunk' }, 'GigabitEthernet0/2': { mode: 'trunk' } }, { 1: 'default', 10: 'SALES' }),
            { mac: '0001.4210.0a01' }
          ),
          ACC2: Object.assign(
            sw('HPL-ACC2', 4, { 'FastEthernet0/1': { accessVlan: 10, modeSet: true }, 'GigabitEthernet0/1': { mode: 'trunk' }, 'GigabitEthernet0/2': { mode: 'trunk' } }, { 1: 'default', 10: 'SALES' }),
            { mac: '0001.4210.0b02' }
          ),
          PC1: pc('SALES-PC1', '10.10.10.11', '255.255.255.0', ''),
          PC2: pc('SALES-PC2', '10.10.10.12', '255.255.255.0', ''),
        },
        links: [
          ['CORE', 'GigabitEthernet0/1', 'ACC1', 'GigabitEthernet0/1'],
          ['CORE', 'GigabitEthernet0/2', 'ACC2', 'GigabitEthernet0/1'],
          ['ACC1', 'GigabitEthernet0/2', 'ACC2', 'GigabitEthernet0/2'],
          ['PC1', 'NIC', 'ACC1', 'FastEthernet0/1'],
          ['PC2', 'NIC', 'ACC2', 'FastEthernet0/1'],
        ],
      },
      start: 'CORE',
      objectives: [
        { text: 'HPL-CORE-SW is the root bridge for VLAN 1', check: (w) => TT.net.computeStp(w, 1).root.dev === 'CORE' },
        { text: 'HPL-CORE-SW is the root bridge for VLAN 10', check: (w) => TT.net.computeStp(w, 10).root.dev === 'CORE' },
        {
          text: 'The link between the two access switches is the one that blocks',
          check: (w) => {
            const st = TT.net.computeStp(w, 10);
            return (st.ports.ACC1['GigabitEthernet0/2'] || {}).sts === 'BLK' || (st.ports.ACC2['GigabitEthernet0/2'] || {}).sts === 'BLK';
          },
        },
        { text: 'Fa0/1 on HPL-ACC1 has PortFast and BPDU Guard', check: (w) => { const i = iface(w, 'ACC1', 'FastEthernet0/1'); return !!(i.portfast && i.bpduguard); } },
      ],
      hints: [
        'Run show spanning-tree on any switch. The Root ID address belongs to HPL-ACC1, and its priority matches everyone else\'s (32768 + VLAN).',
        'On HPL-CORE-SW: spanning-tree vlan 1,10 root primary (or spanning-tree vlan 1,10 priority 4096). Lower wins.',
        'On HPL-ACC1: interface fa0/1, spanning-tree portfast, spanning-tree bpduguard enable.',
      ],
      solution: {
        CORE: ['en', 'conf t', 'spanning-tree vlan 1,10 root primary', 'end'],
        ACC1: ['en', 'conf t', 'int fa0/1', 'spanning-tree portfast', 'spanning-tree bpduguard enable', 'end'],
      },
      debrief: {
        what: 'With every priority left at the default, the switch with the lowest MAC address becomes root, and that is usually the oldest box in the building. Lowering the core switch\'s priority puts the root where the traffic actually flows, so the blocked port lands on the least important link.',
        exam: 'Bridge ID = priority + VLAN ID (the extended system ID) + MAC. Priority goes in steps of 4096. root primary sets 24576, or 4096 below the current root if that is already lower. PortFast skips listening and learning on edge ports; BPDU Guard err-disables the port if a BPDU ever arrives.',
      },
    },

    /* ------------------------------------------------------------ */
    {
      id: 't09',
      number: 'TT-1009',
      title: 'Two cables, half the bandwidth',
      topic: 'EtherChannel',
      priority: 'P3',
      jitl: { label: 'EtherChannel lesson', url: yt('EtherChannel') },
      ptLab: 'Jeremy\'s EtherChannel lab: build LACP and PAgP bundles and fix a mismatch.',
      story: [
        'The two distribution switches are joined by two gigabit links that are supposed to act as one 2 Gbps LACP bundle. Monitoring shows only one link carrying traffic.',
        'Both sides have channel-group 1 configured. Find out why the bundle never formed.',
      ],
      topology: {
        nodes: [
          { id: 'PC1', x: 70, y: 90, type: 'pc' },
          { id: 'SW1', x: 230, y: 90, type: 'switch' },
          { id: 'SW2', x: 450, y: 90, type: 'switch' },
          { id: 'PC2', x: 610, y: 90, type: 'pc' },
        ],
      },
      world: {
        devices: {
          SW1: sw(
            'HPL-DIST1',
            4,
            {
              'FastEthernet0/1': { accessVlan: 10, modeSet: true },
              'GigabitEthernet0/1': { mode: 'trunk', channel: { group: 1, mode: 'passive' } },
              'GigabitEthernet0/2': { mode: 'trunk', channel: { group: 1, mode: 'passive' } },
              'Port-channel1': { mode: 'trunk' },
            },
            { 1: 'default', 10: 'SALES' }
          ),
          SW2: sw(
            'HPL-DIST2',
            4,
            {
              'FastEthernet0/1': { accessVlan: 10, modeSet: true },
              'GigabitEthernet0/1': { mode: 'trunk', channel: { group: 1, mode: 'passive' } },
              'GigabitEthernet0/2': { mode: 'access', channel: { group: 1, mode: 'passive' } },
              'Port-channel1': { mode: 'trunk' },
            },
            { 1: 'default', 10: 'SALES' }
          ),
          PC1: pc('SALES-PC1', '10.10.10.11', '255.255.255.0', ''),
          PC2: pc('SALES-PC2', '10.10.10.21', '255.255.255.0', ''),
        },
        links: [
          ['PC1', 'NIC', 'SW1', 'FastEthernet0/1'],
          ['SW1', 'GigabitEthernet0/1', 'SW2', 'GigabitEthernet0/1'],
          ['SW1', 'GigabitEthernet0/2', 'SW2', 'GigabitEthernet0/2'],
          ['PC2', 'NIC', 'SW2', 'FastEthernet0/1'],
        ],
      },
      start: 'SW1',
      objectives: [
        {
          text: 'Port-channel 1 is up on HPL-DIST1 with both links bundled',
          check: (w) => { const g = TT.net.computeEc(w, 'SW1')[1]; return !!g && g.up && Object.values(g.members).length === 2 && Object.values(g.members).every((f) => f === 'P'); },
        },
        {
          text: 'Port-channel 1 is up on HPL-DIST2 with both links bundled',
          check: (w) => { const g = TT.net.computeEc(w, 'SW2')[1]; return !!g && g.up && Object.values(g.members).length === 2 && Object.values(g.members).every((f) => f === 'P'); },
        },
        { text: 'The bundle still negotiates with LACP (no mode on)', check: (w) => ['SW1', 'SW2'].every((d) => (TT.net.computeEc(w, d)[1] || {}).proto === 'LACP') },
      ],
      hints: [
        'show etherchannel summary on both switches. (I) means stand-alone: no LACP partner. (s) means suspended: the port does not match the others.',
        'Two passive LACP ports wait forever for the other to start. Make one side active: interface range g0/1 - 2, channel-group 1 mode active.',
        'On HPL-DIST2, Gi0/2 is an access port while Gi0/1 is a trunk. Members must match: interface g0/2, switchport mode trunk.',
      ],
      solution: {
        SW1: ['en', 'conf t', 'interface range g0/1 - 2', 'channel-group 1 mode active', 'end'],
        SW2: ['en', 'conf t', 'int g0/2', 'switchport mode trunk', 'end'],
      },
      debrief: {
        what: 'LACP passive ports only answer; they never start the negotiation, so passive on both ends means no bundle. And every member port must match on speed, duplex, switchport mode and VLANs, or the odd one out is suspended. Without a bundle, Spanning Tree blocks the second link, which is why only one cable carried traffic.',
        exam: 'LACP: active + active or active + passive. PAgP: desirable + desirable or desirable + auto. on only works with on. LACP is IEEE 802.3ad; PAgP is Cisco only. Configure the members with interface range so they match from the start.',
      },
    },

    /* ------------------------------------------------------------ */
    {
      id: 't10',
      number: 'TT-1010',
      title: 'Scanners stuck on 169.254',
      topic: 'DHCP relay',
      priority: 'P1',
      jitl: { label: 'Day 39: DHCP', url: yt('Day 39 DHCP') },
      ptLab: 'Day 39 lab: DHCP server, client and relay with ip helper-address.',
      story: [
        'The Dundalk warehouse scanners get their addresses from a central DHCP server in the server room. This morning every scanner came up with a 169.254 address and nothing works.',
        'The server is fine: it has a pool for the warehouse and nobody touched it. Someone did change the core router last night. Fix the relay, then have SCANNER-07 ask for a new address.',
      ],
      topology: {
        nodes: [
          { id: 'SRV', x: 70, y: 80, type: 'pc' },
          { id: 'SWA', x: 200, y: 80, type: 'switch' },
          { id: 'R1', x: 340, y: 80, type: 'router' },
          { id: 'SWB', x: 480, y: 80, type: 'switch' },
          { id: 'CL', x: 610, y: 80, type: 'pc' },
        ],
      },
      world: {
        devices: {
          R1: {
            kind: 'router',
            hostname: 'HPL-CORE',
            interfaces: {
              'GigabitEthernet0/0': { ip: '10.50.10.1', mask: '255.255.255.0', shutdown: false, helpers: ['10.50.10.5'] },
              'GigabitEthernet0/1': { ip: '10.50.20.1', mask: '255.255.255.0', shutdown: false },
            },
          },
          SWA: sw('HPL-SRV-SW', 8),
          SWB: sw('HPL-WH-SW', 8),
          SRV: {
            kind: 'pc',
            hostname: 'DHCP-SRV',
            pc: {
              ip: '10.50.10.5', mask: '255.255.255.0', gw: '10.50.10.1', server: true,
              pools: [
                { name: 'WAREHOUSE', network: '10.50.20.0', mask: '255.255.255.0', gw: '10.50.20.1', start: '10.50.20.100', end: '10.50.20.199' },
                { name: 'SERVERS', network: '10.50.10.0', mask: '255.255.255.0', gw: '10.50.10.1', start: '10.50.10.100', end: '10.50.10.199' },
              ],
            },
          },
          CL: { kind: 'pc', hostname: 'SCANNER-07', pc: { dhcp: true, ip: '169.254.40.17', mask: '255.255.0.0', gw: '' } },
        },
        links: [
          ['SRV', 'NIC', 'SWA', 'FastEthernet0/1'],
          ['R1', 'GigabitEthernet0/0', 'SWA', 'GigabitEthernet0/1'],
          ['R1', 'GigabitEthernet0/1', 'SWB', 'GigabitEthernet0/1'],
          ['CL', 'NIC', 'SWB', 'FastEthernet0/1'],
        ],
      },
      start: 'CL',
      objectives: [
        { text: 'The interface facing the scanners (Gi0/1) relays DHCP to 10.50.10.5', check: (w) => (iface(w, 'R1', 'GigabitEthernet0/1').helpers || []).includes('10.50.10.5') },
        {
          text: 'SCANNER-07 has an address from 10.50.20.0/24',
          check: (w) => { const ip = w.devices.CL.pc.ip; return !!ip && ip.startsWith('10.50.20.'); },
        },
        { text: 'SCANNER-07 can ping the DHCP server', check: (w) => can(w, 'CL', '10.50.10.5') },
      ],
      hints: [
        'A 169.254 address means the DHCP Discover got no answer. DHCP Discovers are broadcasts, and routers do not forward broadcasts.',
        'show running-config on HPL-CORE. The ip helper-address is on Gi0/0, the server side. It belongs on the interface where the clients\' broadcasts arrive.',
        'interface g0/1, ip helper-address 10.50.10.5. Then on SCANNER-07: ipconfig /renew.',
      ],
      solution: {
        R1: ['en', 'conf t', 'int g0/0', 'no ip helper-address 10.50.10.5', 'int g0/1', 'ip helper-address 10.50.10.5', 'end'],
        CL: ['ipconfig /renew'],
      },
      debrief: {
        what: 'A client with no address can only broadcast, and broadcasts stop at the router. ip helper-address tells the router to catch those broadcasts on that interface and forward them as unicast to the server, stamped with the interface\'s address (the giaddr) so the server knows which pool to use.',
        exam: 'DORA: Discover, Offer, Request, Acknowledge, on UDP 67 (server) and 68 (client). 169.254.0.0/16 (APIPA) means DHCP failed. The helper goes on the client-facing interface. On a Cisco router acting as the server: ip dhcp pool, network, default-router, dns-server, and ip dhcp excluded-address.',
      },
    },

    /* ------------------------------------------------------------ */
    {
      id: 't11',
      number: 'TT-1011',
      title: 'Guests can see payroll',
      topic: 'Access control lists',
      priority: 'P1',
      jitl: { label: 'ACL lessons', url: yt('Extended ACLs') },
      ptLab: 'Jeremy\'s standard and extended ACL labs.',
      story: [
        'Audit found that the guest Wi-Fi network (10.0.20.0/24) can reach the finance server at 10.0.30.10. Guests should only reach the public web server at 10.0.30.20. Staff (10.0.10.0/24) must keep access to both.',
        'Someone already wrote ACL 110 for this. It does not work. Fix it and put it where it belongs.',
      ],
      topology: {
        nodes: [
          { id: 'STAFF', x: 70, y: 40, type: 'pc' },
          { id: 'GUEST', x: 70, y: 150, type: 'pc' },
          { id: 'R1', x: 260, y: 95, type: 'router' },
          { id: 'SW', x: 440, y: 95, type: 'switch' },
          { id: 'FIN', x: 610, y: 40, type: 'pc' },
          { id: 'WEB', x: 610, y: 150, type: 'pc' },
        ],
      },
      world: {
        devices: {
          R1: {
            kind: 'router',
            hostname: 'HPL-EDGE',
            interfaces: {
              'GigabitEthernet0/0': { ip: '10.0.10.1', mask: '255.255.255.0', shutdown: false },
              'GigabitEthernet0/1': { ip: '10.0.20.1', mask: '255.255.255.0', shutdown: false, aclOut: 110 },
              'GigabitEthernet0/2': { ip: '10.0.30.1', mask: '255.255.255.0', shutdown: false },
            },
            aclText: { 110: ['permit ip any any', 'deny ip 10.0.20.0 0.0.0.255 host 10.0.30.10'] },
          },
          SW: sw('HPL-SRV-SW', 8),
          STAFF: pc('PC-STAFF', '10.0.10.10', '255.255.255.0', '10.0.10.1'),
          GUEST: pc('PC-GUEST', '10.0.20.10', '255.255.255.0', '10.0.20.1'),
          FIN: pc('FIN-SRV', '10.0.30.10', '255.255.255.0', '10.0.30.1'),
          WEB: pc('WEB-SRV', '10.0.30.20', '255.255.255.0', '10.0.30.1'),
        },
        links: [
          ['STAFF', 'NIC', 'R1', 'GigabitEthernet0/0'],
          ['GUEST', 'NIC', 'R1', 'GigabitEthernet0/1'],
          ['R1', 'GigabitEthernet0/2', 'SW', 'GigabitEthernet0/1'],
          ['FIN', 'NIC', 'SW', 'FastEthernet0/1'],
          ['WEB', 'NIC', 'SW', 'FastEthernet0/2'],
        ],
      },
      start: 'R1',
      objectives: [
        { text: 'PC-GUEST can NOT ping FIN-SRV (10.0.30.10)', check: (w) => !can(w, 'GUEST', '10.0.30.10') },
        { text: 'PC-GUEST can still ping WEB-SRV (10.0.30.20)', check: (w) => can(w, 'GUEST', '10.0.30.20') },
        { text: 'PC-STAFF can still ping FIN-SRV', check: (w) => can(w, 'STAFF', '10.0.30.10') },
        { text: 'ACL 110 is applied inbound on Gi0/1, close to the guests', check: (w) => { const i = iface(w, 'R1', 'GigabitEthernet0/1'); return i.aclIn === 110 && i.aclOut === undefined; } },
      ],
      hints: [
        'show access-lists. ACLs are read top to bottom and stop at the first match. What does line 10 match?',
        'You cannot reorder numbered ACL lines here. Remove it with no access-list 110, then re-enter the deny first and permit ip any any last.',
        'show running-config: it is applied out on Gi0/1, toward the guests. On Gi0/1: no ip access-group 110 out, ip access-group 110 in.',
      ],
      solution: {
        R1: ['en', 'conf t', 'no access-list 110', 'access-list 110 deny ip 10.0.20.0 0.0.0.255 host 10.0.30.10', 'access-list 110 permit ip any any', 'int g0/1', 'no ip access-group 110 out', 'ip access-group 110 in', 'end'],
      },
      debrief: {
        what: 'The ACL had two problems. permit ip any any came first, so it matched everything and the deny never ran. And it was applied outbound on the guest interface, which filters traffic going to the guests, where the source is the server, not the guest network.',
        exam: 'First match wins, and an implicit deny any ends every ACL, so an ACL with only denies blocks everything. Place extended ACLs close to the source and standard ACLs close to the destination. One ACL per interface, per direction, per protocol.',
      },
    },

    /* ------------------------------------------------------------ */
    {
      id: 't12',
      number: 'TT-1012',
      title: 'The warehouse can\'t reach the internet',
      topic: 'NAT and PAT',
      priority: 'P1',
      jitl: { label: 'NAT lessons', url: yt('NAT Part 1') },
      ptLab: 'Jeremy\'s NAT labs: static NAT, dynamic NAT and PAT.',
      story: [
        'The new warehouse site uses private addresses (192.168.50.0/24) behind an edge router with one public address from the ISP, 203.0.113.2. PAT is supposed to let every device share that address.',
        'Pings to the vendor\'s web server at 198.51.100.10 fail. The ISP has no idea what 192.168.50.0 is, and they shouldn\'t. Fix the edge router.',
      ],
      topology: {
        nodes: [
          { id: 'PC', x: 70, y: 80, type: 'pc' },
          { id: 'R1', x: 250, y: 80, type: 'router' },
          { id: 'ISP', x: 440, y: 80, type: 'router' },
          { id: 'WEB', x: 610, y: 80, type: 'pc' },
        ],
      },
      world: {
        devices: {
          R1: {
            kind: 'router',
            hostname: 'HPL-EDGE',
            interfaces: {
              'GigabitEthernet0/0': { ip: '192.168.50.1', mask: '255.255.255.0', shutdown: false, nat: 'outside' },
              'GigabitEthernet0/1': { ip: '203.0.113.2', mask: '255.255.255.252', shutdown: false, nat: 'inside' },
            },
            routes: [{ net: '0.0.0.0', mask: '0.0.0.0', nh: '203.0.113.1' }],
            aclText: { 1: ['permit 192.168.50.0 0.0.0.255'] },
            nat: { list: 1, outIf: 'GigabitEthernet0/1' },
          },
          ISP: {
            kind: 'router',
            hostname: 'ISP-RTR',
            interfaces: {
              'GigabitEthernet0/0': { ip: '203.0.113.1', mask: '255.255.255.252', shutdown: false },
              'GigabitEthernet0/1': { ip: '198.51.100.1', mask: '255.255.255.0', shutdown: false },
            },
          },
          PC: pc('PC-WH', '192.168.50.10', '255.255.255.0', '192.168.50.1'),
          WEB: pc('VENDOR-WEB', '198.51.100.10', '255.255.255.0', '198.51.100.1'),
        },
        links: [
          ['PC', 'NIC', 'R1', 'GigabitEthernet0/0'],
          ['R1', 'GigabitEthernet0/1', 'ISP', 'GigabitEthernet0/0'],
          ['WEB', 'NIC', 'ISP', 'GigabitEthernet0/1'],
        ],
      },
      start: 'R1',
      objectives: [
        { text: 'Gi0/0 (LAN) is NAT inside and Gi0/1 (ISP) is NAT outside', check: (w) => iface(w, 'R1', 'GigabitEthernet0/0').nat === 'inside' && iface(w, 'R1', 'GigabitEthernet0/1').nat === 'outside' },
        { text: 'PC-WH can ping the vendor web server, 198.51.100.10', check: (w) => can(w, 'PC', '198.51.100.10') },
        { text: 'Ping from PC-WH and see the translation in show ip nat translations', check: (w) => (w.devices.R1.natTable || []).some((t) => t.inside === '192.168.50.10' && t.global === '203.0.113.2') },
      ],
      hints: [
        'show running-config on HPL-EDGE. The ACL and the overload statement look right. Check which interface is inside and which is outside.',
        'They are swapped. interface g0/0, ip nat inside. interface g0/1, ip nat outside.',
        'Ping 198.51.100.10 from PC-WH, then run show ip nat translations on HPL-EDGE.',
      ],
      solution: {
        R1: ['en', 'conf t', 'int g0/0', 'ip nat inside', 'int g0/1', 'ip nat outside', 'end'],
        PC: ['ping 198.51.100.10'],
      },
      debrief: {
        what: 'NAT only translates traffic that enters an inside interface and leaves an outside interface. With the roles swapped, packets left with their private source address, the web server answered to 192.168.50.10, and the ISP had no route for it. PAT (overload) maps every inside host to the one public address, keeping them apart by port number.',
        exam: 'Inside local is the private host address; inside global is the public address it becomes. The PAT command is ip nat inside source list ACL interface INTERFACE overload. Use show ip nat translations to verify and clear ip nat translation * to reset.',
      },
    },

    /* ------------------------------------------------------------ */
    {
      id: 't13',
      number: 'TT-1013',
      title: 'IPv6 stops at headquarters',
      topic: 'IPv6',
      priority: 'P2',
      jitl: { label: 'Days 31 to 33: IPv6', url: yt('Day 31 IPv6 Part 1') },
      ptLab: 'Days 31 to 33 labs: IPv6 addressing and IPv6 static routes.',
      story: [
        'Harbor Point is piloting IPv6 between headquarters and the Glen Burnie branch. Every interface has its address and the HQ router has a route to the branch, but a ping between the two pilot PCs fails.',
        'Both PCs can ping their own gateways. Find out why the packets die at HQ, and whether they could even make it back.',
      ],
      topology: {
        nodes: [
          { id: 'PC1', x: 70, y: 70, type: 'pc' },
          { id: 'R1', x: 240, y: 70, type: 'router' },
          { id: 'R2', x: 430, y: 70, type: 'router' },
          { id: 'PC2', x: 600, y: 70, type: 'pc' },
        ],
      },
      world: {
        devices: {
          R1: {
            kind: 'router',
            hostname: 'HPL-HQ',
            interfaces: {
              'GigabitEthernet0/0': { shutdown: false, ipv6: [{ addr: '2001:DB8:10::1', p: 64 }] },
              'GigabitEthernet0/1': { shutdown: false, ipv6: [{ addr: '2001:DB8:12::1', p: 64 }] },
            },
            routes6: [{ pfx: '2001:DB8:20::/64', nh: '2001:DB8:12::2' }],
          },
          R2: {
            kind: 'router',
            hostname: 'HPL-BRANCH',
            v6routing: true,
            interfaces: {
              'GigabitEthernet0/0': { shutdown: false, ipv6: [{ addr: '2001:DB8:20::1', p: 64 }] },
              'GigabitEthernet0/1': { shutdown: false, ipv6: [{ addr: '2001:DB8:12::2', p: 64 }] },
            },
          },
          PC1: { kind: 'pc', hostname: 'PC-HQ6', pc: { ip6: '2001:DB8:10::10', p6: 64, gw6: '2001:DB8:10::1' } },
          PC2: { kind: 'pc', hostname: 'PC-BR6', pc: { ip6: '2001:DB8:20::10', p6: 64, gw6: '2001:DB8:20::1' } },
        },
        links: [
          ['PC1', 'NIC', 'R1', 'GigabitEthernet0/0'],
          ['R1', 'GigabitEthernet0/1', 'R2', 'GigabitEthernet0/1'],
          ['PC2', 'NIC', 'R2', 'GigabitEthernet0/0'],
        ],
      },
      start: 'R1',
      objectives: [
        { text: 'HPL-HQ forwards IPv6 packets (ipv6 unicast-routing)', check: (w) => !!w.devices.R1.v6routing },
        {
          text: 'HPL-BRANCH has a route back to 2001:DB8:10::/64 (a ::/0 default counts)',
          check: (w) => TT.net.routingTable6(w, 'R2').some((r) => r.type === 'S' && ((r.p === 64 && TT.ip6.v6fmt(r.net) === '2001:DB8:10::') || r.p === 0)),
        },
        { text: 'PC-HQ6 can ping PC-BR6 at 2001:DB8:20::10', check: (w) => TT.net.ping6(w, 'PC1', '2001:DB8:20::10').ok },
      ],
      hints: [
        'show ipv6 route on HPL-HQ looks fine. Compare show running-config on both routers: one global command is missing at HQ.',
        'Routers do not route IPv6 until you enable it: ipv6 unicast-routing in global config on HPL-HQ.',
        'HPL-BRANCH has no way back. ipv6 route 2001:db8:10::/64 2001:db8:12::1 (or ipv6 route ::/0 2001:db8:12::1).',
      ],
      solution: {
        R1: ['en', 'conf t', 'ipv6 unicast-routing', 'end'],
        R2: ['en', 'conf t', 'ipv6 route 2001:db8:10::/64 2001:db8:12::1', 'end'],
      },
      debrief: {
        what: 'A Cisco router answers IPv6 on its own interfaces as soon as they have addresses, but it will not forward IPv6 between interfaces until ipv6 unicast-routing is on. That is why each PC could reach its own gateway while nothing crossed the WAN. And, as with IPv4, every path needs a route back.',
        exam: 'IPv6 static routes come in three styles: recursive (next-hop address), directly attached (exit interface, only on point-to-point links) and fully specified (both). A link-local next hop always needs the exit interface too. The IPv6 default route is ::/0.',
      },
    },

    /* ------------------------------------------------------------ */
    {
      id: 't14',
      number: 'TT-1014',
      title: 'Passwords in clear text',
      topic: 'SSH hardening',
      priority: 'P1',
      jitl: { label: 'Day 42: SSH', url: yt('Day 42 SSH') },
      ptLab: 'Day 42 lab: configure SSH and disable Telnet.',
      story: [
        'A security scan flagged the edge router: it accepts Telnet, so every admin password crosses the network in clear text. Policy says admins log in over SSH version 2 with their own local accounts.',
        'Set up SSH, create the account netadmin, and make sure Telnet no longer works. Test from PC-ADMIN.',
      ],
      topology: {
        nodes: [
          { id: 'PC', x: 110, y: 70, type: 'pc' },
          { id: 'SW', x: 330, y: 70, type: 'switch' },
          { id: 'R1', x: 550, y: 70, type: 'router' },
        ],
      },
      world: {
        devices: {
          R1: {
            kind: 'router',
            hostname: 'HPL-EDGE',
            interfaces: {
              'GigabitEthernet0/0': { ip: '10.0.99.1', mask: '255.255.255.0', shutdown: false },
              'GigabitEthernet0/1': { shutdown: true },
            },
            vty: { transport: ['telnet'], login: 'password', password: 'cisco' },
          },
          SW: sw('HPL-MGMT-SW', 8),
          PC: pc('PC-ADMIN', '10.0.99.10', '255.255.255.0', '10.0.99.1'),
        },
        links: [
          ['PC', 'NIC', 'SW', 'FastEthernet0/1'],
          ['R1', 'GigabitEthernet0/0', 'SW', 'GigabitEthernet0/1'],
        ],
      },
      start: 'R1',
      objectives: [
        { text: 'SSH version 2 is running, with RSA keys of at least 768 bits', check: (w) => (w.devices.R1.rsa || 0) >= 768 && w.devices.R1.sshver === 2 },
        { text: 'Local user netadmin exists with a hashed secret', check: (w) => !!((w.devices.R1.users || {}).netadmin || {}).secret },
        { text: 'VTY lines accept SSH only and check local accounts', check: (w) => { const v = w.devices.R1.vty || {}; return JSON.stringify(v.transport) === '["ssh"]' && v.login === 'local'; } },
        { text: 'PC-ADMIN can SSH to 10.0.99.1 as netadmin', check: (w) => TT.net.remoteLogin(w, 'PC', '10.0.99.1', 'ssh', 'netadmin').ok },
        { text: 'Telnet from PC-ADMIN is refused', check: (w) => !TT.net.remoteLogin(w, 'PC', '10.0.99.1', 'telnet').ok },
      ],
      hints: [
        'From PC-ADMIN, telnet 10.0.99.1 works today. On the router, show ip ssh says SSH is disabled because there are no RSA keys.',
        'RSA keys need a hostname (done) and a domain: ip domain-name hpl.local, then crypto key generate rsa modulus 2048, then ip ssh version 2.',
        'username netadmin secret <password>. Then line vty 0 15, transport input ssh, login local. Test with ssh -l netadmin 10.0.99.1 on the PC.',
      ],
      solution: {
        R1: ['en', 'conf t', 'ip domain-name hpl.local', 'crypto key generate rsa modulus 2048', 'ip ssh version 2', 'username netadmin secret Harb0rP0int!', 'line vty 0 15', 'transport input ssh', 'login local', 'end'],
        PC: ['ssh -l netadmin 10.0.99.1'],
      },
      debrief: {
        what: 'SSH encrypts the whole session; Telnet sends everything, including passwords, in clear text. IOS builds its RSA key name from the hostname and domain name, so both must exist before crypto key generate rsa works, and SSH version 2 needs a key of at least 768 bits.',
        exam: 'The full recipe: hostname, ip domain-name, crypto key generate rsa (768 bits or more), ip ssh version 2, username ... secret, then under line vty: login local and transport input ssh. secret is hashed; password is clear text unless service password-encryption is on, and even then it is only weak type 7.',
      },
    },

    /* ------------------------------------------------------------ */
    {
      id: 't15',
      number: 'TT-1015',
      title: 'The new hire\'s port is dead',
      topic: 'Port security',
      priority: 'P2',
      jitl: { label: 'Day 49: Port Security', url: yt('Day 49 Port Security') },
      ptLab: 'Day 49 lab: port security with sticky MAC addresses and err-disabled recovery.',
      story: [
        'A new hire got a new PC on desk port Fa0/3 this morning and has no network at all. The port\'s light is off. Port security on this switch allows one sticky MAC address per desk port.',
        'Get the new PC online without turning port security off, and while you are there, shut down the unused ports Fa0/5 through Fa0/8 as the security baseline requires.',
      ],
      topology: {
        nodes: [
          { id: 'ANA', x: 90, y: 40, type: 'pc' },
          { id: 'BEN', x: 90, y: 150, type: 'pc' },
          { id: 'SW', x: 340, y: 95, type: 'switch' },
          { id: 'NEW', x: 590, y: 40, type: 'pc' },
          { id: 'PRN', x: 590, y: 150, type: 'printer' },
        ],
      },
      world: {
        devices: {
          SW: sw('HPL-ACC4', 8, {
            'FastEthernet0/1': { modeSet: true, ps: { on: true, max: 1, sticky: true, macs: ['0050.7966.6801'] } },
            'FastEthernet0/2': { modeSet: true, ps: { on: true, max: 1, sticky: true, macs: ['0050.7966.6802'] } },
            'FastEthernet0/3': { modeSet: true, errdis: true, ps: { on: true, max: 1, sticky: true, macs: ['0050.7966.6803'], violations: 1, last: '00e0.4c68.1a2b' } },
            'FastEthernet0/4': { modeSet: true },
          }),
          ANA: { kind: 'pc', hostname: 'PC-ANA', pc: { ip: '10.10.4.11', mask: '255.255.255.0', gw: '', mac: '0050.7966.6801' } },
          BEN: { kind: 'pc', hostname: 'PC-BEN', pc: { ip: '10.10.4.12', mask: '255.255.255.0', gw: '', mac: '0050.7966.6802' } },
          NEW: { kind: 'pc', hostname: 'PC-NEW', pc: { ip: '10.10.4.13', mask: '255.255.255.0', gw: '', mac: '00e0.4c68.1a2b' } },
          PRN: { kind: 'pc', hostname: 'PRINTER', pc: { ip: '10.10.4.50', mask: '255.255.255.0', gw: '', mac: '0050.7966.6850' } },
        },
        links: [
          ['ANA', 'NIC', 'SW', 'FastEthernet0/1'],
          ['BEN', 'NIC', 'SW', 'FastEthernet0/2'],
          ['NEW', 'NIC', 'SW', 'FastEthernet0/3'],
          ['PRN', 'NIC', 'SW', 'FastEthernet0/4'],
        ],
      },
      start: 'SW',
      objectives: [
        {
          text: 'Fa0/3 is back up with port security still on (maximum 1, sticky)',
          check: (w) => { const i = iface(w, 'SW', 'FastEthernet0/3'); return !i.errdis && !i.shutdown && i.ps && i.ps.on && (i.ps.max || 1) === 1 && i.ps.sticky; },
        },
        { text: 'The sticky MAC on Fa0/3 is PC-NEW\'s (00e0.4c68.1a2b)', check: (w) => JSON.stringify(iface(w, 'SW', 'FastEthernet0/3').ps.macs) === '["00e0.4c68.1a2b"]' },
        { text: 'PC-NEW can ping the printer at 10.10.4.50', check: (w) => can(w, 'NEW', '10.10.4.50') },
        { text: 'Unused ports Fa0/5 to Fa0/8 are shut down', check: (w) => [5, 6, 7, 8].every((n) => iface(w, 'SW', 'FastEthernet0/' + n).shutdown) },
      ],
      hints: [
        'show interfaces status shows Fa0/3 err-disabled. show port-security interface fa0/3 shows whose MAC address is stuck there.',
        'The sticky MAC belongs to the old PC. Remove it: interface fa0/3, no switchport port-security mac-address sticky 0050.7966.6803.',
        'An err-disabled port stays down until you run shutdown, then no shutdown. Then interface range fa0/5 - 8, shutdown.',
      ],
      solution: {
        SW: ['en', 'conf t', 'int fa0/3', 'no switchport port-security mac-address sticky 0050.7966.6803', 'shutdown', 'no shutdown', 'interface range fa0/5 - 8', 'shutdown', 'end'],
      },
      debrief: {
        what: 'The old PC\'s MAC address was saved as a sticky address, so when the new PC sent its first frame the port saw a second MAC, counted a violation and went err-disabled. Removing the old sticky entry and bouncing the port lets it learn the new PC. If you bounce it first, it just violates again.',
        exam: 'Defaults: maximum 1 address, violation mode shutdown. shutdown err-disables the port; restrict drops and logs (and counts violations); protect drops silently. Port security needs a port hard-coded with switchport mode access or trunk. errdisable recovery cause psecure-violation can bring ports back automatically.',
      },
    },

    /* ------------------------------------------------------------ */
    {
      id: 't16',
      number: 'TT-1016',
      title: 'One gateway down, whole floor down',
      topic: 'HSRP',
      priority: 'P1',
      jitl: { label: 'Day 29: First Hop Redundancy Protocols', url: yt('Day 29 First Hop Redundancy Protocols') },
      ptLab: 'Day 29 lab: configure HSRP and test failover.',
      story: [
        'The second floor has two gateway routers so that one can fail without anyone noticing. Last week HPL-GW1 rebooted and the whole floor lost the network for twenty minutes anyway.',
        'PCs use 10.1.1.1 as their gateway, a virtual IP that HSRP should move between the routers. Make HPL-GW1 the normal active router, and make sure HPL-GW2 really takes over.',
      ],
      topology: {
        nodes: [
          { id: 'PC', x: 70, y: 95, type: 'pc' },
          { id: 'SW', x: 210, y: 95, type: 'switch' },
          { id: 'R1', x: 360, y: 40, type: 'router' },
          { id: 'R2', x: 360, y: 150, type: 'router' },
          { id: 'R3', x: 500, y: 95, type: 'router' },
          { id: 'SRV', x: 620, y: 95, type: 'pc' },
        ],
      },
      world: {
        devices: {
          R1: {
            kind: 'router',
            hostname: 'HPL-GW1',
            interfaces: {
              'GigabitEthernet0/0': { ip: '10.1.1.2', mask: '255.255.255.0', shutdown: false, standby: { 1: { ip: '10.1.1.1' } } },
              'GigabitEthernet0/1': { ip: '10.0.13.1', mask: '255.255.255.252', shutdown: false },
            },
            ospf: { pid: 1, routerId: '1.1.1.1', passive: ['GigabitEthernet0/0'], networks: [{ net: '10.1.1.0', wild: '0.0.0.255', area: 0 }, { net: '10.0.13.0', wild: '0.0.0.3', area: 0 }] },
          },
          R2: {
            kind: 'router',
            hostname: 'HPL-GW2',
            interfaces: {
              'GigabitEthernet0/0': { ip: '10.1.1.3', mask: '255.255.255.0', shutdown: false },
              'GigabitEthernet0/1': { ip: '10.0.23.1', mask: '255.255.255.252', shutdown: false, standby: { 1: { ip: '10.1.1.1' } } },
            },
            ospf: { pid: 1, routerId: '2.2.2.2', passive: ['GigabitEthernet0/0'], networks: [{ net: '10.1.1.0', wild: '0.0.0.255', area: 0 }, { net: '10.0.23.0', wild: '0.0.0.3', area: 0 }] },
          },
          R3: {
            kind: 'router',
            hostname: 'HPL-CORE',
            interfaces: {
              'GigabitEthernet0/0': { ip: '10.0.13.2', mask: '255.255.255.252', shutdown: false },
              'GigabitEthernet0/1': { ip: '10.0.23.2', mask: '255.255.255.252', shutdown: false },
              'GigabitEthernet0/2': { ip: '10.9.9.1', mask: '255.255.255.0', shutdown: false },
            },
            ospf: { pid: 1, routerId: '3.3.3.3', passive: ['GigabitEthernet0/2'], networks: [{ net: '10.0.13.0', wild: '0.0.0.3', area: 0 }, { net: '10.0.23.0', wild: '0.0.0.3', area: 0 }, { net: '10.9.9.0', wild: '0.0.0.255', area: 0 }] },
          },
          SW: sw('HPL-ACC5', 8),
          PC: pc('PC-FLOOR2', '10.1.1.10', '255.255.255.0', '10.1.1.1'),
          SRV: pc('APP-SRV', '10.9.9.10', '255.255.255.0', '10.9.9.1'),
        },
        links: [
          ['PC', 'NIC', 'SW', 'FastEthernet0/1'],
          ['R1', 'GigabitEthernet0/0', 'SW', 'GigabitEthernet0/1'],
          ['R2', 'GigabitEthernet0/0', 'SW', 'GigabitEthernet0/2'],
          ['R1', 'GigabitEthernet0/1', 'R3', 'GigabitEthernet0/0'],
          ['R2', 'GigabitEthernet0/1', 'R3', 'GigabitEthernet0/1'],
          ['SRV', 'NIC', 'R3', 'GigabitEthernet0/2'],
        ],
      },
      start: 'R1',
      objectives: [
        {
          text: 'Both gateways run HSRP group 1 on Gi0/0 with virtual IP 10.1.1.1, and nowhere else',
          check: (w) => ['R1', 'R2'].every((r) => ((iface(w, r, 'GigabitEthernet0/0').standby || {})[1] || {}).ip === '10.1.1.1' && !(iface(w, r, 'GigabitEthernet0/1').standby || {})[1]),
        },
        {
          text: 'HPL-GW1 is active, with a priority above 100 and preempt',
          check: (w) => { const c = (iface(w, 'R1', 'GigabitEthernet0/0').standby || {})[1] || {}; return (c.prio || 100) > 100 && !!c.preempt && TT.net.vipsOf(w, 'R1', 'GigabitEthernet0/0').length > 0; },
        },
        { text: 'PC-FLOOR2 can reach APP-SRV at 10.9.9.10', check: (w) => can(w, 'PC', '10.9.9.10') },
        {
          text: 'Failover test: with HPL-GW1\'s Gi0/0 down, PC-FLOOR2 still reaches APP-SRV',
          check: (w) => { const c = TT.net.clone(w); c.devices.R1.interfaces['GigabitEthernet0/0'].shutdown = true; return can(c, 'PC', '10.9.9.10'); },
        },
      ],
      hints: [
        'show standby brief on both routers. HPL-GW2 shows group 1 on the wrong interface.',
        'On HPL-GW2: interface g0/1, no standby 1. Then interface g0/0, standby 1 ip 10.1.1.1.',
        'Equal priorities mean the higher IP (HPL-GW2) wins. On HPL-GW1 Gi0/0: standby 1 priority 110 and standby 1 preempt.',
      ],
      solution: {
        R2: ['en', 'conf t', 'int g0/1', 'no standby 1', 'int g0/0', 'standby 1 ip 10.1.1.1', 'end'],
        R1: ['en', 'conf t', 'int g0/0', 'standby 1 priority 110', 'standby 1 preempt', 'end'],
      },
      debrief: {
        what: 'HSRP only protects the gateway if both routers are in the same group on the same LAN. HPL-GW2 had group 1 on its uplink, so when HPL-GW1 rebooted, nobody owned 10.1.1.1. With priorities tied, the higher interface IP wins the active role, so set a priority on the router you want active, and preempt so it takes the role back after a reboot.',
        exam: 'HSRP is Cisco-only: active and standby, default priority 100, preempt off by default, version 1 virtual MAC 0000.0c07.acXX. VRRP is the open standard (master and backup, preempt on by default). GLBP is Cisco and load-balances with one AVG and up to four AVFs.',
      },
    },

    /* ------------------------------------------------------------ */
    {
      id: 't17',
      number: 'TT-1017',
      title: 'The DR site is invisible',
      topic: 'EIGRP',
      priority: 'P2',
      jitl: { label: 'Day 25: RIP and EIGRP', url: yt('Day 25 RIP EIGRP') },
      ptLab: 'Day 25 lab: configure EIGRP and fix neighbor problems.',
      story: [
        'The disaster recovery site connects through the core router and runs EIGRP like the rest of the company. After a contractor rebuilt HPL-DR, headquarters can no longer reach the DR server LAN, 192.168.40.0/24.',
        'There may be more than one problem. Start from HPL-CORE.',
      ],
      topology: {
        nodes: [
          { id: 'PC1', x: 60, y: 70, type: 'pc' },
          { id: 'R1', x: 190, y: 70, type: 'router' },
          { id: 'R2', x: 340, y: 70, type: 'router' },
          { id: 'R3', x: 490, y: 70, type: 'router' },
          { id: 'PC3', x: 620, y: 70, type: 'pc' },
        ],
      },
      world: {
        devices: {
          R1: {
            kind: 'router',
            hostname: 'HPL-HQ',
            interfaces: {
              'GigabitEthernet0/0': { ip: '192.168.10.1', mask: '255.255.255.0', shutdown: false },
              'GigabitEthernet0/1': { ip: '10.2.12.1', mask: '255.255.255.252', shutdown: false },
            },
            eigrp: { as: 100, networks: [{ net: '192.168.10.0', wild: '0.0.0.255' }, { net: '10.2.12.0', wild: '0.0.0.3' }], passive: ['GigabitEthernet0/0'] },
          },
          R2: {
            kind: 'router',
            hostname: 'HPL-CORE',
            interfaces: {
              'GigabitEthernet0/0': { ip: '10.2.12.2', mask: '255.255.255.252', shutdown: false },
              'GigabitEthernet0/1': { ip: '10.2.23.1', mask: '255.255.255.252', shutdown: false },
            },
            eigrp: { as: 100, networks: [{ net: '10.0.0.0' }], passive: ['GigabitEthernet0/1'] },
          },
          R3: {
            kind: 'router',
            hostname: 'HPL-DR',
            interfaces: {
              'GigabitEthernet0/0': { ip: '192.168.40.1', mask: '255.255.255.0', shutdown: false },
              'GigabitEthernet0/1': { ip: '10.2.23.2', mask: '255.255.255.252', shutdown: false },
            },
            eigrp: { as: 101, networks: [{ net: '10.2.23.0', wild: '0.0.0.3' }, { net: '192.168.40.0', wild: '0.0.0.255' }], passive: [] },
          },
          PC1: pc('PC-HQ', '192.168.10.10', '255.255.255.0', '192.168.10.1'),
          PC3: pc('DR-SRV', '192.168.40.10', '255.255.255.0', '192.168.40.1'),
        },
        links: [
          ['PC1', 'NIC', 'R1', 'GigabitEthernet0/0'],
          ['R1', 'GigabitEthernet0/1', 'R2', 'GigabitEthernet0/0'],
          ['R2', 'GigabitEthernet0/1', 'R3', 'GigabitEthernet0/1'],
          ['PC3', 'NIC', 'R3', 'GigabitEthernet0/0'],
        ],
      },
      start: 'R2',
      objectives: [
        { text: 'HPL-CORE and HPL-DR are EIGRP neighbors', check: (w) => TT.net.computeEigrp(w).adj.some((a) => a.a === 'R2' && a.b === 'R3') },
        { text: 'HPL-HQ learns 192.168.40.0/24 through EIGRP', check: (w) => TT.net.routingTable(w, 'R1').some((r) => r.type === 'D' && TT.ip.intToIp(r.net) === '192.168.40.0' && r.p === 24) },
        { text: 'PC-HQ can ping DR-SRV at 192.168.40.10', check: (w) => can(w, 'PC1', '192.168.40.10') },
      ],
      hints: [
        'show ip eigrp neighbors on HPL-CORE lists only HPL-HQ. show running-config on HPL-CORE: look at the router eigrp section.',
        'HPL-CORE has passive-interface on Gi0/1, the link to HPL-DR. router eigrp 100, no passive-interface g0/1.',
        'HPL-DR runs AS 101; neighbors must share the AS number. no router eigrp 101, then router eigrp 100 with network 10.2.23.0 0.0.0.3 and network 192.168.40.0 0.0.0.255.',
      ],
      solution: {
        R2: ['en', 'conf t', 'router eigrp 100', 'no passive-interface g0/1', 'end'],
        R3: ['en', 'conf t', 'no router eigrp 101', 'router eigrp 100', 'network 10.2.23.0 0.0.0.3', 'network 192.168.40.0 0.0.0.255', 'passive-interface g0/0', 'end'],
      },
      debrief: {
        what: 'Two faults hid behind one symptom. A passive interface sends no hellos, so HPL-CORE never tried to peer with HPL-DR. And EIGRP routers only become neighbors when their autonomous system numbers match, so HPL-DR in AS 101 would never have peered anyway.',
        exam: 'EIGRP: AD 90 internal, 170 external; hellos to 224.0.0.10; metric from bandwidth and delay by default. Neighbors need the same AS number, matching K-values, the same subnet and (if used) authentication. The successor is the best route; a feasible successor is a loop-free backup. variance enables unequal-cost load balancing. A network statement without a wildcard is classful (10.0.0.0 covers all of 10.0.0.0/8).',
      },
    },

    /* ------------------------------------------------------------ */
    {
      id: 't18',
      number: 'TT-1018',
      title: 'A rogue DHCP server in sales',
      topic: 'DHCP snooping and DAI',
      priority: 'P1',
      jitl: { label: 'Days 50 and 51: DHCP Snooping and DAI', url: yt('Day 50 DHCP Snooping') },
      ptLab: 'Days 50 and 51 labs: DHCP snooping and Dynamic ARP Inspection.',
      story: [
        'Sales PCs keep getting 192.168.1.x addresses and losing access to everything. Someone plugged a home Wi-Fi router into wall port Fa0/8, and it is handing out addresses faster than the real DHCP server behind HPL-CORE.',
        'Stop rogue DHCP on this switch without unplugging anything, get PC-A a real address, then turn on Dynamic ARP Inspection for the VLAN so spoofed ARP is blocked too.',
      ],
      topology: {
        nodes: [
          { id: 'PCA', x: 70, y: 40, type: 'pc' },
          { id: 'PCB', x: 70, y: 150, type: 'pc' },
          { id: 'ROGUE', x: 230, y: 165, type: 'printer' },
          { id: 'SW', x: 250, y: 70, type: 'switch' },
          { id: 'R1', x: 440, y: 70, type: 'router' },
          { id: 'SRV', x: 610, y: 70, type: 'pc' },
        ],
      },
      world: {
        devices: {
          SW: sw('HPL-ACC3', 8, {
            'FastEthernet0/1': { accessVlan: 10, modeSet: true },
            'FastEthernet0/2': { accessVlan: 10, modeSet: true },
            'FastEthernet0/8': { accessVlan: 10, modeSet: true },
            'GigabitEthernet0/1': { accessVlan: 10, modeSet: true },
          }, { 1: 'default', 10: 'SALES' }),
          R1: {
            kind: 'router',
            hostname: 'HPL-CORE',
            interfaces: {
              'GigabitEthernet0/0': { ip: '10.30.10.1', mask: '255.255.255.0', shutdown: false, helpers: ['10.9.9.5'] },
              'GigabitEthernet0/1': { ip: '10.9.9.1', mask: '255.255.255.0', shutdown: false },
            },
          },
          SRV: {
            kind: 'pc',
            hostname: 'DHCP-SRV',
            pc: { ip: '10.9.9.5', mask: '255.255.255.0', gw: '10.9.9.1', server: true, pools: [{ name: 'SALES', network: '10.30.10.0', mask: '255.255.255.0', gw: '10.30.10.1', start: '10.30.10.100', end: '10.30.10.199' }] },
          },
          ROGUE: {
            kind: 'pc',
            hostname: 'UNKNOWN-AP',
            pc: { ip: '192.168.1.1', mask: '255.255.255.0', gw: '', mac: '0018.e7aa.0101', server: true, pools: [{ name: 'home', network: '192.168.1.0', mask: '255.255.255.0', gw: '192.168.1.1', start: '192.168.1.100', end: '192.168.1.149' }] },
          },
          PCA: { kind: 'pc', hostname: 'PC-A', pc: { dhcp: true, ip: '192.168.1.100', mask: '255.255.255.0', gw: '192.168.1.1' } },
          PCB: { kind: 'pc', hostname: 'PC-B', pc: { dhcp: true, ip: '192.168.1.101', mask: '255.255.255.0', gw: '192.168.1.1' } },
        },
        links: [
          ['PCA', 'NIC', 'SW', 'FastEthernet0/1'],
          ['PCB', 'NIC', 'SW', 'FastEthernet0/2'],
          ['ROGUE', 'NIC', 'SW', 'FastEthernet0/8'],
          ['R1', 'GigabitEthernet0/0', 'SW', 'GigabitEthernet0/1'],
          ['SRV', 'NIC', 'R1', 'GigabitEthernet0/1'],
        ],
      },
      start: 'SW',
      objectives: [
        {
          text: 'DHCP snooping is on for VLAN 10, and only the uplink Gi0/1 is trusted',
          check: (w) => {
            const d = w.devices.SW;
            const trusted = Object.entries(d.interfaces).filter(([, i]) => i.snoopTrust).map(([n]) => n);
            return !!(d.snoop && d.snoop.on && d.snoop.vlans.includes(10)) && JSON.stringify(trusted) === '["GigabitEthernet0/1"]';
          },
        },
        { text: 'PC-A has an address from 10.30.10.0/24', check: (w) => (w.devices.PCA.pc.ip || '').startsWith('10.30.10.') },
        { text: 'Dynamic ARP Inspection is on for VLAN 10, with Gi0/1 trusted', check: (w) => { const d = w.devices.SW; return !!(d.dai && d.dai.vlans.includes(10)) && !!iface(w, 'SW', 'GigabitEthernet0/1').daiTrust; } },
        { text: 'PC-A can ping DHCP-SRV at 10.9.9.5', check: (w) => can(w, 'PCA', '10.9.9.5') },
      ],
      hints: [
        'On PC-A, ipconfig shows a 192.168.1.x address and gateway 192.168.1.1, which is not ours. Every switch port trusts DHCP server messages until snooping is on.',
        'ip dhcp snooping, ip dhcp snooping vlan 10, then on the uplink: interface g0/1, ip dhcp snooping trust. Then ipconfig /renew on PC-A.',
        'ip arp inspection vlan 10, and on Gi0/1: ip arp inspection trust. DAI checks ARP against the snooping bindings, so renew PC-A after snooping is on.',
      ],
      solution: {
        SW: ['en', 'conf t', 'ip dhcp snooping', 'ip dhcp snooping vlan 10', 'no ip dhcp snooping information option', 'int g0/1', 'ip dhcp snooping trust', 'ip arp inspection trust', 'exit', 'ip arp inspection vlan 10', 'end'],
        PCA: ['ipconfig /renew'],
      },
      debrief: {
        what: 'With DHCP snooping on, untrusted ports may only send client messages; server messages (Offer, Ack) are dropped unless they arrive on a trusted port, so the rogue router went silent. Snooping also records which IP and MAC live on each port, and DAI uses that binding table to drop ARP replies that lie about who owns an address.',
        exam: 'Trust only the ports toward your real DHCP server or relay. Snooping inserts option 82 by default, which can make a Cisco relay or server drop requests; no ip dhcp snooping information option is the usual fix in labs. DAI needs snooping (or ARP ACLs for static hosts), and uplinks to routers and other switches are trusted. Both features have per-port rate limits that err-disable a flooding port.',
      },
    },

    /* ------------------------------------------------------------ */
    {
      id: 't19',
      number: 'TT-1019',
      title: 'The weakest router is in charge',
      topic: 'OSPF DR/BDR',
      priority: 'P2',
      jitl: { label: 'Days 26 to 28: OSPF', url: yt('Day 27 OSPF Part 2') },
      ptLab: 'Day 27 and 28 labs: OSPF DR/BDR election and network types.',
      story: [
        'Four routers share the core LAN, and OSPF elected a designated router for it. It picked HPL-EDGE, a small branch-grade box that already runs out of CPU on busy nights. Policy: HPL-CORE is the DR, HPL-DIST is the backup, and HPL-EDGE must never be DR or BDR.',
        'Separately, the data center router HPL-DC is cabled straight to HPL-CORE, and its server LAN has vanished from the routing tables since someone "tidied up" the configs.',
      ],
      topology: {
        nodes: [
          { id: 'R3', x: 80, y: 40, type: 'router' },
          { id: 'PC', x: 80, y: 155, type: 'pc' },
          { id: 'SW', x: 250, y: 95, type: 'switch' },
          { id: 'R2', x: 250, y: 190, type: 'router' },
          { id: 'R1', x: 430, y: 95, type: 'router' },
          { id: 'R4', x: 560, y: 40, type: 'router' },
          { id: 'SRV', x: 560, y: 155, type: 'pc' },
        ],
      },
      world: {
        devices: {
          R1: {
            kind: 'router', hostname: 'HPL-CORE',
            interfaces: {
              'GigabitEthernet0/0': { ip: '10.0.0.1', mask: '255.255.255.0', shutdown: false },
              'GigabitEthernet0/1': { ip: '10.0.14.1', mask: '255.255.255.252', shutdown: false },
            },
            ospf: { pid: 1, routerId: '1.1.1.1', passive: [], networks: [{ net: '10.0.0.0', wild: '0.0.0.255', area: 0 }, { net: '10.0.14.0', wild: '0.0.0.3', area: 0 }] },
          },
          R2: {
            kind: 'router', hostname: 'HPL-DIST',
            interfaces: { 'GigabitEthernet0/0': { ip: '10.0.0.2', mask: '255.255.255.0', shutdown: false } },
            ospf: { pid: 1, routerId: '2.2.2.2', passive: [], networks: [{ net: '10.0.0.0', wild: '0.0.0.255', area: 0 }] },
          },
          R3: {
            kind: 'router', hostname: 'HPL-EDGE',
            interfaces: {
              'GigabitEthernet0/0': { ip: '10.0.0.3', mask: '255.255.255.0', shutdown: false },
              'GigabitEthernet0/1': { ip: '10.30.0.1', mask: '255.255.255.0', shutdown: false },
            },
            ospf: { pid: 1, routerId: '3.3.3.3', passive: ['GigabitEthernet0/1'], networks: [{ net: '10.0.0.0', wild: '0.0.0.255', area: 0 }, { net: '10.30.0.0', wild: '0.0.0.255', area: 0 }] },
          },
          R4: {
            kind: 'router', hostname: 'HPL-DC',
            interfaces: {
              'GigabitEthernet0/1': { ip: '10.0.14.2', mask: '255.255.255.252', shutdown: false, ospfNet: 'p2p' },
              'GigabitEthernet0/2': { ip: '10.40.0.1', mask: '255.255.255.0', shutdown: false },
            },
            ospf: { pid: 1, routerId: '4.4.4.4', passive: ['GigabitEthernet0/2'], networks: [{ net: '10.0.14.0', wild: '0.0.0.3', area: 0 }, { net: '10.40.0.0', wild: '0.0.0.255', area: 0 }] },
          },
          SW: sw('HPL-CORE-LAN', 4),
          PC: pc('PC-EDGE', '10.30.0.10', '255.255.255.0', '10.30.0.1'),
          SRV: pc('DC-SRV', '10.40.0.10', '255.255.255.0', '10.40.0.1'),
        },
        links: [
          ['R1', 'GigabitEthernet0/0', 'SW', 'GigabitEthernet0/1'],
          ['R2', 'GigabitEthernet0/0', 'SW', 'FastEthernet0/1'],
          ['R3', 'GigabitEthernet0/0', 'SW', 'GigabitEthernet0/2'],
          ['R1', 'GigabitEthernet0/1', 'R4', 'GigabitEthernet0/1'],
          ['PC', 'NIC', 'R3', 'GigabitEthernet0/1'],
          ['SRV', 'NIC', 'R4', 'GigabitEthernet0/2'],
        ],
        ospfDr: { '10.0.0.0/24': { dr: 'R3', bdr: 'R2' } },
      },
      start: 'R1',
      objectives: [
        { text: 'HPL-CORE is the DR on the core LAN (10.0.0.0/24)', check: (w) => { TT.net.computeOspf(w); return (w.ospfDr['10.0.0.0/24'] || {}).dr === 'R1'; } },
        { text: 'HPL-DIST is the BDR', check: (w) => { TT.net.computeOspf(w); return (w.ospfDr['10.0.0.0/24'] || {}).bdr === 'R2'; } },
        { text: 'HPL-EDGE can never become DR or BDR (priority 0)', check: (w) => iface(w, 'R3', 'GigabitEthernet0/0').ospfPrio === 0 },
        { text: 'The CORE to DC link runs as OSPF point-to-point on both ends', check: (w) => iface(w, 'R1', 'GigabitEthernet0/1').ospfNet === 'p2p' && iface(w, 'R4', 'GigabitEthernet0/1').ospfNet === 'p2p' },
        { text: 'PC-EDGE can reach DC-SRV at 10.40.0.10', check: (w) => can(w, 'PC', '10.40.0.10') },
      ],
      hints: [
        'show ip ospf interface g0/0 on any core router shows who is DR and BDR, and each router\'s priority. On HPL-CORE, compare show ip ospf interface g0/1 with the same command on HPL-DC.',
        'Raise priority with ip ospf priority on the core LAN interface: 255 on HPL-CORE, something lower but above 1 on HPL-DIST, and 0 on HPL-EDGE. On HPL-CORE g0/1 add ip ospf network point-to-point to match HPL-DC.',
        'DR elections are not preemptive. After setting priorities, run clear ip ospf process on HPL-CORE (answer yes) so the segment holds a fresh election.',
      ],
      solution: {
        R3: ['en', 'conf t', 'int g0/0', 'ip ospf priority 0', 'end'],
        R2: ['en', 'conf t', 'int g0/0', 'ip ospf priority 200', 'end'],
        R1: ['en', 'conf t', 'int g0/0', 'ip ospf priority 255', 'int g0/1', 'ip ospf network point-to-point', 'end', 'clear ip ospf process'],
      },
      debrief: {
        what: 'On a broadcast segment, OSPF elects a DR and BDR so routers do not each form a full adjacency with every other router. The highest priority wins, then the highest router ID; priority 0 means "never". Because the election is not preemptive, a new higher priority does nothing until the DR leaves or the process is cleared. The DC link failed for a different reason: one end was point-to-point and the other broadcast, so the neighbors came up but the routes never made it into the table.',
        exam: 'Default priority is 1 (range 0-255). DROTHERs stay in 2-WAY with each other and go FULL only with the DR and BDR. Point-to-point links elect no DR. Router ID order: router-id command, highest loopback IP, highest active interface IP. Hello/dead are 10/40 seconds on broadcast and point-to-point networks.',
      },
    },

    /* ------------------------------------------------------------ */
    {
      id: 't20',
      number: 'TT-1020',
      title: 'Retire the router-on-a-stick',
      topic: 'Layer 3 switching',
      priority: 'P2',
      jitl: { label: 'Day 18: VLANs Part 3 (SVIs) and Day 23: EtherChannel', url: yt('Day 18 VLANs Part 3') },
      ptLab: 'Day 18 lab: inter-VLAN routing with SVIs. Day 23 lab: Layer 3 EtherChannel.',
      story: [
        'Floor 6 is moving off its old router-on-a-stick onto the new Layer 3 core switch, HPL-CORE1. Sales (VLAN 10) and Engineering (VLAN 20) PCs already sit on the access switch, trunked up to the core. A contractor started the job and went home.',
        'The core also needs to reach the server farm behind HPL-CORE2 over a two-cable Layer 3 EtherChannel. HPL-CORE2 is finished and correct. Finish HPL-CORE1.',
      ],
      topology: {
        nodes: [
          { id: 'P10', x: 60, y: 40, type: 'pc' },
          { id: 'P20', x: 60, y: 160, type: 'pc' },
          { id: 'ACC', x: 200, y: 100, type: 'switch' },
          { id: 'C1', x: 360, y: 100, type: 'switch' },
          { id: 'C2', x: 520, y: 100, type: 'switch' },
          { id: 'SRV', x: 640, y: 100, type: 'pc' },
        ],
      },
      world: {
        devices: {
          C1: {
            kind: 'switch', hostname: 'HPL-CORE1', multilayer: true, mac: '0c11.0000.0001',
            vlans: { 1: 'default', 10: 'SALES', 20: 'ENG' },
            interfaces: {
              'GigabitEthernet1/0/1': { mode: 'trunk' },
              'GigabitEthernet1/0/23': { channel: { group: 1, mode: 'active' } },
              'GigabitEthernet1/0/24': { channel: { group: 1, mode: 'active' } },
              'Port-channel1': {},
              'Vlan10': { ip: '10.10.0.1', mask: '255.255.255.0', shutdown: true },
            },
          },
          C2: {
            kind: 'switch', hostname: 'HPL-CORE2', multilayer: true, ipRouting: true, mac: '0c22.0000.0001',
            vlans: { 1: 'default', 99: 'SERVERS' },
            interfaces: {
              'GigabitEthernet1/0/5': { accessVlan: 99, modeSet: true },
              'GigabitEthernet1/0/23': { routed: true, channel: { group: 1, mode: 'active' } },
              'GigabitEthernet1/0/24': { routed: true, channel: { group: 1, mode: 'active' } },
              'Port-channel1': { routed: true, ip: '10.255.0.2', mask: '255.255.255.252' },
              'Vlan99': { ip: '10.99.0.1', mask: '255.255.255.0', shutdown: false },
            },
            routes: [{ net: '10.10.0.0', mask: '255.255.255.0', nh: '10.255.0.1' }, { net: '10.20.0.0', mask: '255.255.255.0', nh: '10.255.0.1' }],
          },
          ACC: sw('HPL-ACC6', 4, {
            'FastEthernet0/1': { accessVlan: 10, modeSet: true },
            'FastEthernet0/2': { accessVlan: 20, modeSet: true },
            'GigabitEthernet0/1': { mode: 'trunk' },
          }, { 1: 'default', 10: 'SALES', 20: 'ENG' }),
          P10: pc('PC-SALES', '10.10.0.10', '255.255.255.0', '10.10.0.1'),
          P20: pc('PC-ENG', '10.20.0.10', '255.255.255.0', '10.20.0.1'),
          SRV: pc('FILE-SRV', '10.99.0.50', '255.255.255.0', '10.99.0.1'),
        },
        links: [
          ['P10', 'NIC', 'ACC', 'FastEthernet0/1'],
          ['P20', 'NIC', 'ACC', 'FastEthernet0/2'],
          ['ACC', 'GigabitEthernet0/1', 'C1', 'GigabitEthernet1/0/1'],
          ['C1', 'GigabitEthernet1/0/23', 'C2', 'GigabitEthernet1/0/23'],
          ['C1', 'GigabitEthernet1/0/24', 'C2', 'GigabitEthernet1/0/24'],
          ['SRV', 'NIC', 'C2', 'GigabitEthernet1/0/5'],
        ],
      },
      start: 'C1',
      objectives: [
        { text: 'HPL-CORE1 routes between its interfaces (ip routing)', check: (w) => !!w.devices.C1.ipRouting },
        { text: 'SVIs for VLAN 10 (10.10.0.1/24) and VLAN 20 (10.20.0.1/24) are up', check: (w) => iface(w, 'C1', 'Vlan10').ip === '10.10.0.1' && iface(w, 'C1', 'Vlan20').ip === '10.20.0.1' && TT.net.linkUp(w, 'C1', 'Vlan10') && TT.net.linkUp(w, 'C1', 'Vlan20') },
        { text: 'PC-SALES can ping PC-ENG (inter-VLAN routing)', check: (w) => can(w, 'P10', '10.20.0.10') },
        {
          text: 'Port-channel 1 is a Layer 3 EtherChannel (10.255.0.1/30) with both links bundled',
          check: (w) => { const g = TT.net.computeEc(w, 'C1')[1]; return !!g && iface(w, 'C1', 'Port-channel1').routed && iface(w, 'C1', 'Port-channel1').ip === '10.255.0.1' && Object.values(g.members).every((f) => f === 'P'); },
        },
        { text: 'PC-SALES can reach FILE-SRV at 10.99.0.50', check: (w) => can(w, 'P10', '10.99.0.50') },
      ],
      hints: [
        'show ip interface brief on HPL-CORE1: Vlan10 is down, Vlan20 does not exist, and there is no routing yet. show etherchannel summary shows the members suspended (s): one side is Layer 2, the other Layer 3.',
        'ip routing, then interface vlan 10 / no shutdown, then interface vlan 20 / ip address 10.20.0.1 255.255.255.0 / no shutdown.',
        'interface range g1/0/23 - 24 / no switchport, then interface port-channel 1 / no switchport / ip address 10.255.0.1 255.255.255.252. Finally ip route 10.99.0.0 255.255.255.0 10.255.0.2.',
      ],
      solution: {
        C1: ['en', 'conf t', 'ip routing', 'int vlan 10', 'no shutdown', 'int vlan 20', 'ip address 10.20.0.1 255.255.255.0', 'no shutdown', 'interface range g1/0/23 - 24', 'no switchport', 'int po1', 'no switchport', 'ip address 10.255.0.1 255.255.255.252', 'exit', 'ip route 10.99.0.0 255.255.255.0 10.255.0.2', 'end'],
      },
      debrief: {
        what: 'A Layer 3 switch routes between VLANs in hardware using SVIs (interface vlan N), one per VLAN, each acting as that VLAN\'s default gateway. It only routes after ip routing. An SVI comes up when its VLAN exists and at least one port in that VLAN (access or trunk) is up. Between core switches, a routed EtherChannel bundles links into one Layer 3 interface, and both ends must agree: Layer 2 on one side and Layer 3 on the other leaves the members suspended.',
        exam: 'no switchport turns a switch port into a routed port that takes an IP address. Compare the three inter-VLAN options: separate router interfaces, router-on-a-stick (subinterfaces with encapsulation dot1Q), and SVIs on a multilayer switch. show etherchannel summary flags: R = Layer 3, S = Layer 2, U = in use, P = bundled, s = suspended.',
      },
    },

    /* ------------------------------------------------------------ */
    {
      id: 't21',
      number: 'TT-1021',
      title: 'The tracking site is unreachable',
      topic: 'Static NAT and NAT pools',
      priority: 'P1',
      jitl: { label: 'Days 44 and 45: NAT', url: yt('Day 44 NAT Part 1') },
      ptLab: 'Day 44 lab: static NAT. Day 45 lab: dynamic NAT with pools and PAT.',
      story: [
        'Customers check shipments on the warehouse web server, WEB-TRACK, at the public address 203.0.113.5. Since this afternoon nobody outside can reach it. The ISP gave Harbor Point the block 203.0.113.0/29.',
        'Also, three warehouse PCs share a pool of two public addresses, and every day one of them "randomly" loses the internet. Fix both without changing the ISP side.',
      ],
      topology: {
        nodes: [
          { id: 'P1', x: 60, y: 30, type: 'pc' },
          { id: 'P2', x: 60, y: 100, type: 'pc' },
          { id: 'P3', x: 60, y: 170, type: 'pc' },
          { id: 'WEB', x: 190, y: 190, type: 'pc' },
          { id: 'SW', x: 200, y: 90, type: 'switch' },
          { id: 'R1', x: 350, y: 90, type: 'router' },
          { id: 'ISP', x: 500, y: 90, type: 'router' },
          { id: 'NET', x: 630, y: 90, type: 'pc' },
        ],
      },
      world: {
        devices: {
          R1: {
            kind: 'router', hostname: 'HPL-WH2',
            interfaces: {
              'GigabitEthernet0/0': { ip: '192.168.50.1', mask: '255.255.255.0', shutdown: false, nat: 'inside' },
              'GigabitEthernet0/1': { ip: '203.0.113.2', mask: '255.255.255.248', shutdown: false, nat: 'outside' },
            },
            routes: [{ net: '0.0.0.0', mask: '0.0.0.0', nh: '203.0.113.1' }],
            aclText: { 1: ['permit 192.168.50.0 0.0.0.255'] },
            natPools: { STAFF: { start: '203.0.113.3', end: '203.0.113.4', mask: '255.255.255.248' } },
            nat: { list: 1, pool: 'STAFF', overload: false },
            natStatic: [{ local: '203.0.113.5', global: '192.168.50.10' }],
          },
          ISP: {
            kind: 'router', hostname: 'ISP-EDGE', locked: true,
            interfaces: {
              'GigabitEthernet0/0': { ip: '203.0.113.1', mask: '255.255.255.248', shutdown: false },
              'GigabitEthernet0/1': { ip: '198.51.100.1', mask: '255.255.255.0', shutdown: false },
            },
          },
          SW: sw('HPL-WH2-SW', 8),
          P1: pc('WH-PC1', '192.168.50.21', '255.255.255.0', '192.168.50.1'),
          P2: pc('WH-PC2', '192.168.50.22', '255.255.255.0', '192.168.50.1'),
          P3: pc('WH-PC3', '192.168.50.23', '255.255.255.0', '192.168.50.1'),
          WEB: pc('WEB-TRACK', '192.168.50.10', '255.255.255.0', '192.168.50.1'),
          NET: pc('CUSTOMER', '198.51.100.10', '255.255.255.0', '198.51.100.1'),
        },
        links: [
          ['P1', 'NIC', 'SW', 'FastEthernet0/1'],
          ['P2', 'NIC', 'SW', 'FastEthernet0/2'],
          ['P3', 'NIC', 'SW', 'FastEthernet0/3'],
          ['WEB', 'NIC', 'SW', 'FastEthernet0/4'],
          ['R1', 'GigabitEthernet0/0', 'SW', 'GigabitEthernet0/1'],
          ['R1', 'GigabitEthernet0/1', 'ISP', 'GigabitEthernet0/0'],
          ['NET', 'NIC', 'ISP', 'GigabitEthernet0/1'],
        ],
      },
      start: 'R1',
      objectives: [
        { text: 'Static NAT maps WEB-TRACK (192.168.50.10) to 203.0.113.5', check: (w) => (w.devices.R1.natStatic || []).some((m) => m.local === '192.168.50.10' && m.global === '203.0.113.5') },
        { text: 'A customer can reach WEB-TRACK at 203.0.113.5', check: (w) => { const r = TT.net.ping(w, 'NET', '203.0.113.5'); return r.ok && r.there.dstDev === 'WEB'; } },
        { text: 'All three warehouse PCs reach the internet host 198.51.100.10 at the same time', check: (w) => ['P1', 'P2', 'P3'].every((p) => can(w, p, '198.51.100.10')) },
        { text: 'The STAFF pool is shared with PAT (overload)', check: (w) => !!(w.devices.R1.nat && w.devices.R1.nat.pool === 'STAFF' && w.devices.R1.nat.overload) },
      ],
      hints: [
        'show running-config | the NAT lines, and show ip nat translations. Read the static NAT line slowly: inside local first, inside global second.',
        'The static rule is backwards. no ip nat inside source static 203.0.113.5 192.168.50.10, then ip nat inside source static 192.168.50.10 203.0.113.5.',
        'Two pool addresses for three PCs: without overload, the third PC to talk gets nothing. ip nat inside source list 1 pool STAFF overload.',
      ],
      solution: {
        R1: ['en', 'conf t', 'no ip nat inside source static 203.0.113.5 192.168.50.10', 'ip nat inside source static 192.168.50.10 203.0.113.5', 'ip nat inside source list 1 pool STAFF overload', 'end'],
      },
      debrief: {
        what: 'Static NAT is a permanent one-to-one mapping, so outside hosts can start connections to an inside server. The syntax always reads inside local, then inside global. Dynamic NAT hands out pool addresses one-to-one until the pool runs dry; the next host waits until a translation times out. Adding overload turns the pool into PAT, so many hosts share addresses using different port numbers.',
        exam: 'Inside local = the private address on the inside. Inside global = how that host appears outside. Outside local/global = the remote host as seen from inside/outside (the same unless you also translate the destination). Commands: ip nat inside / ip nat outside on interfaces, ip nat pool NAME start end netmask M, ip nat inside source list ACL pool NAME [overload], ip nat inside source static LOCAL GLOBAL. Verify with show ip nat translations and show ip nat statistics; clear with clear ip nat translation *.',
      },
    },

    /* ------------------------------------------------------------ */
    {
      id: 't22',
      number: 'TT-1022',
      title: 'A desk switch took over the network',
      topic: 'STP protection',
      priority: 'P1',
      jitl: { label: 'Days 20 to 22: Spanning Tree', url: yt('Day 21 Spanning Tree Protocol Part 2') },
      ptLab: 'Day 21 and 22 labs: STP optional features (PortFast, BPDU guard, root guard, loop guard).',
      story: [
        'Someone in the conference room plugged a cheap managed switch into wall port Fa0/10 on HPL-ACC7 to get more ports. Its bridge priority is 0, so it is now the root bridge for the whole floor and traffic is taking a scenic route through a desk.',
        'While investigating you notice the uplink between the two access switches has BPDU filter turned on, so spanning tree cannot see that link at all. Fix the root, fix the loop risk, and harden the backup uplink.',
      ],
      topology: {
        nodes: [
          { id: 'DIST', x: 330, y: 35, type: 'switch' },
          { id: 'A1', x: 180, y: 150, type: 'switch' },
          { id: 'A2', x: 480, y: 150, type: 'switch' },
          { id: 'ROGUE', x: 60, y: 60, type: 'switch' },
          { id: 'PC', x: 600, y: 60, type: 'pc' },
        ],
      },
      world: {
        devices: {
          DIST: Object.assign(sw('HPL-DIST1', 2), { mac: '0011.1111.1111', stp: { prio: { 1: 4096 } } }),
          A1: Object.assign(sw('HPL-ACC7', 10), { mac: '0022.2222.2222' }),
          A2: Object.assign(sw('HPL-ACC8', 4, { 'GigabitEthernet0/2': { bpdufilter: true } }), { mac: '0033.3333.3333' }),
          ROGUE: Object.assign(sw('CONF-RM-SW', 2), { mac: '00aa.0000.0001', stp: { prio: { 1: 0 } }, locked: true }),
          PC: pc('PC-ACC8', '10.1.1.40', '255.255.255.0', '10.1.1.1'),
        },
        links: [
          ['DIST', 'GigabitEthernet0/1', 'A1', 'GigabitEthernet0/1'],
          ['DIST', 'GigabitEthernet0/2', 'A2', 'GigabitEthernet0/1'],
          ['A1', 'GigabitEthernet0/2', 'A2', 'GigabitEthernet0/2'],
          ['A1', 'FastEthernet0/10', 'ROGUE', 'GigabitEthernet0/1'],
          ['PC', 'NIC', 'A2', 'FastEthernet0/1'],
        ],
      },
      start: 'A1',
      objectives: [
        { text: 'HPL-DIST1 is the root bridge for VLAN 1 again', check: (w) => { const st = TT.net.computeStp(w, 1); return st.rootOf.DIST.dev === 'DIST' && st.rootOf.A1.dev === 'DIST' && st.rootOf.A2.dev === 'DIST'; } },
        { text: 'Root guard protects wall port Fa0/10 on HPL-ACC7', check: (w) => !!iface(w, 'A1', 'FastEthernet0/10').rootGuard },
        { text: 'No Layer 2 loop: BPDU filter is off the uplink and one port blocks', check: (w) => !iface(w, 'A2', 'GigabitEthernet0/2').bpdufilter && !iface(w, 'A1', 'GigabitEthernet0/2').bpdufilter && !TT.net.computeStp(w, 1).loop },
        {
          text: 'Loop guard runs on the blocking end of the ACC7 to ACC8 link',
          check: (w) => { const st = TT.net.computeStp(w, 1); const blk = [['A1', 'GigabitEthernet0/2'], ['A2', 'GigabitEthernet0/2']].find(([d, n]) => (st.ports[d][n] || {}).role === 'Altn'); return !!blk && !!iface(w, blk[0], blk[1]).loopGuard; },
        },
      ],
      hints: [
        'show spanning-tree on HPL-ACC7: the root ID is not HPL-DIST1, and the root port is Fa0/10. On HPL-ACC8, show spanning-tree flags Gi0/2 with BPDU filter.',
        'On HPL-ACC7: interface fa0/10, spanning-tree guard root. The port goes root-inconsistent (BKN*) and HPL-DIST1 wins again.',
        'On HPL-ACC8: interface g0/2, no spanning-tree bpdufilter. Now HPL-ACC8 Gi0/2 blocks (HPL-ACC7 has the lower MAC). Add spanning-tree guard loop there.',
      ],
      solution: {
        A1: ['en', 'conf t', 'int fa0/10', 'spanning-tree guard root', 'end'],
        A2: ['en', 'conf t', 'int g0/2', 'no spanning-tree bpdufilter', 'spanning-tree guard loop', 'end'],
      },
      debrief: {
        what: 'Root guard stops a port from ever becoming a root port: if it hears a superior BPDU it goes root-inconsistent and blocks until those BPDUs stop, so a rogue switch cannot steal the root role. BPDU filter on an interface stops sending and receiving BPDUs entirely, which is how you accidentally build a loop between switches. Loop guard protects blocking ports: if BPDUs stop arriving (say a one-way fiber fault), the port goes loop-inconsistent instead of moving to forwarding.',
        exam: 'Where each goes: PortFast and BPDU guard on access ports to end hosts; root guard on ports facing switches that must never be root (distribution downlinks); loop guard on root and alternate ports between switches. BPDU guard err-disables; root guard and loop guard block but recover automatically. spanning-tree vlan N root primary/secondary sets priority 24576/28672 (or lower if needed).',
      },
    },

    /* ------------------------------------------------------------ */
    {
      id: 't23',
      number: 'TT-1023',
      title: 'The new branch router ships tomorrow',
      topic: 'Device setup checklist',
      priority: 'P3',
      jitl: { label: 'Days 36, 37, 39 and 4: CDP/LLDP, NTP, DHCP, device security', url: yt('Day 37 NTP') },
      ptLab: 'Day 36 lab: CDP and LLDP. Day 37 lab: NTP. Day 39 lab: DHCP client.',
      story: [
        'HPL-BR2 is racked at the new Glen Burnie branch. Before the movers leave, finish the go-live checklist: the ISP hands out its WAN address by DHCP, the clock must sync to the public time server at 192.0.2.123, and the console must not be wide open.',
        'The branch LAN switch is a third-party model that does not speak CDP. Find out what it is and which of its ports the router plugs into, and label the router interface. And stop advertising CDP toward the ISP.',
      ],
      topology: {
        nodes: [
          { id: 'PC', x: 50, y: 95, type: 'pc' },
          { id: 'LAN', x: 170, y: 95, type: 'switch' },
          { id: 'BR', x: 310, y: 95, type: 'router' },
          { id: 'ISW', x: 440, y: 95, type: 'switch' },
          { id: 'DH', x: 440, y: 195, type: 'pc' },
          { id: 'ISP', x: 560, y: 95, type: 'router' },
          { id: 'NTP', x: 660, y: 95, type: 'pc' },
        ],
      },
      world: {
        devices: {
          BR: {
            kind: 'router', hostname: 'HPL-BR2',
            interfaces: {
              'GigabitEthernet0/0': { ip: '10.20.0.1', mask: '255.255.255.0', shutdown: false },
              'GigabitEthernet0/1': { shutdown: false },
            },
          },
          LAN: { kind: 'switch', hostname: 'BR2-EDGE-SW', vendor: 'other', locked: true, interfaces: { 'GigabitEthernet1/0/1': {}, 'GigabitEthernet1/0/48': {} }, vlans: { 1: 'default' } },
          ISW: Object.assign(sw('ISP-HANDOFF', 4), { locked: true, cdp: false }),
          ISP: {
            kind: 'router', hostname: 'ISP-EDGE', locked: true,
            interfaces: {
              'GigabitEthernet0/0': { ip: '100.64.20.1', mask: '255.255.255.0', shutdown: false },
              'GigabitEthernet0/1': { ip: '192.0.2.1', mask: '255.255.255.0', shutdown: false },
            },
          },
          DH: { kind: 'pc', hostname: 'ISP-DHCP', locked: true, pc: { ip: '100.64.20.2', mask: '255.255.255.0', gw: '100.64.20.1', server: true, pools: [{ name: 'CUST', network: '100.64.20.0', mask: '255.255.255.0', gw: '100.64.20.1', start: '100.64.20.100', end: '100.64.20.150' }] } },
          NTP: { kind: 'pc', hostname: 'NTP-1', locked: true, pc: { ip: '192.0.2.123', mask: '255.255.255.0', gw: '192.0.2.1', ntp: true, stratum: 1 } },
          PC: pc('PC-BR2', '10.20.0.10', '255.255.255.0', '10.20.0.1'),
        },
        links: [
          ['PC', 'NIC', 'LAN', 'GigabitEthernet1/0/1'],
          ['LAN', 'GigabitEthernet1/0/48', 'BR', 'GigabitEthernet0/0'],
          ['BR', 'GigabitEthernet0/1', 'ISW', 'FastEthernet0/1'],
          ['ISP', 'GigabitEthernet0/0', 'ISW', 'FastEthernet0/2'],
          ['DH', 'NIC', 'ISW', 'FastEthernet0/3'],
          ['NTP', 'NIC', 'ISP', 'GigabitEthernet0/1'],
        ],
      },
      start: 'BR',
      objectives: [
        {
          text: 'Gi0/1 gets its address from the ISP by DHCP, with a default route',
          check: (w) => { const i = iface(w, 'BR', 'GigabitEthernet0/1'); return !!i.dhcp && (i.ip || '').startsWith('100.64.20.') && TT.net.routingTable(w, 'BR').some((r) => r.net === 0 && r.p === 0); },
        },
        { text: 'The clock is synchronized to 192.0.2.123 by NTP', check: (w) => { const s = TT.net.ntpStatus(w, 'BR'); return s.synced && s.ref === '192.0.2.123'; } },
        {
          text: 'Console needs a password, logs out after at most 10 idle minutes, enable secret is set, passwords are encrypted',
          check: (w) => { const d = w.devices.BR; const c = d.con || {}; const t = c.timeout; return !!c.password && (c.login === 'password' || c.login === 'local') && !!t && (t[0] > 0 || t[1] > 0) && t[0] * 60 + t[1] <= 600 && !!d.enableSecret && !!d.pwEnc; },
        },
        { text: 'LLDP is on, and Gi0/0\'s description names the LAN switch found by LLDP', check: (w) => !!w.devices.BR.lldp && /br2-edge-sw/i.test(iface(w, 'BR', 'GigabitEthernet0/0').desc || '') },
        { text: 'CDP is not sent toward the ISP on Gi0/1', check: (w) => !!iface(w, 'BR', 'GigabitEthernet0/1').cdpOff },
      ],
      hints: [
        'show cdp neighbors shows nothing on Gi0/0: the switch is not Cisco. LLDP is off by default on Cisco IOS. show ip interface brief shows Gi0/1 with no address.',
        'interface g0/1, ip address dhcp, no cdp enable. Then ntp server 192.0.2.123 in global config, and check show ntp status. line console 0, password ..., login, exec-timeout 5 0. enable secret ... and service password-encryption.',
        'lldp run, wait for show lldp neighbors to list the switch, then interface g0/0, description To BR2-EDGE-SW port 1/0/48 (any wording that names the switch).',
      ],
      solution: {
        BR: ['en', 'conf t', 'int g0/1', 'ip address dhcp', 'no cdp enable', 'exit', 'ntp server 192.0.2.123', 'line console 0', 'password Harb0r!con', 'login', 'exec-timeout 5 0', 'exit', 'enable secret Harb0r!en', 'service password-encryption', 'lldp run', 'int g0/0', 'description To BR2-EDGE-SW port 1/0/48', 'end', 'show lldp neighbors'],
      },
      debrief: {
        what: 'A router can be a DHCP client on its WAN port (ip address dhcp) and installs the default route the server hands out, with administrative distance 254. NTP clients sync to a server with ntp server; a router with ntp master becomes a time source for others. CDP is Cisco-only and on by default; LLDP (802.1AB) is the open standard and off by default on IOS, so a third-party neighbor only shows up after lldp run. Turning CDP off toward untrusted networks stops leaking your model and IOS version.',
        exam: 'show ntp status / show ntp associations; an unsynchronized clock shows a * in show clock. CDP timers 60 s / holdtime 180 s; LLDP timers 30 s / holdtime 120 s. service password-encryption only applies weak type 7 to plain passwords; enable secret is hashed. exec-timeout 0 0 means never time out.',
      },
    },
  ];

  tickets.byId = Object.fromEntries(tickets.map((t) => [t.id, t]));
  TT.tickets = tickets;

  TT.roadmap = [
    { topic: 'OSPFv3 for IPv6', note: 'Dynamic routing for the IPv6 pilot' },
    { topic: 'VRRP, storm control and RA guard', note: 'New on the v2.0 exam from February 2027' },
  ];
})(typeof globalThis !== 'undefined' ? globalThis : window);
