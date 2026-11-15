/* Trouble Ticket — lessons, part 1: exam domains 1.0 Network Fundamentals and 2.0 Network Access
 * (CCNA 200-301 v1.1 objectives 1.1-1.13 and 2.1-2.9). All text is original.
 *
 * LESSON DATA FORMAT (shared with src/lessons-2.js; rendered by src/lessons-ui.js)
 * Push plain objects onto TT.lessons (create it if missing: TT.lessons = TT.lessons || []).
 * {
 *   id: 'l1-6',            // 'l' + objective with the dot replaced by a dash
 *   obj: '1.6',            // blueprint objective number
 *   domain: 'fund',        // fund | access | ipconn | svc | sec | auto  (TT.domains ids)
 *   title: 'Subnetting without tears',
 *   minutes: 12,           // honest reading + try-it time
 *   caseFile: 'Two or three sentences: the Harbor Point situation that makes this topic matter tonight.',
 *   sections: [ { h: 'Heading', body: [ ...blocks ] } ],
 *   techNotes: ['Senior tech sidebar tip', ...],        // 2-4 practical tips
 *   examTraps: ['Common wrong assumption, and the truth', ...],
 *   tryIt: [ { device, mode, prompt, cmds: [...] } ],   // optional, see below
 *   check: [ ['Question?', ['A','B','C','D'], 1, 'Why B is right and the others are not'] ],  // exactly 3
 *   related: { tickets: ['t05'], cards: ['static'], hw: 'cable'|'ports'|'gear'|null, drill: false },
 * }
 *
 * Blocks inside a section body:
 *   'paragraph text'                      inline markup: **bold**, `code`, [text](#hash). Everything else is escaped.
 *   { list: ['item', 'item'] }            bullet list (inline markup allowed)
 *   { steps: ['first', 'second'] }        numbered list
 *   { table: [['Head','Head'], ['a','b']] }   first row is the header (inline markup allowed in cells)
 *   { cli: ['R1# show ip interface brief', 'output line'] }   dark terminal block; a leading prompt
 *                                          (Name#, Name(config-if)#, Name>, C:\>, user@host$) is highlighted
 *   { note: 'callout text' }              accent callout
 *   { svg: '<svg ...>', caption: 'optional caption' }   trusted inline SVG, inserted as-is.
 *     Use a viewBox (no fixed width/height) and colors that follow the theme: currentColor, or these classes:
 *     shapes  ls-ln (ink stroke) ls-thin (muted thin stroke) ls-dash (dashed) ls-box (sheet fill, line stroke)
 *             ls-dev (sheet fill, ink stroke) ls-accf (accent fill+stroke) ls-acc (accent stroke)
 *             ls-goodf ls-badf ls-warnf (tinted fills) ls-good ls-bad (colored strokes) ls-dot (currentColor fill)
 *     text    ls-t-mut ls-t-acc ls-t-good ls-t-bad ls-t-warn, ls-mono, ls-sm (11px), ls-lg (16px), ls-b (bold)
 *     Add class="ls-wide" on the <svg> for wide diagrams: they keep a 540px minimum and scroll sideways on phones.
 *
 * tryIt: runs on a fresh lab bench (TT.lessonLab in lessons-ui.js):
 *   HPL-LAB-R1 Gi0/0 10.10.10.1/24 -> HPL-LAB-SW1 Fa0/8; SW1 Gi0/1 and Gi0/2 -> HPL-LAB-SW2 Gi0/1 and Gi0/2;
 *   LAB-PC1 10.10.10.11 on SW1 Fa0/1; LAB-PC2 10.10.10.12 on SW2 Fa0/1. Gateway 10.10.10.1. R1 and SW2 run LLDP.
 *   device: 'router' | 'switch' | 'switch2' | 'pc' | 'pc2'
 *   mode:   'priv' (the UI types enable first) | 'config' (enable + configure terminal first). Ignored for PCs.
 *   cmds:   real commands the simulator in engine.js supports. tests/lessons.test.mjs fails on any that
 *           return % Invalid input, % Incomplete command or % Ambiguous command.
 */
