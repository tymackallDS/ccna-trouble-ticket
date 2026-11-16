/* Harbor Point Night Shift: "Watch it happen" concept scenes, part 2.
 * Exam domains 3.0 IP Connectivity, 4.0 IP Services, 5.0 Security Fundamentals,
 * 6.0 Automation and Programmability. Format: see the scene player in src/scenes.js.
 * All text is original. Addresses use RFC 1918 space inside Harbor Point and the
 * RFC 5737 documentation ranges (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24) outside.
 */
(function (G) {
  'use strict';
  const TT = (G.TT = G.TT || {});
  TT.scenes = TT.scenes || [];

  TT.scenes.push(
    /* ================================================================ *
     * 3.0 IP CONNECTIVITY
     * ================================================================ */
    {
      id: 'sc-route-journey',
      lesson: 'l3-2',
      obj: '3.2',
      title: 'One packet, two routers: longest match at every hop',
      summary: 'Follow a packet from the dispatch floor to the tracking server and watch what changes at each hop and what never does.',
      stage: { w: 720, h: 340 },
      actors: [
        { id: 'PC1', kind: 'pc', x: 70, y: 250, label: 'PC1', sub: '10.1.10.10' },
        { id: 'R1', kind: 'router', x: 270, y: 250, label: 'HPL-HQ', sub: 'Gi0/0 10.1.10.1' },
        { id: 'R2', kind: 'router', x: 470, y: 250, label: 'HPL-CORE', sub: 'Gi0/1 10.1.30.1' },
        { id: 'SRV', kind: 'server', x: 650, y: 250, label: 'TRACKER', sub: '10.1.30.50' },
      ],
      links: [
        { id: 'L1', a: 'PC1', b: 'R1', kind: 'eth', label: '10.1.10.0/24' },
        { id: 'L2', a: 'R1', b: 'R2', kind: 'eth', label: '10.1.12.0/30' },
        { id: 'L3', a: 'R2', b: 'SRV', kind: 'eth', label: '10.1.30.0/24' },
      ],
      steps: [
        {
          caption: 'PC1 wants 10.1.30.50. That is not on its own /24, so it frames the packet to its default gateway: destination MAC is HPL-HQ Gi0/0, destination IP is still the server. Windows starts the TTL at 128.',
          actions: [
            { do: 'table', target: 'PC1', side: 'top', title: 'Leaving PC1', cols: ['Field', 'Value'], rows: [
              ['Src MAC', '0050.7966.0010'], ['Dst MAC', '5000.0001.0000'],
              ['Src IP', '10.1.10.10'], ['Dst IP', '10.1.30.50'], ['TTL', '128'],
            ] },
            { do: 'packet', from: 'PC1', to: 'R1', label: 'to 10.1.30.50 TTL 128', shape: 'packet' },
          ],
        },
        {
          caption: 'HPL-HQ strips the frame and looks up 10.1.30.50. Three routes match: the default /0, the OSPF summary /16 and the OSPF /24. The longest prefix wins, so the /24 decides the next hop, 10.1.12.2.',
          actions: [
            { do: 'table', target: 'PC1', rows: null },
            { do: 'table', target: 'R1', side: 'top', title: 'HPL-HQ routing table', cols: ['Route', 'Next hop', 'Match?'], rows: [
              ['S* 0.0.0.0/0', '203.0.113.1', 'yes, /0'],
              ['O 10.1.0.0/16', '10.1.12.2', 'yes, /16'],
              { new: true, cells: ['O 10.1.30.0/24', '10.1.12.2', 'yes, /24 wins'] },
              ['C 10.1.10.0/24', 'Gi0/0', 'no'],
            ] },
            { do: 'highlight', target: 'R1' },
            { do: 'note', target: 'R1', text: 'Most specific match wins', side: 'bottom' },
          ],
        },
        {
          caption: 'HPL-HQ drops the TTL to 127 and builds a brand-new frame: its own Gi0/1 MAC as the source, HPL-CORE as the destination (from its ARP cache). The source and destination IPs do not change.',
          actions: [
            { do: 'table', target: 'R1', side: 'top', title: 'Leaving HPL-HQ', cols: ['Field', 'Value'], rows: [
              { new: true, cells: ['Src MAC', '5000.0001.0001'] }, { new: true, cells: ['Dst MAC', '5000.0002.0000'] },
              ['Src IP', '10.1.10.10'], ['Dst IP', '10.1.30.50'], { new: true, cells: ['TTL', '127'] },
            ] },
            { do: 'packet', from: 'R1', to: 'R2', label: 'to 10.1.30.50 TTL 127', shape: 'packet' },
          ],
        },
        {
          caption: 'HPL-CORE runs the same lookup. Its longest match for 10.1.30.50 is a connected /24 on Gi0/1, so there is no next-hop router. It delivers straight to the host.',
          actions: [
            { do: 'table', target: 'R1', rows: null },
            { do: 'table', target: 'R2', side: 'top', title: 'HPL-CORE routing table', cols: ['Route', 'Next hop', 'Match?'], rows: [
              ['O 10.1.10.0/24', '10.1.12.1', 'no'],
              ['C 10.1.12.0/30', 'Gi0/0', 'no'],
              { new: true, cells: ['C 10.1.30.0/24', 'Gi0/1', 'yes, /24'] },
              ['L 10.1.30.1/32', 'Gi0/1', 'no'],
            ] },
            { do: 'highlight', target: 'R2' },
          ],
        },
        {
          caption: 'One more rewrite: TTL 126, source MAC is HPL-CORE Gi0/1, destination MAC is the server itself, learned by ARP on the server VLAN.',
          actions: [
            { do: 'table', target: 'R2', side: 'top', title: 'Leaving HPL-CORE', cols: ['Field', 'Value'], rows: [
              { new: true, cells: ['Src MAC', '5000.0002.0001'] }, { new: true, cells: ['Dst MAC', '0050.5600.0050'] },
              ['Src IP', '10.1.10.10'], ['Dst IP', '10.1.30.50'], { new: true, cells: ['TTL', '126'] },
            ] },
            { do: 'packet', from: 'R2', to: 'SRV', label: 'to 10.1.30.50 TTL 126', shape: 'packet' },
          ],
        },
        {
          caption: 'The server sees 10.1.10.10 as the sender, exactly what PC1 wrote. Three different frames carried one unchanged IP packet; only the TTL and the header checksum moved.',
          actions: [
            { do: 'table', target: 'R2', rows: null },
            { do: 'highlight', target: 'SRV', tone: 'good' },
            { do: 'note', target: 'SRV', text: 'From 10.1.10.10, TTL 126' },
          ],
        },
        {
          caption: 'Now a traceroute probe leaves PC1 with TTL 1. HPL-HQ decrements it to 0, must discard it, and sends back ICMP Time Exceeded. That reply is how traceroute learns each hop.',
          actions: [
            { do: 'packet', from: 'PC1', to: 'R1', label: 'probe TTL 1', tone: 'warn', shape: 'packet' },
            { do: 'drop', at: 'R1', label: 'TTL 0' },
          ],
        },
        {
          caption: 'The ICMP type 11 message comes from HPL-HQ\'s own address, so PC1 now knows hop 1. The next probe goes out with TTL 2 and dies one router further along.',
          actions: [
            { do: 'packet', from: 'R1', to: 'PC1', label: 'ICMP Time Exceeded', tone: 'stamp', shape: 'packet' },
            { do: 'note', target: 'PC1', text: 'Hop 1: 10.1.10.1' },
          ],
        },
      ],
      takeaway: 'Each router picks the longest matching prefix, then rewrites the Layer 2 header and decrements TTL; the source and destination IPs ride through unchanged.',
    },

    {
      id: 'sc-floating-static',
      lesson: 'l3-3',
      obj: '3.3',
      title: 'Floating static: the spare tire in the routing table',
      summary: 'Two static routes to HQ, one with a higher administrative distance, and what happens when the main link dies.',
      stage: { w: 720, h: 360 },
      actors: [
        { id: 'PC', kind: 'pc', x: 60, y: 220, label: 'Dock PC', sub: '10.2.10.25' },
        { id: 'BR', kind: 'router', x: 210, y: 220, label: 'HPL-DUNDALK', sub: 'branch' },
        { id: 'HQ', kind: 'router', x: 510, y: 220, label: 'HPL-HQ', sub: '10.1.0.0/16' },
        { id: 'SRV', kind: 'server', x: 650, y: 220, label: 'TRACKER', sub: '10.1.30.50' },
        { id: 'BK', kind: 'router', x: 360, y: 320, label: 'HPL-BACKUP', sub: 'LTE path' },
      ],
      links: [
        { id: 'L0', a: 'PC', b: 'BR', kind: 'eth' },
        { id: 'L1', a: 'BR', b: 'HQ', kind: 'fiber', label: 'primary 10.255.1.0/30' },
        { id: 'L2', a: 'BR', b: 'BK', kind: 'serial', label: '10.255.2.0/30' },
        { id: 'L3', a: 'BK', b: 'HQ', kind: 'serial' },
        { id: 'L4', a: 'HQ', b: 'SRV', kind: 'eth' },
      ],
      steps: [
        {
          caption: 'The branch router has two static routes to the same 10.1.0.0/16. The first uses the default administrative distance of 1. The second ends in 250, which makes it a floating static.',
          actions: [
            { do: 'table', target: 'BR', side: 'top', title: 'running-config', cols: ['Static route', 'AD'], rows: [
              ['ip route 10.1.0.0 255.255.0.0 10.255.1.2', '1'],
              ['ip route 10.1.0.0 255.255.0.0 10.255.2.2 250', '250'],
            ] },
          ],
        },
        {
          caption: 'Only the lowest AD gets into the routing table, so `show ip route` lists just the fiber route, S 10.1.0.0/16 [1/0]. The AD 250 route waits in the config, invisible.',
          actions: [
            { do: 'table', target: 'BR', side: 'top', title: 'show ip route', cols: ['Route', 'Via'], rows: [
              { new: true, cells: ['S 10.1.0.0/16 [1/0]', '10.255.1.2'] },
            ] },
            { do: 'state', target: 'L1', state: 'up' },
          ],
        },
        {
          caption: 'Traffic from the dock takes the fiber straight to HQ.',
          actions: [
            { do: 'packet', path: ['PC', 'BR', 'HQ', 'SRV'], label: 'to 10.1.30.50', shape: 'packet' },
          ],
        },
        {
          caption: 'A backhoe finds the fiber. Gi0/1 goes down/down, the connected route to 10.255.1.0/30 disappears, and the static route through 10.255.1.2 can no longer be resolved, so IOS removes it.',
          actions: [
            { do: 'state', target: 'L1', state: 'down' },
            { do: 'table', target: 'BR', side: 'top', title: 'show ip route', cols: ['Route', 'Via'], rows: [
              ['(no route to 10.1.0.0/16)', ''],
            ] },
            { do: 'note', target: 'BR', text: 'Next hop unreachable', side: 'bottom' },
          ],
        },
        {
          caption: 'With the better route gone, the floating static is now the best one left. It installs itself as S 10.1.0.0/16 [250/0] via 10.255.2.2.',
          actions: [
            { do: 'table', target: 'BR', side: 'top', title: 'show ip route', cols: ['Route', 'Via'], rows: [
              { new: true, cells: ['S 10.1.0.0/16 [250/0]', '10.255.2.2'] },
            ] },
            { do: 'highlight', target: 'L2', tone: 'warn' },
          ],
        },
        {
          caption: 'Dock traffic now takes the slower LTE path through HPL-BACKUP. Nobody had to log in at 2 a.m.',
          actions: [
            { do: 'packet', path: ['PC', 'BR', 'BK', 'HQ', 'SRV'], label: 'to 10.1.30.50', shape: 'packet', tone: 'warn' },
          ],
        },
        {
          caption: 'The fiber is spliced and the interface comes back up. The AD 1 route returns, beats 250, and the floating static drops back out of the table.',
          actions: [
            { do: 'state', target: 'L1', state: 'up' },
            { do: 'table', target: 'BR', side: 'top', title: 'show ip route', cols: ['Route', 'Via'], rows: [
              { new: true, cells: ['S 10.1.0.0/16 [1/0]', '10.255.1.2'] },
            ] },
            { do: 'packet', path: ['PC', 'BR', 'HQ', 'SRV'], label: 'to 10.1.30.50', shape: 'packet', tone: 'good' },
          ],
        },
        {
          caption: 'The catch: if the failure is beyond the router, say inside the carrier, and Gi0/1 stays up/up, the primary static never leaves the table and traffic black-holes. Static routes only react to what the router can see.',
          actions: [
            { do: 'note', target: 'L1', text: 'Link up, path dead?', side: 'bottom' },
            { do: 'highlight', target: 'L1', tone: 'stamp' },
          ],
        },
      ],
      takeaway: 'A floating static is a backup route with a higher AD than the primary; it only enters the routing table when the better route is removed.',
    },

    {
      id: 'sc-ospf-adjacency',
      lesson: 'l3-4',
      obj: '3.4',
      title: 'OSPF neighbors: from Down to Full',
      summary: 'Two routers on one Ethernet link walk through every OSPF neighbor state, one packet type at a time.',
      stage: { w: 720, h: 300 },
      actors: [
        { id: 'R1', kind: 'router', x: 170, y: 200, label: 'HPL-HQ', sub: 'RID 1.1.1.1' },
        { id: 'R2', kind: 'router', x: 550, y: 200, label: 'HPL-CORE', sub: 'RID 2.2.2.2' },
      ],
      links: [
        { id: 'L1', a: 'R1', b: 'R2', kind: 'eth', label: '10.1.12.0/24, area 0' },
      ],
      steps: [
        {
          caption: 'Both routers have OSPF enabled on Gi0/0 in area 0, but they have not heard from each other yet. Each one lists the other as Down.',
          actions: [
            { do: 'badge', target: 'R1', text: 'Down', tone: 'muted' },
            { do: 'badge', target: 'R2', text: 'Down', tone: 'muted' },
          ],
        },
        {
          caption: 'HPL-HQ sends a Hello to 224.0.0.5 every 10 seconds. It carries its router ID, area, hello/dead timers (10/40), subnet mask and the neighbors it has seen: none yet.',
          actions: [
            { do: 'packet', from: 'R1', to: 'R2', label: 'Hello, seen: none', shape: 'hello' },
          ],
        },
        {
          caption: 'HPL-CORE checks that area, timers, mask and authentication match, then moves HPL-HQ to Init: "I hear you, but you have not mentioned me yet."',
          actions: [
            { do: 'badge', target: 'R2', text: 'Init', tone: 'warn' },
            { do: 'packet', from: 'R2', to: 'R1', label: 'Hello, seen: 1.1.1.1', shape: 'hello' },
          ],
        },
        {
          caption: 'HPL-HQ finds its own RID in that Hello, so it jumps to 2-Way. Its next Hello lists 2.2.2.2, and HPL-CORE goes 2-Way too. On Ethernet this is when the DR and BDR are elected.',
          actions: [
            { do: 'badge', target: 'R1', text: '2-Way', tone: 'accent' },
            { do: 'packet', from: 'R1', to: 'R2', label: 'Hello, seen: 2.2.2.2', shape: 'hello' },
            { do: 'badge', target: 'R2', text: '2-Way', tone: 'accent' },
          ],
        },
        {
          caption: 'Equal priority, so the higher RID wins: 2.2.2.2 is DR and 1.1.1.1 is BDR. They will become fully adjacent, so they enter ExStart and trade empty DBD packets to pick a master. Higher RID is master.',
          actions: [
            { do: 'badge', target: 'R1', text: 'ExStart, BDR', tone: 'accent' },
            { do: 'badge', target: 'R2', text: 'ExStart, DR', tone: 'accent' },
            { do: 'packet', from: 'R1', to: 'R2', label: 'DBD (I am master?)', shape: 'segment' },
            { do: 'packet', from: 'R2', to: 'R1', label: 'DBD (no, 2.2.2.2 is)', shape: 'segment' },
          ],
        },
        {
          caption: 'Exchange: each side sends DBDs listing the headers of every LSA in its database, a table of contents rather than the books. An MTU mismatch shows up here: the neighbors stick in ExStart or Exchange.',
          actions: [
            { do: 'badge', target: 'R1', text: 'Exchange', tone: 'accent' },
            { do: 'badge', target: 'R2', text: 'Exchange', tone: 'accent' },
            { do: 'packet', from: 'R2', to: 'R1', label: 'DBD: LSA headers', shape: 'segment' },
            { do: 'packet', from: 'R1', to: 'R2', label: 'DBD: LSA headers', shape: 'segment' },
          ],
        },
        {
          caption: 'Loading: HPL-HQ spots LSAs it lacks and asks for them with a Link-State Request. HPL-CORE answers with a Link-State Update carrying the full LSAs.',
          actions: [
            { do: 'badge', target: 'R1', text: 'Loading', tone: 'warn' },
            { do: 'badge', target: 'R2', text: 'Loading', tone: 'warn' },
            { do: 'packet', from: 'R1', to: 'R2', label: 'LSR', shape: 'segment' },
            { do: 'packet', from: 'R2', to: 'R1', label: 'LSU (full LSAs)', shape: 'segment', delay: 1300 },
          ],
        },
        {
          caption: 'HPL-HQ confirms with a Link-State Acknowledgment. Both databases are now identical.',
          actions: [
            { do: 'packet', from: 'R1', to: 'R2', label: 'LSAck', shape: 'segment', tone: 'good' },
          ],
        },
        {
          caption: 'Full. Each router runs SPF over the shared database and installs O routes. Hellos keep flowing every 10 seconds; miss them for 40 and the neighbor drops back to Down.',
          actions: [
            { do: 'badge', target: 'R1', text: 'Full', tone: 'good' },
            { do: 'badge', target: 'R2', text: 'Full', tone: 'good' },
            { do: 'state', target: 'L1', state: 'up' },
            { do: 'table', target: 'R1', side: 'top', title: 'show ip ospf neighbor', cols: ['Neighbor ID', 'Pri', 'State', 'Address'], rows: [
              { new: true, cells: ['2.2.2.2', '1', 'FULL/DR', '10.1.12.2'] },
            ] },
          ],
        },
      ],
      takeaway: 'OSPF neighbors climb Down, Init, 2-Way, ExStart, Exchange, Loading, Full, using Hellos to meet and DBD, LSR, LSU and LSAck to sync databases.',
    },

    {
      id: 'sc-ospf-dr-flood',
      lesson: 'l3-4',
      obj: '3.4',
      title: 'OSPF on a shared segment: DR election and LSA flooding',
      summary: 'Four routers share one VLAN. Watch who becomes DR and BDR, then how a single link change ripples through everyone.',
      stage: { w: 720, h: 370 },
      actors: [
        { id: 'R1', kind: 'router', x: 180, y: 80, label: 'HPL-HQ', sub: 'pri 100, RID 1.1.1.1' },
        { id: 'R2', kind: 'router', x: 610, y: 70, label: 'HPL-CORE', sub: 'pri 1, RID 2.2.2.2' },
        { id: 'SW', kind: 'switch', x: 360, y: 190, label: 'HPL-DIST1', sub: 'VLAN 100' },
        { id: 'R3', kind: 'router', x: 250, y: 300, label: 'HPL-ANNEX', sub: 'pri 0, RID 3.3.3.3' },
        { id: 'R4', kind: 'router', x: 540, y: 300, label: 'HPL-DC', sub: 'pri 1, RID 4.4.4.4' },
        { id: 'LAN', kind: 'switch', x: 90, y: 300, label: 'Annex LAN', sub: '10.1.30.0/24' },
      ],
      links: [
        { id: 'L1', a: 'R1', b: 'SW', kind: 'eth' },
        { id: 'L2', a: 'R2', b: 'SW', kind: 'eth' },
        { id: 'L3', a: 'R3', b: 'SW', kind: 'eth' },
        { id: 'L4', a: 'R4', b: 'SW', kind: 'eth' },
        { id: 'L5', a: 'R3', b: 'LAN', kind: 'eth', label: 'Gi0/2' },
      ],
      steps: [
        {
          caption: 'Four routers share 10.1.0.0/24. Every Hello to 224.0.0.5 carries the sender\'s interface priority (0-255, default 1) and router ID, so everyone can run the same election.',
          actions: [
            { do: 'packet', from: 'R1', to: 'SW', label: 'Hello', shape: 'hello' },
            { do: 'packet', from: 'R2', to: 'SW', label: 'Hello', shape: 'hello' },
            { do: 'packet', from: 'R3', to: 'SW', label: 'Hello', shape: 'hello' },
            { do: 'packet', from: 'R4', to: 'SW', label: 'Hello', shape: 'hello' },
          ],
        },
        {
          caption: 'Highest priority wins the DR seat. HPL-HQ was set to `ip ospf priority 100`, so it is DR.',
          actions: [
            { do: 'badge', target: 'R1', text: 'DR', tone: 'good' },
            { do: 'highlight', target: 'R1', tone: 'good' },
          ],
        },
        {
          caption: 'BDR goes to the next best. HPL-CORE and HPL-DC tie at priority 1, so the higher router ID breaks the tie: 4.4.4.4 is BDR. HPL-ANNEX has priority 0 and can never be DR or BDR.',
          actions: [
            { do: 'badge', target: 'R4', text: 'BDR', tone: 'accent' },
            { do: 'badge', target: 'R2', text: 'DROTHER', tone: 'muted' },
            { do: 'badge', target: 'R3', text: 'DROTHER', tone: 'muted' },
            { do: 'highlight', target: 'R4' },
          ],
        },
        {
          caption: 'DROTHERs go Full only with the DR and BDR. With each other they stop at 2-Way, which is normal, not a fault. That keeps adjacencies at a manageable number.',
          actions: [
            { do: 'table', target: 'R2', side: 'left', title: 'show ip ospf neighbor', cols: ['Neighbor', 'Pri', 'State'], rows: [
              ['1.1.1.1', '100', 'FULL/DR'],
              ['3.3.3.3', '0', '2WAY/DROTHER'],
              ['4.4.4.4', '1', 'FULL/BDR'],
            ] },
          ],
        },
        {
          caption: 'The annex LAN port goes down. HPL-ANNEX updates its Router LSA (type 1) and sends an LSU to 224.0.0.6, the address only the DR and BDR listen on.',
          actions: [
            { do: 'table', target: 'R2', rows: null },
            { do: 'state', target: 'L5', state: 'down' },
            { do: 'packet', path: ['R3', 'SW', 'R1'], label: 'LSU to 224.0.0.6', shape: 'segment', tone: 'warn' },
            { do: 'packet', path: ['R3', 'SW', 'R4'], label: 'LSU to 224.0.0.6', shape: 'segment', tone: 'warn' },
          ],
        },
        {
          caption: 'The DR re-floods the LSA to 224.0.0.5, so every OSPF router on the segment gets it and acknowledges it. The BDR watches, ready to take over if the DR dies.',
          actions: [
            { do: 'packet', from: 'R1', to: 'SW', label: 'LSU to 224.0.0.5', shape: 'segment' },
            { do: 'flood', from: 'SW', to: ['R2', 'R3', 'R4'], label: 'LSU', shape: 'segment', delay: 950 },
          ],
        },
        {
          caption: 'Every router reruns SPF (Dijkstra) on the updated database and pulls 10.1.30.0/24 out of its routing table. Same database, same answer everywhere.',
          actions: [
            { do: 'note', target: 'R2', text: 'SPF: 10.1.30.0/24 gone' },
            { do: 'note', target: 'R4', text: 'SPF: 10.1.30.0/24 gone' },
            { do: 'note', target: 'R1', text: 'SPF rerun' },
          ],
        },
        {
          caption: 'The election is not preemptive. If a router with priority 200 joins tomorrow, HPL-HQ stays DR until it fails or its OSPF process restarts.',
          actions: [
            { do: 'highlight', target: 'R1', tone: 'good' },
          ],
        },
      ],
      takeaway: 'On a shared segment OSPF elects a DR by highest priority, then highest RID; changes go to the DR on 224.0.0.6 and get re-flooded to 224.0.0.5, then everyone reruns SPF.',
    },

    {
      id: 'sc-hsrp-failover',
      lesson: 'l3-5',
      obj: '3.5',
      title: 'HSRP: the gateway that changes hands, not addresses',
      summary: 'Two routers share 10.10.20.1. One dies mid-shift and the dispatch PCs never notice.',
      stage: { w: 720, h: 380 },
      actors: [
        { id: 'CORE', kind: 'router', x: 360, y: 50, label: 'HPL-CORE', sub: 'upstream' },
        { id: 'RA', kind: 'router', x: 200, y: 150, label: 'HPL-DIST1', sub: '10.10.20.2, pri 110' },
        { id: 'RB', kind: 'router', x: 520, y: 150, label: 'HPL-DIST2', sub: '10.10.20.3, pri 100' },
        { id: 'SW', kind: 'switch', x: 360, y: 250, label: 'HPL-SW3', sub: 'VLAN 20' },
        { id: 'PC1', kind: 'pc', x: 200, y: 330, label: 'Dispatch-07', sub: 'gw 10.10.20.1' },
        { id: 'PC2', kind: 'pc', x: 520, y: 330, label: 'Dispatch-12', sub: 'gw 10.10.20.1' },
      ],
      links: [
        { id: 'LCA', a: 'CORE', b: 'RA', kind: 'eth' },
        { id: 'LCB', a: 'CORE', b: 'RB', kind: 'eth' },
        { id: 'LA', a: 'RA', b: 'SW', kind: 'eth', label: 'Gi0/1' },
        { id: 'LB', a: 'RB', b: 'SW', kind: 'eth', label: 'Gi0/2' },
        { id: 'LP1', a: 'SW', b: 'PC1', kind: 'eth' },
        { id: 'LP2', a: 'SW', b: 'PC2', kind: 'eth' },
      ],
      steps: [
        {
          caption: 'Both routers run `standby 10 ip 10.10.20.1`. They trade HSRPv1 Hellos to 224.0.0.2, UDP 1985, every 3 seconds. Priority 110 beats 100, so HPL-DIST1 is Active and HPL-DIST2 is Standby.',
          actions: [
            { do: 'packet', path: ['RA', 'SW', 'RB'], label: 'Hello pri 110', shape: 'hello' },
            { do: 'packet', path: ['RB', 'SW', 'RA'], label: 'Hello pri 100', shape: 'hello' },
            { do: 'badge', target: 'RA', text: 'Active', tone: 'good' },
            { do: 'badge', target: 'RB', text: 'Standby', tone: 'muted' },
          ],
        },
        {
          caption: 'Dispatch-07 ARPs for its gateway, 10.10.20.1. Only the Active router answers, and it answers with the virtual MAC 0000.0c07.ac0a (group 10 is 0a in hex), not its own burned-in MAC.',
          actions: [
            { do: 'packet', path: ['PC1', 'SW', 'RA'], label: 'ARP: who has .1?' },
            { do: 'packet', path: ['RA', 'SW', 'PC1'], label: 'is-at 0000.0c07.ac0a', tone: 'good', delay: 1500 },
            { do: 'table', target: 'PC1', side: 'left', title: 'ARP cache', cols: ['IP', 'MAC'], rows: [
              { new: true, cells: ['10.10.20.1', '0000.0c07.ac0a'] },
            ] },
          ],
        },
        {
          caption: 'Traffic to the outside world is framed to the virtual MAC. The switch learned that MAC on Gi0/1, so it all flows through HPL-DIST1.',
          actions: [
            { do: 'table', target: 'PC1', rows: null },
            { do: 'packet', path: ['PC1', 'SW', 'RA', 'CORE'], label: 'to 0000.0c07.ac0a', shape: 'packet' },
            { do: 'packet', path: ['PC2', 'SW', 'RA', 'CORE'], label: 'to 0000.0c07.ac0a', shape: 'packet' },
          ],
        },
        {
          caption: 'HPL-DIST1 loses power. Its Hellos stop. HPL-DIST2 keeps listening and counts down the 10-second hold time.',
          actions: [
            { do: 'state', target: 'LA', state: 'down' },
            { do: 'state', target: 'LCA', state: 'down' },
            { do: 'badge', target: 'RA', text: 'Dead', tone: 'stamp' },
            { do: 'note', target: 'RB', text: 'No Hello for 10 s...' },
          ],
        },
        {
          caption: 'Hold time expires. HPL-DIST2 becomes Active, takes over the same virtual IP and MAC, and sends a gratuitous ARP so the switch moves 0000.0c07.ac0a to Gi0/2.',
          actions: [
            { do: 'badge', target: 'RB', text: 'Active', tone: 'good' },
            { do: 'packet', from: 'RB', to: 'SW', label: 'Gratuitous ARP', tone: 'good' },
            { do: 'table', target: 'SW', side: 'right', title: 'MAC table', cols: ['MAC', 'Port'], rows: [
              { new: true, cells: ['0000.0c07.ac0a', 'Gi0/2'] },
            ] },
          ],
        },
        {
          caption: 'The PCs change nothing. Same gateway IP, same gateway MAC in their ARP caches. Their frames simply leave the switch on a different port.',
          actions: [
            { do: 'packet', path: ['PC1', 'SW', 'RB', 'CORE'], label: 'to 0000.0c07.ac0a', shape: 'packet', tone: 'good' },
            { do: 'packet', path: ['PC2', 'SW', 'RB', 'CORE'], label: 'to 0000.0c07.ac0a', shape: 'packet', tone: 'good' },
            { do: 'table', target: 'SW', rows: null },
            { do: 'table', target: 'PC1', side: 'left', title: 'ARP cache', cols: ['IP', 'MAC'], rows: [['10.10.20.1', '0000.0c07.ac0a']] },
          ],
        },
        {
          caption: 'HPL-DIST1 boots back up with the higher priority, but preemption is off by default in HSRP. It settles in as Standby and HPL-DIST2 stays Active.',
          actions: [
            { do: 'table', target: 'PC1', rows: null },
            { do: 'state', target: 'LA', state: 'up' },
            { do: 'state', target: 'LCA', state: 'up' },
            { do: 'badge', target: 'RA', text: 'Standby', tone: 'muted' },
            { do: 'packet', path: ['RA', 'SW', 'RB'], label: 'Hello pri 110', shape: 'hello' },
          ],
        },
        {
          caption: 'Want the bigger router back in charge? Add `standby 10 preempt` on HPL-DIST1. It then takes Active as soon as it hears a lower-priority Active router.',
          actions: [
            { do: 'note', target: 'RA', text: 'standby 10 preempt' },
            { do: 'highlight', target: 'RA' },
          ],
        },
      ],
      takeaway: 'HSRP routers share a virtual IP and MAC; when the Active router stops sending Hellos the Standby takes over, and the hosts never change their default gateway.',
    },

    /* ================================================================ *
     * 4.0 IP SERVICES
     * ================================================================ */
    {
      id: 'sc-pat',
      lesson: 'l4-1',
      obj: '4.1',
      title: 'PAT: a whole floor behind one public address',
      summary: 'Two PCs reach the same web server through one public IP, and port numbers keep their conversations apart.',
      stage: { w: 720, h: 360 },
      actors: [
        { id: 'PC1', kind: 'pc', x: 70, y: 170, label: 'PC1', sub: '10.1.10.10' },
        { id: 'PC2', kind: 'pc', x: 70, y: 320, label: 'PC2', sub: '10.1.10.11' },
        { id: 'R1', kind: 'router', x: 300, y: 270, label: 'HPL-EDGE', sub: 'out 203.0.113.2' },
        { id: 'NET', kind: 'cloud', x: 480, y: 270, label: 'Internet' },
        { id: 'WEB', kind: 'server', x: 650, y: 270, label: 'Carrier portal', sub: '198.51.100.80' },
      ],
      links: [
        { id: 'L1', a: 'PC1', b: 'R1', kind: 'eth' },
        { id: 'L2', a: 'PC2', b: 'R1', kind: 'eth' },
        { id: 'L3', a: 'R1', b: 'NET', kind: 'eth', label: 'Gi0/1 outside' },
        { id: 'L4', a: 'NET', b: 'WEB', kind: 'eth' },
      ],
      steps: [
        {
          caption: 'PC1 opens HTTPS to the carrier portal from source port 49152. Its private source address, 10.1.10.10, is the inside local address. It cannot be routed on the internet.',
          actions: [
            { do: 'packet', from: 'PC1', to: 'R1', label: '10.1.10.10:49152>:443', shape: 'packet' },
          ],
        },
        {
          caption: '`ip nat inside source list 1 interface g0/1 overload` matches PC1. HPL-EDGE swaps the source for its own outside address, the inside global, and keeps port 49152 because it is free.',
          actions: [
            { do: 'table', target: 'R1', side: 'top', title: 'show ip nat translations', cols: ['Pro', 'Inside global', 'Inside local', 'Outside global'], rows: [
              { new: true, cells: ['tcp', '203.0.113.2:49152', '10.1.10.10:49152', '198.51.100.80:443'] },
            ] },
            { do: 'highlight', target: 'R1' },
          ],
        },
        {
          caption: 'The translated packet crosses the internet. The portal only ever sees 203.0.113.2.',
          actions: [
            { do: 'packet', path: ['R1', 'NET', 'WEB'], label: '203.0.113.2:49152>:443', shape: 'packet' },
          ],
        },
        {
          caption: 'PC2 happens to pick source port 49152 as well. That inside global port is taken, so PAT picks another free one. Classic IOS takes the first free port in the same range, here 1024; other releases may choose differently. It records the pairing.',
          actions: [
            { do: 'packet', from: 'PC2', to: 'R1', label: '10.1.10.11:49152>:443', shape: 'packet' },
            { do: 'table', target: 'R1', side: 'top', title: 'show ip nat translations', cols: ['Pro', 'Inside global', 'Inside local', 'Outside global'], rows: [
              ['tcp', '203.0.113.2:49152', '10.1.10.10:49152', '198.51.100.80:443'],
              { new: true, cells: ['tcp', '203.0.113.2:1024', '10.1.10.11:49152', '198.51.100.80:443'] },
            ] },
          ],
        },
        {
          caption: 'PC2\'s packet goes out with the same public IP but port 1024. To the portal, these are just two connections from one address.',
          actions: [
            { do: 'packet', path: ['R1', 'NET', 'WEB'], label: '203.0.113.2:1024>:443', shape: 'packet' },
          ],
        },
        {
          caption: 'The portal replies to 203.0.113.2 port 1024. HPL-EDGE finds that port in its table and rewrites the destination back to 10.1.10.11:49152.',
          actions: [
            { do: 'packet', path: ['WEB', 'NET', 'R1'], label: ':443>203.0.113.2:1024', shape: 'packet', tone: 'good' },
            { do: 'note', target: 'R1', text: ':1024 = 10.1.10.11:49152', side: 'bottom' },
          ],
        },
        {
          caption: 'The reply lands on PC2, not PC1. The port number is the only thing that told them apart.',
          actions: [
            { do: 'packet', from: 'R1', to: 'PC2', label: ':443>10.1.10.11:49152', shape: 'packet', tone: 'good' },
          ],
        },
        {
          caption: 'Unsolicited traffic from outside, with no matching entry, has nowhere to go. That is a side effect, not a firewall, but it is why PAT feels protective.',
          actions: [
            { do: 'packet', path: ['WEB', 'NET', 'R1'], label: 'to 203.0.113.2:5000', shape: 'packet', tone: 'warn' },
            { do: 'drop', at: 'R1', label: 'no translation' },
          ],
        },
      ],
      takeaway: 'PAT (NAT overload) maps many inside local addresses to one inside global address and uses the port number to send each reply back to the right host.',
    },

    {
      id: 'sc-ntp-stratum',
      lesson: 'l4-2',
      obj: '4.2',
      title: 'NTP: passing the right time down the stairs',
      summary: 'A reference clock, a public server and three tiers of Harbor Point gear, each one stratum further from the truth.',
      stage: { w: 720, h: 330 },
      actors: [
        { id: 'GPS', kind: 'server', x: 70, y: 110, label: 'GPS clock', sub: 'stratum 0' },
        { id: 'NTP', kind: 'server', x: 200, y: 230, label: 'time.example.net', sub: 'stratum 1' },
        { id: 'R1', kind: 'router', x: 350, y: 110, label: 'HPL-EDGE', sub: 'clock: 01:52:10' },
        { id: 'R2', kind: 'router', x: 500, y: 230, label: 'HPL-CORE', sub: 'clock: 02:20:44' },
        { id: 'SW', kind: 'switch', x: 650, y: 110, label: 'HPL-SW3', sub: 'clock: 00:00:31' },
      ],
      links: [
        { id: 'L0', a: 'GPS', b: 'NTP', kind: 'serial', label: 'reference' },
        { id: 'L1', a: 'NTP', b: 'R1', kind: 'eth', label: 'via ISP' },
        { id: 'L2', a: 'R1', b: 'R2', kind: 'eth' },
        { id: 'L3', a: 'R2', b: 'SW', kind: 'eth' },
      ],
      steps: [
        {
          caption: 'It is 02:14 and three boxes disagree by half an hour. The switch thinks it booted a minute ago. Their syslog timestamps are useless for lining up an outage.',
          actions: [
            { do: 'highlight', target: 'R1', tone: 'warn' },
            { do: 'highlight', target: 'R2', tone: 'warn' },
            { do: 'highlight', target: 'SW', tone: 'warn' },
          ],
        },
        {
          caption: 'Stratum 0 is the reference itself: a GPS or atomic clock, never on the network. A server wired straight to it is stratum 1.',
          actions: [
            { do: 'packet', from: 'GPS', to: 'NTP', label: 'pulse per second', shape: 'hello' },
            { do: 'badge', target: 'NTP', text: 'stratum 1', tone: 'good' },
          ],
        },
        {
          caption: 'HPL-EDGE has `ntp server 192.0.2.123`. It sends an NTP client request (mode 3) to UDP 123, stamped with the time it left.',
          actions: [
            { do: 'packet', from: 'R1', to: 'NTP', label: 'NTP mode 3, UDP 123' },
          ],
        },
        {
          caption: 'The server replies (mode 4) with its receive and transmit timestamps. From four timestamps, HPL-EDGE works out the round-trip delay and its clock offset, then corrects its clock.',
          actions: [
            { do: 'packet', from: 'NTP', to: 'R1', label: 'mode 4 + timestamps', tone: 'good' },
            { do: 'label', target: 'R1', sub: 'clock: 02:14:07' },
            { do: 'badge', target: 'R1', text: 'stratum 2', tone: 'good' },
          ],
        },
        {
          caption: 'HPL-CORE points at HPL-EDGE with `ntp server 10.1.12.1`. One hop further from the reference means one stratum higher: 3.',
          actions: [
            { do: 'packet', from: 'R2', to: 'R1', label: 'NTP request' },
            { do: 'packet', from: 'R1', to: 'R2', label: 'NTP reply', tone: 'good', delay: 900 },
            { do: 'label', target: 'R2', sub: 'clock: 02:14:07' },
            { do: 'badge', target: 'R2', text: 'stratum 3', tone: 'good' },
          ],
        },
        {
          caption: 'The access switch syncs to HPL-CORE and lands at stratum 4. Now every log line from all three boxes uses the same clock.',
          actions: [
            { do: 'packet', from: 'SW', to: 'R2', label: 'NTP request' },
            { do: 'packet', from: 'R2', to: 'SW', label: 'NTP reply', tone: 'good', delay: 900 },
            { do: 'label', target: 'SW', sub: 'clock: 02:14:07' },
            { do: 'badge', target: 'SW', text: 'stratum 4', tone: 'good' },
          ],
        },
        {
          caption: 'Verify with `show ntp status` and `show ntp associations`. Lower stratum is closer to the reference. Stratum 16 means unsynchronized. A router with `ntp master` and no upstream claims stratum 8 by default.',
          actions: [
            { do: 'table', target: 'R2', title: 'show ntp status', cols: ['Field', 'Value'], rows: [
              { new: true, cells: ['Clock', 'synchronized'] },
              ['Stratum', '3'],
              ['Reference', '10.1.12.1'],
            ] },
          ],
        },
      ],
      takeaway: 'NTP clients sync over UDP 123 and take a stratum number one higher than their source; consistent time is what makes logs, certificates and AAA records trustworthy.',
    },

    {
      id: 'sc-dns-resolution',
      lesson: 'l4-3',
      obj: '4.3',
      title: 'DNS: one name, four questions',
      summary: 'A PC asks for a name once. The company resolver does the legwork through root, TLD and authoritative servers, then remembers.',
      stage: { w: 720, h: 360 },
      actors: [
        { id: 'PC1', kind: 'pc', x: 70, y: 110, label: 'Dispatch-07', sub: '10.10.20.57' },
        { id: 'PC2', kind: 'pc', x: 70, y: 280, label: 'Dispatch-12', sub: '10.10.20.62' },
        { id: 'RES', kind: 'server', x: 240, y: 200, label: 'HPL-DNS', sub: 'resolver 10.1.30.53' },
        { id: 'NET', kind: 'cloud', x: 410, y: 200, label: 'Internet' },
        { id: 'ROOT', kind: 'server', x: 590, y: 70, label: 'Root server', sub: '"."' },
        { id: 'TLD', kind: 'server', x: 640, y: 200, label: '.com TLD', sub: 'gTLD servers' },
        { id: 'AUTH', kind: 'server', x: 590, y: 320, label: 'ns1.example.com', sub: 'authoritative' },
      ],
      links: [
        { id: 'L1', a: 'PC1', b: 'RES', kind: 'eth' },
        { id: 'L2', a: 'PC2', b: 'RES', kind: 'eth' },
        { id: 'L3', a: 'RES', b: 'NET', kind: 'eth' },
        { id: 'L4', a: 'NET', b: 'ROOT', kind: 'eth' },
        { id: 'L5', a: 'NET', b: 'TLD', kind: 'eth' },
        { id: 'L6', a: 'NET', b: 'AUTH', kind: 'eth' },
      ],
      steps: [
        {
          caption: 'Dispatch-07 opens tracker.example.com. Nothing in its local cache, so it sends a recursive query for the A record, UDP port 53, to the DNS server DHCP gave it.',
          actions: [
            { do: 'packet', from: 'PC1', to: 'RES', label: 'A? tracker.example.com' },
          ],
        },
        {
          caption: 'HPL-DNS has no cached answer either, so it does the legwork with iterative queries, starting at a root server. The root does not know the host, but it refers HPL-DNS to the .com servers.',
          actions: [
            { do: 'packet', path: ['RES', 'NET', 'ROOT'], label: 'A? tracker.example.com' },
            { do: 'packet', path: ['ROOT', 'NET', 'RES'], label: 'referral: .com NS', tone: 'muted', delay: 1700 },
          ],
        },
        {
          caption: 'Next it asks a .com TLD server. Another referral: these are the name servers for example.com.',
          actions: [
            { do: 'packet', path: ['RES', 'NET', 'TLD'], label: 'A? tracker.example.com' },
            { do: 'packet', path: ['TLD', 'NET', 'RES'], label: 'referral: example.com', tone: 'muted', delay: 1700 },
          ],
        },
        {
          caption: 'Finally it asks ns1.example.com, which holds the zone. It returns the actual answer: an A record, 198.51.100.25, with a TTL of 3600 seconds.',
          actions: [
            { do: 'packet', path: ['RES', 'NET', 'AUTH'], label: 'A? tracker.example.com' },
            { do: 'packet', path: ['AUTH', 'NET', 'RES'], label: 'A 198.51.100.25 3600s', tone: 'good', delay: 1700 },
          ],
        },
        {
          caption: 'HPL-DNS caches the record for its TTL and hands the answer to Dispatch-07, which caches it too. Only now can the PC open a TCP connection to the real server.',
          actions: [
            { do: 'table', target: 'RES', side: 'top', title: 'Resolver cache', cols: ['Name', 'Type', 'Value', 'TTL'], rows: [
              { new: true, cells: ['tracker.example.com', 'A', '198.51.100.25', '3600'] },
            ] },
            { do: 'packet', from: 'RES', to: 'PC1', label: 'A 198.51.100.25', tone: 'good' },
          ],
        },
        {
          caption: 'Ten minutes later Dispatch-12 asks for the same name. The resolver answers from cache, TTL now about 3000, without touching the internet.',
          actions: [
            { do: 'packet', from: 'PC2', to: 'RES', label: 'A? tracker.example.com' },
            { do: 'packet', from: 'RES', to: 'PC2', label: 'A 198.51.100.25 cached', tone: 'good', delay: 900 },
            { do: 'note', target: 'RES', text: 'Cache hit' },
          ],
        },
        {
          caption: 'Troubleshooting tip: if `ping 198.51.100.25` works but `ping tracker.example.com` fails, the network is fine and DNS is the suspect. `nslookup` asks the question directly.',
          actions: [
            { do: 'table', target: 'RES', rows: null },
            { do: 'note', target: 'PC2', text: 'nslookup tracker.example.com' },
          ],
        },
      ],
      takeaway: 'Clients send one recursive query to their resolver; the resolver walks root, TLD and authoritative servers, then caches the answer for its TTL.',
    },

    {
      id: 'sc-snmp',
      lesson: 'l4-4',
      obj: '4.4',
      title: 'SNMP: polling on 161, alarms on 162',
      summary: 'The monitoring server asks a router how an interface is doing, then the router speaks up on its own when the link dies.',
      stage: { w: 720, h: 320 },
      actors: [
        { id: 'NMS', kind: 'server', x: 90, y: 240, label: 'HPL-NMS', sub: 'manager 10.1.30.70' },
        { id: 'SW', kind: 'switch', x: 270, y: 240, label: 'HPL-DIST1' },
        { id: 'R1', kind: 'router', x: 450, y: 240, label: 'HPL-EDGE', sub: 'SNMP agent' },
        { id: 'ISP', kind: 'cloud', x: 630, y: 240, label: 'ISP' },
      ],
      links: [
        { id: 'L1', a: 'NMS', b: 'SW', kind: 'eth' },
        { id: 'L2', a: 'SW', b: 'R1', kind: 'eth' },
        { id: 'L3', a: 'R1', b: 'ISP', kind: 'eth', label: 'Gi0/1' },
      ],
      steps: [
        {
          caption: 'The manager polls every five minutes. It sends a GetRequest to the agent on UDP 161 for one MIB object: ifOperStatus for Gi0/1, OID 1.3.6.1.2.1.2.2.1.8.2.',
          actions: [
            { do: 'packet', path: ['NMS', 'SW', 'R1'], label: 'Get ifOperStatus.2' },
          ],
        },
        {
          caption: 'The agent reads the value from its MIB and answers with a Response: up(1). The graph on the NOC wall stays green.',
          actions: [
            { do: 'packet', path: ['R1', 'SW', 'NMS'], label: 'Response: up(1)', tone: 'good' },
            { do: 'table', target: 'R1', side: 'top', title: 'MIB (IF-MIB)', cols: ['Object', 'Value'], rows: [
              ['ifDescr.2', 'GigabitEthernet0/1'],
              { new: true, cells: ['ifOperStatus.2', 'up(1)'] },
            ] },
          ],
        },
        {
          caption: 'At 03:41 the ISP circuit drops. The next poll is minutes away, so polling alone would leave a gap.',
          actions: [
            { do: 'state', target: 'L3', state: 'down' },
            { do: 'table', target: 'R1', side: 'top', title: 'MIB (IF-MIB)', cols: ['Object', 'Value'], rows: [
              ['ifDescr.2', 'GigabitEthernet0/1'],
              { new: true, cells: ['ifOperStatus.2', 'down(2)'] },
            ] },
          ],
        },
        {
          caption: 'The agent does not wait to be asked. It sends a linkDown Trap to the manager on UDP 162 right away. Traps are not acknowledged; an Inform is the version that is.',
          actions: [
            { do: 'packet', path: ['R1', 'SW', 'NMS'], label: 'Trap: linkDown Gi0/1', tone: 'stamp' },
            { do: 'badge', target: 'NMS', text: 'ALARM', tone: 'stamp' },
          ],
        },
        {
          caption: 'The manager can also change things with a SetRequest, which is why write access deserves care. SNMPv2c protects all of this with a community string sent in clear text.',
          actions: [
            { do: 'note', target: 'NMS', text: 'v2c: community in clear text' },
          ],
        },
        {
          caption: 'SNMPv3 adds real usernames, message authentication and, at the authPriv level, encryption. Same Gets, Responses and Traps, but nobody on the wire can read or forge them.',
          actions: [
            { do: 'badge', target: 'R1', text: 'v3 authPriv', tone: 'good' },
            { do: 'packet', path: ['NMS', 'SW', 'R1'], label: 'GetRequest (encrypted)', tone: 'good' },
          ],
        },
      ],
      takeaway: 'An SNMP manager polls agents with Get and Set on UDP 161, agents push Traps or Informs to UDP 162, and SNMPv3 authPriv is the secure choice.',
    },

    {
      id: 'sc-syslog',
      lesson: 'l4-5',
      obj: '4.5',
      title: 'Syslog: severities on their way to the log server',
      summary: 'A cable gets yanked and the messages fly. Watch which ones reach the server and which ones the trap level filters out.',
      stage: { w: 720, h: 360 },
      actors: [
        { id: 'SW', kind: 'switch', x: 90, y: 290, label: 'HPL-SW3' },
        { id: 'R1', kind: 'router', x: 300, y: 290, label: 'HPL-CORE' },
        { id: 'LOG', kind: 'server', x: 590, y: 290, label: 'HPL-LOG', sub: '10.1.30.60 UDP 514' },
      ],
      links: [
        { id: 'L1', a: 'SW', b: 'R1', kind: 'eth', label: 'Gi0/24' },
        { id: 'L0', a: 'SW', b: 'R1', kind: 'eth', label: 'Gi0/23' },
        { id: 'L2', a: 'R1', b: 'LOG', kind: 'eth' },
      ],
      steps: [
        {
          caption: 'Both devices have `logging host 10.1.30.60` (UDP 514). Severity runs 0 (emergencies) to 7 (debugging); lower is worse. HPL-SW3 keeps the default trap level, informational (6), so it sends levels 0-6.',
          actions: [
            { do: 'table', target: 'LOG', side: 'top', title: 'Severity levels', cols: ['Level', 'Keyword'], rows: [
              ['0', 'emergencies'], ['1', 'alerts'], ['2', 'critical'], ['3', 'errors'],
              ['4', 'warnings'], ['5', 'notifications'], ['6', 'informational'], ['7', 'debugging'],
            ] },
          ],
        },
        {
          caption: 'Someone unplugs uplink Gi0/24 at the switch. It logs %LINK-3-UPDOWN: facility LINK, severity 3 (errors), mnemonic UPDOWN. The message reaches the server over the second uplink, Gi0/23.',
          actions: [
            { do: 'state', target: 'L1', state: 'down' },
            { do: 'packet', path: ['SW', 'R1', 'LOG'], via: ['L0', null], label: '%LINK-3-UPDOWN', tone: 'warn' },
          ],
        },
        {
          caption: 'A second message follows a moment later: %LINEPROTO-5-UPDOWN, line protocol down, severity 5 (notifications). The server files both with their timestamps.',
          actions: [
            { do: 'packet', path: ['SW', 'R1', 'LOG'], via: ['L0', null], label: '%LINEPROTO-5-UPDOWN' },
            { do: 'table', target: 'LOG', side: 'top', title: 'HPL-LOG', cols: ['Sev', 'From', 'Message'], rows: [
              ['3', 'HPL-SW3', '%LINK-3-UPDOWN Gi0/24 down'],
              { new: true, cells: ['5', 'HPL-SW3', '%LINEPROTO-5-UPDOWN Gi0/24 down'] },
            ] },
          ],
        },
        {
          caption: 'HPL-CORE, however, has `logging trap warnings`. That sends levels 0 through 4 to the server and keeps everything less serious local.',
          actions: [
            { do: 'note', target: 'R1', text: 'logging trap warnings (0-4)', side: 'top' },
            { do: 'highlight', target: 'R1' },
          ],
        },
        {
          caption: 'Its own side of the link logs both messages too. %LINK-3-UPDOWN (severity 3) goes to the server, but %LINEPROTO-5-UPDOWN is severity 5, less severe than the trap level, so it stays on the router and never reaches the server.',
          actions: [
            { do: 'packet', from: 'R1', to: 'LOG', label: '%LINK-3-UPDOWN', tone: 'warn' },
            { do: 'table', target: 'LOG', side: 'top', title: 'HPL-LOG', cols: ['Sev', 'From', 'Message'], rows: [
              ['3', 'HPL-SW3', '%LINK-3-UPDOWN Gi0/24 down'],
              ['5', 'HPL-SW3', '%LINEPROTO-5-UPDOWN Gi0/24 down'],
              { new: true, cells: ['3', 'HPL-CORE', '%LINK-3-UPDOWN Gi0/1 down'] },
            ] },
            { do: 'note', target: 'R1', text: '%LINEPROTO-5-UPDOWN (kept local)' },
            { do: 'drop', at: 'R1', label: 'sev 5 > trap level 4' },
          ],
        },
        {
          caption: 'Later HPL-CORE runs short of memory and logs %SYS-2-MALLOCFAIL. Severity 2 (critical) is well inside 0-4, so it goes straight to the server.',
          actions: [
            { do: 'packet', from: 'R1', to: 'LOG', label: '%SYS-2-MALLOCFAIL', tone: 'stamp' },
            { do: 'table', target: 'LOG', side: 'top', title: 'HPL-LOG', cols: ['Sev', 'From', 'Message'], rows: [
              ['3', 'HPL-SW3', '%LINK-3-UPDOWN Gi0/24 down'],
              ['5', 'HPL-SW3', '%LINEPROTO-5-UPDOWN Gi0/24 down'],
              ['3', 'HPL-CORE', '%LINK-3-UPDOWN Gi0/1 down'],
              { new: true, cells: ['2', 'HPL-CORE', '%SYS-2-MALLOCFAIL memory'] },
            ] },
          ],
        },
        {
          caption: 'Logs are only useful if the clocks agree. Pair syslog with NTP and `service timestamps log datetime msec` so you can line up events across boxes.',
          actions: [
            { do: 'note', target: 'LOG', text: 'Sync clocks with NTP' },
          ],
        },
      ],
      takeaway: 'Syslog levels run 0 (emergencies) to 7 (debugging); `logging trap <level>` sends that level and everything more severe to the server on UDP 514.',
    },

    {
      id: 'sc-dhcp-relay',
      lesson: 'l4-6',
      obj: '4.6',
      title: 'DHCP across a relay: DORA by registered mail',
      summary: 'A PC at the Dundalk yard needs an address from a server two routers away. Broadcasts stop at the router, unless it relays them.',
      stage: { w: 720, h: 320 },
      actors: [
        { id: 'PC1', kind: 'pc', x: 70, y: 230, label: 'Yard-PC', sub: '0.0.0.0' },
        { id: 'R1', kind: 'router', x: 260, y: 230, label: 'HPL-DUNDALK', sub: 'Gi0/0 10.2.20.1' },
        { id: 'R2', kind: 'router', x: 450, y: 230, label: 'HPL-CORE' },
        { id: 'SRV', kind: 'server', x: 640, y: 230, label: 'HPL-DHCP', sub: '10.1.30.10' },
      ],
      links: [
        { id: 'L1', a: 'PC1', b: 'R1', kind: 'eth', label: 'VLAN 20' },
        { id: 'L2', a: 'R1', b: 'R2', kind: 'eth' },
        { id: 'L3', a: 'R2', b: 'SRV', kind: 'eth' },
      ],
      steps: [
        {
          caption: 'Yard-PC boots with no address. It broadcasts a DHCPDISCOVER from 0.0.0.0, UDP 68, to 255.255.255.255, UDP 67. Routers do not forward broadcasts, so it dies at HPL-DUNDALK.',
          actions: [
            { do: 'packet', from: 'PC1', to: 'R1', label: 'DISCOVER (broadcast)', tone: 'warn' },
            { do: 'drop', at: 'R1', label: 'broadcast stops here' },
          ],
        },
        {
          caption: 'The fix goes on the interface facing the clients: `ip helper-address 10.1.30.10` on Gi0/0. The router now acts as a DHCP relay agent for that segment.',
          actions: [
            { do: 'note', target: 'R1', text: 'ip helper-address 10.1.30.10' },
            { do: 'highlight', target: 'R1' },
          ],
        },
        {
          caption: 'The next DISCOVER arrives. The relay rewrites it as a unicast from 10.2.20.1 to 10.1.30.10 and fills in giaddr with its own Gi0/0 address, so the server knows which subnet is asking.',
          actions: [
            { do: 'packet', from: 'PC1', to: 'R1', label: 'DISCOVER (broadcast)' },
            { do: 'table', target: 'R1', side: 'top', title: 'Relayed DISCOVER', cols: ['Field', 'Value'], rows: [
              { new: true, cells: ['Src IP', '10.2.20.1'] }, { new: true, cells: ['Dst IP', '10.1.30.10'] },
              { new: true, cells: ['giaddr', '10.2.20.1'] }, ['chaddr', 'PC MAC 0050.7966.0042'],
            ] },
          ],
        },
        {
          caption: 'The unicast is routed normally across the core to the server.',
          actions: [
            { do: 'packet', path: ['R1', 'R2', 'SRV'], label: 'DISCOVER (unicast)', shape: 'packet' },
          ],
        },
        {
          caption: 'The server matches giaddr 10.2.20.1 to its 10.2.20.0/24 pool, picks 10.2.20.50, and sends a DHCPOFFER back to the relay at the giaddr address.',
          actions: [
            { do: 'table', target: 'R1', rows: null },
            { do: 'packet', path: ['SRV', 'R2', 'R1'], label: 'OFFER 10.2.20.50', shape: 'packet', tone: 'good' },
          ],
        },
        {
          caption: 'The relay passes the OFFER onto the yard LAN. It includes the address, mask, default gateway 10.2.20.1, DNS server and lease time.',
          actions: [
            { do: 'packet', from: 'R1', to: 'PC1', label: 'OFFER 10.2.20.50', tone: 'good' },
          ],
        },
        {
          caption: 'Yard-PC broadcasts a DHCPREQUEST for 10.2.20.50 (broadcast so any other server knows its offer lost). The relay forwards it as a unicast just like the DISCOVER.',
          actions: [
            { do: 'packet', path: ['PC1', 'R1', 'R2', 'SRV'], label: 'REQUEST 10.2.20.50' },
          ],
        },
        {
          caption: 'The server commits the lease and sends a DHCPACK. The PC configures itself: Discover, Offer, Request, Acknowledge, done.',
          actions: [
            { do: 'packet', path: ['SRV', 'R2', 'R1', 'PC1'], label: 'ACK', tone: 'good' },
            { do: 'label', target: 'PC1', sub: '10.2.20.50/24' },
            { do: 'badge', target: 'PC1', text: 'Lease 10.2.20.50', tone: 'good' },
          ],
        },
        {
          caption: 'At half the lease time (T1) the PC renews by unicasting a REQUEST straight to the server, routed like any other packet. No broadcast, so no relay needed. If that fails, it broadcasts at 87.5% (T2).',
          actions: [
            { do: 'packet', path: ['PC1', 'R1', 'R2', 'SRV'], label: 'REQUEST (renew)', shape: 'packet' },
          ],
        },
      ],
      takeaway: '`ip helper-address` on the client-facing interface turns DHCP broadcasts into unicasts to the server and sets giaddr so the server picks the right pool.',
    },

    {
      id: 'sc-qos-llq',
      lesson: 'l4-7',
      obj: '4.7',
      title: 'QoS: voice jumps the queue on a jammed WAN link',
      summary: 'Classify, mark, queue, then police or shape: one congested uplink, three kinds of traffic.',
      stage: { w: 720, h: 340 },
      actors: [
        { id: 'PH', kind: 'phone', x: 60, y: 100, label: 'IP phone', sub: 'dock office' },
        { id: 'PC', kind: 'pc', x: 60, y: 290, label: 'Backup PC' },
        { id: 'SW', kind: 'switch', x: 190, y: 200, label: 'HPL-SW1', sub: 'trust boundary' },
        { id: 'R1', kind: 'router', x: 340, y: 200, label: 'HPL-DUNDALK', sub: 'LLQ outbound' },
        { id: 'ISP', kind: 'cloud', x: 500, y: 200, label: 'Carrier', sub: '50 Mbps CIR' },
        { id: 'HQ', kind: 'router', x: 650, y: 200, label: 'HPL-HQ' },
      ],
      links: [
        { id: 'L1', a: 'PH', b: 'SW', kind: 'eth' },
        { id: 'L2', a: 'PC', b: 'SW', kind: 'eth' },
        { id: 'L3', a: 'SW', b: 'R1', kind: 'trunk' },
        { id: 'L4', a: 'R1', b: 'ISP', kind: 'serial', label: '50 Mbps' },
        { id: 'L5', a: 'ISP', b: 'HQ', kind: 'serial' },
      ],
      steps: [
        {
          caption: 'Classification and marking happen at the edge. The phone marks its RTP voice DSCP EF (46). The switch trusts the phone but re-marks anything the PC sends to DSCP 0, so nobody promotes their own downloads.',
          actions: [
            { do: 'packet', from: 'PH', to: 'SW', label: 'voice DSCP EF', tone: 'good', shape: 'packet' },
            { do: 'packet', from: 'PC', to: 'SW', label: 'backup DSCP 0', tone: 'muted', shape: 'packet' },
            { do: 'note', target: 'SW', text: 'Trust boundary' },
          ],
        },
        {
          caption: 'The router\'s policy-map sorts traffic into classes by marking. Voice gets a strict priority queue (LLQ), the shipping app gets a guaranteed share (CBWFQ), everything else takes what is left.',
          actions: [
            { do: 'table', target: 'R1', side: 'top', title: 'policy-map WAN-OUT', cols: ['Class', 'Match', 'Treatment'], rows: [
              ['VOICE', 'DSCP EF', 'priority 10000 (kbps)'],
              ['SHIPPING', 'DSCP AF31', 'bandwidth 20000'],
              ['class-default', 'anything else', 'fair-queue'],
            ] },
          ],
        },
        {
          caption: 'A nightly backup floods the uplink. Queues only matter when there is congestion, and now there is: more traffic wants out than 50 Mbps can carry.',
          actions: [
            { do: 'packet', path: ['PC', 'SW', 'R1'], label: 'backup DSCP 0', tone: 'muted', shape: 'packet' },
            { do: 'packet', path: ['PH', 'SW', 'R1'], label: 'voice EF', tone: 'good', shape: 'packet' },
            { do: 'highlight', target: 'L4', tone: 'warn' },
            { do: 'note', target: 'R1', text: 'Queue filling', side: 'bottom' },
          ],
        },
        {
          caption: 'The scheduler always empties the priority queue first, so voice leaves immediately. Voice needs roughly 150 ms or less one way, 30 ms of jitter and 1% loss.',
          actions: [
            { do: 'packet', path: ['R1', 'ISP', 'HQ'], label: 'voice EF', tone: 'good', shape: 'packet' },
          ],
        },
        {
          caption: 'During congestion the priority queue is also policed to its 10 Mbps, so a flood of EF traffic cannot starve the other classes. Shipping app traffic marked AF31 gets its guaranteed 20 Mbps next.',
          actions: [
            { do: 'packet', path: ['R1', 'ISP', 'HQ'], label: 'shipping AF31', shape: 'packet' },
          ],
        },
        {
          caption: 'The default queue fills up and the router starts discarding the backup traffic. TCP notices the loss and slows down; with WRED, drops begin early and at random before the queue is full.',
          actions: [
            { do: 'drop', at: 'R1', label: 'tail drop: class-default' },
          ],
        },
        {
          caption: 'The carrier sells 50 Mbps on a faster port and polices: anything above the contract is dropped (or re-marked) instantly, no buffering.',
          actions: [
            { do: 'packet', path: ['R1', 'ISP'], label: 'burst > CIR', tone: 'warn', shape: 'packet' },
            { do: 'drop', at: 'ISP', label: 'policed' },
          ],
        },
        {
          caption: 'So HPL-DUNDALK shapes its outbound traffic to 50 Mbps instead. Shaping buffers the excess and sends it a little later, trading some delay for no drops at the carrier.',
          actions: [
            { do: 'badge', target: 'R1', text: 'shape 50M', tone: 'good' },
            { do: 'packet', path: ['R1', 'ISP', 'HQ'], label: 'smoothed traffic', tone: 'good', shape: 'packet' },
          ],
        },
      ],
      takeaway: 'Mark at the trust boundary, give voice a policed LLQ priority queue, guarantee bandwidth to important classes, and shape your egress so the provider\'s policer has nothing to drop.',
    },

    {
      id: 'sc-tftp-ftp-backup',
      lesson: 'l4-9',
      obj: '4.9',
      title: 'Backing up a config: TFTP versus FTP',
      summary: 'Copying running-config off the core router twice: once with lock-step TFTP, once with logged-in FTP.',
      stage: { w: 720, h: 340 },
      actors: [
        { id: 'R1', kind: 'router', x: 140, y: 190, label: 'HPL-CORE', sub: 'copy run ...' },
        { id: 'TF', kind: 'server', x: 560, y: 90, label: 'TFTP server', sub: '10.1.30.69' },
        { id: 'FT', kind: 'server', x: 560, y: 290, label: 'FTP server', sub: '10.1.30.21' },
      ],
      links: [
        { id: 'L1', a: 'R1', b: 'TF', kind: 'eth', label: 'UDP' },
        { id: 'L2', a: 'R1', b: 'FT', kind: 'eth', label: 'TCP' },
      ],
      steps: [
        {
          caption: '`copy running-config tftp://10.1.30.69/core-confg`. The router sends a Write Request (WRQ) to UDP port 69. No username, no password: TFTP has no login at all.',
          actions: [
            { do: 'packet', from: 'R1', to: 'TF', label: 'WRQ core-confg, UDP 69' },
          ],
        },
        {
          caption: 'The server answers ACK block 0 from a fresh port, and the rest of the transfer uses that port pair.',
          actions: [
            { do: 'packet', from: 'TF', to: 'R1', label: 'ACK block 0', tone: 'good' },
          ],
        },
        {
          caption: 'Data goes in 512-byte blocks, one at a time. The router sends block 1 and waits.',
          actions: [
            { do: 'packet', from: 'R1', to: 'TF', label: 'DATA block 1 (512 B)' },
          ],
        },
        {
          caption: 'Only after ACK 1 does block 2 go out. TFTP gets its reliability from this lock-step, not from TCP, which is also why it is slow over long links.',
          actions: [
            { do: 'packet', from: 'TF', to: 'R1', label: 'ACK block 1', tone: 'good' },
            { do: 'note', target: 'TF', text: 'One block in flight' },
          ],
        },
        {
          caption: 'A block shorter than 512 bytes signals the end of the file. Its ACK finishes the transfer.',
          actions: [
            { do: 'packet', from: 'R1', to: 'TF', label: 'DATA block 9 (212 B)' },
            { do: 'packet', from: 'TF', to: 'R1', label: 'ACK block 9', tone: 'good', delay: 1800 },
            { do: 'badge', target: 'TF', text: 'core-confg saved', tone: 'good' },
          ],
        },
        {
          caption: 'Now FTP. The router opens a control connection to TCP 21 and logs in with the credentials from `ip ftp username` and `ip ftp password`.',
          actions: [
            { do: 'packet', from: 'R1', to: 'FT', label: 'USER hpl-backup', shape: 'segment' },
            { do: 'packet', from: 'FT', to: 'R1', label: '331 Password required', shape: 'segment', tone: 'muted', delay: 1800 },
          ],
        },
        {
          caption: 'The password follows. Note it is still clear text on the wire: FTP authenticates, but it does not encrypt.',
          actions: [
            { do: 'packet', from: 'R1', to: 'FT', label: 'PASS ********', shape: 'segment', tone: 'warn' },
            { do: 'packet', from: 'FT', to: 'R1', label: '230 Logged in', shape: 'segment', tone: 'good', delay: 1800 },
          ],
        },
        {
          caption: 'The file itself travels on a separate data connection (TCP 20 in active mode, or a server-chosen port in passive mode), while commands stay on port 21.',
          actions: [
            { do: 'packet', from: 'R1', to: 'FT', label: 'STOR core-confg (data)', shape: 'segment' },
            { do: 'badge', target: 'FT', text: 'core-confg saved', tone: 'good' },
          ],
        },
      ],
      takeaway: 'TFTP is UDP 69 with no login and lock-step 512-byte blocks; FTP uses TCP 21 for control plus a separate data connection and requires a username and password.',
    },

    /* ================================================================ *
     * 5.0 SECURITY FUNDAMENTALS
     * ================================================================ */
    {
      id: 'sc-ipsec-s2s',
      lesson: 'l5-5',
      obj: '5.5',
      title: 'Site-to-site IPsec: a sealed envelope across the internet',
      summary: 'A packet from the Dundalk yard to HQ gets wrapped in ESP, crosses the internet unreadable, and is unwrapped on the other side.',
      stage: { w: 720, h: 340 },
      actors: [
        { id: 'PC', kind: 'pc', x: 60, y: 250, label: 'Yard-PC', sub: '10.2.10.25' },
        { id: 'BR', kind: 'router', x: 200, y: 250, label: 'HPL-DUNDALK', sub: '198.51.100.2' },
        { id: 'NET', kind: 'cloud', x: 400, y: 100, label: 'Internet' },
        { id: 'HQ', kind: 'router', x: 520, y: 250, label: 'HPL-HQ', sub: '203.0.113.2' },
        { id: 'SRV', kind: 'server', x: 660, y: 250, label: 'TRACKER', sub: '10.1.30.50' },
      ],
      links: [
        { id: 'L1', a: 'PC', b: 'BR', kind: 'eth' },
        { id: 'L2', a: 'BR', b: 'NET', kind: 'eth' },
        { id: 'L3', a: 'NET', b: 'HQ', kind: 'eth' },
        { id: 'L4', a: 'HQ', b: 'SRV', kind: 'eth' },
        { id: 'TUN', a: 'BR', b: 'HQ', kind: 'tunnel', label: 'IPsec tunnel' },
      ],
      steps: [
        {
          caption: 'Yard-PC sends an ordinary packet to 10.1.30.50. HPL-DUNDALK sees it matches the traffic it is told to protect (10.2.0.0/16 to 10.1.0.0/16).',
          actions: [
            { do: 'packet', from: 'PC', to: 'BR', label: '10.2.10.25>10.1.30.50', shape: 'packet' },
            { do: 'note', target: 'BR', text: 'Interesting traffic' },
          ],
        },
        {
          caption: 'No tunnel yet, so the two routers run IKE on UDP 500. They authenticate each other (pre-shared key or certificates) and use Diffie-Hellman to agree on keys without ever sending them.',
          actions: [
            { do: 'packet', path: ['BR', 'NET', 'HQ'], label: 'IKE, UDP 500', shape: 'segment' },
            { do: 'packet', path: ['HQ', 'NET', 'BR'], label: 'IKE reply', shape: 'segment', delay: 1700 },
          ],
        },
        {
          caption: 'IKE then builds the IPsec security associations: which algorithms (say AES for encryption, SHA-256 for integrity), which keys, and an SPI number to label packets. The tunnel is up.',
          actions: [
            { do: 'state', target: 'TUN', state: 'up' },
            { do: 'badge', target: 'BR', text: 'SA up', tone: 'good' },
            { do: 'badge', target: 'HQ', text: 'SA up', tone: 'good' },
          ],
        },
        {
          caption: 'In tunnel mode ESP encrypts the entire original packet, inner IP header included, adds an integrity check, and wraps it all in a new outer IP header between the two public addresses.',
          actions: [
            { do: 'table', target: 'BR', side: 'top', title: 'ESP tunnel-mode packet', cols: ['Part', 'Contents'], rows: [
              { new: true, cells: ['Outer IP', '198.51.100.2 > 203.0.113.2, protocol 50'] },
              ['ESP header', 'SPI, sequence number'],
              ['Encrypted', 'inner IP 10.2.10.25 > 10.1.30.50 + data'],
              ['ESP trailer + ICV', 'padding, integrity check'],
            ] },
          ],
        },
        {
          caption: 'The ESP packet crosses the internet. Every router along the way routes on the outer header only. Nobody in between can read or quietly change what is inside.',
          actions: [
            { do: 'packet', path: ['BR', 'NET', 'HQ'], label: 'ESP to 203.0.113.2', shape: 'packet', tone: 'good' },
            { do: 'highlight', target: 'TUN', tone: 'good' },
            { do: 'note', target: 'NET', text: 'Sees only public IPs' },
          ],
        },
        {
          caption: 'HPL-HQ uses the SPI to find the right SA, checks the integrity value and sequence number, decrypts, strips the outer header and routes the original packet to the server.',
          actions: [
            { do: 'table', target: 'BR', rows: null },
            { do: 'packet', from: 'HQ', to: 'SRV', label: '10.2.10.25>10.1.30.50', shape: 'packet', tone: 'good' },
          ],
        },
        {
          caption: 'If someone on the internet alters a packet, or replays an old one, the integrity or sequence check fails and HPL-HQ discards it.',
          actions: [
            { do: 'packet', path: ['NET', 'HQ'], label: 'tampered ESP', shape: 'packet', tone: 'warn' },
            { do: 'drop', at: 'HQ', label: 'integrity check failed' },
          ],
        },
        {
          caption: 'Plain IPsec carries only unicast. To run OSPF between sites you put GRE inside IPsec, which carries multicast and still gets encrypted.',
          actions: [
            { do: 'note', target: 'TUN', text: 'GRE over IPsec for OSPF' },
          ],
        },
      ],
      takeaway: 'A site-to-site IPsec VPN uses IKE to agree on keys, then ESP to encrypt and authenticate each packet inside a new outer IP header between the two peers.',
    },

    {
      id: 'sc-acl-topdown',
      lesson: 'l5-6',
      obj: '5.6',
      title: 'ACLs: top to bottom, first match wins',
      summary: 'An extended ACL near the source and a standard ACL near the destination sort three kinds of traffic.',
      stage: { w: 720, h: 370 },
      actors: [
        { id: 'PC1', kind: 'pc', x: 80, y: 180, label: 'Sales PC', sub: '10.1.10.10' },
        { id: 'PC2', kind: 'laptop', x: 80, y: 320, label: 'Guest laptop', sub: '10.1.20.20' },
        { id: 'R1', kind: 'router', x: 330, y: 280, label: 'HPL-CORE' },
        { id: 'SRV', kind: 'server', x: 630, y: 280, label: 'TRACKER', sub: '10.1.30.50' },
      ],
      links: [
        { id: 'L1', a: 'PC1', b: 'R1', kind: 'eth', label: 'Gi0/0' },
        { id: 'L2', a: 'PC2', b: 'R1', kind: 'eth', label: 'Gi0/1' },
        { id: 'L3', a: 'R1', b: 'SRV', kind: 'eth', label: 'Gi0/2' },
      ],
      steps: [
        {
          caption: 'Extended ACL SALES-IN sits inbound on Gi0/0, close to the Sales source. It can match protocol, source, destination and port. Every ACL ends with an invisible deny.',
          actions: [
            { do: 'table', target: 'R1', side: 'top', title: 'SALES-IN (in Gi0/0)', cols: ['Seq', 'Rule'], rows: [
              ['10', 'permit tcp 10.1.10.0 0.0.0.255 host 10.1.30.50 eq 443'],
              ['20', 'deny tcp 10.1.10.0 0.0.0.255 host 10.1.30.50 eq 22'],
              ['30', 'permit icmp 10.1.10.0 0.0.0.255 any echo'],
              ['--', 'deny ip any any (implicit)'],
            ] },
          ],
        },
        {
          caption: 'Sales PC opens HTTPS to the tracker. Line 10 matches on the first try: permit. The router stops reading and forwards it.',
          actions: [
            { do: 'table', target: 'R1', side: 'top', title: 'SALES-IN (in Gi0/0)', cols: ['Seq', 'Rule'], rows: [
              { new: true, cells: ['10', 'permit tcp 10.1.10.0 0.0.0.255 host 10.1.30.50 eq 443'] },
              ['20', 'deny tcp 10.1.10.0 0.0.0.255 host 10.1.30.50 eq 22'],
              ['30', 'permit icmp 10.1.10.0 0.0.0.255 any echo'],
              ['--', 'deny ip any any (implicit)'],
            ] },
            { do: 'packet', path: ['PC1', 'R1', 'SRV'], label: 'TCP 443', tone: 'good', shape: 'packet' },
          ],
        },
        {
          caption: 'Next, SSH to the same server. Line 10 fails on the port, line 20 matches: deny. The packet is dropped and the later lines are never read.',
          actions: [
            { do: 'table', target: 'R1', side: 'top', title: 'SALES-IN (in Gi0/0)', cols: ['Seq', 'Rule'], rows: [
              ['10', 'permit tcp 10.1.10.0 0.0.0.255 host 10.1.30.50 eq 443'],
              { new: true, cells: ['20', 'deny tcp 10.1.10.0 0.0.0.255 host 10.1.30.50 eq 22'] },
              ['30', 'permit icmp 10.1.10.0 0.0.0.255 any echo'],
              ['--', 'deny ip any any (implicit)'],
            ] },
            { do: 'packet', from: 'PC1', to: 'R1', label: 'TCP 22', tone: 'warn', shape: 'packet' },
            { do: 'drop', at: 'R1', label: 'deny, line 20' },
          ],
        },
        {
          caption: 'Then Telnet, TCP 23. No line mentions it, so it falls through to the implicit deny at the bottom. It never shows up in the hit counters, which is why some admins add an explicit `deny ip any any log`.',
          actions: [
            { do: 'table', target: 'R1', side: 'top', title: 'SALES-IN (in Gi0/0)', cols: ['Seq', 'Rule'], rows: [
              ['10', 'permit tcp 10.1.10.0 0.0.0.255 host 10.1.30.50 eq 443'],
              ['20', 'deny tcp 10.1.10.0 0.0.0.255 host 10.1.30.50 eq 22'],
              ['30', 'permit icmp 10.1.10.0 0.0.0.255 any echo'],
              { new: true, cells: ['--', 'deny ip any any (implicit)'] },
            ] },
            { do: 'packet', from: 'PC1', to: 'R1', label: 'TCP 23', tone: 'warn', shape: 'packet' },
            { do: 'drop', at: 'R1', label: 'implicit deny' },
          ],
        },
        {
          caption: 'Now a standard ACL. It can only match the source address, so it goes close to the destination: outbound on Gi0/2, toward the server, where it cannot block guests from anything else.',
          actions: [
            { do: 'table', target: 'R1', side: 'top', title: 'ACL 10 (out Gi0/2)', cols: ['Seq', 'Rule'], rows: [
              ['10', 'deny 10.1.20.0 0.0.0.255'],
              ['20', 'permit any'],
              ['--', 'deny any (implicit)'],
            ] },
            { do: 'highlight', target: 'L3' },
          ],
        },
        {
          caption: 'The guest laptop tries the tracker. It is routed toward Gi0/2, and on the way out line 10 matches its 10.1.20.0/24 source: denied.',
          actions: [
            { do: 'table', target: 'R1', side: 'top', title: 'ACL 10 (out Gi0/2)', cols: ['Seq', 'Rule'], rows: [
              { new: true, cells: ['10', 'deny 10.1.20.0 0.0.0.255'] },
              ['20', 'permit any'],
              ['--', 'deny any (implicit)'],
            ] },
            { do: 'packet', from: 'PC2', to: 'R1', label: 'to 10.1.30.50', tone: 'warn', shape: 'packet' },
            { do: 'drop', at: 'R1', label: 'ACL 10 deny' },
          ],
        },
        {
          caption: 'Sales HTTPS passes both lists: line 10 of SALES-IN on the way in, line 20 `permit any` of ACL 10 on the way out. Without that `permit any`, the implicit deny would block everyone.',
          actions: [
            { do: 'table', target: 'R1', side: 'top', title: 'ACL 10 (out Gi0/2)', cols: ['Seq', 'Rule'], rows: [
              ['10', 'deny 10.1.20.0 0.0.0.255'],
              { new: true, cells: ['20', 'permit any'] },
              ['--', 'deny any (implicit)'],
            ] },
            { do: 'packet', path: ['PC1', 'R1', 'SRV'], label: 'TCP 443', tone: 'good', shape: 'packet' },
          ],
        },
      ],
      takeaway: 'An ACL is read top-down and the first match wins; anything that matches no line hits the implicit deny. Put extended ACLs near the source and standard ACLs near the destination.',
    },

    {
      id: 'sc-port-security',
      lesson: 'l5-7',
      obj: '5.7',
      title: 'Port security: one desk, one MAC, no exceptions',
      summary: 'A switch port learns the right MAC with sticky learning, then shuts itself down when a stranger plugs in.',
      stage: { w: 720, h: 320 },
      actors: [
        { id: 'PC1', kind: 'pc', x: 110, y: 220, label: 'Desk 14', sub: 'MAC 0050.7966.0014' },
        { id: 'SW', kind: 'switch', x: 360, y: 220, label: 'HPL-SALES-SW', sub: 'Gi0/14' },
        { id: 'R1', kind: 'router', x: 610, y: 220, label: 'HPL-CORE' },
      ],
      links: [
        { id: 'L1', a: 'PC1', b: 'SW', kind: 'eth', label: 'Gi0/14' },
        { id: 'L2', a: 'SW', b: 'R1', kind: 'trunk' },
      ],
      steps: [
        {
          caption: 'Gi0/14 is an access port with `switchport port-security`, a maximum of 1 MAC, `mac-address sticky`, and the default violation mode, shutdown. No MAC learned yet.',
          actions: [
            { do: 'table', target: 'SW', side: 'top', title: 'show port-security int gi0/14', cols: ['Field', 'Value'], rows: [
              ['Port Status', 'Secure-up'], ['Violation Mode', 'Shutdown'],
              ['Maximum MAC', '1'], ['Sticky MAC', '0'], ['Violations', '0'],
            ] },
          ],
        },
        {
          caption: 'Desk 14 sends its first frame. The switch learns 0050.7966.0014 and, because sticky is on, writes it into the running-config as a secure MAC.',
          actions: [
            { do: 'packet', from: 'PC1', to: 'SW', label: 'src 0050.7966.0014' },
            { do: 'table', target: 'SW', side: 'top', title: 'show port-security int gi0/14', cols: ['Field', 'Value'], rows: [
              ['Port Status', 'Secure-up'], ['Violation Mode', 'Shutdown'],
              ['Maximum MAC', '1'], { new: true, cells: ['Sticky MAC', '1 (0050.7966.0014)'] }, ['Violations', '0'],
            ] },
          ],
        },
        {
          caption: 'Traffic flows as normal. Remember `copy running-config startup-config`, or the sticky MAC is forgotten at the next reload.',
          actions: [
            { do: 'packet', path: ['PC1', 'SW', 'R1'], label: 'normal traffic', tone: 'good' },
            { do: 'note', target: 'SW', text: 'sticky 0050.7966.0014' },
          ],
        },
        {
          caption: 'At 01:30 someone unplugs Desk 14 and plugs in a personal laptop with MAC a4c3.f0aa.1234.',
          actions: [
            { do: 'label', target: 'PC1', sub: 'MAC a4c3.f0aa.1234 (?)' },
            { do: 'highlight', target: 'PC1', tone: 'warn' },
          ],
        },
        {
          caption: 'Its first frame carries a source MAC that is not the secure one, and the port is already at its maximum of 1. That is a violation.',
          actions: [
            { do: 'packet', from: 'PC1', to: 'SW', label: 'src a4c3.f0aa.1234', tone: 'warn' },
            { do: 'drop', at: 'SW', label: 'violation' },
          ],
        },
        {
          caption: 'In shutdown mode the port goes err-disabled immediately. The switch logs %PORT_SECURITY-2-PSECURE_VIOLATION and %PM-4-ERR_DISABLE, and the violation counter ticks to 1.',
          actions: [
            { do: 'state', target: 'SW:L1', state: 'err' },
            { do: 'table', target: 'SW', side: 'top', title: 'show port-security int gi0/14', cols: ['Field', 'Value'], rows: [
              { new: true, cells: ['Port Status', 'Secure-shutdown'] }, ['Violation Mode', 'Shutdown'],
              ['Maximum MAC', '1'], ['Sticky MAC', '1 (0050.7966.0014)'], { new: true, cells: ['Violations', '1'] },
            ] },
          ],
        },
        {
          caption: 'The other modes are gentler. Restrict drops the stranger\'s frames, logs them and counts them but keeps the port up. Protect just drops them silently.',
          actions: [
            { do: 'note', target: 'SW', text: 'protect / restrict / shutdown' },
          ],
        },
        {
          caption: 'Desk 14 goes back in, but the port stays err-disabled until someone clears the cause and bounces it with `shutdown` then `no shutdown` (or errdisable recovery is configured). After the bounce, Desk 14 is back online.',
          actions: [
            { do: 'label', target: 'PC1', sub: 'MAC 0050.7966.0014' },
            { do: 'highlight', target: 'PC1', tone: 'good' },
            { do: 'state', target: 'SW:L1', state: 'up' },
            { do: 'table', target: 'SW', rows: null },
            { do: 'packet', path: ['PC1', 'SW', 'R1'], label: 'back online', tone: 'good' },
          ],
        },
      ],
      takeaway: 'Port security limits which and how many MACs a port accepts; in the default shutdown mode a violation err-disables the port until an admin bounces it.',
    },

    {
      id: 'sc-snooping-dai',
      lesson: 'l5-7',
      obj: '5.7',
      title: 'DHCP snooping and DAI: the switch checks IDs at the door',
      summary: 'A rogue DHCP server and a spoofed ARP, both stopped by the access switch using one binding table.',
      stage: { w: 720, h: 340 },
      actors: [
        { id: 'PC1', kind: 'pc', x: 110, y: 110, label: 'Dispatch-07', sub: '0.0.0.0' },
        { id: 'EVE', kind: 'laptop', x: 110, y: 300, label: 'Rogue laptop', sub: 'runs a DHCP server' },
        { id: 'SW', kind: 'switch', x: 360, y: 230, label: 'HPL-SW3', sub: 'VLAN 20' },
        { id: 'R1', kind: 'router', x: 610, y: 90, label: 'HPL-DIST1', sub: 'gw 10.10.20.1, relay' },
      ],
      links: [
        { id: 'L1', a: 'PC1', b: 'SW', kind: 'eth', label: 'Gi0/3 untrusted' },
        { id: 'L2', a: 'EVE', b: 'SW', kind: 'eth', label: 'Gi0/9 untrusted' },
        { id: 'L3', a: 'SW', b: 'R1', kind: 'trunk', label: 'Gi0/1 trusted' },
      ],
      steps: [
        {
          caption: '`ip dhcp snooping` and `ip dhcp snooping vlan 20` are on. Every port is untrusted by default; only the uplink toward the real DHCP path gets `ip dhcp snooping trust`.',
          actions: [
            { do: 'state', target: 'L3', state: 'up' },
            { do: 'highlight', target: 'L3', tone: 'good' },
            { do: 'note', target: 'SW', text: 'Only Gi0/1 trusted' },
          ],
        },
        {
          caption: 'Dispatch-07 broadcasts a DHCPDISCOVER. Client messages are allowed on untrusted ports, so the switch floods it through VLAN 20, rogue laptop included.',
          actions: [
            { do: 'packet', from: 'PC1', to: 'SW', label: 'DISCOVER (broadcast)' },
            { do: 'flood', from: 'SW', to: ['R1', 'EVE'], label: 'DISCOVER', delay: 1100 },
          ],
        },
        {
          caption: 'The rogue answers first with an OFFER naming itself as the default gateway. But OFFER is a server message arriving on an untrusted port, so snooping discards it.',
          actions: [
            { do: 'packet', from: 'EVE', to: 'SW', label: 'OFFER, gw = me', tone: 'stamp' },
            { do: 'drop', at: 'SW', label: 'server msg on untrusted port' },
          ],
        },
        {
          caption: 'The real OFFER comes in on trusted Gi0/1 and passes. Request and ACK follow, and the PC gets 10.10.20.57.',
          actions: [
            { do: 'packet', path: ['R1', 'SW', 'PC1'], label: 'OFFER/ACK 10.10.20.57', tone: 'good' },
            { do: 'label', target: 'PC1', sub: '10.10.20.57' },
          ],
        },
        {
          caption: 'Watching that ACK, the switch records who got what, where. This binding table is what the other Layer 2 defenses check against.',
          actions: [
            { do: 'table', target: 'SW', side: 'right', title: 'show ip dhcp snooping binding', cols: ['MAC', 'IP', 'VLAN', 'Port'], rows: [
              { new: true, cells: ['0050.7966.0057', '10.10.20.57', '20', 'Gi0/3'] },
            ] },
          ],
        },
        {
          caption: 'DAI is on too (`ip arp inspection vlan 20`). The rogue tries plan B: a gratuitous ARP claiming 10.10.20.1 is at its own MAC, to pull everyone\'s traffic through it.',
          actions: [
            { do: 'packet', from: 'EVE', to: 'SW', label: 'ARP .1 is-at rogue MAC', tone: 'stamp' },
          ],
        },
        {
          caption: 'DAI checks the sender IP and MAC of every ARP on untrusted ports against the binding table. No binding says 10.10.20.1 lives on Gi0/9, so the ARP is dropped and logged.',
          actions: [
            { do: 'drop', at: 'SW', label: 'DAI: no matching binding' },
          ],
        },
        {
          caption: 'Dispatch-07\'s own ARP matches its binding exactly (MAC, IP, port), so it passes. DAI also rate-limits untrusted ports to 15 ARP packets per second by default and err-disables a port that floods.',
          actions: [
            { do: 'packet', path: ['PC1', 'SW', 'R1'], label: 'ARP from 10.10.20.57', tone: 'good' },
          ],
        },
      ],
      takeaway: 'DHCP snooping drops DHCP server messages on untrusted ports and builds a binding table; DAI uses that table to drop ARPs whose IP-to-MAC pairing does not match.',
    },

    {
      id: 'sc-aaa-radius',
      lesson: 'l5-8',
      obj: '5.8',
      title: 'AAA with RADIUS: the switch asks someone who knows',
      summary: 'A login to a core switch is checked by a central RADIUS server instead of a local password list.',
      stage: { w: 720, h: 320 },
      actors: [
        { id: 'ADM', kind: 'laptop', x: 90, y: 220, label: 'Kenji', sub: 'SSH client' },
        { id: 'SW', kind: 'l3switch', x: 360, y: 220, label: 'HPL-CORE', sub: 'RADIUS client (NAS)' },
        { id: 'ISE', kind: 'server', x: 630, y: 220, label: 'HPL-ISE', sub: 'RADIUS 10.1.30.40' },
      ],
      links: [
        { id: 'L1', a: 'ADM', b: 'SW', kind: 'eth', label: 'SSH' },
        { id: 'L2', a: 'SW', b: 'ISE', kind: 'eth', label: 'UDP 1812/1813' },
      ],
      steps: [
        {
          caption: 'HPL-CORE has `aaa new-model` and `aaa authentication login default group radius local`: try RADIUS first, use the local user list only if no server answers.',
          actions: [
            { do: 'note', target: 'SW', text: 'group radius local' },
          ],
        },
        {
          caption: 'Kenji opens SSH and types his username and password. The switch does not decide by itself.',
          actions: [
            { do: 'packet', from: 'ADM', to: 'SW', label: 'login: kenji', shape: 'segment' },
          ],
        },
        {
          caption: 'The switch sends a RADIUS Access-Request to UDP 1812 with the User-Name and the User-Password. RADIUS hides only the password field, using the shared secret.',
          actions: [
            { do: 'packet', from: 'SW', to: 'ISE', label: 'Access-Request' },
          ],
        },
        {
          caption: 'The server checks the credentials and answers Access-Accept carrying the Cisco AV pair shell:priv-lvl=15. With `aaa authorization exec default group radius`, the switch applies it: authentication and authorization arrive in one reply.',
          actions: [
            { do: 'packet', from: 'ISE', to: 'SW', label: 'Accept, priv-lvl=15', tone: 'good' },
            { do: 'packet', from: 'SW', to: 'ADM', label: 'HPL-CORE#', tone: 'good', shape: 'segment', delay: 1200 },
          ],
        },
        {
          caption: 'Accounting is the third A. With `aaa accounting exec default start-stop group radius`, the switch sends an Accounting-Request (Start) to UDP 1813, so there is a record of who logged in and when.',
          actions: [
            { do: 'packet', from: 'SW', to: 'ISE', label: 'Accounting Start' },
            { do: 'table', target: 'ISE', side: 'top', title: 'Accounting log', cols: ['Time', 'User', 'Device'], rows: [
              { new: true, cells: ['02:31:05', 'kenji', 'HPL-CORE'] },
            ] },
          ],
        },
        {
          caption: 'A mistyped password gets Access-Reject. The switch does not then try the local list: a reject is an answer. Local is only for when the server is silent.',
          actions: [
            { do: 'table', target: 'ISE', rows: null },
            { do: 'packet', from: 'SW', to: 'ISE', label: 'Access-Request' },
            { do: 'packet', from: 'ISE', to: 'SW', label: 'Access-Reject', tone: 'stamp', delay: 1200 },
          ],
        },
        {
          caption: 'Now the server link is down. The request times out, so the switch falls back to its local username. Keep one emergency local account for exactly this night.',
          actions: [
            { do: 'state', target: 'L2', state: 'down' },
            { do: 'packet', from: 'SW', to: 'ISE', label: 'Access-Request', tone: 'muted' },
            { do: 'drop', at: 'ISE', label: 'no reply' },
            { do: 'note', target: 'SW', text: 'Fallback: local user' },
          ],
        },
        {
          caption: 'TACACS+ is the Cisco alternative for device admin: TCP 49, the whole payload encrypted, and authorization checked command by command. RADIUS is the usual pick for network access like 802.1X.',
          actions: [
            { do: 'state', target: 'L2', state: 'normal' },
            { do: 'note', target: 'ISE', text: 'TACACS+: TCP 49' },
          ],
        },
      ],
      takeaway: 'With AAA the device asks a central server: RADIUS uses UDP 1812/1813 and Access-Request, Accept or Reject, and the local list is used only when no server responds.',
    },

    {
      id: 'sc-wpa-handshake',
      lesson: 'l5-9',
      obj: '5.9',
      title: 'WPA2-PSK 4-way handshake, and what WPA3 fixes',
      summary: 'A scanner joins the warehouse Wi-Fi. The passphrase never crosses the air, but both sides end up with the same keys.',
      stage: { w: 720, h: 320 },
      actors: [
        { id: 'STA', kind: 'laptop', x: 130, y: 230, label: 'Scanner-22', sub: 'client' },
        { id: 'AP', kind: 'ap', x: 470, y: 230, label: 'HPL-AP-DOCK3', sub: 'SSID HPL-OPS' },
        { id: 'SW', kind: 'switch', x: 640, y: 120, label: 'HPL-DOCK3' },
        { id: 'EAV', kind: 'laptop', x: 300, y: 80, label: 'Eavesdropper', sub: 'capturing' },
      ],
      links: [
        { id: 'W1', a: 'STA', b: 'AP', kind: 'wifi' },
        { id: 'L1', a: 'AP', b: 'SW', kind: 'eth' },
      ],
      steps: [
        {
          caption: 'The scanner does open 802.11 authentication and associates to SSID HPL-OPS. It is connected, but it cannot send data until keys exist.',
          actions: [
            { do: 'packet', from: 'STA', to: 'AP', label: 'Auth + Association Req', shape: 'wave' },
            { do: 'packet', from: 'AP', to: 'STA', label: 'Association Resp', shape: 'wave', delay: 1400 },
          ],
        },
        {
          caption: 'Both sides already hold the same Pairwise Master Key, computed from the passphrase and the SSID. The passphrase itself is never sent.',
          actions: [
            { do: 'badge', target: 'STA', text: 'PMK', tone: 'accent' },
            { do: 'badge', target: 'AP', text: 'PMK', tone: 'accent' },
          ],
        },
        {
          caption: 'Message 1: the AP sends a random number, the ANonce.',
          actions: [
            { do: 'packet', from: 'AP', to: 'STA', label: 'M1: ANonce', shape: 'wave' },
          ],
        },
        {
          caption: 'The scanner picks its own SNonce and mixes PMK, both nonces and both MAC addresses into the Pairwise Transient Key. Message 2 carries the SNonce plus a MIC that proves it knows the PMK.',
          actions: [
            { do: 'packet', from: 'STA', to: 'AP', label: 'M2: SNonce + MIC', shape: 'wave' },
            { do: 'badge', target: 'STA', text: 'PTK', tone: 'good' },
          ],
        },
        {
          caption: 'The AP derives the same PTK and checks the MIC. Message 3 delivers the Group Temporal Key (for broadcast traffic), encrypted, with its own MIC.',
          actions: [
            { do: 'badge', target: 'AP', text: 'PTK', tone: 'good' },
            { do: 'packet', from: 'AP', to: 'STA', label: 'M3: GTK + MIC', shape: 'wave' },
          ],
        },
        {
          caption: 'Message 4 confirms. Both sides install the keys, and data is now encrypted with AES-CCMP.',
          actions: [
            { do: 'packet', from: 'STA', to: 'AP', label: 'M4: ACK', shape: 'wave', tone: 'good' },
            { do: 'state', target: 'W1', state: 'up' },
            { do: 'packet', path: ['STA', 'AP', 'SW'], label: 'AES-CCMP data', tone: 'good', delay: 1400 },
          ],
        },
        {
          caption: 'The weak spot: an eavesdropper who records the handshake can guess passphrases offline, testing each guess against the MIC. A short passphrase falls fast.',
          actions: [
            { do: 'highlight', target: 'EAV', tone: 'stamp' },
            { do: 'note', target: 'EAV', text: 'Offline dictionary attack' },
          ],
        },
        {
          caption: 'WPA3-Personal derives the PMK with SAE, a live exchange with the AP, then runs the same 4-way handshake. Each guess needs the AP, so captures are useless for offline cracking. SAE gives forward secrecy; WPA3 requires PMF (protected management frames).',
          actions: [
            { do: 'badge', target: 'AP', text: 'WPA3 SAE', tone: 'good' },
            { do: 'note', target: 'EAV', text: 'Capture is useless' },
          ],
        },
      ],
      takeaway: 'WPA2-PSK turns a shared passphrase into a PMK and uses the 4-way handshake to build per-session keys; WPA3 SAE stops offline guessing from a captured handshake.',
    },

    /* ================================================================ *
     * 6.0 AUTOMATION AND PROGRAMMABILITY
     * ================================================================ */
    {
      id: 'sc-controller-intent',
      lesson: 'l6-2',
      obj: '6.2',
      title: 'Box by box versus one controller',
      summary: 'The same change made the traditional way, one SSH session at a time, then as intent pushed by a controller.',
      stage: { w: 720, h: 370 },
      actors: [
        { id: 'ADM', kind: 'laptop', x: 80, y: 180, label: 'Night tech' },
        { id: 'CTL', kind: 'controller', x: 400, y: 70, label: 'Catalyst Center', sub: 'controller' },
        { id: 'APP', kind: 'server', x: 640, y: 70, label: 'Ticket app', sub: 'northbound user' },
        { id: 'SW1', kind: 'switch', x: 240, y: 300, label: 'HPL-SW1' },
        { id: 'SW2', kind: 'switch', x: 400, y: 300, label: 'HPL-SW2' },
        { id: 'SW3', kind: 'switch', x: 560, y: 300, label: 'HPL-SW3' },
      ],
      links: [
        { id: 'S1', a: 'ADM', b: 'SW1', kind: 'eth', label: 'SSH' },
        { id: 'S2', a: 'ADM', b: 'SW2', kind: 'eth' },
        { id: 'S3', a: 'ADM', b: 'SW3', kind: 'eth' },
        { id: 'NB1', a: 'ADM', b: 'CTL', kind: 'api', label: 'northbound REST' },
        { id: 'NB2', a: 'APP', b: 'CTL', kind: 'api' },
        { id: 'SB1', a: 'CTL', b: 'SW1', kind: 'api' },
        { id: 'SB2', a: 'CTL', b: 'SW2', kind: 'api', label: 'southbound' },
        { id: 'SB3', a: 'CTL', b: 'SW3', kind: 'api' },
        { id: 'D1', a: 'SW1', b: 'SW2', kind: 'trunk' },
        { id: 'D2', a: 'SW2', b: 'SW3', kind: 'trunk' },
      ],
      steps: [
        {
          caption: 'The traditional way: every switch has its own management, control and data planes and its own config. To add the guest VLAN, the tech SSHes into HPL-SW1 and types it.',
          actions: [
            { do: 'packet', from: 'ADM', to: 'SW1', label: 'conf t / vlan 120', shape: 'segment' },
            { do: 'badge', target: 'SW1', text: 'VLAN 120', tone: 'good' },
          ],
        },
        {
          caption: 'Then HPL-SW2, then HPL-SW3, by hand. At 3 a.m. one of them gets vlan 210 instead. Multiply by 140 switches and drift is guaranteed.',
          actions: [
            { do: 'packet', from: 'ADM', to: 'SW2', label: 'vlan 120', shape: 'segment' },
            { do: 'packet', from: 'ADM', to: 'SW3', label: 'vlan 210 (typo)', shape: 'segment', tone: 'warn' },
            { do: 'badge', target: 'SW2', text: 'VLAN 120', tone: 'good' },
            { do: 'badge', target: 'SW3', text: 'VLAN 210 ?!', tone: 'stamp' },
          ],
        },
        {
          caption: 'The controller-based way: the tech, or another app, states the intent once to the controller through its northbound REST API. No device CLI involved.',
          actions: [
            { do: 'badge', target: 'SW1', text: null },
            { do: 'badge', target: 'SW2', text: null },
            { do: 'badge', target: 'SW3', text: null },
            { do: 'packet', from: 'ADM', to: 'CTL', label: 'POST intent: VLAN 120' },
            { do: 'highlight', target: 'CTL' },
          ],
        },
        {
          caption: 'The controller turns that intent into device config and pushes it southbound to every switch at once, using protocols like NETCONF, RESTCONF or SSH.',
          actions: [
            { do: 'flood', from: 'CTL', to: ['SW1', 'SW2', 'SW3'], label: 'NETCONF: vlan 120' },
            { do: 'badge', target: 'SW1', text: 'VLAN 120', tone: 'good' },
            { do: 'badge', target: 'SW2', text: 'VLAN 120', tone: 'good' },
            { do: 'badge', target: 'SW3', text: 'VLAN 120', tone: 'good' },
          ],
        },
        {
          caption: 'Devices stream state and telemetry back up. The controller sees the whole network, notices anything that drifts from the intent, and can fix it.',
          actions: [
            { do: 'packet', from: 'SW3', to: 'CTL', label: 'telemetry', tone: 'muted' },
            { do: 'packet', from: 'SW1', to: 'CTL', label: 'telemetry', tone: 'muted' },
          ],
        },
        {
          caption: 'Other software uses the same northbound API. The ticket system can ask the controller for device health without knowing a single CLI command.',
          actions: [
            { do: 'packet', from: 'APP', to: 'CTL', label: 'GET device health' },
            { do: 'packet', from: 'CTL', to: 'APP', label: '200 OK + JSON', tone: 'good', delay: 1100 },
          ],
        },
        {
          caption: 'What the controller centralizes is management and much of the control plane. The data plane stays on the switches: frames are still forwarded port to port, locally, at line rate.',
          actions: [
            { do: 'packet', path: ['SW1', 'SW2', 'SW3'], label: 'data plane: frames', shape: 'frame' },
            { do: 'note', target: 'SW2', text: 'Forwarding stays local' },
          ],
        },
      ],
      takeaway: 'In a controller-based network you state intent once on the northbound API and the controller programs every device on the southbound side; forwarding still happens on the devices.',
    },

    {
      id: 'sc-rest-api',
      lesson: 'l6-5',
      obj: '6.5',
      title: 'A REST conversation: token, GET, and the status codes',
      summary: 'A short script asks the controller for its device list, one HTTP request at a time.',
      stage: { w: 720, h: 340 },
      actors: [
        { id: 'PY', kind: 'laptop', x: 110, y: 210, label: 'inventory.py', sub: 'REST client' },
        { id: 'CTL', kind: 'controller', x: 420, y: 210, label: 'Catalyst Center', sub: 'HTTPS API' },
        { id: 'SW1', kind: 'switch', x: 640, y: 110, label: 'HPL-SW1' },
        { id: 'R1', kind: 'router', x: 640, y: 300, label: 'HPL-CORE' },
      ],
      links: [
        { id: 'L1', a: 'PY', b: 'CTL', kind: 'api', label: 'HTTPS' },
        { id: 'L2', a: 'CTL', b: 'SW1', kind: 'api' },
        { id: 'L3', a: 'CTL', b: 'R1', kind: 'api' },
      ],
      steps: [
        {
          caption: 'REST runs over HTTP, so every request is a verb plus a URI. First the script authenticates: POST to /dna/system/api/v1/auth/token with Basic auth (username and password, base64-encoded).',
          actions: [
            { do: 'packet', from: 'PY', to: 'CTL', label: 'POST .../auth/token' },
          ],
        },
        {
          caption: 'The controller replies 200 OK with a JSON body: {"Token": "eyJ..."}. The script sends it on later requests in the X-Auth-Token header instead of the password.',
          actions: [
            { do: 'packet', from: 'CTL', to: 'PY', label: '200 OK + token', tone: 'good' },
          ],
        },
        {
          caption: 'Now GET /dna/intent/api/v1/network-device with `Accept: application/json`. GET only reads; it changes nothing.',
          actions: [
            { do: 'packet', from: 'PY', to: 'CTL', label: 'GET .../network-device' },
          ],
        },
        {
          caption: '200 OK. The body is a JSON object with a "response" array: one object per device, with keys and values the script can loop over.',
          actions: [
            { do: 'packet', from: 'CTL', to: 'PY', label: '200 OK + JSON', tone: 'good' },
            { do: 'table', target: 'PY', side: 'top', title: 'response[ ]', cols: ['"hostname"', '"managementIpAddress"', '"reachabilityStatus"'], rows: [
              { new: true, cells: ['"HPL-SW1"', '"10.1.99.11"', '"Reachable"'] },
              { new: true, cells: ['"HPL-CORE"', '"10.1.99.1"', '"Reachable"'] },
            ] },
          ],
        },
        {
          caption: 'Tokens last 60 minutes, so an hour later this one has expired. The same GET comes back 401 Unauthorized: a 4xx code means the client\'s request was at fault, here a stale token.',
          actions: [
            { do: 'table', target: 'PY', rows: null },
            { do: 'packet', from: 'PY', to: 'CTL', label: 'GET (old token)', tone: 'warn' },
            { do: 'packet', from: 'CTL', to: 'PY', label: '401 Unauthorized', tone: 'stamp', delay: 1300 },
          ],
        },
        {
          caption: 'A typo in the device ID gets 404 Not Found: the URI points at nothing. 403 Forbidden would mean "I know who you are, but no."',
          actions: [
            { do: 'packet', from: 'PY', to: 'CTL', label: 'GET .../bogus-id', tone: 'warn' },
            { do: 'packet', from: 'CTL', to: 'PY', label: '404 Not Found', tone: 'stamp', delay: 1300 },
          ],
        },
        {
          caption: 'A POST asks the controller to create or start something, such as a Command Runner job collecting `show` output. Long jobs like this return 202 Accepted with a task ID to check later; 201 Created means it was made on the spot.',
          actions: [
            { do: 'packet', from: 'PY', to: 'CTL', label: 'POST .../cli/read-request' },
            { do: 'packet', from: 'CTL', to: 'PY', label: '202 Accepted + taskId', tone: 'good', delay: 1300 },
            { do: 'flood', from: 'CTL', to: ['SW1', 'R1'], label: 'show commands', delay: 2700 },
          ],
        },
        {
          caption: 'The CRUD map to remember: Create is POST, Read is GET, Update is PUT or PATCH, Delete is DELETE. 2xx success, 4xx client error, 5xx server error.',
          actions: [
            { do: 'table', target: 'PY', side: 'top', title: 'CRUD to HTTP', cols: ['CRUD', 'HTTP verb'], rows: [
              ['Create', 'POST'], ['Read', 'GET'], ['Update', 'PUT / PATCH'], ['Delete', 'DELETE'],
            ] },
          ],
        },
      ],
      takeaway: 'REST APIs use HTTP verbs on URIs, carry data as JSON, and answer with status codes: 2xx worked, 4xx your request was wrong, 5xx the server failed.',
    },

    {
      id: 'sc-ansible-terraform',
      lesson: 'l6-6',
      obj: '6.6',
      title: 'Ansible pushes over SSH, Terraform plans then applies',
      summary: 'Two configuration management tools, two styles: an agentless playbook run and a declarative plan and apply.',
      stage: { w: 720, h: 370 },
      actors: [
        { id: 'ANS', kind: 'server', x: 100, y: 170, label: 'Ansible control node', sub: 'playbook + inventory' },
        { id: 'TF', kind: 'server', x: 100, y: 320, label: 'Terraform', sub: '.tf files + state' },
        { id: 'SW1', kind: 'switch', x: 420, y: 60, label: 'HPL-SW1', sub: 'no agent' },
        { id: 'SW2', kind: 'switch', x: 600, y: 110, label: 'HPL-SW2', sub: 'no agent' },
        { id: 'R1', kind: 'router', x: 420, y: 180, label: 'HPL-CORE', sub: 'no agent' },
        { id: 'API', kind: 'cloud', x: 520, y: 320, label: 'Cloud / controller API' },
      ],
      links: [
        { id: 'A1', a: 'ANS', b: 'SW1', kind: 'eth', label: 'SSH' },
        { id: 'A2', a: 'ANS', b: 'SW2', kind: 'eth' },
        { id: 'A3', a: 'ANS', b: 'R1', kind: 'eth' },
        { id: 'T1', a: 'TF', b: 'API', kind: 'api', label: 'provider API' },
      ],
      steps: [
        {
          caption: 'Ansible keeps an inventory of devices and a playbook written in YAML: a list of tasks, each calling a module such as cisco.ios.ios_config. Nothing is installed on the switches.',
          actions: [
            { do: 'table', target: 'ANS', side: 'top', title: 'ntp.yml', cols: ['YAML'], rows: [
              ['- hosts: access'],
              ['  tasks:'],
              ['    - cisco.ios.ios_config:'],
              ['        lines: ntp server 10.1.12.1'],
            ] },
          ],
        },
        {
          caption: '`ansible-playbook ntp.yml`. The control node pushes: it opens SSH to each device in parallel and runs the task. No agent, no pull, just SSH and the CLI the devices already have.',
          actions: [
            { do: 'flood', from: 'ANS', to: ['SW1', 'SW2', 'R1'], label: 'SSH: ios_config' },
          ],
        },
        {
          caption: 'Each device reports back. HPL-SW1 and HPL-CORE needed the line, so they are "changed". HPL-SW2 already had it, so it is just "ok".',
          actions: [
            { do: 'badge', target: 'SW1', text: 'changed', tone: 'warn' },
            { do: 'badge', target: 'SW2', text: 'ok', tone: 'good' },
            { do: 'badge', target: 'R1', text: 'changed', tone: 'warn' },
            { do: 'table', target: 'ANS', side: 'top', title: 'PLAY RECAP', cols: ['Host', 'ok', 'changed'], rows: [
              { new: true, cells: ['HPL-SW1', '1', '1'] },
              { new: true, cells: ['HPL-SW2', '1', '0'] },
              { new: true, cells: ['HPL-CORE', '1', '1'] },
            ] },
          ],
        },
        {
          caption: 'Run it again and nothing changes: changed=0 everywhere. That is idempotency. You can run a playbook every night to pull drifting devices back in line.',
          actions: [
            { do: 'flood', from: 'ANS', to: ['SW1', 'SW2', 'R1'], label: 'SSH: same task' },
            { do: 'badge', target: 'SW1', text: 'ok', tone: 'good' },
            { do: 'badge', target: 'R1', text: 'ok', tone: 'good' },
            { do: 'table', target: 'ANS', side: 'top', title: 'PLAY RECAP', cols: ['Host', 'ok', 'changed'], rows: [
              { new: true, cells: ['HPL-SW1', '1', '0'] },
              ['HPL-SW2', '1', '0'],
              { new: true, cells: ['HPL-CORE', '1', '0'] },
            ] },
          ],
        },
        {
          caption: 'Terraform is declarative: its HCL files describe the end result, the resources that should exist, not the steps. It keeps a state file recording what it built last time.',
          actions: [
            { do: 'table', target: 'ANS', rows: null },
            { do: 'highlight', target: 'TF' },
          ],
        },
        {
          caption: '`terraform plan` compares the files with the state and the real world, then prints what it would do. Nothing changes yet; a human reads the plan first.',
          actions: [
            { do: 'table', target: 'TF', side: 'top', title: 'terraform plan', cols: ['Action', 'Resource'], rows: [
              { new: true, cells: ['+ create', 'vpn_gateway.dundalk'] },
              { new: true, cells: ['~ update', 'security_group.dock_ops'] },
              ['Plan:', '1 to add, 1 to change, 0 to destroy'],
            ] },
          ],
        },
        {
          caption: '`terraform apply` carries out the plan. Providers turn it into API calls, usually REST, to the cloud or controller, then Terraform updates its state file.',
          actions: [
            { do: 'packet', from: 'TF', to: 'API', label: 'create + update calls' },
            { do: 'packet', from: 'API', to: 'TF', label: '200 / 201', tone: 'good', delay: 1800 },
            { do: 'badge', target: 'TF', text: 'state updated', tone: 'good' },
          ],
        },
      ],
      takeaway: 'Ansible is agentless and pushes YAML playbooks over SSH; Terraform describes infrastructure in HCL, shows a plan, then applies it through provider APIs and tracks a state file.',
    },
  );
})(typeof globalThis !== 'undefined' ? globalThis : window);
