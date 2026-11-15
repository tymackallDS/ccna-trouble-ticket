/* Trouble Ticket — lessons, part 2.
 * Exam domains 3.0 IP Connectivity, 4.0 IP Services, 5.0 Security Fundamentals,
 * 6.0 Automation and Programmability (CCNA 200-301 v1.1 objectives 3.1-6.7).
 * All text is original. Lesson format is shared with src/lessons-1.js.
 */
(function (G) {
  'use strict';
  const TT = (G.TT = G.TT || {});
  TT.lessons = TT.lessons || [];
  const L = [];

  /* ================================================================ *
   * 3.0 IP CONNECTIVITY
   * ================================================================ */

  L.push({
    id: 'l3-1',
    obj: '3.1',
    domain: 'ipconn',
    title: 'Reading the routing table like a shipping manifest',
    minutes: 14,
    caseFile: "Dana Okafor, the day-shift lead, left a printout of `show ip route` from HPL-CORE taped to your monitor with one word on it: \"Explain.\" Half the routes start with an O, one starts with S*, and there are numbers in brackets nobody on day shift will admit to understanding. Tonight you learn to read every column.",
    sections: [
      {
        h: 'What the routing table is',
        body: [
          "A router forwards packets by looking up the destination IP address in its **routing table**. Each line is one route: a destination prefix plus instructions for where to send matching packets. Think of it as Harbor Point's dispatch board: destination, which truck, which dock door, and how much the trip costs.",
          "The table is built from three sources: networks the router is directly connected to, routes you typed in by hand (static), and routes learned from a routing protocol such as OSPF. You view it with `show ip route` (IPv4) or `show ipv6 route` (IPv6).",
        ],
      },
      {
        h: 'A real table, line by line',
        body: [
          { cli: [
            'HPL-CORE# show ip route',
            'Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP',
            '       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area',
            '       N1 - OSPF NSSA external type 1, N2 - OSPF NSSA external type 2',
            '       E1 - OSPF external type 1, E2 - OSPF external type 2',
            '       i - IS-IS, L1 - IS-IS level-1, L2 - IS-IS level-2',
            '       * - candidate default, U - per-user static route',
            '',
            'Gateway of last resort is 203.0.113.1 to network 0.0.0.0',
            '',
            'S*    0.0.0.0/0 [1/0] via 203.0.113.1',
            '      10.0.0.0/8 is variably subnetted, 4 subnets, 3 masks',
            'C        10.1.12.0/30 is directly connected, GigabitEthernet0/1',
            'L        10.1.12.2/32 is directly connected, GigabitEthernet0/1',
            'O        10.1.30.0/24 [110/2] via 10.1.12.1, 00:41:07, GigabitEthernet0/1',
            'D        10.1.40.0/24 [90/3072] via 10.1.12.1, 00:12:55, GigabitEthernet0/1',
            '      203.0.113.0/24 is variably subnetted, 2 subnets, 2 masks',
            'C        203.0.113.0/30 is directly connected, GigabitEthernet0/0',
            'L        203.0.113.2/32 is directly connected, GigabitEthernet0/0',
          ] },
          "Take the OSPF line apart from left to right:",
          { table: [
            ['Piece', 'Example', 'Meaning'],
            ['Protocol code', '`O`', 'How the route was learned. O = OSPF, D = EIGRP, S = static, C = connected, L = local.'],
            ['Prefix', '`10.1.30.0`', 'The destination network address.'],
            ['Mask / prefix length', '`/24`', 'How many leading bits must match. Written as CIDR.'],
            ['Administrative distance', '`[110/...]`', 'First number in brackets: how much the router trusts the source. Lower wins.'],
            ['Metric', '`[.../2]`', 'Second number: the protocol\'s own cost to reach the prefix. Lower wins within one protocol.'],
            ['Next hop', '`via 10.1.12.1`', 'The neighbor router to hand the packet to.'],
            ['Age', '`00:41:07`', 'How long since the route was learned (dynamic routes only).'],
            ['Exit interface', '`GigabitEthernet0/1`', 'The local interface the packet leaves through.'],
          ] },
        ],
      },
      {
        h: 'Connected and local routes',
        body: [
          "When you give an interface an IP address and it comes up/up, IOS adds two routes. The **C** route is the whole subnet (10.1.12.0/30): \"anything in here is on my wire.\" The **L** route is a /32 for the interface's own address (10.1.12.2/32): \"this one is me.\" Local routes let the router recognize packets addressed to itself. Neither has a next hop; they say `is directly connected` instead.",
          { note: "If an interface is down or administratively shut, its C and L routes vanish. A missing connected route is often the first clue that a cable or a `shutdown` is the real problem, not routing." },
        ],
      },
      {
        h: 'Administrative distance: the trust ranking',
        body: [
          "If two different sources offer a route to the exact same prefix, the router installs the one with the lowest **administrative distance (AD)**. Memorize these defaults:",
          { table: [
            ['Source', 'Default AD'],
            ['Connected', '0'],
            ['Static', '1'],
            ['eBGP', '20'],
            ['EIGRP (internal)', '90'],
            ['OSPF', '110'],
            ['IS-IS', '115'],
            ['RIP', '120'],
            ['EIGRP external', '170'],
            ['iBGP', '200'],
            ['Unusable (never installed)', '255'],
          ] },
          "The **metric** only compares routes from the same protocol. OSPF uses cost (reference bandwidth divided by interface bandwidth), EIGRP uses a composite of bandwidth and delay, RIP uses hop count. You cannot compare an OSPF cost of 2 with an EIGRP metric of 3072; AD settles that fight first.",
        ],
      },
      {
        h: 'The gateway of last resort',
        body: [
          "The line `Gateway of last resort is 203.0.113.1 to network 0.0.0.0` means the router has a **default route**: 0.0.0.0/0 matches every destination, so anything without a better match goes there. The `*` next to `S*` marks it as the candidate default. If the router has no default route you see `Gateway of last resort is not set`, and packets with no matching route are dropped (the router may send an ICMP unreachable back).",
          { svg: '<svg viewBox="0 0 360 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Anatomy of an OSPF routing table entry" font-size="13" fill="currentColor"><text x="6" y="70" font-family="monospace" font-size="13">O 10.1.30.0/24 [110/2] via 10.1.12.1, Gi0/1</text><g fill="none" stroke="currentColor"><path d="M10 76v22M40 76v52M102 76v22M134 76v52M156 76v82M232 76v22M322 76v52"/></g><text x="4" y="112">code</text><text x="26" y="142">prefix</text><text x="88" y="112">mask</text><text x="124" y="142">AD</text><text x="140" y="172">metric</text><text x="206" y="112">next hop</text><text x="296" y="142">exit if</text><text x="6" y="30" font-weight="bold">One route, eight facts</text></svg>' },
        ],
      },
      {
        h: 'Other things you will see',
        body: [
          { list: [
            "`10.0.0.0/8 is variably subnetted, 4 subnets, 3 masks` is a parent header line. It is not a route itself; it groups the child routes below it that share a classful major network.",
            "`O IA` is an OSPF inter-area route, `O E2` an external route redistributed into OSPF. Single-area CCNA labs mostly show plain `O`.",
            "Two lines under one prefix with different `via` addresses means **equal-cost multipath (ECMP)**: the router load-shares across both next hops.",
            "A static route to an exit interface shows `is directly connected, GigabitEthernet0/0` even though it is an S route.",
          ] },
        ],
      },
    ],
    techNotes: [
      "Dana's rule: read the codes legend once, then ignore it. You only need C, L, S, O, D and the asterisk 99 percent of the time.",
      "`show ip route 10.1.30.25` asks the router which entry it would use for that one address. Faster than eyeballing a 400-line table.",
      "`show ip route ospf` or `show ip route static` filters the table to one source when you are hunting.",
    ],
    examTraps: [
      "The first bracket number is AD, the second is metric. Questions love swapping them.",
      "A local (L) route is always /32 for IPv4 and /128 for IPv6, even if the interface is on a /24.",
      "Gateway of last resort is not a protocol; it is whatever default route won. It can come from a static route, OSPF or DHCP.",
      "The parent line ('is variably subnetted') is not counted as a usable route.",
    ],
    tryIt: [
      { device: 'router', mode: 'priv', prompt: "Read the table on this router. Find each connected (C) and local (L) pair and match them to the interfaces in the brief output.", cmds: ['show ip route', 'show ip interface brief'] },
    ],
    check: [
      ['In the entry `O 10.1.30.0/24 [110/2] via 10.1.12.1`, what does 110 represent?', ['The OSPF cost', 'The administrative distance', 'The number of hops', 'The OSPF process ID'], 1, "The first number in brackets is administrative distance; OSPF defaults to 110. The second number (2) is the OSPF cost metric. Hop count is RIP's metric and the process ID never appears in the route line."],
      ['A router shows `L 192.168.5.1/32 is directly connected, GigabitEthernet0/2`. What is this entry?', ['A host route learned by OSPF', 'A static route typed by an admin', "The router's own interface address", 'A route to a loopback on a neighbor'], 2, "L routes are local routes: the /32 address of one of the router's own interfaces. IOS adds them automatically alongside the C route for the subnet."],
      ['Which line tells you the router will forward packets for unknown destinations to 198.51.100.1?', ['C 198.51.100.0/30 is directly connected', 'Gateway of last resort is 198.51.100.1 to network 0.0.0.0', 'L 198.51.100.2/32 is directly connected', 'Gateway of last resort is not set'], 1, "The gateway of last resort line names the next hop of the default route 0.0.0.0/0. The C and L lines only describe the connected link, and 'not set' means there is no default route."],
    ],
    related: { tickets: ['t05', 't06'], cards: ['rtable'], hw: null, drill: false },
  });

  L.push({
    id: 'l3-2',
    obj: '3.2',
    domain: 'ipconn',
    title: 'How a router picks a road: longest match first',
    minutes: 13,
    caseFile: "A pallet scanner at 10.1.30.77 keeps sending its data the long way, through the backup link, and Marcus in the warehouse wants to know if the router \"is broken or just stubborn.\" The router has three routes that all match that address. Tonight you find out which one it picks, and why it is never stubborn, only literal.",
    sections: [
      {
        h: 'The three tie-breakers, in order',
        body: [
          "A router does not pick the first route it finds or the cheapest one overall. It applies three rules, strictly in this order:",
          { list: [
            "**1. Longest prefix match.** Among all routes that contain the destination address, pick the one with the longest prefix (the most specific). A /27 beats a /24 beats a /16 beats a /0. This is a lookup rule; it happens on every packet.",
            "**2. Administrative distance.** Only for routes to the *same* prefix and length from different sources. Lowest AD gets installed in the routing table.",
            "**3. Metric.** Only for routes to the same prefix from the *same* protocol. Lowest metric gets installed. Equal metrics can both be installed (ECMP).",
          ] },
          { note: "Rules 2 and 3 decide what goes into the routing table. Rule 1 decides which table entry a given packet uses. A /24 static route never 'beats' a /27 OSPF route, because they are different prefixes; both get installed and the /27 wins lookups for the addresses inside it." },
        ],
      },
      {
        h: 'Longest prefix match, worked through',
        body: [
          "Suppose HPL-CORE has these entries and a packet arrives for **10.1.30.77**:",
          { cli: [
            'S*    0.0.0.0/0 [1/0] via 203.0.113.1',
            'O        10.1.0.0/16 [110/20] via 10.1.13.1, 00:05:44, GigabitEthernet0/2',
            'S        10.1.30.0/24 [1/0] via 10.1.12.1',
            'O        10.1.30.64/27 [110/3] via 10.1.14.1, 00:05:44, GigabitEthernet0/3',
          ] },
          "Check each one: does 10.1.30.77 fall inside it?",
          { table: [
            ['Route', 'Range', 'Contains .77?', 'Prefix length'],
            ['0.0.0.0/0', 'everything', 'yes', '0'],
            ['10.1.0.0/16', '10.1.0.0 - 10.1.255.255', 'yes', '16'],
            ['10.1.30.0/24', '10.1.30.0 - 10.1.30.255', 'yes', '24'],
            ['10.1.30.64/27', '10.1.30.64 - 10.1.30.95', 'yes', '27'],
          ] },
          "All four match. The /27 is the longest, so the packet goes to 10.1.14.1 out Gi0/3, even though the static /24 has a better AD. That is exactly Marcus's problem: someone added a /27 on the backup path, and it is more specific than the primary /24.",
          { svg: '<svg viewBox="0 0 360 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Nested prefixes, the most specific wins" font-size="13" fill="currentColor"><rect x="6" y="20" width="348" height="172" rx="6" fill="none" stroke="currentColor" stroke-dasharray="4 3"/><text x="14" y="38">0.0.0.0/0</text><rect x="22" y="48" width="316" height="134" rx="6" fill="none" stroke="currentColor"/><text x="30" y="66">10.1.0.0/16</text><rect x="40" y="76" width="280" height="96" rx="6" fill="none" stroke="currentColor"/><text x="48" y="94">10.1.30.0/24</text><rect x="62" y="104" width="236" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="2.5" style="stroke:var(--accent)"/><text x="72" y="124" font-weight="bold">10.1.30.64/27  WINS</text><circle cx="250" cy="142" r="5"/><text x="140" y="148">10.1.30.77</text><text x="14" y="14" font-size="12">Every box contains the address; the smallest box is chosen</text></svg>' },
        ],
      },
      {
        h: 'Administrative distance in action',
        body: [
          "Now suppose the router learns **10.1.40.0/24** from both OSPF (AD 110) and EIGRP (AD 90). Same prefix, same length, so longest match cannot separate them. AD decides: EIGRP's route is installed and OSPF's is kept in the OSPF database as a backup. If the EIGRP route disappears, the OSPF one is installed automatically.",
          "This is the trick behind a **floating static route**: give a static route an AD higher than the dynamic protocol (for example `ip route 10.1.40.0 255.255.255.0 10.9.9.1 115`). It stays out of the table until OSPF loses the route. More on that in [lesson 3.3](#learn-l3-3).",
        ],
      },
      {
        h: 'Metric in action',
        body: [
          "If OSPF finds two paths to 10.1.50.0/24, one with cost 3 and one with cost 12, only the cost-3 path is installed. If both had cost 3, both are installed and traffic is shared. OSPF and EIGRP each do equal-cost load balancing across 4 paths by default on most IOS releases (configurable with `maximum-paths`).",
          { cli: [
            'HPL-CORE# show ip route 10.1.50.0',
            'Routing entry for 10.1.50.0/24',
            '  Known via "ospf 1", distance 110, metric 3, type intra area',
            '  Last update from 10.1.13.1 on GigabitEthernet0/2, 00:02:10 ago',
            '  Routing Descriptor Blocks:',
            '  * 10.1.12.1, from 3.3.3.3, 00:02:10 ago, via GigabitEthernet0/1',
            '      Route metric is 3, traffic share count is 1',
            '    10.1.13.1, from 3.3.3.3, 00:02:10 ago, via GigabitEthernet0/2',
            '      Route metric is 3, traffic share count is 1',
          ] },
        ],
      },
      {
        h: 'Exam method',
        body: [
          "When a question lists a routing table and an address, do it mechanically: convert the interesting octet to binary if you have to, list every route that contains the address, pick the longest prefix. Do not look at AD or metric unless two candidates have the identical prefix and length. Most wrong answers on the exam are routes with a better AD but a shorter prefix.",
        ],
      },
    ],
    techNotes: [
      "Before you blame a routing protocol, run `show ip route <address>`. It tells you exactly which entry wins for that host, which saves arguments with the warehouse.",
      "A /32 host route beats everything. Somebody's 'temporary' host route from three years ago is a classic night-shift mystery.",
      "Remember the return path. Longest match applies at every hop in both directions.",
    ],
    examTraps: [
      "Wrong: the route with the lowest AD always wins. Right: AD only compares routes to the identical prefix and length.",
      "Wrong: a default route is used only when the link is up. Right: it is used for any destination that no more specific route matches, as long as it is in the table.",
      "Metric never compares routes from different protocols.",
    ],
    tryIt: [
      { device: 'router', mode: 'config', prompt: "Add a broad route and a more specific one to the same area, then look at the table. Both are installed because they are different prefixes. (If the next hop is not on a connected subnet, IOS keeps the route out of the table: that is a lesson too.)", cmds: ['ip route 10.50.0.0 255.255.0.0 192.168.1.2', 'ip route 10.50.8.0 255.255.255.0 192.168.1.3', 'end', 'show ip route'] },
    ],
    check: [
      ['A router has `O 172.16.0.0/16 [110/5]`, `S 172.16.4.0/24 [1/0]` and `D 172.16.4.0/26 [90/3072]`. Which is used for 172.16.4.10?', ['The OSPF /16, because its metric is lowest', 'The static /24, because its AD is lowest', 'The EIGRP /26, because it is the longest prefix match', 'All three, load balanced'], 2, "172.16.4.10 falls inside all three, so longest prefix match picks the /26. AD and metric only break ties between identical prefixes."],
      ['OSPF and EIGRP both advertise 10.8.8.0/24 to a router with default settings. Which is installed?', ['OSPF, because cost is lower than EIGRP metric', 'EIGRP, because its AD of 90 is lower than OSPF 110', 'Both, as equal-cost paths', 'Neither until one is redistributed'], 1, "Same prefix and length from two sources: administrative distance decides, and internal EIGRP (90) beats OSPF (110). Metrics from different protocols are never compared."],
      ['Which statement about the metric is true?', ['It is compared before administrative distance', 'It compares routes from the same routing protocol only', 'It is the same value for every protocol', 'It decides between a /24 and a /25'], 1, "Metric is the protocol's internal measure, so it only ranks routes that protocol learned for the same prefix. Prefix length is checked first, then AD, then metric."],
    ],
    related: { tickets: ['t05', 't06'], cards: ['rtable', 'dynrouting'], hw: null, drill: true },
  });

  L.push({
    id: 'l3-3',
    obj: '3.3',
    domain: 'ipconn',
    title: 'Static routes: hand-drawn maps that never lie (or update)',
    minutes: 16,
    caseFile: "Harbor Point just opened a cold-storage annex in Curtis Bay with one router, HPL-ANNEX, and one link back to HQ. Priya from procurement asks why it needs \"a whole routing protocol for one road.\" She is right: tonight you build the annex with static routes for IPv4 and IPv6, plus a floating backup over the LTE link.",
    sections: [
      {
        h: 'Why static routes exist',
        body: [
          "A static route is a route you configure by hand. It has an AD of 1, uses no CPU or bandwidth for updates, and does exactly what you typed, forever. That is the good news and the bad news: if the path changes, the static route does not notice (unless its next hop or exit interface goes down).",
          "Use static routes for **stub networks** (one way in and out, like the annex), for a **default route** to the internet, for a specific **host route**, and as a **floating backup** to a dynamic protocol.",
        ],
      },
      {
        h: 'IPv4 syntax',
        body: [
          { cli: [
            'ip route <prefix> <mask> <next-hop-ip>                 ! recursive, next hop only',
            'ip route <prefix> <mask> <exit-interface>              ! directly attached',
            'ip route <prefix> <mask> <exit-interface> <next-hop>   ! fully specified',
            'ip route <prefix> <mask> <next-hop> <AD>               ! floating static',
          ] },
          { table: [
            ['Kind', 'Example', 'Notes'],
            ['Network route', '`ip route 10.20.0.0 255.255.255.0 10.9.0.1`', 'Reaches one remote subnet.'],
            ['Default route', '`ip route 0.0.0.0 0.0.0.0 10.9.0.1`', 'Matches everything; appears as S* and sets the gateway of last resort.'],
            ['Host route', '`ip route 10.20.0.50 255.255.255.255 10.9.0.1`', '/32: one single address. Beats every shorter prefix.'],
            ['Floating static', '`ip route 10.20.0.0 255.255.255.0 10.99.0.1 200`', 'AD 200 keeps it out of the table until the better route disappears.'],
          ] },
          "With a next-hop-only route the router must do a second (recursive) lookup to find the exit interface for the next hop. With an exit interface only, the router treats the destination as if it were directly connected; on Ethernet this makes it ARP for every destination, which only works if the neighbor does proxy ARP. On Ethernet, prefer next hop, or exit interface plus next hop.",
        ],
      },
      {
        h: 'Building the annex',
        body: [
          { svg: '<svg viewBox="0 0 360 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Annex topology with primary fiber link and backup LTE link" font-size="13" fill="currentColor"><g fill="none" stroke="currentColor" stroke-width="1.5"><rect x="20" y="60" width="90" height="40" rx="6"/><rect x="250" y="60" width="90" height="40" rx="6"/><path d="M110 72h140"/><path d="M110 90c40 50 100 50 140 0" stroke-dasharray="6 4"/></g><text x="34" y="85">HPL-HQ</text><text x="258" y="85">HPL-ANNEX</text><text x="128" y="64">10.9.0.0/30 fiber</text><text x="128" y="150">10.99.0.0/30 LTE</text><text x="20" y="40">10.10.0.0/16</text><text x="250" y="40">10.20.0.0/24</text><text x="20" y="125">.1 / .1</text><text x="290" y="125">.2 / .2</text></svg>' },
          "On HPL-ANNEX everything not local goes to HQ, so one default route does it. The floating default over LTE uses AD 5:",
          { cli: [
            'HPL-ANNEX(config)# ip route 0.0.0.0 0.0.0.0 10.9.0.1',
            'HPL-ANNEX(config)# ip route 0.0.0.0 0.0.0.0 10.99.0.1 5',
          ] },
          "On HPL-HQ, one network route points at the annex LAN, plus a floating copy:",
          { cli: [
            'HPL-HQ(config)# ip route 10.20.0.0 255.255.255.0 10.9.0.2',
            'HPL-HQ(config)# ip route 10.20.0.0 255.255.255.0 10.99.0.2 5',
            'HPL-HQ(config)# end',
            'HPL-HQ# show ip route static',
            '      10.0.0.0/8 is variably subnetted, 6 subnets, 3 masks',
            'S        10.20.0.0/24 [1/0] via 10.9.0.2',
          ] },
          "Only the AD 1 route shows. The AD 5 route waits. If the fiber interface goes down, the AD 1 route is withdrawn and the floating route is installed as `[5/0] via 10.99.0.2`.",
          { note: "A floating static only takes over when the primary route leaves the table. If the fiber stays up/up but the far side dies (say, a provider switch in the middle fails), a plain static route stays installed and traffic blackholes. Real networks add IP SLA tracking for that; the CCNA just wants the AD idea." },
        ],
      },
      {
        h: 'IPv6 static routes',
        body: [
          "Same idea, different command. You must enable IPv6 routing first with `ipv6 unicast-routing`, or the router will not forward IPv6 at all.",
          { cli: [
            'HPL-HQ(config)# ipv6 unicast-routing',
            'HPL-HQ(config)# ipv6 route 2001:db8:20::/64 2001:db8:9::2                ! network',
            'HPL-HQ(config)# ipv6 route ::/0 2001:db8:ff::1                           ! default (to the ISP)',
            'HPL-HQ(config)# ipv6 route 2001:db8:20::50/128 2001:db8:9::2             ! host',
            'HPL-HQ(config)# ipv6 route 2001:db8:20::/64 2001:db8:99::2 5             ! floating',
            'HPL-HQ(config)# ipv6 route 2001:db8:20::/64 GigabitEthernet0/1 FE80::2   ! link-local next hop',
          ] },
          "If the next hop is a **link-local** address (FE80::/10), you must also give the exit interface, because the same link-local address can exist on every link. A link-local next hop alone is rejected.",
          { cli: [
            'HPL-HQ# show ipv6 route static',
            'IPv6 Routing Table - default - 6 entries',
            'Codes: C - Connected, L - Local, S - Static, U - Per-user Static route',
            '       O - OSPF Intra, OI - OSPF Inter, OE1 - OSPF ext 1, OE2 - OSPF ext 2',
            'S   ::/0 [1/0]',
            '     via 2001:DB8:FF::1',
            'S   2001:DB8:20::/64 [1/0]',
            '     via 2001:DB8:9::2',
          ] },
        ],
      },
      {
        h: 'Verification checklist',
        body: [
          { list: [
            "`show ip route` / `show ipv6 route`: is the S entry there? If not, is the next hop reachable through a connected route?",
            "`ping` the remote LAN from the router, then from a PC. Every ping needs a route **there and back**.",
            "`show running-config | include ip route` to spot typos in the mask or next hop.",
          ] },
        ],
      },
    ],
    techNotes: [
      "Typo check: IOS accepts a next hop it cannot reach without complaining; it just keeps the route out of the table until some other route (connected or otherwise) resolves that next hop. If the route is in the config but not the table, check the next hop first.",
      "Write the floating route at the same time as the primary. Nobody remembers at 3 a.m. during the outage.",
      "On IPv6 the most common silent failure is forgetting `ipv6 unicast-routing`. The interfaces get addresses and look fine, the router just will not route.",
    ],
    examTraps: [
      "A floating static needs an AD **higher** than the route it backs up, not lower.",
      "`ip route 0.0.0.0 0.0.0.0 ...` is the IPv4 default; `ipv6 route ::/0 ...` is the IPv6 default. Watch for `::/128` or `0.0.0.0 255.255.255.255` as distractors.",
      "A link-local IPv6 next hop requires the exit interface too.",
      "Static routes have AD 1, not 0. Connected routes are 0.",
    ],
    tryIt: [
      { device: 'router', mode: 'config', prompt: "Build a default route, a host route and a floating backup, then see which ones make it into the table and with what AD.", cmds: ['ip route 0.0.0.0 0.0.0.0 192.168.1.2', 'ip route 10.20.0.50 255.255.255.255 192.168.1.2', 'ip route 10.20.0.0 255.255.255.0 192.168.1.3 5', 'end', 'show ip route'] },
      { device: 'router', mode: 'config', prompt: "Turn on IPv6 routing and add an IPv6 default route.", cmds: ['ipv6 unicast-routing', 'ipv6 route ::/0 2001:db8:9::1', 'end', 'show ipv6 route'] },
    ],
    check: [
      ['Which command creates a floating static default route that backs up an OSPF-learned default route?', ['ip route 0.0.0.0 0.0.0.0 10.1.1.1 1', 'ip route 0.0.0.0 0.0.0.0 10.1.1.1 100', 'ip route 0.0.0.0 0.0.0.0 10.1.1.1 120', 'ip route 0.0.0.0 255.255.255.255 10.1.1.1 120'], 2, "To float behind OSPF (AD 110) the static route needs an AD above 110, so 120 works. AD 1 or 100 would beat OSPF and be installed immediately, and the last option has a host mask, not a default route."],
      ['An engineer enters `ipv6 route 2001:db8:5::/64 fe80::1` and IOS rejects it. Why?', ['IPv6 static routes cannot use a next hop', 'A link-local next hop also needs an exit interface', 'The prefix length must be /128', 'ipv6 unicast-routing must use a link-local address'], 1, "Link-local addresses are only unique per link, so the router needs to know which interface to use: `ipv6 route 2001:db8:5::/64 g0/0 fe80::1`."],
      ['Which route is a host route?', ['ip route 10.0.0.0 255.0.0.0 10.9.0.1', 'ip route 10.4.4.4 255.255.255.255 10.9.0.1', 'ipv6 route ::/0 2001:db8::1', 'ip route 0.0.0.0 0.0.0.0 g0/0'], 1, "A host route matches exactly one address: a /32 mask in IPv4 or /128 in IPv6. The others are a network route and two default routes."],
    ],
    related: { tickets: ['t05', 't13'], cards: ['static', 'ipv6route'], hw: null, drill: false },
  });

  L.push({
    id: 'l3-4',
    obj: '3.4',
    domain: 'ipconn',
    title: 'OSPF: the gossip network',
    minutes: 22,
    caseFile: "HPL-DC, HPL-HQ and HPL-CORE all share a single Ethernet segment, and last week the wrong router became the designated router after a reboot: the tiny lab router under Kenji's desk. Tonight you learn how OSPF neighbors meet, gossip their link states, and elect a DR, so you can make sure the lab router never wins again.",
    sections: [
      {
        h: 'What OSPF is',
        body: [
          "OSPF (Open Shortest Path First) is a **link-state** interior routing protocol. Every router in an area builds an identical map of the area (the link-state database, LSDB) from small announcements called **LSAs**, then runs Dijkstra's shortest path first algorithm on that map to pick its best routes. Compare that to distance-vector protocols, which just pass along \"I can reach X at cost Y\" without a full map.",
          "OSPFv2 is for IPv4 (OSPFv3 handles IPv6). AD is 110. The metric is **cost**: reference bandwidth (100 Mbps by default) divided by interface bandwidth, so FastEthernet and anything faster all cost 1 unless you raise the reference with `auto-cost reference-bandwidth`. The CCNA covers **single-area** OSPF: everything in area 0, the backbone.",
          "OSPF talks directly over IP (protocol 89) using multicast **224.0.0.5** (all OSPF routers) and **224.0.0.6** (DR and BDR only).",
        ],
      },
      {
        h: 'Enabling OSPF: two ways',
        body: [
          "**Network statements** under the process. The wildcard mask says which interface addresses to match; any interface whose IP falls in the range gets OSPF enabled and its subnet advertised.",
          { cli: [
            'HPL-CORE(config)# router ospf 1',
            'HPL-CORE(config-router)# router-id 2.2.2.2',
            'HPL-CORE(config-router)# network 10.1.12.0 0.0.0.3 area 0      ! exactly 10.1.12.0-3',
            'HPL-CORE(config-router)# network 192.168.50.1 0.0.0.0 area 0   ! exactly one interface',
            'HPL-CORE(config-router)# network 10.0.0.0 0.255.255.255 area 0  ! every 10.x interface',
            'HPL-CORE(config-router)# passive-interface GigabitEthernet0/2',
          ] },
          "**Interface configuration**, which is clearer and overrides network statements:",
          { cli: [
            'HPL-CORE(config)# interface GigabitEthernet0/1',
            'HPL-CORE(config-if)# ip ospf 1 area 0',
          ] },
          "The process ID (the `1` in `router ospf 1`) is locally significant: neighbors do not need matching process IDs. The **area** must match. A **passive interface** still has its subnet advertised but sends no hellos, so no neighbor can form there. Use it on LAN ports facing PCs.",
          { note: "A network statement does not mean 'advertise exactly this prefix'. It means 'run OSPF on interfaces whose address matches'. The advertised prefix comes from the interface's actual mask." },
        ],
      },
      {
        h: 'Router ID: how each router names itself',
        body: [
          "Every OSPF router needs a unique 32-bit router ID (RID), written like an IPv4 address. IOS picks it in this order:",
          { list: [
            "1. The `router-id` command under `router ospf`.",
            "2. Otherwise, the **highest IP address on an up loopback** interface.",
            "3. Otherwise, the **highest IP address on an up physical** interface.",
          ] },
          "The RID is chosen when the process starts. If you change it later, IOS warns you and keeps the old one until you run `clear ip ospf process` (or reload):",
          { cli: [
            'HPL-CORE(config-router)# router-id 2.2.2.2',
            '% OSPF: Reload or use "clear ip ospf process" command, for this to take effect',
            'HPL-CORE(config-router)# end',
            'HPL-CORE# clear ip ospf process',
            'Reset ALL OSPF processes? [no]: yes',
          ] },
          "Two routers with the same RID will not become proper neighbors and log duplicate router ID errors.",
        ],
      },
      {
        h: 'Becoming neighbors: the states',
        body: [
          "Routers send **hello** packets out every OSPF interface (every 10 seconds on Ethernet; dead interval 40 seconds). To become neighbors, their hellos must agree on: **area ID**, **subnet and mask**, **hello and dead timers**, **authentication**, and **stub area flag**. They also need unique RIDs, and the MTU must match or they stall in ExStart/Exchange.",
          { table: [
            ['State', 'What is happening'],
            ['Down', 'No hellos heard yet.'],
            ['Init', 'A hello arrived, but it does not list my RID yet.'],
            ['2-Way', 'Each router sees its own RID in the other\'s hello. On broadcast segments the DR/BDR election happens here.'],
            ['ExStart', 'The pair decides who is master (higher RID) for the database exchange.'],
            ['Exchange', 'They swap database descriptions (DBDs): summaries of what each has.'],
            ['Loading', 'They request (LSR) and send (LSU) the LSAs the other is missing.'],
            ['Full', 'Databases are identical. Adjacency complete.'],
          ] },
          { svg: '<svg viewBox="0 0 360 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="OSPF neighbor states from Down to Full" font-size="12" fill="currentColor"><g fill="none" stroke="currentColor"><rect x="4" y="20" width="44" height="26" rx="4"/><rect x="56" y="20" width="44" height="26" rx="4"/><rect x="108" y="20" width="50" height="26" rx="4"/><rect x="4" y="76" width="62" height="26" rx="4"/><rect x="76" y="76" width="70" height="26" rx="4"/><rect x="156" y="76" width="64" height="26" rx="4"/><rect x="230" y="76" width="50" height="26" rx="4" stroke-width="2.5" style="stroke:var(--accent)"/><path d="M48 33h8M100 33h8M130 46L36 76M66 89h10M146 89h10M220 89h10"/></g><text x="10" y="38">Down</text><text x="63" y="38">Init</text><text x="112" y="38">2-Way</text><text x="8" y="94">ExStart</text><text x="80" y="94">Exchange</text><text x="162" y="94">Loading</text><text x="240" y="94">Full</text><text x="172" y="30">hellos</text><text x="172" y="46">DR election here</text><text x="292" y="86">LSDBs</text><text x="292" y="100">match</text></svg>' },
        ],
      },
      {
        h: 'Network types: broadcast vs point-to-point',
        body: [
          "On a **broadcast** network type (the default on Ethernet), many routers can share a segment. If every router formed a full adjacency with every other, five routers would need ten adjacencies and a lot of duplicate LSAs. So OSPF elects a **designated router (DR)** and a **backup designated router (BDR)**. Everyone forms a Full adjacency only with the DR and BDR; other routers (**DROTHERs**) stop at **2-Way** with each other. Routers send updates to the DR on 224.0.0.6, and the DR floods them to everyone on 224.0.0.5.",
          "On a **point-to-point** network type (the default on serial HDLC/PPP links) there are only two routers, so there is **no DR or BDR** and no election wait; neighbors go straight to Full. Many shops set routed Ethernet links between two routers to point-to-point for faster convergence and simpler output:",
          { cli: [
            'HPL-CORE(config)# interface GigabitEthernet0/1',
            'HPL-CORE(config-if)# ip ospf network point-to-point',
          ] },
          "Both ends must use the same network type. A broadcast end and a point-to-point end may still reach Full but routes may not install correctly, a classic troubleshooting ticket ([TT-1019](#t19)).",
        ],
      },
      {
        h: 'DR/BDR election',
        body: [
          { list: [
            "1. Highest **interface OSPF priority** wins (default 1, range 0-255, set with `ip ospf priority`).",
            "2. Tie: highest **router ID** wins.",
            "3. Priority **0** means the router can never be DR or BDR.",
            "4. The second best becomes BDR.",
            "5. The election is **non-preemptive**: once a DR exists, a new router with higher priority does not take over. It waits until the DR fails (then the BDR is promoted and a new BDR is elected) or until the OSPF process is reset with `clear ip ospf process`.",
          ] },
          "That last rule is exactly what bit Harbor Point. The lab router booted first, became DR alone, and the real routers, arriving later, could not preempt it. The fix is to set priority 0 on the lab router and higher priority on the router you want, then reset the process on the routers involved.",
          { svg: '<svg viewBox="0 0 360 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="DR BDR election on a shared Ethernet segment" font-size="13" fill="currentColor"><path d="M20 100h320" fill="none" stroke="currentColor" stroke-width="3"/><g fill="none" stroke="currentColor"><rect x="14" y="20" width="94" height="44" rx="6" stroke-width="2.5" style="stroke:var(--accent)"/><rect x="134" y="20" width="94" height="44" rx="6"/><rect x="254" y="20" width="94" height="44" rx="6"/><rect x="74" y="136" width="94" height="44" rx="6"/><rect x="194" y="136" width="94" height="44" rx="6"/><path d="M61 64v36M181 64v36M301 64v36M121 100v36M241 100v36"/></g><text x="22" y="38">HQ pri 100</text><text x="22" y="56" font-weight="bold">DR</text><text x="142" y="38">CORE pri 50</text><text x="142" y="56" font-weight="bold">BDR</text><text x="262" y="38">DC pri 1</text><text x="262" y="56">DROTHER</text><text x="80" y="154">RID 9.9.9.9</text><text x="80" y="172">pri 0 never</text><text x="200" y="154">RID 4.4.4.4</text><text x="200" y="172">pri 1 DROTHER</text><text x="200" y="120" font-size="12">DROTHERs: 2-Way</text></svg>' },
          { cli: [
            'HPL-HQ(config)# interface GigabitEthernet0/0',
            'HPL-HQ(config-if)# ip ospf priority 100',
            'LAB-R9(config)# interface GigabitEthernet0/0',
            'LAB-R9(config-if)# ip ospf priority 0',
            'HPL-HQ# clear ip ospf process',
            'Reset ALL OSPF processes? [no]: yes',
          ] },
        ],
      },
      {
        h: 'Verification',
        body: [
          { cli: [
            'HPL-DC# show ip ospf neighbor',
            '',
            'Neighbor ID     Pri   State           Dead Time   Address         Interface',
            '1.1.1.1         100   FULL/DR         00:00:36    10.1.0.1        GigabitEthernet0/0',
            '2.2.2.2          50   FULL/BDR        00:00:31    10.1.0.2        GigabitEthernet0/0',
            '4.4.4.4           1   2WAY/DROTHER    00:00:38    10.1.0.4        GigabitEthernet0/0',
            '9.9.9.9           0   2WAY/DROTHER    00:00:33    10.1.0.9        GigabitEthernet0/0',
            '5.5.5.5           1   FULL/  -        00:00:39    10.1.45.2       GigabitEthernet0/1',
          ] },
          "Read the State column as *adjacency state / the neighbor's role*. `2WAY/DROTHER` between two DROTHERs is normal, not a fault. `FULL/  -` means a point-to-point neighbor with no DR role.",
          { cli: [
            'HPL-DC# show ip ospf interface brief',
            'Interface    PID   Area            IP Address/Mask    Cost  State Nbrs F/C',
            'Gi0/0        1     0               10.1.0.3/24        1     DROTH 2/4',
            'Gi0/1        1     0               10.1.45.1/30       1     P2P   1/1',
            '',
            'HPL-DC# show ip ospf interface GigabitEthernet0/0',
            'GigabitEthernet0/0 is up, line protocol is up',
            '  Internet Address 10.1.0.3/24, Area 0, Attached via Network Statement',
            '  Process ID 1, Router ID 3.3.3.3, Network Type BROADCAST, Cost: 1',
            '  Transmit Delay is 1 sec, State DROTHER, Priority 1',
            '  Designated Router (ID) 1.1.1.1, Interface address 10.1.0.1',
            '  Backup Designated router (ID) 2.2.2.2, Interface address 10.1.0.2',
            '  Timer intervals configured, Hello 10, Dead 40, Wait 40, Retransmit 5',
          ] },
          "Also useful: `show ip protocols` (router ID, networks, passive interfaces) and `show ip route ospf` (what OSPF actually installed).",
        ],
      },
    ],
    techNotes: [
      "Hardcode the router ID on every router. Letting it float to an interface address means it changes when someone renumbers a loopback, which is a fun way to spend a Saturday.",
      "If a neighbor is stuck in Init, hellos are only getting through in one direction. Look for an ACL or a passive interface on the far end.",
      "Stuck in ExStart or Exchange almost always means an MTU mismatch.",
      "Priority changes take effect at the next election. Kenji learned that one the loud way.",
    ],
    examTraps: [
      "Process IDs do not need to match between neighbors. Areas do.",
      "Highest priority wins, then highest RID. Not lowest.",
      "Raising a router's priority does not make it DR immediately; the election is non-preemptive.",
      "Point-to-point links have no DR/BDR. `FULL/ -` is correct there.",
      "Two DROTHERs stay at 2-Way. That is healthy.",
      "RID order: manual, highest loopback, highest physical. Loopbacks beat physical interfaces even if the physical address is numerically higher.",
    ],
    tryIt: [
      { device: 'router', mode: 'config', prompt: "Start OSPF with a fixed router ID and a wildcard network statement, then check which interfaces joined and their state.", cmds: ['router ospf 1', 'router-id 1.1.1.1', 'network 192.168.1.0 0.0.0.255 area 0', 'end', 'show ip ospf interface brief'] },
      { device: 'router', mode: 'config', prompt: "Make this router ineligible for DR with priority 0, enable OSPF directly on the interface, then look at the interface detail.", cmds: ['interface g0/0', 'ip ospf 1 area 0', 'ip ospf priority 0', 'end', 'show ip ospf interface g0/0'] },
      { device: 'router', mode: 'config', prompt: "Run OSPF on the LAN, change the interface to the point-to-point network type, reset the process, and check that the interface no longer has a DR or BDR.", cmds: ['router ospf 1', 'network 192.168.1.0 0.0.0.255 area 0', 'interface g0/0', 'ip ospf network point-to-point', 'end', 'clear ip ospf process', 'show ip ospf interface g0/0'] },
    ],
    check: [
      ['Four routers share a broadcast segment: R1 priority 1 RID 10.0.0.1, R2 priority 1 RID 10.0.0.9, R3 priority 0 RID 10.0.0.99, R4 priority 1 RID 10.0.0.5. All start at once. Which is DR?', ['R1', 'R2', 'R3', 'R4'], 1, "Priorities tie at 1 (R3 is excluded by priority 0), so the highest router ID wins: R2 at 10.0.0.9. R4 becomes BDR. R3 can never be DR or BDR regardless of its high RID."],
      ['A router has no `router-id` command, Loopback0 at 1.1.1.1, and Gi0/0 at 192.168.1.1. What is its OSPF router ID?', ['192.168.1.1', '1.1.1.1', '0.0.0.0', 'The process ID'], 1, "Without a manual router ID, an up loopback's highest address is chosen before any physical interface, even if the physical address is numerically higher."],
      ['Two directly connected routers show `FULL/  -` in `show ip ospf neighbor`. What does that tell you?', ['The adjacency failed', 'The link uses the point-to-point network type, so there is no DR/BDR', 'Both routers have priority 0', 'The neighbor is a DROTHER'], 1, "On point-to-point links OSPF skips DR/BDR election, so the role field shows a dash. FULL means the adjacency is complete. A failed adjacency would not be in FULL, and DROTHER would be spelled out."],
    ],
    related: { tickets: ['t06', 't19'], cards: ['ospf', 'dynrouting'], hw: null, drill: false },
  });

  L.push({
    id: 'l3-5',
    obj: '3.5',
    domain: 'ipconn',
    title: 'First hop redundancy: the gateway that refuses to die',
    minutes: 13,
    caseFile: "The dispatch floor runs 140 PCs, all pointing at 10.10.20.1 as their default gateway. Last month that router rebooted for an IOS upgrade and the whole floor went quiet for nine minutes while the second router sat idle beside it. Your boss, Rosa Delgado, wants the gateway to survive the next reboot. Enter FHRP.",
    sections: [
      {
        h: 'The problem FHRP solves',
        body: [
          "PCs get one default gateway, usually from DHCP. If that single router dies, the PCs have no idea a second router exists; they keep ARPing for the dead one. Routing protocols cannot help, because PCs do not run them.",
          "A **first hop redundancy protocol (FHRP)** lets two or more routers share a **virtual IP address** and a **virtual MAC address**. The PCs use the virtual IP as their gateway. One router actively answers for it; if that router fails, another takes over the same virtual IP and MAC within seconds. The PCs never notice except for a brief blip.",
        ],
      },
      {
        h: 'How it works step by step',
        body: [
          { list: [
            "1. Both routers are configured in the same group with the same virtual IP (for example 10.10.20.1). Their real interface addresses are different (10.10.20.2 and 10.10.20.3).",
            "2. They exchange hellos (multicast) and elect an active router, usually by highest priority, then highest interface IP.",
            "3. The active router replies to ARP requests for the virtual IP with the virtual MAC, and forwards traffic sent to that MAC.",
            "4. If the standby stops hearing hellos for the hold time, it becomes active and sends a **gratuitous ARP** so switches update their MAC tables to the new port.",
            "5. When the original router returns, it only takes the role back if **preemption** is enabled.",
          ] },
          { svg: '<svg viewBox="0 0 360 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Two routers sharing a virtual gateway IP" font-size="13" fill="currentColor"><g fill="none" stroke="currentColor"><rect x="20" y="20" width="120" height="48" rx="6" stroke-width="2.5" style="stroke:var(--accent)"/><rect x="220" y="20" width="120" height="48" rx="6"/><rect x="130" y="110" width="100" height="30" rx="4"/><rect x="140" y="160" width="80" height="30" rx="4"/><path d="M80 68l70 42M280 68l-70 42M180 140v20"/><ellipse cx="180" cy="44" rx="40" ry="16" stroke-dasharray="4 3"/></g><text x="28" y="40">R-A .2 pri 110</text><text x="28" y="58" font-weight="bold">Active</text><text x="228" y="40">R-B .3 pri 100</text><text x="228" y="58">Standby</text><text x="160" y="48">VIP .1</text><text x="154" y="130">switch</text><text x="152" y="180">PCs gw .1</text></svg>' },
        ],
      },
      {
        h: 'The three protocols compared',
        body: [
          { table: [
            ['', 'HSRP', 'VRRP', 'GLBP'],
            ['Standard', 'Cisco proprietary', 'Open standard (RFC 9568 for v3)', 'Cisco proprietary'],
            ['Roles', 'Active / Standby', 'Master / Backup', 'AVG / AVF'],
            ['Multicast', 'v1 224.0.0.2, v2 224.0.0.102', '224.0.0.18', '224.0.0.102'],
            ['Virtual MAC', 'v1 0000.0c07.acXX, v2 0000.0c9f.fXXX', '0000.5e00.01XX', '0007.b400.XXYY'],
            ['Preempt default', 'Off', 'On', 'Off (AVG)'],
            ['Load balancing', 'Per group/VLAN only', 'Per group/VLAN only', 'Yes, within one group'],
          ] },
          "XX in the MAC is the group number in hex. HSRP is the one Cisco networks use most and the one you configure in labs. VRRP is the choice in multi-vendor networks; its virtual IP can even be one router's real address. **GLBP** is the odd one out: one **active virtual gateway (AVG)** answers ARP requests with different virtual MACs, each owned by a different **active virtual forwarder (AVF)**, so different PCs use different routers through the same gateway IP.",
          "With HSRP or VRRP you can still balance load by running two groups: router A active for VLAN 10, router B active for VLAN 20.",
        ],
      },
      {
        h: 'HSRP configuration and verification',
        body: [
          { cli: [
            'HPL-DIST1(config)# interface GigabitEthernet0/0',
            'HPL-DIST1(config-if)# ip address 10.10.20.2 255.255.255.0',
            'HPL-DIST1(config-if)# standby version 2',
            'HPL-DIST1(config-if)# standby 20 ip 10.10.20.1',
            'HPL-DIST1(config-if)# standby 20 priority 110',
            'HPL-DIST1(config-if)# standby 20 preempt',
            '',
            'HPL-DIST1# show standby brief',
            '                     P indicates configured to preempt.',
            '                     |',
            'Interface   Grp  Pri P State   Active          Standby         Virtual IP',
            'Gi0/0       20   110 P Active  local           10.10.20.3      10.10.20.1',
          ] },
          "Default HSRP priority is 100, hello 3 seconds, hold 10 seconds. Both routers must agree on group number, virtual IP and version.",
        ],
      },
    ],
    techNotes: [
      "Always turn on preempt on the router you want active, or after its next reboot the backup keeps the job forever and nobody remembers why.",
      "The PCs' default gateway must be the **virtual** IP, not either router's real address. Check the DHCP pool's `default-router` line.",
      "HSRP version 1 and 2 cannot talk to each other. Match versions on both routers.",
    ],
    examTraps: [
      "VRRP is the open standard. HSRP and GLBP are Cisco proprietary.",
      "Only GLBP load balances within a single group.",
      "HSRP preemption is disabled by default; VRRP preemption is enabled by default.",
      "Know the MAC prefixes: 0000.0c07.ac (HSRPv1), 0000.0c9f.f (HSRPv2), 0000.5e00.01 (VRRP), 0007.b400 (GLBP).",
    ],
    tryIt: [
      { device: 'router', mode: 'config', prompt: "Make this router the preferred HSRP gateway for its LAN.", cmds: ['interface g0/0', 'standby 1 ip 192.168.1.254', 'standby 1 priority 110', 'standby 1 preempt', 'end', 'show standby brief'] },
    ],
    check: [
      ['Which FHRP is an open standard?', ['HSRP', 'GLBP', 'VRRP', 'CARP'], 2, "VRRP is defined by the IETF. HSRP and GLBP are Cisco proprietary. CARP exists outside Cisco IOS and is not a CCNA protocol."],
      ['Which FHRP can share traffic for a single group between several routers by handing out different virtual MAC addresses?', ['HSRP', 'VRRP', 'GLBP', 'All of them'], 2, "GLBP's AVG answers ARP requests with the virtual MACs of different AVFs. HSRP and VRRP have one forwarder per group and only balance by using multiple groups."],
      ['R1 (priority 120) was HSRP active, failed and came back. R2 (priority 100) is now active and stays active. What is the most likely reason?', ['R1 has a lower priority', 'Preempt is not configured on R1', 'HSRP does not support failover', 'R2 has a higher IP address'], 1, "HSRP preemption is off by default, so a returning higher-priority router does not reclaim the active role. Add `standby <group> preempt` on R1."],
    ],
    related: { tickets: ['t16'], cards: ['fhrp'], hw: null, drill: false },
  });

  /* ================================================================ *
   * 4.0 IP SERVICES
   * ================================================================ */

  L.push({
    id: 'l4-1',
    obj: '4.1',
    domain: 'svc',
    title: 'NAT: four names for one address',
    minutes: 18,
    caseFile: "The new customer portal server, PORTAL-01 at 192.168.50.20, has to be reachable from the internet at 203.0.113.10, and the finance subnet needs a block of public addresses for a bank that whitelists IPs. Theo from the security team keeps saying \"inside global\" like you should know what it means. By sunrise, you will.",
    sections: [
      {
        h: 'Why NAT exists',
        body: [
          "Private IPv4 ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) are not routed on the internet. **Network Address Translation (NAT)** rewrites the source address of packets leaving your network into a public address, and reverses the rewrite on the replies. It conserves public IPv4 space and hides internal addressing.",
          "This objective is about **inside source NAT**: translating the source address of inside hosts as their packets go out. Three flavors exist:",
          { list: [
            "**Static NAT:** one inside address permanently mapped to one public address. Works in both directions, so outsiders can start connections to the inside host (servers).",
            "**Dynamic NAT with a pool:** inside hosts matched by an ACL borrow a public address from a pool, one-to-one, for as long as the translation lives. When the pool runs out, the next host simply fails.",
            "**PAT (overload):** many inside hosts share one public address, told apart by port numbers. That is what every home router does, covered in [TT-1012](#t12).",
          ] },
        ],
      },
      {
        h: 'The four address names',
        body: [
          "NAT terms have two halves. **Inside/outside** says whose address it is (a host on your network or a host out there). **Local/global** says from which side of the router you are looking at it (local = as seen from the inside network, global = as seen from the outside network).",
          { table: [
            ['Term', 'Whose address', 'Seen from', 'PORTAL-01 example'],
            ['Inside local', 'Inside host', 'Inside', '192.168.50.20 (its real, private address)'],
            ['Inside global', 'Inside host', 'Outside', '203.0.113.10 (what the internet sees)'],
            ['Outside local', 'Outside host', 'Inside', '198.51.100.7 (usually unchanged)'],
            ['Outside global', 'Outside host', 'Outside', '198.51.100.7 (its real address)'],
          ] },
          "With inside source NAT only the inside host's address changes, so outside local and outside global are the same. They differ only if you also translate outside addresses, which the CCNA does not configure.",
          { svg: '<svg viewBox="0 0 360 210" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Inside source NAT rewrites the source address at the border router" font-size="13" fill="currentColor"><g fill="none" stroke="currentColor"><rect x="8" y="80" width="80" height="40" rx="6"/><rect x="140" y="76" width="80" height="48" rx="6" stroke-width="2.5" style="stroke:var(--accent)"/><rect x="272" y="80" width="80" height="40" rx="6"/><path d="M88 100h52M220 100h52"/><path d="M180 20v170" stroke-dasharray="4 4"/></g><text x="16" y="104">PORTAL-01</text><text x="156" y="104">HPL-EDGE</text><text x="282" y="104">Client</text><text x="34" y="16">INSIDE</text><text x="250" y="16">OUTSIDE</text><text x="8" y="150">src 192.168.50.20</text><text x="8" y="168">= inside local</text><text x="196" y="150">src 203.0.113.10</text><text x="196" y="168">= inside global</text><text x="8" y="56">dst 198.51.100.7</text><text x="196" y="56">dst 198.51.100.7</text><text x="132" y="200">only the source changes</text></svg>' },
          { note: "Memory hook: **local** is the address on *your* LAN's side of the glass, **global** is the address on the street side. Inside global is the inside host wearing its public badge." },
        ],
      },
      {
        h: 'Step one for any NAT: mark the interfaces',
        body: [
          { cli: [
            'HPL-EDGE(config)# interface GigabitEthernet0/0',
            'HPL-EDGE(config-if)# description LAN',
            'HPL-EDGE(config-if)# ip nat inside',
            'HPL-EDGE(config-if)# interface GigabitEthernet0/1',
            'HPL-EDGE(config-if)# description ISP',
            'HPL-EDGE(config-if)# ip nat outside',
          ] },
          "NAT only happens to packets moving between an inside and an outside interface. Forgetting `ip nat inside` on the LAN port is the number one NAT ticket.",
        ],
      },
      {
        h: 'Static NAT',
        body: [
          { cli: [
            'HPL-EDGE(config)# ip nat inside source static 192.168.50.20 203.0.113.10',
            '',
            'HPL-EDGE# show ip nat translations',
            'Pro Inside global      Inside local       Outside local      Outside global',
            '--- 203.0.113.10       192.168.50.20      ---                ---',
            'tcp 203.0.113.10:443   192.168.50.20:443  198.51.100.7:51544 198.51.100.7:51544',
          ] },
          "The first line is the permanent static entry; it exists even with no traffic. The second line appeared when an internet client connected to the portal on HTTPS. Note the column order: inside global first, then inside local. The ISP must route 203.0.113.10 to HPL-EDGE, and any ACL on the outside interface must allow the traffic.",
        ],
      },
      {
        h: 'Dynamic NAT with a pool',
        body: [
          "Three pieces: an ACL that picks which inside local addresses may be translated, a pool of inside global addresses, and the statement that ties them together.",
          { cli: [
            'HPL-EDGE(config)# access-list 10 permit 192.168.60.0 0.0.0.255',
            'HPL-EDGE(config)# ip nat pool FINANCE 203.0.113.17 203.0.113.30 netmask 255.255.255.240',
            'HPL-EDGE(config)# ip nat inside source list 10 pool FINANCE',
          ] },
          "You can write `prefix-length 28` instead of `netmask 255.255.255.240`. The pool gives up to 14 finance PCs a public address at once. Number 15 gets no translation and its traffic is dropped until an entry times out (dynamic entries age out after 24 hours of inactivity by default) or someone clears them.",
          { cli: [
            'HPL-EDGE# show ip nat translations',
            'Pro Inside global      Inside local       Outside local      Outside global',
            '--- 203.0.113.17       192.168.60.11      ---                ---',
            '--- 203.0.113.18       192.168.60.24      ---                ---',
            '',
            'HPL-EDGE# show ip nat statistics',
            'Total active translations: 3 (1 static, 2 dynamic; 0 extended)',
            'Outside interfaces:',
            '  GigabitEthernet0/1',
            'Inside interfaces:',
            '  GigabitEthernet0/0',
            'Hits: 1842  Misses: 0',
            'Dynamic mappings:',
            '-- Inside Source',
            '[Id: 1] access-list 10 pool FINANCE refcount 2',
            ' pool FINANCE: netmask 255.255.255.240',
            '        start 203.0.113.17 end 203.0.113.30',
            '        type generic, total addresses 14, allocated 2 (14%), misses 0',
            '',
            'HPL-EDGE# clear ip nat translation *',
          ] },
          "`clear ip nat translation *` removes dynamic entries only; static mappings stay. Add the keyword `overload` to the end of the `ip nat inside source list` line and the pool becomes PAT, letting many hosts share each address.",
        ],
      },
    ],
    techNotes: [
      "If translations never appear, check in this order: inside/outside on the right interfaces, the ACL actually matches the source subnet, the router has a route out.",
      "The NAT ACL is a match list, not a filter. A `deny` in it just means 'do not translate'.",
      "Theo's favorite trick question: `show ip nat translations` lists inside global **before** inside local. Read the header every time.",
    ],
    examTraps: [
      "Inside local is the private address of the inside host. Inside global is that host's public address. Swapping them is the most common wrong answer.",
      "Static NAT allows connections from the outside in. Dynamic NAT and PAT only allow replies to inside-initiated traffic.",
      "Dynamic NAT without overload is one-to-one: a 14-address pool serves 14 hosts at a time.",
      "Outside local equals outside global in plain inside source NAT.",
    ],
    tryIt: [
      { device: 'router', mode: 'config', prompt: "Mark the interfaces, add a static mapping and a pool, then look at the translation table. The static entry appears with no traffic at all.", cmds: ['interface g0/0', 'ip nat inside', 'interface g0/1', 'ip nat outside', 'exit', 'ip nat inside source static 192.168.1.20 203.0.113.10', 'access-list 10 permit 192.168.1.0 0.0.0.255', 'ip nat pool HPL 203.0.113.17 203.0.113.30 netmask 255.255.255.240', 'ip nat inside source list 10 pool HPL', 'end', 'show ip nat translations'] },
    ],
    check: [
      ['PC 10.1.1.5 is translated to 198.51.100.20 on its way to a web server at 192.0.2.80. What is 198.51.100.20?', ['Inside local', 'Inside global', 'Outside local', 'Outside global'], 1, "It is the inside host's address as seen from the outside: inside global. 10.1.1.5 is inside local, and 192.0.2.80 is both outside local and outside global."],
      ['Which command creates a one-to-one permanent translation that lets internet hosts connect to an inside server?', ['ip nat inside source list 1 pool WEB', 'ip nat inside source static 10.1.1.80 198.51.100.80', 'ip nat outside source list 1 interface g0/1 overload', 'ip nat pool WEB 198.51.100.80 198.51.100.80 netmask 255.255.255.0'], 1, "Static NAT is permanent and bidirectional. A pool statement is dynamic and only creates entries for inside-initiated traffic, and `ip nat pool` alone only defines addresses."],
      ['A dynamic NAT pool has 6 addresses and no overload. A seventh inside host tries to reach the internet. What happens?', ['It shares an address using PAT', 'It is translated to the router outside interface address', 'Its traffic is not translated and fails until an address frees up', 'The router adds a seventh address automatically'], 2, "Without overload, dynamic NAT is one-to-one. Once all pool addresses are allocated, new hosts get no translation (counted as misses)."],
    ],
    related: { tickets: ['t12', 't21'], cards: ['nat', 'ipv4'], hw: null, drill: false },
  });

  L.push({
    id: 'l4-2',
    obj: '4.2',
    domain: 'svc',
    title: 'NTP: everyone agrees what time it is',
    minutes: 12,
    caseFile: "Overnight a truck gate controller failed, and the logs from the edge router say it happened in March 1993. The switch logs say yesterday afternoon. Nobody can line anything up. Tonight you make every device at Harbor Point agree on the time with NTP, client and server.",
    sections: [
      {
        h: 'Why time matters on a network',
        body: [
          "Accurate, consistent clocks let you correlate log messages across devices, validate certificates (an expired-looking cert breaks HTTPS and VPNs), keep AAA accounting records honest, and make scheduled jobs run when they should. A router with no time source boots with a default clock (often 1993 or 2002 depending on the platform), and the timestamps it writes are useless.",
          "**Network Time Protocol (NTP)** synchronizes clocks over the network using **UDP port 123**. It measures round-trip delay to adjust for network latency and typically keeps LAN devices within a few milliseconds of each other.",
        ],
      },
      {
        h: 'Stratum: distance from the real clock',
        body: [
          "NTP sources are ranked by **stratum**. Stratum 0 is a reference clock (atomic clock, GPS receiver) that is not on the network itself. A server directly attached to one is stratum 1. Anything that syncs to a stratum 1 server is stratum 2, and so on. Lower is more trusted. **Stratum 16** means unsynchronized.",
          { svg: '<svg viewBox="0 0 360 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="NTP stratum hierarchy" font-size="13" fill="currentColor"><g fill="none" stroke="currentColor"><rect x="130" y="8" width="100" height="28" rx="4" stroke-dasharray="4 3"/><rect x="130" y="56" width="100" height="28" rx="4"/><rect x="130" y="104" width="100" height="28" rx="4" stroke-width="2.5" style="stroke:var(--accent)"/><rect x="20" y="146" width="90" height="28" rx="4"/><rect x="135" y="146" width="90" height="28" rx="4"/><rect x="250" y="146" width="90" height="28" rx="4"/><path d="M180 36v20M180 84v20M180 132l-115 14M180 132v14M180 132l115 14"/></g><text x="146" y="27">GPS (st 0)</text><text x="138" y="75">ISP NTP (st 1)</text><text x="136" y="123">HPL-CORE (st 2)</text><text x="30" y="165">SW1 (st 3)</text><text x="145" y="165">SW2 (st 3)</text><text x="260" y="165">R5 (st 3)</text><text x="244" y="123">client and</text><text x="244" y="138">server</text></svg>' },
        ],
      },
      {
        h: 'Client and server mode on IOS',
        body: [
          "An IOS device becomes an NTP **client** with `ntp server <ip>`. Once it is synchronized, it can also **serve** time to other devices that point at it, so HPL-CORE is both a client of the ISP and a server for the closets. That tidy tree is the usual design.",
          { cli: [
            'HPL-CORE(config)# ntp server 192.0.2.123',
            'HPL-CORE(config)# ntp source Loopback0',
            'HPL-CORE(config)# clock timezone EST -5',
            'HPL-CORE(config)# clock summer-time EDT recurring',
            '',
            'HPL-SW1(config)# ntp server 10.255.0.2',
          ] },
          "If there is no external source at all (an isolated lab, or a site that must not reach the internet), you can make a router an authoritative server from its own clock with `ntp master` (default stratum 8, or `ntp master 3` to set it). Set the clock by hand first with `clock set` in privileged EXEC. Other modes exist: `ntp peer` (symmetric active, two devices sync with each other) and broadcast mode, but client/server is what the CCNA tests.",
          "NTP **authentication** stops a rogue server from feeding you a fake time:",
          { cli: [
            'HPL-SW1(config)# ntp authenticate',
            'HPL-SW1(config)# ntp authentication-key 1 md5 Tid3Ch4rt',
            'HPL-SW1(config)# ntp trusted-key 1',
            'HPL-SW1(config)# ntp server 10.255.0.2 key 1',
          ] },
        ],
      },
      {
        h: 'Verification',
        body: [
          { cli: [
            'HPL-CORE# show ntp associations',
            '',
            '  address         ref clock       st   when   poll reach  delay  offset   disp',
            '*~192.0.2.123     .GPS.            1     38     64   377  12.410   0.512  1.204',
            ' * sys.peer, # selected, + candidate, - outlyer, x falseticker, ~ configured',
            '',
            'HPL-CORE# show ntp status',
            'Clock is synchronized, stratum 2, reference is 192.0.2.123',
            'nominal freq is 250.0000 Hz, actual freq is 250.0000 Hz, precision is 2**10',
            '',
            'HPL-CORE# show clock',
            '23:41:07.512 EST Sun Nov 15 2026',
          ] },
          { list: [
            "`*` = the server this device is actually synced to. `~` = configured by you.",
            "`st` = the server's stratum. This router is one more (2).",
            "`reach 377` (octal) = the last eight polls all got answers. 0 means it has never heard back.",
            "A `*` in front of the `show clock` time means the clock is not authoritative (never synced or lost sync).",
          ] },
          { note: "Synchronization is not instant. After you configure `ntp server`, it can take several minutes before the `*` appears. Do not rip out the config after 30 seconds." },
        ],
      },
    ],
    techNotes: [
      "Point every device at two or three NTP servers if you can. One server that drifts is a liar nobody can catch.",
      "Use `ntp source Loopback0` so the core always sources NTP from the same address, which keeps ACLs simple.",
      "`show clock` shows the time zone you configured. NTP itself always carries UTC; the time zone is just display.",
    ],
    examTraps: [
      "NTP uses UDP 123, not TCP.",
      "Lower stratum is better. Stratum 16 is unsynchronized.",
      "`ntp server` makes the device a client of that server; it does not make it a server. `ntp master` makes it an authoritative source.",
      "A device synced as a client can still serve time to others.",
    ],
    tryIt: [
      { device: 'router', mode: 'config', prompt: "Set a time zone, point the router at an NTP server and check its associations. With no server really there, the entry stays unsynchronized: look at the st and reach columns.", cmds: ['clock timezone EST -5', 'ntp server 10.255.0.2', 'end', 'show ntp associations', 'show ntp status', 'show clock'] },
      { device: 'router', mode: 'config', prompt: "Now make the router an authoritative NTP master at stratum 3 instead.", cmds: ['no ntp server 10.255.0.2', 'ntp master 3', 'end', 'show ntp status'] },
    ],
    check: [
      ['Which command makes a router synchronize its clock to 10.0.0.5?', ['ntp master 10.0.0.5', 'ntp server 10.0.0.5', 'ntp peer 10.0.0.5 master', 'clock set 10.0.0.5'], 1, "`ntp server` configures client mode toward that server. `ntp master` takes a stratum number, not an address, and makes the router an authoritative source. `clock set` takes a time, not an IP."],
      ['A router is synchronized to a stratum 2 server. What is its own stratum?', ['1', '2', '3', '16'], 2, "Each NTP hop adds one, so syncing to a stratum 2 server makes this router stratum 3. Stratum 16 means unsynchronized."],
      ['In `show ntp associations`, what does an asterisk next to an address mean?', ['The server is unreachable', 'The address was configured manually', 'This is the server the device is synchronized to (sys.peer)', 'The server is a falseticker'], 2, "The asterisk marks the system peer. The tilde means configured, x means falseticker, and an unreachable server would show reach 0."],
    ],
    related: { tickets: ['t23'], cards: ['ntp', 'syslog'], hw: null, drill: false },
  });

  L.push({
    id: 'l4-3',
    obj: '4.3',
    domain: 'svc',
    title: 'DHCP and DNS: the front desk and the phone book',
    minutes: 13,
    caseFile: "A new shift supervisor, Bea, plugs in her laptop and it \"has internet\" but the inventory site at inventory.harborpoint.local will not load, while 10.10.5.40 typed directly works fine. Meanwhile three handheld scanners report 169.254 addresses. Two services, two different failures. Tonight is about DHCP and DNS, the two things every host needs before it can do anything useful.",
    sections: [
      {
        h: 'DHCP: handing out addresses',
        body: [
          "The **Dynamic Host Configuration Protocol** gives a host everything it needs to join the network: IP address, mask, default gateway, DNS servers, domain name, and a **lease** time. Without it, every one of Harbor Point's 900 devices would need manual configuration.",
          "Clients use **UDP 68**, servers **UDP 67**. A new client has no address yet, so the first messages are broadcasts. The four-step exchange is known as **DORA**:",
          { svg: '<svg viewBox="0 0 360 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="DHCP DORA exchange between client and server" font-size="13" fill="currentColor"><g fill="none" stroke="currentColor"><path d="M60 30v180M300 30v180"/><path d="M60 60h232M292 54l8 6-8 6"/><path d="M300 100H68M68 94l-8 6 8 6"/><path d="M60 140h232M292 134l8 6-8 6"/><path d="M300 180H68M68 174l-8 6 8 6"/></g><text x="30" y="20">Client</text><text x="270" y="20">Server</text><text x="90" y="54">1 Discover (broadcast)</text><text x="100" y="94">2 Offer (here is .57)</text><text x="90" y="134">3 Request (I take .57)</text><text x="100" y="174">4 Ack (it is yours)</text></svg>' },
          { list: [
            "**Discover:** client broadcasts \"any DHCP servers out there?\" from 0.0.0.0 to 255.255.255.255.",
            "**Offer:** a server proposes an address and options.",
            "**Request:** the client broadcasts that it accepts that offer (broadcast, so other servers know their offers were declined).",
            "**Ack:** the server confirms. The host configures itself and the lease clock starts.",
          ] },
          "At 50 percent of the lease the client tries to renew directly with its server (unicast); if that fails it tries any server at 87.5 percent. If a client gets no answer at all, Windows and macOS self-assign an **APIPA** address in 169.254.0.0/16, which only reaches other APIPA hosts. That is the scanners' problem: no DHCP server is answering their subnet (usually a missing relay, covered in [lesson 4.6](#learn-l4-6) and in [TT-1010](#t10)).",
          "Useful **DHCP options**: 3 (default router), 6 (DNS servers), 15 (domain name), 150 (TFTP server for Cisco IP phones), 43 (vendor info, such as a wireless LAN controller address for APs).",
        ],
      },
      {
        h: 'A router as a DHCP server',
        body: [
          { cli: [
            'HPL-HQ(config)# ip dhcp excluded-address 10.10.30.1 10.10.30.20',
            'HPL-HQ(config)# ip dhcp pool SCANNERS',
            'HPL-HQ(dhcp-config)# network 10.10.30.0 255.255.255.0',
            'HPL-HQ(dhcp-config)# default-router 10.10.30.1',
            'HPL-HQ(dhcp-config)# dns-server 10.10.5.10 10.10.5.11',
            'HPL-HQ(dhcp-config)# domain-name harborpoint.local',
            'HPL-HQ(dhcp-config)# lease 1',
            '',
            'HPL-HQ# show ip dhcp binding',
            'Bindings from all pools not associated with VRF:',
            'IP address      Client-ID/              Lease expiration        Type       State      Interface',
            '                Hardware address/',
            '                User name',
            '10.10.30.21     0100.50a1.33c2.9e       Nov 16 2026 11:40 PM    Automatic  Active     GigabitEthernet0/1',
          ] },
          "Excluded addresses are reserved for gateways, printers and servers. `lease 1` means one day (the default). `show ip dhcp pool` shows utilization and `show ip dhcp conflict` shows addresses the server found already in use.",
        ],
      },
      {
        h: 'DNS: names to addresses',
        body: [
          "The **Domain Name System** turns names people remember into addresses machines use. A client asks its configured DNS server (a **recursive resolver**) to resolve a name; the resolver asks the root, then the top-level domain servers, then the authoritative server for that domain, and caches the answer for its **TTL**. DNS queries normally use **UDP 53**; large responses and zone transfers between servers use **TCP 53**.",
          { table: [
            ['Record', 'Purpose', 'Example'],
            ['A', 'Name to IPv4 address', 'inventory -> 10.10.5.40'],
            ['AAAA', 'Name to IPv6 address', 'portal -> 2001:db8:50::20'],
            ['CNAME', 'Alias to another name', 'www -> portal.harborpoint.com'],
            ['MX', 'Mail server for a domain', 'harborpoint.com -> mail.harborpoint.com'],
            ['PTR', 'Address to name (reverse lookup)', '10.10.5.40 -> inventory'],
            ['NS', 'Authoritative name servers for a zone', 'harborpoint.com -> ns1...'],
          ] },
          "Bea's laptop got an address and gateway (so 10.10.5.40 works) but a public DNS server from somewhere, which knows nothing about `harborpoint.local`. Fix the DHCP pool's `dns-server` line, then on her laptop:",
          { cli: [
            'C:\\> ipconfig /all',
            '   DNS Servers . . . . . . . . . . . : 10.10.5.10',
            '                                       10.10.5.11',
            'C:\\> ipconfig /flushdns',
            'C:\\> nslookup inventory.harborpoint.local',
            'Server:  hpl-dns1.harborpoint.local',
            'Address:  10.10.5.10',
            '',
            'Name:    inventory.harborpoint.local',
            'Address:  10.10.5.40',
          ] },
          "On IOS: `ip name-server 10.10.5.10` lets the router resolve names, and `no ip domain-lookup` stops it from trying to resolve every mistyped command as a hostname (the famous \"Translating 'shwo'...domain server (255.255.255.255)\" pause).",
        ],
      },
    ],
    techNotes: [
      "169.254.x.x means DHCP failed. An address with a wrong DNS server means DHCP worked but the pool is wrong. Different problems, different fixes.",
      "When a name fails but the IP works, it is DNS. It is always DNS. Except when it is the hosts file.",
      "Exclude the gateway address from the pool before you create the pool, or the router may hand its own address to a scanner.",
    ],
    examTraps: [
      "DHCP Discover and Request are broadcasts; that is why routers block them and a relay is needed across subnets.",
      "DHCP: server UDP 67, client UDP 68. DNS: UDP 53 for queries, TCP 53 for zone transfers.",
      "An A record maps to IPv4, AAAA to IPv6. PTR is the reverse direction.",
      "`ip dhcp excluded-address` is a global command, not inside the pool.",
    ],
    tryIt: [
      { device: 'pc', mode: 'priv', prompt: "Check what this PC has for address, mask and gateway, then ask DHCP for a fresh lease. A PC with a static address will tell you DHCP is not enabled, which is a useful clue too.", cmds: ['ipconfig', 'ipconfig /renew', 'ipconfig'] },
    ],
    check: [
      ['What is the correct order of a DHCP exchange?', ['Request, Offer, Discover, Ack', 'Discover, Offer, Request, Acknowledge', 'Discover, Request, Offer, Acknowledge', 'Offer, Discover, Ack, Request'], 1, "DORA: the client discovers, the server offers, the client requests that offer, the server acknowledges."],
      ['A user can reach a server by IP address but not by its name. Which service is most likely at fault?', ['DHCP', 'NTP', 'DNS', 'ARP'], 2, "Reaching the IP proves addressing, the gateway and routing work. Turning a name into an address is DNS's job."],
      ['Which DNS record type maps a hostname to an IPv6 address?', ['A', 'AAAA', 'PTR', 'MX'], 1, "AAAA (quad-A) records hold IPv6 addresses. A records hold IPv4, PTR is reverse lookup, MX names mail servers."],
    ],
    related: { tickets: ['t10'], cards: ['dhcp', 'dns'], hw: null, drill: false },
  });

  L.push({
    id: 'l4-4',
    obj: '4.4',
    domain: 'svc',
    title: 'SNMP: the network takes its own pulse',
    minutes: 12,
    caseFile: "Harbor Point's monitoring screen, the big TV over the NOC coffee machine, shows every link green, except it showed green for six hours last Tuesday while a distribution switch was dead. Ravi, the monitoring admin, found the switch's SNMP community had been changed and nobody updated the server. Tonight: how SNMP works and why version 3 exists.",
    sections: [
      {
        h: 'What SNMP does',
        body: [
          "The **Simple Network Management Protocol** lets a central server read information from network devices (interface counters, CPU, temperature, uptime), sometimes change settings, and receive alerts when something happens. It is how monitoring tools draw those graphs and wake people up at night.",
          { list: [
            "**NMS (network management station):** the monitoring server. It runs the **manager** software.",
            "**Managed device:** the router, switch or AP being monitored. It runs an **agent**.",
            "**MIB (Management Information Base):** the structured list of variables an agent can report, like a database schema.",
            "**OID (object identifier):** the numeric address of one variable in the MIB tree. For example 1.3.6.1.2.1.1.5.0 is the device's hostname (sysName).",
          ] },
        ],
      },
      {
        h: 'Messages and ports',
        body: [
          { table: [
            ['Message', 'Direction', 'Purpose'],
            ['Get', 'Manager to agent', 'Read one or more OIDs.'],
            ['GetNext', 'Manager to agent', 'Read the next OID in the tree (walk a table).'],
            ['GetBulk', 'Manager to agent', 'Read many OIDs at once (v2c and v3).'],
            ['Set', 'Manager to agent', 'Change a value on the device.'],
            ['Trap', 'Agent to manager', 'Unsolicited alert. Not acknowledged.'],
            ['Inform', 'Agent to manager', 'Alert that the manager acknowledges, so it can be resent (v2c and v3).'],
            ['Response', 'Agent to manager', 'Reply to Get, GetNext, GetBulk or Set.'],
          ] },
          "Agents listen on **UDP 161** (polls). Managers listen on **UDP 162** (traps and informs).",
          { svg: '<svg viewBox="0 0 360 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="SNMP manager polls agents on UDP 161 and receives traps on UDP 162" font-size="13" fill="currentColor"><g fill="none" stroke="currentColor"><rect x="10" y="60" width="110" height="50" rx="6"/><rect x="240" y="20" width="110" height="44" rx="6"/><rect x="240" y="106" width="110" height="44" rx="6"/><path d="M120 76l112-30M232 40l8 4-8 6"/><path d="M240 128L128 100M134 94l-8 6 9 4"/></g><text x="22" y="82">NMS</text><text x="22" y="100">manager</text><text x="252" y="40">switch</text><text x="252" y="56">agent + MIB</text><text x="252" y="126">router</text><text x="252" y="142">agent + MIB</text><text x="120" y="40">Get: UDP 161</text><text x="120" y="140">Trap: UDP 162</text></svg>' },
        ],
      },
      {
        h: 'Versions: the security story',
        body: [
          { table: [
            ['Version', 'Authentication', 'Encryption', 'Notes'],
            ['SNMPv1', 'Community string, sent in clear text', 'None', 'Original. Avoid.'],
            ['SNMPv2c', 'Community string, sent in clear text', 'None', 'Adds GetBulk and Inform. Still common.'],
            ['SNMPv3', 'Username with HMAC (SHA or MD5)', 'Optional (AES or DES)', 'The secure choice.'],
          ] },
          "A **community string** works like a shared password: read-only (RO) lets the manager Get, read-write (RW) also allows Set. Anyone who sniffs one v2c packet learns it, and an RW community lets an attacker reconfigure the device.",
          "SNMPv3 has three security levels: **noAuthNoPriv** (username only), **authNoPriv** (messages authenticated, not encrypted), **authPriv** (authenticated and encrypted). Use authPriv.",
          { cli: [
            '! SNMPv2c, read-only, send traps to the NMS',
            'HPL-SW3(config)# snmp-server community Hpl-M0nitor RO',
            'HPL-SW3(config)# snmp-server host 10.10.5.60 version 2c Hpl-M0nitor',
            'HPL-SW3(config)# snmp-server enable traps',
            '',
            '! SNMPv3 with authentication and encryption',
            'HPL-SW3(config)# snmp-server group NOC v3 priv',
            'HPL-SW3(config)# snmp-server user ravi NOC v3 auth sha Gr4phsAll priv aes 128 N0Peeking',
            'HPL-SW3(config)# snmp-server location Baltimore Dock 4 IDF',
            'HPL-SW3(config)# snmp-server contact noc@harborpoint.example',
          ] },
          "Verify with `show snmp` (packet counters), `show snmp community` and `show snmp user`.",
        ],
      },
    ],
    techNotes: [
      "Never use 'public' and 'private' as community strings. They are the first thing every scanner tries.",
      "Restrict who may poll with an ACL on the community: `snmp-server community Hpl-M0nitor RO 20`.",
      "Traps are fire-and-forget UDP. If the link to the NMS is down, the trap about the link being down is lost. Informs or a second NMS help.",
    ],
    examTraps: [
      "Polls go to the agent on UDP 161. Traps go to the manager on UDP 162.",
      "Only SNMPv3 offers authentication and encryption. v2c is not 'v2 with crypto'; the c stands for community.",
      "Traps are unacknowledged; Informs are acknowledged.",
      "The MIB lives on the agent side and describes what can be read; the manager uses it to know what to ask for.",
    ],
    check: [
      ['Which SNMP message is sent by an agent without being polled and is not acknowledged?', ['Get', 'Set', 'Trap', 'Inform'], 2, "A trap is an unsolicited, unacknowledged notification. An inform is also unsolicited but is acknowledged. Get and Set come from the manager."],
      ['Which SNMP version supports encryption of messages?', ['SNMPv1', 'SNMPv2c', 'SNMPv3', 'All versions'], 2, "Only SNMPv3 (at the authPriv level) encrypts. v1 and v2c send community strings in clear text."],
      ['An NMS must receive traps from switches. Which port must be open toward the NMS?', ['UDP 161', 'UDP 162', 'TCP 161', 'UDP 514'], 1, "Managers listen for traps and informs on UDP 162. UDP 161 is where agents listen for polls, and UDP 514 is syslog."],
    ],
    related: { tickets: [], cards: ['snmp'], hw: null, drill: false },
  });

  L.push({
    id: 'l4-5',
    obj: '4.5',
    domain: 'svc',
    title: 'Syslog: reading the diary the network keeps',
    minutes: 13,
    caseFile: "At 02:14 HPL-DIST2 printed a message nobody read, and at 02:15 the north dock lost its uplink. Rosa wants every router and switch sending its log messages to the new syslog server, filtered so the server is not drowning in chatter. Tonight you learn the message format, the eight severity levels and where logs can go.",
    sections: [
      {
        h: 'Anatomy of a log message',
        body: [
          "Cisco devices generate messages for interface changes, routing events, configuration changes, errors and debugs. Each one has a consistent layout:",
          { cli: [
            '000187: *Nov 15 02:14:09.331: %LINEPROTO-5-UPDOWN: Line protocol on Interface GigabitEthernet1/0/49, changed state to down',
          ] },
          { table: [
            ['Part', 'Example', 'Meaning'],
            ['Sequence number', '`000187:`', 'Optional (`service sequence-numbers`). Helps spot missing messages.'],
            ['Timestamp', '`*Nov 15 02:14:09.331:`', 'When it happened (`service timestamps log datetime msec`). A leading * means the clock is not synchronized.'],
            ['Facility', '`LINEPROTO`', 'The part of IOS that generated it: LINK, LINEPROTO, OSPF, SYS, SEC...'],
            ['Severity', '`5`', 'How serious, 0 to 7.'],
            ['Mnemonic', '`UPDOWN`', 'Short code for the specific event.'],
            ['Description', '`Line protocol on ...`', 'The human-readable detail.'],
          ] },
          { note: "That asterisk in front of the timestamp is the NTP lesson coming back to haunt you. Unsynced clocks make logs from different devices impossible to line up." },
        ],
      },
      {
        h: 'The eight severity levels',
        body: [
          { table: [
            ['Level', 'Keyword', 'Typical example'],
            ['0', 'Emergencies', 'System is unusable'],
            ['1', 'Alerts', 'Immediate action needed (for example, over temperature)'],
            ['2', 'Critical', 'Critical condition, hardware failure'],
            ['3', 'Errors', '%LINK-3-UPDOWN: interface changed state'],
            ['4', 'Warnings', 'Something odd, not yet broken'],
            ['5', 'Notifications', '%LINEPROTO-5-UPDOWN, %SYS-5-CONFIG_I'],
            ['6', 'Informational', 'Routine information, ACL log hits'],
            ['7', 'Debugging', 'Output of debug commands'],
          ] },
          "Lower number = more severe. A mnemonic many people use: **E**very **A**wesome **C**isco **E**ngineer **W**ill **N**eed **I**ce cream **D**aily. When you set a logging level, the device sends that level **and everything more severe**: `logging trap warnings` sends levels 0 through 4.",
          { svg: '<svg viewBox="0 0 360 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Setting level 4 sends levels 0 to 4" font-size="13" fill="currentColor"><g fill="none" stroke="currentColor"><rect x="10" y="30" width="40" height="34" rx="3"/><rect x="52" y="30" width="40" height="34" rx="3"/><rect x="94" y="30" width="40" height="34" rx="3"/><rect x="136" y="30" width="40" height="34" rx="3"/><rect x="178" y="30" width="40" height="34" rx="3"/><rect x="220" y="30" width="40" height="34" rx="3" stroke-dasharray="3 3"/><rect x="262" y="30" width="40" height="34" rx="3" stroke-dasharray="3 3"/><rect x="304" y="30" width="40" height="34" rx="3" stroke-dasharray="3 3"/><path d="M10 80h208" stroke-width="2.5" style="stroke:var(--accent)"/></g><text x="26" y="52">0</text><text x="68" y="52">1</text><text x="110" y="52">2</text><text x="152" y="52">3</text><text x="194" y="52">4</text><text x="236" y="52">5</text><text x="278" y="52">6</text><text x="320" y="52">7</text><text x="10" y="20">logging trap warnings (4)</text><text x="40" y="100">sent to the server</text><text x="226" y="100">filtered out</text></svg>' },
        ],
      },
      {
        h: 'Where messages go',
        body: [
          { table: [
            ['Destination', 'Command', 'Default'],
            ['Console line', '`logging console <level>`', 'On, level 7 (debugging)'],
            ['VTY / terminal lines', '`logging monitor <level>` plus `terminal monitor` in your SSH session', 'Not shown until you type terminal monitor'],
            ['Local RAM buffer', '`logging buffered [size] <level>`', 'View with `show logging`'],
            ['Syslog server', '`logging host 10.10.5.70` and `logging trap <level>`', 'UDP 514, level 6 (informational)'],
          ] },
          { cli: [
            'HPL-DIST2(config)# service timestamps log datetime msec',
            'HPL-DIST2(config)# service sequence-numbers',
            'HPL-DIST2(config)# logging buffered 32768 informational',
            'HPL-DIST2(config)# logging host 10.10.5.70',
            'HPL-DIST2(config)# logging trap warnings',
            'HPL-DIST2(config)# line console 0',
            'HPL-DIST2(config-line)# logging synchronous',
          ] },
          "`logging synchronous` stops log messages from chopping through the command you are typing; IOS reprints your line after the message. On the syslog server side, messages are also tagged with a syslog facility code (`local7` by default on IOS, changed with `logging facility`) so the server can sort them into files.",
          { cli: [
            'HPL-DIST2# show logging',
            'Syslog logging: enabled (0 messages dropped, 2 messages rate-limited, 0 flushes, 0 overruns)',
            '    Console logging: level debugging, 84 messages logged',
            '    Monitor logging: level debugging, 0 messages logged',
            '    Buffer logging:  level informational, 84 messages logged',
            '    Trap logging: level warnings, 31 message lines logged',
            '        Logging to 10.10.5.70  (udp port 514, audit disabled,',
            '              link up),',
            '              12 message lines logged,',
            '...',
          ] },
        ],
      },
    ],
    techNotes: [
      "SSH in and see nothing while a link flaps? You forgot `terminal monitor`. It is per session, so you forget it every single time.",
      "Do not leave debugging on with console logging at level 7 on a busy router. The console runs at 9600 baud and the CPU will happily melt trying to print.",
      "Severity 5 configuration messages (`%SYS-5-CONFIG_I`) tell you who changed what and when. Great evidence in post-incident reviews.",
    ],
    examTraps: [
      "Level 0 is the most severe, level 7 the least. Setting a level includes all lower numbers.",
      "Syslog uses UDP 514.",
      "Know the names in order: emergencies, alerts, critical, errors, warnings, notifications, informational, debugging.",
      "`terminal monitor` is needed to see logs over SSH/Telnet; the console sees them by default.",
    ],
    tryIt: [
      { device: 'router', mode: 'config', prompt: "Turn on logging synchronous on the console, then bounce an interface and watch the log messages. Note the facility, severity and mnemonic in each one.", cmds: ['line console 0', 'logging synchronous', 'exit', 'interface g0/1', 'shutdown', 'no shutdown', 'end'] },
    ],
    check: [
      ['Which syslog severity level is `warnings`?', ['2', '3', '4', '5'], 2, "The order is 0 emergencies, 1 alerts, 2 critical, 3 errors, 4 warnings, 5 notifications, 6 informational, 7 debugging."],
      ['An administrator configures `logging trap notifications`. Which messages reach the syslog server?', ['Only level 5', 'Levels 5 through 7', 'Levels 0 through 5', 'Levels 0 through 7'], 2, "A configured severity includes that level and every more severe (lower numbered) level, so 0 to 5. Informational and debugging are filtered out."],
      ['In `%OSPF-5-ADJCHG: Process 1, Nbr 2.2.2.2 on Gi0/1 from LOADING to FULL`, what does OSPF represent?', ['The severity', 'The facility', 'The mnemonic', 'The syslog server'], 1, "The format is %FACILITY-SEVERITY-MNEMONIC. OSPF is the facility, 5 is notifications, ADJCHG is the mnemonic."],
    ],
    related: { tickets: [], cards: ['syslog', 'ntp'], hw: null, drill: false },
  });

  L.push({
    id: 'l4-6',
    obj: '4.6',
    domain: 'svc',
    title: 'DHCP client and relay: getting broadcasts across the river',
    minutes: 14,
    caseFile: "The scanners from earlier this week are stuck on 169.254 again, this time in the new VLAN 40 at the Fairfield yard. The DHCP server lives in the data center, three router hops away, and DHCP Discovers are broadcasts that routers drop. Also, the new branch router needs to get its own WAN address from the ISP by DHCP. Two configs, both tonight.",
    sections: [
      {
        h: 'Why a relay is needed',
        body: [
          "A DHCP client starts with no address and broadcasts its Discover to 255.255.255.255. Routers do not forward broadcasts between subnets, so a client can only reach a DHCP server on its own segment. Putting a DHCP server in every VLAN is silly. Instead, the router (or Layer 3 switch) that is the client's default gateway acts as a **DHCP relay agent**.",
          { list: [
            "1. The client broadcasts a Discover on VLAN 40.",
            "2. The gateway interface receives it and, because it has `ip helper-address`, rewrites it as a **unicast** to the DHCP server's IP.",
            "3. It sets the **giaddr** (gateway IP address) field to its own interface address, 10.40.0.1. The server uses giaddr to pick the right pool (the one whose network contains 10.40.0.1) and to know where to send the reply.",
            "4. The server replies to the relay; the relay passes the Offer back onto VLAN 40. Same for Request and Ack.",
          ] },
          { svg: '<svg viewBox="0 0 360 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="DHCP relay turns a broadcast into a unicast" font-size="13" fill="currentColor"><g fill="none" stroke="currentColor"><rect x="6" y="70" width="70" height="40" rx="6"/><rect x="140" y="64" width="90" height="52" rx="6" stroke-width="2.5" style="stroke:var(--accent)"/><rect x="286" y="70" width="68" height="40" rx="6"/><path d="M76 90h64M230 90h56"/></g><text x="14" y="94">Scanner</text><text x="150" y="86">Relay</text><text x="150" y="104">10.40.0.1</text><text x="292" y="94">DHCP srv</text><text x="4" y="40">Discover</text><text x="4" y="56">to 255.255.255.255</text><text x="196" y="40">unicast to 10.10.5.15</text><text x="196" y="56">giaddr 10.40.0.1</text><text x="100" y="150">helper-address on the</text><text x="100" y="168">client-facing interface</text></svg>' },
        ],
      },
      {
        h: 'Relay configuration',
        body: [
          "Put the helper address on the interface (or SVI or subinterface) that **receives the client broadcasts**, the client's default gateway. Not the interface toward the server.",
          { cli: [
            'HPL-FAIRFIELD(config)# interface GigabitEthernet0/0.40',
            'HPL-FAIRFIELD(config-subif)# encapsulation dot1Q 40',
            'HPL-FAIRFIELD(config-subif)# ip address 10.40.0.1 255.255.255.0',
            'HPL-FAIRFIELD(config-subif)# ip helper-address 10.10.5.15',
            '',
            'HPL-FAIRFIELD# show ip interface GigabitEthernet0/0.40 | include Helper',
            '  Helper address is 10.10.5.15',
          ] },
          "The server must have a pool for 10.40.0.0/24 and a route back to 10.40.0.1. By default `ip helper-address` also forwards a few other UDP broadcasts (such as TFTP, DNS, TACACS, time and NetBIOS), which is occasionally surprising. You can list more than one helper address for redundancy.",
        ],
      },
      {
        h: 'Router as a DHCP client',
        body: [
          "The new branch router's ISP hands out addresses by DHCP, just as a home modem does. One command on the WAN interface:",
          { cli: [
            'HPL-BRANCH(config)# interface GigabitEthernet0/1',
            'HPL-BRANCH(config-if)# ip address dhcp',
            'HPL-BRANCH(config-if)# no shutdown',
            '%DHCP-6-ADDRESS_ASSIGN: Interface GigabitEthernet0/1 assigned DHCP address 198.51.100.66, mask 255.255.255.224, hostname HPL-BRANCH',
            '',
            'HPL-BRANCH# show ip interface brief',
            'Interface              IP-Address      OK? Method Status                Protocol',
            'GigabitEthernet0/0     10.60.0.1       YES manual up                    up',
            'GigabitEthernet0/1     198.51.100.66   YES DHCP   up                    up',
            '',
            'HPL-BRANCH# show dhcp lease',
            'Temp IP addr: 198.51.100.66  for peer on Interface: GigabitEthernet0/1',
            'Temp  sub net mask: 255.255.255.224',
            '   DHCP Lease server: 198.51.100.65, state: 5 Bound',
            '   Lease: 86400 secs,  Renewal: 43200 secs,  Rebind: 75600 secs',
            'Temp default-gateway addr: 198.51.100.65',
          ] },
          "If the server supplies a default gateway (option 3), IOS installs a default static route toward it with administrative distance **254**, so any default route you configure yourself wins. The Method column changes from `manual` to `DHCP`. A Layer 2 switch can also get its management address by DHCP with `ip address dhcp` on its management SVI.",
        ],
      },
      {
        h: 'Verifying from the client',
        body: [
          { cli: [
            'C:\\> ipconfig /release',
            'C:\\> ipconfig /renew',
            'C:\\> ipconfig /all',
            '   DHCP Enabled. . . . . . . . . . . : Yes',
            '   IPv4 Address. . . . . . . . . . . : 10.40.0.23(Preferred)',
            '   Subnet Mask . . . . . . . . . . . : 255.255.255.0',
            '   Default Gateway . . . . . . . . . : 10.40.0.1',
            '   DHCP Server . . . . . . . . . . . : 10.10.5.15',
          ] },
          "Notice the DHCP Server field shows the real server, not the relay. On macOS use `ipconfig getpacket en0`; on Linux `ip addr` and the DHCP client logs, or `dhclient -r` then `dhclient`.",
        ],
      },
    ],
    techNotes: [
      "Helper address on the wrong interface is the single most common relay mistake. It belongs on the side where the clients live.",
      "If relay is configured and clients still fail, check the server has a pool matching the giaddr subnet. A server with no matching pool silently ignores the request.",
      "DHCP snooping on the access switch can drop relayed traffic if trust is wrong. If you just enabled snooping, look there next.",
    ],
    examTraps: [
      "`ip helper-address` points at the DHCP **server**, configured on the **client-facing** interface.",
      "The relay sets giaddr; the server uses it to choose the pool.",
      "`ip address dhcp` is an interface command, not a global one.",
      "A DHCP-learned default route has AD 254.",
    ],
    tryIt: [
      { device: 'router', mode: 'config', prompt: "Configure this router as a DHCP relay on its LAN interface and as a DHCP client on its WAN interface, then check the running config.", cmds: ['interface g0/0', 'ip helper-address 10.10.5.15', 'interface g0/1', 'ip address dhcp', 'no shutdown', 'end', 'show running-config'] },
    ],
    check: [
      ['Clients on VLAN 30 (gateway SVI 10.30.0.1) must get addresses from a server at 10.1.1.50. Where is `ip helper-address 10.1.1.50` configured?', ['On the DHCP server', 'On interface Vlan30 of the Layer 3 switch', 'On the interface facing the DHCP server', 'In global configuration mode'], 1, "The relay must catch the client broadcasts, so the helper goes on the client-facing interface: the VLAN 30 SVI."],
      ['How does a DHCP server know which pool to use for a relayed request?', ['From the client MAC address', 'From the giaddr field set by the relay agent', 'From the destination port', 'From the option 82 circuit ID only'], 1, "The relay agent puts its receiving interface address in giaddr. The server picks the pool whose subnet contains that address."],
      ['A router interface is configured with `ip address dhcp`. Which column of `show ip interface brief` confirms the address came from DHCP?', ['OK?', 'Method', 'Status', 'Protocol'], 1, "The Method column shows DHCP for DHCP-learned addresses and manual for configured ones."],
    ],
    related: { tickets: ['t10', 't23'], cards: ['dhcp'], hw: null, drill: false },
  });

  L.push({
    id: 'l4-7',
    obj: '4.7',
    domain: 'svc',
    title: 'QoS: who goes first when the dock is jammed',
    minutes: 18,
    caseFile: "Every afternoon at 4:30 the dispatchers' phone calls turn robotic, right when the warehouse uploads the day's photos of damaged pallets over the 50 Mbps WAN. More bandwidth costs money Rosa does not have. Quality of Service is how you make the phones win without buying a bigger pipe.",
    sections: [
      {
        h: 'What QoS fixes',
        body: [
          "QoS only matters when a link is **congested**: more traffic wants to leave an interface than it can send, so packets wait in a queue. Four things then get worse:",
          { list: [
            "**Bandwidth:** how much each kind of traffic gets.",
            "**Delay (latency):** how long a packet takes end to end.",
            "**Jitter:** variation in delay. Voice and video hate it.",
            "**Loss:** packets dropped when queues overflow.",
          ] },
          "Interactive voice is the fussiest. Common design targets are one-way delay at or under 150 ms, jitter at or under 30 ms, and loss at or under 1 percent. A file upload does not care if it takes an extra second. QoS lets you treat them differently.",
          "The CCNA calls the treatment a packet gets at each router or switch its **per-hop behavior (PHB)**. Each device makes its own decision; there is no end-to-end reservation.",
        ],
      },
      {
        h: 'Step 1: classification and marking',
        body: [
          "**Classification** sorts packets into classes by looking at them: ACL matches, ingress interface, or deep inspection with NBAR (Network Based Application Recognition). **Marking** writes a value into the header so the next devices do not have to classify again; they just read the mark.",
          { table: [
            ['Field', 'Where', 'Bits', 'Values'],
            ['PCP / CoS', '802.1Q tag (Layer 2, trunks only)', '3', '0-7 (voice usually 5)'],
            ['IP Precedence', 'First 3 bits of the IPv4 ToS byte', '3', '0-7 (legacy)'],
            ['DSCP', 'First 6 bits of the ToS / DS field (IPv4) or Traffic Class (IPv6)', '6', '0-63'],
          ] },
          "Standard DSCP values you need:",
          { list: [
            "**EF (Expedited Forwarding) = 46:** voice. Low delay, low loss.",
            "**AFxy (Assured Forwarding):** four classes (x = 1-4) with three drop precedences (y = 1-3). Higher y = dropped first under congestion. Decimal value = 8x + 2y, so AF41 = 34, AF31 = 26, AF11 = 10.",
            "**CSx (Class Selector):** 8 times x (CS3 = 24, CS6 = 48). Backward compatible with IP Precedence.",
            "**DF / BE (Default) = 0:** best effort, everything else.",
          ] },
          "A **trust boundary** is the point where you start believing marks. Typically the access switch trusts the marking from a Cisco IP phone but not from the PC plugged into the phone, because anyone can mark their torrent traffic EF.",
        ],
      },
      {
        h: 'Step 2: queuing and scheduling',
        body: [
          "When the interface is busy, packets wait in queues. The scheduler decides which queue sends next.",
          { list: [
            "**FIFO:** one queue, first come first served. The default on fast interfaces. No QoS at all.",
            "**CBWFQ (class-based weighted fair queuing):** each class gets its own queue and a guaranteed minimum share of bandwidth. Shared round-robin style.",
            "**LLQ (low latency queuing):** CBWFQ plus one **strict priority queue** that always sends first. Put voice there. The priority queue is policed to its configured rate so it cannot starve everything else.",
          ] },
          { svg: '<svg viewBox="0 0 360 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="LLQ with a priority queue and CBWFQ queues feeding one interface" font-size="13" fill="currentColor"><g fill="none" stroke="currentColor"><rect x="10" y="80" width="70" height="40" rx="4"/><rect x="110" y="20" width="110" height="30" rx="3" stroke-width="2.5" style="stroke:var(--accent)"/><rect x="110" y="64" width="110" height="30" rx="3"/><rect x="110" y="108" width="110" height="30" rx="3"/><rect x="110" y="152" width="110" height="30" rx="3"/><circle cx="262" cy="100" r="20"/><rect x="300" y="86" width="50" height="28" rx="3"/><path d="M80 100l30-65M80 100l30-21M80 100l30 23M80 100l30 67M220 35l28 50M220 79l23 14M220 123l23-14M220 167l28-50M282 100h18"/></g><text x="18" y="104">classify</text><text x="116" y="40">EF voice: priority</text><text x="116" y="84">AF41 video 30%</text><text x="116" y="128">AF21 apps 20%</text><text x="116" y="172">default: the rest</text><text x="248" y="105">sch</text><text x="304" y="104">WAN</text><text x="230" y="16" font-size="12">always first</text></svg>' },
        ],
      },
      {
        h: 'Step 3: congestion avoidance',
        body: [
          "When a queue fills, the default is **tail drop**: every new packet is dropped. That hits all TCP flows at once, they all slow down together, then all speed up together, a sawtooth called **TCP global synchronization** that wastes bandwidth.",
          "**RED (random early detection)** and **WRED (weighted RED)** start dropping a few packets randomly *before* the queue is full, so only some TCP flows back off. WRED drops lower-priority marks (like AF13 before AF11) more aggressively.",
        ],
      },
      {
        h: 'Policing vs shaping',
        body: [
          { table: [
            ['', 'Policing', 'Shaping'],
            ['What it does', 'Drops or re-marks traffic above the rate', 'Buffers traffic above the rate and sends it later'],
            ['Effect on delay', 'None added', 'Adds delay and possibly jitter'],
            ['Typical place', 'Inbound at a provider edge, or limiting a class', 'Outbound on the customer side to match the contracted rate'],
            ['Traffic shape', 'Leaves bursts jagged (cuts the peaks off)', 'Smooths bursts'],
          ] },
          "Harbor Point buys 50 Mbps on a 1 Gbps physical port. The provider polices at 50 Mbps and drops anything over. If Harbor Point **shapes** its outbound traffic to 50 Mbps, the excess waits in Harbor Point's own queues, where LLQ can make sure voice goes first, instead of being randomly dropped by the provider.",
        ],
      },
      {
        h: 'What the config looks like (MQC)',
        body: [
          "Cisco uses the Modular QoS CLI: a class-map classifies, a policy-map says what to do per class, a service-policy applies it to an interface. You do not need to write this for the exam, but recognize the pieces.",
          { cli: [
            'class-map match-any VOICE',
            ' match dscp ef',
            'policy-map WAN-OUT',
            ' class VOICE',
            '  priority percent 20',
            ' class class-default',
            '  fair-queue',
            'interface GigabitEthernet0/1',
            ' service-policy output WAN-OUT',
          ] },
        ],
      },
    ],
    techNotes: [
      "QoS does nothing on an uncongested link. If calls are bad on a link at 10 percent utilization, the problem is somewhere else (duplex mismatch, a bad cable, Wi-Fi).",
      "Mark as close to the source as possible, then trust the mark everywhere inside the network.",
      "Do not put more than about a third of the link in the priority queue. If everything is priority, nothing is.",
    ],
    examTraps: [
      "DSCP is 6 bits (64 values). IP Precedence and CoS are 3 bits (8 values).",
      "EF = DSCP 46 is for voice. AF41 = 34.",
      "Policing drops or re-marks; shaping buffers. Shaping adds delay.",
      "LLQ = strict priority queue for voice; CBWFQ = guaranteed bandwidth per class, no strict priority.",
      "WRED addresses TCP global synchronization caused by tail drop.",
    ],
    check: [
      ['Which DSCP value is normally used for voice traffic?', ['AF41 (34)', 'CS3 (24)', 'EF (46)', 'DF (0)'], 2, "Expedited Forwarding, DSCP 46, is the standard voice marking. AF41 is commonly used for interactive video, CS3 for call signaling, and 0 is best effort."],
      ['A provider drops traffic above the contracted rate. What should the customer configure outbound so excess traffic is delayed rather than dropped?', ['Policing', 'Shaping', 'WRED', 'Tail drop'], 1, "Shaping buffers traffic above a rate and releases it later, so it fits under the provider's policer. Policing would drop it on the customer side, and WRED and tail drop are drop behaviors."],
      ['Which queuing method gives voice a strict priority queue while also guaranteeing bandwidth to other classes?', ['FIFO', 'CBWFQ', 'LLQ', 'RED'], 2, "LLQ adds a policed strict-priority queue to CBWFQ. CBWFQ alone has no strict priority, FIFO has one queue, and RED is congestion avoidance, not scheduling."],
    ],
    related: { tickets: [], cards: ['qos'], hw: null, drill: false },
  });

  L.push({
    id: 'l4-8',
    obj: '4.8',
    domain: 'svc',
    title: 'SSH: locking the remote door',
    minutes: 14,
    caseFile: "A security audit found that the dock switches still accept Telnet, which means usernames and passwords cross the warehouse network in clear text. Theo ran a packet capture during the audit and could read the admin password. Tonight you replace Telnet with SSH version 2 on every device you touch.",
    sections: [
      {
        h: 'Why SSH',
        body: [
          "**Telnet** (TCP 23) gives you a remote CLI but sends everything, including the password, unencrypted. **SSH** (Secure Shell, TCP 22) gives you the same CLI inside an encrypted, authenticated session. SSH version 2 is the one to use; version 1 has known weaknesses.",
          { svg: '<svg viewBox="0 0 360 140" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Telnet sends readable text, SSH sends encrypted text" font-size="13" fill="currentColor"><g fill="none" stroke="currentColor"><rect x="6" y="20" width="70" height="36" rx="4"/><rect x="284" y="20" width="70" height="36" rx="4"/><rect x="6" y="84" width="70" height="36" rx="4"/><rect x="284" y="84" width="70" height="36" rx="4"/><path d="M76 38h208"/><path d="M76 102h208" stroke-width="4" style="stroke:var(--accent)"/></g><text x="22" y="43">Laptop</text><text x="294" y="43">Switch</text><text x="22" y="107">Laptop</text><text x="294" y="107">Switch</text><text x="84" y="32">Telnet 23: password D0ck4</text><text x="96" y="96">SSH 22: 8f#Q@1z!k...</text></svg>' },
        ],
      },
      {
        h: 'The configuration, step by step',
        body: [
          "SSH needs an RSA key pair, and IOS names the key from the hostname and domain name, so both must be set first.",
          { cli: [
            'Switch(config)# hostname HPL-DOCK3',
            'HPL-DOCK3(config)# ip domain name harborpoint.local',
            'HPL-DOCK3(config)# crypto key generate rsa modulus 2048',
            'The name for the keys will be: HPL-DOCK3.harborpoint.local',
            '',
            '% The key modulus size is 2048 bits',
            '% Generating 2048 bit RSA keys, keys will be non-exportable...',
            '[OK] (elapsed time was 2 seconds)',
            '',
            'HPL-DOCK3(config)# ip ssh version 2',
            'HPL-DOCK3(config)# username ty privilege 15 secret N1ghtSh1ft!',
            'HPL-DOCK3(config)# line vty 0 15',
            'HPL-DOCK3(config-line)# login local',
            'HPL-DOCK3(config-line)# transport input ssh',
            'HPL-DOCK3(config-line)# exec-timeout 10 0',
          ] },
          { list: [
            "**hostname and ip domain name:** required to generate keys. The default hostname 'Switch' or 'Router' is refused.",
            "**crypto key generate rsa:** creates the key pair and enables SSH. SSH version 2 needs a modulus of at least 768 bits; use 2048 or more.",
            "**ip ssh version 2:** refuse SSHv1 clients. Without it IOS may show 'SSH 1.99', meaning both versions are accepted.",
            "**username ... secret:** a local account. `secret` stores a hash; avoid `password`.",
            "**login local:** VTY lines use the local user database instead of a single line password.",
            "**transport input ssh:** VTY lines accept only SSH. Telnet is refused.",
          ] },
          "A switch also needs a management IP (an SVI such as `interface vlan 99`) and `ip default-gateway` so you can reach it from other subnets. To limit who can even try, apply a standard ACL to the VTY lines: `access-class 15 in`.",
        ],
      },
      {
        h: 'Verification',
        body: [
          { cli: [
            'HPL-DOCK3# show ip ssh',
            'SSH Enabled - version 2.0',
            'Authentication methods:publickey,keyboard-interactive,password',
            'Authentication timeout: 120 secs; Authentication retries: 3',
            'Minimum expected Diffie Hellman key size : 2048 bits',
            '',
            'HPL-DOCK3# show ssh',
            'Connection Version Mode Encryption  Hmac         State           Username',
            '0          2.0     IN   aes256-ctr  hmac-sha2-256 Session started ty',
            '0          2.0     OUT  aes256-ctr  hmac-sha2-256 Session started ty',
          ] },
          "From a workstation: `ssh -l ty 10.99.0.13` or `ssh ty@10.99.0.13`. From another Cisco device: `ssh -l ty 10.99.0.13`. If Telnet still connects, you missed `transport input ssh` on some VTY range (switches often have `line vty 5 15` as a separate block).",
        ],
      },
    ],
    techNotes: [
      "Configure SSH from the console or keep your Telnet session open until SSH is confirmed working. Locking yourself out of a switch in the far end of the yard at 3 a.m. means a long walk.",
      "Use `line vty 0 15`, not `0 4`. Leaving lines 5-15 with Telnet open is the classic audit finding.",
      "`exec-timeout` stops abandoned sessions from sitting logged in forever.",
    ],
    examTraps: [
      "SSH is TCP 22, Telnet TCP 23.",
      "You need both a hostname (not the default) and a domain name before generating RSA keys.",
      "`login local` uses usernames; plain `login` uses the line password. With `login local` and no usernames configured, nobody can log in.",
      "`transport input ssh` blocks Telnet; `transport input all` allows both.",
    ],
    tryIt: [
      { device: 'router', mode: 'config', prompt: "Set up SSH version 2 with a local user and lock the VTY lines to SSH only, then verify.", cmds: ['hostname HPL-LAB', 'ip domain name harborpoint.local', 'crypto key generate rsa modulus 2048', 'ip ssh version 2', 'username ty secret N1ghtSh1ft', 'line vty 0 15', 'login local', 'transport input ssh', 'end', 'show ip ssh'] },
    ],
    check: [
      ['Which two items must be configured before `crypto key generate rsa` will create keys? (Pick the pair.)', ['Enable secret and a VTY password', 'A non-default hostname and an IP domain name', 'A local username and login local', 'An SVI and a default gateway'], 1, "The RSA key is named hostname.domain, so IOS needs a hostname other than the default and a domain name. The other items are needed for logins and reachability, but not for key generation."],
      ['Which line configuration allows SSH and refuses Telnet?', ['transport input telnet', 'transport input all', 'transport input ssh', 'transport output ssh'], 2, "`transport input ssh` restricts inbound VTY sessions to SSH. `transport output` controls outbound sessions from the device."],
      ['After configuring SSH, `show ip ssh` shows `SSH Enabled - version 1.99`. What does that mean?', ['Only SSHv1 is allowed', 'Both SSHv1 and SSHv2 are accepted', 'SSH is disabled', 'The RSA key is too small'], 1, "1.99 indicates compatibility mode: both versions are accepted. `ip ssh version 2` limits it to version 2."],
    ],
    related: { tickets: ['t14'], cards: ['ssh', 'secfund'], hw: null, drill: false },
  });

  L.push({
    id: 'l4-9',
    obj: '4.9',
    domain: 'svc',
    title: 'TFTP and FTP: moving files on and off the gear',
    minutes: 11,
    caseFile: "Tonight is upgrade night. HPL-EDGE needs a new IOS image and a backup of its configuration before anyone touches it. The image sits on the NOC file server, which offers both TFTP and FTP. Which one, and why does the TFTP copy of a 500 MB image take so long that Kenji went for a second coffee?",
    sections: [
      {
        h: 'Why network devices need file transfer',
        body: [
          "Routers and switches store their IOS image and configuration files in flash and NVRAM. You need to copy files on and off them to **upgrade IOS**, **back up configurations** before changes, **restore** a config after a hardware swap, and push files to many devices. IOS supports several protocols for this. The CCNA focuses on TFTP and FTP.",
        ],
      },
      {
        h: 'TFTP vs FTP',
        body: [
          { table: [
            ['', 'TFTP', 'FTP'],
            ['Transport', 'UDP port 69', 'TCP: port 21 control, port 20 data (active mode)'],
            ['Authentication', 'None', 'Username and password (sent in clear text)'],
            ['Directory listing, rename, delete', 'No', 'Yes'],
            ['Reliability', 'Its own: each block is acknowledged before the next (lock-step)', 'TCP handles it'],
            ['Speed on big files', 'Slow (small blocks, one at a time)', 'Faster'],
            ['Typical use', 'Small files, phone configs, quick lab backups', 'IOS images, larger transfers'],
          ] },
          "TFTP is 'trivial' on purpose: tiny, simple, easy to embed. That is also why it is slow for a big image and has no security. Anyone who can reach the TFTP server can read or overwrite files.",
          "FTP uses two connections. The **control** connection (TCP 21) carries commands. **Active mode:** the server opens the data connection from its port 20 back to the client. **Passive mode:** the client opens the data connection to a port the server names, which works better through firewalls and NAT.",
          { svg: '<svg viewBox="0 0 360 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="FTP control and data connections versus TFTP lock-step blocks" font-size="13" fill="currentColor"><g fill="none" stroke="currentColor"><path d="M40 24v136M150 24v136M220 24v136M330 24v136"/><path d="M40 50h104M144 44l6 6-6 6"/><path d="M150 90H46M46 84l-6 6 6 6" stroke-dasharray="5 3"/><path d="M220 46h104M324 40l6 6-6 6"/><path d="M330 70H226M226 64l-6 6 6 6"/><path d="M220 100h104M324 94l6 6-6 6"/><path d="M330 124H226M226 118l-6 6 6 6"/></g><text x="22" y="18">client</text><text x="128" y="18">FTP srv</text><text x="200" y="18">client</text><text x="300" y="18">TFTP srv</text><text x="46" y="44">TCP 21 control</text><text x="50" y="110">TCP 20 data</text><text x="50" y="126">(active mode)</text><text x="230" y="40">block 1</text><text x="240" y="64">ACK 1</text><text x="230" y="94">block 2</text><text x="240" y="118">ACK 2</text><text x="222" y="150">UDP 69, lock-step</text></svg>' },
          "Secure alternatives you should know exist: **SCP** and **SFTP** (both run over SSH, TCP 22) and **FTPS** (FTP over TLS). In production, prefer them.",
        ],
      },
      {
        h: 'IOS copy commands',
        body: [
          "Back up the configuration to TFTP:",
          { cli: [
            'HPL-EDGE# copy running-config tftp:',
            'Address or name of remote host []? 10.10.5.25',
            'Destination filename [hpl-edge-confg]?',
            '!!',
            '3214 bytes copied in 0.512 secs (6277 bytes/sec)',
          ] },
          "Pull a new image with FTP. Credentials can be set globally or in the URL:",
          { cli: [
            'HPL-EDGE(config)# ip ftp username noc',
            'HPL-EDGE(config)# ip ftp password Upgr4deN1ght',
            'HPL-EDGE(config)# end',
            'HPL-EDGE# copy ftp://10.10.5.25/isr4300-universalk9.17.09.05a.SPA.bin flash:',
            'Destination filename [isr4300-universalk9.17.09.05a.SPA.bin]?',
            'Accessing ftp://10.10.5.25/isr4300-universalk9.17.09.05a.SPA.bin...',
            'Loading isr4300-universalk9.17.09.05a.SPA.bin !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!',
            '[OK - 598172512/4096 bytes]',
            '',
            'HPL-EDGE# show flash: | include .bin',
            'HPL-EDGE# verify /md5 flash:isr4300-universalk9.17.09.05a.SPA.bin',
          ] },
          "Then point the router at the new image and reload in a maintenance window:",
          { cli: [
            'HPL-EDGE(config)# boot system flash:isr4300-universalk9.17.09.05a.SPA.bin',
            'HPL-EDGE(config)# end',
            'HPL-EDGE# copy running-config startup-config',
            'HPL-EDGE# reload',
          ] },
          { note: "Check free flash with `show flash:` before you copy, and verify the file's MD5 or SHA hash against the one published by the vendor. A truncated image that fails to boot turns an upgrade into a recovery." },
        ],
      },
    ],
    techNotes: [
      "Always back up the running config before an upgrade. Always. Even when Kenji says it is just a quick one.",
      "TFTP has no login, so lock the server down with firewall rules to the management subnet only.",
      "Some old platforms cannot TFTP files over 32 MB because of the block counter. Another reason big images go over FTP or SCP.",
    ],
    examTraps: [
      "TFTP uses UDP 69 and has no authentication. FTP uses TCP 20 and 21 and has username/password authentication (in clear text).",
      "TFTP gets reliability from its own acknowledgments, not from TCP.",
      "FTP can list directories; TFTP cannot.",
      "In active FTP the server opens the data connection; in passive FTP the client does.",
    ],
    check: [
      ['Which protocol uses UDP port 69 and provides no authentication?', ['FTP', 'SFTP', 'TFTP', 'SCP'], 2, "TFTP runs over UDP 69 with no login. FTP uses TCP 21/20 with credentials, while SFTP and SCP run over SSH (TCP 22)."],
      ['Which statement about FTP is true?', ['It uses a single UDP connection', 'It uses separate control and data connections over TCP', 'It encrypts passwords by default', 'It cannot transfer IOS images'], 1, "FTP uses TCP 21 for control and a separate data connection. It sends credentials in clear text unless you use FTPS or SFTP instead."],
      ['How does TFTP make sure file blocks arrive?', ['TCP retransmissions', 'Each data block is acknowledged before the next is sent', 'It does not; lost blocks are ignored', 'It uses FTP for retries'], 1, "TFTP sits on UDP, so it adds a simple lock-step acknowledgment scheme. That reliability is also why it is slow for large files."],
    ],
    related: { tickets: [], cards: ['ftp', 'tcp', 'udp'], hw: null, drill: false },
  });

  /* ================================================================ *
   * 5.0 SECURITY FUNDAMENTALS
   * ================================================================ */

  L.push({
    id: 'l5-1',
    obj: '5.1',
    domain: 'sec',
    title: 'Threats, vulnerabilities, exploits: the vocabulary of bad nights',
    minutes: 15,
    caseFile: "Theo from security pins a printout to the break room board: an unpatched VPN appliance, a phishing email that got two clicks, and a strange flood of traffic toward the customer portal at 01:40. \"Classify these,\" he says, \"threat, vulnerability, exploit, mitigation.\" Get the words right and the rest of security makes sense.",
    sections: [
      {
        h: 'Four words that are not synonyms',
        body: [
          { table: [
            ['Term', 'Meaning', 'Harbor Point example'],
            ['Vulnerability', 'A weakness that could be used to cause harm', 'The VPN appliance runs firmware with a known flaw.'],
            ['Exploit', 'A tool or technique that takes advantage of a vulnerability', 'A public script that uses that flaw to get a shell.'],
            ['Threat', 'The potential for someone or something to exploit a vulnerability', 'A criminal group scanning the internet for that appliance.'],
            ['Mitigation', 'An action that reduces the chance or impact', 'Patch the firmware, restrict management access, monitor logs.'],
          ] },
          "Security work tries to protect three properties, the **CIA triad**: **confidentiality** (only authorized people can read data), **integrity** (data is not altered without detection), and **availability** (systems are up when needed). Every attack hits at least one of them.",
          { svg: '<svg viewBox="0 0 360 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A threat uses an exploit against a vulnerability; mitigation breaks the chain" font-size="13" fill="currentColor"><g fill="none" stroke="currentColor"><rect x="4" y="40" width="80" height="40" rx="6"/><rect x="138" y="40" width="80" height="40" rx="6"/><rect x="272" y="40" width="84" height="40" rx="6"/><path d="M84 60h54M218 60h54M130 54l8 6-8 6M264 54l8 6-8 6"/><path d="M244 100v-34" stroke-width="3" style="stroke:var(--accent)"/></g><text x="20" y="64">Threat</text><text x="152" y="64">Exploit</text><text x="280" y="64">Vulnerable</text><text x="200" y="120">Mitigation breaks</text><text x="200" y="138">the chain here</text><text x="90" y="30" font-size="12">uses</text><text x="226" y="30" font-size="12">against</text></svg>' },
        ],
      },
      {
        h: 'Common attacks you need to recognize',
        body: [
          { table: [
            ['Attack', 'What happens'],
            ['DoS / DDoS', 'Flood a target so legitimate users cannot reach it. DDoS uses many sources, often a botnet. Hits availability.'],
            ['Spoofing', 'Faking a source identity: IP, MAC or DHCP server. Often a building block for other attacks.'],
            ['Reflection / amplification', 'Send small requests with a spoofed source (the victim) to servers that reply with large answers, such as open DNS or NTP servers. The victim gets the flood.'],
            ['Man-in-the-middle (on-path)', 'The attacker sits between two parties and reads or changes traffic, for example with ARP spoofing or a rogue DHCP server handing out itself as the gateway.'],
            ['Reconnaissance', 'Gathering information first: ping sweeps, port scans, public records, social media. Not an attack by itself, but the first step.'],
            ['Malware', 'Virus (attaches to files, needs a user to run it), worm (spreads by itself across the network), trojan (pretends to be legitimate software), ransomware (encrypts data for a ransom).'],
            ['Social engineering', 'Manipulating people: phishing (mass email), spear phishing (targeted), whaling (executives), vishing (voice), smishing (SMS), tailgating (following someone through a door), watering hole (infecting a site the targets visit).'],
            ['Password attacks', 'Guessing (dictionary, brute force), credential stuffing with leaked passwords, sniffing clear-text protocols.'],
          ] },
        ],
      },
      {
        h: 'Mitigation techniques by layer',
        body: [
          "No single control stops everything, so networks stack them: **defense in depth**.",
          { list: [
            "**Patch and harden:** update firmware, turn off unused services, change defaults. The VPN appliance fix.",
            "**Control access:** strong authentication, MFA, AAA, least privilege, SSH not Telnet, management ACLs.",
            "**Filter traffic:** ACLs, firewalls and next-generation firewalls (NGFW), intrusion prevention systems (IPS) that match attack signatures.",
            "**Protect Layer 2:** DHCP snooping, dynamic ARP inspection and port security stop spoofing and on-path attacks on the LAN.",
            "**Encrypt:** IPsec VPNs, TLS, SSH, WPA2/WPA3 protect confidentiality and integrity.",
            "**Train people:** phishing awareness is a mitigation too (lesson 5.2).",
            "**Detect and respond:** syslog, SNMP, NetFlow and a SIEM so you notice the 01:40 flood while it is happening.",
          ] },
          { note: "Theo's answers: the unpatched appliance is a vulnerability; the phishing email is a social engineering threat (it became an exploit when someone clicked); the 01:40 flood looks like a DDoS against availability; patching, MFA and rate limiting are the mitigations." },
        ],
      },
    ],
    techNotes: [
      "Most incidents at companies like Harbor Point start with a phished password or an unpatched internet-facing box. The exotic attacks are rarer than the boring ones.",
      "A worm is the one that does not need a human. If the exam says 'spreads automatically', pick worm.",
      "Reflection attacks rely on spoofed sources. Ingress filtering (dropping packets with source addresses that cannot be from that link) helps everyone.",
    ],
    examTraps: [
      "A vulnerability is the weakness; an exploit is what uses it; a threat is the potential danger. They are often swapped in answer choices.",
      "DoS attacks target availability, not confidentiality.",
      "Phishing is social engineering, not malware, even if the email carries malware.",
      "Reconnaissance is gathering information, not damaging anything.",
    ],
    check: [
      ['A switch runs firmware with a published flaw that allows remote code execution. What is the flaw?', ['A threat', 'A vulnerability', 'An exploit', 'A mitigation'], 1, "The weakness itself is the vulnerability. Code that uses it would be the exploit, and an attacker who might do so is the threat."],
      ['Which type of malware spreads from system to system across a network without user action?', ['Virus', 'Trojan', 'Worm', 'Phishing'], 2, "Worms self-propagate. Viruses need a user to run an infected file, trojans disguise themselves as legitimate software, and phishing is social engineering, not malware."],
      ['An attacker sends DNS queries with the victim address as the source to many open resolvers, which send large responses to the victim. What is this?', ['Man-in-the-middle', 'Reflection and amplification', 'Brute force', 'Tailgating'], 1, "Spoofed small requests turned into large responses aimed at a victim are a reflection/amplification DDoS."],
    ],
    related: { tickets: [], cards: ['secfund'], hw: null, drill: false },
  });

  L.push({
    id: 'l5-2',
    obj: '5.2',
    domain: 'sec',
    title: 'Security programs: people, training and locked doors',
    minutes: 10,
    caseFile: "At 21:05 a friendly stranger in a hi-vis vest followed a forklift driver through the badge door into the main distribution frame room, \"to check the fire panel.\" He was gone before anyone asked. Rosa wants a proper security program, not just more firewall rules. Tonight: the human and physical side of security.",
    sections: [
      {
        h: 'Why a program and not just products',
        body: [
          "Firewalls cannot stop an employee from reading a password over the phone to a fake help desk, or a stranger walking up to a switch with a USB console cable. A **security program** is the organization's plan for protecting its assets: policies, people, training and physical controls, reviewed and improved over time. The CCNA names three elements.",
        ],
      },
      {
        h: 'User awareness',
        body: [
          "**Awareness** means making sure everyone knows that threats exist and what to watch for. It is broad and ongoing, aimed at all staff:",
          { list: [
            "Posters, short emails and login banners that remind people not to share passwords.",
            "**Phishing simulations**: the security team sends realistic fake phishing emails; people who click get a quick explanation instead of a disaster.",
            "Clear, easy ways to report something odd (a 'report phish' button, a help desk number).",
          ] },
        ],
      },
      {
        h: 'User training',
        body: [
          "**Training** is more formal and targeted: teaching specific people how to do specific tasks securely. Examples: teaching the help desk to verify identity before resetting a password, teaching developers secure coding, teaching the network team (you) to handle configs and credentials. Training often ends with a test or a certification, and is required by many compliance standards.",
          { table: [
            ['', 'Awareness', 'Training'],
            ['Audience', 'Everyone', 'Specific roles'],
            ['Goal', 'Recognize and report threats', 'Perform tasks securely'],
            ['Format', 'Reminders, simulations, short campaigns', 'Formal courses, labs, tests'],
          ] },
        ],
      },
      {
        h: 'Physical access control',
        body: [
          "If someone can touch the gear, they can unplug it, steal it, plug a rogue device into it, or use the console port for password recovery. Physical controls protect the rooms and racks:",
          { list: [
            "**Badge readers and locks** on wiring closets, MDF/IDF rooms and data centers, with entries logged.",
            "**Mantraps (access control vestibules):** two doors where the first must close before the second opens, so only one person enters per badge. Defeats tailgating.",
            "**Security guards, cameras and visitor logs.** Visitors escorted and badged.",
            "**Biometrics** (fingerprint, palm, face) for high-security rooms.",
            "**Locked racks and cabinets**, and disabling unused switch ports.",
          ] },
          { svg: '<svg viewBox="0 0 360 140" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A mantrap with two doors that cannot be open at the same time" font-size="13" fill="currentColor"><g fill="none" stroke="currentColor"><rect x="110" y="30" width="140" height="80" rx="4"/><path d="M110 50v40M250 50v40" stroke-width="4" style="stroke:var(--accent)"/></g><text x="16" y="74">Lobby</text><text x="140" y="74">vestibule</text><text x="270" y="74">MDF room</text><text x="60" y="130">door 1 must close before door 2 opens</text><text x="96" y="22">badge 1</text><text x="228" y="22">badge 2</text></svg>' },
          "The hi-vis visitor was a tailgating attack. Fixes: a vestibule or at least a 'no tailgating' policy that people are trained and empowered to enforce, plus a locked MDF rack.",
        ],
      },
    ],
    techNotes: [
      "Being polite is the attacker's best tool. Make it normal at Harbor Point to ask 'who are you here to see?'.",
      "Put the console ports of core gear behind locked doors. Password recovery needs physical access, so physical access is admin access.",
      "Report a phishing email even after you clicked it. Fast reports shrink the damage.",
    ],
    examTraps: [
      "Awareness targets all users; training targets specific roles and skills.",
      "Physical access control is part of a security program, not separate from it.",
      "A mantrap (access control vestibule) stops tailgating and piggybacking.",
    ],
    check: [
      ['The security team sends fake phishing emails to all staff and shows a short lesson to anyone who clicks. Which program element is this?', ['Physical access control', 'User awareness', 'Role-based training certification', 'Accounting'], 1, "Phishing simulations are a classic user awareness activity: broad, ongoing, aimed at recognizing threats. Formal role-specific courses would be training."],
      ['Which control best prevents an unauthorized person from following an employee into a data center?', ['Port security', 'A mantrap (access control vestibule)', 'An IPS', 'A password policy'], 1, "A vestibule lets only one person through per authentication, which defeats tailgating. The others are network or account controls."],
      ["Why does physical access to a router's console matter so much?", ['Consoles are always unencrypted Telnet', 'Someone with console access can perform password recovery', 'Console ports carry user data traffic', 'It does not matter if SSH is enabled'], 1, "Password recovery procedures require console access and a reboot, so physical access can bypass all configured passwords."],
    ],
    related: { tickets: [], cards: ['secfund'], hw: 'gear', drill: false },
  });

  L.push({
    id: 'l5-3',
    obj: '5.3',
    domain: 'sec',
    title: 'Local passwords: locking every way into the CLI',
    minutes: 15,
    caseFile: "The router you inherited from the Dundalk branch has no console password, `enable password cisco`, and VTY lines with the password `cisco` too. Dana calls it \"the welcome mat config.\" Tonight you lock the console, the privileged level and the remote lines, and you learn which password types are actually secure.",
    sections: [
      {
        h: 'Three doors into the CLI',
        body: [
          { list: [
            "**Console line** (`line console 0`): physical access through the console port.",
            "**VTY lines** (`line vty 0 15`): remote access through Telnet or SSH.",
            "**Privileged EXEC** (`enable`): the step from `>` to `#` where you can change anything.",
          ] },
          { svg: '<svg viewBox="0 0 360 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Console and VTY lines lead to user EXEC, enable leads to privileged EXEC" font-size="13" fill="currentColor"><g fill="none" stroke="currentColor"><rect x="6" y="20" width="96" height="36" rx="4"/><rect x="6" y="110" width="96" height="36" rx="4"/><rect x="140" y="64" width="90" height="36" rx="4"/><rect x="264" y="64" width="90" height="36" rx="4" stroke-width="2.5" style="stroke:var(--accent)"/><path d="M102 38l38 34M102 128l38-36M230 82h34"/></g><text x="14" y="42">console 0</text><text x="14" y="132">vty 0 15</text><text x="150" y="86">user EXEC &gt;</text><text x="272" y="86">priv EXEC #</text><text x="6" y="74" font-size="12">password + login</text><text x="6" y="170" font-size="12">login local + SSH</text><text x="232" y="122" font-size="12">enable secret</text></svg>' },
          "Each door needs its own control. A console password does nothing for VTY, and a VTY login gets you only to user EXEC unless you also know the enable secret (or the account has privilege 15).",
        ],
      },
      {
        h: 'Configuration',
        body: [
          { cli: [
            'HPL-DUNDALK(config)# enable secret Br4nch!Night',
            'HPL-DUNDALK(config)# no enable password',
            'HPL-DUNDALK(config)# username ty algorithm-type scrypt secret N1ghtSh1ft!',
            'HPL-DUNDALK(config)# line console 0',
            'HPL-DUNDALK(config-line)# password C0ns0le!Dk',
            'HPL-DUNDALK(config-line)# login',
            'HPL-DUNDALK(config-line)# exec-timeout 5 0',
            'HPL-DUNDALK(config-line)# line vty 0 15',
            'HPL-DUNDALK(config-line)# login local',
            'HPL-DUNDALK(config-line)# transport input ssh',
            'HPL-DUNDALK(config-line)# exit',
            'HPL-DUNDALK(config)# service password-encryption',
            'HPL-DUNDALK(config)# security passwords min-length 10',
            'HPL-DUNDALK(config)# login block-for 120 attempts 5 within 60',
          ] },
          { list: [
            "`password` + `login` on a line: one shared password for that line. Without `login`, the password is not checked.",
            "`login local`: ask for a username and password from the local database (`username ... secret`).",
            "`exec-timeout 5 0`: log out idle sessions after 5 minutes, 0 seconds. `exec-timeout 0 0` disables the timeout; do not do that.",
            "`security passwords min-length 10`: refuse new passwords shorter than 10 characters.",
            "`login block-for`: after 5 failed logins in 60 seconds, refuse logins for 120 seconds. Slows down guessing.",
          ] },
        ],
      },
      {
        h: 'Password types: what the numbers mean',
        body: [
          { cli: [
            'HPL-DUNDALK# show running-config | include secret|password',
            'service password-encryption',
            'enable secret 9 $9$nhEmQVczB7dqsO$X.HsgL6x1il0RxkOSSvyQYwucySCt7qFm4v7pqCxkKM',
            'username ty secret 9 $9$2MJBozw/9R3UsU$U/fOrhVXmZ/Qn.kd4klfrRjVfoYhvqj4anZ8QLl8jZ6',
            ' password 7 08021C401A490912532F07',
          ] },
          { table: [
            ['Type', 'How it is stored', 'Secure?'],
            ['0', 'Clear text', 'No'],
            ['7', 'Cisco reversible encoding (from `service password-encryption`)', 'No. Decoders are everywhere. It only stops shoulder surfing.'],
            ['5', 'MD5 hash (classic `enable secret`)', 'Weak by today\'s standards'],
            ['8', 'PBKDF2 with SHA-256', 'Yes'],
            ['9', 'scrypt', 'Yes. Preferred.'],
          ] },
          "`enable secret` always stores a hash; `enable password` stores clear text (or type 7 if password encryption is on). If both are configured, **enable secret wins** and the enable password is ignored. Use `algorithm-type scrypt` (or sha256) to pick a strong hash where the platform supports it; on IOS XE 16.10 and later, type 9 is the default for secrets (classic IOS still defaults to type 5).",
          { note: "`service password-encryption` converts existing and future type 0 passwords (line passwords, `enable password`, `username ... password`) to type 7. It is better than clear text in a printout, but anyone with the config can reverse it in seconds." },
        ],
      },
      {
        h: 'Verifying',
        body: [
          "Test every door: log out of the console and back in, SSH in with the local user, type `enable` and use the secret. `show users` lists who is logged in on which line. `show running-config | section line` shows the line settings at a glance.",
        ],
      },
    ],
    techNotes: [
      "Keep a console session open while you change login settings. Getting `login local` with no username configured locks the door from both sides.",
      "Remove `enable password` after you set `enable secret`. Leaving it there just leaks a second password in the config.",
      "Store device passwords in the team password manager, not in a spreadsheet called passwords_final2.xlsx.",
    ],
    examTraps: [
      "`enable secret` overrides `enable password` when both exist.",
      "Type 7 is reversible. Type 5, 8 and 9 are hashes.",
      "`login` checks the line password; `login local` checks the username database.",
      "`service password-encryption` does not affect secrets; they are already hashed.",
    ],
    tryIt: [
      { device: 'router', mode: 'config', prompt: "Secure the console and privileged EXEC, turn on password encryption, then read the running config to see type 7 next to the line password.", cmds: ['enable secret Br4nch!Night', 'line console 0', 'password C0ns0le', 'login', 'exec-timeout 5 0', 'exit', 'service password-encryption', 'end', 'show running-config'] },
    ],
    check: [
      ['A router has both `enable password Alpha1` and `enable secret Bravo2`. Which unlocks privileged EXEC?', ['Alpha1', 'Bravo2', 'Either one', 'Neither until the router reloads'], 1, "When both are configured the enable secret is used and the enable password is ignored."],
      ['What does `service password-encryption` do?', ['Hashes all passwords with scrypt', 'Encrypts SSH traffic', 'Applies reversible type 7 encoding to clear-text passwords in the configuration', 'Forces users to change passwords'], 2, "It converts type 0 passwords to type 7, a weak reversible encoding. Secrets are already hashed, and SSH encryption is unrelated."],
      ['VTY lines are configured with `login local`, but no usernames exist. What happens when someone connects?', ['They log in without a password', 'They use the enable secret', 'No one can log in remotely', 'The VTY line password is used'], 2, "`login local` checks only the local username database. With no accounts there, every login fails."],
    ],
    related: { tickets: ['t14', 't23'], cards: ['secfund', 'ssh', 'pwpolicy'], hw: null, drill: false },
  });

  L.push({
    id: 'l5-4',
    obj: '5.4',
    domain: 'sec',
    title: 'Password policy, MFA and life after passwords',
    minutes: 12,
    caseFile: "Harbor Point's password policy, last updated in 2014, demands eight characters, one symbol and a change every 30 days. The result: everyone uses Harbor1!, Harbor2!, Harbor3!. Rosa asks you to help write a modern policy and pitch multifactor authentication for the network team. Tonight: what makes a policy actually work.",
    sections: [
      {
        h: 'Elements of a password policy',
        body: [
          { list: [
            "**Length:** the single biggest factor in resisting guessing. Long passphrases (four or five random words) beat short complex strings.",
            "**Complexity:** requiring mixed character types. Traditional policies demand it; it helps less than people think, because humans pick predictable patterns. NIST SP 800-63B now tells verifiers not to impose composition rules at all.",
            "**Screening:** reject passwords found in breach lists and dictionaries, and obvious ones like the company name.",
            "**Change policy:** when passwords must change. Forced frequent changes lead to Harbor1!, Harbor2!. Current guidance (NIST SP 800-63B) says verifiers should not require periodic changes, and should force a change when there is evidence the password has been compromised.",
            "**Reuse and history:** do not reuse old passwords or share one across systems.",
            "**Lockout and throttling:** limit failed attempts (on IOS, `login block-for`).",
            "**Management:** how passwords are stored and shared. Use a password manager; never store them in clear text; use hashed secrets on devices.",
          ] },
          { note: "The exam may describe 'complexity requirements' as a policy element. Know what it means, but also know that length plus breach screening is what modern guidance emphasizes." },
        ],
      },
      {
        h: 'Multifactor authentication',
        body: [
          "A password is one **factor**. MFA requires two or more factors of **different types**:",
          { table: [
            ['Factor', 'Something you...', 'Examples'],
            ['Knowledge', 'know', 'Password, PIN, security question'],
            ['Possession', 'have', 'Phone with an authenticator app, hardware token, smart card'],
            ['Inherence', 'are', 'Fingerprint, face, iris, voice'],
          ] },
          "A password plus a PIN is still single-factor (both are knowledge). A password plus a push notification to your phone is two-factor. MFA stops most attacks based on stolen passwords, because the attacker also needs your phone or your finger.",
          { svg: '<svg viewBox="0 0 360 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Three authentication factor types" font-size="13" fill="currentColor"><g fill="none" stroke="currentColor"><circle cx="70" cy="70" r="52"/><circle cx="180" cy="70" r="52"/><circle cx="290" cy="70" r="52"/></g><text x="38" y="66">know</text><text x="30" y="84">password</text><text x="156" y="66">have</text><text x="148" y="84">token</text><text x="270" y="66">are</text><text x="256" y="84">fingerprint</text><text x="70" y="142">MFA = two or more different circles</text></svg>' },
        ],
      },
      {
        h: 'Password alternatives',
        body: [
          { list: [
            "**Certificates:** a digital certificate, signed by a trusted certificate authority (CA), proves identity with public-key cryptography. Devices and users can authenticate without typing anything (802.1X EAP-TLS for Wi-Fi, SSH keys for admins). The private key never leaves the device, so there is nothing to phish.",
            "**Biometrics:** fingerprint, face or iris readers. Convenient and hard to share, but cannot be changed if compromised, and can have false accepts or false rejects.",
            "**Hardware tokens and passkeys:** physical keys or phone-bound credentials using public-key cryptography (FIDO2). Resistant to phishing because they check which site is asking.",
            "**One-time passwords (OTP):** codes from an authenticator app that change every 30 seconds.",
          ] },
          "For the network team, the pitch writes itself: device logins through AAA with a RADIUS or TACACS+ server that requires MFA, SSH keys for automation accounts, and local accounts only as a break-glass fallback with long random passwords kept in a vault.",
        ],
      },
    ],
    techNotes: [
      "If you are forced to have one password policy rule, make it 'long'. A 20-character passphrase is easier to type than P@55w0rd! and far harder to crack.",
      "SMS codes are better than nothing, but SIM swapping is real. Authenticator apps or hardware keys are stronger.",
      "Break-glass local accounts are for when the AAA server is down. Test them twice a year so they work on the night you need them.",
    ],
    examTraps: [
      "Two knowledge factors (password plus PIN) are not MFA.",
      "Biometrics are 'something you are'; a smart card is 'something you have'.",
      "Certificates are a password alternative based on public-key cryptography and a trusted CA.",
    ],
    check: [
      ['Which combination is true multifactor authentication?', ['Password and security question', 'PIN and password', 'Password and a code from an authenticator app on a phone', 'Two different passwords'], 2, "MFA needs different factor types. A password (knowledge) plus a phone app code (possession) qualifies; the other pairs are all knowledge factors."],
      ['A fingerprint reader is which authentication factor?', ['Something you know', 'Something you have', 'Something you are', 'Somewhere you are'], 2, "Biometrics are inherence factors: something you are."],
      ['Which password policy element most directly improves resistance to brute-force guessing?', ['Forcing changes every 30 days', 'Requiring greater password length', 'Displaying a login banner', 'Allowing password reuse'], 1, "Each extra character multiplies the number of possible passwords. Frequent forced changes tend to produce predictable patterns, a banner is legal notice, and reuse weakens security."],
    ],
    related: { tickets: [], cards: ['pwpolicy', 'aaa', 'secfund'], hw: null, drill: false },
  });

  L.push({
    id: 'l5-5',
    obj: '5.5',
    domain: 'sec',
    title: 'IPsec VPNs: private tunnels across a public road',
    minutes: 15,
    caseFile: "Harbor Point is opening a branch in Wilmington with only a cheap internet connection, and the six regional sales reps work from hotels and coffee shops. Both need to reach HQ safely across the internet. Tonight you learn how IPsec builds site-to-site and remote access VPNs, and what each piece protects.",
    sections: [
      {
        h: 'What a VPN does',
        body: [
          "A **virtual private network** carries private traffic across a public network (usually the internet) inside an encrypted tunnel. To anyone in between, the traffic looks like scrambled packets between two public addresses. **IPsec** is a framework of protocols that provides four services:",
          { list: [
            "**Confidentiality:** encryption (AES) so nobody can read the data.",
            "**Integrity:** a hash (SHA-based HMAC) so any change in transit is detected.",
            "**Authentication:** both ends prove who they are with pre-shared keys or certificates.",
            "**Anti-replay:** sequence numbers so an attacker cannot capture and resend old packets.",
          ] },
        ],
      },
      {
        h: 'Site-to-site VPN',
        body: [
          "Two gateways (routers or firewalls) at fixed sites build a permanent tunnel. Hosts at either site send normal, unencrypted traffic to their local gateway; the gateway encrypts it, wraps it in a new IP header addressed to the other gateway, and sends it across the internet. **The hosts need no VPN software and do not know the tunnel exists.**",
          { svg: '<svg viewBox="0 0 360 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Site to site IPsec tunnel between two gateways" font-size="13" fill="currentColor"><g fill="none" stroke="currentColor"><rect x="6" y="70" width="60" height="36" rx="4"/><rect x="84" y="66" width="70" height="44" rx="6"/><rect x="206" y="66" width="70" height="44" rx="6"/><rect x="294" y="70" width="60" height="36" rx="4"/><path d="M66 88h18M276 88h18"/><path d="M154 80h52M154 96h52" stroke-width="2" style="stroke:var(--accent)"/><ellipse cx="180" cy="88" rx="34" ry="44" stroke-dasharray="4 4"/></g><text x="14" y="92">HQ PC</text><text x="92" y="92">HPL-HQ</text><text x="212" y="92">HPL-WIL</text><text x="300" y="92">WIL PC</text><text x="152" y="34">internet</text><text x="6" y="150">New IP hdr | ESP | encrypted</text><text x="6" y="168">original IP packet | ESP trailer</text></svg>' },
          "Classic IPsec tunnels carry only unicast traffic, so they cannot carry routing protocol multicasts like OSPF hellos. **GRE over IPsec** solves that: GRE builds a tunnel that carries multicast and any protocol, and IPsec encrypts the GRE packets. **DMVPN** (Dynamic Multipoint VPN, Cisco) builds on GRE and IPsec to let many branches form tunnels to a hub and directly to each other on demand without configuring every pair. Cloud-managed SD-WAN products automate the same idea.",
        ],
      },
      {
        h: 'Remote access VPN',
        body: [
          "An individual device, a sales rep's laptop, connects to a VPN headend (often a firewall) at HQ. The laptop runs **VPN client software** (for example Cisco Secure Client, formerly AnyConnect). The tunnel exists only while the user is connected.",
          "Remote access VPNs often use **TLS** (the same protection as HTTPS) instead of IPsec because TLS on TCP 443 gets through hotel firewalls more reliably. IPsec (with IKEv2) is also used. Some offer clientless access through a web browser portal.",
          { table: [
            ['', 'Site-to-site', 'Remote access'],
            ['Connects', 'Whole networks (site to site)', 'One device to a network'],
            ['Built by', 'Gateways (routers, firewalls)', 'Client software on the endpoint'],
            ['Always on?', 'Yes, permanent', 'On demand, per user session'],
            ['End hosts aware?', 'No', 'Yes, user starts the client'],
            ['Typical protocol', 'IPsec', 'TLS or IPsec'],
          ] },
        ],
      },
      {
        h: 'IPsec building blocks',
        body: [
          { table: [
            ['Piece', 'What it does', 'Identifier'],
            ['IKE (Internet Key Exchange)', 'Authenticates the peers and negotiates keys and settings (security associations)', 'UDP 500; UDP 4500 when NAT traversal is used'],
            ['ESP (Encapsulating Security Payload)', 'Encrypts and authenticates the payload. The one actually used', 'IP protocol 50'],
            ['AH (Authentication Header)', 'Authenticates and checks integrity, but does **not** encrypt. Breaks with NAT', 'IP protocol 51'],
          ] },
          "IPsec runs in two modes. **Tunnel mode** encrypts the whole original packet and adds a new IP header (gateway to gateway, the site-to-site case). **Transport mode** keeps the original IP header and protects only the payload (host to host, or with GRE over IPsec).",
        ],
      },
    ],
    techNotes: [
      "Most 'the VPN is down' tickets are a mismatch in phase 1 or phase 2 settings between the two ends, or a firewall in the path blocking UDP 500/4500.",
      "Remember NAT: ESP has no ports, so NAT routers cannot track it. NAT traversal wraps ESP in UDP 4500.",
      "If the branch needs to run OSPF over the tunnel, you need GRE over IPsec (or a virtual tunnel interface), not a plain crypto map.",
    ],
    examTraps: [
      "ESP encrypts; AH does not. ESP is protocol 50, AH protocol 51.",
      "In a site-to-site VPN the end hosts need no special software.",
      "Plain IPsec does not carry multicast; GRE over IPsec does.",
      "Remote access VPNs commonly use TLS; site-to-site VPNs commonly use IPsec.",
    ],
    check: [
      ['Which IPsec protocol provides encryption of the payload?', ['AH', 'ESP', 'IKE', 'GRE'], 1, "ESP (IP protocol 50) encrypts and authenticates. AH only authenticates, IKE negotiates keys, and GRE is an unencrypted tunneling protocol."],
      ['Two offices must exchange OSPF routes across an encrypted tunnel over the internet. Which solution supports this?', ['Standard IPsec tunnel only', 'GRE over IPsec', 'Remote access TLS VPN', 'AH in transport mode'], 1, "OSPF uses multicast, which plain IPsec does not carry. GRE carries multicast and IPsec encrypts the GRE packets."],
      ['Which statement describes a remote access VPN?', ['Two routers create a permanent tunnel between sites', 'A user device runs client software to connect to the corporate network', 'Hosts are unaware of the tunnel', 'It requires GRE'], 1, "Remote access VPNs connect individual devices on demand using client software (or a browser). The other descriptions fit site-to-site VPNs."],
    ],
    related: { tickets: [], cards: ['ipsec', 'wanarch'], hw: null, drill: false },
  });

  L.push({
    id: 'l5-6',
    obj: '5.6',
    domain: 'sec',
    title: 'Access control lists: the bouncer reads top to bottom',
    minutes: 20,
    caseFile: "The guest Wi-Fi VLAN can reach the payroll server. Theo is not amused. You need an ACL that lets guests reach the internet and nothing internal, plus a second one that only lets the NOC SSH into the routers. Order matters, placement matters, and there is an invisible line at the bottom that denies everything.",
    sections: [
      {
        h: 'How an ACL is processed',
        body: [
          "An **access control list** is an ordered list of permit and deny statements (access control entries, ACEs). When applied to an interface in a direction, the router compares each packet against the list:",
          { list: [
            "1. Start at the top. Compare the packet with each line in order.",
            "2. **The first match wins.** The router applies that permit or deny and stops reading.",
            "3. If nothing matches, the **implicit deny any** at the end drops the packet. You never see that line, but it is always there.",
          ] },
          "One ACL is allowed per interface, per direction (in or out), per protocol (IPv4 or IPv6). **Inbound** ACLs check packets as they arrive, before routing. **Outbound** ACLs check packets as they leave, after routing.",
          { svg: '<svg viewBox="0 0 360 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ACL top-down first match processing with implicit deny" font-size="13" fill="currentColor"><g fill="none" stroke="currentColor"><rect x="20" y="10" width="200" height="30" rx="4"/><rect x="20" y="60" width="200" height="30" rx="4"/><rect x="20" y="110" width="200" height="30" rx="4"/><rect x="20" y="160" width="200" height="30" rx="4" stroke-dasharray="4 3"/><path d="M120 40v20M120 90v20M120 140v20"/><path d="M220 25h40M220 75h40M220 125h40M220 175h40"/></g><text x="28" y="30">10 deny host 10.9.0.5</text><text x="28" y="80">20 permit 10.9.0.0 /24</text><text x="28" y="130">30 permit 10.8.0.0 /24</text><text x="28" y="180">deny any (implicit)</text><text x="266" y="30">drop</text><text x="266" y="80">forward</text><text x="266" y="130">forward</text><text x="266" y="180">drop</text><text x="20" y="216">no match: move down a line</text></svg>' },
        ],
      },
      {
        h: 'Wildcard masks',
        body: [
          "ACLs match addresses with **wildcard masks**: a 0 bit means 'must match', a 1 bit means 'do not care'. For a subnet, the wildcard is the inverse of the subnet mask: 255 minus each octet.",
          { table: [
            ['Want to match', 'Address', 'Wildcard', 'Shortcut'],
            ['One host', '10.9.0.5', '0.0.0.0', '`host 10.9.0.5`'],
            ['A /24', '10.9.0.0', '0.0.0.255', ''],
            ['A /26', '10.9.0.64', '0.0.0.63', ''],
            ['A /30', '10.1.12.0', '0.0.0.3', ''],
            ['Everything', '0.0.0.0', '255.255.255.255', '`any`'],
          ] },
        ],
      },
      {
        h: 'Standard and extended ACLs',
        body: [
          { table: [
            ['', 'Standard', 'Extended'],
            ['Matches on', 'Source IP only', 'Protocol, source, destination, ports and more'],
            ['Numbers', '1-99 and 1300-1999', '100-199 and 2000-2699'],
            ['Place it', 'As close to the **destination** as possible', 'As close to the **source** as possible'],
          ] },
          "A standard ACL cannot tell where the traffic is going, so if you put it near the source you block that source from everything. An extended ACL is precise, so you can drop unwanted traffic early and save bandwidth.",
          "**Named ACLs** use a name instead of a number, are configured in their own sub-mode, and let you insert or delete single lines by sequence number. They are the modern way to write ACLs.",
        ],
      },
      {
        h: 'Config 1: keep guests out of internal networks',
        body: [
          "Guest VLAN 50 is 10.50.0.0/24. Internal networks are all 10.0.0.0/8. Apply an extended ACL **inbound** on the guest gateway interface, close to the source:",
          { cli: [
            'HPL-HQ(config)# ip access-list extended GUEST-IN',
            'HPL-HQ(config-ext-nacl)# remark guests get DHCP and DNS, then internet only',
            'HPL-HQ(config-ext-nacl)# permit udp any any eq bootps',
            'HPL-HQ(config-ext-nacl)# permit udp 10.50.0.0 0.0.0.255 host 10.10.5.10 eq domain',
            'HPL-HQ(config-ext-nacl)# deny ip 10.50.0.0 0.0.0.255 10.0.0.0 0.255.255.255',
            'HPL-HQ(config-ext-nacl)# permit ip 10.50.0.0 0.0.0.255 any',
            'HPL-HQ(config-ext-nacl)# exit',
            'HPL-HQ(config)# interface GigabitEthernet0/0.50',
            'HPL-HQ(config-subif)# ip access-group GUEST-IN in',
          ] },
          "Order is everything: the DNS permit must come before the deny for 10.0.0.0/8, or guests cannot resolve names.",
        ],
      },
      {
        h: 'Config 2: only the NOC may SSH to the router',
        body: [
          "A standard ACL applied to the VTY lines with `access-class` (not `ip access-group`) controls who can open a remote session:",
          { cli: [
            'HPL-HQ(config)# access-list 15 permit 10.10.5.0 0.0.0.255',
            'HPL-HQ(config)# line vty 0 15',
            'HPL-HQ(config-line)# access-class 15 in',
          ] },
        ],
      },
      {
        h: 'Verification and editing',
        body: [
          { cli: [
            'HPL-HQ# show access-lists',
            'Standard IP access list 15',
            '    10 permit 10.10.5.0, wildcard bits 0.0.0.255 (12 matches)',
            'Extended IP access list GUEST-IN',
            '    10 permit udp any any eq bootps (88 matches)',
            '    20 permit udp 10.50.0.0 0.0.0.255 host 10.10.5.10 eq domain (1402 matches)',
            '    30 deny ip 10.50.0.0 0.0.0.255 10.0.0.0 0.255.255.255 (37 matches)',
            '    40 permit ip 10.50.0.0 0.0.0.255 any (25113 matches)',
            '',
            'HPL-HQ# show ip interface GigabitEthernet0/0.50 | include access list',
            '  Outgoing access list is not set',
            '  Inbound  access list is GUEST-IN',
          ] },
          "To add a line in the middle, enter the named ACL and give a sequence number: `15 permit icmp 10.50.0.0 0.0.0.255 any echo`. To remove one line: `no 30`. With a numbered ACL entered in global config, `no access-list 15` deletes the **entire** list.",
        ],
      },
    ],
    techNotes: [
      "Write the ACL in a text editor first, read it top to bottom as a packet, then paste. Typing it live on the production router at 2 a.m. is how you block your own SSH session.",
      "Match counters are your friend: if the deny line is climbing, it is working. If the line you expected to match stays at 0, the order or the wildcard is wrong.",
      "Every ACL that ends in deny should get a `remark` explaining why it exists. Future you will be grateful.",
    ],
    examTraps: [
      "The implicit deny means an ACL with only deny statements blocks everything.",
      "Standard ACLs near the destination, extended ACLs near the source.",
      "Wildcard for a /27 is 0.0.0.31, not 0.0.0.32.",
      "Use `access-class` on VTY lines and `ip access-group` on interfaces.",
      "One ACL per interface, per direction, per protocol. A second `ip access-group` in the same direction replaces the first.",
    ],
    tryIt: [
      { device: 'router', mode: 'config', prompt: "Build a standard ACL and an extended ACL, apply the extended one inbound on an interface and check the result. Remember the implicit deny any at the end.", cmds: ['access-list 10 permit 192.168.1.0 0.0.0.255', 'access-list 110 permit tcp 192.168.1.0 0.0.0.255 any eq 443', 'access-list 110 deny ip any any', 'interface g0/0', 'ip access-group 110 in', 'end', 'show access-lists'] },
    ],
    check: [
      ['Which wildcard mask matches all hosts in 172.16.32.0/20?', ['0.0.15.255', '0.0.16.255', '255.255.240.0', '0.0.31.255'], 0, "A /20 mask is 255.255.240.0. Subtract each octet from 255: 0.0.15.255. 255.255.240.0 is the subnet mask, not the wildcard."],
      ['An ACL contains `deny ip host 10.1.1.5 any` and `deny ip 10.2.0.0 0.0.255.255 any`, nothing else. Applied inbound, what happens to traffic from 10.3.3.3?', ['It is permitted because it matches nothing', 'It is denied by the implicit deny', 'It is permitted only to the internet', 'The router logs a warning'], 1, "Unmatched packets hit the invisible deny any at the end. An ACL needs at least one permit to let anything through."],
      ['Where should a standard ACL that blocks one subnet from reaching one server be placed?', ['As close to the source as possible', 'As close to the destination as possible', 'On every interface', 'Only on VTY lines'], 1, "Standard ACLs only see the source, so placing them near the source would block that subnet from everything. Near the destination limits the effect to the protected server."],
    ],
    related: { tickets: ['t11'], cards: ['acl'], hw: null, drill: true },
  });

  L.push({
    id: 'l5-7',
    obj: '5.7',
    domain: 'sec',
    title: 'Layer 2 security: snooping, ARP inspection and port security',
    minutes: 20,
    caseFile: "Someone in sales plugged in a home router \"for better Wi-Fi\", and half the floor started getting 192.168.0.x addresses and a gateway that went nowhere. The same week a visitor's laptop was found in a conference room port. Tonight you deploy DHCP snooping, dynamic ARP inspection and port security on the access switches so the next one gets stopped at the port.",
    sections: [
      {
        h: 'Why Layer 2 needs its own protection',
        body: [
          "Switches trust whatever frames arrive on access ports. That makes the LAN a soft target for spoofing: a rogue DHCP server can hand out itself as the gateway (an on-path attack), an attacker can send fake ARP replies to redirect traffic, and anyone can plug in an unknown device. Three features defend the access layer, and two of them work as a team.",
        ],
      },
      {
        h: 'DHCP snooping',
        body: [
          "DHCP snooping classifies switch ports as **trusted** or **untrusted** (every port is untrusted once snooping is enabled):",
          { list: [
            "**Untrusted ports** (user ports) may send client messages (Discover, Request), but any **server** message (Offer, Ack, NAK) arriving there is dropped. That kills rogue DHCP servers.",
            "**Trusted ports** (uplinks toward the real DHCP server or relay) pass everything.",
            "The switch records each successful lease in the **DHCP snooping binding table**: MAC, IP, VLAN, port, lease. Other features rely on this table.",
            "Optional **rate limiting** on untrusted ports stops DHCP starvation (a flood of fake Discovers exhausting the pool); exceeding it err-disables the port.",
          ] },
          { cli: [
            'HPL-SALES-SW(config)# ip dhcp snooping',
            'HPL-SALES-SW(config)# ip dhcp snooping vlan 20',
            'HPL-SALES-SW(config)# no ip dhcp snooping information option',
            'HPL-SALES-SW(config)# interface GigabitEthernet1/0/48',
            'HPL-SALES-SW(config-if)# ip dhcp snooping trust',
            'HPL-SALES-SW(config-if)# interface range GigabitEthernet1/0/1 - 46',
            'HPL-SALES-SW(config-if-range)# ip dhcp snooping limit rate 15',
            '',
            'HPL-SALES-SW# show ip dhcp snooping binding',
            'MacAddress          IpAddress        Lease(sec)  Type           VLAN  Interface',
            '------------------  ---------------  ----------  -------------  ----  --------------------',
            '00:50:56:A1:3C:07   10.20.0.31       85911       dhcp-snooping   20    GigabitEthernet1/0/7',
            'Total number of bindings: 1',
          ] },
          { note: "By default the switch inserts DHCP option 82 into client requests. An IOS DHCP server receiving option 82 with no relay (giaddr 0.0.0.0) on an untrusted path may drop them, so in simple designs people add `no ip dhcp snooping information option`. If clients stop getting addresses right after you enable snooping, check this and the trusted uplink first." },
        ],
      },
      {
        h: 'Dynamic ARP inspection (DAI)',
        body: [
          "ARP has no authentication, so an attacker can send gratuitous ARP replies saying \"the gateway's IP is at my MAC\" (ARP spoofing or poisoning). **DAI** inspects ARP messages on **untrusted** ports and checks the sender IP and MAC against the DHCP snooping binding table. A mismatch is dropped and logged. Trusted ports (uplinks) are not checked.",
          { cli: [
            'HPL-SALES-SW(config)# ip arp inspection vlan 20',
            'HPL-SALES-SW(config)# interface GigabitEthernet1/0/48',
            'HPL-SALES-SW(config-if)# ip arp inspection trust',
            '',
            '! Later, a laptop on Gi1/0/12 claims to be the gateway. DAI drops it and logs:',
            '%SW_DAI-4-DHCP_SNOOPING_DENY: 1 Invalid ARPs (Res) on Gi1/0/12, vlan 20.([0050.56a1.99fe/10.20.0.1/0050.56a1.3c07/10.20.0.31/02:14:09 UTC Sun Nov 15 2026])',
          ] },
          "Hosts with static IPs have no binding, so DAI drops their ARPs unless you add an ARP ACL for them. DAI also rate-limits ARP on untrusted ports (15 packets per second by default) and can optionally validate source MAC, destination MAC and IP fields with `ip arp inspection validate`.",
          { svg: '<svg viewBox="0 0 360 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="DHCP snooping builds a binding table that DAI uses to check ARP" font-size="13" fill="currentColor"><g fill="none" stroke="currentColor"><rect x="110" y="20" width="140" height="44" rx="6"/><rect x="110" y="116" width="140" height="44" rx="6" stroke-width="2.5" style="stroke:var(--accent)"/><rect x="4" y="68" width="90" height="44" rx="6"/><rect x="266" y="68" width="90" height="44" rx="6"/><path d="M180 64v52"/><path d="M94 90h16M250 90h16" stroke-dasharray="3 3"/></g><text x="122" y="40">DHCP snooping</text><text x="122" y="56">watches leases</text><text x="122" y="136">binding table</text><text x="122" y="152">MAC IP VLAN port</text><text x="14" y="88">DAI checks</text><text x="14" y="104">ARP vs table</text><text x="274" y="88">IPSG checks</text><text x="274" y="104">IP vs table</text><text x="186" y="94">builds</text></svg>' },
        ],
      },
      {
        h: 'Port security',
        body: [
          "Port security limits which and how many MAC addresses may use an access port. The port must be statically set to access (or trunk) mode first.",
          { cli: [
            'HPL-SALES-SW(config)# interface GigabitEthernet1/0/12',
            'HPL-SALES-SW(config-if)# switchport mode access',
            'HPL-SALES-SW(config-if)# switchport access vlan 20',
            'HPL-SALES-SW(config-if)# switchport port-security',
            'HPL-SALES-SW(config-if)# switchport port-security maximum 2',
            'HPL-SALES-SW(config-if)# switchport port-security mac-address sticky',
            'HPL-SALES-SW(config-if)# switchport port-security violation restrict',
          ] },
          "Defaults: maximum **1** MAC, violation mode **shutdown**. **Sticky** learning records the first MACs seen and writes them into the running config (save it to keep them after reload).",
          { table: [
            ['Violation mode', 'Drops offending frames', 'Logs and counts', 'Port shut (err-disabled)'],
            ['protect', 'Yes', 'No', 'No'],
            ['restrict', 'Yes', 'Yes', 'No'],
            ['shutdown (default)', 'Yes', 'Yes', 'Yes'],
          ] },
          { cli: [
            'HPL-SALES-SW# show port-security interface GigabitEthernet1/0/12',
            'Port Security              : Enabled',
            'Port Status                : Secure-up',
            'Violation Mode             : Restrict',
            'Aging Time                 : 0 mins',
            'Aging Type                 : Absolute',
            'SecureStatic Address Aging : Disabled',
            'Maximum MAC Addresses      : 2',
            'Total MAC Addresses        : 2',
            'Configured MAC Addresses   : 0',
            'Sticky MAC Addresses       : 2',
            'Last Source Address:Vlan   : 3c52.82f0.1a77:20',
            'Security Violation Count   : 4',
          ] },
          "An err-disabled port stays down until you `shutdown` then `no shutdown` it, or until `errdisable recovery cause psecure-violation` brings it back automatically after a timer.",
        ],
      },
    ],
    techNotes: [
      "Enable snooping on a maintenance night and mark the uplinks trusted **before** you enable it on the VLAN, or every client on the floor loses DHCP at lease renewal.",
      "Maximum 2 on ports with an IP phone and a PC behind it, or the phone's MAC counts and the PC trips the port.",
      "`show interfaces status err-disabled` finds every port that tripped, which is quicker than walking the closet.",
    ],
    examTraps: [
      "DHCP snooping drops server messages on untrusted ports; client messages are allowed.",
      "DAI depends on the DHCP snooping binding table.",
      "Port security default: 1 MAC, violation shutdown.",
      "Protect drops silently; restrict drops and counts; shutdown err-disables.",
      "Port security will not enable on a dynamic (DTP auto/desirable) port.",
    ],
    tryIt: [
      { device: 'switch', mode: 'config', prompt: "Turn on DHCP snooping for VLAN 1 with a trusted uplink, then lock down a user port with sticky port security and check it.", cmds: ['ip dhcp snooping', 'ip dhcp snooping vlan 1', 'interface g0/1', 'ip dhcp snooping trust', 'interface f0/1', 'switchport mode access', 'switchport port-security', 'switchport port-security maximum 2', 'switchport port-security mac-address sticky', 'switchport port-security violation restrict', 'end', 'show ip dhcp snooping', 'show port-security interface f0/1'] },
    ],
    check: [
      ['A rogue DHCP server is plugged into an access port on a switch with DHCP snooping enabled for that VLAN. What happens to its DHCP Offer messages?', ['They are forwarded because offers are broadcasts', 'They are dropped because the port is untrusted', 'They are added to the binding table', 'The port is converted to trusted'], 1, "Snooping drops DHCP server messages arriving on untrusted ports, and all ports are untrusted unless configured otherwise."],
      ['Which feature uses the DHCP snooping binding table to validate ARP messages?', ['Port security', 'Dynamic ARP inspection', 'BPDU guard', 'Storm control'], 1, "DAI compares the sender IP and MAC in ARP packets on untrusted ports with the snooping bindings."],
      ['A port has port security with violation mode restrict. A third unknown MAC appears when the maximum is 2. What happens?', ['The port is err-disabled', 'Frames from the new MAC are dropped silently with no log', 'Frames from the new MAC are dropped, a log message is generated and the violation counter increases', 'The new MAC replaces the oldest one'], 2, "Restrict drops the offending frames and records the violation. Protect would drop silently, and shutdown would err-disable the port."],
    ],
    related: { tickets: ['t15', 't18'], cards: ['portsec', 'snooping'], hw: null, drill: false },
  });

  L.push({
    id: 'l5-8',
    obj: '5.8',
    domain: 'sec',
    title: 'AAA: who are you, what may you do, what did you do',
    minutes: 14,
    caseFile: "Harbor Point has 140 routers and switches and five network admins, each with a local account on every device. When Jamal left the company, it took two nights to remove his account everywhere, and they missed three. Rosa wants one central login system that also records every command. That is AAA.",
    sections: [
      {
        h: 'The three As',
        body: [
          { table: [
            ['', 'Question', 'Harbor Point example'],
            ['Authentication', 'Who are you? Prove it.', 'Ty logs in with username and password plus an MFA push.'],
            ['Authorization', 'What are you allowed to do?', 'Ty gets privilege 15 on network gear; the help desk gets show commands only.'],
            ['Accounting', 'What did you do, and when?', 'Every command Ty types at 03:12 is logged on the AAA server.'],
          ] },
          "Authentication comes first, then authorization, while accounting records the session. A central **AAA server** (Cisco ISE is Cisco's product) holds the accounts, so removing Jamal means disabling one account in one place.",
          { svg: '<svg viewBox="0 0 360 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Admin logs into a switch which asks the AAA server" font-size="13" fill="currentColor"><g fill="none" stroke="currentColor"><rect x="6" y="60" width="70" height="40" rx="6"/><rect x="140" y="60" width="80" height="40" rx="6"/><rect x="280" y="60" width="74" height="40" rx="6" stroke-width="2.5" style="stroke:var(--accent)"/><path d="M76 74h64M220 74h60M280 90h-60M140 90H76"/></g><text x="16" y="84">Admin</text><text x="152" y="84">Switch</text><text x="290" y="78">AAA</text><text x="290" y="94">server</text><text x="80" y="66" font-size="12">1 login</text><text x="224" y="66" font-size="12">2 check</text><text x="224" y="112" font-size="12">3 accept +</text><text x="224" y="126" font-size="12">privileges</text><text x="80" y="112" font-size="12">4 prompt</text><text x="40" y="160">5 accounting records each command</text></svg>' },
        ],
      },
      {
        h: 'RADIUS vs TACACS+',
        body: [
          "Devices talk to the AAA server with one of two protocols:",
          { table: [
            ['', 'RADIUS', 'TACACS+'],
            ['Standard', 'Open (IETF)', 'Cisco-developed, now documented in an RFC'],
            ['Transport', 'UDP 1812 auth, 1813 accounting (old: 1645/1646)', 'TCP 49'],
            ['Encryption', 'Only the password field', 'The entire payload'],
            ['AAA functions', 'Authentication and authorization combined', 'All three separated'],
            ['Command authorization', 'Limited', 'Per-command authorization'],
            ['Best at', 'Network access: Wi-Fi, 802.1X, VPN users', 'Device administration: admins logging into routers'],
          ] },
          "Rule of thumb: **TACACS+ for admins on network devices, RADIUS for users getting on the network.**",
        ],
      },
      {
        h: 'AAA on IOS',
        body: [
          { cli: [
            'HPL-CORE(config)# aaa new-model',
            'HPL-CORE(config)# tacacs server ISE-1',
            'HPL-CORE(config-server-tacacs)# address ipv4 10.10.5.80',
            'HPL-CORE(config-server-tacacs)# key Sh4red-T4c-Key',
            'HPL-CORE(config-server-tacacs)# exit',
            'HPL-CORE(config)# aaa authentication login default group tacacs+ local',
            'HPL-CORE(config)# aaa authorization exec default group tacacs+ local',
            'HPL-CORE(config)# aaa accounting commands 15 default start-stop group tacacs+',
            'HPL-CORE(config)# username breakglass privilege 15 algorithm-type scrypt secret L0ng-R4ndom-V4ult',
          ] },
          "`aaa new-model` turns on AAA and changes how logins work. The method list `group tacacs+ local` means: try the TACACS+ server; only if it is **unreachable** fall back to the local database. A server that answers \"wrong password\" does not trigger the fallback.",
        ],
      },
      {
        h: '802.1X: AAA for ports',
        body: [
          "**802.1X** is port-based network access control: a device must authenticate before the switch port or Wi-Fi network lets its traffic through. Three roles:",
          { list: [
            "**Supplicant:** the client device (laptop, phone) running 802.1X software.",
            "**Authenticator:** the switch or wireless LAN controller that blocks the port until told otherwise.",
            "**Authentication server:** the RADIUS server (such as ISE) that checks credentials.",
          ] },
          "The supplicant and authenticator use **EAP over LAN (EAPoL)**; the authenticator passes EAP to the server inside RADIUS. This is how WPA2/WPA3-Enterprise works on Wi-Fi.",
        ],
      },
    ],
    techNotes: [
      "Always keep `local` at the end of the method list and a break-glass account on the box. When the AAA server is down, you still need to get in.",
      "Before you type `aaa new-model` on a live device, have a console session open. It changes VTY login behavior immediately.",
      "Accounting logs are the first thing an incident review asks for. Turn them on.",
    ],
    examTraps: [
      "RADIUS: UDP, encrypts only the password, combines authentication and authorization. TACACS+: TCP 49, encrypts everything, separates all three.",
      "Authorization is what you may do; accounting is the record of what you did.",
      "In 802.1X the switch is the authenticator, not the authentication server.",
      "Fallback to local happens only if the server does not respond, not if it rejects you.",
    ],
    tryIt: [
      { device: 'router', mode: 'config', prompt: "AAA itself is not in this simulator, but local authentication is: the same `local` fallback AAA uses. Create a local user and require it on the VTY lines.", cmds: ['username breakglass secret L0ngR4ndomV4ult', 'line vty 0 15', 'login local', 'end', 'show running-config'] },
    ],
    check: [
      ['Which AAA function records the commands an administrator entered?', ['Authentication', 'Authorization', 'Accounting', 'Auditing by SNMP'], 2, "Accounting tracks what users did and when. Authentication verifies identity and authorization decides what they may do."],
      ['Which protocol uses TCP port 49, encrypts the whole payload and separates authentication, authorization and accounting?', ['RADIUS', 'TACACS+', 'LDAP', 'Kerberos'], 1, "TACACS+ uses TCP 49, encrypts the full body and handles the three As separately. RADIUS uses UDP and only hides the password."],
      ['In an 802.1X deployment, what is the role of the access switch?', ['Supplicant', 'Authenticator', 'Authentication server', 'Certificate authority'], 1, "The switch is the authenticator: it controls the port and relays EAP between the supplicant (client) and the RADIUS authentication server."],
    ],
    related: { tickets: [], cards: ['aaa', 'secfund'], hw: null, drill: false },
  });

  L.push({
    id: 'l5-9',
    obj: '5.9',
    domain: 'sec',
    title: 'Wireless security: WPA, WPA2 and WPA3',
    minutes: 13,
    caseFile: "The yard's old handheld scanners still connect to an SSID called HPL-YARD that uses WPA with TKIP, set up in 2011. The new scanners support WPA3. Ji-woo from the warehouse asks whether the old SSID is \"basically fine.\" Tonight you find out why it is not and what to replace it with.",
    sections: [
      {
        h: 'Why wireless security is different',
        body: [
          "Wired traffic stays on a cable; Wi-Fi frames go through the air to anyone in range, including the parking lot. Wireless security has to handle two jobs: **authentication** (who may join) and **encryption with integrity** (nobody can read or change frames in the air).",
          "The ancestor, **WEP**, used RC4 with short, static keys and is broken: it can be cracked in minutes. It is not acceptable anywhere today. Open networks with no encryption are only acceptable with something else protecting the traffic (or with Enhanced Open, below).",
        ],
      },
      {
        h: 'The three generations',
        body: [
          { table: [
            ['', 'WPA', 'WPA2', 'WPA3'],
            ['Year (Wi-Fi Alliance)', '2003', '2004', '2018'],
            ['Encryption / integrity', 'TKIP (RC4-based, with MIC)', 'AES-CCMP', 'AES-CCMP-128 required; AES-GCMP-256 in the Enterprise 192-bit mode'],
            ['Personal mode auth', 'PSK', 'PSK (4-way handshake)', 'SAE (Simultaneous Authentication of Equals)'],
            ['Enterprise mode auth', '802.1X/EAP', '802.1X/EAP', '802.1X/EAP, optional 192-bit mode'],
            ['Protected Management Frames', 'No', 'Optional', 'Required'],
            ['Status', 'Deprecated', 'Still widely used', 'Current best'],
          ] },
          "**WPA** was a stopgap to fix WEP on old hardware; TKIP is now deprecated. **WPA2** brought AES with CCMP and is the long-time standard. **WPA3** improves on it in key ways:",
          { list: [
            "**SAE** replaces the PSK handshake in Personal mode. An attacker who captures the handshake cannot run an offline dictionary attack against the passphrase, which is the classic way WPA2-PSK gets cracked.",
            "**Forward secrecy:** capturing traffic today and learning the password later does not decrypt the old traffic.",
            "**Protected Management Frames (PMF, 802.11w)** are mandatory, which stops forged deauthentication frames used to kick clients off.",
            "**Enhanced Open (OWE)**, a companion certification, encrypts open guest networks without a password.",
          ] },
        ],
      },
      {
        h: 'Personal vs Enterprise',
        body: [
          { svg: '<svg viewBox="0 0 360 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Personal mode uses one shared key, enterprise mode uses 802.1X with a RADIUS server" font-size="13" fill="currentColor"><g fill="none" stroke="currentColor"><rect x="6" y="30" width="70" height="34" rx="4"/><rect x="130" y="30" width="70" height="34" rx="4"/><path d="M76 47h54"/><rect x="6" y="120" width="70" height="34" rx="4"/><rect x="130" y="120" width="70" height="34" rx="4"/><rect x="262" y="120" width="92" height="34" rx="4" stroke-width="2.5" style="stroke:var(--accent)"/><path d="M76 137h54M200 137h62"/></g><text x="16" y="52">Scanner</text><text x="148" y="52">AP</text><text x="214" y="44">Personal:</text><text x="214" y="60">same passphrase</text><text x="16" y="142">Laptop</text><text x="140" y="142">AP/WLC</text><text x="272" y="142">RADIUS</text><text x="6" y="110">Enterprise: each user or device has own credential</text><text x="80" y="176">EAPoL</text><text x="210" y="176">RADIUS</text></svg>' },
          { list: [
            "**Personal (PSK or SAE):** everyone shares one passphrase. Simple, fine for small sites and devices that cannot do 802.1X. If one person leaves, you should change the key on every device.",
            "**Enterprise (802.1X):** each user or device authenticates individually to a RADIUS server, often with certificates (EAP-TLS) or username/password inside a tunnel (PEAP). Revoke one account without touching anyone else. Unique encryption keys per session.",
          ] },
          "For the yard: move the new scanners to a WPA3-Enterprise (or at least WPA3-Personal) SSID; keep the old ones on a WPA2-AES SSID only until they are replaced, and retire TKIP entirely. Many sites run **WPA2/WPA3 transition mode** so mixed clients can join the same SSID during migration.",
        ],
      },
    ],
    techNotes: [
      "If a client cannot join a WPA3 SSID, check that it supports PMF. Older drivers are the usual reason transition mode exists.",
      "A WPA2-PSK passphrase should be long and random. Short ones fall to offline dictionary attacks after one captured handshake.",
      "Guest Wi-Fi should be its own SSID and VLAN with an ACL keeping it off internal networks (lesson 5.6), no matter what encryption it uses.",
    ],
    examTraps: [
      "WPA uses TKIP, WPA2 uses AES-CCMP, WPA3 uses AES (CCMP, or GCMP-256 in 192-bit mode) plus SAE for Personal. Many study guides shorten WPA3 to 'GCMP', so recognize both.",
      "SAE replaces PSK in WPA3-Personal and resists offline dictionary attacks.",
      "PMF is mandatory in WPA3, optional in WPA2.",
      "Enterprise mode = 802.1X with a RADIUS server; Personal = a pre-shared passphrase.",
    ],
    check: [
      ['Which feature of WPA3-Personal protects against offline dictionary attacks on the passphrase?', ['TKIP', 'SAE', 'WEP keys', 'MAC filtering'], 1, "SAE (Simultaneous Authentication of Equals) replaces the PSK 4-way handshake exchange that attackers capture and crack offline. TKIP and WEP are older, weaker schemes, and MAC filtering is easily bypassed."],
      ['Which encryption protocol is used by WPA2?', ['RC4 with WEP', 'TKIP only', 'AES-CCMP', 'DES'], 2, "WPA2 requires AES with CCMP. TKIP belongs to WPA, RC4 to WEP and the original TKIP design, and DES is not used in Wi-Fi security."],
      ['A company wants each employee to authenticate to Wi-Fi with individual credentials checked by a central server. Which mode should it use?', ['WPA2-Personal', 'WPA3-Personal', 'WPA2 or WPA3 Enterprise', 'Open with a hidden SSID'], 2, "Enterprise mode uses 802.1X with a RADIUS server for per-user authentication. Personal modes share one key, and hiding an SSID provides no real security."],
    ],
    related: { tickets: [], cards: ['wifisec', 'wireless', 'aaa'], hw: null, drill: false },
  });

  L.push({
    id: 'l5-10',
    obj: '5.10',
    domain: 'sec',
    title: 'Building a WPA2-PSK WLAN in the controller GUI',
    minutes: 13,
    caseFile: "The new cross-dock building needs an SSID for the label printers, which only support WPA2-PSK. The wireless LAN controller is a GUI, not a CLI, and Ji-woo has never touched it. Tonight you walk through every tab, so the printers join on VLAN 70 and get the right QoS.",
    sections: [
      {
        h: 'Before you start',
        body: [
          "A wireless LAN controller (WLC) maps each **WLAN** (an SSID plus its settings) to an **interface** that ties it to a VLAN. Check that a **dynamic interface** exists for VLAN 70 (on an AireOS WLC: Controller > Interfaces; on a Catalyst 9800 the VLAN is set in the policy profile). The switch port to the WLC must be a trunk carrying VLAN 70.",
          "The exam uses the classic AireOS-style GUI, so that is what this walkthrough follows. The Catalyst 9800 GUI has the same ideas in a different layout (Configuration > Tags & Profiles > WLANs, plus a policy profile and tags).",
        ],
      },
      {
        h: 'Step by step',
        body: [
          { svg: '<svg viewBox="0 0 360 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Sketch of the WLAN edit page with its tabs" font-size="13" fill="currentColor"><g fill="none" stroke="currentColor"><rect x="4" y="4" width="352" height="182" rx="6"/><path d="M4 34h352"/><rect x="10" y="40" width="62" height="24" rx="3"/><rect x="76" y="40" width="66" height="24" rx="3" stroke-width="2.5" style="stroke:var(--accent)"/><rect x="146" y="40" width="44" height="24" rx="3"/><rect x="194" y="40" width="68" height="24" rx="3"/><rect x="266" y="40" width="84" height="24" rx="3"/><rect x="20" y="104" width="150" height="22" rx="3"/><rect x="20" y="148" width="150" height="22" rx="3"/></g><text x="12" y="24">WLANs &gt; Edit  HPL-PRINTERS</text><text x="16" y="57">General</text><text x="82" y="57">Security</text><text x="152" y="57">QoS</text><text x="198" y="57">Policy-Map</text><text x="272" y="57">Advanced</text><text x="20" y="96">Layer 2 Security</text><text x="26" y="120">WPA+WPA2</text><text x="20" y="142">Auth Key Mgmt</text><text x="26" y="164">PSK, AES</text><text x="190" y="120">WPA2 Policy: on</text><text x="190" y="164">PSK: ASCII</text></svg>' },
          { list: [
            "**1. Create the WLAN.** WLANs tab > Create New > Go. Type: WLAN. Enter a **Profile Name** (HPL-PRINTERS, the internal name), the **SSID** (HPL-PRINTERS, what clients see) and a **WLAN ID** (a number such as 7). Apply.",
            "**2. General tab.** Set **Status: Enabled**. Under **Interface/Interface Group**, pick the VLAN 70 dynamic interface. Leave **Broadcast SSID** on (hiding it adds no real security). Radio Policy can limit the WLAN to 2.4 GHz or 5 GHz; printers often need 2.4.",
            "**3. Security tab > Layer 2.** Set **Layer 2 Security** to **WPA+WPA2**. Under WPA+WPA2 Parameters tick **WPA2 Policy** and **AES** encryption; untick WPA and TKIP. Under **Authentication Key Management** enable **PSK** (not 802.1X). Choose **PSK Format: ASCII** and type a passphrase of 8 to 63 characters.",
            "**4. Security tab > Layer 3 and AAA Servers.** Layer 3 is for web authentication (captive portals) and stays None here. AAA Servers is for RADIUS with 802.1X, so nothing is needed for PSK.",
            "**5. QoS tab.** Pick the QoS profile: **Platinum** (voice), **Gold** (video), **Silver** (best effort, the default), **Bronze** (background). Printers are fine on Silver; a voice SSID would get Platinum.",
            "**6. Advanced tab.** Optional settings: session timeout, **Allow AAA Override**, client exclusion, peer-to-peer blocking, **DHCP Addr. Assignment Required**, FlexConnect local switching for remote APs.",
            "**7. Apply** and save the configuration (Save Configuration at the top of the page).",
          ] },
          { note: "On the CLI of the same controller the PSK step looks like `config wlan security wpa akm psk set-key ascii <key> 7`. You only need to recognize the GUI on the exam." },
        ],
      },
      {
        h: 'Verifying',
        body: [
          "The WLANs list now shows WLAN ID 7, SSID HPL-PRINTERS, Admin Status Enabled and Security Policies **[WPA2][Auth(PSK)]**. Under Monitor > Clients, a joined printer shows the WLAN, the AP it is on, its IP in VLAN 70 and protocol 802.11n (2.4 GHz). If a client fails, the usual causes are a wrong passphrase, the WLAN mapped to the wrong interface, the VLAN missing from the WLC trunk, or a client that only supports TKIP.",
        ],
      },
    ],
    techNotes: [
      "Profile name and SSID can differ. Use the same value unless you have a reason not to; future you will search for one name.",
      "Write the PSK into the password manager before you hit Apply. Label printers are installed by people who will call you at 4 a.m. for it.",
      "If a WLAN is enabled but nobody sees it, check the AP group or the policy tags: the WLAN might not be assigned to the APs in that building.",
    ],
    examTraps: [
      "For WPA2-PSK: Layer 2 Security WPA+WPA2, WPA2 Policy with AES, Authentication Key Management PSK.",
      "802.1X in Authentication Key Management means Enterprise mode with a RADIUS server, not PSK.",
      "QoS profiles: Platinum voice, Gold video, Silver best effort (default), Bronze background.",
      "The WLAN is tied to a VLAN through the interface (or interface group) setting on the General tab.",
    ],
    check: [
      ['In the WLC GUI, where do you choose PSK as the authentication method?', ['General tab > Interface', 'Security tab > Layer 2 > Authentication Key Management', 'QoS tab > Quality of Service', 'Advanced tab > Allow AAA Override'], 1, "PSK vs 802.1X is chosen under Authentication Key Management on the Layer 2 security page. The General tab maps the VLAN, QoS picks the profile and Advanced holds optional features."],
      ['Which QoS profile should a voice-only WLAN use?', ['Bronze', 'Silver', 'Gold', 'Platinum'], 3, "Platinum is intended for voice. Gold is video, Silver best effort (the default) and Bronze background."],
      ['Clients join a new WLAN but receive addresses from the wrong subnet. What setting is most likely wrong?', ['PSK format', 'The interface (VLAN) mapped on the General tab', 'The QoS profile', 'The radio policy'], 1, "The interface or interface group decides which VLAN the WLAN's clients are placed in, and therefore which DHCP scope they use."],
    ],
    related: { tickets: [], cards: ['wificfg', 'wifisec', 'wifiarch'], hw: null, drill: false },
  });

  /* ================================================================ *
   * 6.0 AUTOMATION AND PROGRAMMABILITY
   * ================================================================ */

  L.push({
    id: 'l6-1',
    obj: '6.1',
    domain: 'auto',
    title: 'Automation: stop typing the same thing 140 times',
    minutes: 11,
    caseFile: "Corporate wants a new syslog server address on all 140 Harbor Point routers and switches by Friday. Last time someone did a change like this by hand, it took three nights, and four switches got a typo that nobody found for a month. Kenji says \"script it.\" Tonight: why automation changes how networks are run.",
    sections: [
      {
        h: 'The old way and its problems',
        body: [
          "Traditionally, engineers manage each device one at a time: SSH in, type commands, save, move to the next. That works for five devices. At 140, it is slow, and people make mistakes. Industry surveys regularly rank human error during manual changes among the most common causes of network outages.",
          { list: [
            "**Slow:** changes scale with the number of devices and the number of hands.",
            "**Inconsistent:** each engineer types it a little differently. Devices drift apart over time (**configuration drift**).",
            "**Hard to audit:** who changed what, where, and why? Often nobody knows.",
            "**Reactive:** engineers spend nights on repetitive work instead of design and troubleshooting.",
          ] },
        ],
      },
      {
        h: 'What automation changes',
        body: [
          { table: [
            ['Area', 'Manual', 'Automated'],
            ['Speed', 'Hours to days for a fleet-wide change', 'Minutes, run in parallel'],
            ['Consistency', 'Depends on who typed it', 'Same template, same result every time'],
            ['Errors', 'Typos, missed devices', 'Fewer, and the same everywhere (so easy to find and fix)'],
            ['Scale', 'More devices means more staff', 'More devices means a longer inventory list'],
            ['Records', 'Change tickets, maybe', 'Version control shows every change and who approved it'],
            ['Verification', 'Spot checks', 'Automatic checks after every change'],
          ] },
          "Automation also enables things that are impractical by hand: provisioning a new branch from a template in minutes (zero-touch provisioning), checking every device against a compliance baseline every night, and collecting **telemetry** continuously instead of polling a few counters.",
          { svg: '<svg viewBox="0 0 360 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="One template pushed to many devices by an automation tool" font-size="13" fill="currentColor"><g fill="none" stroke="currentColor"><rect x="6" y="64" width="86" height="42" rx="6"/><rect x="128" y="64" width="86" height="42" rx="6" stroke-width="2.5" style="stroke:var(--accent)"/><rect x="262" y="10" width="92" height="30" rx="4"/><rect x="262" y="70" width="92" height="30" rx="4"/><rect x="262" y="130" width="92" height="30" rx="4"/><path d="M92 85h36M214 85l48-60M214 85h48M214 85l48 60"/></g><text x="14" y="82">template</text><text x="14" y="98">in Git</text><text x="136" y="82">automation</text><text x="136" y="98">tool</text><text x="272" y="30">router 1</text><text x="272" y="90">switch 57</text><text x="272" y="150">router 140</text></svg>' },
        ],
      },
      {
        h: 'The pieces that make it work',
        body: [
          { list: [
            "**APIs** on devices and controllers so software, not just humans, can configure them (REST, NETCONF, RESTCONF; lesson 6.5).",
            "**Structured data** such as JSON and YAML so tools can read and write configs reliably (lesson 6.7).",
            "**Controllers** that manage many devices from one place (lessons 6.2 and 6.3).",
            "**Configuration management tools** such as Ansible and Terraform that apply a desired state to many devices (lesson 6.6).",
            "**Source control** (Git) so configs and templates are versioned, reviewed and reversible.",
            "**AI and analytics** that spot problems in all that telemetry (lesson 6.4).",
          ] },
          "The engineer's job shifts from typing commands to defining intent, writing templates and reviewing changes. CLI skills still matter: you need them to know what the automation should do and to troubleshoot when it does something surprising.",
          { note: "Automation amplifies whatever you give it. A wrong template is now wrong on 140 devices in four minutes. Test on one or two devices first, then roll out." },
        ],
      },
    ],
    techNotes: [
      "Start small: a script that runs `show` commands on every device and saves the output is already a big win, and it cannot break anything.",
      "Keep your templates in Git. When someone asks who changed the logging server, the answer is in the history.",
      "Always run automation in a 'dry run' or check mode first when the tool supports it.",
    ],
    examTraps: [
      "Automation reduces human error and improves consistency; it does not remove the need for network knowledge.",
      "Configuration drift is when devices that should match slowly become different. Automation and compliance checks fight it.",
      "Benefits the exam likes: faster deployment, consistency, scalability, lower operating cost, better auditing.",
    ],
    check: [
      ['Which is the most direct benefit of using automation for a change on hundreds of devices?', ['It removes the need for any network knowledge', 'It applies the change consistently and quickly across all devices', 'It eliminates the need for testing', 'It replaces routing protocols'], 1, "Consistency and speed at scale are the core benefits. Automation still needs knowledgeable engineers and testing, and it has nothing to do with replacing routing protocols."],
      ['Devices that were configured identically slowly become different through one-off manual changes. What is this called?', ['Configuration drift', 'Route flapping', 'Jitter', 'Convergence'], 0, "Configuration drift is the gradual divergence of configs. Automation tools detect and correct it. The others are routing and QoS terms."],
      ['Why should a new automation template be tested on a few devices before a full rollout?', ['Automation tools only support a few devices', 'A mistake in the template is repeated on every device it touches', 'Testing is required by SNMP', 'Templates cannot be reversed'], 1, "Automation replicates errors as efficiently as it replicates good changes, so a small pilot catches mistakes before they spread."],
    ],
    related: { tickets: [], cards: ['netauto', 'cfgmgmt'], hw: null, drill: false },
  });

  L.push({
    id: 'l6-2',
    obj: '6.2',
    domain: 'auto',
    title: 'Traditional vs controller-based networks',
    minutes: 12,
    caseFile: "Harbor Point's new Fairfield site was built with a controller: the engineer there never logs into individual switches. HQ is still the traditional way, one CLI session at a time. Rosa asks you to explain the difference to the finance director, without saying \"plane\" more than twice. You will need it more than twice.",
    sections: [
      {
        h: 'Three planes',
        body: [
          "Every network device does three kinds of work:",
          { table: [
            ['Plane', 'Job', 'Examples'],
            ['Data plane (forwarding plane)', 'Moves user traffic: receive a frame or packet, look it up, send it out', 'Switching frames, routing packets, applying ACLs, NAT, encapsulation'],
            ['Control plane', 'Decides how traffic should be forwarded and builds the tables the data plane uses', 'OSPF, EIGRP, STP, ARP, MAC learning'],
            ['Management plane', 'Lets people and systems manage the device', 'SSH, SNMP, syslog, NTP, the CLI, APIs'],
          ] },
          "On a traditional router, all three run inside each box. Data plane forwarding is often done in specialized hardware (ASICs); the control and management planes run on the CPU.",
        ],
      },
      {
        h: 'Traditional networking',
        body: [
          "In a traditional network, each device has its own **distributed** control plane. Routers run OSPF with their neighbors and each one calculates its own routes. Engineers configure each device individually, by CLI. It is resilient (no central point to fail) but every change is a box-by-box job, and nobody has one view of the whole network.",
        ],
      },
      {
        h: 'Controller-based networking',
        body: [
          "A **controller** is software that centrally manages many devices. Depending on the design, it can centralize part of the control plane (pure SDN), or mainly centralize management and policy while devices still run their own protocols (most real products today). Engineers tell the controller **what** they want (intent); the controller works out **how** and pushes configuration to the devices through APIs.",
          { svg: '<svg viewBox="0 0 360 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Traditional per-device control compared with a central controller" font-size="13" fill="currentColor"><g fill="none" stroke="currentColor"><rect x="6" y="40" width="60" height="30" rx="4"/><rect x="96" y="40" width="60" height="30" rx="4"/><rect x="50" y="120" width="60" height="30" rx="4"/><path d="M66 55h30M36 70l30 50M126 70l-30 50"/><rect x="220" y="20" width="120" height="36" rx="6" stroke-width="2.5" style="stroke:var(--accent)"/><rect x="200" y="130" width="50" height="30" rx="4"/><rect x="256" y="130" width="50" height="30" rx="4"/><rect x="312" y="130" width="44" height="30" rx="4"/><path d="M280 56l-55 74M280 56v74M280 56l54 74" stroke-dasharray="4 3"/></g><text x="10" y="60">R1 CP</text><text x="100" y="60">R2 CP</text><text x="54" y="140">R3 CP</text><text x="10" y="186">each box decides</text><text x="236" y="43">controller</text><text x="206" y="150">DP</text><text x="262" y="150">DP</text><text x="318" y="150">DP</text><text x="206" y="186">one central view</text></svg>' },
          { table: [
            ['', 'Traditional', 'Controller-based'],
            ['Control plane', 'Distributed on every device', 'Centralized (fully or partly) in the controller'],
            ['Configuration', 'Device by device, usually CLI', 'Central, through the controller GUI or its API'],
            ['Network view', 'Pieced together from each device', 'Single view of the whole network'],
            ['Policy', 'Repeated per device (ACLs, QoS on each box)', 'Defined once, applied everywhere'],
            ['Change speed', 'Slow at scale', 'Fast, consistent'],
            ['Risk', 'Typos spread device by device', 'Controller becomes critical; run it redundantly'],
          ] },
          "Cisco examples: **Catalyst Center** (formerly DNA Center) for campus networks, **Catalyst SD-WAN Manager** (formerly vManage) for WANs, the **Meraki** cloud dashboard, and **ACI** with the APIC controller in data centers. Wireless LAN controllers were an early example: hundreds of lightweight APs managed from one box.",
          "Controller-based networks are often described as **intent-based**: you say 'sales users may reach the CRM and nothing else', and the controller translates that into VLANs, ACLs and policies on every device.",
        ],
      },
    ],
    techNotes: [
      "If the controller goes down, existing forwarding usually keeps working (the data plane is in the devices), but you cannot make changes. Still, cluster it.",
      "Controllers do not make the CLI obsolete. When a switch misbehaves, `show` commands on the switch are still where you find out why.",
      "Ask whether a product centralizes the control plane or just management. Most marketing slides blur that line.",
    ],
    examTraps: [
      "Data plane forwards; control plane decides; management plane is how you administer the device.",
      "ARP, STP and routing protocols are control plane. ACL filtering and NAT on packets are data plane.",
      "SSH, SNMP and syslog are management plane.",
      "In controller-based networks the control plane is centralized; in traditional networks it is distributed.",
    ],
    check: [
      ['OSPF building routing tables on each router belongs to which plane?', ['Data plane', 'Control plane', 'Management plane', 'Application plane'], 1, "Routing protocols decide how to forward, which is the control plane. The data plane uses the resulting tables to move packets."],
      ['Which describes a controller-based network?', ['Every device is configured individually through the CLI', 'A central controller holds a network-wide view and pushes configuration to devices', 'There is no control plane', 'Only SNMP can be used'], 1, "Controllers centralize management and some or all of the control plane, configuring devices through APIs. Devices still forward traffic in their data planes."],
      ['A router forwarding a packet out an interface after an ACL check is performing which function?', ['Control plane', 'Management plane', 'Data plane', 'Northbound API'], 2, "Forwarding user traffic, including applying ACLs to it, is data plane work."],
    ],
    related: { tickets: [], cards: ['sdn', 'netauto'], hw: null, drill: false },
  });

  L.push({
    id: 'l6-3',
    obj: '6.3',
    domain: 'auto',
    title: 'Inside SDN: underlay, overlay, fabric and the APIs',
    minutes: 15,
    caseFile: "The Fairfield site runs Cisco SD-Access, and Kenji keeps saying things like \"the overlay is fine, it's an underlay problem.\" There was also something about a northbound API breaking the ticketing integration. Tonight you learn the architecture so you can tell which layer is actually broken.",
    sections: [
      {
        h: 'The SDN architecture',
        body: [
          "Software-defined networking separates the control plane (decisions) from the data plane (forwarding) and puts a controller in the middle, exposing APIs above and below it:",
          { svg: '<svg viewBox="0 0 360 230" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="SDN layers with northbound and southbound APIs" font-size="13" fill="currentColor"><g fill="none" stroke="currentColor"><rect x="30" y="10" width="300" height="40" rx="6"/><rect x="30" y="96" width="300" height="40" rx="6" stroke-width="2.5" style="stroke:var(--accent)"/><rect x="30" y="182" width="300" height="40" rx="6"/><path d="M180 50v46M180 136v46"/><path d="M174 60l6-10 6 10M174 172l6 10 6-10"/></g><text x="44" y="35">Application layer: scripts, apps, ITSM</text><text x="44" y="121">Control layer: SDN controller</text><text x="44" y="207">Infrastructure layer: switches, routers</text><text x="190" y="72">Northbound API</text><text x="190" y="88">(REST, JSON)</text><text x="190" y="158">Southbound API</text><text x="190" y="174">(NETCONF, OpenFlow)</text></svg>' },
          { list: [
            "**Northbound interface (NBI):** between the controller and the applications above it. Usually a **REST API** with JSON. Your ticketing system or Python script uses it to ask the controller for data or to request changes.",
            "**Southbound interface (SBI):** between the controller and the network devices below it. Examples: **NETCONF**, **RESTCONF**, **OpenFlow**, **OpFlex** (Cisco ACI), and plain **SSH/CLI** or **SNMP** for older devices.",
          ] },
          "Memory hook: draw the controller in the middle. Apps are on top, so their API points north. Devices are underneath, so their API points south.",
        ],
      },
      {
        h: 'Underlay, overlay, fabric',
        body: [
          { list: [
            "**Underlay:** the physical network and the routing that gives every device IP reachability to every other device. Switches, cables, and a routing protocol (Cisco SD-Access commonly uses IS-IS for its automated underlay; OSPF is also used). It only has one job: get packets between fabric nodes.",
            "**Overlay:** virtual networks built on top of the underlay with **tunnels**. Endpoints in the overlay think they share a LAN even when they are on switches far apart. **VXLAN** is a common overlay encapsulation: it wraps an Ethernet frame in UDP (port 4789) and IP so it can cross the routed underlay.",
            "**Fabric:** the whole thing working together, underlay plus overlay plus the control and policy layers, managed as one system.",
          ] },
          { svg: '<svg viewBox="0 0 360 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Overlay tunnel riding over a routed underlay" font-size="13" fill="currentColor"><g fill="none" stroke="currentColor"><rect x="10" y="110" width="70" height="34" rx="4"/><rect x="145" y="110" width="70" height="34" rx="4"/><rect x="280" y="110" width="70" height="34" rx="4"/><path d="M80 127h65M215 127h65"/><path d="M45 110C80 30 280 30 315 110" stroke-width="2.5" stroke-dasharray="6 4" style="stroke:var(--accent)"/></g><text x="22" y="132">edge A</text><text x="157" y="132">core</text><text x="292" y="132">edge B</text><text x="112" y="40">overlay: VXLAN tunnel</text><text x="92" y="164">underlay: routed IP links</text></svg>' },
          "Kenji's point: if the underlay loses reachability between two edge switches, every overlay tunnel between them breaks too, even though the overlay configuration is perfect.",
        ],
      },
      {
        h: 'Cisco SD-Access as the example',
        body: [
          { table: [
            ['Function', 'In SD-Access'],
            ['Management and automation', 'Catalyst Center (formerly DNA Center), with northbound REST APIs'],
            ['Control plane', 'LISP: a mapping system that tracks where each endpoint is'],
            ['Data plane', 'VXLAN encapsulation between fabric switches'],
            ['Policy plane', 'Cisco TrustSec with security group tags (SGTs)'],
            ['Policy server', 'Cisco ISE for authentication and group assignment'],
          ] },
          "Fabric roles: **edge nodes** connect endpoints (like access switches), **border nodes** connect the fabric to outside networks, and the **control plane node** runs the LISP mapping database.",
          "Benefits: policy follows the user rather than the IP address or VLAN, consistent segmentation across the campus, and automated provisioning. Trade-off: more moving parts, and you need to understand all the layers to troubleshoot it.",
        ],
      },
    ],
    techNotes: [
      "Troubleshoot bottom up: is the underlay healthy (ping between loopbacks of fabric nodes)? Then the overlay. Then policy.",
      "When an integration breaks after a controller upgrade, check the northbound API version and authentication before blaming the network.",
      "VXLAN adds about 50 bytes of headers. Underlay links need a larger MTU, or large packets get dropped mysteriously.",
    ],
    examTraps: [
      "Northbound = controller to applications (usually REST). Southbound = controller to devices (NETCONF, OpenFlow, etc.).",
      "The underlay is the physical/IP transport; the overlay is the virtual network of tunnels on top.",
      "SD-Access: LISP control plane, VXLAN data plane, TrustSec policy plane, Catalyst Center for management.",
    ],
    check: [
      ['Which interface does a Python script use to request data from an SDN controller?', ['Southbound API', 'Northbound API', 'Underlay', 'Data plane'], 1, "Applications above the controller use its northbound API, typically REST with JSON. The southbound API is how the controller talks to devices."],
      ['In an SDN fabric, what is the underlay?', ['The virtual networks created with tunnels', 'The physical network and routing that provide IP reachability between fabric devices', 'The northbound API', 'The policy engine'], 1, "The underlay is the physical transport network. Overlays are the tunneled virtual networks built on top of it."],
      ['Which protocol is a southbound API?', ['NETCONF', 'HTTP status codes', 'JSON', 'SMTP'], 0, "NETCONF is used by controllers and tools to configure devices, so it is southbound. JSON is a data format and HTTP status codes are part of REST, not APIs themselves."],
    ],
    related: { tickets: [], cards: ['sdn', 'lanarch'], hw: null, drill: false },
  });

  L.push({
    id: 'l6-4',
    obj: '6.4',
    domain: 'auto',
    title: 'AI and machine learning in network operations',
    minutes: 13,
    caseFile: "The vendor demo last week promised that AI would \"run the network for you.\" Rosa wants to know what is real. Meanwhile, the monitoring tool flagged an unusual traffic spike at 03:20 that no static threshold would have caught. Tonight you sort the useful from the hype: predictive AI, generative AI and machine learning in network operations.",
    sections: [
      {
        h: 'The terms',
        body: [
          { list: [
            "**Artificial intelligence (AI):** the broad field of computer systems performing tasks that normally need human judgment.",
            "**Machine learning (ML):** a subset of AI where systems learn patterns from data instead of following hand-written rules.",
            "**Predictive AI:** ML models that analyze historical and current data to classify, detect anomalies or forecast what will happen next.",
            "**Generative AI:** models (such as large language models, LLMs) that create new content: text, code, configurations, summaries, in response to prompts.",
          ] },
          "ML is often split by how it learns:",
          { table: [
            ['Type', 'How it learns', 'Network example'],
            ['Supervised', 'From labeled examples (this traffic is normal, this was an attack)', 'Classifying applications or known attack types'],
            ['Unsupervised', 'Finds structure in unlabeled data', 'Grouping devices by behavior; spotting outliers'],
            ['Reinforcement', 'Tries actions and learns from rewards', 'Tuning settings over time (mostly research and niche uses)'],
          ] },
        ],
      },
      {
        h: 'Predictive AI and ML: what it does for operations',
        body: [
          { list: [
            "**Baselining:** learn what normal looks like for each device, link, time of day and day of week. Monday 08:00 at the dispatch floor is not the same as Sunday 03:00.",
            "**Anomaly detection:** flag deviations from the baseline, like the 03:20 spike, instead of relying only on fixed thresholds such as 'alert at 80 percent'.",
            "**Predictive failure and capacity planning:** spot trends (an optic's receive power slowly dropping, a link growing 4 percent a month) before they cause an outage.",
            "**Event correlation and root cause:** group hundreds of alarms into one incident and point at the likely cause.",
            "**Wireless optimization:** analyze RF and client data to suggest channel and power changes.",
            "**Security:** detect unusual endpoint behavior or traffic patterns that may indicate compromise.",
          ] },
          { svg: '<svg viewBox="0 0 360 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="A learned baseline band with one anomaly outside it" font-size="13" fill="currentColor"><g fill="none" stroke="currentColor"><path d="M20 150h330M20 150V20"/><path d="M20 110C70 90 110 60 160 70S260 110 340 90" stroke-dasharray="4 3"/><path d="M20 140C70 120 110 92 160 102S260 140 340 122" stroke-dasharray="4 3"/><path d="M20 126C70 106 110 76 160 86S220 120 240 120L252 40L264 122C290 118 320 108 340 106" stroke-width="2"/></g><circle cx="252" cy="40" r="6" fill="none" stroke="currentColor" stroke-width="2.5" style="stroke:var(--accent)"/><text x="264" y="40">anomaly</text><text x="30" y="34">traffic</text><text x="40" y="80">learned normal band</text><text x="290" y="166">time</text></svg>' },
        ],
      },
      {
        h: 'Generative AI: what it does for operations',
        body: [
          { list: [
            "**Natural-language assistants:** ask 'which APs had the most client failures yesterday?' instead of building a report.",
            "**Drafting configurations and scripts:** generate a starting template, an ACL or an Ansible playbook from a description.",
            "**Summarizing:** turn long logs, show outputs or incident timelines into readable summaries.",
            "**Documentation and knowledge search:** answer questions from the team's runbooks.",
          ] },
          "Vendors including Cisco now build AI assistants and AI-driven analytics into their management platforms (for example Catalyst Center and the Meraki dashboard). The CCNA does not test specific product features; it tests the concepts.",
        ],
      },
      {
        h: 'Risks and limits',
        body: [
          { list: [
            "**Hallucination:** generative models can produce confident, wrong answers, including commands that do not exist or configs that would cause an outage. Always verify output before applying it.",
            "**Data quality:** models are only as good as their data. A baseline learned during an outage treats the outage as normal.",
            "**False positives and negatives:** anomaly detection still needs tuning, or the team learns to ignore it.",
            "**Privacy and security:** pasting configs (with passwords and IP plans) into a public AI tool can leak them. Follow company policy.",
            "**Accountability:** a human still owns the change. Keep review and change control in place.",
          ] },
          { note: "A good mental model: predictive AI helps you **notice** and **anticipate**; generative AI helps you **produce** and **explain**. Neither replaces understanding the network." },
        ],
      },
    ],
    techNotes: [
      "Treat an AI-generated config like a config from a new hire: probably helpful, possibly wrong, always reviewed.",
      "Remove secrets and public IPs before pasting anything into an AI tool you do not control.",
      "Baselines need a few weeks of data. Do not judge the anomaly detector on day two.",
    ],
    examTraps: [
      "Predictive AI analyzes data to forecast or detect; generative AI creates new content.",
      "ML is a subset of AI.",
      "Anomaly detection compares against a learned baseline, not just a fixed threshold.",
      "Hallucination is a risk of generative AI: plausible but incorrect output.",
    ],
    check: [
      ['A system learns the normal traffic pattern of each link and alerts when traffic deviates sharply from it. What is this?', ['Generative AI drafting a config', 'Predictive AI performing anomaly detection against a baseline', 'A static SNMP threshold', 'Reinforcement learning of routing'], 1, "Learning normal behavior and flagging deviations is ML-based anomaly detection, a predictive AI use. A static threshold does not learn, and generative AI creates content."],
      ['An engineer asks an AI assistant to write an ACL from a plain-English description. Which type of AI is this?', ['Predictive AI', 'Generative AI', 'Supervised anomaly detection', 'Rule-based expert system'], 1, "Producing new content such as configuration text from a prompt is generative AI."],
      ['Which is a key risk of using generative AI to produce device configurations?', ['It cannot output text', 'It may produce confident but incorrect output (hallucination)', 'It only works with SNMPv1', 'It always requires a controller'], 1, "Generative models can invent commands or settings that look right but are wrong, so outputs must be reviewed and tested."],
    ],
    related: { tickets: [], cards: ['aiml', 'netauto'], hw: null, drill: false },
  });

  L.push({
    id: 'l6-5',
    obj: '6.5',
    domain: 'auto',
    title: 'REST APIs: talking to the network in HTTP',
    minutes: 15,
    caseFile: "Kenji's script that pulls the device list from the controller every morning started failing with a 401 overnight. Ravi wants the script to also create a ticket when a device goes offline. Tonight you learn how REST APIs work: verbs, status codes, authentication and data formats, so you can read the error and fix it.",
    sections: [
      {
        h: 'What a REST API is',
        body: [
          "An **API** (application programming interface) lets one piece of software ask another for data or actions. **REST** (Representational State Transfer) is an architectural style for APIs that uses **HTTP**, the same protocol as the web. Each thing you can manage (a device, an interface, a VLAN) is a **resource** with its own URI, and you act on it with HTTP methods.",
          "REST APIs share a few characteristics (constraints):",
          { list: [
            "**Client-server:** the client (your script) and server (the controller) are separate and evolve independently.",
            "**Stateless:** every request carries everything needed to process it, including authentication. The server keeps no session memory between requests.",
            "**Cacheable:** responses say whether they can be cached, to reduce load.",
            "**Uniform interface:** resources are identified by URIs and manipulated with standard methods and representations (such as JSON).",
            "**Layered system:** the client cannot tell whether it talks to the server directly or through a proxy or load balancer.",
            "**Code on demand** (optional): the server can send code for the client to run.",
          ] },
        ],
      },
      {
        h: 'CRUD and HTTP verbs',
        body: [
          { table: [
            ['CRUD action', 'HTTP verb', 'Example'],
            ['Create', 'POST', 'Create a new VLAN or ticket'],
            ['Read', 'GET', 'Retrieve the device list'],
            ['Update', 'PUT (replace) or PATCH (modify part)', 'Change an interface description'],
            ['Delete', 'DELETE', 'Remove a VLAN'],
          ] },
          "A request has a **method**, a **URI**, **headers**, and sometimes a **body**:",
          { cli: [
            'GET /dna/intent/api/v1/network-device?hostname=HPL-DOCK3 HTTP/1.1',
            'Host: catc.harborpoint.local',
            'Accept: application/json',
            'X-Auth-Token: eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
          ] },
          { svg: '<svg viewBox="0 0 360 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Anatomy of a REST URI and request and response" font-size="13" fill="currentColor"><text x="6" y="30" font-family="monospace" font-size="12">https://catc.hpl.local/api/v1/device?id=7</text><g fill="none" stroke="currentColor"><path d="M10 38v24M70 38v54M180 38v24M270 38v54"/><rect x="20" y="130" width="100" height="40" rx="6"/><rect x="240" y="130" width="100" height="40" rx="6"/><path d="M120 142h120M120 160h120"/></g><text x="2" y="76">scheme</text><text x="60" y="106">host</text><text x="160" y="76">path</text><text x="250" y="106">query</text><text x="38" y="155">script</text><text x="256" y="155">controller</text><text x="128" y="136" font-size="12">GET + token</text><text x="128" y="186" font-size="12">200 OK + JSON</text></svg>' },
        ],
      },
      {
        h: 'Status codes',
        body: [
          { table: [
            ['Code', 'Meaning', 'Typical cause'],
            ['200 OK', 'Success', 'GET returned data'],
            ['201 Created', 'Resource created', 'POST succeeded'],
            ['204 No Content', 'Success, nothing to return', 'DELETE succeeded'],
            ['400 Bad Request', 'The request is malformed', 'Bad JSON in the body'],
            ['401 Unauthorized', 'Not authenticated', 'Missing or expired token'],
            ['403 Forbidden', 'Authenticated but not allowed', 'Account lacks permission'],
            ['404 Not Found', 'Resource does not exist', 'Wrong URI or ID'],
            ['500 Internal Server Error', 'The server failed', 'A bug or problem on the server'],
          ] },
          "The families: **2xx** success, **3xx** redirection, **4xx** client error (your fault), **5xx** server error (their fault). Kenji's 401 means his token expired.",
        ],
      },
      {
        h: 'Authentication',
        body: [
          { list: [
            "**HTTP Basic:** username and password Base64-encoded in the Authorization header. Base64 is encoding, not encryption, so it must be used over HTTPS.",
            "**Token (bearer) authentication:** authenticate once (often with Basic), receive a token, then send the token with each request until it expires. Common with controllers.",
            "**API key:** a long secret string issued to an application, sent in a header.",
            "**OAuth 2.0:** a framework where an authorization server issues limited, expiring access tokens, often on behalf of a user, without sharing their password.",
          ] },
          { cli: [
            'POST /dna/system/api/v1/auth/token        (Basic auth: ty / ********)',
            '-> 200 OK',
            '{"Token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."}',
          ] },
        ],
      },
      {
        h: 'Data encoding',
        body: [
          "The body of requests and responses is structured data. The `Content-Type` header says what the body is in; the `Accept` header says what the client wants back.",
          { list: [
            "**JSON** (application/json): the most common for REST. Lesson 6.7.",
            "**XML** (application/xml): tags like HTML; common with NETCONF and older APIs.",
            "**YAML:** human-friendly, indentation-based; common in Ansible, less so in API payloads.",
          ] },
          { cli: [
            'HTTP/1.1 200 OK',
            'Content-Type: application/json',
            '',
            '{"response": [{"hostname": "HPL-DOCK3", "managementIpAddress": "10.99.0.13",',
            '  "platformId": "C9300-48P", "reachabilityStatus": "Reachable"}]}',
          ] },
        ],
      },
    ],
    techNotes: [
      "4xx means look at your request. 5xx means look at the server. That one rule saves hours.",
      "Never hard-code passwords or tokens in scripts you commit to Git. Use environment variables or a vault.",
      "Most controllers publish interactive API docs. Try calls there first, then copy them into your script.",
    ],
    examTraps: [
      "POST = create, GET = read, PUT/PATCH = update, DELETE = delete.",
      "401 is authentication failure (who are you?); 403 is authorization failure (you may not).",
      "REST is stateless: each request must carry its authentication.",
      "Basic authentication is only Base64 encoding; HTTPS is needed for confidentiality.",
    ],
    check: [
      ['Which HTTP verb creates a new resource in a REST API?', ['GET', 'POST', 'DELETE', 'HEAD'], 1, "POST maps to Create in CRUD. GET reads, DELETE deletes, and HEAD retrieves headers only."],
      ['A script receives HTTP 401 from a controller API. What is the most likely cause?', ['The resource does not exist', 'The server crashed', 'The authentication token is missing or expired', 'The request succeeded with no content'], 2, "401 Unauthorized means the request was not authenticated. 404 is not found, 5xx is a server failure, and 204 is success with no content."],
      ['What does it mean that REST APIs are stateless?', ['They cannot change device state', 'Each request contains all information needed, and the server stores no client session between requests', 'They only use UDP', 'They cannot return JSON'], 1, "Statelessness means the server does not rely on stored session context, so each request includes things like the auth token. It says nothing about whether resources can be changed."],
    ],
    related: { tickets: [], cards: ['rest', 'dataformats'], hw: null, drill: false },
  });

  L.push({
    id: 'l6-6',
    obj: '6.6',
    domain: 'auto',
    title: 'Configuration management: Ansible and Terraform',
    minutes: 15,
    caseFile: "Remember the syslog change on 140 devices? Kenji wants to do it with Ansible. Meanwhile the cloud team is building Harbor Point's new tracking platform in a public cloud with Terraform, and Rosa wants to know if those are the same thing. They are not, though they are cousins. Tonight: what each tool does and when to pick it.",
    sections: [
      {
        h: 'What configuration management tools do',
        body: [
          "Configuration management and infrastructure-as-code (IaC) tools let you describe how systems **should** be configured in text files, store those files in version control, and let the tool make reality match. Key ideas:",
          { list: [
            "**Desired state:** you describe the end result, not every keystroke.",
            "**Idempotence:** running the same job twice gives the same result; if the device already matches, nothing changes.",
            "**Source of truth:** the files in Git are the reference for what the network should look like.",
            "**Drift detection:** compare the live config to the desired state and report or fix differences.",
          ] },
        ],
      },
      {
        h: 'Ansible',
        body: [
          "**Ansible** (Red Hat, written in Python) is **agentless**: nothing has to be installed on the managed devices. A **control node** connects out to them, usually over **SSH** for network gear (or NETCONF or a REST API), and **pushes** changes.",
          { list: [
            "**Inventory:** the list of devices and groups (INI or YAML).",
            "**Playbooks:** YAML files containing **plays** and **tasks**, run in order.",
            "**Modules:** units of work, such as `cisco.ios.ios_config` or `cisco.ios.ios_vlans`, that know how to talk to a platform.",
            "**Variables and templates** (Jinja2) for per-device values.",
          ] },
          { cli: [
            '# inventory.ini',
            '[dock_switches]',
            'hpl-dock1 ansible_host=10.99.0.11',
            'hpl-dock3 ansible_host=10.99.0.13',
            '',
            '[dock_switches:vars]',
            'ansible_network_os=cisco.ios.ios',
            'ansible_connection=ansible.netcommon.network_cli',
            '',
            '# syslog.yml',
            '---',
            '- name: Point dock switches at the new syslog server',
            '  hosts: dock_switches',
            '  gather_facts: false',
            '  tasks:',
            '    - name: Configure logging host',
            '      cisco.ios.ios_config:',
            '        lines:',
            '          - logging host 10.10.5.70',
            '',
            '$ ansible-playbook -i inventory.ini syslog.yml --check',
          ] },
          "`--check` is a dry run. Run it again for real without the flag, and run it a second time to see idempotence: the tasks report `ok` instead of `changed`.",
        ],
      },
      {
        h: 'Terraform',
        body: [
          "**Terraform** (HashiCorp) is an **infrastructure as code** tool focused on **provisioning**: creating, changing and destroying infrastructure such as cloud networks, virtual machines, load balancers, and resources managed by controllers. It is also **agentless**; it talks to platform **APIs** through plugins called **providers** (AWS, Azure, Google Cloud, and network vendors including several Cisco platforms).",
          { list: [
            "Written in **HCL** (HashiCorp Configuration Language), a **declarative** language: describe resources, not steps.",
            "Keeps a **state file** that records what it built, so it can work out what must change.",
            "Workflow: `terraform init` (download providers), `terraform plan` (show what would change), `terraform apply` (make it so), `terraform destroy` (remove it).",
          ] },
          { cli: [
            '# main.tf',
            'resource "aws_vpc" "tracking" {',
            '  cidr_block = "10.200.0.0/16"',
            '  tags = { Name = "hpl-tracking" }',
            '}',
            '',
            'resource "aws_subnet" "app" {',
            '  vpc_id     = aws_vpc.tracking.id',
            '  cidr_block = "10.200.1.0/24"',
            '}',
            '',
            '$ terraform plan',
            'Plan: 2 to add, 0 to change, 0 to destroy.',
          ] },
        ],
      },
      {
        h: 'Side by side, plus the older tools',
        body: [
          { table: [
            ['', 'Ansible', 'Terraform'],
            ['Main job', 'Configure devices and servers (day 1 and day 2)', 'Provision infrastructure (day 0), mostly cloud and API-driven'],
            ['Agents', 'Agentless', 'Agentless'],
            ['Connects with', 'SSH, NETCONF, APIs', 'Provider APIs'],
            ['Model', 'Push from a control node', 'Push via APIs from where it runs'],
            ['Language', 'YAML playbooks', 'HCL'],
            ['Style', 'Tasks run in order (procedural), modules aim for idempotence', 'Declarative, with a state file'],
          ] },
          "Teams often use both: Terraform builds the cloud network and VMs, Ansible configures what runs on them and the on-premises routers and switches.",
          "**Older context:** **Puppet** and **Chef** were the configuration management tools in earlier CCNA versions. Both are typically **agent-based** with a **pull** model (agents on managed nodes check in with a central server) and use Ruby-based languages (Puppet manifests, Chef recipes and cookbooks). Agent-based tools are a poor fit for network devices that cannot run agents, which is one reason agentless tools took over in networking.",
          { svg: '<svg viewBox="0 0 360 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Agentless push compared with agent-based pull" font-size="13" fill="currentColor"><g fill="none" stroke="currentColor"><rect x="6" y="20" width="90" height="34" rx="4" stroke-width="2.5" style="stroke:var(--accent)"/><rect x="6" y="104" width="90" height="34" rx="4"/><path d="M96 37h40M136 31l8 6-8 6M96 121h40M144 115l-8 6 8 6"/><rect x="150" y="20" width="90" height="34" rx="4"/><rect x="150" y="104" width="90" height="34" rx="4"/></g><text x="14" y="42">Ansible</text><text x="14" y="126">Puppet srv</text><text x="158" y="42">switch</text><text x="158" y="126">agent node</text><text x="250" y="34">push over</text><text x="250" y="50">SSH, no agent</text><text x="250" y="118">agent pulls</text><text x="250" y="134">its config</text></svg>' },
        ],
      },
    ],
    techNotes: [
      "Always run `ansible-playbook --check` or `terraform plan` before the real thing. Read the plan; it is the closest thing to a crystal ball.",
      "Never edit infrastructure by hand that Terraform manages. The state file will disagree with reality and the next apply may undo your fix.",
      "Keep secrets out of playbooks and .tf files. Ansible Vault or an external secret store exists for a reason.",
    ],
    examTraps: [
      "Ansible is agentless, push-based, YAML playbooks, usually SSH to network devices.",
      "Terraform is declarative IaC in HCL, uses providers and a state file, mainly for provisioning.",
      "Puppet and Chef are agent-based and pull-based (older context).",
      "Idempotent means running it again changes nothing if the target already matches.",
    ],
    check: [
      ['Which statement about Ansible is correct?', ['It requires an agent on every managed switch', 'It is agentless and typically pushes configuration over SSH using YAML playbooks', 'It uses HCL and a state file', 'It only works with cloud providers'], 1, "Ansible connects from a control node without agents and runs YAML playbooks. HCL and state files describe Terraform."],
      ['Which tool uses providers, a state file and a plan/apply workflow to provision infrastructure declaratively?', ['Ansible', 'Terraform', 'Chef', 'SNMP'], 1, "Terraform's providers talk to APIs, the state file records what was built, and plan/apply shows then makes changes."],
      ['What does idempotent mean for a configuration management task?', ['It runs only once', 'Running it repeatedly produces the same end state without additional changes', 'It must be run on every device at once', 'It encrypts the configuration'], 1, "An idempotent task makes changes only when the target differs from the desired state, so repeated runs are safe."],
    ],
    related: { tickets: [], cards: ['cfgmgmt', 'netauto', 'dataformats'], hw: null, drill: false },
  });

  L.push({
    id: 'l6-7',
    obj: '6.7',
    domain: 'auto',
    title: 'Reading JSON without panicking',
    minutes: 12,
    caseFile: "The controller API returns a wall of curly braces and square brackets, and Kenji's script needs the management IP of every switch that is unreachable. Ravi printed one response and circled things in red pen. Tonight you learn to read JSON the way you read `show` output: quickly, and knowing exactly what each symbol means.",
    sections: [
      {
        h: 'What JSON is',
        body: [
          "**JSON** (JavaScript Object Notation) is a text format for structured data. It is easy for people to read and for programs to parse, and it is the most common format for REST API payloads. Whitespace (spaces, tabs, line breaks) between elements does not matter; it is only there for humans.",
        ],
      },
      {
        h: 'The building blocks',
        body: [
          { table: [
            ['Element', 'Looks like', 'Notes'],
            ['Object', '`{ ... }`', 'An unordered set of key/value pairs, separated by commas.'],
            ['Key/value pair', '`"hostname": "HPL-DOCK3"`', 'The key is always a string in double quotes, then a colon, then the value.'],
            ['Array', '`[ ... ]`', 'An ordered list of values, separated by commas.'],
            ['String', '`"Reachable"`', 'Text in **double** quotes. Single quotes are not valid JSON.'],
            ['Number', '`48` or `3.5`', 'No quotes.'],
            ['Boolean', '`true` / `false`', 'Lowercase, no quotes.'],
            ['Null', '`null`', 'No value. Lowercase, no quotes.'],
          ] },
          "Values can be any of these, including objects and arrays, so data nests as deep as needed.",
        ],
      },
      {
        h: 'A real response, annotated',
        body: [
          { cli: [
            '{',
            '  "response": [',
            '    {',
            '      "hostname": "HPL-DOCK3",',
            '      "managementIpAddress": "10.99.0.13",',
            '      "reachable": false,',
            '      "uplinks": ["Gi1/1/1", "Gi1/1/2"],',
            '      "location": { "site": "Baltimore", "floor": 1 },',
            '      "serialNumber": null',
            '    },',
            '    {',
            '      "hostname": "HPL-DOCK4",',
            '      "managementIpAddress": "10.99.0.14",',
            '      "reachable": true,',
            '      "uplinks": ["Gi1/1/1"],',
            '      "location": { "site": "Baltimore", "floor": 2 },',
            '      "serialNumber": "FOC2231X0AB"',
            '    }',
            '  ],',
            '  "version": "1.0"',
            '}',
          ] },
          { list: [
            "The outermost `{ }` is one object with two keys: `response` and `version`.",
            "`response` holds an **array** of two objects, one per switch.",
            "`reachable` is a boolean; `false` without quotes. The string `\"false\"` would be a different thing entirely.",
            "`uplinks` is an array of strings; `location` is a nested object.",
            "`floor` is a number; `serialNumber` is null for the first switch.",
          ] },
          "Ravi's red-pen answer: the unreachable switch is the object where `reachable` is `false`, and its management IP is `10.99.0.13`. In Python that is `data[\"response\"][0][\"managementIpAddress\"]`.",
          { svg: '<svg viewBox="0 0 360 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Tree view of the JSON response" font-size="13" fill="currentColor"><g fill="none" stroke="currentColor"><rect x="140" y="6" width="80" height="28" rx="4"/><rect x="40" y="62" width="110" height="28" rx="4"/><rect x="220" y="62" width="100" height="28" rx="4"/><rect x="6" y="122" width="82" height="28" rx="4" stroke-width="2.5" style="stroke:var(--accent)"/><rect x="100" y="122" width="82" height="28" rx="4"/><path d="M180 34l-85 28M180 34l90 28M95 90l-48 32M95 90l46 32"/></g><text x="158" y="25">object</text><text x="46" y="81">response: [ ]</text><text x="226" y="81">version: str</text><text x="14" y="141">[0] obj</text><text x="108" y="141">[1] obj</text><text x="6" y="174">reachable: false</text><text x="6" y="188" font-size="12">managementIpAddress: 10.99.0.13</text></svg>' },
        ],
      },
      {
        h: 'What makes JSON invalid',
        body: [
          { list: [
            "Keys without double quotes: `{hostname: \"R1\"}` is invalid.",
            "Single quotes: `{'hostname': 'R1'}` is invalid.",
            "A trailing comma after the last item: `[\"a\", \"b\",]` is invalid.",
            "Comments: JSON has none.",
            "Capitalized `True`, `False` or `NULL`: invalid; they must be lowercase.",
          ] },
          { note: "Compare the cousins: XML uses opening and closing tags (`<hostname>R1</hostname>`); YAML uses indentation and dashes for lists, no braces needed. JSON is braces, brackets, colons and commas." },
        ],
      },
    ],
    techNotes: [
      "Paste a confusing response into a JSON formatter or `python3 -m json.tool` to indent it. Structure jumps out immediately.",
      "Count the braces like you count parentheses. Every `{` has a `}` and every `[` has a `]`.",
      "When a script says KeyError, the key name is case-sensitive: `managementIpAddress` is not `managementIPAddress`.",
    ],
    examTraps: [
      "Objects use curly braces { }; arrays use square brackets [ ].",
      "Keys are always double-quoted strings.",
      "true, false and null are unquoted lowercase literals.",
      "Exam questions often ask how many objects or keys a snippet has. Count the { } pairs for objects and the colons at one level for keys.",
    ],
    check: [
      ['In JSON, what does a pair of square brackets [ ] represent?', ['An object', 'An array', 'A string', 'A comment'], 1, "Square brackets enclose an ordered array of values. Curly braces enclose an object, strings use double quotes, and JSON has no comments."],
      ['Which is valid JSON?', ["{'vlan': 10}", '{"vlan": 10, "name": "SCANNERS"}', '{vlan: 10}', '{"vlan": 10,}'], 1, "Keys must be double-quoted strings and there can be no trailing comma. Single quotes and unquoted keys are invalid."],
      ['Given `{"interface": "Gi0/1", "enabled": true, "vlans": [10, 20]}`, what type is the value of "enabled"?', ['String', 'Number', 'Boolean', 'Array'], 2, "true without quotes is a boolean. \"Gi0/1\" is a string and [10, 20] is an array of numbers."],
    ],
    related: { tickets: [], cards: ['dataformats', 'rest'], hw: null, drill: false },
  });

  TT.lessons.push(...L);
})(globalThis);
