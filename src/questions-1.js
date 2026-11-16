/* Harbor Point Night Shift — mock exam question bank, part 1: domains 1.0 Network Fundamentals and 2.0 Network Access.
 * All questions are original. Part 2 (domains 3.0-6.0) lives in questions-2.js and uses the same format.
 *
 * Question format:
 * ```js
 * {
 *   id: 'q1-0001',
 *   domain: '1.0',              // 1.0 .. 6.0
 *   obj: '1.6',                 // blueprint objective
 *   type: 'single' | 'multi' | 'order' | 'match' | 'sim',
 *   difficulty: 1 | 2 | 3,      // 3 = hard, scenario-based
 *   stem: 'Question text. For multi: say "(Choose two.)"',
 *   exhibit: { kind: 'cli', title: 'R1', lines: ['R1# show ip route', '...'] } | { kind: 'svg', svg: '<svg..>' } | { kind: 'table', rows: [[...]] },  // optional
 *   options: ['...', '...', '...', '...'],      // single/multi/order: items; match: left-hand items
 *   targets: ['...'],                            // match only: right-hand items
 *   answer: 2 | [0, 3] | [2, 0, 1, 3] | [[0, 1], [1, 0]],   // single: index; multi: indices; order: option indices in correct order; match: [leftIdx, targetIdx] pairs
 *   pick: 2,                    // multi only
 *   explanation: 'Teaching explanation: why the answer is right AND why each distractor is wrong. 60-200 words.',
 *   why: ['per-option note', ...],               // optional, one per option
 *   ref: 'Lesson l1-6',          // pointer: lesson id like 'l1-6' and/or card id like 'card:ipv4'
 *   sim: { world: { devices: {...}, links: [...] }, start: 'R1', tasks: ['Configure ...'], checks: ['js expression as string? NO'] }  // see below
 * }
 * ```
 * For type 'sim': sim: { world, start, tasks: [text], check: 'name-of-check' }. The named check lives in
 * TT.simChecks[name] = (w) => boolean and is run against the live world when the candidate moves on.
 * sim.solution (optional) maps device ids to command lists that solve the sim; the tests replay it.
 * Notes: table exhibits treat rows[0] as the header row. In match questions several left items may share one
 * target. Order questions list options in a scrambled order; answer gives the correct sequence.
 */
