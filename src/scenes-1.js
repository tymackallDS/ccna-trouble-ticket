/* Trouble Ticket — "Watch it happen" scenes for domains 1.0 and 2.0.
 * Format: /home/claude/scene_format.md; player: scenes.js (TT.renderScene). Values follow CCNA 200-301 v1.1 and IOS defaults.
 */
(function (G) {
  'use strict';
  const TT = (G.TT = G.TT || {});
  TT.scenes = TT.scenes || [];

  // tiny builders, to keep the step lists readable
  const pk = (from, to, label, o) => Object.assign({ do: 'packet', from, to, label }, o || {});
  const via = (path, label, o) => Object.assign({ do: 'packet', from: path[0], to: path[path.length - 1], path, label }, o || {});
  const fl = (from, to, label, o) => Object.assign({ do: 'flood', from, to, label }, o || {});
  const drop = (at, label) => ({ do: 'drop', at, label });
  const hl = (target, tone) => ({ do: 'highlight', target, tone });
  const st = (target, state) => ({ do: 'state', target, state });
  const badge = (target, text, tone) => ({ do: 'badge', target, text, tone });
  const note = (target, text, side) => (side ? { do: 'note', target, text, side } : { do: 'note', target, text });
  const table = (target, title, cols, rows, side) => Object.assign({ do: 'table', target, title, cols, rows }, side ? { side } : {});
  const hide = (target) => ({ do: 'table', target, rows: null });
  const sub = (target, s) => ({ do: 'label', target, sub: s });
  const nw = (cells) => ({ new: true, cells });

  /* ------------------------------------------------------------------ 1.0 primer: encapsulation */
  const STACK_DOWN = ['Layer', 'Adds', 'PDU'];
  const L7 = ['7 HTTP', 'GET /status', 'data'];
  const PHY = ['1 Physical', 'preamble + signal', 'bits'];
  const L4 = ['4 TCP', 'ports 49732 > 80', 'segment'];
  const L3 = ['3 IPv4', '.30.15 > .60.80, TTL', 'packet'];
  const L2 = ['2 Ether', 'MACs + FCS trailer', 'frame'];
  const encapsulation = {
    id: 'sc-encapsulation',
    lesson: 'l1-0',
    obj: '1.0',
    title: 'Wrapped, switched, rewrapped: one web request down and up the stack',
    summary: 'PC1 asks a web server for a page. Watch each layer add its header, the switch read only the frame, and the router swap the frame while the packet rides through.',
    stage: { w: 720, h: 360 },
    actors: [
      { id: 'PC1', kind: 'pc', x: 70, y: 270, label: 'PC1', sub: '10.20.30.15' },
      { id: 'SW1', kind: 'switch', x: 230, y: 270, label: 'SW1', sub: 'dispatch' },
      { id: 'R1', kind: 'router', x: 450, y: 270, label: 'R1', sub: '.30.1 | .60.1' },
      { id: 'SRV', kind: 'server', x: 650, y: 270, label: 'HPL-WEB01', sub: '10.20.60.80' },
    ],
    links: [
      { id: 'L1', a: 'PC1', b: 'SW1', kind: 'eth', label: 'Fa0/5' },
      { id: 'L2', a: 'SW1', b: 'R1', kind: 'eth', label: 'Gi0/1 > Gi0/0' },
      { id: 'L3', a: 'R1', b: 'SRV', kind: 'eth', label: 'Gi0/1' },
    ],
    steps: [
      {
        caption: 'PC1 opens `http://10.20.60.80/status`. The TCP handshake is already done, so the browser hands `GET /status` to the stack. At Layer 7 it is just **data**: no addresses yet.',
        actions: [hl('PC1'), badge('PC1', 'data'), table('PC1', 'Going down the stack', STACK_DOWN, [nw(L7)], 'top')],
      },
      {
        caption: 'Transport adds a **TCP header**: source port 49732 (a random ephemeral port) and destination port 80. Ports name the program at each end. Data plus TCP header is a **segment**.',
        actions: [badge('PC1', 'segment', 'good'), table('PC1', 'Going down the stack', STACK_DOWN, [L7, nw(L4)], 'top')],
      },
      {
        caption: 'Network adds an **IPv4 header**: source 10.20.30.15, destination 10.20.60.80, Protocol 6 (TCP), TTL 128. The server is on another subnet, so this **packet** goes to the default gateway, R1.',
        actions: [badge('PC1', 'packet'), table('PC1', 'Going down the stack', STACK_DOWN, [L7, L4, nw(L3)], 'top'), hl('R1', 'muted')],
      },
      {
        caption: "Data Link adds an **Ethernet header** (destination MAC = R1 Gi0/0, found by ARP; source = PC1; Type 0x0800) and an **FCS trailer**. Now it is a **frame**. Layer 2 is the only layer that adds a trailer.",
        actions: [badge('PC1', 'frame', 'warn'), table('PC1', 'Going down the stack', STACK_DOWN, [L7, L4, L3, nw(L2)], 'top')],
      },
      {
        caption: 'Physical turns the frame into **bits**: voltage changes on the copper, led by a preamble so the far end can sync. The frame leaves PC1 for SW1, the first box on this link.',
        actions: [badge('PC1', 'bits', 'warn'), table('PC1', 'Going down the stack', STACK_DOWN, [L7, L4, L3, L2, nw(PHY)], 'top'), pk('PC1', 'SW1', 'bits', { tone: 'warn' })],
      },
      {
        caption: "SW1 reads only the **Ethernet header**. It learns PC1's MAC on Fa0/5, finds R1's MAC on Gi0/1 and forwards the frame out that port **unchanged**. It never looks at the IP addresses.",
        actions: [
          hide('PC1'),
          badge('PC1', null),
          table('SW1', 'show mac address-table', ['Vlan', 'Mac Address', 'Ports'], [nw(['30', '0050.7966.0a15', 'Fa0/5']), ['30', '00a3.d1f4.0001', 'Gi0/1']], 'top'),
          badge('SW1', 'L2 only', 'muted'),
          pk('SW1', 'R1', 'same frame', { tone: 'warn' }),
        ],
      },
      {
        caption: 'R1 checks the FCS, sees its own MAC, and **strips the frame**. Then it reads the destination IP and does a **route lookup**: 10.20.60.0/24, connected on Gi0/1. It lowers the TTL to 127. Ports and HTTP are not its business.',
        actions: [
          hide('SW1'),
          hl('R1'),
          badge('R1', 'packet'),
          table('R1', 'show ip route (excerpt)', ['Code', 'Network', 'Out'], [['C', '10.20.30.0/24', 'Gi0/0'], nw(['C', '10.20.60.0/24', 'Gi0/1']), ['S*', '0.0.0.0/0', 'via 10.20.0.1']], 'top'),
        ],
      },
      {
        caption: "R1 builds a **brand-new frame** for the next link: source MAC = R1 Gi0/1, destination MAC = HPL-WEB01 (from R1's ARP cache), fresh FCS. The IP addresses inside have not changed.",
        actions: [
          badge('R1', 'new frame', 'warn'),
          table('R1', 'Frame in vs frame out', ['Field', 'In on Gi0/0', 'Out Gi0/1'], [
            nw(['Dst MAC', 'R1 Gi0/0', 'HPL-WEB01']),
            nw(['Src MAC', 'PC1', 'R1 Gi0/1']),
            ['Src IP', '10.20.30.15', '10.20.30.15'],
            ['Dst IP', '10.20.60.80', '10.20.60.80'],
            nw(['TTL', '128', '127']),
          ], 'top'),
          pk('R1', 'SRV', 'new frame', { tone: 'warn', delay: 600 }),
        ],
      },
      {
        caption: 'HPL-WEB01 de-encapsulates all the way up. Its own MAC: strip the frame. Its own IP, Protocol 6: strip the packet, hand it to TCP. Port 80: strip the segment, hand it to the web server, which finally reads `GET /status`.',
        actions: [
          hide('R1'),
          badge('R1', null),
          hl('SRV', 'good'),
          table('SRV', 'Going up the stack', ['Layer', 'Checks', 'Leaves'], [
            ['2 Ethernet', 'dst MAC is mine, FCS ok', 'packet'],
            ['3 IPv4', 'dst IP is mine, proto 6', 'segment'],
            ['4 TCP', 'dst port 80', 'data'],
            nw(['7 HTTP', 'GET /status', 'page!']),
          ], 'top'),
          badge('SRV', 'HTTP', 'good'),
        ],
      },
      {
        caption: 'The reply, **HTTP 200 OK**, makes the same trip backwards: port 80 to 49732, IP 10.20.60.80 to 10.20.30.15. R1 rewrites the frame again; SW1 just switches it. Layer 2 changes every hop; Layer 3 rides end to end.',
        actions: [
          hide('SRV'),
          via(['SRV', 'R1', 'SW1', 'PC1'], '200 OK', { tone: 'good', labels: ['frame to R1', 'new frame to PC1', 'same frame'] }),
          hl('PC1', 'good'),
        ],
      },
    ],
    takeaway: 'Each layer adds its own header on the way down and reads only its own header on the way up; a switch reads the frame, a router swaps the frame but keeps the packet, and only the end hosts open the segment and data.',
  };

  /* ------------------------------------------------------------------ 1.13 */
  const MAC = ['Vlan', 'Mac Address', 'Type', 'Ports'];
  const A = ['1', 'aaaa.0000.000a', 'DYNAMIC', 'Fa0/1'];
  const B = ['1', 'bbbb.0000.000b', 'DYNAMIC', 'Fa0/2'];
  const C = ['1', 'cccc.0000.000c', 'DYNAMIC', 'Fa0/3'];
  const macLearning = {
    id: 'sc-mac-learning',
    lesson: 'l1-13',
    obj: '1.13',
    title: 'A switch learns: flood, learn, forward',
    summary: 'A fresh switch with an empty MAC table works out where three PCs live, one frame at a time.',
    stage: { w: 720, h: 330 },
    actors: [
      { id: 'SW1', kind: 'switch', x: 360, y: 80, label: 'SW1', sub: 'Canton office' },
      { id: 'PCA', kind: 'pc', x: 120, y: 250, label: 'PC-A', sub: 'aaaa.0000.000a' },
      { id: 'PCB', kind: 'pc', x: 360, y: 250, label: 'PC-B', sub: 'bbbb.0000.000b' },
      { id: 'PCC', kind: 'pc', x: 600, y: 250, label: 'PC-C', sub: 'cccc.0000.000c' },
    ],
    links: [
      { id: 'L1', a: 'PCA', b: 'SW1', kind: 'eth', label: 'Fa0/1' },
      { id: 'L2', a: 'PCB', b: 'SW1', kind: 'eth', label: 'Fa0/2' },
      { id: 'L3', a: 'PCC', b: 'SW1', kind: 'eth', label: 'Fa0/3' },
    ],
    steps: [
      {
        caption: 'The new switch boots with an empty MAC address table. It knows its own ports, but not who lives behind them. Nobody configures this table; the switch builds it from traffic.',
        actions: [hl('SW1'), table('SW1', 'show mac address-table', MAC, [], 'right')],
      },
      {
        caption: 'PC-A sends a frame to PC-B. The switch looks at the **source MAC** first: aaaa.0000.000a arrived on Fa0/1, so it writes that down.',
        actions: [pk('PCA', 'SW1', 'src A, dst B'), table('SW1', 'show mac address-table', MAC, [nw(A)], 'right')],
      },
      {
        caption: "Now the destination, bbbb.0000.000b. It isn't in the table yet: an **unknown unicast**. The switch floods it out every port in the VLAN except Fa0/1. PC-C's NIC sees a MAC that isn't its own and discards the frame.",
        actions: [fl('SW1', ['PCB', 'PCC'], 'dst B'), drop('PCC', 'not my MAC'), note('PCB', "That's me.")],
      },
      {
        caption: "PC-B replies. The reply's source MAC teaches the switch a second entry: bbbb.0000.000b lives on Fa0/2.",
        actions: [pk('PCB', 'SW1', 'src B, dst A', { tone: 'good' }), table('SW1', 'show mac address-table', MAC, [A, nw(B)], 'right')],
      },
      {
        caption: 'This time the destination, PC-A, is already in the table. A **known unicast** goes out Fa0/1 and nowhere else. PC-C never sees it. That filtering is the whole point of a switch.',
        actions: [pk('SW1', 'PCA', 'dst A', { tone: 'good' }), hl('SW1:L1', 'good')],
      },
      {
        caption: 'Broadcasts are different. PC-C sends an ARP request to ffff.ffff.ffff. No table entry can ever match a broadcast, so it is always flooded. The switch still learns PC-C from the source MAC.',
        actions: [fl('PCC', ['PCA', 'PCB'], 'dst ffff.ffff.ffff', { tone: 'warn' }), table('SW1', 'show mac address-table', MAC, [A, B, nw(C)], 'right')],
      },
      {
        caption: "Entries don't last forever. A dynamic entry with no traffic for **300 seconds** (the default aging time) is removed. PC-A went quiet, so its entry ages out, and the next frame sent to it gets flooded again.",
        actions: [badge('PCA', 'idle 5 min', 'muted'), table('SW1', 'show mac address-table', MAC, [B, C], 'right'), note('PCA', 'Aged out', 'right')],
      },
    ],
    takeaway: 'A switch learns from the source MAC and forwards on the destination MAC: known unicasts go out one port; unknown unicasts and broadcasts flood out every other port in the VLAN.',
  };

  /* ------------------------------------------------------------------ 1.10 ARP */
  const ARP = ['Internet Address', 'Physical Address', 'Type'];
  const arp = {
    id: 'sc-arp-ping',
    lesson: 'l1-10',
    obj: '1.10',
    title: 'ARP, then ping: who has 10.1.1.20?',
    summary: 'Before PC1 can ping its neighbor it needs a MAC address. Watch ARP fill both caches.',
    stage: { w: 720, h: 350 },
    actors: [
      { id: 'PC1', kind: 'pc', x: 110, y: 150, label: 'PC1', sub: '10.1.1.10 /24' },
      { id: 'SW1', kind: 'switch', x: 360, y: 150, label: 'SW1' },
      { id: 'PC2', kind: 'pc', x: 610, y: 150, label: 'PC2', sub: '10.1.1.20 /24' },
      { id: 'PC3', kind: 'pc', x: 360, y: 280, label: 'PC3', sub: '10.1.1.30 /24' },
    ],
    links: [
      { id: 'L1', a: 'PC1', b: 'SW1', kind: 'eth', label: 'Fa0/1' },
      { id: 'L2', a: 'SW1', b: 'PC2', kind: 'eth', label: 'Fa0/2' },
      { id: 'L3', a: 'SW1', b: 'PC3', kind: 'eth', label: 'Fa0/3' },
    ],
    steps: [
      {
        caption: "PC1 wants to ping 10.1.1.20. With a /24 mask that's the same subnet, so PC1 can deliver it directly. It just needs PC2's MAC address, and its ARP cache (`arp -a`) is empty.",
        actions: [hl('PC1'), table('PC1', 'arp -a', ARP, [], 'bottom')],
      },
      {
        caption: "PC1 broadcasts an **ARP Request** to ffff.ffff.ffff: 'Who has 10.1.1.20? Tell 10.1.1.10.' Everyone gets a copy. PC3 isn't .20 and ignores it. PC2 is, and caches PC1's MAC straight from the request.",
        actions: [
          fl('PC1', ['PC2', 'PC3'], 'ARP: who has .20?', { tone: 'warn' }),
          drop('PC3', 'not my IP'),
          table('PC2', 'arp -a', ARP, [nw(['10.1.1.10', '00-50-56-a1-00-10', 'dynamic'])], 'bottom'),
        ],
      },
      {
        caption: "PC2 sends an **ARP Reply** straight back as a unicast: '10.1.1.20 is at 00-50-56-a1-00-20.' The switch already knows where PC1 lives, so only PC1 gets it.",
        actions: [pk('PC2', 'PC1', 'ARP Reply (unicast)', { tone: 'good' })],
      },
      {
        caption: 'PC1 stores the answer. Now it can build the frame: destination MAC 00-50-56-a1-00-20, carrying an IP packet addressed to 10.1.1.20.',
        actions: [table('PC1', 'arp -a', ARP, [nw(['10.1.1.20', '00-50-56-a1-00-20', 'dynamic'])], 'bottom')],
      },
      {
        caption: "The ping goes out: an **ICMP Echo Request** from 10.1.1.10 to 10.1.1.20, inside a frame addressed to PC2's MAC.",
        actions: [pk('PC1', 'PC2', 'ICMP Echo Request', { shape: 'packet' })],
      },
      {
        caption: "PC2 answers with an **ICMP Echo Reply**. No ARP needed in this direction: PC2 learned PC1's MAC from the request back in step 2.",
        actions: [pk('PC2', 'PC1', 'ICMP Echo Reply', { shape: 'packet', tone: 'good' }), badge('PC1', 'Reply from .20', 'good')],
      },
      {
        caption: "Cache entries expire on their own (seconds to minutes on a PC, 4 hours by default on a Cisco router), and the next packet triggers a fresh ARP. And for an off-subnet address, PC1 ARPs for its **default gateway**, never the far host.",
        actions: [note('PC1', 'Off-subnet? ARP for the gateway.', 'top'), badge('PC1', null)],
      },
    ],
    takeaway: 'ARP turns a next-hop IPv4 address into a MAC address: the request is a broadcast, the reply is a unicast, and both hosts cache the answer.',
  };

  /* ------------------------------------------------------------------ 1.5 TCP vs UDP */
  const tcpUdp = {
    id: 'sc-tcp-udp',
    lesson: 'l1-5',
    obj: '1.5',
    title: 'TCP shakes hands, UDP just sends',
    summary: 'A web session from handshake to teardown, then syslog over UDP losing a message nobody misses.',
    stage: { w: 720, h: 320 },
    actors: [
      { id: 'PC1', kind: 'pc', x: 100, y: 220, label: 'PC1', sub: '10.1.1.10' },
      { id: 'SW1', kind: 'switch', x: 360, y: 220, label: 'SW1' },
      { id: 'SRV1', kind: 'server', x: 620, y: 220, label: 'SRV1', sub: '10.1.50.5' },
      { id: 'R1', kind: 'router', x: 360, y: 80, label: 'R1', sub: 'syslog client' },
    ],
    links: [
      { id: 'L1', a: 'PC1', b: 'SW1', kind: 'eth' },
      { id: 'L2', a: 'SW1', b: 'SRV1', kind: 'eth' },
      { id: 'L3', a: 'R1', b: 'SW1', kind: 'eth' },
    ],
    steps: [
      {
        caption: 'PC1 opens https://10.1.50.5. TCP is connection-oriented, so first comes the three-way handshake. Segment one: a **SYN** from port 51000 to port 443, carrying PC1\'s starting sequence number (real ones are random; 1000 keeps the math easy).',
        actions: [badge('SRV1', 'LISTEN :443', 'muted'), via(['PC1', 'SW1', 'SRV1'], 'SYN seq=1000', { shape: 'segment' }), badge('PC1', 'SYN-SENT', 'muted')],
      },
      {
        caption: "SRV1 replies **SYN-ACK**: its own sequence number, plus ack=1001, meaning 'got your SYN, send byte 1001 next.'",
        actions: [via(['SRV1', 'SW1', 'PC1'], 'SYN-ACK seq=5000 ack=1001', { shape: 'segment' }), badge('SRV1', 'SYN-RCVD', 'muted')],
      },
      {
        caption: "PC1 sends the final **ACK** (ack=5001). Both ends are now ESTABLISHED. Three segments, and not one byte of web page yet.",
        actions: [via(['PC1', 'SW1', 'SRV1'], 'ACK ack=5001', { shape: 'segment' }), badge('PC1', 'ESTABLISHED', 'good'), badge('SRV1', 'ESTABLISHED', 'good')],
      },
      {
        caption: 'Data. PC1 sends 500 bytes starting at seq 1001. Every byte is numbered, so the receiver can put segments back in order and notice gaps.',
        actions: [via(['PC1', 'SW1', 'SRV1'], 'DATA seq=1001, 500 B', { shape: 'segment' })],
      },
      {
        caption: "SRV1 acknowledges with ack=1501: 'everything through byte 1500 arrived.' If no ACK came back, PC1 would retransmit after a timeout. That's TCP's reliability, and its window size controls the flow.",
        actions: [via(['SRV1', 'SW1', 'PC1'], 'ACK ack=1501', { shape: 'segment', tone: 'good' })],
      },
      {
        caption: 'Finished. PC1 closes its half with **FIN**. SRV1 ACKs it, then sends its own FIN, which PC1 ACKs. Four segments, because each direction closes separately.',
        actions: [
          via(['PC1', 'SW1', 'SRV1'], 'FIN', { shape: 'segment', tone: 'muted' }),
          via(['SRV1', 'SW1', 'PC1'], 'ACK, then FIN', { shape: 'segment', tone: 'muted', delay: 1300 }),
          via(['PC1', 'SW1', 'SRV1'], 'ACK', { shape: 'segment', tone: 'muted', delay: 2600 }),
          badge('PC1', 'TIME-WAIT', 'muted'),
          badge('SRV1', 'CLOSED', 'muted'),
        ],
      },
      {
        caption: "Now UDP. R1 ships log messages to SRV1's syslog service on **UDP 514**. No handshake, no sequence numbers, no ACKs. It just sends.",
        actions: [badge('PC1', null), badge('SRV1', 'syslog :514', 'muted'), via(['R1', 'SW1', 'SRV1'], 'UDP 514 syslog', { tone: 'warn' })],
      },
      {
        caption: "One message meets a full queue on SW1 and is lost. Nobody notices, nobody retransmits. For logs, voice and video, fast and light beats perfect.",
        actions: [via(['R1', 'SW1', 'SRV1'], 'UDP 514 syslog', { tone: 'warn' }), drop('SW1', 'queue full')],
      },
      {
        caption: 'The trade: TCP has a 20-byte header plus handshakes, sequencing, ACKs, retransmission and flow control. UDP has an 8-byte header and none of that. Apps that need reliability over UDP build their own (DNS simply asks again).',
        actions: [note('SRV1', 'TCP 443: reliable, ordered', 'top'), note('R1', 'UDP 514: best effort', 'right')],
      },
    ],
    takeaway: 'TCP builds a connection and guarantees ordered delivery with sequence numbers, ACKs and retransmission; UDP just sends, trading reliability for speed and low overhead.',
  };

  /* ------------------------------------------------------------------ 1.4 duplex mismatch */
  const duplex = {
    id: 'sc-duplex-mismatch',
    lesson: 'l1-4',
    obj: '1.4',
    title: 'Duplex mismatch: the link that lies',
    summary: 'One side hard-coded, one side on auto. The link comes up, then quietly shreds frames under load.',
    stage: { w: 720, h: 330 },
    actors: [
      { id: 'SW1', kind: 'switch', x: 160, y: 120, label: 'SW1', sub: 'Fa0/1: auto' },
      { id: 'SRV1', kind: 'server', x: 560, y: 120, label: 'SRV1', sub: 'NIC: 100/full, fixed' },
    ],
    links: [{ id: 'L1', a: 'SW1', b: 'SRV1', kind: 'eth', label: 'Fa0/1' }],
    steps: [
      {
        caption: "Someone hard-coded SRV1's NIC to 100 Mb/s, full duplex. SW1's port Fa0/1 is still on auto. Hard-coding switches autonegotiation **off** on that side.",
        actions: [hl('SRV1', 'warn'), badge('SW1:L1', 'auto', 'muted'), badge('SRV1:L1', '100/full', 'warn')],
      },
      {
        caption: "SW1 sends autonegotiation pulses advertising what it can do. SRV1 isn't negotiating, so nothing comes back.",
        actions: [pk('SW1', 'SRV1', 'autoneg: 100/full?', { shape: 'hello' }), note('SRV1', 'Autoneg off. Silence.', 'bottom')],
      },
      {
        caption: 'SW1 can still sense the speed from the signal, 100 Mb/s, but not the duplex. With no answer, the rule for 10/100 ports is to fall back to **half duplex**. The link comes up and pings work.',
        actions: [st('L1', 'up'), badge('SW1:L1', '100/half', 'stamp'), sub('SW1', 'Fa0/1: a-half a-100')],
      },
      {
        caption: "Under load both ends transmit at once. SW1, being half duplex, detects a collision after the first 64 bytes, a **late collision**, and aborts. SRV1 receives the cut-off frame and counts a CRC error.",
        actions: [pk('SW1', 'SRV1', 'frame'), pk('SRV1', 'SW1', 'frame'), drop('SW1', 'late collision'), drop('SRV1', 'CRC error')],
      },
      {
        caption: 'The counters give it away. The half-duplex side logs **late collisions**; the full-duplex side logs **CRC errors and runts**. Users just see a slow, flaky server.',
        actions: [
          table('SW1', 'show interfaces fa0/1', ['Counter', 'Value'], [['duplex, speed', 'Half-duplex, 100Mb/s'], ['collisions', '1842'], nw(['late collision', '317'])], 'bottom'),
          table('SRV1', 'NIC statistics', ['Counter', 'Value'], [['duplex, speed', 'Full, 100 Mb/s'], nw(['CRC errors', '905']), nw(['runts', '288'])], 'bottom'),
        ],
      },
      {
        caption: "The fix is to make both ends match. Best practice is auto on both (or hard-code both the same). Here the server team sets SRV1's NIC back to auto.",
        actions: [hide('SW1'), hide('SRV1'), sub('SRV1', 'NIC: auto'), badge('SRV1:L1', 'auto', 'muted'), hl('SRV1', 'good')],
      },
      {
        caption: 'Now both ends negotiate and agree on 100 Mb/s **full duplex**. Each side can send while receiving, collisions are impossible, and the counters stop climbing.',
        actions: [pk('SW1', 'SRV1', 'frame', { tone: 'good' }), pk('SRV1', 'SW1', 'frame', { tone: 'good', delay: 500 }), badge('SW1:L1', '100/full', 'good'), badge('SRV1:L1', '100/full', 'good'), sub('SW1', 'Fa0/1: a-full a-100')],
      },
    ],
    takeaway: 'A duplex mismatch still comes up, but the half-duplex side logs late collisions and the full-duplex side logs CRC errors and runts; set both ends the same, ideally auto.',
  };

  /* ------------------------------------------------------------------ 1.7 private addressing */
  const privateNat = {
    id: 'sc-private-ip',
    lesson: 'l1-7',
    obj: '1.7',
    title: 'Private addresses stay home',
    summary: 'A 192.168 address heads for the internet. NAT gives it a public face; without NAT the reply has nowhere to go.',
    stage: { w: 720, h: 350 },
    zones: [
      { label: 'Harbor Point LAN · private', x: 30, y: 60, w: 330, h: 270, tone: 'accent' },
      { label: 'Internet · public', x: 390, y: 60, w: 300, h: 270, tone: 'muted' },
    ],
    actors: [
      { id: 'PC1', kind: 'pc', x: 100, y: 160, label: 'PC1', sub: '192.168.10.25' },
      { id: 'R1', kind: 'router', x: 300, y: 160, label: 'R1', sub: 'outside 203.0.113.2' },
      { id: 'NET', kind: 'cloud', x: 470, y: 160, label: 'Internet' },
      { id: 'WEB', kind: 'server', x: 630, y: 160, label: 'Web server', sub: '198.51.100.80' },
    ],
    links: [
      { id: 'L1', a: 'PC1', b: 'R1', kind: 'eth' },
      { id: 'L2', a: 'R1', b: 'NET', kind: 'eth' },
      { id: 'L3', a: 'NET', b: 'WEB', kind: 'eth' },
    ],
    steps: [
      {
        caption: "PC1's 192.168.10.25 comes from the RFC 1918 private ranges: 10.0.0.0/8, 172.16.0.0/12 and 192.168.0.0/16. Any network may reuse them inside, which is exactly why the internet won't route them.",
        actions: [hl('PC1'), badge('PC1', 'RFC 1918', 'muted')],
      },
      {
        caption: 'PC1 asks for a web page. The packet leaves with source 192.168.10.25 and destination 198.51.100.80, heading for its default gateway, R1.',
        actions: [pk('PC1', 'R1', 'src 192.168.10.25', { shape: 'packet' })],
      },
      {
        caption: 'R1 runs NAT with overload (PAT). It swaps the private source for its one public address, 203.0.113.2, and records the translation, ports and all.',
        actions: [table('R1', 'show ip nat translations', ['Inside global', 'Inside local', 'Outside global'], [nw(['203.0.113.2:49152', '192.168.10.25:49152', '198.51.100.80:443'])], 'bottom')],
      },
      {
        caption: 'The translated packet crosses the internet with source 203.0.113.2, a public address every internet router knows how to reach.',
        actions: [via(['R1', 'NET', 'WEB'], 'src 203.0.113.2', { shape: 'packet', tone: 'good' })],
      },
      {
        caption: 'The reply comes back to 203.0.113.2:49152. R1 finds that port in its table, restores 192.168.10.25 as the destination and forwards it into the LAN.',
        actions: [via(['WEB', 'NET', 'R1', 'PC1'], 'dst 203.0.113.2', { shape: 'packet', tone: 'good', labels: ['dst 203.0.113.2', 'dst 203.0.113.2', 'dst 192.168.10.25'] })],
      },
      {
        caption: 'Without NAT the reply would be addressed to 192.168.10.25, and internet routers have no route for private space: thousands of networks use it at once. Private addressing and NAT travel together.',
        actions: [pk('WEB', 'NET', 'dst 192.168.10.25', { shape: 'packet', tone: 'stamp' }), drop('NET', 'no route: RFC 1918')],
      },
    ],
    takeaway: 'RFC 1918 addresses are free to reuse inside any network but are never routed on the internet, so traffic leaving for the internet must be translated to a public address (NAT, objective 4.1).',
  };

  /* ------------------------------------------------------------------ 1.9 SLAAC + NDP */
  const V6 = ['Kind', 'Address'];
  const LL = 'fe80::250:56ff:fea1:14';
  const GUA = '2001:db8:acad:10:250:56ff:fea1:14';
  const slaac = {
    id: 'sc-slaac-ndp',
    lesson: 'l1-9',
    obj: '1.9',
    title: 'IPv6 SLAAC: an address from thin air',
    summary: 'A host builds a link-local address, checks it is unique, asks for the prefix and configures itself. No DHCP, no ARP.',
    stage: { w: 720, h: 360 },
    actors: [
      { id: 'PC1', kind: 'pc', x: 110, y: 170, label: 'PC1', sub: 'MAC 0050.56a1.0014' },
      { id: 'SW1', kind: 'switch', x: 360, y: 170, label: 'SW1' },
      { id: 'R1', kind: 'router', x: 610, y: 170, label: 'R1', sub: 'Gi0/0 fe80::1' },
      { id: 'PC2', kind: 'pc', x: 480, y: 300, label: 'PC2' },
    ],
    links: [
      { id: 'L1', a: 'PC1', b: 'SW1', kind: 'eth' },
      { id: 'L2', a: 'SW1', b: 'R1', kind: 'eth', label: 'Gi0/0' },
      { id: 'L3', a: 'SW1', b: 'PC2', kind: 'eth' },
    ],
    steps: [
      {
        caption: 'PC1 boots on an IPv6 LAN. First it builds a **link-local** address: fe80::/64 plus a 64-bit interface ID. With modified EUI-64, MAC 0050.56a1.0014 becomes 250:56ff:fea1:14 (ff:fe in the middle, 7th bit flipped).',
        actions: [hl('PC1'), table('PC1', 'IPv6 addresses', V6, [nw(['link-local (tentative)', LL])], 'bottom')],
      },
      {
        caption: "Is it unique? **Duplicate Address Detection**: PC1 sends a Neighbor Solicitation for its own address, from ::, to the solicited-node multicast ff02::1:ffa1:14. If anyone answers, the address is taken.",
        actions: [fl('PC1', ['R1', 'PC2'], 'NS (DAD) ff02::1:ffa1:14', { shape: 'hello', tone: 'warn' })],
      },
      {
        caption: 'Silence means unique. Now PC1 asks for the LAN\'s prefix with a **Router Solicitation** (ICMPv6 type 133) to ff02::2, the all-routers group.',
        actions: [table('PC1', 'IPv6 addresses', V6, [['link-local', LL]], 'bottom'), pk('PC1', 'R1', 'RS to ff02::2', { shape: 'hello' })],
      },
      {
        caption: 'R1 has `ipv6 unicast-routing` on, so it answers with a **Router Advertisement** (type 134) to ff02::1, all nodes. It carries prefix 2001:db8:acad:10::/64, and its source, fe80::1, is the gateway to use.',
        actions: [fl('R1', ['PC1', 'PC2'], 'RA 2001:db8:acad:10::/64', { shape: 'hello', tone: 'good' })],
      },
      {
        caption: "**SLAAC**: PC1 glues the advertised prefix to its interface ID to make a global unicast address, and sets its default gateway to the router's link-local address, fe80::1. No DHCP server involved.",
        actions: [
          table('PC1', 'IPv6 addresses', V6, [['link-local', LL], nw(['global (SLAAC)', GUA]), nw(['default gateway', 'fe80::1'])], 'bottom'),
          badge('PC1', 'SLAAC', 'good'),
          note('PC1', 'Windows and macOS usually pick a random ID here instead of EUI-64.', 'top'),
        ],
      },
      {
        caption: 'DAD runs again for the new global address. Same last 24 bits, so the same solicited-node group, ff02::1:ffa1:14. Still no answer: the address belongs to PC1.',
        actions: [fl('PC1', ['R1', 'PC2'], 'NS (DAD)', { shape: 'hello', tone: 'warn' })],
      },
      {
        caption: "To send anything off the LAN, PC1 needs the gateway's MAC. IPv6 has no ARP: PC1 sends a **Neighbor Solicitation** for fe80::1, and R1 replies with a **Neighbor Advertisement** carrying its MAC.",
        actions: [pk('PC1', 'R1', 'NS: who is fe80::1?'), pk('R1', 'PC1', 'NA: my MAC', { tone: 'good', delay: 1500 })],
      },
      {
        caption: 'R1 keeps the LAN informed with unsolicited RAs (every 200 seconds by default on IOS), so late arrivals and prefix changes are picked up without anyone asking.',
        actions: [fl('R1', ['PC1', 'PC2'], 'RA (periodic)', { shape: 'hello', tone: 'good' }), badge('R1', 'RA every 200 s', 'muted')],
      },
    ],
    takeaway: 'SLAAC lets a host configure itself: a link-local address from fe80::/64, DAD with Neighbor Solicitations, RS and RA to learn the prefix and gateway, then NS and NA in place of ARP.',
  };

  /* ------------------------------------------------------------------ 1.11 wireless */
  const wifi = {
    id: 'sc-wifi-join-roam',
    lesson: 'l1-11',
    obj: '1.11',
    title: 'Joining Wi-Fi, then roaming',
    summary: 'Beacons, a probe, authentication, association and the 4-way handshake, then the laptop walks to the other AP.',
    stage: { w: 720, h: 340 },
    actors: [
      { id: 'SW1', kind: 'switch', x: 360, y: 60, label: 'SW1' },
      { id: 'AP1', kind: 'ap', x: 170, y: 160, label: 'AP1', sub: 'ch 1 · HPL-Staff' },
      { id: 'AP2', kind: 'ap', x: 550, y: 160, label: 'AP2', sub: 'ch 6 · HPL-Staff' },
      { id: 'LAP', kind: 'laptop', x: 360, y: 280, label: 'Laptop' },
    ],
    links: [
      { id: 'E1', a: 'AP1', b: 'SW1', kind: 'eth', label: 'Gi0/1' },
      { id: 'E2', a: 'AP2', b: 'SW1', kind: 'eth', label: 'Gi0/2' },
      { id: 'W1', a: 'LAP', b: 'AP1', kind: 'wifi' },
      { id: 'W2', a: 'LAP', b: 'AP2', kind: 'wifi' },
    ],
    steps: [
      {
        caption: "Two APs cover the dock office on 2.4 GHz channels 1 and 6, two of the three that don't overlap (1, 6 and 11). Both send **beacons** for SSID HPL-Staff about ten times a second.",
        actions: [pk('AP1', 'LAP', 'Beacon: HPL-Staff', { shape: 'wave' }), pk('AP2', 'LAP', 'Beacon: HPL-Staff', { shape: 'wave' })],
      },
      {
        caption: 'The laptop can wait for beacons (passive scanning) or ask out loud (active scanning). It sends a **Probe Request**, and each AP that hears it sends back a **Probe Response**.',
        actions: [fl('LAP', ['AP1', 'AP2'], 'Probe Request', { shape: 'wave' }), pk('AP1', 'LAP', 'Probe Response', { delay: 1400 }), pk('AP2', 'LAP', 'Probe Response', { delay: 1400 })],
      },
      {
        caption: 'It compares signal strength: AP1 at -52 dBm, AP2 at -71 dBm. Closer to zero is stronger, so AP1 it is. The client makes this choice, not the AP.',
        actions: [note('AP1', '-52 dBm', 'left'), note('AP2', '-71 dBm', 'right'), hl('W1', 'good')],
      },
      {
        caption: '802.11 **authentication** comes first. With WPA2 it is just the Open System exchange, a formality (WPA3-Personal runs its SAE exchange here). The real security comes after association.',
        actions: [pk('LAP', 'AP1', 'Authentication'), pk('AP1', 'LAP', 'Authentication: OK', { tone: 'good', delay: 1300 })],
      },
      {
        caption: 'Then **association**: the laptop asks to join HPL-Staff and AP1 accepts, handing it an association ID (AID).',
        actions: [pk('LAP', 'AP1', 'Association Request'), pk('AP1', 'LAP', 'Association Response', { tone: 'good', delay: 1400 }), badge('LAP', 'AP1 · AID 1', 'accent')],
      },
      {
        caption: 'WPA2 and WPA3 finish with the **4-way handshake** (EAPOL-Key frames); Enterprise mode runs 802.1X first. Both sides prove they hold the same key and derive fresh session keys. Only now does data flow, encrypted with AES.',
        actions: [
          pk('AP1', 'LAP', 'EAPOL 1/4', { shape: 'hello' }),
          pk('LAP', 'AP1', 'EAPOL 2/4', { shape: 'hello', delay: 900 }),
          pk('AP1', 'LAP', 'EAPOL 3/4', { shape: 'hello', delay: 1800 }),
          pk('LAP', 'AP1', 'EAPOL 4/4', { shape: 'hello', delay: 2700 }),
          st('W1', 'up'),
        ],
      },
      {
        caption: "Data goes laptop to AP1 over the air, then out AP1's wired port as an ordinary Ethernet frame. SW1 learns the laptop's MAC on Gi0/1.",
        actions: [via(['LAP', 'AP1', 'SW1'], '802.11 data', { labels: ['802.11 data (AES)', 'Ethernet frame'] }), badge('SW1:E1', 'laptop MAC', 'good')],
      },
      {
        caption: "The laptop walks to the far end of the office. AP1 fades to -78 dBm while AP2 climbs to -55 dBm. The client's driver decides it is time to roam.",
        actions: [note('AP1', '-78 dBm', 'left'), note('AP2', '-55 dBm', 'right'), hl('W2', 'good')],
      },
      {
        caption: 'After a quick Open System authentication with AP2, it sends a **Reassociation Request** on channel 6, naming AP1 as its old AP, and AP2 accepts. New AP, new keys: a fresh 4-way handshake follows (802.11r or key caching skips a full 802.1X login).',
        actions: [st('W1', 'normal'), pk('LAP', 'AP2', 'Reassociation Request'), pk('AP2', 'LAP', 'Reassociation Response', { tone: 'good', delay: 1400 }), st('W2', 'up'), badge('LAP', 'AP2 · AID 3', 'accent')],
      },
      {
        caption: "Traffic now enters the wire at AP2's port. With the first frame, SW1 moves the laptop's MAC from Gi0/1 to Gi0/2.",
        actions: [via(['LAP', 'AP2', 'SW1'], '802.11 data', { labels: ['802.11 data (AES)', 'Ethernet frame'] }), badge('SW1:E1', null), badge('SW1:E2', 'laptop MAC', 'good')],
      },
    ],
    takeaway: 'APs advertise their SSID in beacons; a client probes, authenticates, associates and runs the 4-way handshake, and later decides on its own to reassociate to a stronger AP with the same SSID.',
  };

  /* ------------------------------------------------------------------ 1.12 virtualization */
  const vswitch = {
    id: 'sc-vm-vswitch',
    lesson: 'l1-12',
    obj: '1.12',
    title: 'VMs on a hypervisor, through a vSwitch',
    summary: 'Three servers in one box: frames between VMs never leave the host, and the uplink is a trunk.',
    stage: { w: 720, h: 380 },
    zones: [{ label: 'ESXi-01 · one physical server', x: 30, y: 24, w: 400, h: 340, tone: 'accent' }],
    actors: [
      { id: 'VM1', kind: 'server', x: 110, y: 90, label: 'VM-WEB', sub: 'VLAN 10' },
      { id: 'VM2', kind: 'server', x: 110, y: 200, label: 'VM-DB', sub: 'VLAN 10' },
      { id: 'VSW', kind: 'switch', x: 320, y: 200, label: 'vSwitch0' },
      { id: 'SW1', kind: 'switch', x: 560, y: 200, label: 'SW1' },
      { id: 'PC1', kind: 'pc', x: 640, y: 320, label: 'PC-OPS', sub: 'VLAN 10' },
    ],
    links: [
      { id: 'V1', a: 'VM1', b: 'VSW', kind: 'eth', label: 'vNIC' },
      { id: 'V2', a: 'VM2', b: 'VSW', kind: 'eth', label: 'vNIC' },
      { id: 'V3', a: 'VM3', b: 'VSW', kind: 'eth', label: 'vNIC' },
      { id: 'UP', a: 'VSW', b: 'SW1', kind: 'trunk', label: 'vmnic0 · 802.1Q' },
      { id: 'P1', a: 'SW1', b: 'PC1', kind: 'eth' },
    ],
    steps: [
      {
        caption: 'One physical server, ESXi-01, runs a **type 1 hypervisor** straight on the hardware. It carves CPU, memory and storage into virtual machines, each with its own OS and its own virtual NIC and MAC.',
        actions: [hl('VM1'), hl('VM2')],
      },
      {
        caption: 'The vNICs plug into **vSwitch0**, a software switch inside the hypervisor. It does a switch\'s job: knows the MAC behind each virtual port and forwards frames between them.',
        actions: [table('VSW', 'vSwitch0 ports', ['MAC', 'Port group'], [['0050.56aa.0010', 'VM-WEB · VLAN 10'], ['0050.56aa.0020', 'VM-DB · VLAN 10']], 'bottom')],
      },
      {
        caption: 'VM-WEB queries VM-DB. Both live on this host in the same VLAN, so the frame goes VM to vSwitch to VM in memory and never touches a physical cable.',
        actions: [via(['VM1', 'VSW', 'VM2'], 'SQL query'), note('VSW', 'Never leaves the box.', 'top')],
      },
      {
        caption: "Traffic for the outside world leaves through the server's physical NIC, vmnic0. The uplink is an 802.1Q trunk, so the vSwitch tags each frame with its port group's VLAN.",
        actions: [hide('VSW'), via(['VM1', 'VSW', 'SW1', 'PC1'], 'web reply', { labels: ['untagged', '802.1Q VID 10', 'untagged'], tone: 'good' })],
      },
      {
        caption: 'Need another server? A few clicks, not a purchase order. VM-APP appears in VLAN 20 on the same hardware.',
        actions: [{ do: 'add', actor: { id: 'VM3', kind: 'server', x: 110, y: 310, label: 'VM-APP', sub: 'VLAN 20' } }, hl('VM3', 'good')],
      },
      {
        caption: "VM-APP's traffic rides the same trunk, tagged VID 20. One physical cable carries both VLANs, and SW1 keeps them apart.",
        actions: [via(['VM3', 'VSW', 'SW1'], 'to gateway', { labels: ['untagged', '802.1Q VID 20'], tone: 'warn' })],
      },
      {
        caption: "Isolation: when VM-DB's guest OS crashes, only VM-DB goes down. (Containers go lighter still: they share the host OS kernel instead of each booting a whole OS. VRFs do the same trick for routing tables.)",
        actions: [drop('VM2', 'guest OS crashed'), badge('VM1', 'still up', 'good'), badge('VM3', 'still up', 'good')],
      },
    ],
    takeaway: 'A hypervisor runs many isolated VMs on one server; their virtual NICs connect to a virtual switch that forwards locally and tags traffic onto a physical 802.1Q trunk.',
  };

  /* ------------------------------------------------------------------ 2.2 802.1Q */
  const dot1q = {
    id: 'sc-dot1q-trunk',
    lesson: 'l2-2',
    obj: '2.2',
    title: '802.1Q: tag on, tag off, native untagged',
    summary: 'Frames pick up a VLAN tag to cross the trunk and lose it on the far side, except in the native VLAN.',
    stage: { w: 720, h: 360 },
    actors: [
      { id: 'PCA', kind: 'pc', x: 90, y: 80, label: 'PC-A', sub: 'VLAN 10' },
      { id: 'PCC', kind: 'pc', x: 90, y: 290, label: 'PC-C', sub: 'VLAN 20' },
      { id: 'SW1', kind: 'switch', x: 260, y: 185, label: 'SW1' },
      { id: 'SW2', kind: 'switch', x: 460, y: 185, label: 'SW2' },
      { id: 'PCB', kind: 'pc', x: 630, y: 80, label: 'PC-B', sub: 'VLAN 10' },
      { id: 'PCD', kind: 'pc', x: 630, y: 290, label: 'PC-D', sub: 'VLAN 20' },
    ],
    links: [
      { id: 'A1', a: 'PCA', b: 'SW1', kind: 'eth', label: 'Fa0/1' },
      { id: 'A2', a: 'PCC', b: 'SW1', kind: 'eth', label: 'Fa0/2' },
      { id: 'T1', a: 'SW1', b: 'SW2', kind: 'trunk', label: 'Gi0/1 trunk' },
      { id: 'B1', a: 'SW2', b: 'PCB', kind: 'eth', label: 'Fa0/1' },
      { id: 'B2', a: 'SW2', b: 'PCD', kind: 'eth', label: 'Fa0/2' },
    ],
    steps: [
      {
        caption: 'Two switches, two VLANs, one trunk. Access ports carry a single VLAN in plain untagged frames. The Gi0/1 trunk carries VLANs 10 and 20 between the switches, with native VLAN 99.',
        actions: [hl('T1'), badge('SW1:T1', 'native 99', 'muted'), badge('SW2:T1', 'native 99', 'muted')],
      },
      {
        caption: "PC-A sends a frame to PC-B. It leaves untagged; PCs don't know VLANs exist. SW1 knows Fa0/1 is an access port in VLAN 10.",
        actions: [pk('PCA', 'SW1', 'untagged')],
      },
      {
        caption: 'To cross the trunk, SW1 inserts a 4-byte **802.1Q tag** after the source MAC: TPID 0x8100, the priority bits, and the 12-bit VLAN ID, 10. Then it recalculates the FCS.',
        actions: [pk('SW1', 'SW2', 'VID 10', { tone: 'warn' }), note('T1', 'TPID 0x8100 · PCP · DEI · VID 10', 'top')],
      },
      {
        caption: 'SW2 reads VID 10, strips the tag and sends the original frame out its VLAN 10 access port. PC-B gets a normal untagged frame.',
        actions: [pk('SW2', 'PCB', 'untagged', { tone: 'good' })],
      },
      {
        caption: "PC-C's traffic does the same dance in VLAN 20: untagged on the access port, tagged VID 20 on the trunk, untagged again at the far end.",
        actions: [via(['PCC', 'SW1', 'SW2', 'PCD'], 'untagged', { labels: ['untagged', 'VID 20', 'untagged'] })],
      },
      {
        caption: "The **native VLAN** is the exception: its frames cross the trunk untagged. Anything SW1 sends in VLAN 99 goes over bare, and SW2 puts any untagged frame into its own native VLAN.",
        actions: [pk('SW1', 'SW2', 'untagged (native 99)', { tone: 'muted' })],
      },
      {
        caption: 'Now SW2 is left at the default native VLAN 1. The untagged VLAN 99 frame lands in VLAN 1 on SW2, so traffic leaks between VLANs, and CDP logs `%CDP-4-NATIVE_VLAN_MISMATCH`.',
        actions: [badge('SW2:T1', 'native 1', 'stamp'), pk('SW1', 'SW2', 'untagged (native 99)', { tone: 'stamp' }), note('SW2', 'Lands in VLAN 1!', 'bottom')],
      },
      {
        caption: 'The fix: `switchport trunk native vlan 99` on both ends, and `switchport trunk allowed vlan 10,20,99` to carry only what is needed. Many shops pick an unused native VLAN so nothing important rides untagged.',
        actions: [badge('SW1:T1', 'native 99', 'good'), badge('SW2:T1', 'native 99', 'good'), st('T1', 'up')],
      },
    ],
    takeaway: 'On an 802.1Q trunk every VLAN is tagged except the native VLAN, which crosses untagged; both ends must agree on the native VLAN or traffic leaks between VLANs.',
  };

  /* ------------------------------------------------------------------ 2.3 CDP / LLDP */
  const CDPC = ['Device ID', 'Local Intrfce', 'Holdtme', 'Capability', 'Platform', 'Port ID'];
  const cdp = {
    id: 'sc-cdp-lldp',
    lesson: 'l2-3',
    obj: '2.3',
    title: 'CDP and LLDP: asking the neighbors',
    summary: 'Discovery protocols turn an unlabeled closet into a map, and show why you switch them off at the edge.',
    stage: { w: 720, h: 350 },
    actors: [
      { id: 'R1', kind: 'router', x: 120, y: 90, label: 'HPL-BR-R1', sub: 'ISR4331' },
      { id: 'SW1', kind: 'switch', x: 360, y: 170, label: 'HPL-BR-SW1' },
      { id: 'VSW', kind: 'switch', x: 600, y: 90, label: 'Vendor switch', sub: 'third-party' },
    ],
    links: [
      { id: 'L1', a: 'R1', b: 'SW1', kind: 'eth', label: 'Gi0/0/0 – Gi0/1' },
      { id: 'L2', a: 'SW1', b: 'VSW', kind: 'eth', label: 'Gi0/2 – port 24' },
    ],
    steps: [
      {
        caption: "New branch, no diagram. Kenji's trick: ask the neighbors. **CDP** is Cisco proprietary, on by default, and announces the device out every interface every 60 seconds.",
        actions: [hl('SW1'), badge('SW1', 'CDP on', 'muted')],
      },
      {
        caption: 'SW1 sends CDP to multicast MAC 0100.0ccc.cccc. It carries the hostname, platform, IOS version, port ID, native VLAN and management address. Neighbors keep it; they never forward it.',
        actions: [fl('SW1', ['R1', 'VSW'], 'CDP', { shape: 'hello' })],
      },
      {
        caption: 'The router announces itself too, and SW1 stores what it hears. `show cdp neighbors` now names the router, the local port it\'s on, its platform and its port.',
        actions: [pk('R1', 'SW1', 'CDP', { shape: 'hello' }), table('SW1', 'show cdp neighbors', CDPC, [nw(['HPL-BR-R1', 'Gig 0/1', '172', 'R B S I', 'ISR4331', 'Gig 0/0/0'])], 'bottom')],
      },
      {
        caption: 'The hold time counts down from 180 seconds and resets with each announcement. Unplug the router and its entry vanishes when the hold time runs out.',
        actions: [table('SW1', 'show cdp neighbors', CDPC, [['HPL-BR-R1', 'Gig 0/1', '121', 'R B S I', 'ISR4331', 'Gig 0/0/0']], 'bottom'), note('R1', 'holdtime 180 s, refreshed every 60 s', 'right')],
      },
      {
        caption: "The vendor switch doesn't speak CDP, so it never shows up. For mixed gear you need the open standard, **LLDP** (IEEE 802.1AB).",
        actions: [pk('SW1', 'VSW', 'CDP', { shape: 'hello' }), drop('VSW', 'not understood')],
      },
      {
        caption: 'LLDP is off by default on most Cisco IOS devices; `lldp run` turns it on globally. It sends to 0180.c200.000e every 30 seconds, with a 120-second hold time.',
        actions: [badge('SW1', 'CDP + LLDP', 'good'), fl('SW1', ['R1', 'VSW'], 'LLDP', { shape: 'hello', tone: 'good' })],
      },
      {
        caption: 'The vendor switch answers in LLDP. `show lldp neighbors` lists it with its port ID. Now every box in the closet has a name and a port.',
        actions: [pk('VSW', 'SW1', 'LLDP', { shape: 'hello', tone: 'good' }), table('SW1', 'show lldp neighbors', ['Device ID', 'Local Intf', 'Hold-time', 'Capability', 'Port ID'], [nw(['VND-SW-01', 'Gi0/2', '120', 'B', 'port 24'])], 'bottom')],
      },
      {
        caption: 'Both protocols hand a map of your network to anything plugged in. Turn them off on ports that face users or outsiders: `no cdp enable`, `no lldp transmit` and `no lldp receive` on the interface.',
        actions: [hide('SW1'), note('SW1', 'Edge ports: discovery off', 'bottom'), hl('L1', 'muted')],
      },
    ],
    takeaway: 'CDP (Cisco, on by default, 60 s / 180 s) and LLDP (open standard, off by default on IOS, 30 s / 120 s) identify directly connected neighbors; disable them where untrusted devices connect.',
  };

  /* ------------------------------------------------------------------ 2.4 EtherChannel */
  const ECS = ['Group', 'Port-channel', 'Protocol', 'Ports'];
  const ether = {
    id: 'sc-etherchannel-lacp',
    lesson: 'l2-4',
    obj: '2.4',
    title: 'EtherChannel: two cables, one link',
    summary: 'LACP bundles two links, a hash spreads the flows, and a crushed cable just shrinks the bundle.',
    stage: { w: 720, h: 330 },
    actors: [
      { id: 'PCA', kind: 'pc', x: 90, y: 70, label: 'PC-A' },
      { id: 'PCB', kind: 'pc', x: 230, y: 70, label: 'PC-B' },
      { id: 'SW1', kind: 'switch', x: 160, y: 190, label: 'SW1' },
      { id: 'SW2', kind: 'switch', x: 560, y: 190, label: 'SW2' },
      { id: 'SRV1', kind: 'server', x: 490, y: 70, label: 'SRV1' },
      { id: 'SRV2', kind: 'server', x: 630, y: 70, label: 'SRV2' },
    ],
    links: [
      { id: 'LA', a: 'PCA', b: 'SW1', kind: 'eth' },
      { id: 'LB', a: 'PCB', b: 'SW1', kind: 'eth' },
      { id: 'M1', a: 'SW1', b: 'SW2', kind: 'eth', label: 'Gi0/1' },
      { id: 'M2', a: 'SW1', b: 'SW2', kind: 'eth', label: 'Gi0/2' },
      { id: 'S1', a: 'SW2', b: 'SRV1', kind: 'eth' },
      { id: 'S2', a: 'SW2', b: 'SRV2', kind: 'eth' },
    ],
    steps: [
      {
        caption: 'SW1 and SW2 are joined by two gigabit links for more bandwidth. Without EtherChannel, spanning tree sees a loop and blocks one of them, so half the money sits idle.',
        actions: [st('SW2:M2', 'blocked'), badge('SW2:M2', 'BLK', 'warn')],
      },
      {
        caption: 'Both ends get `channel-group 1 mode active`. Each member now sends **LACP** PDUs (IEEE 802.3ad) to negotiate the bundle and check that both sides agree.',
        actions: [
          pk('SW1', 'SW2', 'LACP', { shape: 'hello', via: 'M1' }),
          pk('SW1', 'SW2', 'LACP', { shape: 'hello', via: 'M2' }),
          pk('SW2', 'SW1', 'LACP', { shape: 'hello', via: 'M1', delay: 1200 }),
          pk('SW2', 'SW1', 'LACP', { shape: 'hello', via: 'M2', delay: 1200 }),
        ],
      },
      {
        caption: 'Agreement. The links bundle into **Port-channel 1**. STP now sees one logical link, so nothing is blocked and both members forward.',
        actions: [
          st('SW2:M2', 'normal'),
          badge('SW2:M2', null),
          st('M1', 'up'),
          st('M2', 'up'),
          table('SW1', 'show etherchannel summary', ECS, [nw(['1', 'Po1(SU)', 'LACP', 'Gi0/1(P) Gi0/2(P)'])], 'bottom'),
        ],
      },
      {
        caption: "Traffic is spread by a **hash** of frame addresses, not round robin (many Catalyst switches hash on source MAC by default). PC-A's flow to SRV1 lands on Gi0/1.",
        actions: [via(['PCA', 'SW1', 'SW2', 'SRV1'], 'flow A', { via: [null, 'M1', null] })],
      },
      {
        caption: "PC-B's flow to SRV2 hashes to Gi0/2. Both links carry traffic at once, but each flow always rides the same member, so its frames never arrive out of order.",
        actions: [via(['PCB', 'SW1', 'SW2', 'SRV2'], 'flow B', { via: [null, 'M2', null], tone: 'good' }), via(['PCA', 'SW1', 'SW2', 'SRV1'], 'flow A', { via: [null, 'M1', null], delay: 500 })],
      },
      {
        caption: 'A pallet jack crushes a cable: Gi0/2 goes down. Port-channel 1 stays up on Gi0/1 with half the bandwidth. No STP reconvergence, because the logical link never went away.',
        actions: [st('M2', 'down'), table('SW1', 'show etherchannel summary', ECS, [nw(['1', 'Po1(SU)', 'LACP', 'Gi0/1(P) Gi0/2(D)'])], 'bottom')],
      },
      {
        caption: "PC-B's flow is simply rehashed onto the surviving member. Users notice nothing, except maybe a slower afternoon.",
        actions: [via(['PCB', 'SW1', 'SW2', 'SRV2'], 'flow B', { via: [null, 'M1', null], tone: 'good' })],
      },
      {
        caption: 'Bundle rules: members must match speed, duplex, access or trunk mode, and VLANs. LACP needs at least one side **active**; passive plus passive never forms. PAgP (desirable/auto) is the Cisco-only alternative.',
        actions: [badge('SW1', 'LACP active', 'muted'), badge('SW2', 'LACP active', 'muted'), note('M1', 'Match speed, duplex, mode, VLANs', 'top')],
      },
    ],
    takeaway: 'EtherChannel bundles parallel links into one logical link that STP will not block; LACP negotiates it, a hash pins each flow to one member, and a failed member only shrinks the bundle.',
  };

  /* ------------------------------------------------------------------ 2.5 Rapid PVST+ */
  const stp = {
    id: 'sc-stp-election',
    lesson: 'l2-5',
    obj: '2.5',
    title: 'Rapid PVST+: elect a root, break the loop',
    summary: 'Three switches in a triangle elect a root, assign port roles, block one port, then recover from a cut cable.',
    stage: { w: 720, h: 350 },
    actors: [
      { id: 'SW1', kind: 'switch', x: 360, y: 70, label: 'SW1', sub: '32769 · 0011.1111.1111' },
      { id: 'SW2', kind: 'switch', x: 150, y: 270, label: 'SW2', sub: '32769 · 0022.2222.2222' },
      { id: 'SW3', kind: 'switch', x: 570, y: 270, label: 'SW3', sub: '32769 · 0033.3333.3333' },
    ],
    links: [
      { id: 'L12', a: 'SW1', b: 'SW2', kind: 'eth' },
      { id: 'L13', a: 'SW1', b: 'SW3', kind: 'eth' },
      { id: 'L23', a: 'SW2', b: 'SW3', kind: 'eth' },
    ],
    steps: [
      {
        caption: "Three switches in a triangle: a physical loop. Without STP, one broadcast would circle forever. Each switch boots believing it is the root bridge and says so in its BPDUs, which carry the root bridge ID, root path cost, sender bridge ID and port ID.",
        actions: [fl('SW1', ['SW2', 'SW3'], 'root = me', { shape: 'hello', tone: 'muted' }), fl('SW2', ['SW1', 'SW3'], 'root = me', { shape: 'hello', tone: 'muted', delay: 300 }), fl('SW3', ['SW1', 'SW2'], 'root = me', { shape: 'hello', tone: 'muted', delay: 600 })],
      },
      {
        caption: "Lowest bridge ID wins: priority first (all default, 32768 + VLAN 1 = 32769), then lowest MAC. SW1's 0011.1111.1111 is lowest, so it is the **root bridge**, and everyone now advertises SW1 as root.",
        actions: [badge('SW1', 'ROOT', 'good'), hl('SW1', 'good'), fl('SW1', ['SW2', 'SW3'], 'root = SW1', { shape: 'hello', tone: 'good' })],
      },
      {
        caption: "Each non-root switch picks one **root port**: its cheapest path to the root. A 1 Gb/s link costs 4, so SW2's and SW3's direct links (cost 4) beat going the long way round (cost 8).",
        actions: [badge('SW2:L12', 'RP', 'accent'), badge('SW3:L13', 'RP', 'accent')],
      },
      {
        caption: "Every link gets one **designated port**, the end closest to the root. The root bridge's own ports are always designated, so both of SW1's ports become DP.",
        actions: [badge('SW1:L12', 'DP', 'good'), badge('SW1:L13', 'DP', 'good')],
      },
      {
        caption: "On the SW2-SW3 link both ends have root cost 4. Tiebreak: lower bridge ID. SW2 (0022...) wins and is designated; SW3's port becomes **alternate** and discards. Loop broken.",
        actions: [badge('SW2:L23', 'DP', 'good'), badge('SW3:L23', 'ALT', 'warn'), st('SW3:L23', 'blocked'), hl('SW3:L23', 'warn')],
      },
      {
        caption: "Steady state. In Rapid PVST+ every switch sends BPDUs every 2 seconds (the hello time). SW3 keeps listening on its alternate port, so it always knows a backup path exists.",
        actions: [fl('SW1', ['SW2', 'SW3'], 'BPDU', { shape: 'hello', tone: 'good' }), pk('SW2', 'SW3', 'BPDU', { shape: 'hello', tone: 'good', delay: 600 })],
      },
      {
        caption: 'A forklift snags the SW1-SW3 cable. SW3 loses its root port, and with it the path to the root.',
        actions: [st('L13', 'down'), badge('SW3:L13', null), badge('SW1:L13', null), note('SW3', 'Root port lost', 'bottom')],
      },
      {
        caption: "Rapid PVST+ doesn't wait for timers. The alternate port was already the known backup, so SW3 makes it the new **root port** and moves it straight to forwarding. Its root cost is now 8.",
        actions: [st('SW3:L23', 'normal'), badge('SW3:L23', 'RP', 'accent'), badge('SW3', 'cost 8', 'muted')],
      },
      {
        caption: "SW3 reaches the root through SW2 well inside a second. Legacy 802.1D would have spent about 30 seconds in listening and learning here, and up to 50 if it first waited out max age.",
        actions: [via(['SW3', 'SW2', 'SW1'], 'data', { tone: 'good' })],
      },
    ],
    takeaway: 'STP elects the lowest bridge ID as root, gives each switch one root port and each link one designated port, and parks the rest as alternate; Rapid PVST+ promotes an alternate port almost instantly when the root port fails.',
  };

  /* ------------------------------------------------------------------ 2.6 CAPWAP */
  const capwap = {
    id: 'sc-capwap-split-mac',
    lesson: 'l2-6',
    obj: '2.6',
    title: 'Split-MAC: an AP and its controller',
    summary: 'A lightweight AP finds its WLC, builds CAPWAP tunnels, and splits 802.11 work between them.',
    stage: { w: 720, h: 350 },
    actors: [
      { id: 'LAP', kind: 'laptop', x: 80, y: 260, label: 'Laptop' },
      { id: 'AP1', kind: 'ap', x: 200, y: 110, label: 'AP1', sub: 'local mode' },
      { id: 'SW1', kind: 'switch', x: 380, y: 250, label: 'SW1' },
      { id: 'WLC', kind: 'wlc', x: 580, y: 110, label: 'WLC1', sub: '10.10.20.5' },
      { id: 'SRV1', kind: 'server', x: 620, y: 280, label: 'SRV1' },
    ],
    links: [
      { id: 'W', a: 'LAP', b: 'AP1', kind: 'wifi' },
      { id: 'A1', a: 'AP1', b: 'SW1', kind: 'eth' },
      { id: 'U1', a: 'SW1', b: 'WLC', kind: 'trunk' },
      { id: 'S1', a: 'SW1', b: 'SRV1', kind: 'eth' },
      { id: 'TUN', a: 'AP1', b: 'WLC', kind: 'tunnel', label: 'CAPWAP' },
    ],
    steps: [
      {
        caption: "A lightweight AP can't do much on its own. AP1 boots, gets an IP address by DHCP and goes looking for a wireless LAN controller (DHCP option 43, DNS, or a local broadcast).",
        actions: [st('TUN', 'down'), hl('AP1'), badge('AP1', 'no WLC yet', 'warn')],
      },
      {
        caption: 'AP1 sends a **CAPWAP Discovery Request** to the controller on UDP 5246, and the WLC answers with a Discovery Response.',
        actions: [via(['AP1', 'SW1', 'WLC'], 'Discovery Request'), via(['WLC', 'SW1', 'AP1'], 'Discovery Response', { tone: 'good', delay: 1800 })],
      },
      {
        caption: 'AP1 joins. They build a DTLS-encrypted **control tunnel** (UDP 5246) and a **data tunnel** (UDP 5247; DTLS on data is optional). The AP downloads new firmware if its version differs, then its config.',
        actions: [via(['AP1', 'SW1', 'WLC'], 'Join Request'), via(['WLC', 'SW1', 'AP1'], 'Join Response', { tone: 'good', delay: 1800 }), badge('AP1', 'joined WLC1', 'good')],
      },
      {
        caption: 'This is **split-MAC**. Real-time 802.11 work stays on the AP: beacons, probe responses, ACKs and encryption. AP1 beacons HPL-Staff on its own.',
        actions: [st('TUN', 'up'), pk('AP1', 'LAP', 'Beacon: HPL-Staff', { shape: 'wave' })],
      },
      {
        caption: "Management work moves to the WLC: authentication, association, roaming and RF tuning. The laptop's Association Request rides the CAPWAP tunnel to the WLC, which makes the call.",
        actions: [
          via(['LAP', 'AP1', 'WLC'], 'Association Request', { via: ['W', 'TUN'], labels: ['Association Request', 'CAPWAP control'] }),
          via(['WLC', 'AP1', 'LAP'], 'Association Response', { via: ['TUN', 'W'], labels: ['CAPWAP control', 'Association Response'], tone: 'good', delay: 2200 }),
          badge('LAP', 'associated', 'good'),
        ],
      },
      {
        caption: "Data takes the tunnel too. The laptop's frame reaches AP1 over the air, gets wrapped in CAPWAP (UDP 5247) and travels to the WLC, which bridges it onto the wired VLAN.",
        actions: [via(['LAP', 'AP1', 'WLC'], '802.11 data', { via: ['W', 'TUN'], labels: ['802.11 data', 'CAPWAP data'] })],
      },
      {
        caption: 'From the WLC it is ordinary Ethernet to the server. Replies return the same way: to the WLC, back through the tunnel, out AP1\'s radio.',
        actions: [
          via(['WLC', 'SW1', 'SRV1'], 'Ethernet frame'),
          via(['SRV1', 'SW1', 'WLC'], 'reply', { tone: 'good', delay: 1700 }),
          via(['WLC', 'AP1', 'LAP'], 'reply', { via: ['TUN', 'W'], labels: ['CAPWAP data', '802.11 data'], tone: 'good', delay: 3400 }),
        ],
      },
      {
        caption: "The wiring follows: AP1's switch port is an **access port**, because everything it sends is tunneled from one IP. The WLC uplink is a **trunk** (often a LAG) because it drops many WLANs onto many VLANs.",
        actions: [badge('SW1:A1', 'access', 'accent'), badge('SW1:U1', 'trunk', 'accent'), note('AP1', 'FlexConnect APs can switch data locally instead.', 'right')],
      },
    ],
    takeaway: 'In split-MAC the lightweight AP handles real-time radio work and the WLC handles management; they talk over CAPWAP (control on UDP 5246, data on UDP 5247).',
  };

  /* ------------------------------------------------------------------ 2.8 SSH vs Telnet */
  const CAP = ['Proto', 'What Eve sees'];
  const ssh = {
    id: 'sc-ssh-vs-telnet',
    lesson: 'l2-8',
    obj: '2.8',
    title: 'Telnet tells everyone; SSH tells no one',
    summary: 'The same login twice, with a laptop that gets a copy of every frame.',
    stage: { w: 720, h: 370 },
    actors: [
      { id: 'ADM', kind: 'laptop', x: 90, y: 170, label: 'Admin laptop', sub: '10.10.99.50' },
      { id: 'SW2', kind: 'switch', x: 310, y: 170, label: 'SW2' },
      { id: 'SW1', kind: 'switch', x: 580, y: 170, label: 'HPL-CORE-SW1', sub: 'mgmt 10.10.99.2' },
      { id: 'EVE', kind: 'laptop', x: 310, y: 300, label: 'Unknown laptop', sub: 'Fa0/9' },
    ],
    links: [
      { id: 'L1', a: 'ADM', b: 'SW2', kind: 'eth' },
      { id: 'L2', a: 'SW2', b: 'SW1', kind: 'eth', label: 'Gi0/1' },
      { id: 'L3', a: 'SW2', b: 'EVE', kind: 'eth', label: 'Fa0/9' },
    ],
    steps: [
      {
        caption: "A late-night change on the core switch. The admin connects with **Telnet** (TCP 23). Nobody knows that the laptop on SW2 Fa0/9 is getting a copy of every frame, courtesy of a forgotten SPAN session.",
        actions: [hl('EVE', 'stamp'), badge('EVE', 'capturing', 'stamp'), table('EVE', 'packet capture', CAP, [], 'right')],
      },
      {
        caption: 'Telnet sends every keystroke in cleartext. The switch prompts, the admin types the username, and the capture reads it as plainly as you do.',
        actions: [fl('ADM', ['SW1', 'EVE'], 'Username: nightops', { tone: 'warn' }), table('EVE', 'packet capture', CAP, [nw(['TELNET', 'Username: nightops'])], 'right')],
      },
      {
        caption: 'Then the password, also in cleartext. Eve now holds working credentials for the core switch. This is why Telnet has no place on a production network.',
        actions: [fl('ADM', ['SW1', 'EVE'], 'Password: Harbor!23', { tone: 'stamp' }), table('EVE', 'packet capture', CAP, [['TELNET', 'Username: nightops'], nw(['TELNET', 'Password: Harbor!23'])], 'right'), badge('EVE', 'has the password', 'stamp')],
      },
      {
        caption: 'Switch to **SSH** (TCP 22). SW1 needs a hostname, `ip domain-name`, an RSA key (`crypto key generate rsa modulus 2048`), `ip ssh version 2`, a local `username` and `login local` on the vty lines.',
        actions: [hl('SW1', 'good'), badge('SW1', 'SSH v2', 'good'), note('SW1', 'crypto key generate rsa', 'top')],
      },
      {
        caption: "SSH opens with a Diffie-Hellman key exchange, and SW1 proves its identity with its host key. Eve captures every byte of it, but can't work out the session key from what she sees.",
        actions: [fl('ADM', ['SW1', 'EVE'], 'key exchange', { shape: 'hello', tone: 'good' }), table('EVE', 'packet capture', CAP, [['TELNET', 'Password: Harbor!23'], nw(['SSH', 'key exchange (useless to Eve)'])], 'right')],
      },
      {
        caption: 'Now the login and every command travel encrypted. The capture fills with noise. Same switch, same admin, nothing worth stealing.',
        actions: [fl('ADM', ['SW1', 'EVE'], 'encrypted', { tone: 'good' }), table('EVE', 'packet capture', CAP, [['SSH', 'key exchange (useless to Eve)'], nw(['SSH', '8f 3a c1 9e 07 d2 5b ...'])], 'right')],
      },
      {
        caption: 'Finish the job: `transport input ssh` on the vty lines so Telnet is refused outright, change the leaked password, and remove that SPAN session. A Telnet attempt now dies at SW1.',
        actions: [via(['ADM', 'SW2', 'SW1'], 'Telnet to :23', { tone: 'stamp' }), drop('SW1', 'refused'), badge('EVE', 'old password', 'muted')],
      },
    ],
    takeaway: 'Telnet sends usernames, passwords and commands in cleartext; SSH encrypts the whole session, so use SSH version 2 and `transport input ssh` on the vty lines.',
  };

  TT.scenes.push(encapsulation, macLearning, arp, tcpUdp, duplex, privateNat, slaac, wifi, vswitch, dot1q, cdp, ether, stp, capwap, ssh);
})(typeof globalThis !== 'undefined' ? globalThis : window);