(function (G) {
  'use strict';
  const TT = (G.TT = G.TT || {});
  TT.lessons = TT.lessons || [];
  const L = [];

  /* ---------- tiny SVG helpers (output is plain SVG markup) ---------- */
  const svg = (w, h, label, inner, wide) =>
    `<svg${wide === false ? '' : ' class="ls-wide"'} viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}">${inner}</svg>`;
  const t = (x, y, s, cls, anchor) => `<text x="${x}" y="${y}" text-anchor="${anchor || 'middle'}"${cls ? ` class="${cls}"` : ''}>${s}</text>`;
  const box = (x, y, w, h, label, cls, sub) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" class="${cls || 'ls-dev'}"/>` +
    (sub ? t(x + w / 2, y + h / 2 - 3, label, 'ls-b') + t(x + w / 2, y + h / 2 + 12, sub, 'ls-sm ls-t-mut ls-mono') : t(x + w / 2, y + h / 2 + 4, label, 'ls-b'));
  const ln = (x1, y1, x2, y2, cls) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls || 'ls-ln'}"/>`;
  const arrow = (x1, y1, x2, y2, cls) => {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const s = 8;
    const p1 = [x2 - s * Math.cos(a - 0.45), y2 - s * Math.sin(a - 0.45)];
    const p2 = [x2 - s * Math.cos(a + 0.45), y2 - s * Math.sin(a + 0.45)];
    const f = (n) => n.toFixed(1);
    return ln(x1, y1, x2, y2, cls) + `<polygon points="${x2},${y2} ${f(p1[0])},${f(p1[1])} ${f(p2[0])},${f(p2[1])}" class="ls-dot"/>`;
  };

  /* ================================================================ *
   * 1.0 NETWORK FUNDAMENTALS
   * ================================================================ */

  /* ---------- 1.0 primer: the layer models (not a blueprint objective) ---------- */
  // `show ip interface brief` rows padded the way IOS prints them
  const sipib = (i, ip, m, s, p) => i.padEnd(23) + ip.padEnd(16) + 'YES ' + m.padEnd(7) + s.padEnd(22) + p;
  const SIPIB_HEAD = 'Interface'.padEnd(23) + 'IP-Address'.padEnd(16) + 'OK? Method Status'.padEnd(33) + 'Protocol';
  const encapRow = (y, name, parts) => {
    let out = t(12, y + 22, name, 'ls-b', 'start');
    for (const [x, w, label, cls, sub] of parts) out += box(x, y, w, 36, label, cls, sub);
    return out;
  };
  const DATA = [380, 180, 'HTTP GET', 'ls-box', 'the actual message'];
  const TCPH = [300, 80, 'TCP', 'ls-goodf', 'ports'];
  const IPH = [220, 80, 'IPv4', 'ls-accf', 'IPs, TTL'];
  const ETHH = [140, 80, 'Ethernet', 'ls-warnf', 'MACs, Type'];
  const FCS = [560, 70, 'FCS', 'ls-warnf', 'trailer'];

  L.push({
    id: 'l1-0',
    obj: '1.0',
    primer: true, // foundation lesson: not a numbered v1.1 objective, but every objective assumes it
    domain: 'fund',
    title: 'The layers: how a message gets wrapped for the trip',
    minutes: 16,
    caseFile:
      "Your first ticket of the night just says \"the internet is down at dispatch.\" Kenji reads it over your shoulder, sets down his coffee and asks one question: \"Down at which layer?\" You don't have an answer yet. By the end of this lesson you will, and so will every ticket after it, because every later lesson is really about one or two of these layers.",
    sections: [
      {
        h: 'Why networking comes in layers',
        body: [
          'Getting a web page from a server to a dispatcher\'s screen involves a dozen separate problems: which program gets the data, how to recover lost pieces, how to find a path across networks, how to reach the next box on this cable, how to turn ones and zeros into voltage. A **layer model** gives each problem its own layer, with one job, so a change in one layer does not ripple through the others. Wi-Fi can replace copper and your browser never notices.',
          'Two rules hold the whole thing together:',
          {
            list: [
              '**Same-layer interaction**: a layer on one device talks to the **same** layer on the other device, using the header it adds. PC1\'s TCP writes a sequence number; the server\'s TCP reads it. Nothing in between needs to understand it.',
              '**Adjacent-layer interaction**: on one device, each layer serves the layer above it and uses the layer below. TCP hands its segment down to IP to deliver; IP hands its packet down to Ethernet to put on the wire.',
            ],
          },
          'There are two models you need: **OSI**, the seven-layer reference model everyone uses for vocabulary ("that is a Layer 2 problem"), and **TCP/IP**, the model the actual internet protocols were built on. Same ideas, different number of boxes.',
        ],
      },
      {
        h: 'The seven OSI layers',
        body: [
          'Read this table from the bottom up, because that is the order a signal arrives in.',
          {
            table: [
              ['#', 'Layer', 'Its job', 'Examples', 'Gear that works here'],
              ['7', '**Application**', 'The network services programs use', 'HTTP/HTTPS, DNS, DHCP, SSH, SMTP, SNMP, FTP', 'Hosts and servers; NGFWs inspect it'],
              ['6', '**Presentation**', 'Data format: encoding, compression, encryption', 'ASCII/UTF-8, JPEG, MPEG; TLS is often filed here', 'Hosts'],
              ['5', '**Session**', 'Opens, manages and closes conversations between programs', 'RPC, NetBIOS sessions', 'Hosts'],
              ['4', '**Transport**', 'Host-to-host delivery to the right program: ports, segmenting, reliability', 'TCP, UDP', 'Hosts; stateful firewalls track it'],
              ['3', '**Network**', 'Logical addressing and finding a path across networks', 'IPv4, IPv6, ICMP, OSPF, EIGRP', 'Routers, Layer 3 switches'],
              ['2', '**Data Link**', 'Delivery across one link or LAN: framing, MAC addresses, error detection', 'Ethernet (802.3), Wi-Fi (802.11), 802.1Q, PPP, HDLC, STP', 'Switches, bridges, NICs, APs'],
              ['1', '**Physical**', 'Bits as signals: voltage, light, radio; cables, connectors, speed and duplex', '1000BASE-T, RJ45, single-mode fiber, 802.11 radio', 'Hubs, repeaters, cables, transceivers'],
            ],
          },
          'Layers 5, 6 and 7 are the **upper layers**: they live inside the software on the end hosts. Layers 1 to 4 are where network engineers spend their nights. Layer 2 is sometimes split into two sublayers, **LLC** on top and **MAC** underneath.',
          { note: 'A Harbor Point way to remember the order. From Layer 1 up: **Pallets Dock Nightly; Trucks Shuttle Parcels Away** (Physical, Data Link, Network, Transport, Session, Presentation, Application). From Layer 7 down: **Any Parcel Shipped Tonight Needs Dock Paperwork.** Pick one direction and drill it until you can write the layers in ten seconds.' },
        ],
      },
      {
        h: 'The TCP/IP model: four layers, sometimes five',
        body: [
          'The TCP/IP model (RFC 1122) folds OSI into four layers. **Application** covers OSI 5, 6 and 7, because real protocols like HTTP handle their own formatting and sessions. **Transport** is OSI 4. **Internet** is OSI 3. **Link** (also called Network Access or Network Interface) covers OSI 1 and 2.',
          'Many textbooks, Cisco\'s included, use a **five-layer** version that splits Link back into Data Link and Physical, and calls Internet "Network". Exam questions can use either; the mapping below is what they test.',
          {
            svg: svg(
              640,
              320,
              'OSI seven layers mapped to the four-layer TCP/IP model and the five-layer variant',
              t(115, 24, 'OSI (7)', 'ls-b') + t(325, 24, 'TCP/IP (4)', 'ls-b') + t(530, 24, 'TCP/IP, 5-layer view', 'ls-b') +
                ['7 Application', '6 Presentation', '5 Session', '4 Transport', '3 Network', '2 Data Link', '1 Physical']
                  .map((n, i) => box(20, 40 + i * 38, 190, 34, n, i < 3 ? 'ls-goodf' : i === 3 ? 'ls-accf' : i === 4 ? 'ls-warnf' : 'ls-dev'))
                  .join('') +
                box(240, 40, 170, 110, 'Application', 'ls-goodf', 'HTTP, DNS, SSH') +
                box(240, 154, 170, 34, 'Transport', 'ls-accf') +
                box(240, 192, 170, 34, 'Internet', 'ls-warnf') +
                box(240, 230, 170, 72, 'Link', 'ls-dev', 'Ethernet, Wi-Fi') +
                box(440, 40, 180, 110, 'Application', 'ls-goodf') +
                box(440, 154, 180, 34, 'Transport', 'ls-accf') +
                box(440, 192, 180, 34, 'Network', 'ls-warnf') +
                box(440, 230, 180, 34, 'Data Link', 'ls-dev') +
                box(440, 268, 180, 34, 'Physical', 'ls-dev') +
                ln(210, 95, 240, 95, 'ls-thin ls-dash') + ln(410, 95, 440, 95, 'ls-thin ls-dash')
            ),
            caption: 'Same stack, three ways of drawing it. The colors line up the layers that match.',
          },
        ],
      },
      {
        h: 'PDUs: what the thing is called at each layer',
        body: [
          'The unit of data a layer works with is its **protocol data unit (PDU)**. The exam uses these words precisely, so you should too.',
          {
            table: [
              ['Layer', 'PDU', 'What makes it that'],
              ['5-7 (Application)', '**Data**', 'The message itself: an HTTP request, a DNS query'],
              ['4 (Transport)', '**Segment** (TCP) or **datagram** (UDP)', 'Data plus a TCP or UDP header with port numbers'],
              ['3 (Network)', '**Packet**', 'Segment plus an IP header with source and destination IP'],
              ['2 (Data Link)', '**Frame**', 'Packet plus a header with MAC addresses **and a trailer** (the FCS)'],
              ['1 (Physical)', '**Bits**', 'The frame as signals on copper, glass or air'],
            ],
          },
          'Down the stack, in order: **data, segment, packet, frame, bits.** A switch forwards frames. A router forwards packets. If a question says a router "forwards frames", read it again.',
        ],
      },
      {
        h: 'Encapsulation, one header at a time',
        body: [
          'When dispatch PC1 (10.20.30.15) asks the web server HPL-WEB01 (10.20.60.80) for a page, each layer wraps what it got from the layer above in its own header. That is **encapsulation**:',
          {
            steps: [
              '**Application**: the browser creates `GET /status`. That is the data.',
              '**Transport**: TCP adds a header with source port 49732 (a random ephemeral port) and destination port 80, plus sequence and acknowledgment numbers. Now it is a segment.',
              '**Network**: IP adds a header with source 10.20.30.15, destination 10.20.60.80, Protocol 6 (TCP) and a TTL. Now it is a packet.',
              '**Data Link**: Ethernet adds a header (destination MAC, source MAC, Type 0x0800 for IPv4) **and** a 4-byte FCS trailer so the receiver can detect corruption. Now it is a frame. This is the only layer that adds a trailer.',
              '**Physical**: the NIC sends the frame as bits, after a preamble that lets the receiver lock on to the signal.',
            ],
          },
          {
            svg: svg(
              660,
              262,
              'Encapsulation: data, then a TCP header makes a segment, an IP header makes a packet, an Ethernet header and FCS trailer make a frame, and the frame is sent as bits',
              encapRow(6, 'Data', [DATA]) +
                encapRow(56, 'Segment', [TCPH, DATA]) +
                encapRow(106, 'Packet', [IPH, TCPH, DATA]) +
                encapRow(156, 'Frame', [ETHH, IPH, TCPH, DATA, FCS]) +
                t(12, 228, 'Bits', 'ls-b', 'start') +
                `<rect x="140" y="206" width="490" height="36" rx="6" class="ls-box"/>` +
                t(385, 229, '10110100 01011100 00101101 ...', 'ls-mono ls-t-mut') +
                arrow(648, 14, 648, 240, 'ls-acc') +
                t(642, 254, 'down the stack', 'ls-sm ls-t-mut', 'end')
            ),
            caption: 'Each layer wraps the one above it. Only Layer 2 adds something at the end as well as the front.',
          },
          '**De-encapsulation** is the same thing in reverse. The receiver checks the FCS and its own MAC, strips the frame; checks the destination IP, strips the packet; reads the destination port to find the program, strips the segment; and hands the data to the web server. Each layer reads only its own header, then passes the rest up.',
          'In between, devices only open as many layers as they need. A switch reads the frame header and forwards. A router strips the frame, reads the packet, then builds a **new** frame for the next link. Watch it happen in the scene at the top of this lesson.',
        ],
      },
      {
        h: 'Three addresses, three layers',
        body: [
          'Every frame you send carries three kinds of address, and each one answers a different question.',
          {
            table: [
              ['Address', 'Layer', 'Answers', 'Example', 'Changes at a router?'],
              ['**Port number**', '4', 'Which program on that host?', 'TCP 80, UDP 53', 'No (unless NAT/PAT rewrites it)'],
              ['**IP address**', '3', 'Which host, on which network, end to end?', '10.20.60.80', 'No (unless NAT rewrites it)'],
              ['**MAC address**', '2', 'Which device on this link is next?', '0050.7966.0a15', '**Yes, every routed hop**'],
            ],
          },
          'That last column is the exam favorite. The IP addresses describe the whole trip, so they stay put. The MAC addresses describe only the current hop, so each router throws away the old frame and writes new source and destination MACs. The router also lowers the TTL by one and, because the frame is new, calculates a new FCS.',
          'This is also why PC1 needs ARP. To reach a server in another subnet, PC1 puts the server\'s IP in the packet but its **default gateway\'s** MAC in the frame. Lesson [1.13](#learn-l1-13) covers how switches use those MACs, and [1.5](#learn-l1-5) covers ports, TCP and UDP.',
        ],
      },
      {
        h: 'Which box works at which layer',
        body: [
          'A device "works at" the highest layer it reads to make its forwarding decision. Lesson [1.1](#learn-l1-1) covers each box in detail; here is the layer view.',
          {
            list: [
              '**Hub (Layer 1)**: repeats bits out every other port. It understands no addresses at all.',
              '**Switch (Layer 2)**: forwards frames by destination MAC using its MAC address table. An **access point** is also a Layer 2 device: it bridges 802.11 frames onto 802.3 Ethernet.',
              '**Router (Layer 3)**: forwards packets by destination IP using its routing table, and rebuilds the frame at every hop.',
              '**Layer 3 switch (Layers 2 and 3)**: switches frames inside a VLAN and routes packets between VLANs, both in hardware.',
              '**Firewall (Layers 3 and 4, and up to 7)**: a classic stateful firewall filters on IPs, protocols and ports and tracks sessions. A **next-generation firewall** reads all the way up to Layer 7, so it can tell one application from another even when both use TCP 443.',
            ],
          },
          'Hosts (PCs, servers, phones) run all seven layers, because they are where the data starts and ends.',
        ],
      },
      {
        h: 'Troubleshoot from the bottom up',
        body: [
          'Every layer depends on the one below it, so a fault low in the stack looks like a fault everywhere above it. "The internet is down" can be a cut cable. The fast, honest method is **bottom-up**: prove Layer 1, then 2, then 3, and only then blame the application.',
          'Cisco hands you the first two layers in one command. In `show ip interface brief`, the **Status** column is roughly Layer 1 (is the port enabled, and is there a signal?) and the **Protocol** column is Layer 2 (is the line protocol up: keepalives, matching encapsulation?).',
          {
            cli: [
              'HPL-BR2-R1# show ip interface brief',
              SIPIB_HEAD,
              sipib('GigabitEthernet0/0/0', '10.40.1.1', 'NVRAM', 'up', 'up'),
              sipib('GigabitEthernet0/0/1', '10.40.2.1', 'NVRAM', 'down', 'down'),
              sipib('GigabitEthernet0/0/2', 'unassigned', 'NVRAM', 'administratively down', 'down'),
              sipib('Serial0/1/0', '10.255.0.6', 'NVRAM', 'up', 'down'),
            ],
          },
          {
            table: [
              ['Status / Protocol', 'What it means', 'Look at'],
              ['up / up', 'Layers 1 and 2 are fine', 'Move up: IP address, mask, gateway, routing (Layer 3)'],
              ['down / down', 'No usable signal', 'Layer 1: cable, far-end port, transceiver, speed. (An err-disabled switch port also shows down/down.)'],
              ['administratively down / down', 'Someone typed `shutdown`', 'Type `no shutdown`, after finding out why it was shut'],
              ['up / down', 'Signal is there, but Layer 2 will not come up', 'Layer 2: on serial links, an HDLC vs PPP encapsulation mismatch or failed keepalives'],
            ],
          },
          'Once both columns say up, step up the stack: does the host have the right IP, mask and gateway, and does a ping to the gateway work (Layer 3)? Is an ACL or firewall blocking the port (Layer 4)? Does the name resolve and does the service answer (Layer 7)? Skip a layer and you will spend an hour on DNS while the cable sits unplugged.',
        ],
      },
    ],
    techNotes: [
      'Say the layer in your ticket notes: "L1: replaced patch cable on Fa0/12" tells the morning shift exactly what you proved and what you did not.',
      'A successful ping proves Layers 1 to 3 end to end. It says nothing about Layer 4 and up, so "ping works but the web page does not load" points you at ports, ACLs, firewalls or the service itself.',
      'When someone says "Layer 2 issue" they nearly always mean switching: VLANs, trunks, STP, MAC table or port security. "Layer 3" means addressing and routing.',
    ],
    examTraps: [
      'Only Layer 2 adds a trailer (the FCS). Layers 3 and 4 add headers only.',
      'At every routed hop the source and destination **MAC** addresses change; the source and destination **IP** addresses do not (unless NAT is involved). The TTL drops by one.',
      'TCP\'s PDU is a segment; UDP\'s is a datagram. The Layer 3 PDU is a packet, the Layer 2 PDU is a frame.',
      'The four-layer TCP/IP model\'s Application layer covers OSI Layers 5, 6 and 7, and its Link (Network Access) layer covers OSI 1 and 2.',
      'up/down on `show ip interface brief` is a Layer 2 problem, not Layer 1: the Status column already says the physical side is up.',
    ],
    tryIt: [
      {
        device: 'router',
        mode: 'priv',
        prompt: 'Start at the bottom. Read the Status column (Layer 1) and the Protocol column (Layer 2) for each interface: one is up/up, one is administratively down. Then look at the Layer 3 view, the routing table.',
        cmds: ['show ip interface brief', 'show ip route'],
      },
      {
        device: 'pc',
        mode: 'priv',
        prompt: 'From LAB-PC1, check the Layer 3 settings, then ping the gateway. A reply proves Layers 1, 2 and 3 all work between the PC and the router.',
        cmds: ['ipconfig', 'ping 10.10.10.1'],
      },
      {
        device: 'switch',
        mode: 'priv',
        prompt: 'The switch only ever looks at Layer 2. See which MAC addresses it has learned and which port each one lives on. There is not an IP address in sight.',
        cmds: ['show mac address-table'],
      },
      {
        device: 'router',
        mode: 'priv',
        prompt: 'The router\'s ARP table is the glue between Layer 3 and Layer 2: each neighbor\'s IP address next to the MAC address the router will put in the frame.',
        cmds: ['show arp'],
      },
    ],
    check: [
      ['Which layer adds both a header and a trailer to the data it receives from the layer above?', ['Transport', 'Network', 'Data Link', 'Physical'], 2, 'The Data Link layer adds a header with MAC addresses and an FCS trailer for error detection. Transport and Network add headers only, and the Physical layer sends bits.'],
      ['PC1 sends a packet to a server in another subnet through one router. Compared with the frame PC1 sent, what is different in the frame the router sends toward the server?', ['The source and destination IP addresses', 'The source and destination MAC addresses (and the TTL in the packet is one lower)', 'The TCP source and destination ports', 'Nothing; the router forwards the original frame unchanged'], 1, 'A router strips the incoming frame and builds a new one with its own exit-interface MAC as the source and the next device\'s MAC as the destination. The IP addresses and ports stay the same without NAT; the TTL is decremented.'],
      ['`show ip interface brief` shows Serial0/1/0 with Status up and Protocol down. Where should you look first?', ['Layer 1: the cable is unplugged', 'Layer 2: an encapsulation mismatch or keepalive problem on the link', 'Layer 3: a wrong IP address', 'Layer 7: the application server is down'], 1, 'Status up means the physical side has a signal. Protocol down means the data link layer is not coming up, commonly an HDLC/PPP encapsulation mismatch or failed keepalives. A wrong IP address does not bring the line protocol down.'],
    ],
    related: { tickets: ['t01'], cards: ['osi', 'ethernet', 'tcp', 'ipv4hdr'], hw: null, drill: false },
  });

  L.push({
    id: 'l1-1',
    obj: '1.1',
    domain: 'fund',
    title: 'Who does what: the cast of network boxes',
    minutes: 12,
    caseFile:
      "First night on the job. Gus from facilities walks you through the HQ wiring closet in Fells Point and points at a rack of blinking boxes: \"That one's the internet, that one's the Wi-Fi brain, and nobody knows what the gray one does.\" Before you can fix anything here, you need to know what each box is for and where it makes its decisions.",
    sections: [
      {
        h: 'Every box decides something',
        body: [
          'The easiest way to keep network devices straight is to ask one question about each: **what does it look at to make its decision, and what does it decide?** A switch looks at MAC addresses and decides which port a frame leaves from. A router looks at IP addresses and decides which network a packet goes to next. A firewall looks at addresses, ports, sessions and even applications, and decides whether the traffic is allowed at all.',
          'If "Layer 2" and "Layer 3" are not second nature yet, read the [1.0 primer on the layers](#learn-l1-0) first. Here is the Harbor Point HQ network you just inherited. Read it from the top (the internet) down to the people.',
          {
            svg: svg(
              640,
              330,
              'Harbor Point HQ: internet, firewall, edge router, core switch, access switches, access point, controller, server and endpoints',
              box(270, 8, 100, 32, 'Internet', 'ls-box') +
                ln(320, 40, 320, 58) +
                box(250, 58, 140, 36, 'NGFW', 'ls-badf', 'HPL-FW1') +
                ln(320, 94, 320, 110) +
                box(250, 110, 140, 36, 'Edge router', 'ls-dev', 'HPL-EDGE') +
                ln(320, 146, 320, 162) +
                box(230, 162, 180, 36, 'Layer 3 core switch', 'ls-accf', 'HPL-CORE') +
                ln(270, 198, 140, 228) + ln(370, 198, 500, 228) + ln(410, 180, 520, 180) +
                box(520, 164, 110, 34, 'WLC', 'ls-dev', 'HPL-WLC1') +
                ln(230, 180, 120, 180) +
                box(10, 164, 110, 34, 'Server', 'ls-dev', 'HPL-FILE01') +
                box(70, 228, 140, 34, 'Access switch', 'ls-dev', 'PoE, floor 2') +
                box(430, 228, 140, 34, 'Access switch', 'ls-dev', 'PoE, dispatch') +
                ln(100, 262, 60, 292) + ln(140, 262, 140, 292) + ln(180, 262, 220, 292) +
                box(20, 292, 70, 28, 'PC', 'ls-box') + box(105, 292, 70, 28, 'IP phone', 'ls-box') + box(190, 292, 70, 28, 'Printer', 'ls-box') +
                ln(470, 262, 440, 292) + ln(530, 262, 560, 292, 'ls-ln ls-dash') +
                box(400, 292, 80, 28, 'Laptop', 'ls-box') + box(520, 292, 90, 28, 'Access point', 'ls-accf') +
                t(536, 280, 'PoE + CAPWAP', 'ls-sm ls-t-mut', 'end')
            ),
            caption: 'HQ at a glance. Tinted boxes are the ones people forget: the firewall, the core and the access point.',
          },
        ],
      },
      {
        h: 'Routers and switches',
        body: [
          '**Routers** connect different IP networks. Each router interface sits in its own subnet, and the router forwards packets between them using its routing table. Because a router does not forward broadcasts, every router interface is the edge of a **broadcast domain**. At a branch or the internet edge, the router usually also does NAT, DHCP, VPN termination and WAN connectivity (serial, cellular, fiber handoff from a carrier).',
          '**Layer 2 switches** connect devices inside one LAN. They learn which MAC address lives on which port and forward each frame only where it needs to go. Every switch port is its own collision domain, and with full duplex there are no collisions at all. A Layer 2 switch does not route: all its ports in one VLAN are one broadcast domain.',
          '**Layer 3 switches** (multilayer switches) do both. They switch frames inside a VLAN and route packets between VLANs, in hardware, at line rate, using SVIs (`interface vlan 10`) or routed ports (`no switchport`). That is why HPL-CORE is a Layer 3 switch: it routes between the office, dispatch and warehouse VLANs without sending traffic out to a router and back. What a Layer 3 switch usually lacks is WAN interface types and some edge features, which is why HPL-EDGE is still a router.',
          {
            table: [
              ['Device', 'Works at', 'Decides using', 'Separates'],
              ['Hub (legacy)', 'Layer 1', 'Nothing: repeats bits out every port', 'Nothing. One collision domain'],
              ['Layer 2 switch', 'Layer 2', 'MAC address table', 'Collision domains (per port)'],
              ['Layer 3 switch', 'Layers 2 and 3', 'MAC table and routing table', 'Collision and broadcast domains'],
              ['Router', 'Layer 3', 'Routing table', 'Broadcast domains (per interface)'],
            ],
          },
        ],
      },
      {
        h: 'Firewalls, NGFWs and IPS',
        body: [
          'A **firewall** sits at a trust boundary (usually inside versus internet) and enforces a policy. Modern firewalls are **stateful**: they track each session, so when a PC inside opens a web connection, the reply traffic is allowed back in automatically, while unsolicited traffic from outside is dropped. Firewalls also define **zones** such as inside, outside and DMZ (where public-facing servers live).',
          'A **next-generation firewall (NGFW)** does all of that and looks deeper. It can identify applications regardless of port (application visibility and control), filter URLs by category, run an integrated IPS, check files against malware intelligence, and write rules based on user identity instead of just IP addresses. HPL-FW1 is an NGFW, which is how it blocks the warehouse kiosks from streaming video even though video uses ordinary HTTPS on port 443.',
          'An **IPS** (intrusion prevention system) sits **inline** and compares traffic to signatures and behavior patterns; when something matches, it drops the packets. Its older cousin the **IDS** watches a **copy** of the traffic (from a SPAN port or tap) and can only alert. Inline means it can stop an attack, and it also means a failed IPS can stop the network, so they are deployed with fail-open or redundancy in mind.',
        ],
      },
      {
        h: 'Access points, controllers, endpoints and servers',
        body: [
          'An **access point** bridges wireless clients (802.11) onto the wired network (802.3). In an enterprise, APs are usually **lightweight**: they hand most of the management work to a **wireless LAN controller (WLC)** over a CAPWAP tunnel. The WLC pushes configuration, picks channels and power levels, and handles roaming. Lesson [2.6](#learn-l2-6) covers this in depth.',
          '"Controller" on the exam can also mean an **SDN controller** such as Cisco Catalyst Center (formerly DNA Center), which manages a whole network of switches and routers from one place. Domain 6 covers that kind.',
          '**Endpoints** are the devices people and machines actually use: PCs, laptops, phones, IP phones, printers, cameras, handheld scanners, badge readers. They are where traffic starts and ends. **Servers** provide services to endpoints: files, email, web apps, DNS, DHCP, authentication. Today many servers are virtual machines or cloud instances rather than a box in a rack, but the role is the same.',
        ],
      },
      {
        h: 'Power over Ethernet',
        body: [
          'PoE sends DC power down the same twisted-pair cable as the data, so an AP on the ceiling or a camera on the loading dock needs one cable and no electrician. The switch is the **PSE** (power sourcing equipment); the AP or phone is the **PD** (powered device). Before sending real power, the PSE checks for a PD signature on the cable, so plugging a normal laptop into a PoE port is safe.',
          {
            table: [
              ['Standard', 'Common name', 'Max at the switch port', 'Typical use'],
              ['802.3af (Type 1, Class 0-3)', 'PoE', '15.4 W', 'IP phones, basic APs'],
              ['802.3at (Type 2, Class 4)', 'PoE+', '30 W', 'Most modern APs, PTZ cameras'],
              ['802.3bt Type 3 (Class 5-6)', 'PoE++ (Cisco UPOE is similar)', '60 W', 'Multi-radio APs, thin clients'],
              ['802.3bt Type 4 (Class 7-8)', 'PoE++', '90 W', 'Displays, building lighting'],
            ],
          },
          'Every PoE switch has a **power budget**, the total watts it can deliver across all ports. Run out and new devices do not power up even though the port has link. Some power is lost in the cable, so the device receives a bit less than the port sends (about 12.95 W for 802.3af, 25.5 W for 802.3at, 51 W and 71.3 W for the two 802.3bt types).',
          { note: 'Classic night-shift ticket: "New AP is dead." Check the switch power budget and whether the AP needs PoE+ while the port only offers 802.3af. Some APs boot with radios disabled when they get too little power.' },
        ],
      },
    ],
    techNotes: [
      'When you inherit a closet, `show cdp neighbors` on every Cisco box is the fastest map you will ever get. The Capability column tells you R (router), S (switch) or both.',
      'Label the firewall. The gray box nobody understands is always the firewall, and it is always the thing blocking the new app.',
      'A Layer 3 switch routes only after `ip routing` is enabled. Out of the box it behaves like a Layer 2 switch with a management IP.',
    ],
    examTraps: [
      'Switches do not separate broadcast domains; VLANs and routers do. A 48-port switch with everything in VLAN 1 is one broadcast domain.',
      'IDS versus IPS: if the question says inline and blocks, it is an IPS. If it says it receives a copy and alerts, it is an IDS.',
      'An NGFW is still a firewall. Its extra features (application control, URL filtering, IPS, malware defense) are added on top of stateful inspection, not instead of it.',
      'PoE+ is 802.3at and 30 W. 802.3af is 15.4 W. Do not mix them up when a question asks why an AP will not fully power up.',
    ],
    tryIt: [
      {
        device: 'switch',
        mode: 'priv',
        prompt: 'Ask the lab switch who its neighbors are. Look at the Capability column: R is a router, S is a switch. Then look at the router from its own side.',
        cmds: ['show cdp neighbors'],
      },
      {
        device: 'router',
        mode: 'priv',
        prompt: 'A router interface is a gateway for one subnet. See which interfaces have an address and which are still shut down.',
        cmds: ['show ip interface brief', 'show ip route'],
      },
    ],
    check: [
      ['Harbor Point wants inter-VLAN routing at line rate inside HQ without hairpinning traffic to the edge router. Which device fits best?', ['A Layer 2 access switch', 'A Layer 3 switch with SVIs', 'A hub', 'A wireless LAN controller'], 1, 'A Layer 3 switch routes between VLANs in hardware using SVIs or routed ports. A Layer 2 switch cannot route, a hub only repeats bits, and a WLC manages access points.'],
      ['Which device receives a copy of traffic from a SPAN port and raises alerts, but cannot drop packets itself?', ['IPS', 'Stateful firewall', 'IDS', 'NGFW'], 2, 'An IDS works on a copy of the traffic, so it can only alert. An IPS, firewall and NGFW sit inline and can drop traffic.'],
      ['A new access point needs 25 W. The switch port supports only 802.3af. What happens?', ['It works: PoE has no fixed limit', 'The AP gets at most 15.4 W at the port, so it will not power fully (it may boot with reduced features)', 'The switch upgrades the port to 802.3bt automatically', 'The AP draws power from the data pairs and ignores the limit'], 1, '802.3af supplies up to 15.4 W at the port. A 25 W AP needs at least 802.3at (PoE+, 30 W). Many APs come up in a low-power mode with radios disabled.'],
    ],
    related: { tickets: ['t01'], cards: ['lanarch', 'wifiarch', 'secfund'], hw: 'gear', drill: false },
  });

  L.push({
    id: 'l1-2',
    obj: '1.2',
    domain: 'fund',
    title: 'Topologies: tiers, spines and leaves, WANs and clouds',
    minutes: 13,
    caseFile:
      "Harbor Point bought a regional carrier in Delaware, and Priya from procurement wants to know why the network quote for their data room says \"spine-leaf\" while HQ is \"collapsed core.\" Same company, two shapes. Tonight you learn why the shape of a network is a design decision, not an accident.",
    sections: [
      {
        h: 'Why architecture matters',
        body: [
          'A network that grows one switch at a time ends up as a tangle: unpredictable paths, giant failure domains, and nobody sure which link carries what. Standard architectures solve that by giving every layer one job. When something breaks, you know where to look, and when you grow, you know where the new box goes.',
          'Two words come up a lot. **North-south** traffic flows between users or the internet and the data center. **East-west** traffic flows between servers inside the data center (an app server talking to a database). Campus designs grew up around north-south traffic; data center designs are built for east-west.',
        ],
      },
      {
        h: 'Three-tier and two-tier (collapsed core) campus',
        body: [
          'The classic campus design has three layers:',
          {
            list: [
              '**Access**: where endpoints plug in. Lots of ports, PoE, port security, QoS marking, and VLAN assignment. Every floor or wing has its access switches.',
              '**Distribution**: aggregates the access switches. This is where routing between VLANs, policy (ACLs), and redundancy (FHRP) usually live, and where Layer 2 stops and Layer 3 begins.',
              '**Core**: the backbone connecting distribution blocks, the data center and the WAN edge. Its only job is to move packets fast and never go down. Keep policy off the core.',
            ],
          },
          'A smaller site does not need a separate core. A **two-tier** or **collapsed core** design merges core and distribution into one pair of switches. Harbor Point HQ is exactly that: two Layer 3 switches at the center, access switches on each floor uplinked to both of them. Add three more buildings to the campus and a dedicated core starts to pay for itself, because otherwise every distribution pair has to connect to every other one.',
          {
            svg: svg(
              640,
              250,
              'Three-tier campus compared with spine-leaf data center',
              t(160, 18, 'Three-tier campus', 'ls-b') +
                box(80, 30, 70, 30, 'Core', 'ls-accf') + box(170, 30, 70, 30, 'Core', 'ls-accf') +
                ln(150, 45, 170, 45) +
                box(40, 100, 80, 30, 'Dist', 'ls-dev') + box(200, 100, 80, 30, 'Dist', 'ls-dev') +
                ln(115, 60, 80, 100) + ln(115, 60, 240, 100) + ln(205, 60, 80, 100) + ln(205, 60, 240, 100) +
                box(10, 175, 60, 28, 'Acc', 'ls-box') + box(90, 175, 60, 28, 'Acc', 'ls-box') + box(170, 175, 60, 28, 'Acc', 'ls-box') + box(250, 175, 60, 28, 'Acc', 'ls-box') +
                ln(80, 130, 40, 175) + ln(80, 130, 120, 175) + ln(240, 130, 200, 175) + ln(240, 130, 280, 175) +
                ln(80, 130, 120, 175, 'ls-thin') + ln(240, 130, 200, 175, 'ls-thin') +
                t(160, 230, 'Each layer has one job; traffic flows north-south', 'ls-sm ls-t-mut') +
                ln(330, 20, 330, 240, 'ls-thin ls-dash') +
                t(490, 18, 'Spine-leaf data center', 'ls-b') +
                box(390, 40, 80, 30, 'Spine 1', 'ls-accf') + box(510, 40, 80, 30, 'Spine 2', 'ls-accf') +
                [370, 445, 520, 595].map((x) => ln(430, 70, x, 150) + ln(550, 70, x, 150)).join('') +
                [370, 445, 520, 595].map((x, i) => box(x - 32, 150, 64, 30, 'Leaf ' + (i + 1), 'ls-dev')).join('') +
                [370, 445, 520, 595].map((x) => ln(x, 180, x, 200, 'ls-thin') + `<rect x="${x - 14}" y="200" width="28" height="16" rx="3" class="ls-box"/>`).join('') +
                t(490, 236, 'Every leaf to every spine: any server is 2 hops from any other', 'ls-sm ls-t-mut')
            ),
            caption: 'Left: campus layers. Right: spine-leaf, where leaves never connect to each other and spines never connect to each other.',
          },
        ],
      },
      {
        h: 'Spine-leaf in the data center',
        body: [
          'Virtualized data centers push most traffic east-west, and three-tier designs send that traffic up and down through the layers unevenly. **Spine-leaf** fixes it with two simple rules: **every leaf connects to every spine**, and **leaves do not connect to leaves, spines do not connect to spines**. Servers, storage, firewalls and routers all attach to leaves.',
          'The result is that any server reaches any other server in the same number of hops (leaf, spine, leaf), so latency is predictable, and all the uplinks can be active at once with equal-cost routing. Need more ports? Add a leaf and cable it to every spine. Need more bandwidth between leaves? Add a spine. Cisco ACI is the best-known spine-leaf fabric, but the topology itself is vendor-neutral.',
        ],
      },
      {
        h: 'WAN, SOHO and small sites',
        body: [
          'A **WAN** connects sites that are far apart, over links you usually lease from a provider. The common flavors:',
          {
            list: [
              '**Leased line**: a dedicated point-to-point circuit between two sites. Simple and private, expensive per site.',
              '**MPLS VPN**: the carrier runs a private network and keeps each customer separate. Your routers (CE) peer with the carrier edge (PE). Good for many sites with QoS needs.',
              '**Metro Ethernet**: the carrier hands you an Ethernet port, and your sites look like they are on one big switch (or a set of point-to-point Ethernet links).',
              '**Internet VPN**: each site buys ordinary internet access and builds IPsec tunnels across it. Cheap and everywhere, but no service guarantees. SD-WAN manages many of these tunnels from a controller.',
              '**Cellular (4G/5G)** and **broadband** (cable, DSL, fiber) are common as the primary link at tiny sites and as backup elsewhere.',
            ],
          },
          'A site with one WAN connection is **single-homed**; two connections to the same provider is **dual-homed**; connections to two different providers is **multihomed**. The Delaware office gets a fiber circuit plus LTE backup so one backhoe cannot take it offline.',
          'A **SOHO** (small office/home office) network squeezes everything into one box: the home "router" is really a router, switch, firewall, access point and DHCP server in one plastic case, often with a cable or fiber modem in front. Harbor Point\'s two-person sales office in Annapolis runs on exactly that.',
        ],
      },
      {
        h: 'On premises versus cloud',
        body: [
          '**On premises** means you own the servers and network in your own building or colocation space: full control, and full responsibility for power, cooling, patching and hardware refresh. **Cloud** means you rent compute, storage and services from a provider and reach them over a network.',
          'The usual definition of cloud computing (from NIST) lists five characteristics: **on-demand self-service**, **broad network access**, **resource pooling**, **rapid elasticity**, and **measured service** (you pay for what you use). It also defines three service models:',
          {
            table: [
              ['Model', 'You manage', 'Provider manages', 'Harbor Point example'],
              ['IaaS', 'OS, apps, data', 'Hardware, virtualization, network', 'A VM running the old routing software'],
              ['PaaS', 'Your app and data', 'Everything up to the runtime', 'A managed database for the tracking app'],
              ['SaaS', 'Just your settings and data', 'The whole application', 'Email and the HR system'],
            ],
          },
          'Deployment models are **public** (shared provider like AWS, Azure, Google Cloud), **private** (cloud-style self-service on your own gear), **community** (shared by organizations with common needs) and **hybrid** (a mix, usually private or on-prem plus public). To reach a public cloud, you can use the internet, an internet VPN, or a private connection from your WAN provider straight into the cloud provider. That choice is a network design question, which is why it is on this exam.',
        ],
      },
    ],
    techNotes: [
      'Draw it before you touch it. A topology sketch with tiers marked tells you where a VLAN should end and where routing should begin.',
      'In a collapsed core, those two core switches are the whole building. Give them redundant power, redundant uplinks, and never schedule changes on both in the same window.',
      'If a vendor says "spine-leaf" and then shows you a leaf-to-leaf cable, ask why. That is either a vPC/MLAG peer link or a design mistake.',
    ],
    examTraps: [
      'Two-tier and collapsed core are the same thing: core and distribution combined. It is not access and core with distribution removed for no reason; the functions are merged.',
      'In spine-leaf, leaves connect only to spines and spines only to leaves. An answer that connects spine to spine is wrong.',
      'Servers attach to leaf switches, never directly to spines.',
      'SaaS means the provider runs the application; IaaS means you still run the operating system. Questions often swap these.',
    ],
    tryIt: [],
    check: [
      ['In a spine-leaf architecture, what must every leaf switch connect to?', ['Every other leaf switch', 'Every spine switch', 'One spine switch and one leaf switch', 'The core layer of the campus'], 1, 'Each leaf connects to every spine. Leaves do not interconnect and spines do not interconnect, which keeps every server-to-server path the same length.'],
      ['Which design merges the core and distribution layers into one layer?', ['Spine-leaf', 'Three-tier', 'Collapsed core (two-tier)', 'Full mesh WAN'], 2, 'A collapsed core, also called two-tier, combines core and distribution functions on one pair of switches. It suits a single building or small campus.'],
      ['Harbor Point runs its HR application entirely from a provider. Staff just log in with a browser. Which cloud service model is that?', ['IaaS', 'PaaS', 'SaaS', 'Private cloud'], 2, 'When the provider runs the whole application and you only use it, that is Software as a Service. IaaS and PaaS leave more of the stack to you; private cloud is a deployment model, not a service model.'],
    ],
    related: { tickets: [], cards: ['lanarch', 'wanarch', 'cloud'], hw: null, drill: false },
  });

  L.push({
    id: 'l1-3',
    obj: '1.3',
    domain: 'fund',
    title: 'Copper, fiber and the media in between',
    minutes: 12,
    caseFile:
      "The new cold-storage room in the Canton warehouse is 240 meters from the nearest switch, and a contractor already pulled Cat6 to it. Marcus says the link \"works sometimes, mostly at night.\" You know the answer before you get there; tonight you learn exactly why.",
    sections: [
      {
        h: 'Copper twisted pair',
        body: [
          'Most Ethernet to the desk runs over **unshielded twisted pair (UTP)**: four pairs of copper wires, each pair twisted to cancel interference, ending in RJ45 connectors. The twist is the whole trick: noise hits both wires of a pair nearly equally, and the receiver only cares about the difference between them.',
          'Every copper Ethernet standard on the exam has the same distance limit: **100 meters** per segment (90 m of permanent cabling plus patch cords). Past that, the signal weakens and timing breaks down. Marcus\'s 240 m Cat6 run is out of spec by a mile, which is why it flaps and throws errors.',
          {
            table: [
              ['Standard', 'Speed', 'Cable', 'Pairs used', 'Max distance'],
              ['10BASE-T', '10 Mbps', 'Cat3 or better', '2 (pins 1,2 and 3,6)', '100 m'],
              ['100BASE-TX', '100 Mbps', 'Cat5 or better', '2 (pins 1,2 and 3,6)', '100 m'],
              ['1000BASE-T', '1 Gbps', 'Cat5e or better', 'All 4', '100 m'],
              ['10GBASE-T', '10 Gbps', 'Cat6a (Cat6 to about 55 m)', 'All 4', '100 m'],
            ],
          },
          'In the "BASE-T" names, the number is the speed in Mbps (or G for Gbps), BASE means baseband signaling, and T means twisted pair. Suffixes such as SX, LX, SR and LR mean fiber, as you will see below.',
        ],
      },
      {
        h: 'Straight-through, crossover and Auto MDI-X',
        body: [
          'For 10 and 100 Mbps, one pair transmits and another receives. A PC transmits on pins 1 and 2 and receives on 3 and 6; a switch does the opposite. So **unlike devices** (PC to switch, router to switch) use a **straight-through** cable, and **like devices** (switch to switch, PC to PC, router to router, or a router directly to a PC) need a **crossover** that swaps the pairs.',
          'Modern switches and NICs support **Auto MDI-X**, which detects the wrong cable and swaps the pairs electronically, so in practice any cable works. Gigabit and faster use all four pairs in both directions at once, so crossover matters even less. The exam still asks which cable a pair of devices would need without Auto MDI-X, so learn the like/unlike rule.',
        ],
      },
      {
        h: 'Fiber: multimode and single-mode',
        body: [
          'Fiber carries light, not electricity, so it ignores electrical interference, has no ground-loop problems between buildings, and reaches much farther. A fiber strand has a glass **core** that carries the light, surrounded by **cladding** that reflects it back into the core, then a protective buffer and jacket. Each link normally uses two strands, one per direction.',
          {
            svg: svg(
              640,
              190,
              'Cross sections of multimode and single-mode fiber',
              t(160, 20, 'Multimode (OM3/OM4)', 'ls-b') +
                `<circle cx="160" cy="95" r="62" class="ls-box"/><circle cx="160" cy="95" r="28" class="ls-accf"/>` +
                t(160, 99, '50 µm core', 'ls-sm ls-b') + t(160, 172, '125 µm cladding · 850 nm · hundreds of meters', 'ls-sm ls-t-mut') +
                `<path d="M250 70 L300 100 L350 70 L400 100 L450 70" class="ls-acc"/><path d="M250 120 L290 85 L330 120 L370 85 L410 120 L450 85" class="ls-acc ls-dash"/>` +
                t(350, 140, 'Many light paths (modes) bounce down the core', 'ls-sm ls-t-mut') +
                t(540, 20, 'Single-mode (OS2)', 'ls-b') +
                `<circle cx="540" cy="95" r="62" class="ls-box"/><circle cx="540" cy="95" r="6" class="ls-accf"/>` +
                t(540, 80, '9 µm core', 'ls-sm ls-b') + t(540, 172, '1310/1550 nm laser · kilometers', 'ls-sm ls-t-mut')
            ),
            caption: 'Multimode has a fat core and many light paths; single-mode has a tiny core and essentially one path, so the pulse stays sharp over long distances.',
          },
          '**Multimode fiber (MMF)** has a wide core (50 µm today, 62.5 µm in old installs). Light enters at many angles, and the different paths (modes) arrive at slightly different times, which smears the signal and limits distance to hundreds of meters. Its optics use cheap LEDs or VCSEL lasers at 850 nm. Jackets are usually aqua (OM3/OM4) or orange (old OM1/OM2).',
          '**Single-mode fiber (SMF)** has a tiny core (about 9 µm) that carries essentially one path, so pulses stay sharp for kilometers. The optics use more precise lasers at 1310 or 1550 nm and cost more. Jackets are usually yellow (OS2).',
          {
            table: [
              ['Standard', 'Fiber', 'Typical reach'],
              ['1000BASE-SX', 'Multimode', 'Up to 550 m (50 µm)'],
              ['1000BASE-LX', 'Single-mode (also short MMF runs)', '5 km on SMF by the standard (Cisco LX/LH optics reach 10 km)'],
              ['10GBASE-SR', 'Multimode', '300 m on OM3, 400 m on OM4'],
              ['10GBASE-LR', 'Single-mode', '10 km'],
              ['10GBASE-ER', 'Single-mode', '40 km'],
            ],
          },
          'Switches take fiber through modular **transceivers**: SFP for 1 Gbps, SFP+ for 10 Gbps, and larger types for 25/40/100 Gbps. The optic decides the standard (SR, LR and so on), so the same switch port can do short or long reach depending on what you plug in. For a few meters inside a rack, a **direct attach copper (DAC)** cable with SFP+ ends built in is cheaper than two optics and a fiber cord.',
        ],
      },
      {
        h: 'Shared media versus point-to-point',
        body: [
          'Early Ethernet was **shared media**: every station on one coax cable (10BASE5, 10BASE2), or later on one hub, heard every transmission. Only one device could talk at a time, so they used **half duplex** and **CSMA/CD**: listen before sending, and if two stations collide, both send a jam signal, wait a random time, and retry.',
          'Modern Ethernet is **point-to-point**: each cable connects exactly two devices, usually an endpoint and a switch port. With only two devices and separate transmit and receive paths, both can send at once (**full duplex**), and collisions cannot happen. CSMA/CD is still in the standard but has nothing to do on a full-duplex link.',
          'WAN serial links and fiber links between switches are also point-to-point. Wi-Fi, on the other hand, is still shared media: all clients on a channel share the air, which is why wireless uses half duplex and its own access method (CSMA/CA).',
          { note: 'The fix for the cold-storage room: a multimode fiber run with 1000BASE-SX optics (or 10GBASE-SR) into a small switch in the room. 240 m is comfortably inside multimode reach.' },
        ],
      },
    ],
    techNotes: [
      'A cable tester that says "pass" only means the wires are connected. Certification testers check length, crosstalk and loss. Ask for the certification report on any new run.',
      'Fiber does not work? Swap the two strands at one end first. Transmit has to meet receive, and flipped strands are the number one fiber "outage."',
      'Never look into a fiber or an optic. Single-mode lasers are invisible and can damage your eye.',
      'Match optics on both ends: an SR optic will not talk to an LR optic, even though both are 10 Gbps.',
    ],
    examTraps: [
      'Copper Ethernet is 100 m regardless of category. Cat6 does not magically reach farther than Cat5e.',
      'Single-mode has the smaller core and goes farther. People guess the opposite because "multi" sounds like more.',
      'Like devices use crossover (switch-switch, router-router, PC-PC, and router-PC). Router to switch is unlike, so straight-through.',
      'Collisions only exist in half duplex. If a full-duplex link shows collisions, something is set to half duplex.',
    ],
    tryIt: [
      {
        device: 'switch',
        mode: 'priv',
        prompt: 'Look at the Type column: the Fa ports are 10/100BaseTX copper, the Gi ports are 10/100/1000. Duplex a-full and speed a-100 mean auto-negotiated full duplex at 100 Mbps.',
        cmds: ['show interfaces status'],
      },
    ],
    check: [
      ['Harbor Point needs a 10 Gbps link between two buildings 6 km apart. Which choice works?', ['Cat6a with 10GBASE-T', 'Multimode OM4 with 10GBASE-SR', 'Single-mode fiber with 10GBASE-LR', 'Direct attach copper (DAC)'], 2, '10GBASE-LR on single-mode reaches 10 km. Copper stops at 100 m, SR on OM4 reaches about 400 m, and DAC is for a few meters inside a rack.'],
      ['Without Auto MDI-X, which pair of devices needs a crossover cable?', ['PC to switch', 'Router to switch', 'Switch to switch', 'Access point to switch'], 2, 'Like devices need crossover. Switch to switch is like-to-like. PCs, routers and APs connecting to a switch are unlike devices and use straight-through.'],
      ['Why does modern switched Ethernet not experience collisions on a properly configured link?', ['Switches use CSMA/CA instead of CSMA/CD', 'Each link is point-to-point and full duplex, with separate transmit and receive paths', 'Collisions are filtered by the switch\'s MAC table', 'Fiber is used everywhere'], 1, 'A point-to-point full-duplex link has only two devices and separate paths in each direction, so frames cannot collide. CSMA/CA is a wireless method, and the MAC table decides forwarding, not collisions.'],
    ],
    related: { tickets: [], cards: ['cabling', 'switchif'], hw: 'cable', drill: false },
  });

  L.push({
    id: 'l1-4',
    obj: '1.4',
    domain: 'fund',
    title: 'Reading the scars: collisions, errors and duplex mismatches',
    minutes: 13,
    caseFile:
      "Rosa on the dispatch floor says the label printer \"works, but slowly, like it's thinking about it.\" Big print jobs crawl and some just fail. Ping looks fine. The interface counters on HPL-DISP-SW3 will tell you exactly what is wrong, if you know how to read them.",
    sections: [
      {
        h: 'Start with the two status words',
        body: [
          'Every interface has two states: the **line status** (Layer 1: is there a signal?) and the **protocol status** (Layer 2: are frames flowing correctly?). `show ip interface brief` and `show interfaces` both show them. Learn the combinations:',
          {
            table: [
              ['Status / Protocol', 'Meaning', 'Usual cause'],
              ['up / up', 'Working at Layers 1 and 2', 'Nothing. Look elsewhere (or at counters).'],
              ['administratively down / down', 'Someone shut it down', '`shutdown` configured, or a router port never got `no shutdown`'],
              ['down / down', 'No physical link', 'Unplugged or bad cable, peer is shut down, speed mismatch, wrong optic'],
              ['up / down', 'Signal, but Layer 2 is failing', 'Encapsulation or keepalive mismatch (mostly serial WAN links)'],
              ['down / down (err-disabled)', 'The switch shut the port to protect itself', 'Port security, BPDU guard, EtherChannel misconfig and similar'],
            ],
          },
          'A port that is up/up can still be sick. That is where the counters come in.',
        ],
      },
      {
        h: 'The counters that matter',
        body: [
          '`show interfaces` prints a block of counters since the last time they were cleared. Here is the printer\'s switch port, and it is telling a story:',
          {
            cli: [
              'HPL-DISP-SW3# show interfaces fastethernet0/14',
              'FastEthernet0/14 is up, line protocol is up (connected)',
              '  Hardware is Fast Ethernet, address is 0019.e8a3.4c0e (bia 0019.e8a3.4c0e)',
              '  MTU 1500 bytes, BW 100000 Kbit/sec, DLY 100 usec,',
              '     reliability 247/255, txload 2/255, rxload 1/255',
              '  Encapsulation ARPA, loopback not set',
              '  Half-duplex, 100Mb/s, media type is 10/100BaseTX',
              '  ...',
              '     183442 packets input, 21455610 bytes, 0 no buffer',
              '     Received 3120 broadcasts (2210 multicasts)',
              '     0 runts, 0 giants, 0 throttles',
              '     0 input errors, 0 CRC, 0 frame, 0 overrun, 0 ignored',
              '     201117 packets output, 98110482 bytes, 0 underruns',
              '     0 output errors, 4182 collisions, 3 interface resets',
              '     0 babbles, 1377 late collision, 0 deferred',
            ],
          },
          {
            table: [
              ['Counter', 'What it means', 'Points to'],
              ['runts', 'Frames smaller than 64 bytes', 'Collisions, duplex mismatch, bad NIC'],
              ['giants', 'Frames larger than the max (1518 bytes untagged)', 'MTU mismatch, bad NIC'],
              ['CRC', 'Frame check sequence did not match: the frame was damaged', 'Bad cable, interference, duplex mismatch on the full-duplex side'],
              ['input errors', 'Total of receive errors (runts, giants, CRC, frame, overrun...)', 'Look at which sub-counter is growing'],
              ['collisions', 'Transmission collided (only possible in half duplex)', 'Normal in small numbers on a real half-duplex segment'],
              ['late collision', 'A collision after the first 64 bytes were sent', 'Duplex mismatch (or a cable far too long)'],
              ['output errors', 'Frames the interface failed to send', 'Collisions, hardware problems'],
              ['interface resets', 'The interface restarted', 'Flapping link, keepalive failures'],
            ],
          },
        ],
      },
      {
        h: 'Duplex mismatch: the classic',
        body: [
          'The printer\'s port shows **Half-duplex** and **late collisions**. The printer NIC was hard-set to 100/full years ago. Here is what happens, step by step:',
          {
            steps: [
              'The printer is hard-coded to 100 Mbps full duplex, so it stops sending auto-negotiation information.',
              'The switch port is on auto. It can still sense the speed from the signal itself (parallel detection), so it picks 100 Mbps correctly.',
              'It cannot sense duplex, so it falls back to the standard default: **half duplex** at 10 or 100 Mbps.',
              'The printer, believing it is full duplex, sends whenever it likes. The switch, in half duplex, sees the printer talking while it is transmitting and calls it a collision, often after 64 bytes (a **late collision**).',
              'On the printer side, the switch\'s aborted frames arrive broken, so the printer counts **CRC errors** and **runts**.',
              'Small pings squeak through; big transfers crawl because of retransmissions. Exactly Rosa\'s symptom.',
            ],
          },
          {
            svg: svg(
              640,
              170,
              'Duplex mismatch: switch port half duplex with collisions and late collisions, printer full duplex with CRC errors and runts',
              box(30, 50, 170, 60, 'HPL-DISP-SW3 Fa0/14', 'ls-dev', 'auto -> 100 / HALF') +
                box(440, 50, 170, 60, 'Label printer NIC', 'ls-dev', 'hard set 100 / FULL') +
                ln(200, 80, 440, 80, 'ls-bad') +
                t(320, 70, 'speed matches, duplex does not', 'ls-sm ls-t-bad') +
                t(115, 135, 'collisions, LATE collisions', 'ls-sm ls-t-warn') +
                t(525, 135, 'CRC errors, runts', 'ls-sm ls-t-warn') +
                t(320, 160, 'Fix: set both ends to auto, or hard-set both ends the same', 'ls-sm ls-t-mut')
            ),
          },
          'The fix is to make both sides agree. Best practice is **auto on both ends**. If you must hard-code (some old devices insist), hard-code **both ends** the same:',
          {
            cli: [
              'HPL-DISP-SW3(config)# interface fastethernet0/14',
              'HPL-DISP-SW3(config-if)# speed 100',
              'HPL-DISP-SW3(config-if)# duplex full',
              'HPL-DISP-SW3(config-if)# end',
              'HPL-DISP-SW3# clear counters fastethernet0/14',
            ],
          },
          'Clear the counters after the fix and check again in ten minutes. Old errors from before the change will otherwise fool you.',
        ],
      },
      {
        h: 'Speed mismatch and other cable trouble',
        body: [
          'A **speed mismatch** is different: if both sides are hard-coded to different speeds (one 100, one 10), they cannot understand each other at all and the link stays **down/down**. Speed problems tend to cut the link; duplex problems leave it up but sick.',
          'On Gigabit copper, auto-negotiation is mandatory for 1000BASE-T and half duplex is practically never used, so most duplex mismatches today are on old 10/100 devices: printers, badge readers, building systems.',
          'Errors without any duplex problem usually mean the physical layer: **CRC errors** that keep climbing on a full-duplex port point to a damaged cable, a bad patch cord, a loose connector, a cable run alongside power lines or fluorescent ballasts, or a run over 100 m. Swap the patch cord first (cheap, fast), then test the run, then try another switch port to rule out the hardware.',
        ],
      },
    ],
    techNotes: [
      'Always run `clear counters` after a fix and re-check later. A counter is a history book, not a live feed.',
      '`show interfaces status` gives one line per port with duplex and speed. A lowercase `a-` prefix (a-full, a-100) means auto-negotiated; no prefix means hard-coded.',
      'If one end is hard-coded, the other end must be too. "Auto on one side, fixed on the other" is the recipe for half duplex.',
    ],
    examTraps: [
      'Late collisions point to a duplex mismatch. Plain collisions on a real half-duplex segment can be normal.',
      'In a duplex mismatch, the half-duplex side logs collisions and late collisions; the full-duplex side logs CRC errors and runts.',
      'A speed mismatch usually brings the link down. A duplex mismatch leaves it up with errors and poor performance.',
      'A switch on auto facing a hard-coded device can detect speed but not duplex, and defaults to half at 10/100 Mbps.',
    ],
    tryIt: [
      {
        device: 'switch',
        mode: 'priv',
        prompt: 'Check speed and duplex on every port at once. Connected ports should read a-full; anything showing half on a switch-to-host link deserves a closer look.',
        cmds: ['show interfaces status'],
      },
      {
        device: 'router',
        mode: 'priv',
        prompt: 'See the status/protocol pairs in action. Gi0/1 has never been enabled, so it shows administratively down.',
        cmds: ['show ip interface brief'],
      },
    ],
    check: [
      ['A switch port shows many late collisions and runs half duplex. The connected server is hard-set to 100 Mbps full duplex. What is the most likely issue?', ['Speed mismatch', 'Duplex mismatch', 'MTU mismatch', 'Native VLAN mismatch'], 1, 'Late collisions on the half-duplex side are the signature of a duplex mismatch. A speed mismatch would usually keep the link down, and MTU problems show as giants.'],
      ['Which counter increments when a received frame fails its frame check sequence?', ['Giants', 'Collisions', 'CRC', 'Output errors'], 2, 'A CRC error means the FCS calculated on arrival did not match the one in the frame, so the frame was damaged in transit. Giants are oversized frames; collisions and output errors are transmit-side counters.'],
      ['An interface shows "down/down" after a technician hard-set it to 10 Mbps while the far end is hard-set to 100 Mbps. Why?', ['A duplex mismatch keeps the protocol down', 'Mismatched hard-coded speeds cannot communicate, so no link comes up', 'The interface is administratively down', 'Speed settings only affect fiber'], 1, 'Two ends signaling at different speeds cannot establish a link at all. Duplex mismatches leave the link up with errors; administratively down would show that exact phrase.'],
    ],
    related: { tickets: ['t01'], cards: ['switchif', 'cabling'], hw: 'ports', drill: false },
  });

  L.push({
    id: 'l1-5',
    obj: '1.5',
    domain: 'fund',
    title: 'TCP and UDP: certified mail versus postcards',
    minutes: 11,
    caseFile:
      "The dispatch team complains that radio-over-IP calls are choppy, and someone in a meeting suggested \"switching the voice traffic to TCP so it's reliable.\" Before that idea reaches a change request, you need to be able to explain why that would make things worse.",
    sections: [
      {
        h: 'What Layer 4 adds',
        body: [
          'IP gets a packet to the right host. It does not care which application on that host the packet is for, and it makes no promise that the packet arrives. The transport layer fills both gaps. Both TCP and UDP use **port numbers** to deliver data to the right application (that is called multiplexing), but they take opposite approaches to reliability.',
          'A connection is identified by its **socket pair**: source IP, source port, destination IP, destination port, and protocol. That is how a server on TCP 443 can talk to hundreds of browsers at once without mixing them up: each browser uses a different random source port.',
        ],
      },
      {
        h: 'TCP: connection-oriented and reliable',
        body: [
          'TCP sets up a connection before sending any data, using the **three-way handshake**:',
          {
            svg: svg(
              640,
              250,
              'TCP three-way handshake, data with acknowledgment, and the four-step close',
              t(130, 20, 'Client (PC1, port 51522)', 'ls-b') + t(510, 20, 'Server (TCP 443)', 'ls-b') +
                ln(130, 30, 130, 240, 'ls-thin') + ln(510, 30, 510, 240, 'ls-thin') +
                arrow(130, 45, 510, 70, 'ls-acc') + t(320, 50, 'SYN  seq=100', 'ls-sm ls-mono') +
                arrow(510, 80, 130, 105, 'ls-acc') + t(320, 85, 'SYN-ACK  seq=300 ack=101', 'ls-sm ls-mono') +
                arrow(130, 115, 510, 140, 'ls-acc') + t(320, 120, 'ACK  ack=301', 'ls-sm ls-mono') +
                arrow(130, 155, 510, 170, 'ls-ln') + t(320, 157, 'data (seq=101, 1000 bytes)', 'ls-sm ls-mono') +
                arrow(510, 178, 130, 193, 'ls-ln') + t(320, 180, 'ACK  ack=1101', 'ls-sm ls-mono') +
                arrow(130, 205, 510, 218, 'ls-thin') + arrow(510, 222, 130, 235, 'ls-thin') + t(320, 215, 'FIN / ACK, FIN / ACK to close', 'ls-sm ls-t-mut')
            ),
            caption: 'SYN, SYN-ACK, ACK opens the connection. Each acknowledgment number is the next byte the receiver expects.',
          },
          'Once connected, TCP provides:',
          {
            list: [
              '**Sequencing**: every byte is numbered, so the receiver can put segments back in order.',
              '**Acknowledgment and retransmission**: the receiver acknowledges what arrived; anything not acknowledged in time is sent again.',
              '**Flow control**: the receiver advertises a **window** (how much it can accept before the sender must wait for an ACK). The window slides forward as data is acknowledged, and shrinks when the receiver is busy.',
              '**Orderly close**: FIN and ACK in each direction (four segments), or RST to abort a connection immediately.',
            ],
          },
          'All of that costs something: a 20-byte minimum header, a handshake before any data, and waiting for retransmissions when something is lost.',
        ],
      },
      {
        h: 'UDP: connectionless and lightweight',
        body: [
          'UDP sends each datagram on its own: no handshake, no sequence numbers, no acknowledgments, no retransmission, no flow control. Its header is just **8 bytes**: source port, destination port, length and checksum. If a datagram is lost, UDP does not know or care; the application decides whether to ask again.',
          'That sounds worse until you think about voice. A voice packet that arrives 300 ms late is useless: the conversation has moved on. Retransmitting it would only add delay and jitter for the packets behind it. Real-time traffic would rather lose one packet than wait for it, so **voice and video use UDP** (with RTP on top for timestamps). Switching the dispatch radios to TCP would make the choppiness worse; the real fix is QoS (domain 4).',
          {
            svg: svg(
              640,
              120,
              'TCP header compared with UDP header',
              t(10, 20, 'TCP header (20 bytes minimum)', 'ls-b', 'start') +
                box(10, 30, 150, 26, 'Src port', 'ls-box') + box(160, 30, 150, 26, 'Dst port', 'ls-box') + box(310, 30, 160, 26, 'Sequence no.', 'ls-box') + box(470, 30, 160, 26, 'Ack no.', 'ls-box') +
                box(10, 56, 120, 26, 'Offset, flags', 'ls-box') + box(130, 56, 120, 26, 'Window', 'ls-box') + box(250, 56, 120, 26, 'Checksum', 'ls-box') + box(370, 56, 120, 26, 'Urgent ptr', 'ls-box') + box(490, 56, 140, 26, 'Options', 'ls-box ls-dash') +
                t(10, 104, 'UDP header (8 bytes)', 'ls-b', 'start') +
                box(170, 88, 115, 26, 'Src port', 'ls-accf') + box(285, 88, 115, 26, 'Dst port', 'ls-accf') + box(400, 88, 115, 26, 'Length', 'ls-accf') + box(515, 88, 115, 26, 'Checksum', 'ls-accf')
            ),
          },
        ],
      },
      {
        h: 'Side by side, and the ports to know',
        body: [
          {
            table: [
              ['', 'TCP', 'UDP'],
              ['Connection', 'Three-way handshake first', 'None: just send'],
              ['Reliability', 'ACKs, retransmission', 'None (application may handle it)'],
              ['Ordering', 'Sequence numbers', 'None'],
              ['Flow control', 'Sliding window', 'None'],
              ['Header', '20 bytes minimum', '8 bytes'],
              ['Good for', 'Web, email, file transfer, SSH', 'Voice, video, DNS queries, DHCP, TFTP, SNMP, syslog, NTP'],
            ],
          },
          {
            table: [
              ['Protocol', 'Transport and port'],
              ['FTP', 'TCP 20 (data), 21 (control)'],
              ['SSH / Telnet', 'TCP 22 / TCP 23'],
              ['SMTP', 'TCP 25'],
              ['DNS', 'UDP 53 for most queries, TCP 53 for zone transfers and large replies'],
              ['DHCP', 'UDP 67 (server), 68 (client)'],
              ['TFTP', 'UDP 69'],
              ['HTTP / HTTPS', 'TCP 80 / TCP 443 (HTTP/3 uses UDP 443 via QUIC)'],
              ['POP3 / IMAP', 'TCP 110 / TCP 143'],
              ['NTP', 'UDP 123'],
              ['SNMP', 'UDP 161 (agent), 162 (traps)'],
              ['Syslog', 'UDP 514'],
            ],
          },
          'Port ranges: **0-1023** are well-known (servers), **1024-49151** are registered, and **49152-65535** are dynamic or ephemeral, used as random client source ports (operating systems vary a little in the exact range they pick from).',
        ],
      },
    ],
    techNotes: [
      'When a firewall rule "allows the app" but the app still fails, check whether the app uses UDP. People write TCP rules out of habit.',
      'DNS over TCP is not rare anymore: large answers (DNSSEC, many records) fall back to TCP. Block TCP 53 and you get odd, intermittent failures.',
      'A TCP RST in a packet capture means the far end (or a firewall pretending to be it) refused the connection. Silence means something dropped it.',
    ],
    examTraps: [
      'Reliable does not mean faster. TCP adds overhead and delay; UDP is the faster, lighter option.',
      'UDP has a checksum. It detects damaged datagrams; it just does not recover lost ones.',
      'FTP is TCP 20/21; TFTP is UDP 69. The T in TFTP stands for Trivial, not TCP.',
      'TCP flow control is the window. Sequence numbers are for ordering and reliability, not flow control.',
    ],
    tryIt: [
      {
        device: 'pc',
        mode: 'priv',
        prompt: 'SSH rides on TCP 22. Try it against the lab router: it has no SSH configured yet, so watch the TCP connection fail. (Lesson 2.8 sets SSH up properly.)',
        cmds: ['ssh -l night 10.10.10.1'],
      },
    ],
    check: [
      ['Which TCP feature lets a receiver slow down a fast sender?', ['Sequence numbers', 'The window size', 'The checksum', 'The three-way handshake'], 1, 'The receiver advertises a window, the amount of data it will accept before the sender must wait. That is TCP flow control. Sequence numbers order data, and the checksum detects corruption.'],
      ['Why does voice over IP normally use UDP instead of TCP?', ['UDP encrypts voice traffic', 'Retransmitting late voice packets adds delay; real-time audio prefers losing a packet to waiting for it', 'TCP cannot carry audio', 'UDP guarantees delivery'], 1, 'A retransmitted voice packet arrives too late to be played, and waiting for it delays everything behind it. UDP does not encrypt or guarantee anything; TCP can carry audio but badly for real-time use.'],
      ['Which protocol and port does TFTP use?', ['TCP 21', 'UDP 69', 'TCP 69', 'UDP 161'], 1, 'TFTP uses UDP 69. TCP 21 is FTP control, and UDP 161 is SNMP.'],
    ],
    related: { tickets: [], cards: ['tcp', 'udp'], hw: null, drill: false },
  });

  L.push({
    id: 'l1-6',
    obj: '1.6',
    domain: 'fund',
    title: 'IPv4 addressing and subnetting without tears',
    minutes: 18,
    caseFile:
      "Engineering handed you 172.16.40.0/24 for the Dundalk warehouse rebuild: 100 office users, 50 handheld scanners, 20 dock terminals, and two router-to-router links. The day shift left a sticky note: \"Don't waste addresses, and don't overlap anything.\" Tonight you carve it up and put the first address on the router.",
    sections: [
      {
        h: 'Address, mask, prefix',
        body: [
          'An IPv4 address is 32 bits, written as four 8-bit octets in decimal (172.16.40.70). The **subnet mask** says which bits are the network part and which are the host part: a 1 bit in the mask means network, a 0 means host. Masks are always a run of 1s followed by a run of 0s, so we can write them as a **prefix length**: 255.255.255.192 is /26 because it has 26 one-bits.',
          'Every subnet has three special values:',
          {
            list: [
              '**Network address**: all host bits 0. It names the subnet and cannot go on a device.',
              '**Broadcast address**: all host bits 1. A packet to it reaches every host on the subnet. Also unusable on a device.',
              '**Usable hosts**: everything in between. With h host bits, that is **2^h - 2** addresses.',
            ],
          },
          'You will still see the old **classes** in questions: Class A has a first octet of 1-126 (default /8), Class B 128-191 (/16), Class C 192-223 (/24), Class D 224-239 is multicast, and Class E 240-255 is reserved. 127.0.0.0/8 is loopback. Modern networks are classless, but the exam expects you to recognize the ranges.',
        ],
      },
      {
        h: 'The block-size method',
        body: [
          'Binary always works, but the block-size method is faster and it is what you will use at the testing center. Take **172.16.40.70/26**:',
          {
            steps: [
              'Find the **interesting octet**: the one where the mask is neither 255 nor 0. A /26 mask is 255.255.255.**192**, so it is the fourth octet.',
              'Block size = **256 - 192 = 64**. Subnets in that octet start at multiples of 64: 0, 64, 128, 192.',
              'Find the multiple at or just below 70: **64**. Network address 172.16.40.64.',
              'The next block starts at 128, so the broadcast is one less: **172.16.40.127**.',
              'Usable range: **172.16.40.65 to 172.16.40.126**, which is 62 hosts (2^6 - 2).',
            ],
          },
          {
            table: [
              ['Prefix', 'Mask (last octet)', 'Block size', 'Usable hosts'],
              ['/24', '255.255.255.0', '256', '254'],
              ['/25', '255.255.255.128', '128', '126'],
              ['/26', '255.255.255.192', '64', '62'],
              ['/27', '255.255.255.224', '32', '30'],
              ['/28', '255.255.255.240', '16', '14'],
              ['/29', '255.255.255.248', '8', '6'],
              ['/30', '255.255.255.252', '4', '2'],
              ['/31', '255.255.255.254', '2', '2 (point-to-point links only, RFC 3021)'],
              ['/32', '255.255.255.255', '1', '1 (a single host: loopbacks, host routes)'],
            ],
          },
          'The same idea works in any octet. For 10.20.37.9/20 the mask is 255.255.**240**.0, the block size is 16 in the third octet, and 37 falls in the block starting at 32: network 10.20.32.0, broadcast 10.20.47.255.',
        ],
      },
      {
        h: 'Sizing subnets and VLSM',
        body: [
          'Two questions drive every design. **How many hosts?** Find the smallest h where 2^h - 2 is at least the host count, and the prefix is 32 - h. **How many subnets?** Borrow s bits from the host part where 2^s is at least the subnet count.',
          'For Dundalk, the subnets do not all need the same size, so we use **VLSM** (variable-length subnet masks): give each subnet only what it needs, and **allocate the biggest first** so the blocks line up on clean boundaries.',
          {
            table: [
              ['Need', 'Hosts', 'Prefix', 'Subnet', 'Usable range', 'Broadcast'],
              ['Office', '100', '/25 (126)', '172.16.40.0', '.1 - .126', '.127'],
              ['Scanners', '50', '/26 (62)', '172.16.40.128', '.129 - .190', '.191'],
              ['Dock terminals', '20', '/27 (30)', '172.16.40.192', '.193 - .222', '.223'],
              ['Link to HQ', '2', '/30 (2)', '172.16.40.224', '.225 - .226', '.227'],
              ['Link to annex', '2', '/30 (2)', '172.16.40.228', '.229 - .230', '.231'],
            ],
          },
          {
            svg: svg(
              640,
              110,
              'VLSM plan for 172.16.40.0/24 shown as blocks along the address range',
              `<rect x="10" y="30" width="310" height="40" class="ls-accf"/>` + t(165, 55, 'Office /25  .0-.127', 'ls-sm ls-b') +
                `<rect x="320" y="30" width="155" height="40" class="ls-goodf"/>` + t(397, 55, 'Scanners /26', 'ls-sm ls-b') +
                `<rect x="475" y="30" width="78" height="40" class="ls-warnf"/>` + t(514, 55, 'Dock /27', 'ls-sm ls-b') +
                `<rect x="553" y="30" width="10" height="40" class="ls-badf"/><rect x="563" y="30" width="10" height="40" class="ls-badf"/>` +
                `<rect x="573" y="30" width="57" height="40" class="ls-box ls-dash"/>` + t(601, 55, 'free', 'ls-sm ls-t-mut') +
                [[10, '.0'], [320, '.128'], [475, '.192'], [553, '.224'], [630, '.255']].map(([x, s]) => t(x, 88, s, 'ls-sm ls-mono ls-t-mut')).join('') +
                t(568, 22, 'two /30s', 'ls-sm ls-t-bad')
            ),
            caption: 'Biggest block first keeps every subnet on its natural boundary. 172.16.40.232 to .255 is left for growth.',
          },
        ],
      },
      {
        h: 'Configure it on IOS',
        body: [
          'A router interface gets an address and mask, and router interfaces start **shut down**, so do not forget `no shutdown`. The scanners get the first usable address of their subnet as their gateway:',
          {
            cli: [
              'HPL-DUN-R1(config)# interface gigabitethernet0/1',
              'HPL-DUN-R1(config-if)# description Scanners VLAN 172.16.40.128/26',
              'HPL-DUN-R1(config-if)# ip address 172.16.40.128 255.255.255.192',
              'Bad mask /26 for address 172.16.40.128',
              'HPL-DUN-R1(config-if)# ip address 172.16.40.129 255.255.255.192',
              'HPL-DUN-R1(config-if)# no shutdown',
            ],
          },
          'IOS refuses the network address ("Bad mask") and refuses any subnet that overlaps one already on another interface ("% 172.16.40.0 overlaps with GigabitEthernet0/0"). Those two messages catch most typos.',
          'A Layer 2 switch has no routed ports; you give it an IP on an SVI for management, plus a default gateway so it can answer from other subnets:',
          {
            cli: [
              'HPL-DUN-SW1(config)# interface vlan 30',
              'HPL-DUN-SW1(config-if)# ip address 172.16.40.190 255.255.255.192',
              'HPL-DUN-SW1(config-if)# no shutdown',
              'HPL-DUN-SW1(config-if)# exit',
              'HPL-DUN-SW1(config)# ip default-gateway 172.16.40.129',
            ],
          },
        ],
      },
      {
        h: 'Verify it',
        body: [
          'Three commands answer "is the address right and is it working?"',
          {
            cli: [
              'HPL-DUN-R1# show ip interface brief',
              'Interface              IP-Address      OK? Method Status                Protocol',
              'GigabitEthernet0/0     172.16.40.1     YES manual up                    up',
              'GigabitEthernet0/1     172.16.40.129   YES manual up                    up',
              'HPL-DUN-R1# show ip route connected',
              'C        172.16.40.0/25 is directly connected, GigabitEthernet0/0',
              'L        172.16.40.1/32 is directly connected, GigabitEthernet0/0',
              'C        172.16.40.128/26 is directly connected, GigabitEthernet0/1',
              'L        172.16.40.129/32 is directly connected, GigabitEthernet0/1',
            ],
          },
          'Each working interface adds two routes: a **C** (connected) route for the whole subnet and an **L** (local) /32 route for the router\'s own address. If the C route is missing, the interface is not up/up. Then `ping` the gateway from a host and the host from the router. `show running-config interface g0/1` shows exactly what is configured, mask included.',
        ],
      },
    ],
    techNotes: [
      'Memorize one row: 128, 192, 224, 240, 248, 252, 254, 255. Every mask octet is one of those, and 256 minus it is your block size.',
      'Gateways go on the first usable address by convention at Harbor Point. Conventions save you at 3 a.m.',
      'Before you configure a new subnet, run `show ip route` and look for anything that overlaps. IOS only checks its own interfaces, not routes learned from elsewhere.',
    ],
    examTraps: [
      'Usable hosts is 2^h minus 2, but a /31 on a point-to-point link has 2 usable addresses with no network or broadcast address.',
      'The broadcast address is the next network address minus one, not "the last octet is 255." 172.16.40.127 is a broadcast in a /26.',
      'An interface with a correct IP can still be administratively down. Router ports default to shutdown.',
      'When a question asks for the "last usable" address, it is broadcast minus one.',
    ],
    tryIt: [
      {
        device: 'router',
        mode: 'config',
        prompt: 'Try putting the network address on Gi0/1 and read the error, then use the first usable address. Gi0/1 has no cable on the bench, so expect it to stay down and its connected route to stay out of the table.',
        cmds: ['interface g0/1', 'ip address 172.16.40.128 255.255.255.192', 'ip address 172.16.40.129 255.255.255.192', 'no shutdown', 'do show ip interface brief', 'do show ip route'],
      },
      {
        device: 'pc',
        mode: 'priv',
        prompt: 'Check the host side: address, mask and gateway must agree with the router. Then prove it by pinging the gateway.',
        cmds: ['ipconfig', 'ping 10.10.10.1'],
      },
    ],
    check: [
      ['A host has the address 10.20.37.9/20. What is its network address?', ['10.20.37.0', '10.20.32.0', '10.20.36.0', '10.20.0.0'], 1, 'A /20 mask is 255.255.240.0, so the block size is 16 in the third octet. 37 falls in the block 32-47, so the network is 10.20.32.0 (broadcast 10.20.47.255).'],
      ['Harbor Point needs a subnet for 50 scanners with the least waste. Which prefix?', ['/25', '/26', '/27', '/28'], 1, 'A /26 gives 62 usable hosts, the smallest that fits 50. A /27 gives only 30; a /25 gives 126, which wastes addresses.'],
      ['Which statement about the router output "C 172.16.40.128/26 is directly connected, GigabitEthernet0/1" is true?', ['The route was learned from a neighbor', 'Gi0/1 is up/up and has an address in 172.16.40.128/26', 'Gi0/1 has the address 172.16.40.128', 'The route is the router\'s own /32 address'], 1, 'Connected routes appear only when the interface is up/up with an address in that subnet. The router\'s own address is the separate L /32 route; .128 is the network address and cannot be assigned.'],
    ],
    related: { tickets: ['t02', 't01'], cards: ['ipv4', 'vlsm'], hw: null, drill: true },
  });

  L.push({
    id: 'l1-7',
    obj: '1.7',
    domain: 'fund',
    title: 'Why private IPv4 addresses exist',
    minutes: 10,
    caseFile:
      "The Delaware carrier Harbor Point just bought numbers its whole network out of 10.10.0.0/16. So does Harbor Point HQ. Next week the two networks get connected, and Priya asks the obvious question: \"How can two companies have the same addresses, and why didn't anyone notice?\"",
    sections: [
      {
        h: 'The problem: not enough addresses',
        body: [
          'IPv4 has 2^32 addresses, about 4.3 billion, and a big chunk of that is reserved for multicast, loopback and other special uses. There are far more phones, laptops, cameras and scanners than that. The regional registries ran out of fresh IPv4 blocks in the 2010s; today public addresses are bought, leased and recycled.',
          'The long-term fix is IPv6. The fix that kept the internet running in the meantime is two ideas used together: **private address ranges** that anyone can reuse inside their own network, and **NAT** to translate them to a few public addresses at the edge.',
        ],
      },
      {
        h: 'The RFC 1918 ranges',
        body: [
          'RFC 1918 sets aside three blocks that will never be assigned to anyone on the public internet:',
          {
            table: [
              ['Range', 'Prefix', 'Old class equivalent', 'Size'],
              ['10.0.0.0 - 10.255.255.255', '10.0.0.0/8', 'One Class A', 'About 16.7 million addresses'],
              ['172.16.0.0 - 172.31.255.255', '172.16.0.0/12', '16 Class B networks', 'About 1 million addresses'],
              ['192.168.0.0 - 192.168.255.255', '192.168.0.0/16', '256 Class C networks', '65,536 addresses'],
            ],
          },
          'Any organization can use these internally without asking permission. Internet routers drop them: ISPs filter private source and destination addresses, so a packet from 10.10.4.20 can never reach the internet as-is. That is exactly why NAT is needed.',
          { note: 'The 172.16.0.0/12 block is the one people get wrong. It runs from 172.16.0.0 to 172.31.255.255. 172.32.1.1 is a public address, and so is 172.15.0.1.' },
        ],
      },
      {
        h: 'How private addressing works with NAT',
        body: [
          'Inside, every Harbor Point device has a private address. When a PC talks to the internet, the edge router (or firewall) rewrites the private source address to a public one and remembers the mapping. Replies come back to the public address, and the router translates them back. With **PAT** (port address translation, also called NAT overload), thousands of inside hosts share one public address, told apart by their source port numbers.',
          {
            svg: svg(
              640,
              150,
              'Private addresses inside are translated to a public address at the edge router',
              box(20, 30, 150, 40, 'PC 10.10.4.20', 'ls-box') + box(20, 85, 150, 40, 'Scanner 10.10.30.7', 'ls-box') +
                ln(170, 50, 250, 75) + ln(170, 105, 250, 80) +
                box(250, 55, 150, 46, 'HPL-EDGE (PAT)', 'ls-accf', 'inside -> 203.0.113.10') +
                arrow(400, 78, 500, 78, 'ls-acc') +
                box(500, 55, 120, 46, 'Internet', 'ls-box', 'public only') +
                t(95, 20, 'Private (RFC 1918)', 'ls-sm ls-t-mut') + t(560, 20, 'Public', 'ls-sm ls-t-mut') +
                t(320, 135, 'Source 10.10.4.20:51522 becomes 203.0.113.10:1024', 'ls-sm ls-mono ls-t-mut')
            ),
          },
          'NAT configuration is objective 4.1 ([see that lesson](#learn-l4-1)). For this objective, know **why** private addressing exists and what it costs.',
        ],
      },
      {
        h: 'Benefits, costs, and other special ranges',
        body: [
          {
            list: [
              '**Benefit: conservation.** One public address can serve a whole site.',
              '**Benefit: flexibility.** You can renumber or change ISPs without touching every internal device, and you have lots of room for subnetting.',
              '**Cost: overlap.** Because everyone reuses the same blocks, mergers and VPNs between companies collide. Harbor Point and the Delaware carrier both chose 10.10.0.0/16, so one side must renumber or the link needs NAT in both directions. Picking a less common range (say 10.73.0.0/16) up front avoids the pain.',
              '**Cost: broken end-to-end addressing.** Applications that embed IP addresses or need inbound connections (some VoIP, VPN and peer-to-peer apps) need extra help through NAT.',
              '**Not a security feature.** NAT hides inside addresses, but a firewall policy is what actually protects you.',
            ],
          },
          'Other ranges you should recognize, none of them RFC 1918:',
          {
            table: [
              ['Range', 'Purpose'],
              ['127.0.0.0/8', 'Loopback: the host talking to itself (127.0.0.1)'],
              ['169.254.0.0/16', 'Link-local (APIPA): a host gives itself one of these when DHCP fails'],
              ['100.64.0.0/10', 'Shared address space for carrier-grade NAT inside ISPs'],
              ['192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24', 'Documentation and examples only'],
              ['0.0.0.0 and 255.255.255.255', '"This host" (or the default route as 0.0.0.0/0) and limited broadcast'],
            ],
          },
        ],
      },
    ],
    techNotes: [
      'When a user\'s PC shows 169.254.x.x, stop looking at the application. DHCP failed; check the VLAN, the helper address and the DHCP server.',
      'Before any merger or partner VPN, ask the other side for their address plan. Overlapping 10.x networks are the most common surprise.',
      'Pick internal ranges that are not the defaults everyone uses. Home routers love 192.168.0.0/24 and 192.168.1.0/24; your VPN users will thank you for avoiding them.',
    ],
    examTraps: [
      '172.16.0.0/12 ends at 172.31.255.255. Anything in 172.32 or above is public.',
      '169.254.0.0/16 is link-local (APIPA), not an RFC 1918 private range.',
      'Private addresses are not routed on the internet. A host with only a private address needs NAT to reach public servers.',
      'NAT conserves addresses; it is not a replacement for a firewall.',
    ],
    tryIt: [
      {
        device: 'router',
        mode: 'config',
        prompt: 'IOS lets you use any private range on an interface. 172.31.255.254/16 is still inside 172.16.0.0/12. Configure it, then compare with the existing 10.10.10.1/24.',
        cmds: ['interface g0/1', 'ip address 172.31.255.254 255.255.0.0', 'do show ip interface brief'],
      },
    ],
    check: [
      ['Which address is a private RFC 1918 address?', ['172.32.10.5', '172.20.10.5', '169.254.10.5', '192.169.10.5'], 1, '172.20.10.5 falls inside 172.16.0.0/12 (172.16-172.31). 172.32 is public, 169.254 is link-local APIPA, and 192.169 is outside 192.168.0.0/16.'],
      ['What is the main reason private IPv4 addressing, together with NAT, became universal?', ['It encrypts internal traffic', 'It conserves the limited pool of public IPv4 addresses', 'It makes routing tables on the internet larger', 'It replaces the need for subnetting'], 1, 'Reusing private ranges internally and translating to a few public addresses conserves public IPv4 space. It does not encrypt anything, and subnetting is still needed inside.'],
      ['Two merging companies both use 10.10.0.0/16 internally. What problem does this cause?', ['None, because private addresses are unique per company by design', 'Overlapping addresses make routing between the networks ambiguous until one side renumbers or NAT is used', 'Their ISPs will block the merger', 'Their internet access stops working immediately'], 1, 'Private ranges are reused everywhere, so overlap is common. Routers cannot tell which 10.10.x.x is which. Fixes are renumbering or NAT between the networks.'],
    ],
    related: { tickets: ['t12'], cards: ['ipv4', 'nat'], hw: null, drill: false },
  });

  L.push({
    id: 'l1-8',
    obj: '1.8',
    domain: 'fund',
    title: 'IPv6 addressing: writing it, prefixing it, configuring it',
    minutes: 16,
    caseFile:
      "Harbor Point's new ISP contract came with 2001:db8:acad::/48, and the network team wants IPv6 running on the HQ office VLAN before the Delaware cutover. Rosa saw the address on a whiteboard and asked if it was \"a Wi-Fi password.\" Tonight you configure the router and prove it works.",
    sections: [
      {
        h: 'Why 128 bits',
        body: [
          'IPv6 addresses are **128 bits** long, which is about 3.4 × 10^38 addresses: enough that every subnet gets 2^64 host addresses and nobody needs NAT to save space. IPv6 also simplifies the header, drops broadcasts (multicast does the job), and lets hosts configure themselves.',
          'An IPv6 address is written as **eight groups of four hex digits** (hextets), separated by colons. Each hex digit is 4 bits, each hextet 16 bits.',
        ],
      },
      {
        h: 'Shortening an address (two rules)',
        body: [
          {
            steps: [
              '**Drop leading zeros** in any hextet: `0db8` becomes `db8`, `0042` becomes `42`, `0000` becomes `0`.',
              '**Replace one run of consecutive all-zero hextets with `::`**, once per address. If there are two runs, shorten the longest; if they tie, shorten the first one.',
            ],
          },
          {
            table: [
              ['Full address', 'Shortest form'],
              ['`2001:0db8:0000:0000:0000:ff00:0042:8329`', '`2001:db8::ff00:42:8329`'],
              ['`2001:0db8:acad:0010:0000:0000:0000:0001`', '`2001:db8:acad:10::1`'],
              ['`2001:0db8:0000:0000:0001:0000:0000:0001`', '`2001:db8::1:0:0:1` (tie: the first run gets the ::)'],
              ['`fe80:0000:0000:0000:0204:61ff:fe9d:f156`', '`fe80::204:61ff:fe9d:f156`'],
            ],
          },
          'To **expand** an address, count the hextets you can see, and the `::` stands for however many zero hextets are needed to make eight. In `2001:db8:acad:10::1` you see five, so `::` stands for three. You can only drop **leading** zeros: `2001:db8:a0::1` means `00a0`, never `a000`. Using `::` twice is always wrong, because nobody could tell how many zeros each one hides.',
        ],
      },
      {
        h: 'Prefixes and subnetting',
        body: [
          'IPv6 uses prefix-length notation only, never dotted masks. The standard subnet size is **/64**: the first 64 bits identify the network, the last 64 bits are the **interface ID**. SLAAC and EUI-64 depend on that /64 boundary, so LANs should always be /64.',
          'A typical enterprise allocation is a **/48**. The first 48 bits are the **global routing prefix** from the ISP; the next 16 bits are yours as the **subnet ID**. That is 65,536 /64 subnets, and subnetting becomes simple counting in the fourth hextet:',
          {
            svg: svg(
              640,
              120,
              'IPv6 global unicast address: 48-bit global routing prefix, 16-bit subnet ID, 64-bit interface ID',
              `<rect x="10" y="30" width="230" height="40" class="ls-accf"/>` + t(125, 55, '2001:db8:acad', 'ls-mono ls-b') +
                `<rect x="240" y="30" width="80" height="40" class="ls-warnf"/>` + t(280, 55, '0010', 'ls-mono ls-b') +
                `<rect x="320" y="30" width="310" height="40" class="ls-goodf"/>` + t(475, 55, '0000:0000:0000:0001', 'ls-mono ls-b') +
                t(125, 90, 'Global routing prefix /48 (from ISP)', 'ls-sm') + t(280, 90, 'Subnet ID', 'ls-sm') + t(475, 90, 'Interface ID (64 bits)', 'ls-sm') +
                t(10, 20, 'bit 0', 'ls-sm ls-t-mut', 'start') + t(240, 20, '48', 'ls-sm ls-t-mut') + t(320, 20, '64', 'ls-sm ls-t-mut') + t(630, 20, '128', 'ls-sm ls-t-mut', 'end') +
                t(320, 112, 'Network prefix = first 64 bits: 2001:db8:acad:10::/64', 'ls-sm ls-t-mut')
            ),
          },
          {
            table: [
              ['Harbor Point subnet', 'Prefix'],
              ['HQ office VLAN 10', '2001:db8:acad:10::/64'],
              ['Dispatch VLAN 20', '2001:db8:acad:20::/64'],
              ['Warehouse VLAN 30', '2001:db8:acad:30::/64'],
              ['Router links', '2001:db8:acad:ff00::/64 and up (some sites use /127 on point-to-point links)'],
            ],
          },
          'Matching the subnet ID to the VLAN number is not required, but it makes troubleshooting much easier. The 2001:db8::/32 block used throughout these lessons is reserved for documentation, like 192.0.2.0/24 in IPv4.',
        ],
      },
      {
        h: 'Configure IPv6 on IOS',
        body: [
          'Two separate things: enable **IPv6 routing** globally (without it, the router has IPv6 addresses but will not forward IPv6 packets between interfaces or send router advertisements), then address each interface.',
          {
            cli: [
              'HPL-CORE(config)# ipv6 unicast-routing',
              'HPL-CORE(config)# interface gigabitethernet0/0',
              'HPL-CORE(config-if)# ipv6 address 2001:db8:acad:10::1/64',
              'HPL-CORE(config-if)# exit',
              'HPL-CORE(config)# interface gigabitethernet0/1',
              'HPL-CORE(config-if)# ipv6 address 2001:db8:acad:20::/64 eui-64',
            ],
          },
          'Ways to give an interface IPv6:',
          {
            table: [
              ['Command', 'Result'],
              ['`ipv6 address 2001:db8:acad:10::1/64`', 'Manual global unicast address (plus an automatic link-local)'],
              ['`ipv6 address 2001:db8:acad:20::/64 eui-64`', 'Router builds the interface ID from its MAC (modified EUI-64, lesson 1.9)'],
              ['`ipv6 address autoconfig`', 'Learn the prefix from router advertisements (SLAAC), like a host'],
              ['`ipv6 address dhcp`', 'Get an address from a DHCPv6 server'],
              ['`ipv6 enable`', 'Link-local address only, no global address'],
              ['`ipv6 address fe80::1 link-local`', 'Replace the automatic link-local with an easy one'],
            ],
          },
          'Unlike IPv4, an interface can have **several** IPv6 addresses at once: entering a second `ipv6 address` adds it instead of replacing the first. Remove one with `no ipv6 address` followed by the address.',
        ],
      },
      {
        h: 'Verify it',
        body: [
          {
            cli: [
              'HPL-CORE# show ipv6 interface brief',
              'GigabitEthernet0/0     [up/up]',
              '    FE80::3E41:EFF:FE9A:27B1',
              '    2001:DB8:ACAD:10::1',
              'HPL-CORE# show ipv6 interface gigabitethernet0/0',
              'GigabitEthernet0/0 is up, line protocol is up',
              '  IPv6 is enabled, link-local address is FE80::3E41:EFF:FE9A:27B1',
              '  Global unicast address(es):',
              '    2001:DB8:ACAD:10::1, subnet is 2001:DB8:ACAD:10::/64',
              '  Joined group address(es):',
              '    FF02::1',
              '    FF02::2',
              '    FF02::1:FF00:1',
              '    FF02::1:FF9A:27B1',
              'HPL-CORE# show ipv6 route connected',
              'C   2001:DB8:ACAD:10::/64 [0/0]',
              '     via GigabitEthernet0/0, directly connected',
              'L   2001:DB8:ACAD:10::1/128 [0/0]',
              '     via GigabitEthernet0/0, receive',
            ],
          },
          'Read it like IPv4: the interface must be up/up, there is a **C** route for the /64 and an **L** route, this time a **/128**, for the router\'s own address. The joined groups are a good health check: **FF02::2** (all routers) only appears once `ipv6 unicast-routing` is on, and each address adds a **solicited-node** group (FF02::1:FF plus its last 24 bits). Finish with `ping 2001:db8:acad:10::20` to a host.',
        ],
      },
    ],
    techNotes: [
      'Forgot `ipv6 unicast-routing`? Interfaces still get addresses and ping their neighbors, but hosts get no router advertisements and nothing routes. The FF02::2 group missing from `show ipv6 interface` is the tell.',
      'Set link-locals by hand on routers (`ipv6 address fe80::1 link-local`). Neighbor tables and IPv6 routes use link-locals as next hops, and FE80::1 is easier to read than an EUI-64 string.',
      'Type addresses in lowercase if you like; IOS displays them in uppercase. Both are the same address.',
    ],
    examTraps: [
      ':: may appear only once in an address.',
      'Leading zeros can be dropped, trailing zeros cannot: `db8:a0` is `0db8:00a0`, not `db80:a000`.',
      'The local route for an IPv6 interface address is /128, not /64 and not /32.',
      '`ipv6 unicast-routing` is needed for the router to forward IPv6 and send RAs, not to assign addresses.',
    ],
    tryIt: [
      {
        device: 'router',
        mode: 'config',
        prompt: 'Turn on IPv6 routing, address Gi0/0 in the office /64, then check the interface and the routing table: one C /64 and one L /128. The bench shortens the automatic link-local; a real router builds it with EUI-64.',
        cmds: ['ipv6 unicast-routing', 'interface g0/0', 'ipv6 address 2001:db8:acad:10::1/64', 'end', 'show ipv6 interface brief', 'show ipv6 route', 'ping 2001:db8:acad:10::1'],
      },
    ],
    check: [
      ['What is the shortest valid form of 2001:0db8:0000:0000:0000:00a0:0000:0001?', ['2001:db8::a0::1', '2001:db8::a0:0:1', '2001:db8:0:0:0:a0::1', '2001:db8::a:0:1'], 1, 'Drop leading zeros (00a0 becomes a0) and replace the longest zero run (three hextets) with ::. :: cannot be used twice, and a0 cannot become a.'],
      ['A router has IPv6 addresses on two interfaces, but hosts receive no router advertisements and IPv6 traffic is not forwarded between the subnets. What is missing?', ['ipv6 enable on each interface', 'ipv6 unicast-routing in global configuration', 'A /128 local route', 'ip routing'], 1, 'ipv6 unicast-routing turns on IPv6 forwarding and router advertisements. The addresses already enable IPv6 on the interfaces, local routes appear automatically, and ip routing is for IPv4.'],
      ['Harbor Point has 2001:db8:acad::/48. How many /64 subnets does that allow?', ['256', '4,096', '65,536', '16 million'], 2, 'From /48 to /64 is 16 bits of subnet ID, and 2^16 is 65,536 subnets.'],
    ],
    related: { tickets: ['t13'], cards: ['ipv6', 'ipv6route'], hw: null, drill: false },
  });

  L.push({
    id: 'l1-9',
    obj: '1.9',
    domain: 'fund',
    title: 'IPv6 address types and the EUI-64 trick',
    minutes: 14,
    caseFile:
      "Your first IPv6 packet capture from the HQ office VLAN is full of addresses starting with fe80, ff02 and fd, and none of them are the 2001:db8 address you configured last night. Nothing is wrong. IPv6 just gives every interface several addresses at once, each with a different job.",
    sections: [
      {
        h: 'One interface, many addresses',
        body: [
          'In IPv4, an interface usually has one address. In IPv6, a working interface typically has a **link-local** address, one or more **global unicast** addresses, and it listens on several **multicast** groups. Recognizing an address type from its first few hex digits is a core exam skill.',
          {
            table: [
              ['Type', 'Prefix', 'Starts with', 'Scope and use'],
              ['Global unicast (GUA)', '2000::/3', '2 or 3', 'Publicly routable, like a public IPv4 address'],
              ['Unique local (ULA)', 'fc00::/7 (in practice fd00::/8)', 'fd', 'Private to an organization, like RFC 1918'],
              ['Link-local', 'fe80::/10', 'fe80', 'One link only, never routed. Every IPv6 interface has one'],
              ['Multicast', 'ff00::/8', 'ff', 'One-to-many. Replaces broadcast'],
              ['Anycast', '(from the unicast space)', 'Looks like unicast', 'Same address on several devices; routing picks the nearest'],
              ['Loopback', '::1/128', '::1', 'The host itself (127.0.0.1 in IPv4)'],
              ['Unspecified', '::/128', '::', '"No address yet," used as a source during startup'],
            ],
          },
        ],
      },
      {
        h: 'Unicast: global, unique local, link-local',
        body: [
          '**Global unicast addresses** come from 2000::/3, so they start with a 2 or 3 in the first hex digit. They are routable on the internet and are what you configured in [lesson 1.8](#learn-l1-8).',
          '**Unique local addresses** are IPv6\'s private range. The block is fc00::/7, but the eighth bit must be 1 for locally assigned addresses, so real ULAs start with **fd**. The next 40 bits are supposed to be a **random global ID**, which makes it very unlikely that two merging companies collide (a lesson learned the hard way with 10.0.0.0/8). ULAs are not routed on the internet.',
          '**Link-local addresses** start with **fe80** and are created automatically as soon as IPv6 is enabled on an interface. They work only on that one link, routers never forward them, and the same link-local can appear on every interface of a router. They do a lot of quiet work: neighbor discovery, router advertisements, and the next-hop address in IPv6 routing tables all use link-locals.',
        ],
      },
      {
        h: 'Multicast and anycast',
        body: [
          'IPv6 has **no broadcast**. Anything that would be a broadcast in IPv4 goes to a multicast group instead, so only interested devices process it. Multicast addresses start with **ff**; the fourth hex digit is the **scope** (2 = link-local, 5 = site-local, e = global).',
          {
            table: [
              ['Address', 'Group'],
              ['FF02::1', 'All nodes on the link (closest thing to a broadcast)'],
              ['FF02::2', 'All routers on the link'],
              ['FF02::5 and FF02::6', 'OSPFv3 routers, and OSPFv3 DR/BDR'],
              ['FF02::A', 'EIGRP routers'],
              ['FF02::1:2', 'DHCPv6 servers and relay agents'],
              ['FF02::1:FFxx:xxxx', 'Solicited-node: last 24 bits of a unicast address'],
            ],
          },
          'The **solicited-node** group deserves a closer look. Every unicast address automatically joins FF02::1:FF plus the address\'s last 24 bits. When a host needs another host\'s MAC address (IPv6\'s replacement for ARP, called Neighbor Solicitation), it sends to that group instead of to everyone, so in practice only the target listens.',
          'An **anycast** address is a normal-looking unicast address configured on more than one device. Routing delivers each packet to whichever is closest by routing metric. Public DNS resolvers use this to answer from the nearest data center. On IOS you mark it with the `anycast` keyword: `ipv6 address 2001:db8:acad:53::53/64 anycast`.',
        ],
      },
      {
        h: 'Modified EUI-64, step by step',
        body: [
          'A 64-bit interface ID can be built automatically from a 48-bit MAC address. Cisco calls the method **modified EUI-64**. Using HPL-CORE\'s MAC **3C41.0E9A.27B1**:',
          {
            steps: [
              'Split the MAC in half: `3C41:0E` and `9A:27B1`.',
              'Insert **FFFE** in the middle: `3C41:0EFF:FE9A:27B1`.',
              'Flip the **seventh bit** of the first byte (the universal/local bit). 3C is 0011 1100; flipping bit 7 gives 0011 1110, which is **3E**.',
              'Interface ID: `3E41:0EFF:FE9A:27B1`, written short as `3e41:eff:fe9a:27b1`.',
              'Add the prefix: `2001:db8:acad:10:3e41:eff:fe9a:27b1`. With fe80::/64 in front instead, you get the link-local `fe80::3e41:eff:fe9a:27b1`.',
            ],
          },
          {
            svg: svg(
              640,
              150,
              'Modified EUI-64: split the MAC, insert FFFE, flip the seventh bit',
              t(320, 20, 'MAC 3C41.0E9A.27B1', 'ls-mono ls-b') +
                box(130, 32, 150, 30, '3C41:0E', 'ls-box') + box(360, 32, 150, 30, '9A:27B1', 'ls-box') +
                arrow(205, 62, 205, 80) + arrow(435, 62, 435, 80) +
                box(90, 82, 150, 30, '3C41:0E', 'ls-box') + box(240, 82, 160, 30, 'FF:FE', 'ls-accf') + box(400, 82, 150, 30, '9A:27B1', 'ls-box') +
                t(320, 135, 'Flip bit 7 of the first byte: 3C (0011 1100) becomes 3E (0011 1110)  ->  3E41:0EFF:FE9A:27B1', 'ls-sm ls-mono')
            ),
          },
          'The quick flip rule for the first hex pair: the second hex digit changes by 2. 0 and 2 swap, 4 and 6 swap, 8 and A swap, C and E swap. So 00 becomes 02, 3C becomes 3E, and 3E would become 3C.',
          { note: 'Privacy: an EUI-64 address reveals the device\'s MAC. Modern Windows, macOS and phones use random interface IDs (privacy extensions) for their SLAAC addresses instead. Routers and servers often still use EUI-64 or manual IDs.' },
        ],
      },
      {
        h: 'How hosts get their addresses',
        body: [
          'A new host creates its link-local address first, checks nobody else uses it (Duplicate Address Detection), then sends a **Router Solicitation** to FF02::2. Routers answer with a **Router Advertisement** (to FF02::1 or the host) carrying the /64 prefix and the default gateway (the router\'s link-local). With **SLAAC** the host builds its own global address from that prefix. Flags in the RA can also point hosts to **DHCPv6**, either for everything (stateful) or just for extras like DNS servers (stateless). Lesson [1.10](#learn-l1-10) shows how to see the result on Windows, macOS and Linux.',
        ],
      },
    ],
    techNotes: [
      'If a host has only an fe80 address, it never got a router advertisement. Check `ipv6 unicast-routing` on the router before anything else.',
      'Seeing "FFFE" in the middle of an interface ID means EUI-64. You can work backward to the MAC, which is handy for finding a device on a switch.',
      'Pinging a link-local address from a router needs the exit interface, because every interface has the same fe80::/10 network. IOS asks for it.',
    ],
    examTraps: [
      'Link-local is fe80::/10; unique local is fc00::/7 (fd in practice). Questions swap them.',
      'There is no broadcast in IPv6. Any answer that mentions an IPv6 broadcast address is wrong.',
      'EUI-64 flips the seventh bit; it does not invert the whole first byte. 00 becomes 02, not FF.',
      'Global unicast is 2000::/3, so 2001:, 2600:, and 3fff: are all global. Do not assume only 2001 counts.',
    ],
    tryIt: [
      {
        device: 'router',
        mode: 'config',
        prompt: 'Give Gi0/0 a global address and look at the brief output: a link-local FE80 address appears too, without you configuring it. (The bench keeps it short; a real router uses EUI-64 from the MAC.)',
        cmds: ['interface g0/0', 'ipv6 address 2001:db8:acad:10::1/64', 'do show ipv6 interface brief'],
      },
    ],
    check: [
      ['Which address is a link-local unicast address?', ['fd12:3456:789a::1', 'fe80::3e41:eff:fe9a:27b1', 'ff02::1', '2001:db8::1'], 1, 'Link-local addresses are in fe80::/10. fd is unique local, ff02::1 is the all-nodes multicast group, and 2001:db8::1 is global unicast (documentation range).'],
      ['Using modified EUI-64, what interface ID does MAC 0019.E8A1.1101 produce?', ['0019:E8FF:FEA1:1101', '0219:E8FF:FEA1:1101', 'FF19:E8FF:FEA1:1101', '0219:E8A1:FFFE:1101'], 1, 'Split into 0019E8 and A11101, insert FFFE, and flip the seventh bit of the first byte: 00 becomes 02. FFFE goes in the middle, not after the fourth byte.'],
      ['What replaces IPv4 broadcast in IPv6?', ['Anycast', 'Multicast', 'Link-local unicast', 'Nothing; IPv6 still broadcasts ARP'], 1, 'IPv6 uses multicast groups (FF02::1, solicited-node groups and others) for everything IPv4 did with broadcast. ARP is replaced by Neighbor Discovery over multicast.'],
    ],
    related: { tickets: ['t13'], cards: ['ipv6'], hw: null, drill: false },
  });

  L.push({
    id: 'l1-10',
    obj: '1.10',
    domain: 'fund',
    title: 'Checking IP settings on Windows, macOS and Linux',
    minutes: 11,
    caseFile:
      "Three tickets, three laptops, three operating systems: the Windows PC in billing \"has no internet,\" the dispatcher's MacBook \"sees the Wi-Fi but nothing loads,\" and the Linux box running the dock-door cameras lost its feed. All three answers start with the same four facts: address, mask, gateway, DNS.",
    sections: [
      {
        h: 'The four facts every host needs',
        body: [
          'Whatever the operating system, a host needs four things to talk beyond its own subnet:',
          {
            list: [
              '**IP address**, unique on the subnet (IPv4 and/or IPv6).',
              '**Subnet mask** or prefix length, so it knows which destinations are local.',
              '**Default gateway**, the router it sends everything else to. It must be in the same subnet as the host.',
              '**DNS server**, so names turn into addresses.',
            ],
          },
          'When a user says "no internet," check those four in order, then test them in order: ping the gateway, ping an outside IP address, then resolve a name. Whichever step fails tells you which fact is wrong.',
        ],
      },
      {
        h: 'Windows',
        body: [
          '`ipconfig` shows the basics; `ipconfig /all` adds the MAC address, DHCP server, lease times and DNS servers.',
          {
            cli: [
              'C:\\> ipconfig /all',
              'Ethernet adapter Ethernet:',
              '   Physical Address. . . . . . . . . : 3C-41-0E-12-7A-90',
              '   DHCP Enabled. . . . . . . . . . . : Yes',
              '   IPv6 Address. . . . . . . . . . . : 2001:db8:acad:10:9d1c:22b4:51e0:7a13(Preferred)',
              '   Link-local IPv6 Address . . . . . : fe80::9d1c:22b4:51e0:7a13%12(Preferred)',
              '   IPv4 Address. . . . . . . . . . . : 10.10.10.57(Preferred)',
              '   Subnet Mask . . . . . . . . . . . : 255.255.255.0',
              '   Default Gateway . . . . . . . . . : fe80::1%12',
              '                                       10.10.10.1',
              '   DHCP Server . . . . . . . . . . . : 10.10.99.10',
              '   DNS Servers . . . . . . . . . . . : 10.10.99.53',
            ],
          },
          'Other useful Windows commands: `ipconfig /release` and `ipconfig /renew` (redo DHCP), `ipconfig /flushdns`, `ping`, `tracert`, `nslookup`, `arp -a` (the ARP cache), `route print` (the host\'s routing table) and `netsh interface ip show config`. The `%12` after a link-local address is the zone (interface) index: which interface that fe80 address lives on.',
        ],
      },
      {
        h: 'macOS',
        body: [
          'The GUI lives in System Settings > Network > (interface) > Details, where the TCP/IP tab shows the address, mask, router and IPv6 settings, and the DNS tab shows resolvers. From Terminal:',
          {
            cli: [
              'rosa@dispatch-mbp ~ % ifconfig en0',
              'en0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500',
              '	ether 8c:85:90:4a:11:c2',
              '	inet6 fe80::1c4f:9a2e:77b1:3d0e%en0 prefixlen 64 secured scopeid 0xb',
              '	inet 10.10.20.44 netmask 0xffffff00 broadcast 10.10.20.255',
              '	status: active',
              'rosa@dispatch-mbp ~ % netstat -rn -f inet | grep default',
              'default            10.10.20.1         UGScg            en0',
            ],
          },
          'Notice the mask is shown in **hex**: `0xffffff00` is 255.255.255.0. Other commands: `networksetup -getinfo Wi-Fi` (address, mask, router in one go), `ipconfig getifaddr en0`, and `scutil --dns` for DNS resolvers.',
        ],
      },
      {
        h: 'Linux',
        body: [
          'Modern distributions use the `ip` command (from iproute2); `ifconfig` may not even be installed.',
          {
            cli: [
              'night@cam-ctrl:~$ ip addr show eth0',
              '2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP',
              '    link/ether 52:54:00:3a:9c:11 brd ff:ff:ff:ff:ff:ff',
              '    inet 10.10.30.15/24 brd 10.10.30.255 scope global eth0',
              '    inet6 fe80::5054:ff:fe3a:9c11/64 scope link',
              'night@cam-ctrl:~$ ip route',
              'default via 10.10.30.1 dev eth0 proto dhcp',
              '10.10.30.0/24 dev eth0 proto kernel scope link src 10.10.30.15',
              'night@cam-ctrl:~$ resolvectl status | grep "DNS Servers"',
              '       DNS Servers: 10.10.99.53',
            ],
          },
          'Linux shows the mask as a prefix length (`/24`). The DNS resolver is in `/etc/resolv.conf` on many systems, or reported by `resolvectl status` on systemd-based ones; `nmcli device show` works where NetworkManager is in charge. And notice the link-local address: `fe80::5054:ff:fe3a:9c11` has ff:fe in the middle, so it is EUI-64 from the MAC 52:54:00:3a:9c:11 (52 flips to 50).',
        ],
      },
      {
        h: 'Reading what you find',
        body: [
          {
            table: [
              ['What you see', 'What it means'],
              ['169.254.x.x address', 'DHCP failed; the host self-assigned (APIPA). Check the VLAN, DHCP server and relay'],
              ['Gateway in a different subnet than the host', 'Static config typo. The host cannot reach its gateway'],
              ['Wrong mask (e.g. /16 instead of /24)', 'Host thinks remote hosts are local and ARPs for them instead of using the gateway'],
              ['No DNS server, or a wrong one', 'Ping by IP works, names fail'],
              ['Only an fe80 IPv6 address', 'No router advertisement received; IPv6 beyond the link will fail'],
              ['Correct settings, but gateway ping fails', 'Look at the network: cable, VLAN, port security, the router interface'],
            ],
          },
          { note: 'The dispatcher\'s MacBook had 10.10.20.44 with router 10.10.20.1 and no DNS server listed. Pinging 8.8.8.8 worked, names did not. The fix was on the DHCP scope, not the Mac.' },
        ],
      },
    ],
    techNotes: [
      'Ask the user to run the command and read you the numbers. "Is the gateway 10.10.10.1?" gets a faster answer than "what does the network look like?"',
      'On Windows, `ipconfig /all | findstr /i "IPv4 Gateway DNS"` trims the output to what you need.',
      'If `ipconfig /renew` hangs for a minute and then gives 169.254.x.x, the DHCP request is leaving the PC but nothing is answering. Start at the switch port.',
    ],
    examTraps: [
      'The default gateway must be in the host\'s own subnet. An answer with the gateway outside the subnet is the broken one.',
      'macOS ifconfig shows the mask in hexadecimal (0xffffff00), Linux ip shows a prefix length (/24), Windows shows dotted decimal.',
      'ifconfig is not a Windows command; ipconfig is not the Linux tool (ip addr is).',
      'A host can ping by IP but not by name: that is a DNS problem, not a gateway problem.',
    ],
    tryIt: [
      {
        device: 'pc',
        mode: 'priv',
        prompt: 'Read the four facts on the lab PC, then test them in order: the gateway first, then another host.',
        cmds: ['ipconfig', 'ping 10.10.10.1', 'ping 10.10.10.12'],
      },
    ],
    check: [
      ['A Windows PC shows IPv4 address 169.254.31.7. What is the most likely cause?', ['The DNS server is down', 'The PC could not get an address from DHCP', 'The default gateway is wrong', 'IPv6 is disabled'], 1, '169.254.0.0/16 is the self-assigned APIPA range, used when DHCP gets no answer. DNS and gateway problems do not change the host\'s own address.'],
      ['On a Linux host, which command shows the default gateway?', ['ipconfig /all', 'ip route', 'arp -a', 'nslookup'], 1, 'ip route shows the routing table, including the "default via" line. ipconfig is Windows, arp -a shows the ARP cache, and nslookup tests DNS.'],
      ['A Mac reports "inet 10.10.20.44 netmask 0xfffffe00". What prefix length is that?', ['/22', '/23', '/24', '/25'], 1, '0xfffffe00 is 255.255.254.0, which is 23 one-bits, so /23.'],
    ],
    related: { tickets: ['t10'], cards: ['dhcp', 'dns', 'arp'], hw: null, drill: false },
  });

  L.push({
    id: 'l1-11',
    obj: '1.11',
    domain: 'fund',
    title: 'Wireless principles: channels, SSIDs, RF and encryption',
    minutes: 15,
    caseFile:
      "The warehouse Wi-Fi drops every time a forklift drives past aisle 14, and someone \"fixed\" it last month by setting every access point to channel 3. Now it is worse everywhere. Before you touch the controller, you need to know how radio actually behaves.",
    sections: [
      {
        h: 'Wi-Fi is a shared radio',
        body: [
          'Wireless LANs follow the IEEE **802.11** standards. Unlike switched Ethernet, all devices on a channel share the same air, so Wi-Fi is **half duplex**: only one device on a channel transmits at a time. Collisions cannot be detected over radio, so 802.11 uses **CSMA/CA** (collision avoidance): listen first, wait a random backoff if the channel is busy, and expect an acknowledgment for every unicast frame.',
          {
            table: [
              ['Standard', 'Wi-Fi name', 'Bands', 'Notes'],
              ['802.11b', '-', '2.4 GHz', 'Up to 11 Mbps, legacy'],
              ['802.11a', '-', '5 GHz', 'Up to 54 Mbps, legacy'],
              ['802.11g', '-', '2.4 GHz', 'Up to 54 Mbps, legacy'],
              ['802.11n', 'Wi-Fi 4', '2.4 and 5 GHz', 'MIMO, 40 MHz channels'],
              ['802.11ac', 'Wi-Fi 5', '5 GHz', 'Wider channels, more spatial streams'],
              ['802.11ax', 'Wi-Fi 6 / 6E', '2.4, 5 (and 6 GHz for 6E)', 'OFDMA, better in crowded areas'],
              ['802.11be', 'Wi-Fi 7', '2.4, 5, 6 GHz', 'Up to 320 MHz channels, multi-link'],
            ],
          },
        ],
      },
      {
        h: 'RF basics in plain English',
        body: [
          'Radio is an electromagnetic wave. **Frequency** is how many cycles per second (Wi-Fi uses about 2.4, 5 and 6 GHz); **wavelength** is the length of one cycle, and higher frequency means shorter wavelength. **Amplitude** is the wave\'s strength.',
          'Higher frequencies carry more data per channel and have more channels, but they lose strength faster and get through walls less well. That is the trade-off between the 2.4 GHz band (longer range, few channels, crowded) and 5/6 GHz (shorter range, many channels, faster).',
          'A signal fades with distance and with whatever it meets on the way:',
          {
            list: [
              '**Absorption**: walls, people, water and pallets of frozen fish soak up energy. The signal gets weaker.',
              '**Reflection**: metal racks, forklifts and freezer doors bounce the signal. Bounced copies arriving at different times cause multipath problems.',
              '**Refraction**: the signal bends passing between materials of different density (glass, humid air).',
              '**Diffraction**: the signal bends around an obstacle, leaving an RF shadow behind it.',
              '**Scattering**: rough surfaces or dust break the signal into many weak directions.',
            ],
          },
          'Signal strength is measured as **RSSI** in dBm, a negative number where closer to zero is stronger (-55 dBm is good, -80 dBm is poor). What really matters is **SNR**, the signal-to-noise ratio: how far the signal stands above the background noise, in dB. A strong signal in a noisy room can still be unusable. Aisle 14 is a forklift-shaped reflection and absorption problem.',
        ],
      },
      {
        h: 'Channels and why 1, 6 and 11',
        body: [
          'The 2.4 GHz band is divided into channels 5 MHz apart, but each Wi-Fi transmission is about 20 MHz wide (22 MHz for old 802.11b). So neighboring channels overlap heavily. In the US, only **channels 1, 6 and 11** do not overlap each other.',
          {
            svg: svg(
              640,
              150,
              '2.4 GHz band with overlapping channels and the three non-overlapping channels 1, 6 and 11',
              ln(20, 120, 620, 120) +
                Array.from({ length: 11 }, (_, i) => t(110 + i * 42, 138, String(i + 1), 'ls-sm ls-mono')).join('') +
                [1, 6, 11].map((c) => `<path d="M${110 + (c - 1) * 42 - 84} 120 Q${110 + (c - 1) * 42} 20 ${110 + (c - 1) * 42 + 84} 120" class="ls-accf"/>`).join('') +
                `<path d="M${110 + 2 * 42 - 84} 120 Q${110 + 2 * 42} 45 ${110 + 2 * 42 + 84} 120" class="ls-bad ls-dash"/>` +
                t(110 + 2 * 42, 52, 'ch 3 overlaps 1 and 6', 'ls-sm ls-t-bad') +
                t(110, 15, 'ch 1', 'ls-b ls-t-acc') + t(320, 15, 'ch 6', 'ls-b ls-t-acc') + t(530, 15, 'ch 11', 'ls-b ls-t-acc')
            ),
            caption: 'Channel 3 overlaps both 1 and 6, so it interferes with everything around it. That was last month\'s "fix."',
          },
          'Adjacent APs should use different non-overlapping channels in a repeating pattern (1, 6, 11, 1, 6, 11...) so neighbors never share a channel. When two nearby APs share a channel, they take turns (co-channel contention); when they are on overlapping channels, they corrupt each other\'s frames, which is worse.',
          'The **5 GHz** band has many more non-overlapping 20 MHz channels (up to 25 in the US; many are DFS channels that must give way to radar, and some designs skip those), and **6 GHz** (Wi-Fi 6E and 7) adds even more. That room is why enterprise designs push clients to 5 and 6 GHz and use wider channels (40, 80, 160 MHz) there.',
        ],
      },
      {
        h: 'SSIDs, BSSIDs and service sets',
        body: [
          {
            list: [
              '**SSID** (service set identifier): the network name users see, up to 32 characters. "HPL-Staff" and "HPL-Scanners" are two SSIDs, and one AP can broadcast several.',
              '**BSS** (basic service set): one AP and its associated clients. Its identity is the **BSSID**, the MAC address of the AP\'s radio for that SSID.',
              '**ESS** (extended service set): several APs sharing the same SSID, connected by a wired network, so clients can **roam** between them. A whole warehouse on "HPL-Scanners" is one ESS.',
              '**IBSS** (ad hoc): devices talk directly with no AP.',
              '**Mesh**: APs connect to each other wirelessly to extend coverage where cabling is impossible, like the yard light poles.',
            ],
          },
          'For roaming to work smoothly, neighboring AP cells should **overlap by about 10 to 15 percent** at a usable signal level, on different channels. Hiding the SSID (not broadcasting it) does not add security: the name is still in client probe frames.',
        ],
      },
      {
        h: 'Encryption, in brief',
        body: [
          'Because anyone in range can capture radio frames, wireless traffic must be encrypted. The short history: **WEP** (RC4, broken, never use), **WPA** (TKIP, an interim fix, deprecated), **WPA2** (AES with CCMP, the long-time standard), and **WPA3** (still AES, with GCMP-256 in its 192-bit enterprise mode, plus **SAE** to replace the pre-shared key handshake and resist password guessing). Each comes in a **Personal** flavor (a pre-shared key) and an **Enterprise** flavor (802.1X with a RADIUS server, a unique login per user). Lesson 5.9 goes deeper.',
        ],
      },
    ],
    techNotes: [
      'Never pick channels by hand on a controller-managed network unless you have a survey. RRM (radio resource management) on the WLC does it continuously and better.',
      'Turn down AP power before adding more APs. Overpowered APs make clients cling to a far AP instead of roaming to the close one.',
      'In a warehouse, survey with the racks full. Empty racks and full racks are two different RF environments.',
    ],
    examTraps: [
      'The non-overlapping 2.4 GHz channels are 1, 6 and 11. Not 1, 5, 9 and not 3.',
      'Wi-Fi is half duplex and uses CSMA/CA. CSMA/CD belongs to half-duplex wired Ethernet.',
      'The BSSID is a MAC address; the SSID is the human-readable name.',
      'Hiding the SSID is not a security control.',
    ],
    tryIt: [],
    check: [
      ['Which set of 2.4 GHz channels does not overlap in the US?', ['1, 5, 9', '1, 6, 11', '2, 7, 12', '1, 4, 7, 10'], 1, 'Each 2.4 GHz transmission is about 20-22 MHz wide and channels are 5 MHz apart, so only 1, 6 and 11 avoid overlapping.'],
      ['What identifies a single basic service set?', ['The SSID', 'The BSSID, the MAC address of the AP radio', 'The ESS', 'The channel number'], 1, 'A BSS is identified by its BSSID. Several BSSs can share one SSID (that is an ESS), and channels are not unique identifiers.'],
      ['Metal racks bounce the Wi-Fi signal so that copies arrive at different times. Which RF behavior is that?', ['Absorption', 'Reflection', 'Refraction', 'Diffraction'], 1, 'Bouncing off a surface is reflection, which causes multipath. Absorption weakens the signal, refraction bends it through materials, and diffraction bends it around obstacles.'],
    ],
    related: { tickets: [], cards: ['wififund', 'wireless'], hw: null, drill: false },
  });

  L.push({
    id: 'l1-12',
    obj: '1.12',
    domain: 'fund',
    title: 'Virtualization: VMs, containers and VRFs',
    minutes: 12,
    caseFile:
      "Harbor Point's server room used to be twelve physical servers. Now it is two hosts running twenty-six virtual machines, a cluster of containers for the tracking app, and the edge router keeps a separate routing table for the Delaware network. Same hardware, many logical machines. Tonight you learn how each kind of slicing works.",
    sections: [
      {
        h: 'Server virtualization',
        body: [
          'A physical server usually sits idle most of the time. **Virtualization** runs many **virtual machines (VMs)** on one physical host, each with its own operating system, virtual CPU, memory, disk and network cards. A layer of software called the **hypervisor** shares out the real hardware and keeps the VMs isolated from each other.',
          {
            table: [
              ['Hypervisor type', 'Runs on', 'Examples', 'Used for'],
              ['Type 1 (bare metal)', 'Directly on the hardware', 'VMware ESXi, Microsoft Hyper-V, KVM', 'Data centers and production servers'],
              ['Type 2 (hosted)', 'On top of a normal OS', 'VirtualBox, VMware Workstation', 'Labs, desktops, testing'],
            ],
          },
          'Benefits: fewer physical servers (less power, space, cooling), fast provisioning (a new server in minutes), snapshots before risky changes, and moving a running VM to another host for maintenance. The trade-off: one host failure takes down many VMs, so hosts are clustered.',
        ],
      },
      {
        h: 'Virtual switching',
        body: [
          'VMs on the same host still need a network. The hypervisor provides a **virtual switch (vSwitch)**: each VM\'s virtual NIC plugs into a virtual port, and the host\'s physical NICs act as uplinks to the real switch. The vSwitch can tag VLANs, so one physical uplink usually runs as an **802.1Q trunk** carrying several VLANs to the host.',
          {
            svg: svg(
              640,
              220,
              'A virtualization host with VMs connected to a virtual switch, trunked to a physical switch; containers share one OS kernel',
              `<rect x="10" y="10" width="360" height="200" rx="8" class="ls-box"/>` + t(190, 30, 'Physical host HPL-VMH01', 'ls-b') +
                box(25, 45, 100, 40, 'VM: DNS', 'ls-dev', 'Windows') + box(140, 45, 100, 40, 'VM: Web', 'ls-dev', 'Linux') + box(255, 45, 100, 40, 'VM: DB', 'ls-dev', 'Linux') +
                ln(75, 85, 75, 110) + ln(190, 85, 190, 110) + ln(305, 85, 305, 110) +
                box(25, 110, 330, 30, 'vSwitch (VLANs 10, 20, 99)', 'ls-accf') +
                box(25, 160, 330, 30, 'Hypervisor (type 1) on hardware', 'ls-warnf') +
                ln(355, 125, 450, 125, 'ls-acc') + t(402, 117, '802.1Q trunk', 'ls-sm ls-t-acc') +
                box(450, 105, 170, 40, 'HPL-DC-SW1', 'ls-dev', 'physical switch') +
                t(535, 175, 'Containers instead: apps share', 'ls-sm ls-t-mut') + t(535, 190, 'one host OS kernel, no guest OS', 'ls-sm ls-t-mut')
            ),
          },
        ],
      },
      {
        h: 'Containers',
        body: [
          'A **container** packages an application with its libraries and settings, but **shares the host operating system kernel** instead of carrying a whole guest OS. That makes containers small (megabytes instead of gigabytes) and fast to start (seconds or less). **Docker** is the common container runtime; **Kubernetes** is the common orchestrator that runs many containers across many hosts, restarts failed ones and scales them up and down.',
          {
            table: [
              ['', 'Virtual machine', 'Container'],
              ['Includes', 'Full guest OS plus app', 'App and its dependencies only'],
              ['Isolation', 'Strong: separate kernels', 'Lighter: shared kernel'],
              ['Size and startup', 'Gigabytes, minutes', 'Megabytes, seconds'],
              ['Mix of OSes', 'Any OS per VM', 'Must match the host kernel type'],
            ],
          },
          'Harbor Point\'s tracking app runs as a dozen containers (web front end, API, worker jobs) so the developers can ship a new version several times a day without building a new server.',
        ],
      },
      {
        h: 'VRFs: virtualizing the router',
        body: [
          'Virtualization is not only for servers. A **VRF** (virtual routing and forwarding instance) splits one router into several independent routing tables. Each interface belongs to one VRF, and traffic in one VRF cannot reach another unless you deliberately leak routes between them. Because each VRF has its own table, **the same IP addresses can be used in different VRFs** without conflict.',
          'That solves the Delaware overlap from [lesson 1.7](#learn-l1-7): HQ and the acquired carrier both use 10.10.0.0/16, so the edge router keeps the Delaware network in its own VRF until renumbering is done. Service providers do the same thing at huge scale with MPLS VPNs: one VRF per customer. Using VRFs on one router without MPLS is called **VRF-lite**.',
          {
            cli: [
              'HPL-EDGE(config)# vrf definition DELAWARE',
              'HPL-EDGE(config-vrf)# address-family ipv4',
              'HPL-EDGE(config-vrf-af)# exit-address-family',
              'HPL-EDGE(config-vrf)# interface gigabitethernet0/2',
              'HPL-EDGE(config-if)# vrf forwarding DELAWARE',
              '% Interface GigabitEthernet0/2 IPv4 disabled and address(es) removed due to enabling VRF DELAWARE',
              'HPL-EDGE(config-if)# ip address 10.10.0.1 255.255.255.0',
              'HPL-EDGE(config-if)# end',
              'HPL-EDGE# show ip route vrf DELAWARE',
            ],
          },
          'Notice the warning: putting an interface into a VRF **removes its IP address**, so you configure the address after the VRF. Commands like `ping vrf DELAWARE 10.10.0.20` and `show ip route vrf DELAWARE` work inside the VRF; plain `show ip route` shows only the global table. The CCNA expects you to know what VRFs are and why they are used, not to build complex designs.',
        ],
      },
    ],
    techNotes: [
      'When a VM "has no network," check the vSwitch port group VLAN and the trunk on the physical switch. Nine times out of ten the VLAN is not allowed on the trunk.',
      'In a VRF, troubleshooting commands need the VRF name. A plain `ping` from a router uses the global table and will fail even when the VRF is healthy.',
      'Containers move fast. Treat their addresses as temporary and work from the service names and load balancer addresses instead.',
    ],
    examTraps: [
      'Type 1 runs on bare metal; Type 2 runs on a host OS. Do not flip them.',
      'Containers share the host kernel; VMs each have a full guest OS.',
      'A VRF gives a router multiple routing tables, which allows overlapping addresses. It is not a VLAN (that is Layer 2).',
    ],
    tryIt: [],
    check: [
      ['What is the main difference between a container and a virtual machine?', ['Containers include a full guest operating system', 'Containers share the host OS kernel, while each VM runs its own OS', 'VMs cannot run on a type 1 hypervisor', 'Containers require dedicated physical hardware'], 1, 'Containers package an app with its dependencies and share the host kernel, so they are lighter. VMs each carry a full guest OS on a hypervisor.'],
      ['Which hypervisor type runs directly on the server hardware?', ['Type 1', 'Type 2', 'Container runtime', 'vSwitch'], 0, 'Type 1 (bare metal) hypervisors such as ESXi, Hyper-V and KVM run directly on hardware. Type 2 runs on top of a host OS.'],
      ['Why can two VRFs on the same router use the same IP subnet?', ['VRFs translate addresses with NAT automatically', 'Each VRF has its own separate routing table', 'VRFs work only at Layer 2', 'IOS allows overlapping subnets on any interfaces'], 1, 'Each VRF keeps its own routing and forwarding table, so overlapping addresses do not conflict. In the global table, IOS rejects overlapping interface subnets.'],
    ],
    related: { tickets: [], cards: ['cloud'], hw: null, drill: false },
  });

  L.push({
    id: 'l1-13',
    obj: '1.13',
    domain: 'fund',
    title: 'How a switch thinks: MAC learning, flooding and forwarding',
    minutes: 13,
    caseFile:
      "A brand-new access switch went into the Canton warehouse office an hour ago, and the first thing Marcus noticed is that his PC's activity light blinks when other people print. \"Is the switch spying on me?\" Not quite. The switch just has not learned where everyone lives yet.",
    sections: [
      {
        h: 'The MAC address table',
        body: [
          'A Layer 2 switch forwards Ethernet frames using a **MAC address table** (also called the CAM table): a list of MAC addresses, the VLAN each was seen in, and the port it lives behind. A switch builds the table by itself, from traffic, with no configuration.',
          'Ethernet frames carry a **destination MAC** first and a **source MAC** second, followed by the EtherType (or an 802.1Q tag), the payload and a 4-byte **FCS** for error checking. The switch uses the source to learn and the destination to forward.',
          {
            svg: svg(
              640,
              70,
              'Ethernet frame: preamble, destination MAC, source MAC, type, payload, FCS',
              box(10, 15, 90, 34, 'Preamble+SFD', 'ls-box') + box(100, 15, 110, 34, 'Dest MAC', 'ls-accf') + box(210, 15, 110, 34, 'Source MAC', 'ls-goodf') +
                box(320, 15, 70, 34, 'Type', 'ls-box') + box(390, 15, 170, 34, 'Payload 46-1500 B', 'ls-box') + box(560, 15, 70, 34, 'FCS', 'ls-box') +
                t(155, 65, '6 bytes', 'ls-sm ls-t-mut') + t(265, 65, '6 bytes', 'ls-sm ls-t-mut') + t(595, 65, '4 bytes', 'ls-sm ls-t-mut')
            ),
          },
        ],
      },
      {
        h: 'Learn, then forward, filter or flood',
        body: [
          'For every frame that arrives, the switch does two separate things:',
          {
            steps: [
              '**Learn**: look at the **source MAC**. Add or refresh an entry saying "this MAC is on this port, in this VLAN," and reset its age timer.',
              'Then decide using the **destination MAC**:',
              '**Known unicast**: the destination is in the table on a different port. **Forward** the frame out that one port only.',
              '**Known unicast on the same port it arrived on**: **filter** (drop) it; the destination already received it on that segment.',
              '**Unknown unicast**: the destination is not in the table. **Flood** it out every port in the same VLAN except the one it came in on.',
              '**Broadcast** (FFFF.FFFF.FFFF), and multicast by default: **flood** it out every port in the VLAN except the incoming one.',
            ],
          },
          {
            svg: svg(
              640,
              220,
              'Switch learns PC A on Fa0/1, floods an unknown unicast, then forwards the reply directly',
              box(260, 80, 120, 50, 'HPL-CAN-SW1', 'ls-accf') +
                box(30, 20, 120, 40, 'PC A', 'ls-dev', '..aa:01 Fa0/1') + box(490, 20, 120, 40, 'PC B', 'ls-dev', '..bb:02 Fa0/2') +
                box(30, 160, 120, 40, 'Marcus PC', 'ls-dev', 'Fa0/3') + box(490, 160, 120, 40, 'Printer', 'ls-dev', 'Fa0/4') +
                arrow(150, 45, 258, 92, 'ls-good') + t(190, 58, '1 frame to B', 'ls-sm ls-t-good') +
                arrow(380, 92, 490, 45, 'ls-acc ls-dash') + arrow(260, 118, 150, 175, 'ls-acc ls-dash') + arrow(380, 118, 490, 175, 'ls-acc ls-dash') +
                t(320, 150, '2 B unknown: flood', 'ls-sm ls-t-acc') +
                t(320, 215, '3 B replies: switch learns B on Fa0/2, forwards only to Fa0/1', 'ls-sm ls-t-mut')
            ),
            caption: 'Marcus\'s light blinks during step 2: unknown unicasts and broadcasts are flooded to him too. Once both MACs are learned, traffic between A and B never reaches his port.',
          },
        ],
      },
      {
        h: 'Aging, and seeing the table',
        body: [
          'Dynamic entries **age out after 300 seconds** (5 minutes) of not seeing that source MAC, by default. Aging keeps the table accurate when devices move or go quiet, and frees space: the table is finite, and if it ever fills up, new destinations are flooded like unknown unicasts.',
          {
            cli: [
              'HPL-CAN-SW1# show mac address-table',
              '          Mac Address Table',
              '-------------------------------------------',
              'Vlan    Mac Address       Type        Ports',
              '----    -----------       --------    -----',
              '   1    0019.e8a1.1101    DYNAMIC     Gi0/1',
              '  10    3c41.0e12.7a90    DYNAMIC     Fa0/1',
              '  10    8c85.904a.11c2    DYNAMIC     Fa0/2',
              '  10    0050.56a3.0c14    DYNAMIC     Fa0/3',
              '  10    0050.56a3.0c15    DYNAMIC     Fa0/3',
              'Total Mac Addresses for this criterion: 5',
              'HPL-CAN-SW1# show mac address-table aging-time',
              'Global Aging Time:  300',
            ],
          },
          'Useful variations: `show mac address-table dynamic`, `show mac address-table interface fa0/3`, `show mac address-table address 3c41.0e12.7a90`, and `clear mac address-table dynamic` to force relearning. Two MACs on Fa0/3 means something with two MACs (a PC behind an IP phone, or a small unmanaged switch) is plugged in there. Many MACs on an uplink like Gi0/1 is normal: everything beyond the uplink is learned there.',
          'You can also add **static** entries (`mac address-table static 0050.56a3.0c99 vlan 10 interface fa0/5`) and change aging (`mac address-table aging-time 600`), though the defaults are right almost everywhere.',
        ],
      },
      {
        h: 'Why it matters for troubleshooting',
        body: [
          {
            list: [
              'To find where a device is plugged in, look up its MAC (from `arp -a` on the PC or the router\'s ARP table), then follow the MAC table switch to switch until it shows on an access port.',
              'A MAC that keeps jumping between two ports ("MAC flapping" log messages) usually means a Layer 2 loop or a misconfigured server NIC team.',
              'Constant flooding (every port blinking) can mean the table is full, possibly a MAC flooding attack. Port security (lesson 5.7) limits how many MACs a port can learn.',
              'MAC tables are per VLAN. The same MAC can appear in two VLANs, and flooding never crosses from one VLAN to another.',
            ],
          },
        ],
      },
    ],
    techNotes: [
      'When a PC moves desks and "the network forgot it," it is usually the old ARP entry on the router, not the switch. The switch relearns from the first frame the PC sends.',
      'Learning happens on the source address. A silent device (a printer that only listens) can age out and cause flooding until it speaks again.',
      'On a trunk uplink, expect dozens of MACs. On an access port, more than two or three deserves a walk to the desk.',
    ],
    examTraps: [
      'Switches learn from the source MAC and forward based on the destination MAC. Exam answers like to swap them.',
      'Unknown unicast frames are flooded, not dropped.',
      'Flooding goes out all ports in the same VLAN except the incoming port, never to other VLANs.',
      'Default MAC aging time on Cisco switches is 300 seconds.',
    ],
    tryIt: [
      {
        device: 'pc',
        mode: 'priv',
        prompt: 'Generate some traffic across both bench switches: PC1 on SW1 pings PC2 on SW2. The first frames are flooded; after that, both switches know exactly where each PC lives.',
        cmds: ['ping 10.10.10.12'],
      },
      {
        device: 'switch',
        mode: 'priv',
        prompt: 'The MAC table itself is not on the bench yet, but the port view shows which ports are connected and in which VLAN, which is where those MAC entries would live.',
        cmds: ['show interfaces status', 'show vlan brief'],
      },
    ],
    check: [
      ['A switch receives a frame whose destination MAC is not in its MAC address table. What does it do?', ['Drops the frame', 'Floods it out all ports in that VLAN except the one it arrived on', 'Sends it to the default gateway', 'Sends an ARP request for the MAC'], 1, 'Unknown unicast frames are flooded within the VLAN. Switches do not drop them, do not use a gateway (that is Layer 3), and do not ARP for MAC addresses.'],
      ['Which field does a switch use to populate its MAC address table?', ['Destination MAC', 'Source MAC', 'Source IP', 'EtherType'], 1, 'The switch learns which port each source MAC lives behind. It uses the destination MAC to make the forwarding decision.'],
      ['How long does a dynamic MAC address table entry last by default on a Cisco switch if the device stays silent?', ['60 seconds', '300 seconds', '4 hours', 'Until the switch reloads'], 1, 'The default aging time is 300 seconds. (Four hours is the default ARP cache timeout on Cisco routers.)'],
    ],
    related: { tickets: ['t03', 't15'], cards: ['ethernet', 'arp'], hw: null, drill: false },
  });

  /* ================================================================ *
   * 2.0 NETWORK ACCESS
   * ================================================================ */

  L.push({
    id: 'l2-1',
    obj: '2.1',
    domain: 'access',
    title: 'VLANs across switches: data, voice and getting between them',
    minutes: 17,
    caseFile:
      "Dispatch and the warehouse office share one flat network, and when a scanner went haywire last week its broadcast storm froze the dispatch phones. The fix on tonight's change ticket: put dispatch PCs in VLAN 20, the phones in voice VLAN 40, warehouse in VLAN 30, and make sure they can still reach each other through the router.",
    sections: [
      {
        h: 'What a VLAN is',
        body: [
          'A **VLAN** (virtual LAN) splits one physical switch into several logical switches. Each VLAN is its own **broadcast domain**: a broadcast in VLAN 20 is flooded only to VLAN 20 ports. Devices in different VLANs cannot talk at Layer 2 at all; they need a router (or Layer 3 switch), just as if they were on separate physical switches.',
          'Why bother? **Smaller broadcast domains** (a scanner storm stays in its VLAN), **security** (you can filter traffic between VLANs at the router), **grouping by function** rather than by where the desk is, and **QoS** for voice. By convention each VLAN gets its own IP subnet: VLAN 20 is 10.10.20.0/24, VLAN 30 is 10.10.30.0/24.',
        ],
      },
      {
        h: 'VLAN ranges and the default VLAN',
        body: [
          {
            table: [
              ['Range', 'Notes'],
              ['1', 'The default VLAN. Every port starts in it. It cannot be deleted or renamed'],
              ['2-1001', 'Normal range. Yours to create and use'],
              ['1002-1005', 'Reserved for old FDDI and Token Ring. Cannot be deleted'],
              ['1006-4094', 'Extended range (larger networks; stored in the running config)'],
            ],
          },
          'The **normal range** is 1-1005, and normal-range VLANs are stored in `vlan.dat` in flash, not in the startup-config. That surprises people: erasing the startup-config and reloading leaves the VLANs behind. Best practice is to move users and management **off VLAN 1**: everything lands there by default, so it is the first place attackers and accidents go.',
        ],
      },
      {
        h: 'Create VLANs and assign access ports',
        body: [
          'An **access port** belongs to exactly one data VLAN and sends untagged frames to the end device. Create the VLAN, then assign ports:',
          {
            cli: [
              'HPL-DISP-SW1(config)# vlan 20',
              'HPL-DISP-SW1(config-vlan)# name DISPATCH',
              'HPL-DISP-SW1(config-vlan)# vlan 30',
              'HPL-DISP-SW1(config-vlan)# name WAREHOUSE',
              'HPL-DISP-SW1(config-vlan)# exit',
              'HPL-DISP-SW1(config)# interface range fastethernet0/1 - 12',
              'HPL-DISP-SW1(config-if-range)# switchport mode access',
              'HPL-DISP-SW1(config-if-range)# switchport access vlan 20',
              'HPL-DISP-SW1(config-if-range)# interface range fastethernet0/13 - 20',
              'HPL-DISP-SW1(config-if-range)# switchport mode access',
              'HPL-DISP-SW1(config-if-range)# switchport access vlan 30',
            ],
          },
          'If you assign a port to a VLAN that does not exist yet, many Cisco switches create it for you with the message "% Access VLAN does not exist. Creating vlan 30", but the VLAN gets a default name. Create and name VLANs on purpose. `switchport mode access` also stops the port from negotiating a trunk with whatever gets plugged in.',
        ],
      },
      {
        h: 'Voice VLANs',
        body: [
          'An IP phone usually has a built-in three-port switch: one port to the wall, one to the PC, one internal for the phone itself. One switch port then carries two kinds of traffic. The **voice VLAN** feature handles it:',
          {
            cli: [
              'HPL-DISP-SW1(config)# vlan 40',
              'HPL-DISP-SW1(config-vlan)# name VOICE',
              'HPL-DISP-SW1(config-vlan)# interface fastethernet0/5',
              'HPL-DISP-SW1(config-if)# switchport mode access',
              'HPL-DISP-SW1(config-if)# switchport access vlan 20',
              'HPL-DISP-SW1(config-if)# switchport voice vlan 40',
            ],
          },
          'The switch tells the phone which voice VLAN to use (via CDP or LLDP-MED). The phone **tags its own frames with VLAN 40** (802.1Q, with a priority value for QoS), while the PC behind the phone sends **untagged** frames that land in data VLAN 20. Even though one tag is involved, Cisco still treats the port as an access port, not a trunk.',
          {
            svg: svg(
              640,
              130,
              'One access port carrying an untagged data VLAN for the PC and a tagged voice VLAN for the IP phone',
              box(20, 45, 110, 40, 'Dispatch PC', 'ls-dev') + box(220, 45, 110, 40, 'IP phone', 'ls-dev') + box(460, 40, 160, 50, 'HPL-DISP-SW1', 'ls-accf', 'Fa0/5') +
                ln(130, 65, 220, 65) + t(175, 55, 'untagged', 'ls-sm ls-t-mut') +
                ln(330, 60, 460, 60, 'ls-ln') + ln(330, 72, 460, 72, 'ls-acc') +
                t(395, 52, 'data VLAN 20, untagged', 'ls-sm') + t(395, 90, 'voice VLAN 40, tagged', 'ls-sm ls-t-acc') +
                t(320, 120, 'switchport access vlan 20  +  switchport voice vlan 40', 'ls-sm ls-mono ls-t-mut')
            ),
          },
        ],
      },
      {
        h: 'Verify',
        body: [
          {
            cli: [
              'HPL-DISP-SW1# show vlan brief',
              'VLAN Name                             Status    Ports',
              '---- -------------------------------- --------- -------------------------------',
              '1    default                          active    Fa0/21, Fa0/22, Fa0/23, Fa0/24',
              '20   DISPATCH                         active    Fa0/1, Fa0/2, Fa0/3, Fa0/4',
              '                                                Fa0/5, Fa0/6, Fa0/7, Fa0/8 ...',
              '30   WAREHOUSE                        active    Fa0/13, Fa0/14, Fa0/15, Fa0/16 ...',
              '40   VOICE                            active    Fa0/5',
              '1002 fddi-default                     act/unsup',
              'HPL-DISP-SW1# show interfaces fastethernet0/5 switchport',
              'Name: Fa0/5',
              'Switchport: Enabled',
              'Administrative Mode: static access',
              'Operational Mode: static access',
              '...',
              'Access Mode VLAN: 20 (DISPATCH)',
              'Trunking Native Mode VLAN: 1 (default)',
              '...',
              'Voice VLAN: 40 (VOICE)',
            ],
          },
          '`show vlan brief` lists access ports only. **Trunk ports do not appear** in it, which is the single most common "where did my uplink go?" moment. Use `show interfaces trunk` for those (lesson [2.2](#learn-l2-2)).',
        ],
      },
      {
        h: 'Spanning multiple switches, and inter-VLAN routing',
        body: [
          'A VLAN can stretch across switches: create the same VLAN on each switch and carry it between them over a **trunk**. A VLAN that is missing on one switch silently breaks: the trunk carries the frames, but the switch with no VLAN 30 has nowhere to put them.',
          'To get **between** VLANs you need Layer 3. Three ways:',
          {
            list: [
              '**One router interface per VLAN**: simple, wastes ports. Rare today.',
              '**Router-on-a-stick (ROAS)**: one router interface trunked to the switch, with a **subinterface** per VLAN. Each subinterface has `encapsulation dot1q <vlan>` and the gateway IP for that VLAN.',
              '**Layer 3 switch with SVIs**: `ip routing`, then `interface vlan 20` with the gateway IP, and so on. Fastest and most common in campus networks.',
            ],
          },
          {
            cli: [
              'HPL-EDGE(config)# interface gigabitethernet0/0.20',
              'HPL-EDGE(config-subif)# encapsulation dot1q 20',
              'HPL-EDGE(config-subif)# ip address 10.10.20.1 255.255.255.0',
              'HPL-EDGE(config-subif)# interface gigabitethernet0/0.30',
              'HPL-EDGE(config-subif)# encapsulation dot1q 30',
              'HPL-EDGE(config-subif)# ip address 10.10.30.1 255.255.255.0',
              'HPL-EDGE(config-subif)# interface gigabitethernet0/0',
              'HPL-EDGE(config-if)# no shutdown',
            ],
          },
          'Router-on-a-stick needs the switch port facing the router to be a **trunk**, and the physical interface must be up (`no shutdown` on Gi0/0 brings all its subinterfaces up). Hosts in each VLAN use their subinterface address as their default gateway.',
        ],
      },
    ],
    techNotes: [
      'Name every VLAN. `show vlan brief` with names reads like a floor plan; without them it is a guessing game.',
      'Use `interface range` for groups of ports. Fewer typos, and you can see the whole block in one command.',
      'Moved a PC to a new VLAN? Its old IP is now in the wrong subnet. `ipconfig /release` and `/renew` on the PC, or it will look "broken" until the lease runs out.',
    ],
    examTraps: [
      'Trunk ports are not listed in `show vlan brief`.',
      'The normal VLAN range is 1-1005; VLANs 1 and 1002-1005 cannot be deleted.',
      'A voice VLAN port is still an access port; the phone tags voice frames while PC traffic stays untagged.',
      'Hosts in different VLANs always need a Layer 3 device to communicate, even on the same switch.',
    ],
    tryIt: [
      {
        device: 'switch',
        mode: 'config',
        prompt: 'Create the dispatch VLAN, move LAB-PC1\'s port into it, and check the VLAN table. PC1 is now cut off from PC2 at Layer 2, exactly as intended.',
        cmds: ['vlan 20', 'name DISPATCH', 'exit', 'interface fa0/1', 'switchport mode access', 'switchport access vlan 20', 'end', 'show vlan brief'],
      },
      {
        device: 'router',
        mode: 'config',
        prompt: 'Build a router-on-a-stick subinterface for VLAN 20 and confirm it comes up with its parent interface.',
        cmds: ['interface g0/0.20', 'encapsulation dot1q 20', 'ip address 10.10.20.1 255.255.255.0', 'do show ip interface brief'],
      },
    ],
    check: [
      ['A switch port connects to an IP phone with a PC plugged into the phone. Which configuration puts the PC in VLAN 20 and the phone in VLAN 40?', ['switchport mode trunk and switchport trunk allowed vlan 20,40', 'switchport access vlan 20 and switchport voice vlan 40', 'switchport access vlan 40 and switchport voice vlan 20', 'switchport access vlan 20 and switchport access vlan 40'], 1, 'The access VLAN carries the PC\'s untagged traffic, and the voice VLAN is the tagged VLAN the phone uses. Entering access vlan twice just replaces the first value.'],
      ['Which VLAN IDs are in the normal range?', ['1-1005', '1-4094', '1006-4094', '2-1001 only'], 0, 'The normal range is 1-1005 (with 1002-1005 reserved). 1006-4094 is the extended range.'],
      ['PCs in VLAN 20 and VLAN 30 on the same switch cannot ping each other. The switch is Layer 2 only. What is needed?', ['A trunk between the two VLANs', 'A Layer 3 device routing between the VLANs, such as router-on-a-stick', 'Putting both VLANs in the same STP instance', 'Enabling CDP'], 1, 'Different VLANs are different broadcast domains and subnets; only routing connects them. A trunk carries VLANs but does not route between them.'],
    ],
    related: { tickets: ['t03', 't07', 't20'], cards: ['vlan'], hw: 'ports', drill: false },
  });

  L.push({
    id: 'l2-2',
    obj: '2.2',
    domain: 'access',
    title: 'Trunks, 802.1Q tags and the native VLAN',
    minutes: 14,
    caseFile:
      "HPL-DISP-SW1 and HPL-DISP-SW2 sit at opposite ends of the dispatch floor, and VLANs 20, 30 and 40 all need to cross the one cable between them. The log on SW2 keeps printing a native VLAN mismatch warning that the day shift has been ignoring for weeks. Tonight you build the trunk correctly and make the warning go away.",
    sections: [
      {
        h: 'Why trunks exist',
        body: [
          'An access port carries one VLAN. Running one cable per VLAN between every pair of switches would be absurd, so switches use **trunk** links: one link carrying many VLANs. To keep the VLANs apart on the wire, each frame gets a **tag** saying which VLAN it belongs to. The receiving switch reads the tag, removes it, and delivers the frame into the right VLAN.',
        ],
      },
      {
        h: 'The 802.1Q tag',
        body: [
          'The IEEE standard is **802.1Q**. It inserts a **4-byte tag** into the Ethernet frame between the source MAC and the EtherType. (Cisco\'s old ISL encapsulated the whole frame instead; modern switches support only 802.1Q.) Because the frame changed, the switch recalculates the FCS.',
          {
            svg: svg(
              640,
              130,
              '802.1Q tag inserted between source MAC and EtherType: TPID 0x8100, PCP, DEI and 12-bit VLAN ID',
              box(10, 20, 100, 34, 'Dest MAC', 'ls-box') + box(110, 20, 100, 34, 'Src MAC', 'ls-box') + box(210, 20, 110, 34, '802.1Q tag', 'ls-accf') +
                box(320, 20, 70, 34, 'Type', 'ls-box') + box(390, 20, 170, 34, 'Payload', 'ls-box') + box(560, 20, 70, 34, 'FCS*', 'ls-box') +
                ln(210, 54, 90, 80, 'ls-thin') + ln(320, 54, 550, 80, 'ls-thin') +
                box(90, 80, 170, 34, 'TPID 0x8100', 'ls-accf', '16 bits') + box(260, 80, 80, 34, 'PCP', 'ls-accf', '3 bits') +
                box(340, 80, 60, 34, 'DEI', 'ls-accf', '1 bit') + box(400, 80, 150, 34, 'VLAN ID', 'ls-accf', '12 bits') +
                t(595, 72, '*recalculated', 'ls-sm ls-t-mut')
            ),
          },
          {
            list: [
              '**TPID** (tag protocol identifier) = 0x8100: "this frame is tagged."',
              '**PCP** (priority code point), 3 bits: the Class of Service value used by QoS (voice is usually 5).',
              '**DEI** (drop eligible indicator), 1 bit: may be dropped first under congestion.',
              '**VID** (VLAN ID), 12 bits: values 0-4095, with 1-4094 usable.',
            ],
          },
        ],
      },
      {
        h: 'Configure a trunk',
        body: [
          {
            cli: [
              'HPL-DISP-SW1(config)# interface gigabitethernet0/1',
              'HPL-DISP-SW1(config-if)# switchport trunk encapsulation dot1q',
              'HPL-DISP-SW1(config-if)# switchport mode trunk',
              'HPL-DISP-SW1(config-if)# switchport trunk native vlan 999',
              'HPL-DISP-SW1(config-if)# switchport trunk allowed vlan 20,30,40',
              'HPL-DISP-SW1(config-if)# switchport nonegotiate',
            ],
          },
          {
            list: [
              '`switchport trunk encapsulation dot1q` is needed only on switches that also support ISL (older Catalyst 3560/3750 and similar). On a 2960 or a modern Catalyst 9000 the command is not needed or not present.',
              '`switchport mode trunk` makes it a trunk unconditionally.',
              '`switchport trunk allowed vlan` limits which VLANs cross. Careful: given a plain list, it **replaces** the allowed list. To add one later, use `switchport trunk allowed vlan add 50`; forgetting `add` silently cuts every other VLAN off the trunk (that is ticket [TT-1004](#t04)).',
              '`switchport nonegotiate` turns off DTP (below).',
            ],
          },
        ],
      },
      {
        h: 'The native VLAN',
        body: [
          'One VLAN on an 802.1Q trunk is sent **untagged**: the **native VLAN**, VLAN 1 by default. Any untagged frame arriving on the trunk is put into the native VLAN. It exists for backward compatibility with devices that do not understand tags.',
          'Both ends **must agree** on the native VLAN. If SW1 uses 999 and SW2 still uses 1, untagged frames from SW1\'s VLAN 999 land in SW2\'s VLAN 1: the two VLANs are quietly merged across the link. CDP notices and complains:',
          {
            cli: [
              '%CDP-4-NATIVE_VLAN_MISMATCH: Native VLAN mismatch discovered on GigabitEthernet0/1 (999), with HPL-DISP-SW2 GigabitEthernet0/1 (1).',
            ],
          },
          'Best practice: set the native VLAN to an **unused VLAN** (Harbor Point uses 999) on both ends, and do not put any hosts in it. Leaving it on VLAN 1, which also carries user traffic by default, opens the door to **VLAN hopping** by double tagging. On routers doing router-on-a-stick, the native VLAN subinterface uses `encapsulation dot1q 999 native`.',
        ],
      },
      {
        h: 'DTP, briefly',
        body: [
          'Cisco switches can negotiate trunking with **DTP** (Dynamic Trunking Protocol). The modes:',
          {
            table: [
              ['', 'trunk', 'dynamic desirable', 'dynamic auto', 'access'],
              ['trunk', 'Trunk', 'Trunk', 'Trunk', 'Misconfigured'],
              ['dynamic desirable', 'Trunk', 'Trunk', 'Trunk', 'Access'],
              ['dynamic auto', 'Trunk', 'Trunk', '**Access**', 'Access'],
              ['access', 'Misconfigured', 'Access', 'Access', 'Access'],
            ],
          },
          'The trap is **auto + auto = access**: both sides wait for the other to ask. Security best practice is to hard-code every port as `access` or `trunk` and disable DTP with `switchport nonegotiate` on trunks, so a rogue device cannot negotiate a trunk and see every VLAN.',
        ],
      },
      {
        h: 'Verify',
        body: [
          {
            cli: [
              'HPL-DISP-SW1# show interfaces trunk',
              'Port        Mode             Encapsulation  Status        Native vlan',
              'Gi0/1       on               802.1q         trunking      999',
              '',
              'Port        Vlans allowed on trunk',
              'Gi0/1       20,30,40',
              '',
              'Port        Vlans allowed and active in management domain',
              'Gi0/1       20,30,40',
              '',
              'Port        Vlans in spanning tree forwarding state and not pruned',
              'Gi0/1       20,30,40',
            ],
          },
          'Read it top to bottom. **Mode on** means hard-coded trunk. **Allowed** is what you configured. **Allowed and active** drops any VLAN that does not exist on this switch, so a VLAN missing from that line has not been created here. **Forwarding and not pruned** drops anything STP is blocking. `show interfaces gi0/1 switchport` adds the administrative and operational modes, useful when DTP is involved.',
        ],
      },
    ],
    techNotes: [
      'Always type `add` when changing an allowed list on a live trunk. Better yet, copy the current list from `show interfaces trunk` into your change plan first.',
      'A VLAN shows in "allowed" but not "allowed and active"? Create the VLAN on that switch.',
      'Native VLAN mismatch messages come from CDP. If CDP is off, the mismatch still breaks things, just silently.',
    ],
    examTraps: [
      'The native VLAN is untagged on an 802.1Q trunk. All other VLANs are tagged.',
      'The 802.1Q tag is 4 bytes and goes between the source MAC and the EtherType. The VLAN ID field is 12 bits.',
      'dynamic auto on both ends results in an access port, not a trunk.',
      '`switchport trunk allowed vlan 50` replaces the list; `add 50` appends.',
    ],
    tryIt: [
      {
        device: 'switch',
        mode: 'config',
        prompt: 'Turn both bench uplinks into trunks and read the three lists in the output. Then trim the allowed list and add a VLAN back with the add keyword.',
        cmds: ['interface range gi0/1 - 2', 'switchport mode trunk', 'switchport trunk allowed vlan 1,20', 'switchport trunk allowed vlan add 30', 'end', 'show interfaces trunk'],
      },
    ],
    check: [
      ['How does an 802.1Q trunk handle frames in the native VLAN?', ['They are tagged with VLAN 1', 'They are sent untagged', 'They are encapsulated in ISL', 'They are dropped'], 1, 'Native VLAN frames cross an 802.1Q trunk untagged, and untagged frames received on the trunk are placed in the native VLAN.'],
      ['Both ends of a link are set to switchport mode dynamic auto. What is the result?', ['A trunk', 'An access link', 'An EtherChannel', 'The ports become err-disabled'], 1, 'Dynamic auto only responds to DTP requests and never initiates them, so with auto on both ends nobody asks and the link stays access.'],
      ['VLAN 30 appears under "Vlans allowed on trunk" but not under "Vlans allowed and active in management domain." Why?', ['VLAN 30 is the native VLAN', 'VLAN 30 does not exist on this switch', 'STP is blocking VLAN 30', 'The trunk is using ISL'], 1, 'The "allowed and active" list only shows allowed VLANs that exist locally. STP blocking would show in the last list, forwarding and not pruned.'],
    ],
    related: { tickets: ['t04', 't07'], cards: ['trunk', 'dtpvtp'], hw: null, drill: false },
  });

  L.push({
    id: 'l2-3',
    obj: '2.3',
    domain: 'access',
    title: 'CDP and LLDP: asking the neighbors',
    minutes: 11,
    caseFile:
      "The network diagram for the Canton warehouse was last updated in 2019, and two switches on it no longer exist. Rather than tracing cables with a flashlight, you will ask every device who it is plugged into. CDP will answer for the Cisco gear; the new non-Cisco camera switch only speaks LLDP.",
    sections: [
      {
        h: 'What discovery protocols do',
        body: [
          'A Layer 2 discovery protocol has each device periodically announce itself out every interface: its name, model, software, capabilities, management address and the port it is sending from. Neighbors store these announcements, which lets you build a map of **directly connected** devices without logging into them. The messages are not forwarded beyond the next device.',
          {
            table: [
              ['', 'CDP', 'LLDP'],
              ['Owner', 'Cisco proprietary', 'Open standard, IEEE 802.1AB'],
              ['Default on Cisco IOS', 'Enabled globally and on interfaces', 'Usually disabled; enable with `lldp run`'],
              ['Advertisement timer', '60 seconds', '30 seconds'],
              ['Holdtime', '180 seconds', '120 seconds'],
              ['Destination MAC', '0100.0ccc.cccc (multicast)', '0180.c200.000e (multicast)'],
              ['Voice VLAN for phones', 'Yes (Cisco phones)', 'Yes, with the LLDP-MED extension'],
            ],
          },
          'The **holdtime** is how long a neighbor\'s entry is kept without hearing from it. Pull a cable and the neighbor disappears from the table after the holdtime runs out, not instantly.',
        ],
      },
      {
        h: 'CDP: configure and verify',
        body: [
          'CDP is on by default, so usually you just look:',
          {
            cli: [
              'HPL-CAN-SW1# show cdp neighbors',
              'Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge',
              '                  S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone',
              '',
              'Device ID        Local Intrfce     Holdtme    Capability  Platform  Port ID',
              'HPL-CAN-R1       Gig 0/1           151             R B   ISR4331   Gig 0/0/1',
              'HPL-CAN-SW2      Gig 0/2           163            S I    WS-C2960X Gig 0/1',
              'SEP3C410E12AB90  Fas 0/7           138           H P     IP Phone  Port 1',
            ],
          },
          'Read every row as "**my** Local Intrfce connects to **their** Port ID on Device ID." The capability letters say what the neighbor is. Notice what is missing: the neighbor\'s IP address. For that, use the detail view:',
          {
            cli: [
              'HPL-CAN-SW1# show cdp neighbors detail',
              '-------------------------',
              'Device ID: HPL-CAN-R1',
              'Entry address(es):',
              '  IP address: 10.20.0.1',
              'Platform: cisco ISR4331/K9,  Capabilities: Router Source-Route-Bridge',
              'Interface: GigabitEthernet0/1,  Port ID (outgoing port): GigabitEthernet0/0/1',
              'Holdtime : 151 sec',
              'Version :',
              'Cisco IOS XE Software, Version 17.09.04a',
              'advertisement version: 2',
              'Native VLAN: 1',
              'Duplex: full',
            ],
          },
          '`show cdp entry HPL-CAN-R1` shows the same detail for one neighbor; `show cdp` shows the global timers; `show cdp interface` shows which interfaces run CDP; `show cdp traffic` shows packet counters.',
          {
            table: [
              ['Command', 'Where', 'Effect'],
              ['`no cdp run` / `cdp run`', 'Global', 'Disable / enable CDP on the whole device'],
              ['`no cdp enable` / `cdp enable`', 'Interface', 'Disable / enable CDP on one interface'],
              ['`cdp timer 30`', 'Global', 'Change how often advertisements are sent'],
              ['`cdp holdtime 120`', 'Global', 'Change how long neighbors keep the entry'],
            ],
          },
        ],
      },
      {
        h: 'LLDP: configure and verify',
        body: [
          'LLDP is the multi-vendor option. Turn it on globally; each interface can then send and receive independently:',
          {
            cli: [
              'HPL-CAN-SW1(config)# lldp run',
              'HPL-CAN-SW1(config)# interface fastethernet0/20',
              'HPL-CAN-SW1(config-if)# no lldp transmit',
              'HPL-CAN-SW1(config-if)# lldp receive',
              'HPL-CAN-SW1(config-if)# end',
              'HPL-CAN-SW1# show lldp neighbors',
              'Capability codes:',
              '    (R) Router, (B) Bridge, (T) Telephone, (C) DOCSIS Cable Device',
              '    (W) WLAN Access Point, (P) Repeater, (S) Station, (O) Other',
              '',
              'Device ID           Local Intf     Hold-time  Capability      Port ID',
              'CAMSW-DOCK          Fa0/20         120        B               1/1',
              'HPL-CAN-SW2         Gi0/2          120        B               Gi0/1',
              '',
              'Total entries displayed: 2',
            ],
          },
          'LLDP timers: `lldp timer 30` (send interval), `lldp holdtime 120`, and `lldp reinit 2` (the delay before LLDP initializes on an interface). Verification mirrors CDP: `show lldp`, `show lldp neighbors`, `show lldp neighbors detail`, `show lldp entry <name>`, `show lldp interface`, `show lldp traffic`. Both protocols can run at the same time.',
          { note: 'Interface-level LLDP is two separate commands, `lldp transmit` and `lldp receive`. CDP has a single `cdp enable`. That difference is a favorite exam detail.' },
        ],
      },
      {
        h: 'Security and good practice',
        body: [
          'Discovery protocols hand out your device names, models, IOS versions and IP addresses to anyone plugged into the port. That is great on links between your own switches and a gift to an attacker on a lobby jack. Common policy: leave CDP/LLDP on for **infrastructure links and IP phones**, and disable them on ports facing **untrusted** networks (the internet edge, guest areas, third-party handoffs) with `no cdp enable` and `no lldp transmit` / `no lldp receive`.',
        ],
      },
    ],
    techNotes: [
      'CDP works even when IP addressing is wrong, because it is Layer 2. It is the first command I run on a link that "has no connectivity."',
      'Duplex and native VLAN mismatches are both reported by CDP in the log. Read the log before you start guessing.',
      'Neighbor still listed after you moved a cable? Wait out the holdtime, or clear it with `clear cdp table`.',
    ],
    examTraps: [
      'CDP is Cisco proprietary; LLDP is IEEE 802.1AB.',
      'CDP defaults: 60-second timer, 180-second holdtime. LLDP defaults: 30 seconds, 120 seconds.',
      '`show cdp neighbors` does not show IP addresses; `show cdp neighbors detail` (or `show cdp entry`) does.',
      'LLDP on interfaces uses `lldp transmit` and `lldp receive`, not "lldp enable."',
    ],
    tryIt: [
      {
        device: 'switch',
        mode: 'priv',
        prompt: 'See the bench neighbors through CDP, then turn on LLDP and look again. R1 and SW2 already run LLDP on the bench.',
        cmds: ['show cdp neighbors', 'show cdp neighbors detail', 'configure terminal', 'lldp run', 'end', 'show lldp neighbors'],
      },
      {
        device: 'switch',
        mode: 'config',
        prompt: 'Hide this switch from the router by disabling CDP on the router-facing port, then confirm the router entry is gone from this side.',
        cmds: ['interface fa0/8', 'no cdp enable', 'end', 'show cdp neighbors'],
      },
    ],
    check: [
      ['Which command shows the IP address of a directly connected Cisco neighbor?', ['show cdp neighbors', 'show cdp neighbors detail', 'show cdp interface', 'show lldp'], 1, 'The detail view (or show cdp entry) includes the entry addresses. The summary table shows name, ports, capability and platform only.'],
      ['What are the default LLDP advertisement and holdtime values?', ['60 and 180 seconds', '30 and 120 seconds', '10 and 40 seconds', '2 and 6 seconds'], 1, 'LLDP defaults to sending every 30 seconds with a 120-second holdtime. 60 and 180 are the CDP defaults.'],
      ['An engineer wants a switch port to keep listening to LLDP from a camera switch but stop advertising its own details on that port. Which command?', ['no lldp run', 'no lldp receive', 'no lldp transmit', 'no cdp enable'], 2, 'no lldp transmit stops advertisements on that interface while receive stays on. no lldp run disables LLDP on the whole device, and no cdp enable affects CDP only.'],
    ],
    related: { tickets: ['t23'], cards: ['cdp'], hw: null, drill: false },
  });

  L.push({
    id: 'l2-4',
    obj: '2.4',
    domain: 'access',
    title: 'EtherChannel and LACP: many cables, one logical link',
    minutes: 15,
    caseFile:
      "The dispatch floor uplink is a single gigabit link, and at shift change it hits 100 percent while 400 people log in. There is already a second cable between HPL-DISP-SW1 and the core, but STP blocks it. Tonight you bundle both links into an EtherChannel so they both carry traffic, and nothing gets blocked.",
    sections: [
      {
        h: 'The problem EtherChannel solves',
        body: [
          'Add a second link between two switches and STP sees a loop, so it blocks one link. You paid for two links and use one. **EtherChannel** (also called port channel or link aggregation) bundles up to **8 active** physical links into one logical interface. STP sees **one** link, so nothing is blocked; traffic spreads across all members; and if a member fails, traffic shifts to the others in well under a second, without STP reconverging.',
          {
            svg: svg(
              640,
              160,
              'Without EtherChannel STP blocks one of two links; with EtherChannel both links form Port-channel 1',
              t(160, 20, 'Without EtherChannel', 'ls-b') +
                box(40, 40, 90, 34, 'DISP-SW1', 'ls-dev') + box(200, 40, 90, 34, 'CORE', 'ls-dev') +
                ln(130, 50, 200, 50) + ln(130, 66, 200, 66, 'ls-bad ls-dash') + t(165, 95, 'STP blocks link 2', 'ls-sm ls-t-bad') +
                t(470, 20, 'With EtherChannel', 'ls-b') +
                box(350, 40, 90, 34, 'DISP-SW1', 'ls-dev') + box(510, 40, 90, 34, 'CORE', 'ls-dev') +
                ln(440, 50, 510, 50, 'ls-good') + ln(440, 66, 510, 66, 'ls-good') +
                `<ellipse cx="475" cy="58" rx="16" ry="18" class="ls-acc"/>` + t(475, 95, 'Po1: STP sees one link', 'ls-sm ls-t-good') +
                t(320, 140, 'Both members forward; traffic is spread per flow by a hash', 'ls-sm ls-t-mut')
            ),
          },
        ],
      },
      {
        h: 'LACP, PAgP or static',
        body: [
          'The two ends must agree to bundle. They can negotiate it with a protocol or be forced:',
          {
            table: [
              ['Method', 'Standard', 'Modes', 'Forms a channel when'],
              ['LACP', 'IEEE 802.3ad (now 802.1AX)', '`active`, `passive`', 'At least one side is active'],
              ['PAgP', 'Cisco proprietary', '`desirable`, `auto`', 'At least one side is desirable'],
              ['Static', 'None', '`on`', 'Both sides are on'],
            ],
          },
          '**Active** and **desirable** actively send negotiation messages; **passive** and **auto** only answer. So passive + passive, or auto + auto, never forms a channel. LACP is the standard and works with other vendors and servers, which is why the exam objective names it. Static `on` does no negotiation at all, so a cabling or configuration mistake on one side is not detected, which can cause loops. LACP can have up to 16 member ports configured, with 8 active and up to 8 hot-standby.',
        ],
      },
      {
        h: 'Members must match',
        body: [
          'Every port in the bundle must have the same settings, or it will not join (or will be suspended):',
          {
            list: [
              'Speed and duplex',
              'Switchport mode (all access or all trunk)',
              'Access VLAN, or for trunks the allowed VLANs and the native VLAN',
              'Layer 2 versus Layer 3 (all switchports or all routed ports)',
            ],
          },
          'The easy way to stay consistent: configure the members together with `interface range`, then make later changes on the **port-channel interface**, which pushes them to the members.',
        ],
      },
      {
        h: 'Configure a Layer 2 EtherChannel',
        body: [
          {
            cli: [
              'HPL-DISP-SW1(config)# interface range gigabitethernet0/1 - 2',
              'HPL-DISP-SW1(config-if-range)# channel-group 1 mode active',
              'Creating a port-channel interface Port-channel 1',
              'HPL-DISP-SW1(config-if-range)# exit',
              'HPL-DISP-SW1(config)# interface port-channel 1',
              'HPL-DISP-SW1(config-if)# switchport mode trunk',
              'HPL-DISP-SW1(config-if)# switchport trunk allowed vlan 20,30,40',
            ],
          },
          'Do the same on the core with `mode active` or `mode passive`. The channel-group number only has to be unique on each switch; it does not have to match the other side, though matching numbers make life easier. `channel-protocol lacp` is optional; the mode already implies the protocol.',
          'Traffic is spread by a **hash** of addresses, per flow, not per frame (sending one flow\'s frames down different links would reorder them). So one large file transfer uses one link; many users use them all. Change the hash with `port-channel load-balance src-dst-ip` in global config to include both IP addresses, which spreads traffic better than the MAC-based default on many platforms.',
        ],
      },
      {
        h: 'Configure a Layer 3 EtherChannel',
        body: [
          'Between two Layer 3 switches you often want a routed link instead of a trunk. Make the members routed ports first, then put the IP address on the port channel:',
          {
            cli: [
              'HPL-CORE1(config)# interface range gigabitethernet1/0/47 - 48',
              'HPL-CORE1(config-if-range)# no switchport',
              'HPL-CORE1(config-if-range)# channel-group 2 mode active',
              'HPL-CORE1(config-if-range)# exit',
              'HPL-CORE1(config)# interface port-channel 2',
              'HPL-CORE1(config-if)# no switchport',
              'HPL-CORE1(config-if)# ip address 10.10.255.1 255.255.255.252',
            ],
          },
          'In `show etherchannel summary` a Layer 3 bundle shows the flag **R** instead of **S**.',
        ],
      },
      {
        h: 'Verify',
        body: [
          {
            cli: [
              'HPL-DISP-SW1# show etherchannel summary',
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
              '1      Po1(SU)       LACP        Gi0/1(P)    Gi0/2(P)',
            ],
          },
          'What you want: the port channel shows **SU** (Layer 2, in use) or **RU** (Layer 3, in use), and every member shows **P** (bundled). Trouble looks like **(SD)** with members **(I)** (stand-alone: the other side is not negotiating, typically passive/passive or missing config) or **(s)** (suspended: a setting mismatch). `show etherchannel port-channel` and `show interfaces port-channel 1` give more detail, and `show spanning-tree` should list Po1 instead of the two physical ports.',
        ],
      },
    ],
    techNotes: [
      'Configure both sides before you plug in or unshut the second link. With `on` mode especially, half a bundle is a loop waiting to happen.',
      'Members stuck in (I) almost always mean the far side is not configured, or both sides are passive.',
      'Change trunk settings on the port channel, not on one member. Touching one member alone is how ports get suspended.',
    ],
    examTraps: [
      'LACP modes are active/passive; PAgP modes are desirable/auto. Mixing LACP on one end and PAgP on the other never works.',
      'Passive + passive and auto + auto do not form a channel.',
      'Load balancing is per flow, so one flow never exceeds one member\'s speed.',
      'In `show etherchannel summary`, P means bundled. Lowercase s means suspended, uppercase S means Layer 2.',
    ],
    tryIt: [
      {
        device: 'switch2',
        mode: 'config',
        prompt: 'Start on SW2: make its two uplinks LACP passive. Alone, passive waits, so the members show stand-alone (I). Then switch to the HPL-LAB-SW1 tab and run interface range gi0/1 - 2 and channel-group 1 mode active, and check the summary there.',
        cmds: ['interface range gi0/1 - 2', 'channel-group 1 mode passive', 'end', 'show etherchannel summary'],
      },
      {
        device: 'switch',
        mode: 'config',
        prompt: 'Here SW1 is active but SW2 has no channel configured, so the bundle stays down. Watch the flags, then switch to the SW2 tab and configure it to see SU and P.',
        cmds: ['interface range gi0/1 - 2', 'channel-group 1 mode active', 'exit', 'interface port-channel 1', 'switchport mode trunk', 'end', 'show etherchannel summary'],
      },
    ],
    check: [
      ['Which combination of LACP modes forms an EtherChannel?', ['passive and passive', 'active and passive', 'desirable and active', 'auto and passive'], 1, 'LACP needs at least one active side. Passive/passive never negotiates; desirable and auto are PAgP modes and do not interoperate with LACP.'],
      ['In show etherchannel summary, a member port shows (s). What does that mean?', ['It is bundled and forwarding', 'It is suspended, usually because its settings do not match the other members', 'It is a Layer 2 port', 'It is a hot-standby LACP port'], 1, 'Lowercase s is suspended, typically a mismatch in speed, duplex, VLAN or trunk settings. P is bundled, uppercase S marks a Layer 2 channel, and H is hot-standby.'],
      ['Why does a single large file transfer across a two-member EtherChannel not exceed the speed of one member link?', ['EtherChannel only uses one link at a time', 'Traffic is distributed per flow by a hash, so one flow stays on one link', 'STP blocks the second member', 'LACP limits each transfer to half the bandwidth'], 1, 'Load balancing hashes addresses so each flow stays on one member, avoiding reordering. Many flows use all members; STP sees the bundle as a single link and blocks nothing.'],
    ],
    related: { tickets: ['t09', 't20'], cards: ['etherchannel'], hw: null, drill: false },
  });

  L.push({
    id: 'l2-5',
    obj: '2.5',
    domain: 'access',
    title: 'Rapid PVST+: roots, roles and the guard dogs',
    minutes: 20,
    caseFile:
      "Last night someone plugged a cheap desktop switch into two wall jacks in the break room \"for more ports.\" The dispatch phones stuttered for a moment, and then one of the jacks went dead on its own. You need to understand exactly what spanning tree did, why the root bridge is in the wrong closet, and which guard feature saved the night.",
    sections: [
      {
        h: 'Why spanning tree exists',
        body: [
          'Redundant links between switches are good for uptime, but Ethernet frames have **no time-to-live**. A broadcast entering a loop is flooded around it forever, multiplying at every switch: a **broadcast storm**. MAC tables thrash as the same source MAC appears on different ports, and the network grinds to a halt within seconds.',
          '**Spanning Tree Protocol** prevents loops by putting just enough ports into a blocking (discarding) state that only one active path exists between any two points. If an active link fails, a blocked one takes over. **Rapid PVST+** is Cisco\'s per-VLAN version of Rapid STP (802.1w): a separate tree for every VLAN, with much faster convergence than original STP. Turn it on with `spanning-tree mode rapid-pvst`.',
        ],
      },
      {
        h: 'Step 1: elect the root bridge',
        body: [
          'Switches exchange **BPDUs** (bridge protocol data units), every 2 seconds by default. Each BPDU carries the sender\'s **bridge ID**: a priority plus its MAC address. The **lowest bridge ID wins** and becomes the **root bridge**.',
          {
            list: [
              'The priority field is 16 bits, but in PVST+ the lower 12 bits carry the VLAN ID (the **extended system ID**). So priorities can only be set in **multiples of 4096**, and the displayed priority is the configured value plus the VLAN number: default 32768 + VLAN 10 = **32778**.',
              'If priorities tie, the **lowest MAC address** wins. Out of the box that usually means the oldest switch in the building becomes root, which is how the break-room problem started: the root was an aging closet switch, not the core.',
            ],
          },
          'Always choose the root deliberately:',
          {
            cli: [
              'HPL-CORE1(config)# spanning-tree mode rapid-pvst',
              'HPL-CORE1(config)# spanning-tree vlan 10,20,30 root primary',
              'HPL-CORE2(config)# spanning-tree vlan 10,20,30 root secondary',
              '! or set the value directly:',
              'HPL-CORE1(config)# spanning-tree vlan 10,20,30 priority 4096',
            ],
          },
          '`root primary` sets the priority to **24576**, or to 4096 below the current root if the current root is already lower. `root secondary` sets **28672**, so it takes over if the primary dies. These are macros that write a priority into the configuration once; they do not keep adjusting later.',
        ],
      },
      {
        h: 'Step 2: roles for every port',
        body: [
          'Every non-root switch picks one **root port**: its best path to the root. Then every segment gets one **designated port**: the port that forwards toward the segment, away from the root. Everything else is **alternate** (or backup) and discards.',
          {
            steps: [
              'Root port = lowest **root path cost** (sum of port costs to the root).',
              'Tie? Lowest **neighbor bridge ID** (the upstream switch sending the BPDU).',
              'Tie? Lowest **neighbor port priority** (default 128).',
              'Tie? Lowest **neighbor port number**.',
            ],
          },
          {
            table: [
              ['Link speed', 'STP cost (short method)'],
              ['10 Mbps', '100'],
              ['100 Mbps', '19'],
              ['1 Gbps', '4'],
              ['10 Gbps', '2'],
            ],
          },
          {
            svg: svg(
              640,
              240,
              'Three-switch triangle: root bridge with designated ports, root ports on the others, one alternate port discarding',
              box(250, 15, 140, 46, 'HPL-CORE1', 'ls-goodf', 'ROOT  pri 24586') +
                box(60, 160, 140, 46, 'DISP-SW1', 'ls-dev', 'pri 32778') + box(440, 160, 140, 46, 'DISP-SW2', 'ls-dev', 'pri 32778') +
                ln(270, 61, 150, 160) + ln(370, 61, 490, 160) + ln(200, 183, 440, 183, 'ls-ln') +
                t(250, 80, 'DP', 'ls-sm ls-b ls-t-good') + t(390, 80, 'DP', 'ls-sm ls-b ls-t-good') +
                t(150, 150, 'RP', 'ls-sm ls-b ls-t-acc') + t(495, 150, 'RP', 'ls-sm ls-b ls-t-acc') +
                t(220, 175, 'DP', 'ls-sm ls-b ls-t-good') + t(420, 175, 'ALT', 'ls-sm ls-b ls-t-bad') +
                `<circle cx="432" cy="183" r="6" class="ls-badf"/>` +
                t(320, 226, 'Both switches have cost 4 to the root; DISP-SW1 has the lower bridge ID, so it owns the shared link', 'ls-sm ls-t-mut')
            ),
            caption: 'All root bridge ports are designated. The link between the two access switches is the only place a port discards.',
          },
          'Two facts fall out of this: **every port on the root bridge is designated** (forwarding), and on any link exactly one end is designated.',
        ],
      },
      {
        h: 'Rapid STP port states and roles',
        body: [
          {
            table: [
              ['RSTP state', 'Learns MACs?', 'Forwards frames?', 'Old 802.1D equivalent'],
              ['Discarding', 'No', 'No', 'Disabled, blocking, listening'],
              ['Learning', 'Yes', 'No', 'Learning'],
              ['Forwarding', 'Yes', 'Yes', 'Forwarding'],
            ],
          },
          {
            table: [
              ['Role', 'State', 'Meaning'],
              ['Root', 'Forwarding', 'Best path toward the root (one per non-root switch)'],
              ['Designated', 'Forwarding', 'Forwards onto a segment (one per segment)'],
              ['Alternate', 'Discarding', 'Backup path to the root via another switch; takes over almost instantly'],
              ['Backup', 'Discarding', 'Backup for a designated port on the same shared segment (rare: hubs)'],
              ['Disabled', '-', 'Administratively down'],
            ],
          },
          'RSTP is fast because it does not just wait on timers. Point-to-point links between switches negotiate directly (a proposal/agreement handshake), alternate ports are pre-computed, and **edge ports** go straight to forwarding. A neighbor is considered lost after **three missed hellos** (6 seconds), instead of the 20-second max age of the old protocol. RSTP link types: **point-to-point** (full duplex), **shared** (half duplex), and **edge** (PortFast).',
          {
            cli: [
              'HPL-DISP-SW2# show spanning-tree vlan 20',
              'VLAN0020',
              '  Spanning tree enabled protocol rstp',
              '  Root ID    Priority    24596',
              '             Address     0019.e8a1.0a00',
              '             Cost        4',
              '             Port        25 (GigabitEthernet0/1)',
              '             Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec',
              '',
              '  Bridge ID  Priority    32788  (priority 32768 sys-id-ext 20)',
              '             Address     0019.e8a1.2200',
              '             Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec',
              '             Aging Time  300 sec',
              '',
              'Interface           Role Sts Cost      Prio.Nbr Type',
              '------------------- ---- --- --------- -------- --------------------------------',
              'Fa0/5               Desg FWD 19        128.5    P2p Edge',
              'Gi0/1               Root FWD 4         128.25   P2p',
              'Gi0/2               Altn BLK 4         128.26   P2p',
            ],
          },
          'Note that IOS still prints **BLK** in the Sts column for a discarding RSTP port, and that "protocol rstp" confirms Rapid PVST+ is running. "This bridge is the root" appears under Root ID on the root itself.',
        ],
      },
      {
        h: 'PortFast and the four guard features',
        body: [
          '**PortFast** makes an access port an **edge port**: it skips the learning wait and forwards immediately when a PC or printer plugs in, so DHCP does not time out at boot. Only use it on ports to end hosts; IOS warns you when you enable it. Per port: `spanning-tree portfast`. On all access ports at once: `spanning-tree portfast default` in global config.',
          'Then the guards, each protecting against a different failure:',
          {
            table: [
              ['Feature', 'Protects against', 'What it does', 'Where to use it'],
              ['**BPDU guard**', 'A switch plugged into an access port', 'Port receives any BPDU: **err-disabled**', 'PortFast access ports'],
              ['**Root guard**', 'A downstream switch trying to become root', 'Superior BPDU received: port goes **root-inconsistent** (discarding) until they stop', 'Designated ports facing access switches'],
              ['**Loop guard**', 'A port wrongly moving to forwarding because BPDUs stopped arriving (one-way link)', 'BPDUs stop on a root/alternate port: **loop-inconsistent** (discarding) until they return', 'Root and alternate ports, uplinks'],
              ['**BPDU filter**', 'Sending or processing BPDUs where you never want them', 'Per interface: stops sending and receiving BPDUs (effectively disables STP on the port)', 'Rarely, with great care'],
            ],
          },
          {
            cli: [
              'HPL-DISP-SW1(config)# interface range fastethernet0/1 - 24',
              'HPL-DISP-SW1(config-if-range)# spanning-tree portfast',
              'HPL-DISP-SW1(config-if-range)# spanning-tree bpduguard enable',
              'HPL-CORE1(config)# interface gigabitethernet1/0/10',
              'HPL-CORE1(config-if)# spanning-tree guard root',
              'HPL-DISP-SW1(config)# interface gigabitethernet0/1',
              'HPL-DISP-SW1(config-if)# spanning-tree guard loop',
              '! global defaults that apply to PortFast ports:',
              'HPL-DISP-SW1(config)# spanning-tree portfast bpduguard default',
              'HPL-DISP-SW1(config)# spanning-tree portfast bpdufilter default',
            ],
          },
          'BPDU filter behaves differently depending on where you set it. **Globally** (`spanning-tree portfast bpdufilter default`), it applies to PortFast ports, which still send a few BPDUs when the link comes up, and if a BPDU ever arrives the port loses PortFast and filter status and runs normal STP. **Per interface** (`spanning-tree bpdufilter enable`), it simply stops sending and ignores received BPDUs, so a loop through that port will not be detected.',
          { note: 'The break-room switch: both wall jacks were PortFast ports with BPDU guard. The cheap switch forwarded BPDUs between them, so the second port received a BPDU and went err-disabled. That ended the loop. Recover with shutdown and no shutdown on the port (after removing the switch), or configure errdisable recovery.' },
        ],
      },
    ],
    techNotes: [
      'Put the root on the core, on purpose, for every VLAN, with a secondary on the other core. An accidental root in a closet is the root of half the STP tickets I have closed.',
      'BPDU guard on every user-facing port, no exceptions. It costs nothing and turns a floor-wide broadcast storm into a single dead jack.',
      '`show spanning-tree inconsistentports` lists ports held by root guard or loop guard. err-disabled ports show in `show interfaces status err-disabled`.',
      'Root guard and loop guard cannot be on the same port at the same time; root guard faces downstream, loop guard faces upstream.',
    ],
    examTraps: [
      'Lowest bridge ID wins the root election, not highest. Priority first, then MAC.',
      'Priority must be a multiple of 4096. The displayed priority includes the VLAN number (32768 + 1 = 32769 for VLAN 1).',
      'root primary sets 24576 (or 4096 below the current root); root secondary sets 28672.',
      'BPDU guard err-disables the port; root guard and loop guard put it into an inconsistent (discarding) state that clears automatically.',
      'RSTP has three states: discarding, learning, forwarding. Blocking and listening are 802.1D states.',
    ],
    tryIt: [
      {
        device: 'switch2',
        mode: 'priv',
        prompt: 'SW1 has the lower MAC, so it is root by accident. On SW2, find the root port (Gi0/1) and the alternate port that is discarding (Gi0/2). The bench prints the classic PVST+ label, but roles and the election work the same way.',
        cmds: ['show spanning-tree vlan 1'],
      },
      {
        device: 'switch2',
        mode: 'config',
        prompt: 'Make SW2 the root on purpose. Its priority becomes 24576 + 1, every one of its ports turns designated, and the blocked port moves to SW1. Check the SW1 tab afterwards.',
        cmds: ['spanning-tree vlan 1 root primary', 'end', 'show spanning-tree vlan 1'],
      },
      {
        device: 'switch',
        mode: 'config',
        prompt: 'Protect the PC port the right way: PortFast so it forwards at once, BPDU guard so a rogue switch shuts it down. Then guard the router-facing designated port against superior BPDUs.',
        cmds: ['interface fa0/1', 'spanning-tree portfast', 'spanning-tree bpduguard enable', 'interface fa0/8', 'spanning-tree guard root', 'end', 'show spanning-tree vlan 1'],
      },
    ],
    check: [
      ['Four switches have priority 32769 and these MACs. Which becomes root for VLAN 1?', ['0019.e8a1.2200', '0019.e8a1.1100', '00a0.c9ff.0001', '0019.e8a1.11ff'], 1, 'With equal priority, the lowest MAC wins. 0019.e8a1.1100 is lower than 0019.e8a1.11ff and 0019.e8a1.2200, and 00a0... is higher than 0019...'],
      ['A switch receives a BPDU on a port configured with PortFast and BPDU guard. What happens?', ['The port becomes the root port', 'The port moves to root-inconsistent until BPDUs stop', 'The port is put into the err-disabled state', 'PortFast is removed and the port runs normal STP'], 2, 'BPDU guard err-disables the port on any BPDU. Root-inconsistent is root guard\'s behavior, and losing PortFast is what global BPDU filter does.'],
      ['Which RSTP port role forwards traffic away from the root bridge onto a segment?', ['Root port', 'Designated port', 'Alternate port', 'Backup port'], 1, 'Each segment has one designated port that forwards onto it. The root port points toward the root; alternate and backup ports discard.'],
    ],
    related: { tickets: ['t08', 't22'], cards: ['stp'], hw: null, drill: false },
  });

  L.push({
    id: 'l2-6',
    obj: '2.6',
    domain: 'access',
    title: 'Cisco wireless architectures and AP modes',
    minutes: 13,
    caseFile:
      "Harbor Point has three kinds of Wi-Fi and nobody wrote down why. HQ has forty APs run by a controller in the server room. The Annapolis sales office has one AP someone configured by hand. And the Delaware site came with cloud-managed APs that \"just work from a website.\" Tonight you learn the three architectures and the jobs an AP can be given.",
    sections: [
      {
        h: 'Autonomous APs',
        body: [
          'An **autonomous** AP is a self-contained device: each one has its own configuration, its own SSIDs, its own security settings and its own management IP, and you log into each one separately. It bridges wireless traffic to its wired port, which is usually a **trunk** when it serves several SSIDs mapped to different VLANs.',
          'That is fine for one or two APs (the Annapolis office). At forty APs it falls apart: every change is forty logins, channel planning is manual, and roaming between APs is slow because each AP handles clients on its own.',
        ],
      },
      {
        h: 'Lightweight APs and the WLC (split-MAC)',
        body: [
          'In the **lightweight** model, APs hand most of their thinking to a **wireless LAN controller (WLC)**. Cisco calls this the **split-MAC architecture**: the 802.11 functions are divided between the AP and the controller.',
          {
            table: [
              ['Lightweight AP handles (real-time)', 'WLC handles (management)'],
              ['Sending and receiving 802.11 frames, beacons, probe responses', 'Client authentication and association decisions'],
              ['Acknowledgments and retransmissions', 'Security policy and encryption keys'],
              ['Encryption and decryption of frames over the air', 'RF management: channels and power (RRM)'],
              ['Queuing and prioritizing frames', 'Roaming between APs, QoS policy, configuration of every AP'],
            ],
          },
          'The AP and WLC talk over a **CAPWAP** tunnel (Control and Provisioning of Wireless Access Points), which works over a routed network, so the WLC can be anywhere:',
          {
            list: [
              '**Control tunnel, UDP 5246**: configuration and management. Encrypted with DTLS.',
              '**Data tunnel, UDP 5247**: client traffic, encapsulated from the AP to the WLC. DTLS encryption is optional and off by default.',
            ],
          },
          {
            svg: svg(
              640,
              170,
              'Lightweight APs in local mode tunnel client traffic over CAPWAP to the WLC, which bridges it into VLANs',
              box(20, 30, 110, 40, 'AP 1 (local)', 'ls-accf') + box(20, 100, 110, 40, 'AP 2 (local)', 'ls-accf') +
                box(220, 60, 110, 46, 'Access switch', 'ls-dev', 'access ports') +
                ln(130, 50, 220, 75) + ln(130, 120, 220, 92) +
                box(470, 60, 150, 46, 'HPL-WLC1', 'ls-goodf', 'trunk: VLAN 20,30,99') +
                ln(330, 83, 470, 83) +
                `<path d="M75 70 Q 300 0 520 60" class="ls-acc ls-dash"/>` + `<path d="M75 140 Q 300 170 520 106" class="ls-acc ls-dash"/>` +
                t(300, 22, 'CAPWAP: control UDP 5246, data UDP 5247', 'ls-sm ls-t-acc') +
                t(545, 130, 'WLC drops traffic', 'ls-sm ls-t-mut') + t(545, 144, 'into the right VLAN', 'ls-sm ls-t-mut')
            ),
          },
          'In the default **local mode**, every client frame goes through the tunnel to the WLC, which then places it into the right VLAN. That is why lightweight APs sit on plain access ports: all their VLANs ride inside CAPWAP.',
        ],
      },
      {
        h: 'Where the WLC lives',
        body: [
          {
            table: [
              ['Deployment', 'What it is', 'Typical size'],
              ['Unified (centralized)', 'A hardware appliance in the data center, such as a Catalyst 9800-40/80', 'Thousands of APs'],
              ['Cloud-based WLC', 'The WLC as a virtual machine in a private or public cloud (Catalyst 9800-CL)', 'Thousands of APs'],
              ['Embedded', 'The controller runs on a switch (Catalyst 9300/9400 family)', 'Hundreds of APs'],
              ['Embedded on an AP (EWC)', 'One AP doubles as controller for the others (formerly Mobility Express)', 'Around 100 APs'],
            ],
          },
          'Do not confuse a cloud-based WLC (a controller you run as a VM) with **cloud-managed** Wi-Fi such as **Cisco Meraki**, where the APs are managed from a vendor web dashboard. In Meraki, management and monitoring go to the cloud, but **client traffic stays local**: it does not travel to the cloud and back. That is the Delaware setup.',
        ],
      },
      {
        h: 'Lightweight AP modes',
        body: [
          'A lightweight AP can be given different jobs:',
          {
            table: [
              ['Mode', 'What the AP does'],
              ['**Local**', 'Default. Serves clients on its channel and briefly scans other channels for interference and rogues. Client traffic tunnels to the WLC'],
              ['**FlexConnect**', 'Built for branches across a WAN. Can **switch client traffic locally** to VLANs on its own switch port, and keeps serving clients if the WAN link to the WLC goes down'],
              ['**Monitor**', 'Serves no clients. Scans all channels full-time: rogue detection, location tracking, IDS'],
              ['**Sniffer**', 'Captures all 802.11 traffic on a channel and sends it to a PC running an analyzer such as Wireshark'],
              ['**Rogue detector**', 'Radios off; listens on the wired side for MAC addresses of rogue devices and clients'],
              ['**SE-Connect**', 'Spectrum analysis: dedicates the radio to measuring all RF energy, including non-Wi-Fi interference (microwaves, cameras)'],
              ['**Bridge / Mesh**', 'Builds wireless links between APs, point-to-point or mesh, to reach places without cable'],
              ['**Flex+Bridge**', 'FlexConnect behavior combined with mesh'],
            ],
          },
          { note: 'The forklift interference ticket from lesson 1.11 is a job for an AP in SE-Connect mode near aisle 14: it shows whether the problem is Wi-Fi congestion or some other device spraying RF.' },
        ],
      },
    ],
    techNotes: [
      'If APs will not join the controller, check UDP 5246 and 5247 through every firewall between them. CAPWAP is just IP traffic.',
      'At a branch with a slow WAN, FlexConnect with local switching keeps the cashiers working when the WAN drops. Local mode would take the Wi-Fi down with the WAN.',
      'Keep one AP per site in monitor mode if you can afford it. Rogue AP hunts go much faster.',
    ],
    examTraps: [
      'CAPWAP control is UDP 5246 (always DTLS-encrypted); data is UDP 5247.',
      'In local mode, client traffic goes through the WLC; FlexConnect can switch it locally.',
      'Sniffer mode sends captures to an analyzer; monitor mode only scans and reports. Neither serves clients.',
      'Meraki is cloud-managed: management in the cloud, user data stays on site.',
    ],
    tryIt: [],
    check: [
      ['A branch office has lightweight APs and a WLC at HQ. The branch must keep its Wi-Fi working if the WAN fails. Which AP mode fits?', ['Local', 'Monitor', 'FlexConnect', 'Sniffer'], 2, 'FlexConnect can authenticate and switch traffic locally and keeps serving clients if the WLC is unreachable. Local mode depends on the WLC; monitor and sniffer serve no clients.'],
      ['Which UDP port does the CAPWAP control channel use?', ['5246', '5247', '1812', '161'], 0, 'CAPWAP control is UDP 5246 and data is UDP 5247. UDP 1812 is RADIUS authentication and UDP 161 is SNMP.'],
      ['In the split-MAC architecture, which function stays on the lightweight AP?', ['Client authentication', 'Choosing channels and transmit power for the network', 'Transmitting beacons and acknowledging frames in real time', 'Roaming decisions between APs'], 2, 'Real-time 802.11 work such as beacons, probe responses and ACKs stays on the AP. Authentication, RRM and roaming are handled by the WLC.'],
    ],
    related: { tickets: [], cards: ['wifiarch'], hw: null, drill: false },
  });

  L.push({
    id: 'l2-7',
    obj: '2.7',
    domain: 'access',
    title: 'Plugging in the wireless: APs, WLC ports and LAG',
    minutes: 11,
    caseFile:
      "The new controller for HQ arrived, and the cable labels from the vendor's install guide are in a language nobody on night shift reads. The switch side is yours: which ports are trunks, which are access, what goes in the service port, and why the controller refuses to form an LACP bundle.",
    sections: [
      {
        h: 'Connecting access points',
        body: [
          'The switchport an AP plugs into depends on the AP\'s mode, because the mode decides whether VLANs arrive at the AP tagged or ride inside CAPWAP:',
          {
            table: [
              ['AP type / mode', 'Switch port', 'Why'],
              ['Lightweight, local mode', '**Access port** in the AP management VLAN', 'All client VLANs travel inside the CAPWAP tunnel to the WLC'],
              ['Lightweight, FlexConnect with local switching', '**Trunk port**', 'The AP puts each SSID\'s traffic directly onto its VLAN at the switch'],
              ['Autonomous AP with several SSIDs/VLANs', '**Trunk port**', 'No controller; the AP bridges each SSID onto its own VLAN'],
            ],
          },
          'Every AP also needs **power**, normally PoE or PoE+ from the switch (lesson 1.1), and an IP address, usually from DHCP, plus a way to find the WLC (DHCP option 43, a DNS name such as CISCO-CAPWAP-CONTROLLER, or a broadcast on the local subnet).',
          {
            cli: [
              'HPL-HQ-SW3(config)# interface gigabitethernet1/0/12',
              'HPL-HQ-SW3(config-if)# description AP-HQ-2F-07 (local mode)',
              'HPL-HQ-SW3(config-if)# switchport mode access',
              'HPL-HQ-SW3(config-if)# switchport access vlan 99',
              'HPL-HQ-SW3(config-if)# spanning-tree portfast',
            ],
          },
        ],
      },
      {
        h: 'WLC physical ports',
        body: [
          'An AireOS-style controller (the 5520/3504 family the exam GUI is based on) has these physical ports:',
          {
            list: [
              '**Service port**: out-of-band management, for reaching the controller even when the data network is broken. Connect it to a switch **access port** in a management VLAN. It does not carry client traffic.',
              '**Distribution system ports**: the main data ports, carrying CAPWAP traffic from APs and all client traffic into the wired network. Connect them to **trunk ports**, because the controller drops clients into many VLANs.',
              '**Console port**: serial access for initial setup and recovery, like any Cisco device.',
              '**Redundancy port**: connects to a second WLC for high availability (stateful switchover).',
            ],
          },
          'Logically, the WLC also has **interfaces**: the **management interface** (in-band management, and the address APs use to join), **dynamic interfaces** (one per client VLAN, which is how a WLAN maps to a VLAN), the **virtual interface** (a fake address such as 192.0.2.1 used for web authentication redirects and DHCP relay), and the **service-port interface**. On the newer Catalyst 9800, the same ideas exist with slightly different names (wireless management interface, VLAN SVIs).',
        ],
      },
      {
        h: 'LAG on the WLC',
        body: [
          'With several distribution ports, you want them bundled for bandwidth and redundancy. AireOS calls this **LAG** (link aggregation), and the catch is the exam favorite: **the WLC does not negotiate**. It supports neither LACP nor PAgP, so the switch side must be a **static** EtherChannel, `channel-group N mode on`. Configure `mode active` and the bundle will never form. (The newer **Catalyst 9800** controllers are different: they run IOS XE and support LACP and PAgP as well as static `mode on`. The "static only" rule is about AireOS.)',
          {
            cli: [
              'HPL-HQ-CORE1(config)# interface range tengigabitethernet1/1/1 - 2',
              'HPL-HQ-CORE1(config-if-range)# description HPL-WLC1 distribution ports',
              'HPL-HQ-CORE1(config-if-range)# switchport mode trunk',
              'HPL-HQ-CORE1(config-if-range)# switchport trunk allowed vlan 20,30,40,99',
              'HPL-HQ-CORE1(config-if-range)# channel-group 5 mode on',
            ],
          },
          {
            svg: svg(
              640,
              160,
              'WLC distribution ports bundled to the core switch with a static EtherChannel trunk, and the service port on an access port',
              box(30, 50, 150, 60, 'HPL-WLC1', 'ls-goodf', 'LAG enabled') +
                box(430, 30, 180, 46, 'HPL-HQ-CORE1', 'ls-dev', 'Po5 mode on, trunk') + box(430, 100, 180, 40, 'Mgmt switch', 'ls-dev', 'access VLAN 98') +
                ln(180, 62, 430, 46, 'ls-good') + ln(180, 74, 430, 58, 'ls-good') + `<ellipse cx="305" cy="60" rx="12" ry="16" class="ls-acc"/>` +
                t(305, 35, 'distribution ports: static LAG', 'ls-sm ls-t-good') +
                ln(180, 100, 430, 120, 'ls-ln ls-dash') + t(305, 125, 'service port (out of band)', 'ls-sm ls-t-mut')
            ),
          },
          'With LAG enabled, all distribution ports act as one, and the controller spreads traffic across them. Enabling or disabling LAG on an AireOS controller requires a reboot.',
        ],
      },
    ],
    techNotes: [
      'Label AP switchports with the AP name and mode. When an AP goes from local to FlexConnect, the port has to change from access to trunk too.',
      'If the service port is the only way into the controller during an outage, make sure its management network does not depend on the controller.',
      'Native VLAN on the WLC trunk: match it on both sides, or tag the management VLAN explicitly. Mismatches here strand every AP.',
    ],
    examTraps: [
      'AireOS WLC LAG uses static EtherChannel only: `mode on`. No LACP, no PAgP. (A Catalyst 9800 can also run LACP.)',
      'Local-mode lightweight APs connect to access ports; FlexConnect (local switching) and autonomous APs with multiple VLANs need trunks.',
      'The service port is for out-of-band management only; the distribution system ports carry client data.',
    ],
    tryIt: [
      {
        device: 'switch',
        mode: 'config',
        prompt: 'Practice the switch side of a WLC LAG: a static EtherChannel trunk using mode on, then look at the bundle. The bench SW2 is not configured to match, so the protocol column shows no negotiation (a dash).',
        cmds: ['interface range gi0/1 - 2', 'switchport mode trunk', 'channel-group 5 mode on', 'end', 'show etherchannel summary'],
      },
    ],
    check: [
      ['An AireOS WLC uses LAG on its distribution system ports. How must the switch EtherChannel be configured?', ['channel-group mode active', 'channel-group mode desirable', 'channel-group mode on', 'channel-group mode passive'], 2, 'AireOS WLCs do not support LACP or PAgP, so the switch must use a static EtherChannel (mode on).'],
      ['A lightweight AP in local mode serves three SSIDs mapped to three VLANs. How should its switch port be configured?', ['Trunk carrying all three VLANs', 'Access port in the AP management VLAN', 'Routed port', 'EtherChannel with the WLC'], 1, 'In local mode all client traffic rides inside the CAPWAP tunnel to the WLC, so the AP only needs an access port in its own VLAN.'],
      ['What is the WLC service port used for?', ['Carrying client traffic to the wired network', 'Out-of-band management', 'High-availability synchronization with another WLC', 'CAPWAP tunnels from APs'], 1, 'The service port is for out-of-band management. Client and CAPWAP traffic use the distribution system ports, and HA uses the redundancy port.'],
    ],
    related: { tickets: ['t09'], cards: ['wifiarch', 'etherchannel'], hw: 'ports', drill: false },
  });

  L.push({
    id: 'l2-8',
    obj: '2.8',
    domain: 'access',
    title: 'Getting into the box: console, Telnet, SSH, HTTPS and AAA',
    minutes: 16,
    caseFile:
      "An audit found that half the Harbor Point switches still accept Telnet, the passwords on the rest are shared by everyone who ever worked here, and one branch router's web interface is wide open on HTTP. You are cleaning it up tonight: SSH only, real user accounts, and a plan for central authentication.",
    sections: [
      {
        h: 'The ways in',
        body: [
          {
            table: [
              ['Method', 'Transport', 'Encrypted?', 'Use it for'],
              ['Console', 'Serial cable (RJ45 rollover or USB), 9600 baud by default', 'Physical access only', 'First setup, recovery, when the network is down'],
              ['AUX', 'Serial, often via a modem', 'No', 'Legacy out-of-band access on some routers'],
              ['Telnet', 'TCP 23', '**No**: everything, passwords included, in clear text', 'Nothing, on a production network'],
              ['SSH', 'TCP 22', 'Yes', 'All remote CLI access'],
              ['HTTP', 'TCP 80', 'No', 'Nothing: disable it'],
              ['HTTPS', 'TCP 443', 'Yes', 'Web GUI and REST APIs'],
              ['Cloud managed', 'HTTPS to a vendor dashboard', 'Yes', 'Meraki and similar: devices phone home, you manage from the web'],
            ],
          },
          'The console is **out-of-band**: it works even when every IP setting is wrong. Everything else is **in-band** and needs a working IP configuration: on a switch, that means an SVI with an address and an `ip default-gateway` (lesson 1.6).',
        ],
      },
      {
        h: 'Lock the console',
        body: [
          {
            cli: [
              'HPL-BR2-R1(config)# line console 0',
              'HPL-BR2-R1(config-line)# login local',
              'HPL-BR2-R1(config-line)# exec-timeout 10 0',
              'HPL-BR2-R1(config-line)# logging synchronous',
            ],
          },
          '`login local` checks usernames in the local database. `exec-timeout 10 0` logs an idle session out after 10 minutes, 0 seconds (`0 0` would disable the timeout, which is a bad idea). `logging synchronous` stops log messages from chopping up the command you are typing. Use `login` with a `password` under the line instead of `login local` only if you want a single shared password, which is what the audit complained about.',
        ],
      },
      {
        h: 'Configure SSH step by step',
        body: [
          {
            steps: [
              'Set a **hostname** other than the default (Router or Switch) and an **IP domain name**. The RSA key is named after them.',
              'Create **local user accounts** with `username ... secret ...` (secret stores a strong hash; avoid `password`).',
              'Generate an **RSA key pair**, at least 768 bits for SSHv2 and realistically **2048**. Generating the key enables SSH.',
              'Force **SSH version 2** (version 1 has known weaknesses).',
              'On the VTY lines, use the local database and allow **SSH only**.',
            ],
          },
          {
            cli: [
              'Router(config)# hostname HPL-BR2-R1',
              'HPL-BR2-R1(config)# ip domain name hpl.local',
              'HPL-BR2-R1(config)# username night secret Dock$ide-42',
              'HPL-BR2-R1(config)# crypto key generate rsa modulus 2048',
              'The name for the keys will be: HPL-BR2-R1.hpl.local',
              '% The key modulus size is 2048 bits',
              '% Generating 2048 bit RSA keys, keys will be non-exportable...',
              '[OK] (elapsed time was 1 seconds)',
              '%SSH-5-ENABLED: SSH 1.99 has been enabled',
              'HPL-BR2-R1(config)# ip ssh version 2',
              'HPL-BR2-R1(config)# line vty 0 15',
              'HPL-BR2-R1(config-line)# login local',
              'HPL-BR2-R1(config-line)# transport input ssh',
              'HPL-BR2-R1(config-line)# exec-timeout 10 0',
            ],
          },
          '`transport input ssh` refuses Telnet. (`transport input telnet ssh` allows both, `none` allows neither.) A common extra step is an ACL on the VTY lines (`access-class 10 in`) so only the management subnet can even try. Verify:',
          {
            cli: [
              'HPL-BR2-R1# show ip ssh',
              'SSH Enabled - version 2.0',
              'Authentication methods:publickey,keyboard-interactive,password',
              'Authentication timeout: 120 secs; Authentication retries: 3',
              'HPL-BR2-R1# show ssh',
              'Connection Version Mode Encryption  Hmac         State           Username',
              '0          2.0     IN   aes256-ctr  hmac-sha2-256 Session started night',
            ],
          },
          'From a PC, connect with `ssh -l night 10.20.2.1` (or `ssh night@10.20.2.1`).',
        ],
      },
      {
        h: 'Web management: HTTP and HTTPS',
        body: [
          'Many devices have a web GUI, and REST APIs (domain 6) also ride on HTTPS. Turn off clear-text HTTP and keep HTTPS, with local (or AAA) authentication:',
          {
            cli: [
              'HPL-BR2-R1(config)# no ip http server',
              'HPL-BR2-R1(config)# ip http secure-server',
              'HPL-BR2-R1(config)# ip http authentication local',
            ],
          },
        ],
      },
      {
        h: 'Central authentication: TACACS+ and RADIUS',
        body: [
          'Local accounts on two hundred devices do not scale: when someone leaves, you would have to delete them two hundred times. **AAA** (authentication, authorization, accounting) moves that to a central server such as Cisco ISE. The device asks the server "is this user valid, what can they do?" and reports what they did. Keep a local account as a fallback for when the server is unreachable.',
          {
            table: [
              ['', 'TACACS+', 'RADIUS'],
              ['Origin', 'Cisco (now an open spec)', 'Open standard'],
              ['Transport', 'TCP 49', 'UDP 1812 (auth) and 1813 (accounting); older 1645/1646'],
              ['Encryption', 'Entire packet body', 'Only the password'],
              ['AAA functions', 'Separates authentication, authorization and accounting', 'Combines authentication and authorization'],
              ['Typical use', '**Device administration**: per-command authorization for network admins', '**Network access**: 802.1X, Wi-Fi and VPN users'],
            ],
          },
          {
            cli: [
              'HPL-BR2-R1(config)# aaa new-model',
              'HPL-BR2-R1(config)# tacacs server HPL-ISE1',
              'HPL-BR2-R1(config-server-tacacs)# address ipv4 10.10.99.20',
              'HPL-BR2-R1(config-server-tacacs)# key Sh1ft-Key!',
              'HPL-BR2-R1(config-server-tacacs)# exit',
              'HPL-BR2-R1(config)# aaa authentication login default group tacacs+ local',
            ],
          },
          'The last line says: try TACACS+ first, and if no server answers, fall back to the local database. Configuration of AAA in depth is beyond this objective; know the two protocols and their differences (lesson 5.8 compares AAA concepts).',
        ],
      },
    ],
    techNotes: [
      'Before you type `transport input ssh` on a remote device, open a second SSH session and test it. Locking yourself out of a branch router means a drive at 4 a.m.',
      'Generate keys after setting the hostname and domain. Change either later and you need to regenerate.',
      'Always keep a local fallback account with AAA. When the ISE server is down is exactly when you need to log in.',
    ],
    examTraps: [
      'SSH needs a non-default hostname, a domain name, an RSA key, a user account and VTY login. Missing the domain name or key is the classic failure.',
      'Telnet is TCP 23 and sends passwords in clear text; SSH is TCP 22.',
      'TACACS+ uses TCP and encrypts the whole payload; RADIUS uses UDP and encrypts only the password.',
      'RADIUS combines authentication and authorization; TACACS+ keeps all three AAA functions separate.',
    ],
    tryIt: [
      {
        device: 'router',
        mode: 'config',
        prompt: 'Build SSH on the bench router from scratch. When it is done, switch to the LAB-PC1 tab and run ssh -l night 10.10.10.1, then try telnet 10.10.10.1 and watch it get refused.',
        cmds: ['ip domain-name hpl.local', 'username night secret Dock$ide-42', 'crypto key generate rsa modulus 2048', 'ip ssh version 2', 'line vty 0 15', 'login local', 'transport input ssh', 'exec-timeout 10 0', 'end', 'show ip ssh'],
      },
      {
        device: 'router',
        mode: 'config',
        prompt: 'Lock down the console line with local logins and a timeout, then read the line section of the running config.',
        cmds: ['line console 0', 'login local', 'exec-timeout 10 0', 'logging synchronous', 'end', 'show running-config'],
      },
    ],
    check: [
      ['An engineer runs crypto key generate rsa and gets an error asking for a domain name. What must be configured first?', ['ip ssh version 2', 'ip domain name (and a non-default hostname)', 'transport input ssh', 'username secret'], 1, 'The RSA key is named from the hostname and domain name, so both must exist before key generation. The other commands are needed for SSH but do not block key generation.'],
      ['Which protocol encrypts the entire body of each packet and uses TCP port 49?', ['RADIUS', 'TACACS+', 'SNMPv2c', 'Telnet'], 1, 'TACACS+ runs on TCP 49 and encrypts the whole payload. RADIUS uses UDP 1812/1813 and encrypts only the password.'],
      ['Which VTY configuration allows only SSH logins using the local user database?', ['login and transport input all', 'login local and transport input ssh', 'password and transport input telnet ssh', 'login local and transport input none'], 1, 'login local uses the username database, and transport input ssh blocks Telnet. transport input none blocks all remote access.'],
    ],
    related: { tickets: ['t14'], cards: ['ssh', 'aaa'], hw: null, drill: false },
  });

  L.push({
    id: 'l2-9',
    obj: '2.9',
    domain: 'access',
    title: 'Reading the WLC GUI: creating a WLAN, security, QoS, advanced',
    minutes: 14,
    caseFile:
      "Harbor Point is adding a voice SSID for the new Wi-Fi handsets the yard crew carries. The vendor's checklist says \"WLAN ID 3, WPA2-PSK AES, Platinum, session timeout per policy,\" and you will be the one clicking through the controller. Tonight you learn where every one of those settings lives and what it does.",
    sections: [
      {
        h: 'The pieces of a WLAN',
        body: [
          'A **WLAN** on a Cisco controller ties together an **SSID** (the name clients see), a **VLAN** (through the controller interface or interface group it maps to), a **security** policy, and a **QoS** level. The exam GUI is the classic AireOS controller interface, organized into tabs. Each WLAN gets a **profile name** (internal label), an **SSID**, and a **WLAN ID** number.',
          {
            svg: svg(
              640,
              150,
              'A WLAN ties together SSID, interface and VLAN, Layer 2 security, and a QoS profile',
              box(240, 50, 160, 50, 'WLAN 3', 'ls-accf', 'HPL-Voice') +
                box(20, 10, 160, 40, 'SSID', 'ls-box', 'HPL-Voice (broadcast)') + box(20, 100, 160, 40, 'Interface / VLAN', 'ls-box', 'voice -> VLAN 40') +
                box(460, 10, 160, 40, 'Security', 'ls-box', 'WPA2, AES, PSK') + box(460, 100, 160, 40, 'QoS', 'ls-box', 'Platinum (voice)') +
                ln(180, 30, 240, 65) + ln(180, 120, 240, 88) + ln(400, 65, 460, 30) + ln(400, 88, 460, 120)
            ),
          },
        ],
      },
      {
        h: 'Creating the WLAN and the General tab',
        body: [
          'In AireOS: **WLANs** menu > choose **Create New** > **Go**. Enter the type (WLAN), **Profile Name**, **SSID** and **ID**, then **Apply**. You land on the WLAN\'s edit page with these tabs: **General**, **Security**, **QoS**, **Policy-Mapping** and **Advanced**.',
          'On **General**:',
          {
            list: [
              '**Status: Enabled**. A new WLAN is disabled until you tick this, which is the most common "I created it but nobody sees it" mistake.',
              '**Radio Policy**: all bands, or limit the WLAN to 2.4 GHz or 5 GHz only.',
              '**Interface/Interface Group (G)**: the dynamic interface, and therefore the VLAN, where this WLAN\'s clients land. Voice goes to the `voice` interface on VLAN 40.',
              '**Broadcast SSID**: include the SSID in beacons. Hiding it is not security (lesson 1.11).',
            ],
          },
        ],
      },
      {
        h: 'The Security tab',
        body: [
          '**Security > Layer 2** is where encryption and authentication are set:',
          {
            list: [
              '**Layer 2 Security**: None (open), **WPA+WPA2**, WPA2+WPA3, WPA3, or static WEP on old versions.',
              '**WPA2 Policy** with **AES** encryption (CCMP). Leave TKIP unchecked; it is deprecated.',
              '**Authentication Key Management**: **PSK** for a shared passphrase, or **802.1X** for per-user logins against a RADIUS server. For PSK, choose the format (ASCII) and type the passphrase (8 to 63 characters).',
            ],
          },
          '**Security > Layer 3** adds **web authentication** (a captive portal, typical for guests), and **Security > AAA Servers** picks which RADIUS servers handle 802.1X and accounting. Lesson 5.10 walks through a full WPA2-PSK configuration.',
        ],
      },
      {
        h: 'The QoS tab',
        body: [
          'Each WLAN gets a QoS profile that caps how the controller and AP prioritize its traffic. Know the four names:',
          {
            table: [
              ['Profile', 'Meant for', 'Notes'],
              ['**Platinum**', 'Voice', 'Highest priority'],
              ['**Gold**', 'Video', ''],
              ['**Silver**', 'Best effort', '**The default** for new WLANs'],
              ['**Bronze**', 'Background', 'Lowest: guest or bulk traffic'],
            ],
          },
          'The QoS tab also has **WMM** (Wi-Fi Multimedia) policy: Allowed, Required or Disabled. WMM is the 802.11 prioritization scheme clients use; voice handsets need it, and 802.11n and later require it for high data rates. The yard handsets get Platinum with WMM.',
        ],
      },
      {
        h: 'The Advanced tab',
        body: [
          'A long page of options. The ones worth knowing:',
          {
            table: [
              ['Setting', 'What it does'],
              ['**Allow AAA Override**', 'Lets the RADIUS server assign the VLAN, QoS or ACL per user, overriding the WLAN defaults'],
              ['**Enable Session Timeout**', 'How long before a client must reauthenticate, in seconds (1800, or 30 minutes, by default)'],
              ['**Coverage Hole Detection**', 'Lets the controller notice clients stuck with weak signal and adjust AP power'],
              ['**Aironet IE**', 'Cisco-specific information elements in beacons and probe responses'],
              ['**Peer-to-Peer Blocking**', 'Stops clients on the same WLAN talking directly to each other (good for guests)'],
              ['**Client Exclusion**', 'Temporarily blocks clients after repeated authentication failures'],
              ['**Max Allowed Clients**', 'Caps the number of clients on the WLAN'],
              ['**DHCP Addr. Assignment Required**', 'Clients must get their address by DHCP; static addresses are refused'],
              ['**FlexConnect Local Switching**', 'For FlexConnect APs, switch this WLAN\'s traffic locally at the branch'],
              ['**Client Load Balancing / Band Select**', 'Spread clients across APs, and steer dual-band clients to 5 GHz'],
            ],
          },
          'Finally, click **Apply**. Nothing takes effect until you do, and many settings briefly disconnect clients on that WLAN.',
          { note: 'On the newer Catalyst 9800 GUI the same settings are split differently: a **WLAN profile** (SSID and security), a **policy profile** (VLAN, QoS, session timeout, AAA override) and **tags** that apply both to APs. Same ideas, different screens.' },
        ],
      },
    ],
    techNotes: [
      'New WLAN invisible? Check, in order: Status Enabled, Broadcast SSID, the radio policy, and that the APs are in an AP group that includes the WLAN.',
      'Session timeout too short on voice SSIDs causes calls to drop at every reauthentication. Match the vendor\'s recommendation for the handsets.',
      'Write the PSK in your password manager before you click Apply, not after.',
    ],
    examTraps: [
      'Silver is the default QoS profile. Platinum is voice, Gold video, Bronze background.',
      'The VLAN for a WLAN comes from the interface (or interface group) chosen on the General tab, not from the Security tab.',
      'A newly created WLAN is disabled until Status is set to Enabled.',
      'PSK and 802.1X are both choices under Layer 2 Authentication Key Management; web auth is Layer 3.',
    ],
    tryIt: [],
    check: [
      ['On an AireOS WLC, which QoS profile should a WLAN for Wi-Fi voice handsets use?', ['Bronze', 'Silver', 'Gold', 'Platinum'], 3, 'Platinum is intended for voice. Gold is video, Silver is best effort (the default), and Bronze is background.'],
      ['Where on the WLAN edit page do you choose the VLAN that clients are placed into?', ['Security > Layer 2', 'General > Interface/Interface Group', 'QoS > WMM Policy', 'Advanced > Session Timeout'], 1, 'The General tab maps the WLAN to a controller interface or interface group, which determines the VLAN. AAA override can change it per user, but the default is set on General.'],
      ['Which Advanced tab setting lets a RADIUS server assign a different VLAN to a specific user?', ['Peer-to-Peer Blocking', 'Coverage Hole Detection', 'Allow AAA Override', 'Client Exclusion'], 2, 'Allow AAA Override lets attributes from the AAA server replace the WLAN\'s defaults, such as VLAN or QoS. The others block client-to-client traffic, adjust power, or block failing clients.'],
    ],
    related: { tickets: [], cards: ['wificfg', 'wifisec'], hw: null, drill: false },
  });

  for (const l of L) TT.lessons.push(l);
})(globalThis);