(function (G) {
  'use strict';
  const TT = (G.TT = G.TT || {});
  TT.questions = TT.questions || [];
  TT.simChecks = TT.simChecks || {};

  /* ---- world builders for the sims ---------------------------------- */
  function sw(hostname, n, overrides, vlans, extra) {
    const interfaces = {};
    for (let i = 1; i <= n; i++) interfaces['FastEthernet0/' + i] = {};
    interfaces['GigabitEthernet0/1'] = {};
    interfaces['GigabitEthernet0/2'] = {};
    for (const [k, v] of Object.entries(overrides || {})) interfaces[k] = Object.assign({}, interfaces[k], v);
    return Object.assign({ kind: 'switch', hostname, interfaces, vlans: vlans || { 1: 'default' } }, extra || {});
  }
  const pc = (hostname, ip, mask, gw) => ({ kind: 'pc', hostname, pc: { ip, mask, gw } });
  const ping = (w, from, ip) => TT.net.ping(w, from, ip).ok;
  const ifc = (w, dev, n) => (w.devices[dev] && w.devices[dev].interfaces[n]) || {};
  const sameList = (a, b) => Array.isArray(a) && a.length === b.length && b.every((x) => a.includes(x));

  const Q = [];
  const add = (q) => Q.push(q);

  /* ==================================================================== *
   * 1.0 NETWORK FUNDAMENTALS
   * ==================================================================== */

  /* ---- 1.1 network components ---------------------------------------- */
  add({
    id: 'q1-0001', domain: '1.0', obj: '1.1', type: 'single', difficulty: 1,
    stem: `A new hire at the Canton warehouse asks which device keeps a broadcast from the scanner VLAN from reaching the office LAN, while still letting the two subnets talk. Which device does both by default?`,
    options: ['A Layer 2 access switch', 'A router', 'A wireless access point', 'An Ethernet hub'],
    answer: 1,
    explanation: `A router forwards packets between subnets by looking at the destination IP address, and it does not forward Layer 2 broadcasts out of other interfaces, so each router interface is the edge of its own broadcast domain. A Layer 2 switch forwards broadcasts out every port in the same VLAN; it splits collision domains, not broadcast domains (VLANs on the switch create separate broadcast domains, but the switch alone cannot move traffic between them). An access point bridges wireless clients onto a wired VLAN and passes broadcasts along. A hub repeats every bit out every port, so it splits nothing at all.`,
    ref: 'l1-1 card:osi',
  });
  add({
    id: 'q1-0002', domain: '1.0', obj: '1.1', type: 'multi', difficulty: 2, pick: 2,
    stem: `Harbor Point is replacing an old stateful firewall with a next-generation firewall (NGFW). Which two capabilities does the NGFW add that a traditional stateful firewall does not provide? (Choose two.)`,
    options: ['Tracking TCP session state so that return traffic is allowed back in automatically', 'Application visibility and control that identifies apps regardless of port', 'Network address translation of inside hosts on the outside interface', 'An integrated intrusion prevention engine that inspects payloads for exploits', 'Static packet filtering based on source and destination IP and port'],
    answer: [1, 3],
    explanation: `An NGFW still does everything a stateful firewall does, then adds deeper inspection. Application visibility and control (AVC) identifies applications by behavior and signatures, so a peer-to-peer app hiding on TCP 443 can still be blocked. An integrated next-generation IPS inspects traffic for known exploits and drops it inline. NGFWs commonly add URL filtering and advanced malware protection as well. Session state tracking is the defining feature of any stateful firewall, so it is not new. NAT has been a firewall and router feature for decades. Static packet filtering on addresses is what an ACL or the oldest packet-filter firewalls do; it is a step backward, not forward.`,
    ref: 'l1-1 card:secfund',
  });
  add({
    id: 'q1-0003', domain: '1.0', obj: '1.1', type: 'single', difficulty: 3,
    stem: `Security wants a sensor in front of the customs-records servers. Requirements: it must examine every packet, compare it against attack signatures, and drop malicious traffic before it reaches the servers. A second team suggests feeding the sensor from a SPAN port instead. Which design meets the requirement?`,
    options: ['An IDS connected to a SPAN port, sending alerts to the SIEM and TCP resets to the attacker', 'An IPS placed inline between the core switch and the server segment', 'An IDS placed inline so it can reset any session that matches a signature', 'An IPS connected to a SPAN port so it can drop attacks without adding latency'],
    answer: 1,
    explanation: `Dropping traffic before it arrives requires the sensor to sit in the traffic path, which is what an intrusion prevention system (IPS) does: it is deployed inline, and every packet passes through it, so it can discard the bad ones. An IDS works on a copy of the traffic, usually from a SPAN port or tap; it can alert and sometimes send resets, but the original packet has already been delivered. An IPS on a SPAN port is effectively demoted to an IDS because it only sees copies. "Inline IDS" mixes the terms; the inline, blocking device is by definition an IPS. The trade-off of inline placement is that a failed or overloaded IPS can affect traffic, which is why many deployments add fail-open bypass.`,
    ref: 'l1-1 card:secfund',
  });
  add({
    id: 'q1-0004', domain: '1.0', obj: '1.1', type: 'single', difficulty: 2,
    stem: `The new warehouse APs draw up to 25.5 W each at the device. The access switch must power them over the same UTP cable that carries data. Which is the oldest PoE standard that can deliver enough power?`,
    options: ['IEEE 802.3af (PoE)', 'IEEE 802.3at (PoE+)', 'IEEE 802.3bt Type 4', 'Cisco inline power (pre-standard)'],
    answer: 1,
    explanation: `IEEE 802.3at, called PoE+, lets the switch (the power sourcing equipment, PSE) supply up to 30 W per port, which leaves about 25.5 W at the powered device after cable loss. That is exactly this AP's draw. The original 802.3af supplies 15.4 W at the PSE and about 12.95 W at the device, which is too little. 802.3bt Type 4 provides up to 90 W at the PSE and would work, but it is newer and more than needed, and the question asks for the oldest standard that is sufficient. Cisco's pre-standard inline power was a low-power proprietary scheme from the early IP phone days and cannot deliver 25.5 W.`,
    ref: 'l1-1 card:switchif',
  });
  add({
    id: 'q1-0005', domain: '1.0', obj: '1.1', type: 'multi', difficulty: 2, pick: 2,
    stem: `The distribution layer at Harbor Point uses Catalyst multilayer switches instead of routers to move traffic between the user VLANs. Which two statements describe what a Layer 3 switch does in this role? (Choose two.)`,
    options: ['Routes between VLANs using switched virtual interfaces (SVIs)', 'Forwards packets in hardware (ASICs) at or near line rate', 'Must hand inter-VLAN traffic to an external router over a trunk', 'Cannot run a routing protocol such as OSPF', 'Is the only device that can provide PoE to endpoints'],
    answer: [0, 1],
    explanation: `A multilayer (Layer 3) switch can act as the default gateway for many VLANs through SVIs (interface vlan 10, interface vlan 20, and so on) once ip routing is enabled, and it forwards those routed packets in specialized hardware, so inter-VLAN routing runs at very high speed. Handing traffic to an external router over a trunk describes router-on-a-stick, the design a Layer 3 switch replaces. Layer 3 switches routinely run OSPF, EIGRP and static routes. PoE is a feature of many access switches, Layer 2 or Layer 3, and has nothing to do with the routing role. Traditional routers still matter at the WAN edge for features such as NAT, rich WAN interface types and VPNs.`,
    ref: 'l1-1 l2-1 card:lanarch',
  });
  add({
    id: 'q1-0006', domain: '1.0', obj: '1.1', type: 'single', difficulty: 1,
    stem: `Harbor Point has 40 lightweight access points across three warehouses. Which device provides centralized configuration, RF management and client roaming coordination for them?`,
    options: ['A wireless LAN controller (WLC)', 'A next-generation firewall (NGFW) at the edge', 'A Layer 2 access switch with PoE+ ports', 'A DHCP server with option 43 configured'],
    answer: 0,
    explanation: `Lightweight APs build CAPWAP tunnels to a wireless LAN controller, which pushes their configuration, manages channel and power assignments (radio resource management), handles client authentication and coordinates roaming between APs. A firewall filters traffic, it does not manage APs. An access switch powers and connects the APs but has no role in their RF or WLAN settings. A DHCP server hands out IP addresses (and can help APs find a controller through option 43), but it does not manage the APs after that.`,
    ref: 'l1-1 l2-6 card:wifiarch',
  });
  add({
    id: 'q1-0007', domain: '1.0', obj: '1.1', type: 'match', difficulty: 2,
    stem: `Match each network component to the function that best describes it. Each function is used once.`,
    options: ['Router', 'Layer 2 switch', 'Access point', 'Firewall', 'Server'],
    targets: ['Forwards frames within a LAN based on MAC addresses', 'Forwards packets between networks based on IP addresses', 'Permits or denies traffic between security zones based on a policy', 'Bridges 802.11 clients onto the wired network', 'Provides a service such as DNS, file storage or an application to clients'],
    answer: [[0, 1], [1, 0], [2, 3], [3, 2], [4, 4]],
    explanation: `A router is the Layer 3 device: it reads the destination IP address and picks an exit interface from its routing table. A Layer 2 switch learns source MAC addresses and forwards frames within a VLAN using its MAC address table. An access point converts between 802.11 frames and 802.3 Ethernet, bridging wireless clients onto a wired VLAN. A firewall enforces a security policy between zones (inside, outside, DMZ) and, if stateful, allows return traffic for sessions it saw start. A server is an endpoint that offers a service to clients, such as DNS, DHCP, file shares or a web application. Endpoints such as PCs, phones and scanners are the clients that consume those services.`,
    ref: 'l1-1 card:osi',
  });

  /* ---- 1.2 topology architectures ------------------------------------ */
  add({
    id: 'q1-0008', domain: '1.0', obj: '1.2', type: 'single', difficulty: 2,
    stem: `Harbor Point is building a small data center using a spine-leaf design. Which cabling rule is part of that architecture?`,
    options: ['Every leaf switch connects to every spine switch, and spines do not connect to each other', 'Every spine connects to every other spine in a full mesh, and each leaf connects to one spine', 'Leaf switches connect to each other in a ring to provide redundancy', 'Servers connect directly to the spine switches for the lowest latency'],
    answer: 0,
    explanation: `In a spine-leaf fabric every leaf has an uplink to every spine, spines never connect to other spines, and leaves never connect to other leaves. Servers, storage, firewalls and other endpoints attach to the leaves only. The result is that any server is always the same number of hops from any other server (leaf, spine, leaf), which gives predictable latency for the heavy east-west traffic of modern data centers. To add capacity, you add a spine; to add ports, you add a leaf. A spine mesh with single-homed leaves would give each leaf one point of failure. Leaf rings and servers on spines both break the uniform hop count the design exists to provide.`,
    ref: 'l1-2 card:lanarch',
  });
  add({
    id: 'q1-0009', domain: '1.0', obj: '1.2', type: 'multi', difficulty: 2, pick: 2,
    stem: `The Baltimore headquarters campus has one building and about 300 users. The architect proposes a two-tier (collapsed core) design. Which two statements are true about this design? (Choose two.)`,
    options: ['The distribution and core layers are combined into one layer', 'It requires a dedicated core layer between the access and distribution layers', 'It suits smaller campuses where a separate core would add cost without benefit', 'Access switches connect directly to each other instead of to the distribution layer', 'It is the same as a spine-leaf design'],
    answer: [0, 2],
    explanation: `A two-tier, or collapsed core, design merges the core and distribution roles into one pair of switches, and access switches uplink to that pair. It fits a single building or small campus where a separate core layer would add cost and complexity without solving a real problem. A three-tier design adds a dedicated core when there are many distribution blocks (several buildings) that would otherwise need a full mesh of links between them. Access switches in either design uplink to the distribution layer, not to each other. Spine-leaf is a data center fabric with its own cabling rules, not a campus collapsed core.`,
    ref: 'l1-2 card:lanarch',
  });
  add({
    id: 'q1-0010', domain: '1.0', obj: '1.2', type: 'single', difficulty: 3,
    stem: `Review the cabling plan for the new Harbor Point data center. The design is meant to be a standard spine-leaf fabric. Which link violates the design?`,
    exhibit: { kind: 'table', rows: [['Link', 'Side A', 'Side B'], ['1', 'LEAF1 Eth1/49', 'SPINE1 Eth1/1'], ['2', 'LEAF1 Eth1/50', 'SPINE2 Eth1/1'], ['3', 'LEAF2 Eth1/49', 'SPINE1 Eth1/2'], ['4', 'LEAF2 Eth1/50', 'SPINE2 Eth1/2'], ['5', 'LEAF2 Eth1/51', 'LEAF3 Eth1/51'], ['6', 'LEAF3 Eth1/49', 'SPINE1 Eth1/3'], ['7', 'LEAF3 Eth1/50', 'SPINE2 Eth1/3'], ['8', 'ESX-HOST4 vmnic0', 'LEAF3 Eth1/10']] },
    options: ['Link 2, because each leaf should connect to only one spine switch', 'Link 5, because leaf switches must not connect to each other', 'Link 8, because servers and hosts must connect directly to a spine', 'Link 6, because LEAF3 should connect to SPINE2 first'],
    answer: 1,
    explanation: `Link 5 joins LEAF2 to LEAF3. In a spine-leaf fabric, leaves only uplink to spines; a leaf-to-leaf link creates a path that skips the spine layer and breaks the rule that every leaf-to-leaf path is exactly leaf, spine, leaf. Link 2 is correct: each leaf connects to every spine, so LEAF1 must reach both SPINE1 and SPINE2. Link 8 is correct: servers and hypervisor hosts attach to leaves, never to spines. Link 6 is fine; the order in which ports are cabled does not matter, only that every leaf reaches every spine. (Some vendors do use a dedicated pair of leaf-to-leaf links for multichassis link aggregation peering, but in the CCNA model of spine-leaf, leaves do not interconnect.)`,
    ref: 'l1-2 card:lanarch',
  });
  add({
    id: 'q1-0011', domain: '1.0', obj: '1.2', type: 'single', difficulty: 1,
    stem: `A Harbor Point sales rep works from a home office with a laptop, a printer and a phone. Which device typically provides routing, switching, wireless access and firewall functions in that small office/home office (SOHO)?`,
    options: ['A multilayer core switch', 'A single integrated wireless router', 'A wireless LAN controller', 'A dedicated next-generation firewall cluster'],
    answer: 1,
    explanation: `A SOHO network is small enough that one consumer or small-business "wireless router" combines everything: a router with NAT toward the ISP, a small built-in switch, an access point, a basic firewall and often a DHCP server (and sometimes the modem too). A multilayer core switch and a firewall cluster are enterprise campus and data center gear. A WLC manages many lightweight APs and has no reason to exist with a single wireless radio. Remember that the single box still performs separate logical functions, it just performs them all in one chassis.`,
    ref: 'l1-2 card:lanarch',
  });
  add({
    id: 'q1-0012', domain: '1.0', obj: '1.2', type: 'single', difficulty: 2,
    stem: `The Dundalk branch has two internet circuits, both from the same ISP, terminating on one branch router. Which WAN connection type describes this branch?`,
    options: ['Single-homed', 'Dual-homed', 'Multihomed', 'Dual multihomed'],
    answer: 1,
    explanation: `Dual-homed means two connections to the same service provider; it protects against a circuit failure but not against an ISP-wide outage. Single-homed is one connection to one provider. Multihomed means connections to two or more different providers, usually one link to each. Dual multihomed means multiple links to each of two or more providers, which is the most redundant and most expensive option. The terms describe how a site attaches to its WAN or internet providers and are a common exam vocabulary check.`,
    ref: 'l1-2 card:wanarch',
  });
  add({
    id: 'q1-0013', domain: '1.0', obj: '1.2', type: 'single', difficulty: 2,
    stem: `Harbor Point moves its email from an on-premises server to a provider-hosted service. The provider runs the servers, operating systems and the email application; Harbor Point only manages users and mailboxes through a web portal. Which cloud service model is this?`,
    options: ['Infrastructure as a Service (IaaS)', 'Platform as a Service (PaaS)', 'Software as a Service (SaaS)', 'Private cloud'],
    answer: 2,
    explanation: `With SaaS the provider delivers a finished application, and the customer only uses and administers it. Hosted email and office suites are the classic examples. With IaaS the provider gives you virtual machines, storage and networks, and you install and patch the operating system and applications yourself. With PaaS the provider runs the operating system and a development platform, and you deploy your own code onto it. "Private cloud" is a deployment model (cloud infrastructure for one organization), not a service model, and a provider-run multi-tenant email service is a public cloud offering.`,
    ref: 'l1-2 card:cloud',
  });
  add({
    id: 'q1-0014', domain: '1.0', obj: '1.2', type: 'multi', difficulty: 2, pick: 2,
    stem: `In a three-tier campus design, which two functions belong at the access layer? (Choose two.)`,
    options: ['Connecting end hosts such as PCs, phones and APs', 'Providing PoE and port security on edge ports', 'Fast transport between distribution blocks with minimal processing', 'Acting as the aggregation point for many access switches and summarizing routes', 'Connecting directly to the internet service provider'],
    answer: [0, 1],
    explanation: `The access layer is where users and devices plug in, so it handles edge services: PoE for phones and APs, port security, DHCP snooping and other Layer 2 security, and QoS marking at the trust boundary. Fast transport with as little processing as possible is the core layer's job; it ties the distribution blocks together. Aggregating many access switches, being the Layer 2/Layer 3 boundary and summarizing routes are distribution layer functions. Internet connectivity is handled by WAN edge or internet edge routers and firewalls, usually attached to the core.`,
    ref: 'l1-2 card:lanarch',
  });

  /* ---- 1.3 cabling ------------------------------------------------- */
  add({
    id: 'q1-0015', domain: '1.0', obj: '1.3', type: 'single', difficulty: 2,
    stem: `Harbor Point needs a 10 Gbps link between the main warehouse and the customs building, 8 km away across the port. Which media and standard fit best?`,
    options: ['Cat6a F/UTP copper using 10GBASE-T', 'Multimode OM4 fiber using 10GBASE-SR', 'Single-mode fiber using 10GBASE-LR', 'SFP+ direct-attach copper (twinax) cables'],
    answer: 2,
    explanation: `10GBASE-LR runs over single-mode fiber and reaches about 10 km, which covers the 8 km run. Single-mode fiber has a very narrow core (about 9 microns) and uses lasers, so light travels in a single path with very little modal dispersion, allowing long distances. 10GBASE-SR uses multimode fiber and reaches only a few hundred meters, depending on fiber grade (OM3, OM4). 10GBASE-T over Cat6a is limited to 100 meters, like other twisted-pair Ethernet. Direct-attach copper (twinax) cables are only a few meters long and are used inside a rack or between adjacent racks.`,
    ref: 'l1-3 card:cabling',
  });
  add({
    id: 'q1-0016', domain: '1.0', obj: '1.3', type: 'multi', difficulty: 2, pick: 2,
    stem: `Which two statements correctly compare single-mode and multimode fiber? (Choose two.)`,
    options: ['Single-mode fiber has a smaller core than multimode fiber', 'Multimode fiber supports longer distances because many light modes add up', 'Single-mode fiber typically uses laser light sources', 'Multimode fiber is immune to modal dispersion', 'Single-mode fiber is mainly used for patch cables inside a rack'],
    answer: [0, 2],
    explanation: `Single-mode fiber has a core of roughly 8 to 10 microns, small enough that light travels in essentially one path, and it is driven by lasers. That is why it reaches kilometers. Multimode fiber has a larger 50 or 62.5 micron core, so light takes many paths (modes) that arrive at slightly different times. That spreading is modal dispersion, and it is exactly what limits multimode to shorter runs, so both the "longer distance" and "immune to modal dispersion" options are backwards. Multimode is cheaper to light (LEDs or VCSELs) and is common inside buildings and data centers, while single-mode is the choice for long campus and metro links, not short rack patches.`,
    ref: 'l1-3 card:cabling',
  });
  add({
    id: 'q1-0017', domain: '1.0', obj: '1.3', type: 'multi', difficulty: 2, pick: 2,
    stem: `A technician is running new copper drops for 1000BASE-T. Which two statements about 1000BASE-T are true? (Choose two.)`,
    options: ['It transmits and receives on all four wire pairs at the same time', 'It uses only pins 1, 2, 3 and 6', 'The maximum segment length is 100 meters', 'It requires a crossover cable between two switches', 'It requires Cat6a cable at minimum'],
    answer: [0, 2],
    explanation: `Gigabit Ethernet over copper uses all four pairs and sends in both directions on every pair simultaneously, using echo cancellation to separate the signals. Like 10BASE-T and 100BASE-TX, the maximum length of the copper channel is 100 meters. Pins 1, 2, 3 and 6 are the two pairs used by 10BASE-T and 100BASE-TX, not Gigabit. Automatic MDI/MDI-X is an optional feature of the 1000BASE-T standard, but practically every gigabit port implements it, so a straight-through cable works between switches; nothing requires a crossover. Cat5e is enough for 1000BASE-T; Cat6a matters for 10GBASE-T at the full 100 meters.`,
    ref: 'l1-3 card:cabling',
  });
  add({
    id: 'q1-0018', domain: '1.0', obj: '1.3', type: 'match', difficulty: 2,
    stem: `Match each Ethernet connection type to the medium and typical reach it uses.`,
    options: ['1000BASE-T', '10GBASE-SR', '10GBASE-LR', 'SFP+ direct-attach copper (DAC)'],
    targets: ['Twisted-pair copper, up to 100 m', 'Multimode fiber, a few hundred meters', 'Single-mode fiber, about 10 km', 'Twinax copper, a few meters within or between racks'],
    answer: [[0, 0], [1, 1], [2, 2], [3, 3]],
    explanation: `The suffix letters help: T means twisted pair, so 1000BASE-T runs on UTP up to 100 m. S in SR stands for short reach on multimode fiber, roughly 300 m on OM3 and 400 m on OM4 at 10 Gbps. L in LR stands for long reach on single-mode fiber, about 10 km. Direct-attach copper cables are twinax cables with SFP+ modules permanently attached to each end, cheap and low-power but only a few meters long, so they are used for top-of-rack connections to servers or between neighboring switches.`,
    ref: 'l1-3 card:cabling',
  });
  add({
    id: 'q1-0019', domain: '1.0', obj: '1.3', type: 'single', difficulty: 2,
    stem: `An old shipping office still has six PCs connected to a hub. Which statement describes how Ethernet operates on that hub?`,
    options: ['Each PC has its own collision domain and runs full duplex', 'All PCs share one collision domain and must use half duplex with CSMA/CD', 'The hub learns MAC addresses and forwards frames only to the destination port', 'The hub separates the PCs into different broadcast domains'],
    answer: 1,
    explanation: `A hub is a multiport repeater, so the PCs share the medium. Only one device can transmit at a time, every port is in one collision domain, and the devices must run half duplex and use CSMA/CD to detect collisions and back off. That is "shared media" Ethernet. A switch is what gives each port its own collision domain and allows point-to-point full-duplex links, where CSMA/CD is not needed. Hubs do not learn MAC addresses; that is a switch function. Neither hubs nor switches separate broadcast domains without VLANs; routers do.`,
    ref: 'l1-3 card:ethernet',
  });
  add({
    id: 'q1-0020', domain: '1.0', obj: '1.3', type: 'single', difficulty: 3,
    stem: `Two older Catalyst switches with FastEthernet ports are joined with a standard straight-through patch cable. Auto-MDIX is disabled on both ports by a hardening template, and both ports are hard-coded to 100/full. The link stays down. What is the most likely fix?`,
    options: ['Use a crossover cable, or re-enable auto-MDIX with speed and duplex set to auto', 'Change both ports to half duplex so they can agree on the MDI/MDIX pinout', 'Replace the cable with a rollover cable, which reverses all eight pins end to end', 'Configure both ports as trunks, because switch-to-switch links stay down without 802.1Q'],
    answer: 0,
    explanation: `On 10/100 Ethernet, a switch port transmits on pins 3 and 6 and receives on 1 and 2 (MDI-X). Two like devices connected straight through end up transmitting into each other's transmit pins, so the link never comes up. Auto-MDIX detects this and swaps the pairs automatically, but it has been turned off, and on Catalyst switches auto-MDIX only works when speed and duplex are both set to auto. The fix is a crossover cable or re-enabling auto-MDIX (mdix auto with speed auto). Duplex settings do not affect which pins carry signal. A rollover cable is for console connections. Trunking is a Layer 2 setting and cannot bring up a link with no physical signal.`,
    ref: 'l1-3 card:cabling',
  });

  /* ---- 1.4 interface and cable issues ------------------------------- */
  add({
    id: 'q1-0021', domain: '1.0', obj: '1.4', type: 'single', difficulty: 3,
    stem: `Users on HPL-ACC2 report slow transfers to the file server. Review the output from the access switch port that connects to the uplink router. What is the most likely cause?`,
    exhibit: { kind: 'cli', title: 'HPL-ACC2', lines: [
      'HPL-ACC2# show interfaces FastEthernet0/24',
      'FastEthernet0/24 is up, line protocol is up (connected)',
      '  Hardware is Fast Ethernet, address is 0019.e8a2.4c18 (bia 0019.e8a2.4c18)',
      '  MTU 1500 bytes, BW 100000 Kbit/sec, DLY 100 usec,',
      '  Encapsulation ARPA, loopback not set',
      '  Half-duplex, 100Mb/s, media type is 10/100BaseTX',
      '  input flow-control is unsupported output flow-control is unsupported',
      '  5 minute input rate 812000 bits/sec, 141 packets/sec',
      '  5 minute output rate 1904000 bits/sec, 233 packets/sec',
      '     2219841 packets input, 1420331822 bytes, 0 no buffer',
      '     Received 4411 broadcasts (2210 multicasts)',
      '     0 runts, 0 giants, 0 throttles',
      '     0 input errors, 0 CRC, 0 frame, 0 overrun, 0 ignored',
      '     3802114 packets output, 2611093411 bytes, 0 underruns',
      '     0 output errors, 18744 collisions, 0 interface resets',
      '     0 babbles, 6120 late collision, 0 deferred',
    ] },
    options: ['A speed mismatch: the switch port runs at 100 Mbps while the router side runs at 1000 Mbps', 'A duplex mismatch: the switch port is half duplex and the router side is full duplex', 'A failing cable causing CRC errors and input errors on received frames', 'The interface MTU is too small for file transfers, so large frames are fragmented'],
    answer: 1,
    explanation: `The port is running half duplex at 100 Mbps, and it is counting collisions and especially late collisions. On a point-to-point link to a router, a correctly negotiated port would be full duplex with zero collisions. Late collisions (after the first 64 bytes) are the classic sign that the far end is transmitting whenever it likes because it believes it is full duplex, while this side still follows CSMA/CD. The far end typically shows CRC errors and runts instead. A speed mismatch would keep the link down entirely. The input errors and CRC counters here are zero, so a damaged cable is not indicated. The MTU is the standard 1500 bytes. Fix by setting both ends to auto, or both to the same speed and full duplex.`,
    ref: 'l1-4 card:switchif',
  });
  add({
    id: 'q1-0022', domain: '1.0', obj: '1.4', type: 'single', difficulty: 3,
    stem: `A cable run to the forklift charging bay was pulled alongside high-voltage power for the chargers. Both ends auto-negotiated 1000/full. The switch shows the output below, and the counters keep climbing. What is the best next step?`,
    exhibit: { kind: 'cli', title: 'HPL-ACC5', lines: [
      'HPL-ACC5# show interfaces GigabitEthernet1/0/17 | include duplex|errors|CRC|runts|collisions',
      '  Full-duplex, 1000Mb/s, media type is 10/100/1000BaseTX',
      '     1204 runts, 0 giants, 0 throttles',
      '     48116 input errors, 46912 CRC, 0 frame, 0 overrun, 0 ignored',
      '     0 output errors, 0 collisions, 1 interface resets',
    ] },
    options: ['Hard-code both ends to 100/half so the slower link suffers fewer errors from the noise', 'Replace or re-route the cable away from the power run, then clear counters and recheck', 'Increase the interface MTU so the runts are no longer counted as input errors', 'Enable PortFast so the port skips listening and learning and forwards immediately'],
    answer: 1,
    explanation: `Both sides negotiated full duplex, so there is no duplex mismatch, and a full-duplex link should never show collisions, which matches the zero here. The rising CRC and runt counts mean frames are arriving corrupted: the frame check sequence the receiver calculates does not match the one the sender appended. With a cable routed next to high-voltage power, electromagnetic interference is the obvious suspect, and the Layer 1 fix is to re-route or replace the cable (shielded cable or fiber are options near heavy electrical loads). Clear the counters afterward so you can tell whether new errors appear. Forcing half duplex creates a new problem. MTU affects giants, not corrupted frames. PortFast only changes STP behavior when the port comes up.`,
    ref: 'l1-4 card:switchif',
  });
  add({
    id: 'q1-0023', domain: '1.0', obj: '1.4', type: 'match', difficulty: 2,
    stem: `Match each interface counter from show interfaces to its meaning.`,
    options: ['runts', 'giants', 'CRC', 'late collision', 'output drops'],
    targets: ['Frames smaller than 64 bytes', 'Frames larger than the maximum allowed frame size', 'Frames whose frame check sequence did not match the calculated value', 'A collision detected after the first 64 bytes of the frame were sent', 'Packets discarded because the outbound queue was full'],
    answer: [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]],
    explanation: `Runts are undersized frames, below the 64-byte Ethernet minimum; they often come from collisions or a duplex mismatch. Giants exceed the maximum frame size (1518 bytes for standard Ethernet, or 1522 with an 802.1Q tag) and point to an MTU mismatch or a faulty NIC. CRC errors mean the receiver's checksum did not match the frame's FCS, usually from bad cabling, interference or a duplex mismatch. A late collision happens after the first 64 bytes, which should be impossible on a correctly built half-duplex segment and is a strong duplex mismatch indicator. Output drops mean the interface was congested and its queue overflowed, a capacity or QoS issue rather than a physical fault.`,
    ref: 'l1-4 card:switchif',
  });
  add({
    id: 'q1-0024', domain: '1.0', obj: '1.4', type: 'single', difficulty: 2,
    stem: `An engineer hard-codes a switch port to speed 100 and the attached server NIC is hard-coded to 1000 Mbps. What is the result?`,
    options: ['The link comes up at 100 Mbps with a duplex mismatch and late collisions', 'The link comes up at 1000 Mbps because the faster side always wins negotiation', 'The link does not come up; the switch port shows notconnect (down/down)', 'The link comes up but every frame is counted as a giant'],
    answer: 2,
    explanation: `Speed must match exactly, because each speed uses a different signaling scheme on the wire. When both sides are hard-coded to different speeds, neither can understand the other and the link stays down: show interfaces status shows notconnect and show interfaces shows down/down. A duplex mismatch, by contrast, still lets the link come up but performs badly, which is why duplex problems are sneakier. There is no "faster side wins" rule. Giants are oversized frames and have nothing to do with speed. The fix is to set both sides to auto, or both to the same speed and duplex.`,
    ref: 'l1-4 card:switchif',
  });
  add({
    id: 'q1-0025', domain: '1.0', obj: '1.4', type: 'single', difficulty: 3,
    stem: `A legacy label printer's NIC is hard-coded to 100 Mbps full duplex. The 10/100 switch port it connects to is left at speed auto and duplex auto. What will the switch port most likely operate at?`,
    options: ['100 Mbps, full duplex', '100 Mbps, half duplex', '10 Mbps, half duplex', 'The link will not come up'],
    answer: 1,
    explanation: `A hard-coded NIC usually stops sending autonegotiation information. The auto side can still sense the speed from the electrical signal (parallel detection), so it chooses 100 Mbps. But duplex cannot be sensed, so a 10/100 port falls back to the IEEE default of half duplex. (For 1000 Mbps, the default is full.) The result is 100 Mbps with the switch at half and the printer at full: a duplex mismatch that shows late collisions on the switch and CRC errors on the printer. The link does come up, and speed is not reduced to 10 Mbps because the speed was detected successfully. The lesson: set both sides to auto, or hard-code both sides identically.`,
    ref: 'l1-4 card:switchif',
  });
  add({
    id: 'q1-0026', domain: '1.0', obj: '1.4', type: 'single', difficulty: 2,
    stem: `Which command gives a one-line-per-port view of every switch port showing whether it is connected, its VLAN, and its negotiated duplex and speed (for example a-full and a-100)?`,
    options: ['show ip interface brief', 'show interfaces status', 'show vlan brief', 'show interfaces counters errors'],
    answer: 1,
    explanation: `show interfaces status lists each port with its description, status (connected, notconnect, err-disabled, disabled), VLAN (or trunk), duplex, speed and type. The a- prefix means the value was autonegotiated, so a-full and a-100 tell you autonegotiation worked; a value without the prefix was hard-coded. show ip interface brief shows IP addresses and up/down status, but not duplex or speed. show vlan brief shows VLANs and their access ports. show interfaces counters errors lists error counters per port, useful but without speed or duplex.`,
    ref: 'l1-4 card:switchif',
  });

  /* ---- 1.5 TCP and UDP --------------------------------------------- */
  add({
    id: 'q1-0027', domain: '1.0', obj: '1.5', type: 'multi', difficulty: 1, pick: 2,
    stem: `Which two features does TCP provide that UDP does not? (Choose two.)`,
    options: ['Sequencing and acknowledgment of segments', 'Port numbers to identify applications', 'A checksum on the header and data', 'Flow control using a sliding window', 'Delivery to a destination IP address'],
    answer: [0, 3],
    explanation: `TCP numbers every byte it sends, acknowledges what it receives, retransmits what is lost and reorders segments that arrive out of order. It also uses a window that the receiver advertises, so a slow receiver can tell the sender to slow down (flow control). UDP has none of that. Both protocols use source and destination port numbers to identify applications, and both carry a checksum (optional for UDP over IPv4, mandatory over IPv6). Delivery to an IP address is the job of IP at Layer 3, below both transport protocols.`,
    ref: 'l1-5 card:tcp card:udp',
  });
  add({
    id: 'q1-0028', domain: '1.0', obj: '1.5', type: 'multi', difficulty: 2, pick: 3,
    stem: `Which three protocols use UDP as their transport by default? (Choose three.)`,
    options: ['SSH', 'TFTP', 'FTP', 'SNMP', 'Telnet', 'Syslog'],
    answer: [1, 3, 5],
    explanation: `TFTP (port 69) is a deliberately simple file transfer protocol that runs over UDP and handles its own acknowledgments, one block at a time. SNMP uses UDP 161 for polling and UDP 162 for traps. Syslog traditionally uses UDP 514, which is why messages can be lost without anyone knowing. SSH (TCP 22) and Telnet (TCP 23) are interactive remote sessions that need reliable, ordered delivery. FTP uses TCP 21 for control and TCP 20 (active mode) or another negotiated TCP port for data.`,
    ref: 'l1-5 card:udp card:ftp',
  });
  add({
    id: 'q1-0029', domain: '1.0', obj: '1.5', type: 'order', difficulty: 2,
    stem: `A scanner opens a TCP session to the inventory server, sends one request, and then the scanner closes the session. Put the segments in the order they occur.`,
    options: ['Server sends ACK for the scanner\'s FIN', 'Scanner sends SYN', 'Scanner sends ACK, completing the handshake', 'Server sends SYN-ACK', 'Scanner sends FIN', 'Scanner sends the request data'],
    answer: [1, 3, 2, 5, 4, 0],
    explanation: `TCP opens with a three-way handshake: the client sends SYN with its initial sequence number, the server answers SYN-ACK with its own sequence number and an acknowledgment of the client's, and the client sends ACK. Only then does data flow. To close, the side that is finished sends FIN, and the other side acknowledges it. The server then sends its own FIN and receives a final ACK (not listed here), because each direction of a TCP connection is closed separately. That four-segment close is why teardown is sometimes described as a four-way handshake.`,
    ref: 'l1-5 card:tcp',
  });
  add({
    id: 'q1-0030', domain: '1.0', obj: '1.5', type: 'single', difficulty: 3,
    stem: `A packet capture during a slow backup shows the backup server advertising a TCP window of 0 to the sender several times. After each zero window the sender stops sending until the server advertises a non-zero window. Which TCP function is working here?`,
    options: ['Error recovery through retransmission', 'Flow control', 'Connection establishment', 'Multiplexing with port numbers'],
    answer: 1,
    explanation: `The window field tells the sender how many bytes the receiver is willing to accept before the next acknowledgment. A zero window means "my buffer is full, stop." That is TCP flow control: it protects a slow receiver from a fast sender. Here it points to the backup server being unable to write data to disk fast enough, not to a network fault. Retransmission (error recovery) would show duplicate segments after lost ones. Connection establishment is the SYN, SYN-ACK, ACK exchange. Multiplexing with port numbers is how one host runs many sessions at once and does not pause traffic. Flow control is different from congestion control, which reacts to loss in the network.`,
    ref: 'l1-5 card:tcp',
  });
  add({
    id: 'q1-0031', domain: '1.0', obj: '1.5', type: 'single', difficulty: 2,
    stem: `Harbor Point's new IP phones carry voice over RTP, which runs on UDP. Why is UDP the better transport for real-time voice?`,
    options: ['UDP guarantees delivery of every voice packet with a lighter acknowledgment scheme than TCP', 'A late voice packet is useless, so UDP avoids the delay and overhead of TCP retransmission', 'UDP encrypts voice traffic by default', 'UDP packets are automatically marked DSCP EF, so every router queues them ahead of TCP'],
    answer: 1,
    explanation: `In a phone call a packet that arrives 300 ms late is no better than a lost one, so TCP's acknowledgments and retransmissions would only add delay and jitter. UDP has an 8-byte header and no handshake, and the application (RTP) adds timestamps and sequence numbers so the receiver can play audio smoothly and conceal small gaps. UDP guarantees nothing about delivery. It does not encrypt (SRTP does that). Routers do not prioritize UDP automatically; voice gets priority only when QoS is configured to classify and queue it.`,
    ref: 'l1-5 card:udp card:qos',
  });
  add({
    id: 'q1-0032', domain: '1.0', obj: '1.5', type: 'match', difficulty: 2,
    stem: `Match each well-known port to its protocol.`,
    options: ['TCP 22', 'TCP 23', 'UDP 53', 'UDP 67', 'UDP 123', 'TCP 443'],
    targets: ['SSH', 'Telnet', 'DNS queries', 'DHCP server', 'NTP', 'HTTPS'],
    answer: [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5]],
    explanation: `SSH listens on TCP 22 and Telnet on TCP 23. DNS uses UDP 53 for ordinary queries and TCP 53 for zone transfers and large responses. DHCP servers listen on UDP 67 and clients on UDP 68. NTP uses UDP 123. HTTPS is HTTP over TLS on TCP 443 (and HTTP/3 runs over QUIC on UDP 443). Others worth knowing cold: FTP TCP 20/21, SMTP TCP 25, HTTP TCP 80, TFTP UDP 69, SNMP UDP 161/162, syslog UDP 514.`,
    ref: 'l1-5 card:tcp card:udp',
  });
  add({
    id: 'q1-0033', domain: '1.0', obj: '1.5', type: 'single', difficulty: 3,
    stem: `On a dispatcher's PC you run netstat and see the line below. Which statement is correct?`,
    exhibit: { kind: 'cli', title: 'DISPATCH-07', lines: [
      'C:\\> netstat -n',
      '',
      'Active Connections',
      '',
      '  Proto  Local Address          Foreign Address        State',
      '  TCP    10.1.20.57:51344       203.0.113.10:443       ESTABLISHED',
      '  TCP    10.1.20.57:51347       203.0.113.10:443       ESTABLISHED',
    ] },
    options: ['The PC is running a web server on local port 51344 that the remote host connected to', 'The PC opened two HTTPS sessions to one server, each from a different ephemeral source port', 'The two lines are duplicates, because TCP allows only one session between a client and a server', 'The server is using source port 51344 to reach the PC'],
    answer: 1,
    explanation: `A TCP session is identified by the combination of source IP, source port, destination IP and destination port. The PC (client) picked two ephemeral source ports, 51344 and 51347, from its dynamic range and connected to port 443 on the server, so there are two separate HTTPS sessions. Browsers do this all the time to fetch several objects in parallel. The PC is not a server: well-known listening ports are on the server side, and 51344 is the client's temporary port. Many sessions to the same server are normal because each one has a unique socket pair. The server replies from port 443 to the PC's port 51344, not the other way around.`,
    ref: 'l1-5 card:tcp',
  });

  /* ---- 1.6 IPv4 addressing and subnetting --------------------------- */
  add({
    id: 'q1-0034', domain: '1.0', obj: '1.6', type: 'single', difficulty: 2,
    stem: `A host at the Sparrows Point yard is 172.16.45.200/21. What is the broadcast address of its subnet?`,
    options: ['172.16.45.255', '172.16.47.255', '172.16.40.255', '172.16.63.255'],
    answer: 1,
    explanation: `A /21 mask is 255.255.248.0. The interesting octet is the third, and the block size is 256 - 248 = 8, so subnets start at 0, 8, 16, 24, 32, 40, 48 in the third octet. 45 falls in the block that starts at 40, so the subnet is 172.16.40.0/21 and the next subnet starts at 172.16.48.0. The broadcast is one less than the next subnet: 172.16.47.255. 172.16.45.255 would be the broadcast of a /24, a common mistake when people only look at the last octet. 172.16.40.255 is just a valid host in this subnet. 172.16.63.255 would be correct for a /19 (block size 32).`,
    ref: 'l1-6 card:ipv4 card:vlsm',
  });
  add({
    id: 'q1-0035', domain: '1.0', obj: '1.6', type: 'single', difficulty: 1,
    stem: `How many usable host addresses does a /27 subnet provide?`,
    options: ['14', '30', '32', '62'],
    answer: 1,
    explanation: `A /27 leaves 32 - 27 = 5 host bits. 2 to the power of 5 is 32 addresses, minus 2 for the network address (all host bits 0) and the broadcast address (all host bits 1), which leaves 30 usable host addresses. 14 is the answer for a /28 (4 host bits). 32 forgets to subtract the network and broadcast addresses. 62 is the answer for a /26. The formula 2^h - 2 applies to every prefix up to /30; /31 is the special point-to-point case and /32 is a single host route.`,
    ref: 'l1-6 card:ipv4',
  });
  add({
    id: 'q1-0036', domain: '1.0', obj: '1.6', type: 'single', difficulty: 3,
    stem: `Harbor Point is carving 10.20.0.0/16 into equal-size subnets for its warehouses. Each warehouse needs up to 480 host addresses, and the team wants as many subnets as possible. Which mask should they use?`,
    options: ['255.255.252.0', '255.255.254.0', '255.255.255.0', '255.255.255.128'],
    answer: 1,
    explanation: `Find the smallest number of host bits h where 2^h - 2 is at least 480. Eight host bits give 254, too few. Nine host bits give 512 - 2 = 510, enough. Nine host bits means a /23 mask, 255.255.254.0, which yields 2^(23-16) = 128 subnets from the /16. 255.255.252.0 (/22) also fits 480 hosts (1022 each) but yields only 64 subnets, so it wastes space and fails the "as many subnets as possible" requirement. 255.255.255.0 (/24, 254 hosts) and 255.255.255.128 (/25, 126 hosts) are too small.`,
    ref: 'l1-6 card:vlsm',
  });
  add({
    id: 'q1-0037', domain: '1.0', obj: '1.6', type: 'single', difficulty: 3,
    stem: `A new receiving-dock PC cannot ping its default gateway. Review the router and PC output. What is the cause?`,
    exhibit: { kind: 'cli', title: 'HPL-EDGE1 and DOCK-PC4', lines: [
      'HPL-EDGE1# show running-config interface GigabitEthernet0/1',
      'interface GigabitEthernet0/1',
      ' description DOCK LAN',
      ' ip address 192.168.10.65 255.255.255.224',
      'end',
      '',
      'C:\\> ipconfig',
      'Ethernet adapter Ethernet:',
      '   IPv4 Address. . . . . . . . . . . : 192.168.10.98',
      '   Subnet Mask . . . . . . . . . . . : 255.255.255.224',
      '   Default Gateway . . . . . . . . . : 192.168.10.65',
    ] },
    options: ['The PC is in subnet 192.168.10.96/27, a different subnet from its gateway', 'The router interface address 192.168.10.65 is the broadcast address of its subnet', 'The PC address 192.168.10.98 is the network address of its /27 subnet', 'The subnet mask on the PC must be 255.255.255.0 to reach the router'],
    answer: 0,
    explanation: `With a /27 mask, the block size in the last octet is 32, so the subnets are .0, .32, .64, .96 and so on. The router's 192.168.10.65 is in 192.168.10.64/27 (hosts .65 to .94). The PC's 192.168.10.98 is in 192.168.10.96/27 (hosts .97 to .126). The PC sees its gateway as off-subnet and cannot ARP for it, so nothing works. Give the PC an address from .66 to .94. The router address .65 is the first usable host, not a broadcast (that would be .95). .98 is a valid host, not a network address (.96 is). Changing only the PC mask to /24 would make the two disagree about the subnet; both ends must use the same prefix.`,
    ref: 'l1-6 card:ipv4',
  });
  add({
    id: 'q1-0038', domain: '1.0', obj: '1.6', type: 'multi', difficulty: 3, pick: 2,
    stem: `Which two addresses can be assigned to hosts in the subnet 10.4.32.0/19? (Choose two.)`,
    options: ['10.4.31.255', '10.4.47.255', '10.4.63.255', '10.4.64.1', '10.4.32.0', '10.4.60.0'],
    answer: [1, 5],
    explanation: `A /19 mask is 255.255.224.0, block size 32 in the third octet, so 10.4.32.0/19 covers 10.4.32.0 through 10.4.63.255. The network address is 10.4.32.0 and the broadcast is 10.4.63.255; neither can be a host. Everything between them is usable, including addresses that look strange: 10.4.47.255 and 10.4.60.0 are ordinary hosts because the host portion spans more than the last octet. 10.4.31.255 belongs to the previous subnet (10.4.0.0/19), and 10.4.64.1 belongs to the next one (10.4.64.0/19). Exam trap: addresses ending in .0 or .255 are only special when they are the network or broadcast of the actual subnet.`,
    ref: 'l1-6 card:ipv4',
  });
  add({
    id: 'q1-0039', domain: '1.0', obj: '1.6', type: 'single', difficulty: 3,
    stem: `You must subnet 192.168.50.0/24 with VLSM for the Curtis Bay office, assigning the largest requirement first and always using the lowest available address block. Requirements: LAN A 100 hosts, LAN B 50 hosts, LAN C 20 hosts, and one point-to-point WAN link. Which subnet does LAN C receive?`,
    options: ['192.168.50.160/27', '192.168.50.192/27', '192.168.50.192/28', '192.168.50.224/27'],
    answer: 1,
    explanation: `Allocate largest first. LAN A needs 100 hosts, so it needs 7 host bits (126 hosts): 192.168.50.0/25, using .0 to .127. LAN B needs 50 hosts, so 6 host bits (62 hosts): the next block is 192.168.50.128/26, using .128 to .191. LAN C needs 20 hosts, so 5 host bits (30 hosts): the next block is 192.168.50.192/27, using .192 to .223. The WAN link then gets 192.168.50.224/30. 192.168.50.160/27 overlaps LAN B. A /28 provides only 14 hosts, too few for 20. 192.168.50.224/27 skips the lowest available block.`,
    ref: 'l1-6 card:vlsm',
  });
  add({
    id: 'q1-0040', domain: '1.0', obj: '1.6', type: 'single', difficulty: 2,
    stem: `Which command assigns the first usable address of 10.10.8.0/22 to a router interface?`,
    options: ['ip address 10.10.8.1/22', 'ip address 10.10.8.1 255.255.252.0', 'ip address 10.10.8.0 255.255.252.0', 'ip address 10.10.8.1 255.255.254.0'],
    answer: 1,
    explanation: `IOS takes an IPv4 interface address as an address followed by a dotted-decimal mask. /22 is 255.255.252.0, and the first usable host in 10.10.8.0/22 is 10.10.8.1 (the subnet spans 10.10.8.0 to 10.10.11.255). Prefix-length notation (/22) is not accepted for IPv4 interface addresses on classic IOS, though it is used for IPv6. 10.10.8.0 is the network address and IOS rejects it as a host address ("Bad mask" or "is a network address" style errors). 255.255.254.0 is a /23 mask, which describes a different, smaller subnet.`,
    ref: 'l1-6 card:ipv4',
  });
  add({
    id: 'q1-0041', domain: '1.0', obj: '1.6', type: 'single', difficulty: 3,
    stem: `An engineer is adding a second LAN to HPL-EDGE2 and gets the message shown. What is the problem?`,
    exhibit: { kind: 'cli', title: 'HPL-EDGE2', lines: [
      'HPL-EDGE2# show ip interface brief | exclude unassigned',
      'Interface              IP-Address      OK? Method Status                Protocol',
      'GigabitEthernet0/0     192.168.1.10    YES NVRAM  up                    up',
      '',
      'HPL-EDGE2# show running-config interface GigabitEthernet0/0 | include address',
      ' ip address 192.168.1.10 255.255.255.0',
      '',
      'HPL-EDGE2(config)# interface GigabitEthernet0/1',
      'HPL-EDGE2(config-if)# ip address 192.168.1.130 255.255.255.128',
      '% 192.168.1.128 overlaps with GigabitEthernet0/0',
    ] },
    options: ['192.168.1.130 is not a valid host address in a /25, because it is the subnet broadcast', 'The new subnet 192.168.1.128/25 falls inside 192.168.1.0/24, which is already on Gi0/0', 'The interface must be enabled with no shutdown before it accepts an address', 'A router cannot use two addresses from the 192.168.1.0 network, even with different masks'],
    answer: 1,
    explanation: `Gi0/0 is in 192.168.1.0/24, which covers 192.168.1.0 to 192.168.1.255. The new address puts Gi0/1 in 192.168.1.128/25, which covers .128 to .255, entirely inside the existing /24. A router cannot have two interfaces in overlapping subnets because it would not know which interface to use for addresses in the overlap, so IOS refuses. To fix it, either re-mask Gi0/0 to 192.168.1.0/25 (if its hosts all fit in .1 to .127) or use a different subnet for the new LAN. 192.168.1.130 is a valid /25 host. IOS accepts addresses on shut interfaces. A router can have many addresses from one major network as long as the subnets do not overlap.`,
    ref: 'l1-6 card:ipv4',
  });
  add({
    id: 'q1-0042', domain: '1.0', obj: '1.6', type: 'single', difficulty: 2,
    stem: `Harbor Point wants to stop wasting addresses on its router-to-router links. Which prefix length gives exactly two usable addresses on a point-to-point link, with no network or broadcast address reserved?`,
    options: ['/29', '/30', '/31', '/32'],
    answer: 2,
    explanation: `RFC 3021 allows /31 subnets on point-to-point links: there are only two addresses and both are usable, because a link with exactly two ends has no need for a network or broadcast address. Cisco IOS supports this (it warns that /31 is only for point-to-point links). A /30 also gives two usable hosts but burns four addresses, two of them as network and broadcast. A /29 gives six usable addresses. A /32 is a single address, used for loopbacks and host routes, not for a link between two routers.`,
    ref: 'l1-6 card:ipv4 card:vlsm',
  });
  add({
    id: 'q1-0043', domain: '1.0', obj: '1.6', type: 'single', difficulty: 3,
    stem: `A server is configured as 172.20.99.14 with mask 255.255.240.0. What is the last usable host address in its subnet?`,
    options: ['172.20.99.254', '172.20.103.254', '172.20.111.254', '172.20.127.254'],
    answer: 2,
    explanation: `255.255.240.0 is a /20. The block size in the third octet is 256 - 240 = 16, so subnets start at 0, 16, 32, 48, 64, 80, 96, 112. 99 falls in the block starting at 96, so the subnet is 172.20.96.0/20 and the next one starts at 172.20.112.0. The broadcast is 172.20.111.255, and the last usable host is one below it: 172.20.111.254. 172.20.99.254 assumes a /24. 172.20.103.254 would be the last host of a /21 starting at .96 (block size 8 gives 96 to 103). 172.20.127.254 would be a /19 (block size 32, 96 to 127).`,
    ref: 'l1-6 card:ipv4',
  });
  add({
    id: 'q1-0044', domain: '1.0', obj: '1.6', type: 'multi', difficulty: 2, pick: 2,
    stem: `You need to confirm both the IPv4 address and the subnet mask configured on router interface Gi0/1. Which two commands show both? (Choose two.)`,
    options: ['show ip interface brief | include GigabitEthernet0/1', 'show ip interface GigabitEthernet0/1', 'show running-config interface GigabitEthernet0/1', 'show interfaces status', 'show arp'],
    answer: [1, 2],
    explanation: `show ip interface Gi0/1 prints a line such as "Internet address is 10.1.20.1/24", giving address and prefix length, plus details like ACLs and helper addresses. show running-config interface Gi0/1 shows the configured ip address command with the dotted-decimal mask. (show interfaces Gi0/1 would also show the address and prefix.) show ip interface brief is the quickest status check but lists only the address, never the mask, which makes it a popular exam distractor. show interfaces status is a switch port summary without IP information. show arp lists IP-to-MAC mappings learned from neighbors, not your interface's mask.`,
    ref: 'l1-6 card:ipv4',
  });
  add({
    id: 'q1-0045', domain: '1.0', obj: '1.6', type: 'single', difficulty: 2,
    stem: `How many /26 subnets fit inside 172.18.4.0/22?`,
    options: ['4', '8', '16', '32'],
    answer: 2,
    explanation: `Going from /22 to /26 borrows 26 - 22 = 4 bits, and 2^4 = 16 subnets. You can check it with addresses: a /22 holds 1024 addresses, a /26 holds 64, and 1024 / 64 = 16. The subnets run 172.18.4.0, 172.18.4.64, 172.18.4.128, 172.18.4.192, 172.18.5.0 and so on up to 172.18.7.192. 4 would be /24 subnets, 8 would be /25 subnets, and 32 would be /27 subnets.`,
    ref: 'l1-6 card:vlsm',
  });
  add({
    id: 'q1-0046', domain: '1.0', obj: '1.6', type: 'single', difficulty: 3,
    stem: `Based on the routing table excerpt from HPL-CORE1, which address could be assigned to a new PC attached to the Gi0/1 LAN?`,
    exhibit: { kind: 'cli', title: 'HPL-CORE1', lines: [
      'HPL-CORE1# show ip route connected',
      '      10.0.0.0/8 is variably subnetted, 4 subnets, 3 masks',
      'C        10.30.4.0/23 is directly connected, GigabitEthernet0/1',
      'L        10.30.5.1/32 is directly connected, GigabitEthernet0/1',
      'C        10.30.8.0/30 is directly connected, GigabitEthernet0/2',
      'L        10.30.8.1/32 is directly connected, GigabitEthernet0/2',
    ] },
    options: ['10.30.4.0', '10.30.5.200', '10.30.5.255', '10.30.6.1'],
    answer: 1,
    explanation: `The C route says Gi0/1 is in 10.30.4.0/23, which spans 10.30.4.0 to 10.30.5.255 (block size 2 in the third octet). The L route shows the router's own address on that interface is 10.30.5.1. A PC can use any other host address in the range, so 10.30.5.200 works. 10.30.4.0 is the network address. 10.30.5.255 is the broadcast address of the /23, even though 10.30.4.255 in the middle is a valid host. 10.30.6.1 is in the next /23 and is not connected to this router at all. Local (L) routes are /32 host routes for the router's own addresses and appear alongside every connected (C) route.`,
    ref: 'l1-6 l3-1 card:ipv4 card:rtable',
  });
  add({
    id: 'q1-0047', domain: '1.0', obj: '1.6', type: 'sim', difficulty: 2,
    stem: `The yard office LAN was renumbered to 172.16.40.64/27. The PC already has its new address and points to the last usable address of that subnet as its gateway. Configure the router's LAN interface to match, then bring it up.`,
    sim: {
      world: {
        devices: {
          R1: { kind: 'router', hostname: 'HPL-YARD1', interfaces: { 'GigabitEthernet0/0': { shutdown: true }, 'GigabitEthernet0/1': { ip: '203.0.113.2', mask: '255.255.255.252', shutdown: false } } },
          SW1: sw('HPL-YARD-SW', 4),
          PC1: pc('YARD-PC1', '172.16.40.70', '255.255.255.224', '172.16.40.94'),
        },
        links: [['R1', 'GigabitEthernet0/0', 'SW1', 'GigabitEthernet0/1'], ['PC1', 'NIC', 'SW1', 'FastEthernet0/2']],
      },
      start: 'R1',
      tasks: ['On HPL-YARD1, give GigabitEthernet0/0 the last usable address of 172.16.40.64/27 with the correct mask.', 'Bring the interface up so YARD-PC1 can ping its gateway.'],
      check: 'q1-ipv4-gw',
      solution: { R1: ['enable', 'configure terminal', 'interface g0/0', 'ip address 172.16.40.94 255.255.255.224', 'no shutdown', 'end'] },
    },
    explanation: `172.16.40.64/27 has a block size of 32, so it runs from .64 (network) to .95 (broadcast), and the usable hosts are .65 to .94. The last usable address is 172.16.40.94, which is the gateway the PC expects. The configuration is: interface g0/0, ip address 172.16.40.94 255.255.255.224, no shutdown. Router interfaces are administratively down by default, so forgetting no shutdown is the most common reason a correct address still does not answer pings. Verify with show ip interface brief (up/up) and a ping from the PC.`,
    ref: 'l1-6 card:ipv4',
  });
  TT.simChecks['q1-ipv4-gw'] = (w) => {
    const i = ifc(w, 'R1', 'GigabitEthernet0/0');
    return i.ip === '172.16.40.94' && i.mask === '255.255.255.224' && ping(w, 'PC1', '172.16.40.94');
  };

  /* ---- 1.7 private IPv4 --------------------------------------------- */
  add({
    id: 'q1-0048', domain: '1.0', obj: '1.7', type: 'multi', difficulty: 1, pick: 3,
    stem: `Which three address blocks are reserved for private use by RFC 1918? (Choose three.)`,
    options: ['10.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '100.64.0.0/10', '192.168.0.0/16', '172.32.0.0/16'],
    answer: [0, 2, 4],
    explanation: `RFC 1918 defines three private ranges: 10.0.0.0/8, 172.16.0.0/12 (172.16.0.0 through 172.31.255.255) and 192.168.0.0/16. They can be reused inside any organization and are not routed on the public internet, so traffic using them needs NAT to reach the internet. 169.254.0.0/16 is the link-local (APIPA) range a host gives itself when DHCP fails. 100.64.0.0/10 is the shared address space from RFC 6598 for carrier-grade NAT between an ISP and its customers; it is not RFC 1918 space. 172.32.0.0/16 sits just outside the 172.16.0.0/12 block and is public.`,
    ref: 'l1-7 card:ipv4 card:nat',
  });
  add({
    id: 'q1-0049', domain: '1.0', obj: '1.7', type: 'single', difficulty: 2,
    stem: `A vendor's quote lists four addresses for a new appliance. Which one is a private RFC 1918 address?`,
    options: ['172.33.10.5', '192.169.1.20', '172.31.200.5', '11.0.0.1'],
    answer: 2,
    explanation: `172.16.0.0/12 covers the second octet values 16 through 31, so 172.31.200.5 is private. 172.33.10.5 is just past the end of that range and is public. 192.169.1.20 is public; the private block is 192.168.0.0/16 only. 11.0.0.1 is public; only 10.0.0.0/8 is private in that part of the address space. The 172.16.0.0/12 boundary is the one most people get wrong, so memorize "172.16 to 172.31."`,
    ref: 'l1-7 card:ipv4',
  });
  add({
    id: 'q1-0050', domain: '1.0', obj: '1.7', type: 'single', difficulty: 2,
    stem: `Why do almost all enterprise LANs, including Harbor Point's, use private IPv4 addresses internally?`,
    options: ['Private addresses are faster to route because routers keep them in a separate, smaller table', 'Public IPv4 space is too scarce for every device, so private space is reused behind NAT', 'Private addresses keep traffic encrypted between internal hosts without needing IPsec', 'Public addresses cannot be used on Ethernet'],
    answer: 1,
    explanation: `The IPv4 space has about 4.3 billion addresses, far fewer than the devices in use, and the free pool has been exhausted. Private ranges can be reused by every organization, and NAT (usually PAT) on the internet edge lets thousands of private hosts share a handful of public addresses. That conservation is the main reason private addressing exists, and it also gives flexibility: Harbor Point can design its internal plan without asking a registry. Routing speed is the same for any address. Private addresses do not encrypt anything; hiding behind NAT is not a security control by itself. Public addresses work fine on Ethernet.`,
    ref: 'l1-7 card:nat',
  });
  add({
    id: 'q1-0051', domain: '1.0', obj: '1.7', type: 'single', difficulty: 3,
    stem: `The Dundalk branch router receives 100.64.12.8/30 on its internet interface from a new low-cost ISP. A vendor reports they cannot reach a camera system that Harbor Point exposes with static NAT on that address. What is the most likely explanation?`,
    options: ['100.64.12.8 is an RFC 1918 private address, so the vendor\'s edge firewall filters it as a bogon', '100.64.0.0/10 is carrier-grade NAT shared space, so the ISP translates it again and it is not reachable from the internet', '100.64.12.8 falls in the IPv4 multicast range, so it cannot be used as the inside global address in a static NAT entry', 'A /30 cannot be used on an internet link because it leaves no address for the ISP to route through'],
    answer: 1,
    explanation: `100.64.0.0/10 is the shared address space set aside by RFC 6598 for carrier-grade NAT (CGN). The ISP gives customers addresses from it and then translates them to public addresses at its own edge. The branch's address is not reachable from the internet, so an inbound static NAT on it is useless unless the ISP provides a public address or port forwarding. It is not RFC 1918 space, although it behaves similarly. Multicast is 224.0.0.0/4. A /30 is a normal choice for a point-to-point internet handoff.`,
    ref: 'l1-7 card:nat',
  });

  /* ---- 1.8 IPv6 addressing ----------------------------------------- */
  add({
    id: 'q1-0052', domain: '1.0', obj: '1.8', type: 'single', difficulty: 2,
    stem: `The full IPv6 address of a server is 2001:0db8:0000:0000:0a00:0000:0000:0001. Which representation of it is NOT valid?`,
    options: ['2001:db8::a00:0:0:1', '2001:db8:0:0:a00::1', '2001:db8::a00::1', '2001:0db8:0:0:0a00:0:0:1'],
    answer: 2,
    explanation: `Two rules: leading zeros in any hextet may be dropped, and one run of consecutive all-zero hextets may be replaced by a double colon, but only once per address. 2001:db8::a00::1 uses :: twice, so a reader could not tell how many zero hextets each one hides. That makes it invalid. The other three are valid. 2001:db8::a00:0:0:1 compresses the first run of two zero hextets and is the form RFC 5952 recommends (when two runs are the same length, compress the first). 2001:db8:0:0:a00::1 compresses the second run instead, which is legal but not the preferred form. Keeping some leading zeros, as in the last option, is also legal.`,
    ref: 'l1-8 card:ipv6',
  });
  add({
    id: 'q1-0053', domain: '1.0', obj: '1.8', type: 'single', difficulty: 3,
    stem: `An engineer configured global IPv6 addresses on HPL-EDGE1 G0/0 and G0/1. Hosts on both LANs can ping their own router interface by IPv6, but hosts on G0/0 cannot reach hosts on G0/1, and hosts do not receive router advertisements. What is missing?`,
    exhibit: { kind: 'cli', title: 'HPL-EDGE1', lines: [
      'HPL-EDGE1# show running-config | section ipv6|interface',
      'interface GigabitEthernet0/0',
      ' ip address 10.1.10.1 255.255.255.0',
      ' ipv6 address 2001:DB8:ACAD:10::1/64',
      'interface GigabitEthernet0/1',
      ' ip address 10.1.20.1 255.255.255.0',
      ' ipv6 address 2001:DB8:ACAD:20::1/64',
    ] },
    options: ['The ipv6 enable command on each interface', 'The global command ipv6 unicast-routing', 'A link-local address on each interface', 'An IPv6 default route on the router'],
    answer: 1,
    explanation: `IPv4 routing is on by default in IOS, but IPv6 routing is not. Without the global command ipv6 unicast-routing, the router acts as an IPv6 host: its interfaces have addresses and answer pings, but it will not forward IPv6 packets between interfaces and it does not send router advertisements, so SLAAC hosts never learn a prefix or default gateway. ipv6 enable is not needed when a global address is configured, because configuring any IPv6 address enables IPv6 on the interface and generates a link-local address automatically. A default route is for reaching remote networks, and both LANs here are directly connected.`,
    ref: 'l1-8 l3-3 card:ipv6 card:ipv6route',
  });
  add({
    id: 'q1-0054', domain: '1.0', obj: '1.8', type: 'multi', difficulty: 2, pick: 2,
    stem: `Which two commands display the IPv6 addresses configured on a router's interfaces? (Choose two.)`,
    options: ['show ipv6 interface brief', 'show ip interface brief', 'show ipv6 interface GigabitEthernet0/0', 'show ipv6 neighbors GigabitEthernet0/0', 'show interfaces status'],
    answer: [0, 2],
    explanation: `show ipv6 interface brief lists each interface with its status and every IPv6 address on it, link-local and global. show ipv6 interface Gi0/0 gives the full detail for one interface: link-local address, global addresses with prefixes, joined multicast groups and ND settings. show ip interface brief is the IPv4 version and shows no IPv6 addresses. show ipv6 neighbors shows the neighbor cache (IPv6's replacement for ARP), which lists other devices' addresses, not your own. show interfaces status is a switch port summary.`,
    ref: 'l1-8 card:ipv6',
  });
  add({
    id: 'q1-0055', domain: '1.0', obj: '1.8', type: 'single', difficulty: 3,
    stem: `Review the output. Why does G0/1 have no global unicast address?`,
    exhibit: { kind: 'cli', title: 'HPL-EDGE3', lines: [
      'HPL-EDGE3# show ipv6 interface brief',
      'GigabitEthernet0/0     [up/up]',
      '    FE80::1',
      '    2001:DB8:A:1::1',
      'GigabitEthernet0/1     [up/up]',
      '    FE80::2A3:D1FF:FE44:9B02',
      'GigabitEthernet0/2     [administratively down/down]',
      '    unassigned',
      '',
      'HPL-EDGE3# show running-config interface GigabitEthernet0/1',
      'interface GigabitEthernet0/1',
      ' no ip address',
      ' ipv6 enable',
    ] },
    options: ['G0/1 is still waiting for DAD to finish on its global address before it shows in the output', 'ipv6 enable creates only a link-local address; a global address needs the ipv6 address command', 'ipv6 unicast-routing is disabled, which removes global addresses', 'The link-local address on G0/1 was set manually, which stops SLAAC and blocks any global addresses'],
    answer: 1,
    explanation: `ipv6 enable turns on IPv6 processing on the interface and generates a link-local address (here built with modified EUI-64 from the MAC), but it never creates a global address. Add one with ipv6 address 2001:DB8:A:2::1/64, with ipv6 address ...::/64 eui-64, or with ipv6 address autoconfig to learn one through SLAAC. DAD finishes in about a second, and a duplicate would show as [DUP], not as a missing line. ipv6 unicast-routing controls forwarding and RAs, not whether interfaces keep their addresses. G0/0 shows FE80::1, a manually configured link-local, but that has no effect on G0/1, and G0/1's link-local is clearly auto-generated anyway.`,
    ref: 'l1-8 card:ipv6',
  });
  add({
    id: 'q1-0056', domain: '1.0', obj: '1.8', type: 'single', difficulty: 2,
    stem: `Harbor Point's ISP assigns it 2001:db8:4c00::/48. If every LAN uses a /64, how many LAN subnets are available?`,
    options: ['256', '4,096', '16,384', '65,536'],
    answer: 3,
    explanation: `From /48 to /64 there are 64 - 48 = 16 subnet bits, and 2^16 = 65,536 subnets. Those 16 bits are the entire fourth hextet, so the subnets are 2001:db8:4c00:0000::/64 through 2001:db8:4c00:ffff::/64. That is why a /48 per site is a common allocation: it gives enormous room for a clean, hierarchical plan where, for example, the fourth hextet encodes building and VLAN. 256 would be 8 bits (a /56 to /64), 4,096 would be 12 bits and 16,384 would be 14 bits.`,
    ref: 'l1-8 card:ipv6',
  });
  add({
    id: 'q1-0057', domain: '1.0', obj: '1.8', type: 'single', difficulty: 3,
    stem: `A host is configured as 2001:db8:cafe:12a7::77/62. What is its prefix?`,
    options: ['2001:db8:cafe:12a7::/62', '2001:db8:cafe:12a4::/62', '2001:db8:cafe:12a0::/62', '2001:db8:cafe::/62'],
    answer: 1,
    explanation: `A /62 keeps the first 62 bits. The first three hextets are 48 bits, so 14 bits of the fourth hextet are network bits and the last 2 bits of it are host bits. 12a7 in hex ends in 7, binary 0111. Clearing the last two bits gives 0100, which is 4, so the fourth hextet becomes 12a4. The prefix is 2001:db8:cafe:12a4::/62, covering 12a4 through 12a7. 12a7 is the host's own value, not the prefix. 12a0 would be correct for a /60 (clearing four bits). 2001:db8:cafe::/62 ignores the fourth hextet entirely.`,
    ref: 'l1-8 card:ipv6',
  });
  add({
    id: 'q1-0058', domain: '1.0', obj: '1.8', type: 'single', difficulty: 2,
    stem: `A branch router's internet interface should learn its IPv6 address from the ISP's router advertisements using SLAAC. Which interface command does this?`,
    options: ['ipv6 address dhcp', 'ipv6 address autoconfig', 'ipv6 enable', 'ipv6 address 2001:db8::/64 eui-64'],
    answer: 1,
    explanation: `ipv6 address autoconfig tells the interface to listen for router advertisements, take the advertised /64 prefix and build its own interface ID, which is SLAAC. ipv6 address dhcp makes the interface a DHCPv6 client instead, getting its address from a stateful DHCPv6 server. ipv6 enable only creates a link-local address. ipv6 address 2001:db8::/64 eui-64 is a static prefix that the router completes with an EUI-64 interface ID; the prefix is typed by the administrator, not learned from the ISP.`,
    ref: 'l1-8 card:ipv6',
  });

  /* ---- 1.9 IPv6 address types --------------------------------------- */
  add({
    id: 'q1-0059', domain: '1.0', obj: '1.9', type: 'single', difficulty: 3,
    stem: `HPL-EDGE4 G0/1 has MAC address 02ab.33cd.4e5f and is configured with ipv6 address 2001:db8:5:3::/64 eui-64. What global address does the interface get?`,
    options: ['2001:db8:5:3:2ab:33ff:fecd:4e5f', '2001:db8:5:3:ab:33ff:fecd:4e5f', '2001:db8:5:3:2ab:33cd:fffe:4e5f', '2001:db8:5:3:ab:33fe:ffcd:4e5f'],
    answer: 1,
    explanation: `Modified EUI-64 builds a 64-bit interface ID from the 48-bit MAC in three steps. 1) Split the MAC in half: 02ab33 and cd4e5f. 2) Insert FFFE in the middle: 02ab:33ff:fecd:4e5f. 3) Invert the seventh bit of the first byte (the universal/local bit). 02 is 0000 0010; flipping the seventh bit gives 0000 0000, so 02 becomes 00. The interface ID is 00ab:33ff:fecd:4e5f, written without leading zeros as ab:33ff:fecd:4e5f. The first option forgets the bit flip (or flips it the wrong way). The third inserts FFFE in the wrong place and the fourth swaps the order of FF and FE.`,
    ref: 'l1-9 card:ipv6',
  });
  add({
    id: 'q1-0060', domain: '1.0', obj: '1.9', type: 'single', difficulty: 1,
    stem: `Which prefix identifies IPv6 link-local addresses?`,
    options: ['FC00::/7', 'FE80::/10', 'FF00::/8', '2000::/3'],
    answer: 1,
    explanation: `Link-local addresses come from FE80::/10 (in practice they all start with FE80). Every IPv6-enabled interface has one, it is valid only on the local link and routers never forward packets with a link-local source or destination to another link. Routing protocols and neighbor discovery use them, and a host's default gateway is usually the router's link-local address. FC00::/7 is unique local, FF00::/8 is multicast and 2000::/3 is the global unicast range currently allocated.`,
    ref: 'l1-9 card:ipv6',
  });
  add({
    id: 'q1-0061', domain: '1.0', obj: '1.9', type: 'match', difficulty: 2,
    stem: `Match each IPv6 address to its type.`,
    options: ['FE80::A1:2', 'FD3C:9A10:7::20', '2001:DB8:44::9', 'FF02::1', '::1', '::'],
    targets: ['Link-local unicast', 'Unique local unicast', 'Global unicast', 'Multicast (all nodes)', 'Loopback', 'Unspecified'],
    answer: [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5]],
    explanation: `FE80::/10 is link-local. FD00::/8 is the locally assigned half of the unique local block FC00::/7, the IPv6 equivalent of private addressing. 2001:DB8::/32 is reserved for documentation, but it sits inside 2000::/3 and has the global unicast format, so it is classified as global unicast. FF02::1 is the link-scope all-nodes multicast group (FF02::2 is all routers). ::1 is loopback, like 127.0.0.1. :: (all zeros) is the unspecified address, used as a source by a host that has no address yet, for example during duplicate address detection.`,
    ref: 'l1-9 card:ipv6',
  });
  add({
    id: 'q1-0062', domain: '1.0', obj: '1.9', type: 'single', difficulty: 2,
    stem: `A new IPv6 host boots and wants to find a router immediately instead of waiting for the next periodic advertisement. To which destination does it send its router solicitation?`,
    options: ['FF02::1', 'FF02::2', 'FF02::5', 'FE80::1'],
    answer: 1,
    explanation: `Router solicitations go to FF02::2, the all-routers link-local multicast group, and routers answer with a router advertisement (sent to FF02::1, all nodes, or unicast to the host). FF02::1 is all nodes; periodic RAs go there. FF02::5 is the group for all OSPFv3 routers (FF02::6 is OSPFv3 DRs). FE80::1 is just a link-local address someone might configure on a router; the host does not know any router's address yet, which is the whole point of soliciting.`,
    ref: 'l1-9 card:ipv6',
  });
  add({
    id: 'q1-0063', domain: '1.0', obj: '1.9', type: 'single', difficulty: 3,
    stem: `A server's address is 2001:db8::1:2c3d:4e5f. Which solicited-node multicast group does it join so neighbors can resolve its MAC address?`,
    options: ['FF02::1:FF2C:3D4E', 'FF02::1:FF3D:4E5F', 'FF02::1:FF00:1', 'FF05::1:3'],
    answer: 1,
    explanation: `The solicited-node multicast address is FF02::1:FF00:0/104 with the last 24 bits of the unicast address appended. The last 24 bits of ...2c3d:4e5f are 3d:4e5f, so the group is FF02::1:FF3D:4E5F. Neighbor solicitations (IPv6's replacement for ARP requests) are sent to that group, so only hosts whose addresses end in the same 24 bits have to process them, which is far more efficient than an ARP broadcast. The first option takes the wrong 24 bits. FF02::1:FF00:1 would belong to an address ending in 00:0001. FF05::1:3 is the site-scope all-DHCP-servers group.`,
    ref: 'l1-9 card:ipv6',
  });
  add({
    id: 'q1-0064', domain: '1.0', obj: '1.9', type: 'single', difficulty: 2,
    stem: `Harbor Point configures the same IPv6 address on DNS servers in two data centers, using the anycast keyword, and advertises it into OSPFv3 from both sites. What happens when a client sends a query to that address?`,
    options: ['Both servers receive a copy of every query', 'The query is delivered to the nearest server according to the routing metric', 'The query is dropped because duplicate addresses are not allowed in IPv6', 'The query is sent to the server with the lowest MAC address'],
    answer: 1,
    explanation: `An anycast address is a unicast address assigned to more than one device. Routers simply see two paths to the same prefix and send each packet along the best one, so each client reaches the topologically nearest server, and if one site fails, routing converges to the other. Anycast is one-to-nearest, while multicast is one-to-many (every member gets a copy). The anycast keyword on an IOS interface (ipv6 address ... anycast) tells the router not to run duplicate address detection for that address, which is why the duplicate is allowed. MAC addresses play no part in choosing among anycast destinations.`,
    ref: 'l1-9 card:ipv6',
  });
  add({
    id: 'q1-0065', domain: '1.0', obj: '1.9', type: 'multi', difficulty: 2, pick: 2,
    stem: `Which two statements about IPv6 unique local addresses (ULAs) are true? (Choose two.)`,
    options: ['They come from the FC00::/7 block, and locally assigned ones start with FD', 'They are not routed on the public internet', 'They are generated automatically on every IPv6 interface', 'They are valid only on a single link, like FE80 addresses', 'They replace the need for global unicast addresses to reach the internet'],
    answer: [0, 1],
    explanation: `Unique local addresses are IPv6's counterpart to RFC 1918 private space. They come from FC00::/7, and the half in use today, FD00::/8, includes a randomly generated 40-bit global ID to make collisions unlikely if two organizations merge. They are routable inside an organization, across many links, but must not be routed on the internet. Link-local addresses are the ones created automatically and limited to one link. To reach the internet, hosts still need global unicast addresses (or a translation mechanism), so ULAs do not replace them.`,
    ref: 'l1-9 card:ipv6',
  });
  add({
    id: 'q1-0066', domain: '1.0', obj: '1.9', type: 'single', difficulty: 2,
    stem: `When IOS builds a modified EUI-64 interface ID from the MAC address 0050.56ab.cdef, what is the result?`,
    options: ['0050:56ff:feab:cdef', '0250:56ff:feab:cdef', '0050:56fe:ffab:cdef', '0250:56ab:fffe:cdef'],
    answer: 1,
    explanation: `Split the MAC into 005056 and abcdef, insert FFFE between them to get 0050:56ff:feab:cdef, and then invert the seventh bit of the first byte. 00 is 0000 0000, and flipping the seventh bit gives 0000 0010, which is 02. The result is 0250:56ff:feab:cdef. The first option is the right shape but skips the bit inversion. The third option has the FF and FE bytes reversed. The fourth puts FFFE in the wrong position; FFFE always goes exactly in the middle, after the first three bytes of the MAC.`,
    ref: 'l1-9 card:ipv6',
  });

  /* ---- 1.10 client OS IP parameters --------------------------------- */
  add({
    id: 'q1-0067', domain: '1.0', obj: '1.10', type: 'single', difficulty: 1,
    stem: `On a Windows PC, which command shows the IPv4 address, MAC address, DNS servers, DHCP server and lease times all at once?`,
    options: ['ipconfig', 'ipconfig /all', 'netstat -r', 'nslookup'],
    answer: 1,
    explanation: `ipconfig /all prints everything about each adapter: physical (MAC) address, whether DHCP is enabled, IPv4 and IPv6 addresses, mask, default gateway, DHCP server, lease obtained and expires times, and DNS servers. Plain ipconfig shows only the address, mask and gateway (plus IPv6 addresses). netstat -r (or route print) shows the routing table. nslookup queries DNS and tells you which server answered, but it does not show adapter settings.`,
    ref: 'l1-10 card:dhcp',
  });
  add({
    id: 'q1-0068', domain: '1.0', obj: '1.10', type: 'single', difficulty: 2,
    stem: `A Linux server in the Harbor Point data center cannot reach anything outside its subnet. Which command shows its default gateway?`,
    options: ['ip route show', 'ip neigh show', 'cat /etc/hostname', 'ipconfig /all'],
    answer: 0,
    explanation: `ip route show (or just ip route) prints the kernel routing table, including the line "default via 10.1.30.1 dev ens160", which is the default gateway. ip neigh show is the neighbor (ARP) table, which may list the gateway's MAC but does not prove it is configured as the gateway. /etc/hostname only holds the system name. ipconfig /all is a Windows command. On Linux, ip addr shows addresses and /etc/resolv.conf (or resolvectl status on systemd-resolved systems) shows DNS servers.`,
    ref: 'l1-10',
  });
  add({
    id: 'q1-0069', domain: '1.0', obj: '1.10', type: 'single', difficulty: 3,
    stem: `A dispatcher's PC suddenly cannot reach any network resources. Review the output. What is the most likely cause?`,
    exhibit: { kind: 'cli', title: 'DISPATCH-11', lines: [
      'C:\\> ipconfig /all',
      'Ethernet adapter Ethernet:',
      '   Connection-specific DNS Suffix  . :',
      '   Physical Address. . . . . . . . . : 3C-52-82-6A-19-F0',
      '   DHCP Enabled. . . . . . . . . . . : Yes',
      '   Autoconfiguration Enabled . . . . : Yes',
      '   Link-local IPv6 Address . . . . . : fe80::9d2c:1a7:4e0b:3f21%12(Preferred)',
      '   Autoconfiguration IPv4 Address. . : 169.254.88.14(Preferred)',
      '   Subnet Mask . . . . . . . . . . . : 255.255.0.0',
      '   Default Gateway . . . . . . . . . :',
      '   DNS Servers . . . . . . . . . . . : fec0:0:0:ffff::1%1',
    ] },
    options: ['The DNS server address is wrong', 'The PC could not reach a DHCP server, so it assigned itself an APIPA address', 'The PC has a static address configured in the wrong subnet for its VLAN', 'The default gateway is down, so the PC cannot reach anything beyond its own subnet'],
    answer: 1,
    explanation: `DHCP is enabled, but the IPv4 address is in 169.254.0.0/16 and labeled "Autoconfiguration IPv4 Address." That is APIPA: Windows gives itself a link-local address when it sends DHCP discovers and nobody answers. There is no gateway and no real DNS server (the fec0 entries are Windows placeholders). Look for the reason the DHCP exchange failed: a cable or port problem, the port in the wrong VLAN, a missing ip helper-address on the gateway, DHCP snooping dropping offers, or an exhausted pool. The address is not static (DHCP Enabled: Yes). The gateway cannot be "down" when none was received. Fixing DNS would not help a host without a usable IPv4 address.`,
    ref: 'l1-10 l4-6 card:dhcp',
  });
  add({
    id: 'q1-0070', domain: '1.0', obj: '1.10', type: 'match', difficulty: 2,
    stem: `Match each task to the command that performs it on the operating system named.`,
    options: ['Windows: show full adapter details including DNS servers', 'Windows: display the routing table', 'Linux: show interface IP addresses', 'Linux: see which DNS resolvers are configured', 'macOS: show interface addresses from Terminal'],
    targets: ['ipconfig /all', 'route print', 'ip address show', 'cat /etc/resolv.conf', 'ifconfig'],
    answer: [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]],
    explanation: `Windows uses ipconfig /all for complete adapter details and route print (or netstat -r) for the routing table. Modern Linux distributions use the iproute2 tools: ip address show for addresses and ip route for routes; DNS resolvers are listed in /etc/resolv.conf (on systemd-resolved systems that file points to a local stub, and resolvectl status shows the upstream servers). macOS still includes ifconfig, and also offers networksetup -getinfo Wi-Fi and ipconfig getifaddr en0. Knowing at least one way to check address, mask, gateway and DNS on each OS is what objective 1.10 asks for.`,
    ref: 'l1-10',
  });
  add({
    id: 'q1-0071', domain: '1.0', obj: '1.10', type: 'single', difficulty: 3,
    stem: `A Linux analytics host can browse the internet but cannot reach the inventory database at 10.1.30.20. The database subnet is 10.1.30.0/24 behind the gateway 10.1.20.1. Review the output. What is the problem?`,
    exhibit: { kind: 'cli', title: 'analytics01', lines: [
      '$ ip -4 address show ens160',
      '2: ens160: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP group default qlen 1000',
      '    inet 10.1.20.55/16 brd 10.1.255.255 scope global ens160',
      '$ ip route',
      'default via 10.1.20.1 dev ens160 proto static',
      '10.1.0.0/16 dev ens160 proto kernel scope link src 10.1.20.55',
    ] },
    options: ['The default gateway is missing, so traffic to other subnets has no route', 'The /16 mask makes 10.1.30.20 look on-link, so the host ARPs for it instead of using the gateway', 'The broadcast address 10.1.255.255 does not match the host address, so ARP replies from other subnets are dropped', 'The interface is administratively down'],
    answer: 1,
    explanation: `The local subnet on this VLAN is 10.1.20.0/24, but the host was given /16. With /16, the host believes every 10.1.x.x address is on its own link, as the connected route 10.1.0.0/16 shows. For 10.1.30.20 it sends an ARP request on the local segment, nobody on that VLAN owns the address, and the traffic never reaches the gateway. Internet traffic works because those destinations fall outside 10.1.0.0/16 and use the default route. Fix the mask to /24. The default route is present. The broadcast 10.1.255.255 is correct for the (wrong) /16, which is the point. The interface flags show UP and LOWER_UP.`,
    ref: 'l1-10 l1-6 card:ipv4',
  });

  /* ---- 1.11 wireless principles ------------------------------------- */
  add({
    id: 'q1-0072', domain: '1.0', obj: '1.11', type: 'single', difficulty: 1,
    stem: `In the 2.4 GHz band in North America, which set of 20 MHz channels does not overlap?`,
    options: ['1, 5, 9', '1, 6, 11', '2, 7, 12', '1, 4, 8, 11'],
    answer: 1,
    explanation: `2.4 GHz channels are only 5 MHz apart, but each 20 MHz signal needs about 22 MHz of spectrum, so neighboring channels overlap. Channels 1, 6 and 11 are spaced far enough apart that they do not, and they are the standard three-channel plan in North America (channels 1 to 11 are available there). The other sets are spaced by four or five channels, or use channel 12, and still overlap with each other. In some regions channels 12 and 13 are allowed and a four-channel plan is sometimes discussed, but for the CCNA the answer is 1, 6 and 11.`,
    ref: 'l1-11 card:wififund',
  });
  add({
    id: 'q1-0073', domain: '1.0', obj: '1.11', type: 'single', difficulty: 3,
    stem: `Three 2.4 GHz APs cover adjacent aisles in the Canton warehouse. A survey shows the settings below, and clients near AP-C see high retry rates. What change best reduces interference?`,
    exhibit: { kind: 'table', rows: [['AP', 'Band', 'Channel', 'Width', 'Neighbors heard'], ['AP-A', '2.4 GHz', '1', '20 MHz', 'AP-B, AP-C'], ['AP-B', '2.4 GHz', '6', '20 MHz', 'AP-A, AP-C'], ['AP-C', '2.4 GHz', '3', '20 MHz', 'AP-A, AP-B']] },
    options: ['Move AP-C to channel 11', 'Move AP-C to channel 2', 'Widen all three APs to 40 MHz', 'Raise AP-C transmit power to the maximum'],
    answer: 0,
    explanation: `Channel 3 overlaps both channel 1 and channel 6, so AP-C interferes with, and suffers interference from, both neighbors. Overlapping-channel interference is worse than sharing the same channel, because the radios cannot decode each other's preambles and defer properly. Moving AP-C to 11 gives the clean 1/6/11 plan. Channel 2 still overlaps channels 1 and 6. In 2.4 GHz, 40 MHz channels use most of the band, leaving no way to keep three APs from overlapping. Raising transmit power makes AP-C louder in its neighbors' cells and makes the problem worse, not better.`,
    ref: 'l1-11 card:wififund',
  });
  add({
    id: 'q1-0074', domain: '1.0', obj: '1.11', type: 'multi', difficulty: 2, pick: 2,
    stem: `Harbor Point is moving its handheld scanners from 2.4 GHz to 5 GHz. Which two statements correctly compare the bands? (Choose two.)`,
    options: ['5 GHz offers many more nonoverlapping channels', 'At the same power, 5 GHz signals lose strength faster through walls and racks, so cells are smaller', '2.4 GHz has more nonoverlapping channels than 5 GHz', 'Bluetooth and microwave ovens operate mainly in the 5 GHz band', '5 GHz always provides longer range than 2.4 GHz'],
    answer: [0, 1],
    explanation: `The 5 GHz band has roughly two dozen 20 MHz nonoverlapping channels (25 in the US across UNII-1 to UNII-3, more where UNII-4 is allowed; the exact number depends on the regulatory domain and DFS rules), compared with three in 2.4 GHz, so it supports dense deployments and wider channels much better. Higher frequencies are absorbed and attenuated more by walls, shelving and people, so at equal power a 5 GHz cell is smaller than a 2.4 GHz cell. That means more APs, but also less co-channel interference. Bluetooth, microwave ovens and many older devices crowd 2.4 GHz, which is one reason to move. Range favors 2.4 GHz, not 5 GHz.`,
    ref: 'l1-11 card:wififund',
  });
  add({
    id: 'q1-0075', domain: '1.0', obj: '1.11', type: 'single', difficulty: 2,
    stem: `The SSID HPL-SCAN is broadcast by eight APs in the main warehouse. A technician needs to identify exactly which AP radio a scanner is associated with. Which value uniquely identifies that radio's basic service set?`,
    options: ['The SSID', 'The BSSID', 'The ESSID', 'The channel number'],
    answer: 1,
    explanation: `The BSSID is the MAC address of the AP radio (or of the virtual interface for one SSID on that radio), and it uniquely identifies each basic service set. The SSID is the human-readable network name, shared by every AP offering that network. When many APs share one SSID to let clients roam, the group forms an extended service set (ESS), and the name is sometimes called the ESSID, which is still not unique per AP. Several APs can be on the same channel, so channel number does not identify one radio either.`,
    ref: 'l1-11 card:wififund',
  });
  add({
    id: 'q1-0076', domain: '1.0', obj: '1.11', type: 'single', difficulty: 2,
    stem: `Signal strength collapses in the aisle where pallets of bottled water are stored, though it is fine in the aisle of empty racks. Which RF behavior is mainly responsible?`,
    options: ['Reflection', 'Absorption', 'Refraction', 'Diffraction'],
    answer: 1,
    explanation: `Water absorbs 2.4 GHz and 5 GHz energy very well (it is the same principle a microwave oven uses), so a wall of bottled water soaks up the signal and converts it to a tiny amount of heat. Absorption reduces signal strength and range. Reflection is a signal bouncing off a smooth, dense surface such as metal racking or glass, which creates multipath. Refraction is bending as the signal passes between materials of different density. Diffraction is bending around an obstacle, which creates RF shadows behind it. Scattering, from rough or uneven surfaces, is the fifth behavior worth knowing.`,
    ref: 'l1-11 card:wififund',
  });
  add({
    id: 'q1-0077', domain: '1.0', obj: '1.11', type: 'multi', difficulty: 2, pick: 2,
    stem: `Which two statements about Wi-Fi encryption are correct? (Choose two.)`,
    options: ['WPA2 requires AES-based CCMP encryption', 'WPA3 Personal replaces the PSK handshake with Simultaneous Authentication of Equals (SAE)', 'WEP is acceptable for new deployments when the key is long', 'TKIP is the encryption method required by WPA3', 'Open networks encrypt traffic with the SSID as the key'],
    answer: [0, 1],
    explanation: `WPA2 uses CCMP, built on AES, for data encryption and integrity. WPA3 keeps strong AES-based encryption (with GCMP-256 in its 192-bit enterprise mode) and, in Personal mode, replaces the PSK four-way-handshake weakness with SAE, which resists offline dictionary attacks against captured handshakes. WEP uses RC4 with a flawed design and can be cracked in minutes regardless of key length. TKIP was WPA's interim fix for old WEP hardware and is deprecated; WPA3 does not allow it. Open networks send data unencrypted (WPA3's Enhanced Open, OWE, adds encryption without a password, but that is not the SSID acting as a key).`,
    ref: 'l1-11 l5-9 card:wifisec',
  });

  /* ---- 1.12 virtualization ------------------------------------------ */
  add({
    id: 'q1-0078', domain: '1.0', obj: '1.12', type: 'multi', difficulty: 2, pick: 2,
    stem: `The development team wants to package the shipment-tracking app as containers instead of virtual machines. Which two statements describe containers compared with VMs? (Choose two.)`,
    options: ['Containers share the host operating system kernel', 'Each container includes its own full guest operating system', 'Containers usually start in seconds and use fewer resources than VMs', 'Containers require a Type 1 hypervisor to run', 'Containers cannot run on a virtual machine'],
    answer: [0, 2],
    explanation: `A container packages an application with its libraries and dependencies but shares the kernel of the host operating system, using a container engine such as Docker. Because there is no guest OS to boot, containers start quickly and are lightweight, so many more fit on the same hardware. A virtual machine, by contrast, includes a full guest operating system on virtual hardware provided by a hypervisor. Containers do not need a hypervisor at all, and it is very common to run a container engine inside a VM, so the last option is false too.`,
    ref: 'l1-12 card:cloud',
  });
  add({
    id: 'q1-0079', domain: '1.0', obj: '1.12', type: 'single', difficulty: 2,
    stem: `Harbor Point's new server cluster runs VMware ESXi installed directly on the server hardware, with no operating system underneath. What kind of hypervisor is this?`,
    options: ['Type 1 (bare-metal) hypervisor', 'Type 2 (hosted) hypervisor on a host OS', 'Container engine such as Docker', 'Virtual switch'],
    answer: 0,
    explanation: `A Type 1 hypervisor runs directly on the hardware and is the operating layer itself; ESXi, Microsoft Hyper-V and KVM are examples, and they are the standard in data centers. A Type 2 hypervisor is an application on top of a normal operating system, such as VMware Workstation or VirtualBox on a laptop; it is convenient for labs but adds the host OS as an extra layer. A container engine shares an OS kernel rather than virtualizing hardware. A virtual switch is a software switch inside the hypervisor that connects VMs to each other and to the physical NICs.`,
    ref: 'l1-12 card:cloud',
  });
  add({
    id: 'q1-0080', domain: '1.0', obj: '1.12', type: 'single', difficulty: 3,
    stem: `Harbor Point acquires a small freight forwarder whose LAN also uses 10.1.1.0/24, the same as one of Harbor Point's own LANs. Both must connect to the same edge router temporarily, and they must not see each other's routes. Which feature solves this on a single router?`,
    options: ['Separate VLANs on router subinterfaces, one VLAN per company', 'VRF-lite, placing each company\'s interfaces in its own VRF', 'Two OSPF processes in the same global routing table, one per company', 'Secondary IP addresses on the interfaces'],
    answer: 1,
    explanation: `A VRF (virtual routing and forwarding instance) gives a router multiple independent routing tables. Interfaces are assigned to a VRF, and routes in one VRF are invisible to another, so overlapping prefixes like two copies of 10.1.1.0/24 can coexist on one box. Using VRFs without MPLS is called VRF-lite. VLANs separate Layer 2 domains but do not create separate routing tables on a router. Two OSPF processes would still install routes into the same global table, where the duplicate prefix conflicts. Secondary addresses add more subnets to one interface and do nothing to separate routing.`,
    ref: 'l1-12 card:cloud',
  });
  add({
    id: 'q1-0081', domain: '1.0', obj: '1.12', type: 'multi', difficulty: 2, pick: 2,
    stem: `Which two statements about VRFs are true? (Choose two.)`,
    options: ['Each VRF maintains its own routing table', 'An interface (or subinterface) belongs to one VRF at a time', 'A VRF requires a separate physical router', 'VRFs can only be used with MPLS', 'All VRFs share a single routing table and are separated by ACLs'],
    answer: [0, 1],
    explanation: `VRFs virtualize the router's Layer 3 forwarding: each VRF has its own routing table and forwarding table, and each Layer 3 interface or subinterface is assigned to exactly one VRF (or left in the global table). This lets one physical router act like several. Service providers use VRFs with MPLS VPNs, but VRF-lite works on its own in enterprise networks, for example to separate guest and corporate traffic. The whole point is to avoid needing separate routers, and separation comes from distinct tables, not from ACLs on a shared one.`,
    ref: 'l1-12 card:cloud',
  });
  add({
    id: 'q1-0082', domain: '1.0', obj: '1.12', type: 'single', difficulty: 1,
    stem: `Inside a virtualization host, what connects the VMs' virtual NICs to each other and to the host's physical network adapters?`,
    options: ['A virtual switch', 'A wireless LAN controller', 'A Type 2 hypervisor', 'A VRF'],
    answer: 0,
    explanation: `The hypervisor provides a virtual switch (vSwitch) that behaves like a Layer 2 switch: VMs plug their virtual NICs into it, it forwards frames between VMs on the same host, and it uses the physical NICs as uplinks to the real network. It can tag traffic with VLANs, so the physical switch port toward a virtualization host is often a trunk. A WLC manages APs. A Type 2 hypervisor is a kind of hypervisor, not the component that switches frames. A VRF separates routing tables on a router.`,
    ref: 'l1-12 card:cloud',
  });

  /* ---- 1.13 switching concepts -------------------------------------- */
  add({
    id: 'q1-0083', domain: '1.0', obj: '1.13', type: 'single', difficulty: 1,
    stem: `How does a switch populate its MAC address table?`,
    options: ['It records the destination MAC address of each frame and the port it leaves on', 'It records the source MAC address of each received frame and the port it arrived on', 'It sends ARP requests to every host on boot', 'It copies the table from the default gateway'],
    answer: 1,
    explanation: `Switches learn by looking at the source MAC address of every frame that arrives and recording it against the ingress port and VLAN. Later frames destined to that MAC can be sent out only that port. The destination address is used for the forwarding decision, not for learning, because the switch does not yet know where that destination is. Switches do not ARP for hosts in order to forward frames (ARP is a Layer 3 to Layer 2 resolution done by hosts and routers), and a router's ARP table is not copied anywhere.`,
    ref: 'l1-13 card:ethernet',
  });
  add({
    id: 'q1-0084', domain: '1.0', obj: '1.13', type: 'single', difficulty: 2,
    stem: `A switch receives a unicast frame in VLAN 10 on Fa0/3. The destination MAC address is not in the MAC address table. What does the switch do?`,
    options: ['Drops the frame', 'Floods the frame out all ports in VLAN 10 except Fa0/3', 'Floods the frame out every port on the switch, in all VLANs', 'Sends an ARP request for the destination and holds the frame'],
    answer: 1,
    explanation: `An unknown unicast is flooded: sent out every port in the same VLAN (access ports in VLAN 10 and trunks allowing VLAN 10) except the port it arrived on. When the destination replies, the switch learns its location from the reply's source address, and later frames are forwarded out one port only. Switches never forward a frame into a different VLAN, so flooding is always limited to the ingress VLAN. Dropping would break communication with hosts that have not transmitted recently. Switches do not ARP; they work purely with MAC addresses.`,
    ref: 'l1-13 card:ethernet',
  });
  add({
    id: 'q1-0085', domain: '1.0', obj: '1.13', type: 'single', difficulty: 3,
    stem: `HPL-ACC1 receives a frame on Fa0/3 with source MAC 0050.7966.6801 and destination MAC 0050.7966.6804. Based on the table, what does the switch do with the frame?`,
    exhibit: { kind: 'cli', title: 'HPL-ACC1', lines: [
      'HPL-ACC1# show mac address-table dynamic',
      '          Mac Address Table',
      '-------------------------------------------',
      '',
      'Vlan    Mac Address       Type        Ports',
      '----    -----------       --------    -----',
      '  10    0050.7966.6801    DYNAMIC     Fa0/3',
      '  10    0050.7966.6802    DYNAMIC     Fa0/4',
      '  10    0050.7966.6804    DYNAMIC     Fa0/3',
      '  20    0050.7966.6803    DYNAMIC     Fa0/7',
      '  10    0011.bb22.cc01    DYNAMIC     Gi0/1',
      'Total Mac Addresses for this criterion: 5',
    ] },
    options: ['Forwards it out Fa0/3', 'Floods it out every VLAN 10 port except Fa0/3, because the destination MAC is unknown', 'Filters (discards) it, because the destination is on the same port it arrived on', 'Forwards it out Gi0/1 to the uplink toward the default gateway'],
    answer: 2,
    explanation: `The destination 0050.7966.6804 is known on Fa0/3, the same port the frame came in on. That happens when Fa0/3 connects to a hub or a small unmanaged switch, so both hosts are reachable through one port. The destination has already received the frame on that shared segment, so the switch filters (drops) it rather than sending it back out the ingress port. A switch never forwards a frame out the port it arrived on. Flooding applies only when the destination is unknown, and the uplink Gi0/1 has nothing to do with this destination.`,
    ref: 'l1-13 card:ethernet',
  });
  add({
    id: 'q1-0086', domain: '1.0', obj: '1.13', type: 'single', difficulty: 2,
    stem: `By default, how long does a Cisco Catalyst switch keep a dynamically learned MAC address that has not been seen as a source?`,
    options: ['60 seconds', '180 seconds', '300 seconds', '14,400 seconds'],
    answer: 2,
    explanation: `The default MAC address aging time on Catalyst switches is 300 seconds (5 minutes), adjustable with mac address-table aging-time. Every frame from the host refreshes the timer, so active hosts never age out. When an entry ages out, frames to that MAC are flooded again until the host transmits. 14,400 seconds (4 hours) is the default ARP cache timeout on Cisco routers, a different table at a different layer, and a common mix-up. 60 and 180 seconds are CDP's advertisement interval and holdtime.`,
    ref: 'l1-13 card:ethernet card:arp',
  });
  add({
    id: 'q1-0087', domain: '1.0', obj: '1.13', type: 'order', difficulty: 2,
    stem: `Put the steps a switch takes for a received unicast frame in the correct order.`,
    options: ['Look up the destination MAC address in the table for that VLAN', 'Receive the frame on an access port in VLAN 10', 'Forward out the matching port, filter if it is the ingress port, or flood if unknown', 'Learn or refresh the source MAC address against the ingress port'],
    answer: [1, 3, 0, 2],
    explanation: `The switch first receives the frame and knows its VLAN from the ingress port (or from the 802.1Q tag on a trunk). It then learns: it adds or refreshes the source MAC with the ingress port and resets the aging timer. Next it looks up the destination MAC in that VLAN's table. Finally it acts on the result: forward out the one known port, filter if that port is the one the frame arrived on, or flood within the VLAN if the destination is unknown, broadcast or (without IGMP snooping) multicast.`,
    ref: 'l1-13 card:ethernet',
  });
  add({
    id: 'q1-0088', domain: '1.0', obj: '1.13', type: 'multi', difficulty: 2, pick: 2,
    stem: `Which two kinds of frames does a Layer 2 switch flood out all ports in the VLAN except the ingress port? (Choose two.)`,
    options: ['A frame sent to FFFF.FFFF.FFFF', 'A unicast frame to a MAC address that is not in the table', 'A unicast frame to a MAC address learned on another port', 'A frame whose destination is learned on the ingress port', 'A frame with a failed FCS check'],
    answer: [0, 1],
    explanation: `Broadcasts (destination FFFF.FFFF.FFFF), such as ARP requests and DHCP discovers, are meant for every host and are flooded within the VLAN. Unknown unicasts are flooded too, because the switch has no idea where the destination is. Known unicasts go out a single port. A frame whose destination lives on the ingress port is filtered. A frame that fails the FCS check is corrupt; a store-and-forward switch discards it (and counts it as a CRC error) instead of forwarding it anywhere.`,
    ref: 'l1-13 card:ethernet',
  });
  add({
    id: 'q1-0089', domain: '1.0', obj: '1.13', type: 'single', difficulty: 3,
    stem: `A dispatcher unplugs a laptop from Fa0/5 and plugs it into Fa0/9 on the same switch and VLAN. One second later the laptop sends a frame. What happens to its MAC address table entry?`,
    options: ['The old entry stays on Fa0/5 until it ages out after 300 seconds, so return traffic is lost for five minutes', 'The switch updates the entry to Fa0/9 as soon as it sees the frame from the laptop on that port', 'The switch err-disables Fa0/9 because the MAC address is already learned', 'The switch creates a second entry, so the MAC address appears on both ports'],
    answer: 1,
    explanation: `Learning is continuous. When a frame with that source MAC arrives on Fa0/9 in the same VLAN, the switch moves the entry to Fa0/9 immediately, and traffic to the laptop follows. In this case the old entry would also have been removed when Fa0/5 went down, because entries for a port are flushed when its link drops. A MAC address can only be associated with one port per VLAN in the dynamic table. Err-disabling for a moved MAC happens only with port security features (for example a sticky MAC learned on another secure port), not by default. When the same MAC keeps jumping between two ports, the switch logs MAC flapping, a sign of a Layer 2 loop.`,
    ref: 'l1-13 card:ethernet',
  });

  /* ==================================================================== *
   * 2.0 NETWORK ACCESS
   * ==================================================================== */

  /* ---- 2.1 VLANs ----------------------------------------------------- */
  add({
    id: 'q1-0101', domain: '2.0', obj: '2.1', type: 'sim', difficulty: 2,
    stem: `The two label printers on the receiving dock (DOCK-PRN1 on Fa0/3 and DOCK-PRN2 on Fa0/4) must be moved out of VLAN 1 into their own VLAN. The office PC on Fa0/1 stays where it is.`,
    sim: {
      world: {
        devices: {
          SW1: sw('HPL-ACC3', 8, { 'FastEthernet0/1': { modeSet: true }, 'FastEthernet0/3': { modeSet: true }, 'FastEthernet0/4': { modeSet: true } }),
          PC1: pc('DOCK-PRN1', '10.30.30.11', '255.255.255.0', ''),
          PC2: pc('DOCK-PRN2', '10.30.30.12', '255.255.255.0', ''),
          PC3: pc('OFFICE-PC', '10.30.30.13', '255.255.255.0', ''),
        },
        links: [['PC1', 'NIC', 'SW1', 'FastEthernet0/3'], ['PC2', 'NIC', 'SW1', 'FastEthernet0/4'], ['PC3', 'NIC', 'SW1', 'FastEthernet0/1']],
      },
      start: 'SW1',
      tasks: ['Create VLAN 30 and name it DOCK.', 'Make Fa0/3 and Fa0/4 static access ports in VLAN 30.', 'Leave Fa0/1 in VLAN 1.'],
      check: 'q1-vlan-dock',
      solution: { SW1: ['enable', 'configure terminal', 'vlan 30', 'name DOCK', 'exit', 'interface range fa0/3 - 4', 'switchport mode access', 'switchport access vlan 30', 'end'] },
    },
    explanation: `Create the VLAN in global configuration with vlan 30, then name DOCK in VLAN configuration mode. Then configure both ports at once with interface range fa0/3 - 4, switchport mode access and switchport access vlan 30. Hard-coding access mode stops the port from negotiating a trunk with DTP. If you assign a port to a VLAN that does not exist yet, newer IOS versions create the VLAN for you with a message, but older ones leave the port inactive, so creating it first is the safe habit. Verify with show vlan brief: Fa0/3 and Fa0/4 should be listed under VLAN 30 DOCK, and Fa0/1 should remain under VLAN 1 default. The printers can still reach each other; the office PC, now in a different broadcast domain, cannot reach them without a router.`,
    ref: 'l2-1 card:vlan',
  });
  TT.simChecks['q1-vlan-dock'] = (w) => {
    const d = w.devices.SW1;
    const p3 = ifc(w, 'SW1', 'FastEthernet0/3'), p4 = ifc(w, 'SW1', 'FastEthernet0/4'), p1 = ifc(w, 'SW1', 'FastEthernet0/1');
    return String(d.vlans[30] || '').toUpperCase() === 'DOCK' && p3.mode === 'access' && p4.mode === 'access' && p3.accessVlan === 30 && p4.accessVlan === 30 && p1.accessVlan === 1 && ping(w, 'PC1', '10.30.30.12') && !ping(w, 'PC1', '10.30.30.13');
  };
  add({
    id: 'q1-0102', domain: '2.0', obj: '2.1', type: 'single', difficulty: 2,
    stem: `HPL-ACC4 is a Layer 2-only access switch (a Catalyst 2960). A technician runs show vlan brief and notices the uplink Gi0/1 is not listed under any VLAN, although the port is up and passing traffic. What is the most likely reason?`,
    exhibit: { kind: 'cli', title: 'HPL-ACC4', lines: [
      'HPL-ACC4# show vlan brief',
      '',
      'VLAN Name                             Status    Ports',
      '---- -------------------------------- --------- -------------------------------',
      '1    default                          active    Fa0/5, Fa0/6, Fa0/7, Fa0/8',
      '10   OFFICE                           active    Fa0/1, Fa0/2',
      '20   SCANNERS                         active    Fa0/3, Fa0/4',
      '1002 fddi-default                     act/unsup',
      '1003 token-ring-default               act/unsup',
      '1004 fddinet-default                  act/unsup',
      '1005 trnet-default                    act/unsup',
    ] },
    options: ['Gi0/1 is err-disabled and has been removed from its access VLAN', 'Gi0/1 is an operational trunk port, and trunks are not listed in show vlan brief', 'Gi0/1 is assigned to an access VLAN that has since been deleted from the VLAN database', 'Gi0/1 is a routed port with an IP address, so it has no VLAN membership'],
    answer: 1,
    explanation: `show vlan brief lists access ports under their VLAN. Ports that are operationally trunking are left out because they carry many VLANs. Use show interfaces trunk to see them. If a port were assigned to a deleted VLAN it would also disappear from the list, but then it would not pass traffic, and the stem says it does. An err-disabled port is down and would not pass traffic either. A routed port on a multilayer switch would also be missing from the list, but a Layer 2-only switch such as a 2960 cannot make a physical port a routed port with no switchport, so the trunk is the answer. VLANs 1002 to 1005 are legacy FDDI and Token Ring defaults that always appear and cannot be deleted.`,
    ref: 'l2-1 l2-2 card:vlan card:trunk',
  });
  add({
    id: 'q1-0103', domain: '2.0', obj: '2.1', type: 'single', difficulty: 3,
    stem: `A new scanner on Fa0/12 gets no network access. Review the output. What is the fix?`,
    exhibit: { kind: 'cli', title: 'HPL-ACC6', lines: [
      'HPL-ACC6# show interfaces FastEthernet0/12 switchport',
      'Name: Fa0/12',
      'Switchport: Enabled',
      'Administrative Mode: static access',
      'Operational Mode: static access',
      'Administrative Trunking Encapsulation: negotiate',
      'Negotiation of Trunking: Off',
      'Access Mode VLAN: 40 (Inactive)',
      'Trunking Native Mode VLAN: 1 (default)',
      'Voice VLAN: none',
      '',
      'HPL-ACC6# show vlan brief | include ^40',
      'HPL-ACC6#',
    ] },
    options: ['Change the port to trunk mode', 'Create VLAN 40 on the switch', 'Enable PortFast on Fa0/12', 'Configure a voice VLAN on Fa0/12'],
    answer: 1,
    explanation: `"Access Mode VLAN: 40 (Inactive)" means the port is assigned to VLAN 40 but VLAN 40 does not exist in this switch's VLAN database, which the empty show vlan brief filter confirms. A port in a nonexistent VLAN does not forward. Create it with vlan 40 (and a name) and the port becomes active. This happens when a port is configured first and the VLAN is created later, or when someone deletes a VLAN with no vlan 40 while ports still use it. Trunk mode is for switch-to-switch or switch-to-router links, not a scanner. PortFast affects how fast a port starts forwarding, not whether its VLAN exists. A voice VLAN is only for IP phones.`,
    ref: 'l2-1 card:vlan',
  });
  add({
    id: 'q1-0104', domain: '2.0', obj: '2.1', type: 'multi', difficulty: 2, pick: 2,
    stem: `Each desk in the dispatch office has an IP phone with a PC plugged into the phone. The switch port uses VLAN 10 for data and VLAN 110 for voice. Which two statements are true? (Choose two.)`,
    options: ['The phone tags voice frames with VLAN 110 using 802.1Q', 'The PC\'s frames reach the switch untagged and are placed in VLAN 10', 'The switch port must be configured with switchport mode trunk', 'Both PC and phone traffic are carried untagged in VLAN 110', 'The phone learns its voice VLAN from DHCP option 82'],
    answer: [0, 1],
    explanation: `With switchport access vlan 10 and switchport voice vlan 110, the port stays an access port but carries two VLANs. The phone learns the voice VLAN from the switch through CDP (or LLDP-MED) and tags its own voice frames with VLAN 110 (with a CoS priority value). The phone's internal switch passes the PC's frames through untagged, and the switch puts them in the access VLAN 10. Cisco describes this as a special case rather than a trunk; show interfaces switchport still reports static access. Option 82 is DHCP relay agent information inserted by switches, not a way for phones to learn VLANs.`,
    ref: 'l2-1 card:vlan',
  });
  add({
    id: 'q1-0105', domain: '2.0', obj: '2.1', type: 'single', difficulty: 2,
    stem: `Which configuration correctly sets Fa0/8 for a PC in data VLAN 10 behind an IP phone in voice VLAN 110?`,
    options: ['switchport mode trunk\nswitchport trunk allowed vlan 10,110', 'switchport mode access\nswitchport access vlan 10\nswitchport voice vlan 110', 'switchport mode access\nswitchport access vlan 110\nswitchport voice vlan 10', 'switchport mode access\nswitchport access vlan 10,110'],
    answer: 1,
    explanation: `The data VLAN is set with switchport access vlan and the voice VLAN with switchport voice vlan, on a port in access mode. A trunk would technically carry both VLANs but is not the recommended design: it exposes every allowed VLAN to the PC and loses the voice VLAN behavior of the access port. The third option swaps the data and voice VLANs, so the PC would land in VLAN 110 and the phone would tag with 10. switchport access vlan accepts only one VLAN, so a list is rejected.`,
    ref: 'l2-1 card:vlan',
  });
  add({
    id: 'q1-0106', domain: '2.0', obj: '2.1', type: 'multi', difficulty: 1, pick: 2,
    stem: `Which two statements about VLAN numbering on Catalyst switches are true? (Choose two.)`,
    options: ['VLAN 1 is the default VLAN and cannot be deleted', 'The normal VLAN range is 1 to 1005', 'VLANs 1002 to 1005 can be renamed and used for user traffic', 'The extended range is 1006 to 4096', 'All ports are in VLAN 99 by default'],
    answer: [0, 1],
    explanation: `Every port starts in VLAN 1, the default VLAN, which can be pruned from trunks but never deleted or renamed. The normal range is 1 to 1005, and the extended range is 1006 to 4094 (4095 and 0 are reserved, so 4096 is not valid). VLANs 1002 to 1005 are legacy FDDI and Token Ring VLANs; they always exist and cannot be changed or deleted. Nothing puts ports in VLAN 99 by default; 99 is just a commonly used number in labs for management or native VLANs. A good practice is to move user ports and the management SVI off VLAN 1.`,
    ref: 'l2-1 card:vlan',
  });
  add({
    id: 'q1-0107', domain: '2.0', obj: '2.1', type: 'order', difficulty: 2,
    stem: `Starting in privileged EXEC mode, put the commands in order to create VLAN 50 named SCANNERS and make Fa0/7 a static access port in it. Follow the usual habit of setting the port mode before assigning the VLAN.`,
    options: ['switchport access vlan 50', 'vlan 50', 'interface fastethernet0/7', 'configure terminal', 'switchport mode access', 'name SCANNERS'],
    answer: [3, 1, 5, 2, 4, 0],
    explanation: `Enter global configuration mode first (configure terminal). vlan 50 creates the VLAN and puts you in VLAN configuration mode, where name SCANNERS names it. interface fastethernet0/7 moves you into interface configuration mode (IOS lets you jump straight from config-vlan to another configuration command). There, switchport mode access disables trunk negotiation and switchport access vlan 50 assigns the VLAN. IOS would accept the last two in either order, which is why the question pins the habit of setting the mode first. Verify with show vlan brief and show interfaces fa0/7 switchport.`,
    ref: 'l2-1 card:vlan',
  });
  add({
    id: 'q1-0108', domain: '2.0', obj: '2.1', type: 'single', difficulty: 3,
    stem: `Hosts in VLAN 10 and VLAN 20 cannot reach each other. Each host can ping its own SVI address. Review the configuration of the multilayer switch. What is missing?`,
    exhibit: { kind: 'cli', title: 'HPL-DIST1', lines: [
      'HPL-DIST1# show running-config | section interface Vlan|ip routing|ip route',
      'interface Vlan10',
      ' ip address 10.1.10.1 255.255.255.0',
      'interface Vlan20',
      ' ip address 10.1.20.1 255.255.255.0',
      '',
      'HPL-DIST1# show ip route',
      'Default gateway is not set',
      '',
      'Host               Gateway           Last Use    Total Uses  Interface',
      'ICMP redirect cache is empty',
    ] },
    options: ['The SVIs need no shutdown', 'The global command ip routing', 'A trunk to an external router', 'switchport mode trunk on the SVIs'],
    answer: 1,
    explanation: `show ip route printing "Default gateway is not set" and the ICMP redirect cache is the giveaway: the switch is acting as a Layer 2 host, not a router. Multilayer switches ship with IP routing disabled; until you enter ip routing, SVIs answer for their own addresses (which is why hosts can ping their gateway) but the switch does not route between them. The SVIs are clearly up, or the hosts could not ping them. An external router would be the router-on-a-stick design, which the SVIs replace. SVIs are Layer 3 interfaces and have no switchport mode.`,
    ref: 'l2-1 card:vlan card:lanarch',
  });
  add({
    id: 'q1-0109', domain: '2.0', obj: '2.1', type: 'single', difficulty: 3,
    stem: `Hosts in VLAN 10 can reach the router, but hosts in VLAN 20 cannot reach their gateway 10.1.20.1. The switch trunk to the router allows all VLANs. Review the router configuration. What is the problem?`,
    exhibit: { kind: 'cli', title: 'HPL-BR1', lines: [
      'HPL-BR1# show running-config | section interface GigabitEthernet0/0',
      'interface GigabitEthernet0/0',
      ' no ip address',
      'interface GigabitEthernet0/0.10',
      ' encapsulation dot1Q 10',
      ' ip address 10.1.10.1 255.255.255.0',
      'interface GigabitEthernet0/0.20',
      ' encapsulation dot1Q 30',
      ' ip address 10.1.20.1 255.255.255.0',
    ] },
    options: ['Subinterface numbers must match the VLAN numbers exactly or the router rejects them', 'Gi0/0.20 is tagging and accepting VLAN 30 frames instead of VLAN 20', 'The physical interface needs an IP address for the subinterfaces to work', 'Router-on-a-stick supports only one subinterface per physical port'],
    answer: 1,
    explanation: `The encapsulation dot1Q command decides which VLAN tag a subinterface uses. Gi0/0.20 is configured with VLAN 30, so it ignores the VLAN 20 frames arriving on the trunk and sends its own frames tagged 30. VLAN 20 hosts never get ARP replies from 10.1.20.1. Change it to encapsulation dot1Q 20. The subinterface number is only a label; matching it to the VLAN is good practice, but the router does not enforce it, so a mismatch in the number alone is not an error. The physical interface needs no shutdown but no IP address. A router-on-a-stick can have many subinterfaces on one link, one per VLAN.`,
    ref: 'l2-1 card:trunk',
  });
  add({
    id: 'q1-0110', domain: '2.0', obj: '2.1', type: 'multi', difficulty: 3, pick: 2,
    stem: `You are replacing router-on-a-stick with SVIs on a multilayer switch. Which two conditions must be met for interface Vlan30 to route traffic for VLAN 30 hosts? (Choose two.)`,
    options: ['IP routing is enabled globally with ip routing', 'VLAN 30 exists and at least one port carrying VLAN 30 is up, so the SVI is up/up', 'The SVI is configured with encapsulation dot1Q 30', 'The native VLAN on all trunks is set to 30', 'A trunk to a router carries VLAN 30'],
    answer: [0, 1],
    explanation: `The SVI must be up/up and the switch must route. An SVI comes up only when its VLAN exists in the VLAN database and at least one access port in that VLAN, or a trunk forwarding it, is up (and the SVI itself is not shut down). Routing between SVIs then requires ip routing, which is off by default on many Catalyst models. encapsulation dot1Q is a router subinterface command and is not used on SVIs. The native VLAN has nothing to do with SVI routing. No external router is needed; that is the point of using SVIs.`,
    ref: 'l2-1 card:vlan',
  });
  add({
    id: 'q1-0111', domain: '2.0', obj: '2.1', type: 'sim', difficulty: 3,
    stem: `The Fells Point branch uses router-on-a-stick. HPL-BR3's G0/0 connects to the switch's trunk port, but the router side was never configured. VLAN 10 (10.10.10.0/24) and VLAN 20 (10.10.20.0/24) hosts use .1 as their gateway.`,
    sim: {
      world: {
        devices: {
          R1: { kind: 'router', hostname: 'HPL-BR3', interfaces: { 'GigabitEthernet0/0': { shutdown: true }, 'GigabitEthernet0/1': { shutdown: true } } },
          SW1: sw('BR3-SW1', 4, { 'FastEthernet0/1': { accessVlan: 10, modeSet: true }, 'FastEthernet0/2': { accessVlan: 20, modeSet: true }, 'GigabitEthernet0/1': { mode: 'trunk' } }, { 1: 'default', 10: 'OFFICE', 20: 'WAREHOUSE' }),
          PC1: pc('OFFICE-PC', '10.10.10.10', '255.255.255.0', '10.10.10.1'),
          PC2: pc('WH-PC', '10.10.20.10', '255.255.255.0', '10.10.20.1'),
        },
        links: [['R1', 'GigabitEthernet0/0', 'SW1', 'GigabitEthernet0/1'], ['PC1', 'NIC', 'SW1', 'FastEthernet0/1'], ['PC2', 'NIC', 'SW1', 'FastEthernet0/2']],
      },
      start: 'R1',
      tasks: ['On HPL-BR3, create subinterfaces on G0/0 for VLAN 10 and VLAN 20 using 802.1Q.', 'Give them 10.10.10.1/24 and 10.10.20.1/24.', 'Bring the link up so OFFICE-PC can ping WH-PC.'],
      check: 'q1-roas',
      solution: { R1: ['enable', 'configure terminal', 'interface g0/0', 'no shutdown', 'interface g0/0.10', 'encapsulation dot1q 10', 'ip address 10.10.10.1 255.255.255.0', 'interface g0/0.20', 'encapsulation dot1q 20', 'ip address 10.10.20.1 255.255.255.0', 'end'] },
    },
    explanation: `Bring up the physical interface with no shutdown (subinterfaces cannot come up while the parent is shut). Then, for each VLAN, create a subinterface, set encapsulation dot1q with the VLAN ID first (IOS will not accept an IP address on a subinterface until encapsulation is set), and assign the gateway address. The switch side is already a trunk, so tagged frames for both VLANs reach the router, which routes between the subinterfaces like any two connected networks. Verify with show ip interface brief (both subinterfaces up/up), show ip route (two connected routes) and a ping between the PCs. A single link carries traffic in and out for every VLAN, which is the scaling limit of this design.`,
    ref: 'l2-1 card:trunk',
  });
  TT.simChecks['q1-roas'] = (w) => ping(w, 'PC1', '10.10.20.10') && ping(w, 'PC2', '10.10.10.10');
  add({
    id: 'q1-0112', domain: '2.0', obj: '2.1', type: 'sim', difficulty: 3,
    stem: `HPL-CORE3 is a new multilayer switch. Its users in VLAN 10 (10.20.10.0/24) and VLAN 20 (10.20.20.0/24) use .1 as their gateway, but no SVIs exist yet.`,
    sim: {
      world: {
        devices: {
          SW1: { kind: 'switch', hostname: 'HPL-CORE3', multilayer: true, mac: '0c33.0000.0001', interfaces: { 'GigabitEthernet1/0/1': { accessVlan: 10, modeSet: true }, 'GigabitEthernet1/0/2': { accessVlan: 20, modeSet: true }, 'GigabitEthernet1/0/3': {}, 'GigabitEthernet1/0/4': {} }, vlans: { 1: 'default', 10: 'OFFICE', 20: 'DISPATCH' } },
          PC1: pc('OFFICE-PC', '10.20.10.10', '255.255.255.0', '10.20.10.1'),
          PC2: pc('DISPATCH-PC', '10.20.20.10', '255.255.255.0', '10.20.20.1'),
        },
        links: [['PC1', 'NIC', 'SW1', 'GigabitEthernet1/0/1'], ['PC2', 'NIC', 'SW1', 'GigabitEthernet1/0/2']],
      },
      start: 'SW1',
      tasks: ['Create SVIs for VLAN 10 and VLAN 20 with the gateway addresses 10.20.10.1/24 and 10.20.20.1/24.', 'Make sure the switch routes between them so OFFICE-PC can ping DISPATCH-PC.'],
      check: 'q1-svi',
      solution: { SW1: ['enable', 'configure terminal', 'ip routing', 'interface vlan 10', 'ip address 10.20.10.1 255.255.255.0', 'no shutdown', 'interface vlan 20', 'ip address 10.20.20.1 255.255.255.0', 'no shutdown', 'end'] },
    },
    explanation: `Three things make SVI routing work: ip routing in global configuration, an interface vlan N with the gateway address for each VLAN, and no shutdown on each SVI (SVIs other than VLAN 1 are typically created shut down on many platforms, so it is a good habit). The VLANs already exist and each has an active access port, so the SVIs come up/up. Verify with show ip interface brief and show ip route, which should list both 10.20.10.0/24 and 10.20.20.0/24 as connected. Forgetting ip routing is the classic mistake: everything looks configured, each PC can ping its own gateway, and nothing crosses between VLANs.`,
    ref: 'l2-1 card:vlan',
  });
  TT.simChecks['q1-svi'] = (w) => ping(w, 'PC1', '10.20.20.10') && ping(w, 'PC2', '10.20.10.10');
  add({
    id: 'q1-0113', domain: '2.0', obj: '2.1', type: 'single', difficulty: 2,
    stem: `PC-A (VLAN 10) and PC-B (VLAN 20) are on the same switch. Both have correct addresses and gateways, and no router or Layer 3 switch is configured for either VLAN. What happens when PC-A pings PC-B?`,
    options: ['The ping succeeds because both PCs are on the same physical switch', 'The ping fails because traffic between VLANs needs a Layer 3 device to route it', 'The ping succeeds only if both ports are trunks', 'The ping succeeds but with high latency, because the switch floods the frames to both VLANs'],
    answer: 1,
    explanation: `Each VLAN is its own broadcast domain and, in a normal design, its own IP subnet. PC-A sees that PC-B is in another subnet and sends the packet to its default gateway. With no router subinterface or SVI to act as that gateway, ARP for the gateway goes unanswered and the ping fails. Being on the same physical switch does not matter; a switch never forwards a frame from one VLAN into another. Making the PC ports trunks would not route anything, and PCs normally do not tag frames anyway. Flooding stays inside one VLAN.`,
    ref: 'l2-1 card:vlan',
  });
  add({
    id: 'q1-0114', domain: '2.0', obj: '2.1', type: 'single', difficulty: 2,
    stem: `A security audit finds that HPL-ACC7's management address is on interface Vlan1, and unused ports are left in VLAN 1. Which change best follows common VLAN security practice?`,
    options: ['Delete VLAN 1 from the switch so no port can fall back to it', 'Move management to a dedicated VLAN; put unused ports in an unused VLAN and shut them down', 'Convert all unused ports to static trunks with nonegotiate so that end hosts cannot use them', 'Rename VLAN 1 to MGMT'],
    answer: 1,
    explanation: `VLAN 1 is the default for every port and carries many control protocols, so leaving users, management and unused ports in it widens the attack surface. Best practice is a dedicated management VLAN (for example interface Vlan99 with access limited by ACLs), unused ports assigned to an unused "parking" VLAN and administratively shut down, and VLAN 1 pruned from trunks where possible. VLAN 1 cannot be deleted or renamed. Turning unused ports into trunks is the opposite of secure: anyone who plugs in could access every VLAN.`,
    ref: 'l2-1 l5-7 card:vlan card:secfund',
  });

  /* ---- 2.2 trunking -------------------------------------------------- */
  add({
    id: 'q1-0115', domain: '2.0', obj: '2.2', type: 'sim', difficulty: 2,
    stem: `HPL-ACC8 and HPL-ACC9 are connected on Gi0/1. Office (VLAN 10) and dispatch (VLAN 20) users on both switches must reach each other across the link. Guest VLAN 30 exists on both switches but must not cross between them.`,
    sim: {
      world: {
        devices: {
          SW1: sw('HPL-ACC8', 4, { 'FastEthernet0/1': { accessVlan: 10, modeSet: true }, 'FastEthernet0/2': { accessVlan: 20, modeSet: true }, 'FastEthernet0/3': { accessVlan: 30, modeSet: true } }, { 1: 'default', 10: 'OFFICE', 20: 'DISPATCH', 30: 'GUEST' }),
          SW2: sw('HPL-ACC9', 4, { 'FastEthernet0/1': { accessVlan: 10, modeSet: true }, 'FastEthernet0/2': { accessVlan: 20, modeSet: true }, 'FastEthernet0/3': { accessVlan: 30, modeSet: true } }, { 1: 'default', 10: 'OFFICE', 20: 'DISPATCH', 30: 'GUEST' }),
          A1: pc('OFFICE-1', '10.0.10.11', '255.255.255.0', ''),
          B1: pc('DISPATCH-1', '10.0.20.11', '255.255.255.0', ''),
          C1: pc('GUEST-1', '10.0.30.11', '255.255.255.0', ''),
          A2: pc('OFFICE-2', '10.0.10.12', '255.255.255.0', ''),
          B2: pc('DISPATCH-2', '10.0.20.12', '255.255.255.0', ''),
          C2: pc('GUEST-2', '10.0.30.12', '255.255.255.0', ''),
        },
        links: [['SW1', 'GigabitEthernet0/1', 'SW2', 'GigabitEthernet0/1'], ['A1', 'NIC', 'SW1', 'FastEthernet0/1'], ['B1', 'NIC', 'SW1', 'FastEthernet0/2'], ['C1', 'NIC', 'SW1', 'FastEthernet0/3'], ['A2', 'NIC', 'SW2', 'FastEthernet0/1'], ['B2', 'NIC', 'SW2', 'FastEthernet0/2'], ['C2', 'NIC', 'SW2', 'FastEthernet0/3']],
      },
      start: 'SW1',
      tasks: ['Make Gi0/1 a static 802.1Q trunk on both HPL-ACC8 and HPL-ACC9.', 'Allow only VLANs 10 and 20 on the trunk, on both ends.'],
      check: 'q1-trunk',
      solution: {
        SW1: ['enable', 'configure terminal', 'interface g0/1', 'switchport mode trunk', 'switchport trunk allowed vlan 10,20', 'end'],
        SW2: ['enable', 'configure terminal', 'interface g0/1', 'switchport mode trunk', 'switchport trunk allowed vlan 10,20', 'end'],
      },
    },
    explanation: `On each switch: interface g0/1, switchport mode trunk, switchport trunk allowed vlan 10,20. A static trunk on both ends avoids depending on DTP negotiation. The allowed list replaces the default "all", so VLAN 30 frames are not sent across, and guest users on the two switches stay isolated. Configure both ends the same way; a mismatched allowed list leads to one-way or missing VLANs that are hard to spot. Verify with show interfaces trunk: the "Vlans allowed on trunk" line should read 10,20 and "Vlans in spanning tree forwarding state and not pruned" should include both. Remember that a later switchport trunk allowed vlan 40 would replace the list; use add to extend it.`,
    ref: 'l2-2 card:trunk',
  });
  TT.simChecks['q1-trunk'] = (w) => {
    const a = ifc(w, 'SW1', 'GigabitEthernet0/1'), b = ifc(w, 'SW2', 'GigabitEthernet0/1');
    return a.mode === 'trunk' && b.mode === 'trunk' && sameList(a.trunkAllowed, [10, 20]) && sameList(b.trunkAllowed, [10, 20]) && ping(w, 'A1', '10.0.10.12') && ping(w, 'B1', '10.0.20.12') && !ping(w, 'C1', '10.0.30.12');
  };
  add({
    id: 'q1-0116', domain: '2.0', obj: '2.2', type: 'single', difficulty: 2,
    stem: `Where does 802.1Q place its VLAN tag in an Ethernet frame, and how large is the tag?`,
    options: ['Before the destination MAC address, after the preamble; 26 bytes', 'Between the source MAC address and the EtherType/Length field; 4 bytes', 'After the payload, before the FCS; 4 bytes', 'It encapsulates the whole original frame in a new header and trailer; 30 bytes'],
    answer: 1,
    explanation: `802.1Q inserts a 4-byte tag after the source MAC address and before the EtherType/Length field. The tag holds a 2-byte TPID (0x8100, which identifies the frame as tagged), 3 bits of priority (PCP, used for CoS), 1 DEI bit and a 12-bit VLAN ID, giving 4,094 usable VLANs. Because the frame changes, the FCS is recalculated. Encapsulating the whole frame in a new 26-byte header plus a 4-byte trailer (30 bytes in total) describes ISL, Cisco's legacy proprietary trunking protocol, which modern switches no longer support.`,
    ref: 'l2-2 card:trunk',
  });
  add({
    id: 'q1-0117', domain: '2.0', obj: '2.2', type: 'multi', difficulty: 2, pick: 2,
    stem: `Which two statements about the native VLAN on an 802.1Q trunk are true? (Choose two.)`,
    options: ['Frames in the native VLAN are sent untagged', 'Untagged frames received on the trunk are placed in the native VLAN', 'The native VLAN must always be VLAN 1', 'Frames in the native VLAN carry a tag with VLAN ID 0', 'Each end of the trunk may use a different native VLAN without any effect'],
    answer: [0, 1],
    explanation: `802.1Q leaves frames in the native VLAN untagged, and any untagged frame arriving on a trunk is assigned to the native VLAN. That is why both ends must agree: if one side uses native VLAN 1 and the other 99, untagged traffic silently crosses from VLAN 1 into VLAN 99, and CDP reports a native VLAN mismatch. The native VLAN defaults to 1 but can be changed with switchport trunk native vlan, and changing it to an unused VLAN is a security best practice. A VLAN ID of 0 indicates a priority-tagged frame (802.1p), which is different from native VLAN handling.`,
    ref: 'l2-2 card:trunk',
  });
  add({
    id: 'q1-0118', domain: '2.0', obj: '2.2', type: 'single', difficulty: 3,
    stem: `Harbor Point's standard is native VLAN 99 on every trunk. This message keeps appearing on HPL-DIST1. What is the best fix?`,
    exhibit: { kind: 'cli', title: 'HPL-DIST1', lines: [
      '%CDP-4-NATIVE_VLAN_MISMATCH: Native VLAN mismatch discovered on GigabitEthernet0/1 (99), with HPL-ACC2 GigabitEthernet0/24 (1).',
      '',
      'HPL-DIST1# show interfaces trunk',
      'Port        Mode             Encapsulation  Status        Native vlan',
      'Gi0/1       on               802.1q         trunking      99',
    ] },
    options: ['On HPL-DIST1, enter switchport trunk native vlan 1 on Gi0/1', 'On HPL-ACC2, enter switchport trunk native vlan 99 on Gi0/24', 'Disable CDP so the message stops', 'Change both ports to access mode'],
    answer: 1,
    explanation: `The log, generated by CDP, says HPL-DIST1 Gi0/1 uses native VLAN 99 while HPL-ACC2 Gi0/24 uses native VLAN 1. The trunk still forms, but untagged frames sent by one side are placed in a different VLAN by the other, leaking traffic between VLAN 1 and VLAN 99. Harbor Point's standard is native VLAN 99 (an unused native VLAN is the best practice), so fix the access switch to match. Setting DIST1 back to VLAN 1 would also make the ends match, but it undoes the security improvement. Disabling CDP hides the symptom and leaves the leak. Access mode would break the trunk and every VLAN on it.`,
    ref: 'l2-2 l2-3 card:trunk card:cdp',
  });
  add({
    id: 'q1-0119', domain: '2.0', obj: '2.2', type: 'single', difficulty: 3,
    stem: `VLAN 20 users on HPL-ACC5 cannot reach VLAN 20 users on other switches, while VLAN 10 works. Review the output. What is the cause?`,
    exhibit: { kind: 'cli', title: 'HPL-ACC5', lines: [
      'HPL-ACC5# show interfaces trunk',
      '',
      'Port        Mode             Encapsulation  Status        Native vlan',
      'Gi0/1       on               802.1q         trunking      1',
      '',
      'Port        Vlans allowed on trunk',
      'Gi0/1       1,10,20',
      '',
      'Port        Vlans allowed and active in management domain',
      'Gi0/1       1,10',
      '',
      'Port        Vlans in spanning tree forwarding state and not pruned',
      'Gi0/1       1,10',
    ] },
    options: ['VLAN 20 is not in the allowed list', 'VLAN 20 does not exist in HPL-ACC5\'s VLAN database', 'Spanning tree is blocking VLAN 20 because of a loop', 'The native VLAN must be 20'],
    answer: 1,
    explanation: `Read the three lists in order. VLAN 20 is in "Vlans allowed on trunk," so the allowed list is fine. It is missing from "Vlans allowed and active in management domain," which lists allowed VLANs that actually exist on this switch. A VLAN that is not in the local VLAN database is not active, so it cannot be forwarded, and it cannot appear in the STP forwarding list either. Create it with vlan 20. If STP were blocking, VLAN 20 would be in the active list but missing from the forwarding list. The native VLAN is unrelated to whether VLAN 20 crosses the trunk.`,
    ref: 'l2-2 card:trunk',
  });
  add({
    id: 'q1-0120', domain: '2.0', obj: '2.2', type: 'single', difficulty: 3,
    stem: `The trunk Gi0/1 currently allows VLANs 10 and 20. An engineer needs to add VLAN 30 and types the commands below. What is the result?`,
    exhibit: { kind: 'cli', title: 'HPL-ACC3', lines: [
      'HPL-ACC3(config)# interface GigabitEthernet0/1',
      'HPL-ACC3(config-if)# switchport trunk allowed vlan 30',
    ] },
    options: ['VLANs 10, 20 and 30 are allowed', 'Only VLAN 30 is allowed; VLANs 10 and 20 are removed from the trunk', 'The command is rejected because VLANs 10 and 20 are already allowed', 'All VLANs are allowed'],
    answer: 1,
    explanation: `switchport trunk allowed vlan with a plain list replaces the existing list. After this command only VLAN 30 crosses the trunk, and every VLAN 10 and 20 user on the far side loses connectivity, a classic change-window outage. To extend the list, use switchport trunk allowed vlan add 30. The other keywords are remove (take VLANs out), except (allow all but the listed ones), all and none. IOS does not reject the command, because replacing the list is a valid action. Always check show interfaces trunk after editing a trunk.`,
    ref: 'l2-2 card:trunk',
  });
  add({
    id: 'q1-0121', domain: '2.0', obj: '2.2', type: 'match', difficulty: 3,
    stem: `Two Catalyst switches support DTP. Match each pair of administrative modes on the two ends of a link to the operational result.`,
    options: ['dynamic auto + dynamic auto', 'dynamic desirable + dynamic auto', 'trunk + dynamic auto', 'access + dynamic desirable', 'dynamic desirable + dynamic desirable'],
    targets: ['Trunk', 'Access'],
    answer: [[0, 1], [1, 0], [2, 0], [3, 1], [4, 0]],
    explanation: `DTP needs at least one side to actively ask for a trunk. dynamic desirable actively tries to form a trunk; dynamic auto only agrees if the other side asks; trunk mode is a static trunk that also sends DTP frames saying "I am a trunk." So auto with auto is two passive sides, and both end up as access ports, a very common trap. Desirable with auto, desirable with desirable, and trunk with auto all form trunks. An access port never trunks, so access with desirable stays access. Best practice is to avoid DTP entirely: hard-code switchport mode trunk or switchport mode access, and add switchport nonegotiate on trunks.`,
    ref: 'l2-2 card:dtpvtp',
  });
  add({
    id: 'q1-0122', domain: '2.0', obj: '2.2', type: 'multi', difficulty: 2, pick: 2,
    stem: `Which two practices reduce the risk of VLAN hopping attacks on Harbor Point's switches? (Choose two.)`,
    options: ['Set the native VLAN on trunks to an unused VLAN that carries no user traffic', 'Disable DTP by hard-coding access ports with switchport mode access and using switchport nonegotiate on trunks', 'Leave all ports in dynamic desirable mode so that trunks form automatically between switches', 'Use VLAN 1 for all management and user traffic so every trunk carries one native VLAN', 'Enable PortFast on every trunk'],
    answer: [0, 1],
    explanation: `There are two VLAN hopping techniques. In switch spoofing, an attacker's device speaks DTP and negotiates a trunk, gaining access to every VLAN; hard-coding access ports and disabling negotiation stops it. In double tagging, the attacker sends a frame with two 802.1Q tags, the outer one matching the native VLAN; the first switch strips it and forwards the inner tag across a trunk. Moving the native VLAN to an unused VLAN, which no attacker port belongs to, defeats that. Dynamic desirable everywhere invites switch spoofing. Putting everything in VLAN 1 makes double tagging easier. PortFast on trunks is not a security control and risks loops.`,
    ref: 'l2-2 l5-7 card:trunk card:dtpvtp',
  });
  add({
    id: 'q1-0123', domain: '2.0', obj: '2.2', type: 'single', difficulty: 1,
    stem: `Which command shows each trunk port's mode, encapsulation, native VLAN and the VLANs allowed and forwarding on it?`,
    options: ['show vlan brief', 'show interfaces trunk', 'show spanning-tree summary', 'show cdp neighbors'],
    answer: 1,
    explanation: `show interfaces trunk is the main trunk verification command. Its first section lists each trunk with mode (on, desirable, auto), encapsulation, status and native VLAN, followed by the allowed VLANs, the allowed VLANs that exist and are active, and the VLANs in STP forwarding state and not pruned. show vlan brief does not list trunk ports at all. show spanning-tree summary shows STP mode and port state counts. show cdp neighbors identifies neighbors but says nothing about which VLANs a trunk carries.`,
    ref: 'l2-2 card:trunk',
  });
  add({
    id: 'q1-0124', domain: '2.0', obj: '2.2', type: 'single', difficulty: 3,
    stem: `On an older Catalyst 3560 that supports both ISL and 802.1Q, an engineer enters switchport mode trunk on Gi0/1 and sees the message below. What must be done first?`,
    exhibit: { kind: 'cli', title: 'HPL-OLD1', lines: [
      'HPL-OLD1(config)# interface GigabitEthernet0/1',
      'HPL-OLD1(config-if)# switchport mode trunk',
      'Command rejected: An interface whose trunk encapsulation is "Auto" can not be configured to "trunk" mode.',
    ] },
    options: ['Enter switchport nonegotiate', 'Enter switchport trunk encapsulation dot1q', 'Enter no shutdown', 'Create VLAN 1'],
    answer: 1,
    explanation: `Switches that support both ISL and 802.1Q default to negotiating the encapsulation. A static trunk needs a fixed encapsulation, so set it with switchport trunk encapsulation dot1q, then switchport mode trunk will be accepted. Switches that support only 802.1Q (such as the 2960 family and most modern Catalyst models) do not have or need this command. switchport nonegotiate disables DTP, but it is only accepted once the port is already a static trunk or access port. The port's shutdown state does not affect configuration, and VLAN 1 always exists.`,
    ref: 'l2-2 card:trunk',
  });
  add({
    id: 'q1-0125', domain: '2.0', obj: '2.2', type: 'single', difficulty: 2,
    stem: `HPL-ACC1 Gi0/2 connects to HPL-ACC2 Gi0/2, but the link is not trunking. Both ports were left at their defaults. Review the output. Why?`,
    exhibit: { kind: 'cli', title: 'HPL-ACC1 and HPL-ACC2', lines: [
      'HPL-ACC1# show interfaces GigabitEthernet0/2 switchport | include Mode|Negotiation',
      'Administrative Mode: dynamic auto',
      'Operational Mode: static access',
      'Negotiation of Trunking: On',
      'Access Mode VLAN: 1 (default)',
      'Trunking Native Mode VLAN: 1 (default)',
      '',
      'HPL-ACC2# show interfaces GigabitEthernet0/2 switchport | include Mode|Negotiation',
      'Administrative Mode: dynamic auto',
      'Operational Mode: static access',
      'Negotiation of Trunking: On',
      'Access Mode VLAN: 1 (default)',
      'Trunking Native Mode VLAN: 1 (default)',
    ] },
    options: ['DTP is disabled on both ports with switchport nonegotiate', 'Both ports are dynamic auto, so neither side initiates trunk negotiation', 'The native VLANs do not match, so DTP refuses to bring the trunk up between them', 'The ports are err-disabled after a DTP negotiation failure'],
    answer: 1,
    explanation: `The default administrative mode on many Catalyst access switches is dynamic auto, which will become a trunk only if the neighbor actively asks. With both ends in dynamic auto, nobody asks, so both settle into access mode, as "Operational Mode: static access" shows. Negotiation of Trunking: On means DTP is running, not disabled. A native VLAN mismatch would not stop the trunk forming and would show as a CDP log. Err-disabled ports are down, while these have a working operational mode. Fix with switchport mode trunk on at least one side, preferably both.`,
    ref: 'l2-2 card:dtpvtp',
  });
  add({
    id: 'q1-0126', domain: '2.0', obj: '2.2', type: 'single', difficulty: 1,
    stem: `Which trunking protocol is the IEEE open standard that Harbor Point's mixed-vendor switches will use?`,
    options: ['ISL', '802.1Q', '802.1D', '802.3ad'],
    answer: 1,
    explanation: `IEEE 802.1Q is the open standard for VLAN tagging on trunks and is supported by every vendor. ISL was Cisco's proprietary encapsulation and is obsolete. 802.1D is the original Spanning Tree Protocol standard. 802.3ad is the original LACP link aggregation standard (now maintained as 802.1AX). Knowing which numbers belong to which technology is a frequent exam check: 802.1Q trunking, 802.1D STP, 802.1w RSTP, 802.1AB LLDP, 802.1X port-based authentication, 802.3af/at/bt PoE.`,
    ref: 'l2-2 card:trunk',
  });

  /* ---- 2.3 CDP and LLDP ---------------------------------------------- */
  add({
    id: 'q1-0127', domain: '2.0', obj: '2.3', type: 'sim', difficulty: 2,
    stem: `HPL-ACC10's Gi0/1 connects to a third-party PoE switch that does not speak CDP, and Gi0/2 connects to the ISP's handoff router. The NOC wants to discover the third-party switch from HPL-ACC10, and stop sending discovery information toward the ISP.`,
    sim: {
      world: {
        devices: {
          SW1: sw('HPL-ACC10', 4, { 'GigabitEthernet0/1': { mode: 'trunk' } }, null, { mac: '0c10.aa00.0001' }),
          X1: { kind: 'switch', hostname: 'YARD-POE-SW', vendor: 'other', locked: true, platform: 'ArubaOS-CX 6100', interfaces: { 'GigabitEthernet1/1/1': {}, 'GigabitEthernet1/1/2': {} }, vlans: { 1: 'default' } },
          ISP: { kind: 'router', hostname: 'ISP-HANDOFF', locked: true, interfaces: { 'GigabitEthernet0/0/0': { ip: '198.51.100.1', mask: '255.255.255.252', shutdown: false } } },
        },
        links: [['SW1', 'GigabitEthernet0/1', 'X1', 'GigabitEthernet1/1/1'], ['SW1', 'GigabitEthernet0/2', 'ISP', 'GigabitEthernet0/0/0']],
      },
      start: 'SW1',
      tasks: ['Enable LLDP on HPL-ACC10 so show lldp neighbors lists the third-party switch.', 'Stop CDP on Gi0/2 (toward the ISP) only. CDP must stay enabled globally.'],
      check: 'q1-lldp',
      solution: { SW1: ['enable', 'configure terminal', 'lldp run', 'interface g0/2', 'no cdp enable', 'end'] },
    },
    explanation: `CDP is Cisco proprietary and is on by default; LLDP (IEEE 802.1AB) is the vendor-neutral equivalent and is off by default on Catalyst IOS. lldp run in global configuration turns it on for all interfaces, and after its first advertisement interval the third-party switch appears in show lldp neighbors. For the ISP link, no cdp enable on that interface stops CDP there while leaving it running everywhere else; no cdp run would disable CDP on the whole switch, which the task forbids. Since LLDP is now on globally, a careful engineer would also enter no lldp transmit on Gi0/2 so LLDP does not leak information to the ISP either. Discovery protocols reveal model, IOS version and addresses, which is useful to an attacker.`,
    ref: 'l2-3 card:cdp',
  });
  TT.simChecks['q1-lldp'] = (w) => {
    const d = w.devices.SW1;
    const n = TT.net.discNeighbors(w, 'SW1', 'lldp') || [];
    return !!d.lldp && n.some((x) => x.dev.id === 'X1') && !!ifc(w, 'SW1', 'GigabitEthernet0/2').cdpOff && d.cdp !== false;
  };
  add({
    id: 'q1-0128', domain: '2.0', obj: '2.3', type: 'single', difficulty: 2,
    stem: `What are the default advertisement interval and holdtime for CDP and LLDP on Cisco IOS?`,
    options: ['CDP 60 s / 180 s; LLDP 30 s / 120 s', 'CDP 30 s / 120 s; LLDP 60 s / 180 s', 'Both 60 s / 180 s', 'CDP 10 s / 40 s; LLDP 5 s / 20 s'],
    answer: 0,
    explanation: `CDP sends advertisements every 60 seconds and neighbors keep the information for a 180-second holdtime before discarding it (cdp timer and cdp holdtime change them). LLDP defaults to a 30-second interval and a 120-second holdtime (lldp timer and lldp holdtime), plus a 2-second initialization delay (lldp reinit). The Holdtme column in show cdp neighbors counts down from 180 and resets when a new advertisement arrives. 10 and 40 seconds are OSPF's default hello and dead timers on broadcast links, an easy mix-up.`,
    ref: 'l2-3 card:cdp',
  });
  add({
    id: 'q1-0129', domain: '2.0', obj: '2.3', type: 'single', difficulty: 3,
    stem: `You need to SSH to the device connected to HPL-DIST1's Gi0/2, but nobody documented its address. Based on the output, which address should you use?`,
    exhibit: { kind: 'cli', title: 'HPL-DIST1', lines: [
      'HPL-DIST1# show cdp neighbors detail',
      '-------------------------',
      'Device ID: HPL-ACC4.hpl.local',
      'Entry address(es):',
      '  IP address: 10.99.0.14',
      'Platform: cisco WS-C2960X-48FPS-L,  Capabilities: Switch IGMP',
      'Interface: GigabitEthernet0/1,  Port ID (outgoing port): GigabitEthernet1/0/49',
      'Holdtime : 151 sec',
      '',
      'Version :',
      'Cisco IOS Software, C2960X Software (C2960X-UNIVERSALK9-M), Version 15.2(7)E8, RELEASE SOFTWARE (fc3)',
      '',
      'Native VLAN: 99',
      'Duplex: full',
      'Management address(es):',
      '  IP address: 10.99.0.14',
      '-------------------------',
      'Device ID: HPL-ACC5.hpl.local',
      'Entry address(es):',
      '  IP address: 10.99.0.15',
      'Platform: cisco WS-C2960X-24PS-L,  Capabilities: Switch IGMP',
      'Interface: GigabitEthernet0/2,  Port ID (outgoing port): GigabitEthernet1/0/50',
      'Holdtime : 167 sec',
      '',
      'Native VLAN: 99',
      'Duplex: full',
      'Management address(es):',
      '  IP address: 10.99.0.15',
    ] },
    options: ['10.99.0.14', '10.99.0.15', 'The address cannot be learned from CDP', '10.99.0.50'],
    answer: 1,
    explanation: `In show cdp neighbors detail, "Interface" is the local port on HPL-DIST1 and "Port ID (outgoing port)" is the neighbor's port. The entry whose Interface is GigabitEthernet0/2 is HPL-ACC5, with management address 10.99.0.15. 10.99.0.14 belongs to HPL-ACC4, which is on local Gi0/1; picking it comes from reading the entries in order instead of matching the local interface. CDP detail does provide Layer 3 addresses, platform, IOS version, native VLAN and duplex, which makes it a powerful mapping tool and also a reason to disable it on untrusted ports. 10.99.0.50 is a made-up value echoing the neighbor's port number.`,
    ref: 'l2-3 card:cdp',
  });
  add({
    id: 'q1-0130', domain: '2.0', obj: '2.3', type: 'multi', difficulty: 2, pick: 2,
    stem: `HPL-EDGE1's Gi0/0 faces the internet. You must stop CDP and LLDP advertisements from being sent out that interface only, while leaving both protocols running on all other interfaces. Which two interface commands do this? (Choose two.)`,
    options: ['no cdp enable', 'no cdp run', 'no lldp transmit', 'no lldp run', 'no cdp advertise-v2'],
    answer: [0, 2],
    explanation: `no cdp enable in interface configuration stops CDP on just that interface. no lldp transmit stops LLDP advertisements from being sent out the interface (no lldp receive would also stop it from processing incoming ones). no cdp run and no lldp run are global commands that disable the protocols everywhere, which fails the requirement. no cdp advertise-v2 is a global command that falls back to CDP version 1 advertisements; it does not stop CDP.`,
    ref: 'l2-3 card:cdp',
  });
  add({
    id: 'q1-0131', domain: '2.0', obj: '2.3', type: 'single', difficulty: 3,
    stem: `Based on the output, which statement is true?`,
    exhibit: { kind: 'cli', title: 'HPL-ACC2', lines: [
      'HPL-ACC2# show cdp neighbors',
      'Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge',
      '                  S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone,',
      '                  D - Remote, C - CVTA, M - Two-port Mac Relay',
      '',
      'Device ID        Local Intrfce     Holdtme    Capability  Platform  Port ID',
      'HPL-CORE1        Gig 0/1           163             R S I  C9300-48P Gig 1/0/24',
      'HPL-CORE2        Gig 0/2           141             R S I  C9300-48P Gig 1/0/24',
      'SEP00A3D1442B10  Fas 0/5           129              H P   IP Phone  Port 1',
      '',
      'Total cdp entries displayed : 3',
    ] },
    options: ['HPL-ACC2\'s Gi1/0/24 connects to HPL-CORE1\'s Gi0/1', 'HPL-ACC2\'s Gi0/2 connects to HPL-CORE2\'s Gi1/0/24', 'Both core switches are connected to HPL-ACC2\'s Gi1/0/24', 'The IP phone is connected to HPL-ACC2 port Port 1'],
    answer: 1,
    explanation: `Local Intrfce is the port on the switch where you ran the command; Port ID is the neighbor's port. So HPL-ACC2 Gi0/2 connects to HPL-CORE2 Gi1/0/24, and HPL-ACC2 Gi0/1 connects to HPL-CORE1 Gi1/0/24 (both cores happen to use the same port number). The first option reverses local and remote. HPL-ACC2 does not have a Gi1/0/24 at all. The phone is on HPL-ACC2's Fa0/5; "Port 1" is the phone's own network port. The R S I capabilities show the cores are multilayer switches (router, switch, IGMP).`,
    ref: 'l2-3 card:cdp',
  });
  add({
    id: 'q1-0132', domain: '2.0', obj: '2.3', type: 'single', difficulty: 2,
    stem: `On a new Catalyst switch, show lldp neighbors returns the message below. What should you do?`,
    exhibit: { kind: 'cli', title: 'HPL-ACC11', lines: ['HPL-ACC11# show lldp neighbors', '% LLDP is not enabled'] },
    options: ['Enter lldp run in global configuration mode', 'Enter lldp enable on each interface', 'Enter cdp run, because LLDP depends on CDP', 'Upgrade IOS, because LLDP is not supported on Catalyst switches'],
    answer: 0,
    explanation: `LLDP is disabled by default on Catalyst IOS. lldp run in global configuration enables it on all supported interfaces, which then transmit and receive by default (control per interface with lldp transmit and lldp receive). There is no lldp enable interface command in IOS. LLDP and CDP are independent protocols and can run side by side. Catalyst switches have supported LLDP for many years.`,
    ref: 'l2-3 card:cdp',
  });
  add({
    id: 'q1-0133', domain: '2.0', obj: '2.3', type: 'single', difficulty: 1,
    stem: `Which statement correctly compares CDP and LLDP?`,
    options: ['CDP is an IEEE standard; LLDP is Cisco proprietary', 'CDP is Cisco proprietary; LLDP is the IEEE 802.1AB standard', 'Both are Layer 3 protocols that require IP addresses', 'LLDP is enabled by default on Cisco IOS devices and CDP is not'],
    answer: 1,
    explanation: `CDP (Cisco Discovery Protocol) is Cisco proprietary and enabled by default on Cisco devices. LLDP (Link Layer Discovery Protocol) is the IEEE 802.1AB standard, used to discover neighbors from any vendor, and is disabled by default on Cisco IOS. Both are Layer 2 protocols: they send multicast frames directly to the neighbor and work even when no IP addresses are configured, which makes them useful for mapping a network before Layer 3 is working. Neither is forwarded by switches; they only reach directly connected neighbors.`,
    ref: 'l2-3 card:cdp',
  });

  /* ---- 2.4 EtherChannel ---------------------------------------------- */
  add({
    id: 'q1-0134', domain: '2.0', obj: '2.4', type: 'sim', difficulty: 2,
    stem: `HPL-DIST3 and HPL-DIST4 are connected by Gi0/1 and Gi0/2, both static trunks. STP is blocking one link. Bundle the links so both carry traffic.`,
    sim: {
      world: {
        devices: {
          SW1: sw('HPL-DIST3', 2, { 'GigabitEthernet0/1': { mode: 'trunk' }, 'GigabitEthernet0/2': { mode: 'trunk' }, 'FastEthernet0/1': { accessVlan: 10, modeSet: true } }, { 1: 'default', 10: 'OFFICE' }, { mac: '0c31.0000.0001' }),
          SW2: sw('HPL-DIST4', 2, { 'GigabitEthernet0/1': { mode: 'trunk' }, 'GigabitEthernet0/2': { mode: 'trunk' }, 'FastEthernet0/1': { accessVlan: 10, modeSet: true } }, { 1: 'default', 10: 'OFFICE' }, { mac: '0c32.0000.0001' }),
          PC1: pc('OFFICE-PC1', '10.1.10.11', '255.255.255.0', ''),
          PC2: pc('OFFICE-PC2', '10.1.10.12', '255.255.255.0', ''),
        },
        links: [['SW1', 'GigabitEthernet0/1', 'SW2', 'GigabitEthernet0/1'], ['SW1', 'GigabitEthernet0/2', 'SW2', 'GigabitEthernet0/2'], ['PC1', 'NIC', 'SW1', 'FastEthernet0/1'], ['PC2', 'NIC', 'SW2', 'FastEthernet0/1']],
      },
      start: 'SW1',
      tasks: ['Bundle Gi0/1 and Gi0/2 into Port-channel 1 on both switches.', 'Use LACP (the IEEE standard). Do not use mode on.', 'Both member links must show (P) bundled on both switches.'],
      check: 'q1-lacp',
      solution: {
        SW1: ['enable', 'configure terminal', 'interface range g0/1 - 2', 'channel-group 1 mode active', 'end'],
        SW2: ['enable', 'configure terminal', 'interface range g0/1 - 2', 'channel-group 1 mode active', 'end'],
      },
    },
    explanation: `Configure both member ports together with interface range g0/1 - 2 so their settings match, then channel-group 1 mode active. Use active on at least one side; active with active or active with passive both negotiate LACP, while passive with passive never forms a bundle because neither side starts the negotiation. The switch creates interface Port-channel1 automatically and copies the members' Layer 2 settings to it. Verify with show etherchannel summary: Po1(SU) means Layer 2 and in use, and each member should show (P) for bundled. STP then sees one logical link, so nothing is blocked and traffic is load-shared across both members per flow.`,
    ref: 'l2-4 card:etherchannel',
  });
  TT.simChecks['q1-lacp'] = (w) => ['SW1', 'SW2'].every((id) => {
    const g = TT.net.computeEc(w, id)[1];
    return !!g && g.up && g.proto === 'LACP' && Object.keys(g.members).length === 2 && Object.values(g.members).every((f) => f === 'P');
  });
  add({
    id: 'q1-0135', domain: '2.0', obj: '2.4', type: 'multi', difficulty: 2, pick: 2,
    stem: `Which two channel-group mode combinations on the two ends of a link successfully form an LACP EtherChannel? (Choose two.)`,
    options: ['active / active', 'passive / passive', 'active / passive', 'active / desirable', 'on / active'],
    answer: [0, 2],
    explanation: `LACP has two negotiating modes. Active sends LACP PDUs to start negotiation; passive only responds. A bundle forms when at least one side is active: active with active, or active with passive. Passive with passive waits forever. Desirable is a PAgP mode, and LACP and PAgP do not interoperate. Mode on forces a static channel without any negotiation protocol, so it only works with on at the other end; on with active leaves the LACP side waiting for PDUs that never come.`,
    ref: 'l2-4 card:etherchannel',
  });
  add({
    id: 'q1-0136', domain: '2.0', obj: '2.4', type: 'match', difficulty: 2,
    stem: `Match each channel-group mode to the protocol it uses.`,
    options: ['active', 'passive', 'desirable', 'auto', 'on'],
    targets: ['LACP', 'PAgP', 'No negotiation protocol (static)'],
    answer: [[0, 0], [1, 0], [2, 1], [3, 1], [4, 2]],
    explanation: `active and passive are LACP (IEEE 802.3ad, now 802.1AX) modes. desirable and auto are PAgP, Cisco's proprietary protocol. In both pairs the first actively initiates and the second only responds, so one side must be active or desirable. on creates a static EtherChannel with no protocol at all, which means no checks that the other side agrees; misconfiguration can cause loops or err-disabled ports, so a negotiated mode is preferred. A handy memory aid: LACP modes are about being active, PAgP modes are about desire.`,
    ref: 'l2-4 card:etherchannel',
  });
  add({
    id: 'q1-0137', domain: '2.0', obj: '2.4', type: 'single', difficulty: 3,
    stem: `The uplink bundle between HPL-ACC6 and the distribution switch is running at half its expected bandwidth. Review the output. What is the most likely cause?`,
    exhibit: { kind: 'cli', title: 'HPL-ACC6', lines: [
      'HPL-ACC6# show etherchannel summary',
      'Flags:  D - down        P - bundled in port-channel',
      '        I - stand-alone s - suspended',
      '        H - Hot-standby (LACP only)',
      '        R - Layer3      S - Layer2',
      '        U - in use      f - failed to allocate aggregator',
      '',
      'Number of channel-groups in use: 1',
      'Number of aggregators:           1',
      '',
      'Group  Port-channel  Protocol    Ports',
      '------+-------------+-----------+-----------------------------------------------',
      '1      Po1(SU)         LACP      Gi0/1(P)    Gi0/2(s)',
      '',
      'HPL-ACC6# show running-config interface GigabitEthernet0/2 | include switchport',
      ' switchport trunk allowed vlan 10,20',
      ' switchport mode trunk',
      'HPL-ACC6# show running-config interface GigabitEthernet0/1 | include switchport',
      ' switchport trunk allowed vlan 10,20,30',
      ' switchport mode trunk',
    ] },
    options: ['Gi0/2 is down because of a bad cable or a failed transceiver', 'Gi0/2 is suspended because its allowed VLAN list does not match the other members', 'LACP is not running on Gi0/2, so it has fallen back to stand-alone (I) mode', 'Po1 is a Layer 3 port-channel, so it forwards on only one of its member links at a time'],
    answer: 1,
    explanation: `Po1(SU) is a Layer 2 channel in use, with Gi0/1 bundled (P) and Gi0/2 suspended (s). Suspended means the port's configuration is incompatible with the bundle. Here Gi0/2 allows VLANs 10,20 while Gi0/1 allows 10,20,30. Members must match on speed, duplex, switchport mode, access VLAN or allowed VLANs and native VLAN. Fix it by configuring the bundle through interface port-channel 1 or interface range so all members match. A cable problem would show (D) down. A port that gets no LACP response shows (I) stand-alone. S means Layer 2, not Layer 3 (R).`,
    ref: 'l2-4 card:etherchannel',
  });
  add({
    id: 'q1-0138', domain: '2.0', obj: '2.4', type: 'multi', difficulty: 2, pick: 2,
    stem: `Which two settings must match on all member ports before they can be bundled into a Layer 2 EtherChannel? (Choose two.)`,
    options: ['Speed and duplex', 'Switchport mode and VLAN configuration (access VLAN, or trunk allowed and native VLANs)', 'Interface descriptions', 'The physical port numbers on both switches', 'The ports must be next to each other on the same module'],
    answer: [0, 1],
    explanation: `EtherChannel treats the members as one logical link, so they must behave identically: same speed and duplex, same switchport mode, and the same VLAN settings (access VLAN for access bundles; allowed list and native VLAN for trunk bundles). A port that differs is suspended. Descriptions are only labels. Port numbers do not have to match between the two switches; Gi0/1 on one side can connect to Gi1/0/48 on the other. Member ports do not need to be adjacent, and spreading them across modules or stack members is a common redundancy practice.`,
    ref: 'l2-4 card:etherchannel',
  });
  add({
    id: 'q1-0139', domain: '2.0', obj: '2.4', type: 'order', difficulty: 3,
    stem: `On HPL-CORE1, build a Layer 3 EtherChannel on Gi1/0/23 and Gi1/0/24 using LACP with the address 10.0.0.1/30. Put the commands in order, starting in global configuration mode.`,
    options: ['ip address 10.0.0.1 255.255.255.252', 'channel-group 1 mode active', 'interface range GigabitEthernet1/0/23 - 24', 'interface port-channel 1', 'no switchport'],
    answer: [2, 4, 1, 3, 0],
    explanation: `Select both members with interface range, then make them routed ports with no switchport before adding them to the channel. Running channel-group after no switchport creates Port-channel1 as a Layer 3 interface. Then enter interface port-channel 1 and assign the IP address there, never on the members. If you add Layer 2 ports to the channel first and convert later, the members and port-channel end up mismatched and IOS complains or suspends them. Verify with show etherchannel summary, where Po1 should show (RU), Layer 3 and in use, and with show ip interface brief.`,
    ref: 'l2-4 card:etherchannel',
  });
  add({
    id: 'q1-0140', domain: '2.0', obj: '2.4', type: 'single', difficulty: 3,
    stem: `A nightly backup between two servers runs across a four-member 1 Gbps EtherChannel between HPL-DIST1 and HPL-DIST2, using src-dst-ip load balancing. The backup never exceeds about 1 Gbps, even though the other members are idle. Why?`,
    options: ['LACP limits each bundle to the speed of one member link unless the members are 10 Gbps or faster', 'Each flow is hashed onto one member link, so a single source/destination pair always uses the same link', 'Three of the members must be in hot-standby, because LACP allows only one active member per VLAN on a bundle', 'The bundle is using PAgP instead of LACP, and PAgP load-balances only one link per VLAN'],
    answer: 1,
    explanation: `EtherChannel does not split one flow across links, because that could reorder frames. Instead it computes a hash of fields such as source and destination MAC or IP (here src-dst-ip) and maps each result to one member. Every packet between the same two servers has the same IP pair, so it always takes the same link and tops out at 1 Gbps. Many flows between many hosts spread across all members. Options include using a hash that includes Layer 4 ports (where supported) so that parallel backup streams spread out. A 4-port LACP bundle has all four links active (LACP allows up to 8 active plus 8 standby). PAgP would hash the same way.`,
    ref: 'l2-4 card:etherchannel',
  });
  add({
    id: 'q1-0141', domain: '2.0', obj: '2.4', type: 'single', difficulty: 2,
    stem: `What is the maximum number of active member links in one LACP EtherChannel on a Catalyst switch, and what happens to additional configured members?`,
    options: ['4 active; any extra ports are err-disabled by LACP', '8 active; up to 8 more can wait in hot-standby', '16 active; no standby ports are allowed in LACP', '2 active; the rest are suspended'],
    answer: 1,
    explanation: `LACP lets you configure up to 16 ports in a channel group, of which 8 are active and the remaining up to 8 sit in hot-standby (flag H in show etherchannel summary). If an active member fails, a standby port takes its place. PAgP and static mode on support up to 8 members with no standby feature. Extra ports are not err-disabled, and suspension (s) is for configuration mismatches, not for exceeding the active limit.`,
    ref: 'l2-4 card:etherchannel',
  });
  add({
    id: 'q1-0142', domain: '2.0', obj: '2.4', type: 'single', difficulty: 3,
    stem: `An engineer configures channel-group 2 mode on for two ports on HPL-ACC9, while the connected ports on HPL-DIST2 are configured with channel-group 2 mode active. What is the result?`,
    options: ['A working LACP bundle forms, because mode on is compatible with any LACP or PAgP mode configured on the other side', 'The active side gets no LACP PDUs, so its ports stay stand-alone (I) while the on side bundles its ports, risking a loop', 'Both sides fall back to PAgP negotiation, and the bundle forms once PAgP desirable is detected', 'The on side automatically changes itself to mode passive, and the bundle forms once LACP negotiation with the active side completes'],
    answer: 1,
    explanation: `Mode on sends no negotiation protocol at all and simply forces the ports into a channel. The active side keeps sending LACP PDUs and gets no answers, so it leaves its ports as individual (stand-alone) ports. The two ends now disagree about whether the links are one logical link or two: one side may forward a broadcast out one member and receive it back on the other. Catalyst switches detect this with EtherChannel misconfiguration guard and err-disable the ports on the on side. The fix is to use on at both ends or, better, LACP active/passive at both ends. Modes never change on their own, and no PAgP fallback exists.`,
    ref: 'l2-4 card:etherchannel',
  });
  add({
    id: 'q1-0143', domain: '2.0', obj: '2.4', type: 'single', difficulty: 2,
    stem: `Why does Spanning Tree not block any member link of a working EtherChannel?`,
    options: ['STP is automatically disabled on any switch that has an EtherChannel configured', 'STP treats the port-channel as one logical port, so the members cannot form a loop', 'EtherChannel members send BPDUs only on the first link, so the others are never blocked', 'The members carry different VLANs, so STP never sees a loop between them'],
    answer: 1,
    explanation: `Once the members are bundled, STP runs on the port-channel interface, not on the individual links. A single logical link between two switches cannot form a loop, so STP has nothing to block, and all members forward traffic. STP still runs everywhere else, including on the port-channel itself relative to other paths. Without bundling, two parallel links between the same switches form a loop and STP blocks one, which is exactly the problem EtherChannel solves. Members carry the same VLANs; otherwise they would be suspended.`,
    ref: 'l2-4 l2-5 card:etherchannel card:stp',
  });

  /* ---- 2.5 Rapid PVST+ ----------------------------------------------- */
  const tri = (pr) => {
    const t = { 'GigabitEthernet0/1': { mode: 'trunk' }, 'GigabitEthernet0/2': { mode: 'trunk' } };
    const v = { 1: 'default', 10: 'OFFICE', 20: 'SCANNERS' };
    return {
      SW1: sw('HPL-DIST1', 2, t, v, { mac: '0c01.1111.0001', stp: { prio: pr || {} } }),
      SW2: sw('HPL-ACC1', 2, t, v, { mac: '0c02.2222.0002' }),
      SW3: sw('HPL-DIST2', 2, t, v, { mac: '0c03.3333.0003' }),
    };
  };
  add({
    id: 'q1-0144', domain: '2.0', obj: '2.5', type: 'sim', difficulty: 3,
    stem: `HPL-DIST1 is currently the root bridge for every VLAN. To share the load, HPL-DIST2 must become the root bridge for VLAN 20 only, while HPL-DIST1 stays root for VLANs 1 and 10.`,
    sim: {
      world: {
        devices: tri({ 1: 24576, 10: 24576, 20: 24576 }),
        links: [['SW1', 'GigabitEthernet0/1', 'SW2', 'GigabitEthernet0/1'], ['SW1', 'GigabitEthernet0/2', 'SW3', 'GigabitEthernet0/1'], ['SW2', 'GigabitEthernet0/2', 'SW3', 'GigabitEthernet0/2']],
      },
      start: 'SW3',
      tasks: ['Make HPL-DIST2 the root bridge for VLAN 20.', 'Do not change which switch is root for VLAN 1 or VLAN 10.', 'Check your work with show spanning-tree vlan 20.'],
      check: 'q1-stp-root',
      solution: { SW3: ['enable', 'configure terminal', 'spanning-tree vlan 20 root primary', 'end'] },
    },
    explanation: `HPL-DIST1 already has priority 24576 for every VLAN, so HPL-DIST2 needs a lower bridge priority for VLAN 20 only. spanning-tree vlan 20 root primary on HPL-DIST2 does the math for you: it sets 24576 if that is enough to win, and otherwise 4096 below the current root's priority. HPL-DIST1 is at 24576 with a lower MAC address, so 24576 would only tie and lose, and the command sets 20480. You could also type spanning-tree vlan 20 priority 20480 (or any multiple of 4096 below 24576). Applying the command per VLAN is what makes PVST+ load sharing possible: VLAN 20 traffic now converges on HPL-DIST2 while VLANs 1 and 10 still use HPL-DIST1. Verify with show spanning-tree vlan 20, which should say "This bridge is the root". Root primary is a one-time calculation; it does not adjust later if another switch lowers its priority.`,
    ref: 'l2-5 card:stp',
  });
  TT.simChecks['q1-stp-root'] = (w) => {
    const r = (v) => { const s = TT.net.computeStp(w, v); return s && s.root.dev; };
    return r(20) === 'SW3' && r(10) === 'SW1' && r(1) === 'SW1';
  };
  add({
    id: 'q1-0145', domain: '2.0', obj: '2.5', type: 'sim', difficulty: 2,
    stem: `HPL-ACC12 has four user PCs on Fa0/1 to Fa0/4 and an uplink on Gi0/1. Users wait about 30 seconds for the network after boot, and security wants a rogue switch plugged into a desk port shut down immediately.`,
    sim: {
      world: {
        devices: {
          SW1: sw('HPL-ACC12', 4, { 'FastEthernet0/1': { accessVlan: 10, modeSet: true }, 'FastEthernet0/2': { accessVlan: 10, modeSet: true }, 'FastEthernet0/3': { accessVlan: 10, modeSet: true }, 'FastEthernet0/4': { accessVlan: 10, modeSet: true }, 'GigabitEthernet0/1': { mode: 'trunk' } }, { 1: 'default', 10: 'OFFICE' }, { mac: '0c12.0000.0012' }),
          SW2: sw('HPL-DIST1', 2, { 'GigabitEthernet0/1': { mode: 'trunk' } }, { 1: 'default', 10: 'OFFICE' }, { mac: '0c01.1111.0001', locked: true }),
          PC1: pc('OFFICE-PC1', '10.1.10.21', '255.255.255.0', ''),
          PC2: pc('OFFICE-PC2', '10.1.10.22', '255.255.255.0', ''),
          PC3: pc('OFFICE-PC3', '10.1.10.23', '255.255.255.0', ''),
          PC4: pc('OFFICE-PC4', '10.1.10.24', '255.255.255.0', ''),
        },
        links: [['SW1', 'GigabitEthernet0/1', 'SW2', 'GigabitEthernet0/1'], ['PC1', 'NIC', 'SW1', 'FastEthernet0/1'], ['PC2', 'NIC', 'SW1', 'FastEthernet0/2'], ['PC3', 'NIC', 'SW1', 'FastEthernet0/3'], ['PC4', 'NIC', 'SW1', 'FastEthernet0/4']],
      },
      start: 'SW1',
      tasks: ['Enable PortFast on Fa0/1 through Fa0/4.', 'Enable BPDU guard on the same ports.', 'Do not enable either feature on the uplink Gi0/1.'],
      check: 'q1-portfast',
      solution: { SW1: ['enable', 'configure terminal', 'interface range fa0/1 - 4', 'spanning-tree portfast', 'spanning-tree bpduguard enable', 'end'] },
    },
    explanation: `PortFast lets an access port skip the discarding and learning stages and forward as soon as the link comes up, which removes the startup delay that can make DHCP time out. It belongs only on ports facing end hosts. BPDU guard protects those ports: if a BPDU arrives, meaning someone connected a switch, the port is err-disabled at once. Configure both with interface range fa0/1 - 4, spanning-tree portfast and spanning-tree bpduguard enable. IOS prints a warning about PortFast, which is expected. Leave the uplink alone: PortFast on a switch-to-switch link can cause a temporary loop, and BPDU guard there would shut down the uplink as soon as the distribution switch sent its normal BPDUs. Global alternatives are spanning-tree portfast default and spanning-tree portfast bpduguard default, which apply to all access ports.`,
    ref: 'l2-5 card:stp',
  });
  TT.simChecks['q1-portfast'] = (w) => {
    const ok = [1, 2, 3, 4].every((n) => { const i = ifc(w, 'SW1', 'FastEthernet0/' + n); return i.portfast && i.bpduguard; });
    const up = ifc(w, 'SW1', 'GigabitEthernet0/1');
    return ok && !up.portfast && !up.bpduguard;
  };
  add({
    id: 'q1-0146', domain: '2.0', obj: '2.5', type: 'single', difficulty: 1,
    stem: `How do switches running Rapid PVST+ elect the root bridge for a VLAN?`,
    options: ['The switch with the highest bridge ID (priority plus VLAN ID, then MAC) wins', 'The switch with the lowest bridge ID (priority plus VLAN ID, then MAC address) wins', 'The switch with the most ports wins', 'The switch with the lowest IP address on its management SVI wins, then the lowest MAC'],
    answer: 1,
    explanation: `The bridge ID is the bridge priority (a multiple of 4096, default 32768) plus the VLAN ID as the system ID extension, followed by the switch MAC address. The lowest bridge ID wins: priority is compared first, and the MAC address breaks ties, so with default priorities the oldest switch (lowest MAC) often becomes root by accident. That is why you set the root deliberately with spanning-tree vlan X root primary or a priority. Port count and IP addresses play no part in the election.`,
    ref: 'l2-5 card:stp',
  });
  add({
    id: 'q1-0147', domain: '2.0', obj: '2.5', type: 'single', difficulty: 3,
    stem: `Review the output from HPL-ACC3. Which statement is true?`,
    exhibit: { kind: 'cli', title: 'HPL-ACC3', lines: [
      'HPL-ACC3# show spanning-tree vlan 10',
      '',
      'VLAN0010',
      '  Spanning tree enabled protocol rstp',
      '  Root ID    Priority    24586',
      '             Address     0c01.1111.0001',
      '             Cost        8',
      '             Port        26 (GigabitEthernet0/2)',
      '             Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec',
      '',
      '  Bridge ID  Priority    32778  (priority 32768 sys-id-ext 10)',
      '             Address     0c03.3333.0003',
      '             Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec',
      '             Aging Time  300 sec',
      '',
      'Interface           Role Sts Cost      Prio.Nbr Type',
      '------------------- ---- --- --------- -------- --------------------------------',
      'Fa0/1               Desg FWD 19        128.1    P2p Edge',
      'Gi0/1               Altn BLK 4         128.25   P2p',
      'Gi0/2               Root FWD 4         128.26   P2p',
    ] },
    options: ['HPL-ACC3 is the root bridge for VLAN 10 because all its ports are forwarding', 'The root has priority 24576, and HPL-ACC3 reaches it through Gi0/2 at a total cost of 8', 'Gi0/1 is blocking because its port cost is higher than Gi0/2, so it is the alternate path', 'Fa0/1 is in the listening state because it is an edge port on an access switch'],
    answer: 1,
    explanation: `The Root ID shows priority 24586, which is 24576 plus the VLAN 10 system ID extension, with a different MAC from this bridge's own address, so HPL-ACC3 is not root. "Cost 8" is the total root path cost and "Port 26 (Gi0/2)" is the root port: two Gigabit hops at cost 4 each. Gi0/1 is an alternate port, discarding (shown as BLK), but both uplinks have the same port cost of 4. Gi0/1 lost because the total path through it is worse, or the cost ties and the neighbor's bridge ID or port ID breaks the tie. Port cost alone does not explain it. Fa0/1 is an edge (PortFast) designated port in forwarding; RSTP has no listening state.`,
    ref: 'l2-5 card:stp',
  });
  add({
    id: 'q1-0148', domain: '2.0', obj: '2.5', type: 'single', difficulty: 3,
    stem: `All links between these three switches are trunks carrying VLAN 20. Which switch becomes the root bridge for VLAN 20?`,
    exhibit: { kind: 'table', rows: [['Switch', 'Configured priority for VLAN 20', 'Base MAC address'], ['HPL-DIST1', '32768 (default)', '0011.2233.0001'], ['HPL-DIST2', '28672', '00a1.5c00.9e10'], ['HPL-ACC4', '28672', '0019.aa10.4400']] },
    options: ['HPL-DIST1, because it has the lowest MAC address of the three switches', 'HPL-DIST2, because its MAC address is higher', 'HPL-ACC4, because it ties on priority and has the lower MAC address', 'No root is elected because two switches share the lowest priority value'],
    answer: 2,
    explanation: `Priority is compared before MAC address. HPL-DIST2 and HPL-ACC4 both use 28672 (bridge priority 28692 with the VLAN 20 extension), lower than HPL-DIST1's 32768, so HPL-DIST1 is out despite its low MAC. The tie between the other two is broken by the lowest MAC: 0019.aa10.4400 is lower than 00a1.5c00.9e10 (compare from the left: 0019 is less than 00a1). So HPL-ACC4, an access switch, wins, which is probably not what the designer intended. Set HPL-DIST2 with root primary or a lower priority. Ties are normal and are always resolved by the MAC address.`,
    ref: 'l2-5 card:stp',
  });
  add({
    id: 'q1-0149', domain: '2.0', obj: '2.5', type: 'match', difficulty: 2,
    stem: `Match each Rapid PVST+ port role to its description.`,
    options: ['Root port', 'Designated port', 'Alternate port', 'Backup port'],
    targets: ['The port on a non-root switch with the best path to the root bridge', 'The forwarding port for a segment, offering the best path toward the root for that segment', 'A discarding port that provides a replacement path to the root through a different switch', 'A discarding port that provides a redundant path to a segment the same switch already serves'],
    answer: [[0, 0], [1, 1], [2, 2], [3, 3]],
    explanation: `Every non-root switch has exactly one root port, its lowest-cost path to the root bridge. Every segment has exactly one designated port, the one that forwards toward the root for that segment; all ports on the root bridge are designated. An alternate port receives better BPDUs from another switch and stands by as a quick replacement for the root port, which is what makes RSTP convergence fast. A backup port receives better BPDUs from another port on the same switch, which only happens on shared media such as a hub, and is rare today. Alternate and backup ports are in the discarding state.`,
    ref: 'l2-5 card:stp',
  });
  add({
    id: 'q1-0150', domain: '2.0', obj: '2.5', type: 'multi', difficulty: 2, pick: 2,
    stem: `Which two of these are port states used by Rapid PVST+ (802.1w RSTP)? (Choose two.)`,
    options: ['Blocking', 'Listening', 'Discarding', 'Learning', 'Disabled'],
    answer: [2, 3],
    explanation: `RSTP has three port states: discarding, learning and forwarding. Discarding merges the old 802.1D disabled, blocking and listening states, since in all three the port forwards no data frames. Learning populates the MAC table without forwarding, and forwarding is fully active. Listening and blocking belong to classic 802.1D STP (whose full set is disabled, blocking, listening, learning, forwarding). Disabled is an 802.1D state, and in RSTP "disabled" is used as a role for a port that is shut down. Cisco output still prints BLK for a discarding port, which can confuse people reading show spanning-tree.`,
    ref: 'l2-5 card:stp',
  });
  add({
    id: 'q1-0151', domain: '2.0', obj: '2.5', type: 'single', difficulty: 2,
    stem: `HPL-DIST1 currently has the default priority for VLAN 30, and the current root for VLAN 30 also uses the default priority. An engineer enters spanning-tree vlan 30 root primary on HPL-DIST1. What priority does it set?`,
    options: ['0', '4096', '24576', '28672'],
    answer: 2,
    explanation: `root primary sets the priority to 24576 if that is enough to beat the current root. If it is not (the root is already below 24576, or ties at 24576 with a lower MAC), it sets a value 4096 below the root's priority instead. Here the root uses 32768, so 24576 wins. root secondary sets 28672, which makes a switch the next in line when the root fails, as long as the others keep the default. 0 and 4096 would only be chosen if the root were already at very low priorities. The command is a macro that calculates once; the configuration simply stores the resulting priority.`,
    ref: 'l2-5 card:stp',
  });
  add({
    id: 'q1-0152', domain: '2.0', obj: '2.5', type: 'single', difficulty: 2,
    stem: `A user connects a small unmanaged switch with its own STP to a desk port on HPL-ACC2. The port has PortFast and BPDU guard enabled. What happens?`,
    options: ['The port continues forwarding and the new switch joins the STP topology', 'The port goes into the err-disabled state when it receives a BPDU', 'The port moves into root-inconsistent state and recovers automatically when BPDUs stop', 'The port stops sending BPDUs but keeps forwarding'],
    answer: 1,
    explanation: `BPDU guard assumes an edge port should never hear a BPDU. As soon as one arrives, the switch err-disables the port, shutting it down until an administrator recovers it with shutdown and no shutdown, or until errdisable recovery is configured. Joining the STP topology is what would happen without BPDU guard. Root-inconsistent state with automatic recovery describes root guard. Stopping BPDUs while forwarding describes BPDU filter. Note that a cheap unmanaged switch that does not run STP sends no BPDUs, so BPDU guard would not catch it; port security limits on MAC addresses help there.`,
    ref: 'l2-5 card:stp',
  });
  add({
    id: 'q1-0153', domain: '2.0', obj: '2.5', type: 'single', difficulty: 3,
    stem: `HPL-DIST1 is the root bridge. Its Gi0/5 connects down to an access switch maintained by the warehouse contractor. You want the link to keep working normally, but if the contractor's switch ever advertises a superior BPDU, the port must stop forwarding until those BPDUs stop, and then recover on its own. Which feature fits?`,
    options: ['BPDU guard', 'Root guard', 'Loop guard', 'BPDU filter'],
    answer: 1,
    explanation: `Root guard is configured on designated ports that should never lead toward the root. If a superior BPDU arrives, the port is placed in the root-inconsistent state (no forwarding) instead of becoming a root port, and it recovers automatically once the superior BPDUs stop. That protects the planned topology while still allowing a downstream switch. BPDU guard would err-disable the port on any BPDU, and a downstream switch always sends BPDUs, so the link would never work. Loop guard protects root and alternate ports against BPDUs that stop arriving, not superior ones. BPDU filter stops BPDU exchange and would hide a loop instead of preventing a takeover.`,
    ref: 'l2-5 card:stp',
  });
  add({
    id: 'q1-0154', domain: '2.0', obj: '2.5', type: 'single', difficulty: 3,
    stem: `A fiber link between two distribution switches occasionally fails in one direction only: HPL-DIST2 still transmits, but its alternate port stops receiving BPDUs from HPL-DIST1. Without protection, the alternate port would eventually become designated and forward, creating a loop. Which feature prevents this?`,
    options: ['Root guard', 'BPDU guard', 'Loop guard', 'PortFast'],
    answer: 2,
    explanation: `Loop guard watches root and alternate (non-designated) ports. If BPDUs stop arriving on such a port, an ordinary switch assumes the neighbor is gone and turns the port designated and forwarding, which on a unidirectional failure creates a loop. With loop guard, the port moves to the loop-inconsistent state (blocking) instead, and recovers automatically when BPDUs return. Root guard reacts to superior BPDUs, not missing ones. BPDU guard is for edge ports and acts on BPDUs that do arrive. PortFast speeds up edge ports and does nothing for this case. UDLD is a complementary Cisco feature that detects unidirectional links directly.`,
    ref: 'l2-5 card:stp',
  });
  add({
    id: 'q1-0155', domain: '2.0', obj: '2.5', type: 'single', difficulty: 3,
    stem: `What is the difference between enabling BPDU filter on an interface with spanning-tree bpdufilter enable and enabling it globally with spanning-tree portfast bpdufilter default?`,
    options: ['There is no difference; both commands stop sending and receiving BPDUs on every port, including trunks', 'Per interface, it stops sending and ignores received BPDUs; globally, it covers only PortFast ports, and a BPDU received there removes PortFast and filtering', 'The interface command err-disables the port when a BPDU arrives; the global command puts every PortFast port into the blocking state', 'The global command applies to trunk ports only, while the interface command applies to access ports only'],
    answer: 1,
    explanation: `Interface-level BPDU filter turns STP off for that port: it neither sends nor processes BPDUs, so a loop through that port cannot be detected, which is why it must be used with great care. The global version is gentler: it applies to operational PortFast (edge) ports, which stop sending BPDUs after a few at link-up, but if a BPDU is received, the port loses its PortFast status and BPDU filtering and takes part in STP normally. Err-disabling on a BPDU is BPDU guard's behavior. Neither form is limited to trunks.`,
    ref: 'l2-5 card:stp',
  });
  add({
    id: 'q1-0156', domain: '2.0', obj: '2.5', type: 'single', difficulty: 3,
    stem: `HPL-ACC7 has two paths to the root bridge, HPL-DIST1, as shown. Using default short path costs, which port becomes HPL-ACC7's root port?`,
    exhibit: { kind: 'table', rows: [['Path', 'Links from HPL-ACC7 to the root'], ['Via Fa0/24', 'HPL-ACC7 Fa0/24 (100 Mbps) directly to HPL-DIST1'], ['Via Gi0/1', 'HPL-ACC7 Gi0/1 (1 Gbps) to HPL-ACC8, then HPL-ACC8 Gi0/2 (1 Gbps) to HPL-DIST1']] },
    options: ['Fa0/24, because it is a direct connection with fewer hops', 'Gi0/1, because its total path cost of 8 is lower than 19', 'Fa0/24, because the lower port number wins', 'Both, because STP load-balances equal paths'],
    answer: 1,
    explanation: `STP chooses the root port by lowest total root path cost, not by hop count. With the default short costs, 100 Mbps is 19 and 1 Gbps is 4 (10 Mbps is 100 and 10 Gbps is 2). The direct FastEthernet path costs 19. The path through HPL-ACC8 costs 4 + 4 = 8. Gi0/1 wins and Fa0/24 becomes an alternate port. Port ID is only used as a later tiebreaker when cost and neighbor bridge ID are equal. STP never forwards on two paths to the root at once for the same VLAN; that is what EtherChannel or per-VLAN root placement is for.`,
    ref: 'l2-5 card:stp',
  });
  add({
    id: 'q1-0157', domain: '2.0', obj: '2.5', type: 'order', difficulty: 2,
    stem: `Put the steps of building a spanning tree in the order STP performs them.`,
    options: ['Select one designated port on each segment', 'Elect the root bridge', 'Place the remaining ports into the alternate (discarding) role', 'Select one root port on each non-root switch'],
    answer: [1, 3, 0, 2],
    explanation: `First the switches elect a root bridge (lowest bridge ID). Then every non-root switch picks its root port, the port with the lowest-cost path to the root. Next, each segment gets a designated port, the end with the best path to the root (all ports on the root bridge are designated). Any port left over is neither root nor designated and becomes alternate (or backup), discarding frames, which breaks the loops. RSTP reaches the same result much faster than 802.1D because neighbors use a proposal/agreement handshake rather than waiting for timers.`,
    ref: 'l2-5 card:stp',
  });
  add({
    id: 'q1-0158', domain: '2.0', obj: '2.5', type: 'multi', difficulty: 2, pick: 2,
    stem: `Which two statements about PortFast are true? (Choose two.)`,
    options: ['A PortFast port transitions directly to forwarding when the link comes up', 'PortFast should be enabled on ports connected to end hosts such as PCs and printers', 'PortFast disables Spanning Tree on the port completely', 'PortFast should be enabled on trunks between distribution switches to speed convergence', 'PortFast makes the port err-disable when it receives a BPDU'],
    answer: [0, 1],
    explanation: `PortFast marks a port as an edge port, so it moves straight to forwarding instead of waiting through the discarding and learning stages. That helps hosts get DHCP and start working immediately, and in RSTP edge ports also do not trigger topology change flushes when they flap. It belongs on host-facing access ports (and trunks to servers or hypervisors with spanning-tree portfast trunk). STP still runs on the port: it still sends BPDUs, and if one arrives, the port loses edge status. Enabling it between switches risks temporary loops. Err-disabling on a BPDU is BPDU guard, a separate feature usually paired with PortFast.`,
    ref: 'l2-5 card:stp',
  });

  /* ---- 2.6 wireless architectures and AP modes ----------------------- */
  add({
    id: 'q1-0159', domain: '2.0', obj: '2.6', type: 'single', difficulty: 2,
    stem: `Security wants one AP in the customs office to scan all channels constantly for rogue APs and wireless attacks, without serving any clients. Which AP mode should it use?`,
    options: ['Local', 'FlexConnect', 'Monitor', 'Bridge'],
    answer: 2,
    explanation: `In monitor mode the AP does not serve clients; its radios scan every channel and report rogue APs, rogue clients and wIPS (intrusion) events to the controller. Local mode serves clients and spends only brief off-channel moments scanning. FlexConnect serves clients at a remote site and can keep working if the WAN fails. Bridge (mesh) mode connects APs wirelessly to extend the network or link buildings. Sniffer mode is another dedicated mode, which captures frames on one channel and forwards them to a packet analyzer.`,
    ref: 'l2-6 card:wifiarch',
  });
  add({
    id: 'q1-0160', domain: '2.0', obj: '2.6', type: 'match', difficulty: 2,
    stem: `Match each lightweight AP mode to its description.`,
    options: ['Local', 'FlexConnect', 'Sniffer', 'SE-Connect', 'Bridge'],
    targets: ['Default mode; serves clients and tunnels all traffic to the WLC over CAPWAP', 'Serves clients at a remote site and can switch traffic locally if the link to the WLC fails', 'Captures 802.11 frames on a channel and sends them to a protocol analyzer', 'Performs spectrum analysis to find non-Wi-Fi interference sources', 'Links APs wirelessly in a mesh or point-to-point bridge'],
    answer: [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]],
    explanation: `Local is the default for lightweight APs: client traffic and control both go to the controller inside CAPWAP. FlexConnect is designed for branches across a WAN: it can switch client traffic onto local VLANs and keep serving clients if the controller becomes unreachable. Sniffer mode turns the AP into a remote capture probe for tools like Wireshark. SE-Connect (spectrum expert) dedicates the radio to spectrum analysis, spotting microwaves, cameras and other non-802.11 interferers. Bridge mode (with variants like Flex+Bridge) builds mesh or point-to-point wireless backhaul.`,
    ref: 'l2-6 card:wifiarch',
  });
  add({
    id: 'q1-0161', domain: '2.0', obj: '2.6', type: 'single', difficulty: 3,
    stem: `The Dundalk branch has six APs managed by the WLC in Baltimore over a single WAN circuit. If the WAN goes down, scanners must keep working with the local inventory server, and guest traffic should not hairpin through Baltimore. Which deployment fits best?`,
    options: ['Lightweight APs in local mode with CAPWAP tunnels to Baltimore', 'Lightweight APs in FlexConnect mode with local switching', 'Autonomous APs managed one at a time from the branch', 'APs in monitor mode reporting to the Baltimore WLC'],
    answer: 1,
    explanation: `FlexConnect is built for branches managed by a central controller. With local switching, the AP places client traffic directly onto the branch VLANs, so it does not cross the WAN, and if the CAPWAP control connection to the WLC is lost, the AP keeps serving clients that are already connected (and can authenticate new ones locally with a PSK or a local RADIUS). In local mode all client traffic tunnels to Baltimore and service stops when the controller is unreachable. Autonomous APs would work during an outage but give up centralized management of six APs. Monitor mode serves no clients at all.`,
    ref: 'l2-6 card:wifiarch',
  });
  add({
    id: 'q1-0162', domain: '2.0', obj: '2.6', type: 'multi', difficulty: 2, pick: 2,
    stem: `Which two statements about CAPWAP between a lightweight AP and a WLC are true? (Choose two.)`,
    options: ['The control tunnel uses UDP port 5246 and is encrypted with DTLS by default', 'The data tunnel uses UDP port 5247', 'CAPWAP uses TCP port 443 for both tunnels', 'The data tunnel is always encrypted and cannot be left in clear', 'CAPWAP requires the AP and WLC to be in the same VLAN'],
    answer: [0, 1],
    explanation: `CAPWAP builds two tunnels: control on UDP 5246, which is DTLS-encrypted by default, and data on UDP 5247, which carries client traffic and is not encrypted by default (DTLS data encryption is optional). Because it runs over UDP/IP, CAPWAP is routable, so APs can sit in different subnets and even different cities from the controller, which is what makes FlexConnect and centralized controllers practical. TCP 443 is used for things like the controller's HTTPS GUI, not CAPWAP tunnels.`,
    ref: 'l2-6 card:wifiarch',
  });
  add({
    id: 'q1-0163', domain: '2.0', obj: '2.6', type: 'single', difficulty: 2,
    stem: `Harbor Point's new office in Philadelphia will use Cisco Meraki APs configured and monitored from a web dashboard hosted by Cisco, with no on-site controller. Which architecture is this?`,
    options: ['Autonomous', 'Split-MAC with an on-premises WLC', 'Cloud-based', 'Embedded controller on an access switch'],
    answer: 2,
    explanation: `In a cloud-based architecture, APs are managed from a controller function in the cloud, such as the Meraki dashboard. The APs build a management tunnel to the cloud, but client data traffic stays local and does not travel through the cloud. Autonomous APs are configured one by one with no central controller. Split-MAC with a WLC uses CAPWAP to an on-premises or data center controller. An embedded controller runs the WLC function on a Catalyst switch or AP (for example Embedded Wireless Controller on a Catalyst 9100 AP), still on site.`,
    ref: 'l2-6 card:wifiarch',
  });
  add({
    id: 'q1-0164', domain: '2.0', obj: '2.6', type: 'multi', difficulty: 3, pick: 2,
    stem: `In Cisco's split-MAC architecture, which two functions does the lightweight AP itself perform in real time, rather than the WLC? (Choose two.)`,
    options: ['Sending beacons and responding to probe requests', 'Encrypting and decrypting 802.11 frames and sending acknowledgments', 'Client authentication and association management', 'Radio resource management across all APs', 'Managing client roaming between APs'],
    answer: [0, 1],
    explanation: `Split-MAC divides 802.11 MAC work by timing. Real-time functions stay on the AP because they cannot wait for a round trip to the controller: transmitting beacons, answering probe requests, sending ACKs, retransmitting, queuing and prioritizing frames, and encrypting and decrypting over the air. Functions that are not time-critical are centralized on the WLC: authentication, association and security policy management, RF management across many APs (RRM: channel and power), roaming, QoS policy and management of the AP fleet.`,
    ref: 'l2-6 card:wifiarch',
  });

  /* ---- 2.7 WLAN physical infrastructure ------------------------------ */
  add({
    id: 'q1-0165', domain: '2.0', obj: '2.7', type: 'single', difficulty: 2,
    stem: `Harbor Point is connecting the two distribution system ports of its AireOS WLC (a Cisco 3504) to a Catalyst switch and enabling LAG on the controller. How must the switch ports be configured?`,
    options: ['As an LACP EtherChannel with channel-group mode active', 'As a PAgP EtherChannel with channel-group mode desirable', 'As a static EtherChannel with channel-group mode on', 'As two separate trunks without a channel'],
    answer: 2,
    explanation: `AireOS WLCs implement LAG without a negotiation protocol: they do not speak LACP or PAgP. The switch side must be a static EtherChannel using channel-group X mode on, normally as an 802.1Q trunk carrying the management and dynamic interface VLANs. Using active or desirable would leave the switch waiting for negotiation that never comes, so the bundle would not form properly. Two separate trunks without a channel would not match the controller's LAG and would cause problems with traffic distribution and failover. (Catalyst 9800 controllers run IOS XE and support static, LACP and PAgP port channels, which is why the stem names an AireOS controller.)`,
    ref: 'l2-7 card:wifiarch',
  });
  add({
    id: 'q1-0166', domain: '2.0', obj: '2.7', type: 'single', difficulty: 3,
    stem: `Two new APs are being installed. AP-1 runs in local mode. AP-2 runs in FlexConnect mode and locally switches the SCANNERS SSID onto VLAN 20 and the GUEST SSID onto VLAN 30, with its management address in VLAN 50. How should their switch ports be configured?`,
    options: ['Both as access ports in VLAN 50, with the client VLANs carried inside CAPWAP', 'AP-1 as an access port; AP-2 as a trunk for VLANs 20, 30 and 50 (native 50 for management)', 'Both as trunks allowing all VLANs', 'AP-1 as a trunk carrying VLANs 20, 30 and 50; AP-2 as an access port in its management VLAN 50'],
    answer: 1,
    explanation: `A local-mode AP sends all client traffic inside CAPWAP to the controller, so the switch only sees the AP's own management traffic; an access port in the AP's VLAN is correct. A FlexConnect AP that switches clients locally puts each SSID's traffic directly onto its VLAN, so the switch must accept tagged frames for VLANs 20 and 30 as well as the AP's management VLAN, making the port a trunk (commonly with the management VLAN as native, since the AP sends its own traffic untagged). An access port would trap AP-2's SSIDs. Trunking everything to every AP adds needless exposure.`,
    ref: 'l2-7 card:wifiarch',
  });
  add({
    id: 'q1-0167', domain: '2.0', obj: '2.7', type: 'match', difficulty: 2,
    stem: `Match each physical port on a Cisco WLC to its use.`,
    options: ['Service port', 'Distribution system port', 'Redundancy port', 'Console port'],
    targets: ['Out-of-band management, for example during recovery', 'Carries AP CAPWAP traffic and client data to the switched network, usually as a trunk', 'Connects to a second WLC for high availability', 'Direct CLI access through a serial connection for initial setup'],
    answer: [[0, 0], [1, 1], [2, 2], [3, 3]],
    explanation: `The service port is for out-of-band management, connected to a separate management network, and is used when the main network is down. Distribution system ports are the data ports: they connect to switches (usually as 802.1Q trunks, often bundled with LAG) and carry CAPWAP tunnels and all client traffic. The redundancy port connects two controllers in a high-availability pair so they can sync state. The console port gives serial CLI access for first-time setup and recovery.`,
    ref: 'l2-7 card:wifiarch',
  });
  add({
    id: 'q1-0168', domain: '2.0', obj: '2.7', type: 'single', difficulty: 2,
    stem: `On an AireOS WLC, which logical interface type maps a WLAN to a specific VLAN so its clients land in the right subnet?`,
    options: ['Management interface', 'Dynamic interface', 'Virtual interface', 'Service port interface'],
    answer: 1,
    explanation: `Dynamic interfaces are VLAN interfaces on the controller (with an IP address, VLAN tag and DHCP server) that carry client data. Each WLAN is assigned to a dynamic interface (or interface group), which decides the VLAN its clients use. The management interface is used for in-band management and CAPWAP communication with APs; it can carry client traffic, but the intended way to separate WLANs is dynamic interfaces. The virtual interface is a non-routable address (often 192.0.2.1) used for web authentication and DHCP relay. The service port interface is bound to the out-of-band service port.`,
    ref: 'l2-7 card:wificfg',
  });
  add({
    id: 'q1-0169', domain: '2.0', obj: '2.7', type: 'single', difficulty: 3,
    stem: `A new WLAN HPL-GUEST is mapped to a dynamic interface in VLAN 30 on the WLC. Clients associate but never get an IP address. The AireOS WLC's distribution ports connect to HPL-DIST1 Po3. Review the output. What is the fix?`,
    exhibit: { kind: 'cli', title: 'HPL-DIST1', lines: [
      'HPL-DIST1# show interfaces trunk',
      'Port        Mode             Encapsulation  Status        Native vlan',
      'Po3         on               802.1q         trunking      1',
      '',
      'Port        Vlans allowed on trunk',
      'Po3         1,10,20,50',
      '',
      'Port        Vlans allowed and active in management domain',
      'Po3         1,10,20,50',
    ] },
    options: ['Change Po3 to LACP mode active so the WLC ports can negotiate', 'Allow VLAN 30 on Po3 with switchport trunk allowed vlan add 30', 'Move the WLC management interface to VLAN 30 so DHCP requests are relayed', 'Enable PortFast on Po3 so the WLC ports skip the listening state'],
    answer: 1,
    explanation: `The WLC sends guest client traffic tagged with VLAN 30 out its distribution ports, but the switch's trunk to the controller does not allow VLAN 30, so DHCP discovers never reach the network and clients sit with no address. Add it with switchport trunk allowed vlan add 30 (using add so you do not wipe 1, 10, 20 and 50), and make sure VLAN 30 exists on the switch and has a gateway and DHCP. Po3 shows mode on, which is correct for AireOS LAG; LACP would break it. Moving the management interface would not help guest clients. PortFast does not affect which VLANs a trunk carries.`,
    ref: 'l2-7 l2-2 card:wificfg card:trunk',
  });

  /* ---- 2.8 device management access ---------------------------------- */
  add({
    id: 'q1-0170', domain: '2.0', obj: '2.8', type: 'sim', difficulty: 3,
    stem: `HPL-BR2 still accepts Telnet with a shared line password. Replace it with SSH version 2 and per-user logins, and make sure Telnet stops working. NET-ADMIN (10.0.99.10) is your test PC.`,
    sim: {
      world: {
        devices: {
          R1: { kind: 'router', hostname: 'HPL-BR2', interfaces: { 'GigabitEthernet0/0': { ip: '10.0.99.1', mask: '255.255.255.0', shutdown: false }, 'GigabitEthernet0/1': { shutdown: true } }, vty: { transport: ['telnet'], login: 'password', password: 'harbor' } },
          SW: sw('BR2-SW1', 4),
          PC: pc('NET-ADMIN', '10.0.99.10', '255.255.255.0', '10.0.99.1'),
        },
        links: [['R1', 'GigabitEthernet0/0', 'SW', 'GigabitEthernet0/1'], ['PC', 'NIC', 'SW', 'FastEthernet0/1']],
      },
      start: 'R1',
      tasks: ['Set the domain name hpl.local and generate RSA keys with a 2048-bit modulus.', 'Enable SSH version 2.', 'Create local user netadmin with a secret (hashed) password.', 'Make the VTY lines accept only SSH and authenticate against local users.', 'Test from NET-ADMIN with ssh -l netadmin 10.0.99.1.'],
      check: 'q1-ssh',
      solution: { R1: ['enable', 'configure terminal', 'ip domain-name hpl.local', 'crypto key generate rsa modulus 2048', 'ip ssh version 2', 'username netadmin secret Dock$ide9', 'line vty 0 15', 'transport input ssh', 'login local', 'end'] },
    },
    explanation: `SSH needs a hostname other than the default and a domain name, because the RSA key pair is named hostname.domain. crypto key generate rsa modulus 2048 creates the keys (SSH version 2 needs at least 768 bits; 2048 is a sensible modern minimum), and ip ssh version 2 disables the weak version 1. username netadmin secret stores a hashed password. On line vty 0 15, transport input ssh rejects Telnet, and login local checks the local username database instead of a shared line password. Verify with show ip ssh and by connecting from the PC: ssh should prompt for the netadmin password, and telnet 10.0.99.1 should be refused.`,
    ref: 'l2-8 l4-8 card:ssh',
  });
  TT.simChecks['q1-ssh'] = (w) => {
    const d = w.devices.R1;
    return (d.rsa || 0) >= 2048 && d.sshver === 2 && !!((d.users || {}).netadmin || {}).secret && TT.net.remoteLogin(w, 'PC', '10.0.99.1', 'ssh', 'netadmin').ok && !TT.net.remoteLogin(w, 'PC', '10.0.99.1', 'telnet').ok;
  };
  add({
    id: 'q1-0171', domain: '2.0', obj: '2.8', type: 'multi', difficulty: 1, pick: 2,
    stem: `Why should Harbor Point use SSH instead of Telnet to manage its routers? (Choose two.)`,
    options: ['Telnet sends usernames, passwords and commands in clear text', 'SSH encrypts the whole session, including authentication', 'SSH uses UDP port 22, which is faster than TCP for interactive sessions', 'Telnet cannot be used over the internet', 'SSH does not require any authentication'],
    answer: [0, 1],
    explanation: `Telnet (TCP 23) carries everything, including the login password, in clear text, so anyone capturing traffic on the path can read it. SSH (TCP 22) encrypts the entire session, authenticates the server with its public key and supports strong user authentication. SSH runs over TCP, not UDP. Telnet works over the internet perfectly well, which is exactly the danger. SSH requires authentication, either a password or a key.`,
    ref: 'l2-8 card:ssh',
  });
  add({
    id: 'q1-0172', domain: '2.0', obj: '2.8', type: 'match', difficulty: 2,
    stem: `Match each characteristic to TACACS+ or RADIUS.`,
    options: ['Uses TCP port 49', 'Uses UDP ports 1812 and 1813', 'Encrypts the entire packet body', 'Encrypts only the password in the access request', 'Separates authentication, authorization and accounting, allowing per-command authorization', 'Open standard commonly used for network access such as 802.1X'],
    targets: ['TACACS+', 'RADIUS'],
    answer: [[0, 0], [1, 1], [2, 0], [3, 1], [4, 0], [5, 1]],
    explanation: `TACACS+ was developed by Cisco (now documented in RFC 8907), runs on TCP 49, encrypts the whole payload and handles authentication, authorization and accounting as separate steps, which lets a server authorize each command an administrator types. That makes it the usual choice for device administration. RADIUS is an open standard (RFC 2865/2866) that uses UDP 1812 for authentication and 1813 for accounting (older implementations used 1645/1646), encrypts only the password, and combines authentication and authorization in one response. It is the usual choice for network access: 802.1X, VPN users and Wi-Fi.`,
    ref: 'l2-8 l5-8 card:aaa',
  });
  add({
    id: 'q1-0173', domain: '2.0', obj: '2.8', type: 'single', difficulty: 1,
    stem: `A technician connects a laptop to a new switch's RJ-45 console port with a rollover cable. Which terminal settings are the Cisco defaults?`,
    options: ['115200 baud, 8 data bits, even parity, 1 stop bit', '9600 baud, 8 data bits, no parity, 1 stop bit', '9600 baud, 7 data bits, odd parity, 2 stop bits', '19200 baud, 8 data bits, no parity, 2 stop bits'],
    answer: 1,
    explanation: `Cisco console ports default to 9600 baud, 8 data bits, no parity, 1 stop bit and no flow control, often written 9600 8N1. Use a rollover (console) cable for the RJ-45 port, typically with a USB-to-serial adapter, or the USB console port many newer devices have. The console is out-of-band management: it works even when the device has no IP configuration, which is why it should be protected with a password or local login (line console 0, login local) and exec-timeout.`,
    ref: 'l2-8 l5-3 card:ssh',
  });
  add({
    id: 'q1-0174', domain: '2.0', obj: '2.8', type: 'single', difficulty: 3,
    stem: `An engineer configured RSA keys, SSH version 2 and a local user on HPL-BR4, but SSH connections are refused while Telnet still works. Review the output. What is the fix?`,
    exhibit: { kind: 'cli', title: 'HPL-BR4', lines: [
      'HPL-BR4# show ip ssh',
      'SSH Enabled - version 2.0',
      'Authentication methods:publickey,keyboard-interactive,password',
      'Authentication timeout: 120 secs; Authentication retries: 3',
      '',
      'HPL-BR4# show running-config | section line vty',
      'line vty 0 4',
      ' login local',
      ' transport input telnet',
      'line vty 5 15',
      ' login local',
      ' transport input telnet',
    ] },
    options: ['Regenerate the RSA keys with a larger modulus of 2048 bits', 'Configure transport input ssh on line vty 0 15', 'Change login local to login on all the VTY lines', 'Enter ip ssh version 1'],
    answer: 1,
    explanation: `show ip ssh confirms SSH is enabled with version 2, so the keys are fine. The VTY lines only accept Telnet because of transport input telnet, so incoming SSH sessions are refused. Configure transport input ssh on all VTY lines (line vty 0 15) to accept only SSH, which also blocks Telnet as the security policy intends. login local is correct: it uses the local username and secret. Plain login would use a line password instead, which is weaker. Version 1 is insecure and would not fix the transport restriction.`,
    ref: 'l2-8 card:ssh',
  });
  add({
    id: 'q1-0175', domain: '2.0', obj: '2.8', type: 'multi', difficulty: 2, pick: 2,
    stem: `HPL-EDGE1's web GUI must be available only over an encrypted connection. Which two commands achieve this? (Choose two.)`,
    options: ['ip http secure-server', 'no ip http server', 'ip http server', 'transport input https', 'no ip http secure-server'],
    answer: [0, 1],
    explanation: `ip http secure-server enables the HTTPS server (TCP 443) using a self-signed or installed certificate, and no ip http server disables plain HTTP on TCP 80, which would otherwise send logins in clear text. ip http server would turn HTTP on, the opposite of what is required. transport input applies to VTY lines (SSH and Telnet), not the web server. no ip http secure-server would disable HTTPS. Many organizations also restrict GUI access with ip http access-class and use AAA for HTTP logins.`,
    ref: 'l2-8 card:ssh',
  });
  add({
    id: 'q1-0176', domain: '2.0', obj: '2.8', type: 'single', difficulty: 3,
    stem: `HPL-CORE1 is configured as shown. The TACACS+ server is reachable and online, and it rejects the password typed by an admin who has a valid local account with that exact password on the router. What happens?`,
    exhibit: { kind: 'cli', title: 'HPL-CORE1', lines: [
      'aaa new-model',
      'tacacs server ISE1',
      ' address ipv4 10.99.5.20',
      ' key 7 08314D5D1A0E0A0516',
      'aaa authentication login default group tacacs+ local',
      'username netadmin secret 9 $9$Vv1k...',
    ] },
    options: ['The router falls back to the local database after the rejection, and the login succeeds', 'The login fails; the local method is used only if the TACACS+ server does not respond', 'The router tries the enable secret next, as the third method in the list', 'The router locks the VTY lines for 120 seconds after the TACACS+ rejection'],
    answer: 1,
    explanation: `In an AAA method list, the router moves to the next method only when the current one returns an error, such as a server that does not respond. A clear reject from a reachable TACACS+ server is a final answer, so the login fails even though the local database would have accepted the password. The local method is a safety net for when the TACACS+ servers are unreachable, which is why every device should keep a local emergency account. The enable secret is not in this list. No lockout is configured here (that would need features such as login block-for).`,
    ref: 'l2-8 l5-8 card:aaa',
  });
  add({
    id: 'q1-0177', domain: '2.0', obj: '2.8', type: 'single', difficulty: 2,
    stem: `Which statement describes cloud-managed network devices such as Cisco Meraki switches and APs?`,
    options: ['Each device must be configured through its console port first, and the dashboard only shows status', 'Devices reach out to a cloud dashboard for configuration and monitoring; user traffic stays local', 'All user traffic is tunneled to the cloud, where the Meraki dashboard inspects and forwards it', 'They cannot be managed remotely unless a local controller is installed on site'],
    answer: 1,
    explanation: `Cloud-managed devices build an outbound management connection to the vendor's cloud. Administrators configure and monitor everything from a web dashboard, and changes are pushed to the devices wherever they are, which suits organizations with many small sites and few on-site staff. User data traffic does not pass through the cloud; it is forwarded locally as usual (only management and some telemetry go to the cloud). The devices therefore need internet connectivity to receive configuration changes, but they keep forwarding with their last configuration if the cloud is unreachable. Console-only configuration and lack of remote management are the opposite of the model.`,
    ref: 'l2-8 card:wifiarch',
  });

  /* ---- 2.9 WLAN GUI configuration ------------------------------------ */
  add({
    id: 'q1-0178', domain: '2.0', obj: '2.9', type: 'single', difficulty: 2,
    stem: `Harbor Point is adding a WLAN for Wi-Fi handsets used for voice calls in the warehouse. Which QoS profile should be applied to that WLAN on the WLC?`,
    options: ['Platinum', 'Gold', 'Silver', 'Bronze'],
    answer: 0,
    explanation: `AireOS WLCs use four QoS profiles: Platinum for voice, Gold for video, Silver for best effort (the default) and Bronze for background traffic such as guest bulk transfers. Applying Platinum to the voice WLAN lets the controller and APs prioritize those frames over the air and mark them appropriately on the wired side (the matching wired DSCP is EF for voice). Gold would treat calls like video, Silver gives them no priority, and Bronze would put them behind everything else.`,
    ref: 'l2-9 card:wificfg card:qos',
  });
  add({
    id: 'q1-0179', domain: '2.0', obj: '2.9', type: 'match', difficulty: 2,
    stem: `On the AireOS WLC GUI, WLANs > Edit shows several tabs. Match each setting to the tab where you configure it.`,
    options: ['SSID, status (enabled) and interface/interface group', 'WPA2 with a pre-shared key', 'Platinum QoS profile', 'Session timeout and Allow AAA Override'],
    targets: ['General', 'Security', 'QoS', 'Advanced'],
    answer: [[0, 0], [1, 1], [2, 2], [3, 3]],
    explanation: `The General tab holds the profile name, SSID, the Status checkbox (a new WLAN starts disabled), the interface or interface group that maps the WLAN to a VLAN, the radio policy and whether the SSID is broadcast. The Security tab has sub-tabs: Layer 2 (WPA2/WPA3, PSK or 802.1X), Layer 3 (web authentication) and AAA Servers. The QoS tab picks the Platinum, Gold, Silver or Bronze profile and WMM policy. The Advanced tab collects options such as AAA override, session timeout, client exclusion, DHCP address assignment required, peer-to-peer blocking and FlexConnect local switching.`,
    ref: 'l2-9 card:wificfg',
  });
  add({
    id: 'q1-0180', domain: '2.0', obj: '2.9', type: 'single', difficulty: 3,
    stem: `Scanners joining the new HPL-SCAN WLAN receive addresses from 10.99.0.0/24, the controller's management subnet, instead of the scanner subnet in VLAN 20. Review the WLAN settings. What should be changed?`,
    exhibit: { kind: 'table', rows: [['WLANs > Edit HPL-SCAN', 'Value'], ['General > Profile Name', 'HPL-SCAN'], ['General > SSID', 'HPL-SCAN'], ['General > Status', 'Enabled'], ['General > Interface/Interface Group(G)', 'management'], ['General > Broadcast SSID', 'Enabled'], ['Security > Layer 2 Security', 'WPA+WPA2'], ['Security > Authentication Key Management', 'PSK'], ['QoS > Quality of Service', 'Silver (best effort)'], ['Controller > Interfaces', 'management (VLAN 99, 10.99.0.5), scanners (VLAN 20, 10.20.0.5)']] },
    options: ['Change the QoS profile from Silver to Gold for the scanner traffic', 'Change the WLAN interface from management to the scanners interface', 'Disable Broadcast SSID so only scanners can join the WLAN', 'Change Layer 2 security to 802.1X with WPA2 Enterprise'],
    answer: 1,
    explanation: `The WLAN's interface setting decides which VLAN its clients are placed in. HPL-SCAN is mapped to the management interface (VLAN 99), so scanners land in the management subnet, which is both wrong and a security problem. Select the scanners dynamic interface (VLAN 20) on the General tab. QoS changes priority, not addressing. Hiding the SSID changes only whether it appears in beacons. Changing to 802.1X changes how clients authenticate, but without AAA override sending a VLAN, clients would still land on the interface the WLAN is mapped to.`,
    ref: 'l2-9 card:wificfg',
  });
  add({
    id: 'q1-0181', domain: '2.0', obj: '2.9', type: 'single', difficulty: 2,
    stem: `Harbor Point uses one 802.1X WLAN for all employees, and wants the RADIUS server to place managers and dispatchers into different VLANs based on their identity. Which WLAN Advanced setting must be enabled?`,
    options: ['Peer-to-peer blocking', 'Allow AAA Override', 'Client exclusion', 'Coverage hole detection'],
    answer: 1,
    explanation: `Allow AAA Override lets attributes returned by the RADIUS server (such as a VLAN or interface name, QoS level or ACL) override the WLAN's static settings for each user. Without it, every client lands on the interface configured for the WLAN no matter what RADIUS sends. Peer-to-peer blocking stops wireless clients from talking directly to each other. Client exclusion temporarily blocks clients after repeated authentication failures. Coverage hole detection is an RF feature that flags areas with weak signal.`,
    ref: 'l2-9 card:wificfg card:aaa',
  });
  add({
    id: 'q1-0182', domain: '2.0', obj: '2.9', type: 'multi', difficulty: 3, pick: 2,
    stem: `You are creating a WPA2 Personal WLAN for the warehouse scanners in the WLC GUI. Which two Security > Layer 2 settings are required? (Choose two.)`,
    options: ['WPA2 policy with AES (CCMP) encryption', 'Authentication Key Management set to PSK, with an 8 to 63 character ASCII passphrase', 'Authentication Key Management set to 802.1X', 'A RADIUS server on the AAA Servers tab', 'TKIP encryption enabled for compatibility'],
    answer: [0, 1],
    explanation: `WPA2 Personal means WPA2 with a pre-shared key. Select the WPA2 policy with AES (CCMP) encryption, then set the authentication key management to PSK and enter the passphrase, which must be 8 to 63 ASCII characters (or 64 hex characters). 802.1X with a RADIUS server is WPA2 Enterprise, where each user authenticates individually. TKIP is deprecated, weakens the WLAN and limits clients to slower legacy data rates, so it should not be enabled. Remember to enable the WLAN on the General tab and apply the changes.`,
    ref: 'l2-9 l5-10 card:wificfg card:wifisec',
  });
  add({
    id: 'q1-0183', domain: '2.0', obj: '2.9', type: 'single', difficulty: 2,
    stem: `An engineer creates a new WLAN in the WLC GUI, sets the SSID, security and interface, and clicks Apply. The SSID does not appear on any client. The other WLANs are fine. What is the most likely reason?`,
    options: ['The WLAN Status checkbox was left unchecked, so it is disabled', 'The QoS profile is Silver, so the APs do not beacon the SSID', 'The WLAN ID is higher than 16', 'AAA override is disabled on the Advanced tab'],
    answer: 0,
    explanation: `New WLANs on an AireOS controller are created in a disabled state. Until Status is checked (Enabled) on the General tab and the change is applied, the APs do not advertise the SSID. Silver is simply the default best-effort QoS profile. AAA override affects per-user attributes after authentication, not whether the SSID is visible. WLAN IDs above 16 are not automatically applied to the default AP group on some platforms, which is a real subtlety, but the much more common cause, and the first thing to check, is the Status checkbox.`,
    ref: 'l2-9 card:wificfg',
  });

  TT.questions.push(...Q);
})(globalThis);
