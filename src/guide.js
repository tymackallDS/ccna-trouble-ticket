/* Harbor Point Night Shift — Protocol Field Guide and quiz bank.
 * Organized by the six CCNA 200-301 exam domains. Each card carries one or more
 * multiple-choice questions; the quiz draws from all of them.
 */
(function (G) {
  'use strict';
  const TT = (G.TT = G.TT || {});

  TT.domains = [
    { id: 'fund', name: 'Network Fundamentals' },
    { id: 'access', name: 'Network Access' },
    { id: 'ipconn', name: 'IP Connectivity' },
    { id: 'svc', name: 'IP Services' },
    { id: 'sec', name: 'Security Fundamentals' },
    { id: 'auto', name: 'Automation and Programmability' },
  ];

  // q: [question, [options], correctIndex, why]
  TT.cards = [
    {
      id: 'osi', domain: 'fund', name: 'OSI and TCP/IP models', layer: 'All', ports: '',
      summary: 'Two ways to describe what happens to data on its way across a network. OSI has seven layers; the TCP/IP model folds them into four or five.',
      facts: [
        '7 Application, 6 Presentation, 5 Session, 4 Transport, 3 Network, 2 Data Link, 1 Physical',
        'PDUs: segment (TCP) or datagram (UDP) at L4, packet at L3, frame at L2, bits at L1',
        'Switches work at L2 (MAC addresses), routers at L3 (IP addresses)',
        'Encapsulation adds headers on the way down; de-encapsulation strips them on the way up',
      ],
      trap: 'The exam calls the L2 PDU a frame and the L3 PDU a packet. Do not mix them up.',
      q: [
        ['Which PDU is handled at the Data Link layer?', ['Packet', 'Frame', 'Segment', 'Bits'], 1, 'Layer 2 encapsulates packets into frames with source and destination MAC addresses.'],
        ['A router makes forwarding decisions at which OSI layer?', ['Layer 1', 'Layer 2', 'Layer 3', 'Layer 4'], 2, 'Routers forward based on the destination IP address, a Layer 3 field.'],
      ],
    },
    {
      id: 'ethernet', domain: 'fund', name: 'Ethernet and MAC addresses', layer: 'L2', ports: '',
      summary: 'Ethernet frames carry a 48-bit source and destination MAC. Switches learn which port each source MAC lives on and forward frames only where they need to go.',
      facts: [
        'MAC = 48 bits; the first 24 bits are the OUI that identifies the vendor',
        'Switch learns from the SOURCE MAC, forwards by the DESTINATION MAC',
        'Unknown unicast, broadcast and multicast frames are flooded out every port in the VLAN except the one they arrived on',
        'Minimum frame size is 64 bytes; the FCS trailer catches corrupted frames',
      ],
      trap: 'A switch floods an unknown unicast frame; it does not drop it.',
      q: [
        ['What does a switch do with a frame whose destination MAC is not in its MAC table?', ['Drops it', 'Floods it out all ports in the VLAN except the source port', 'Sends it to the default gateway', 'Returns it to the sender'], 1, 'Unknown unicast frames are flooded so the destination can answer and be learned.'],
      ],
    },
    {
      id: 'cabling', domain: 'fund', name: 'Cabling and interfaces', layer: 'L1', ports: '',
      summary: 'Copper UTP and fiber both connect devices. Most problems show up as interface errors or a speed or duplex mismatch.',
      facts: [
        'Straight-through: unlike devices (PC to switch). Crossover: like devices. Auto MDI-X makes this mostly invisible today',
        '100BASE-TX and 1000BASE-T run up to 100 m on UTP',
        'Single-mode fiber goes farther (km); multimode is cheaper for short runs',
        'Duplex mismatch: the half-duplex side logs late collisions; the full-duplex side logs CRC and runt errors',
      ],
      trap: 'Late collisions on an interface point to a duplex mismatch, not a bad cable.',
      q: [
        ['An interface shows rising late collisions. What is the most likely cause?', ['A bad cable', 'A duplex mismatch', 'An MTU mismatch', 'An ACL'], 1, 'Late collisions appear on the half-duplex side of a duplex mismatch.'],
      ],
    },
    {
      id: 'tcp', domain: 'fund', name: 'TCP', layer: 'L4', ports: 'IP protocol 6',
      summary: 'Connection-oriented and reliable. TCP sets up a session, numbers every byte, acknowledges what arrives and retransmits what does not.',
      facts: [
        'Three-way handshake: SYN, SYN-ACK, ACK',
        'Sequence and acknowledgment numbers give ordering and reliability',
        'Windowing controls how much data is sent before an ACK is required',
        'Header is 20 bytes minimum; four-way FIN exchange closes the session',
      ],
      trap: 'TCP flow control is windowing. Retransmission is how it achieves reliability.',
      q: [
        ['What is the correct order of the TCP three-way handshake?', ['SYN, ACK, SYN-ACK', 'SYN, SYN-ACK, ACK', 'ACK, SYN, FIN', 'SYN-ACK, SYN, ACK'], 1, 'The client sends SYN, the server replies SYN-ACK, the client finishes with ACK.'],
      ],
    },
    {
      id: 'udp', domain: 'fund', name: 'UDP', layer: 'L4', ports: 'IP protocol 17',
      summary: 'Connectionless and lightweight: no handshake, no acknowledgments, no retransmission. Good for voice, video, DNS queries and anything that prefers speed to perfection.',
      facts: [
        'Header is 8 bytes (TCP is at least 20)',
        'No sequencing or flow control',
        'Used by DNS queries, DHCP, TFTP, SNMP, syslog, NTP, VoIP media',
      ],
      trap: 'If a question mentions real-time voice or video, the answer is usually UDP.',
      q: [
        ['Which protocol does TFTP use?', ['TCP 69', 'UDP 69', 'TCP 21', 'UDP 21'], 1, 'TFTP is UDP port 69. FTP is TCP 20 and 21.'],
      ],
    },
    {
      id: 'arp', domain: 'fund', name: 'ARP', layer: 'L2/L3', ports: '',
      summary: 'Maps a known IPv4 address to an unknown MAC address on the local network. Without it, a host cannot build the Ethernet frame.',
      facts: [
        'ARP request is a broadcast (FFFF.FFFF.FFFF); the reply is unicast',
        'To reach another subnet, a host ARPs for its default gateway, not the remote host',
        'View with show ip arp on IOS or arp -a on Windows',
        'The first ping often shows ".!!!!": the first echo is lost while ARP resolves',
      ],
      trap: 'Hosts never ARP for an off-subnet destination. They ARP for the gateway.',
      q: [
        ['A host at 10.0.1.10/24 pings 10.0.2.10. Which address does it ARP for?', ['10.0.2.10', 'Its default gateway', 'The broadcast address', 'The DNS server'], 1, 'The destination is in another subnet, so the frame goes to the gateway.'],
      ],
    },
    {
      id: 'ipv4', domain: 'fund', name: 'IPv4 addressing and subnetting', layer: 'L3', ports: '',
      summary: 'A 32-bit address split into network and host bits by the mask. Subnetting borrows host bits to make more, smaller networks.',
      facts: [
        'Usable hosts = 2^h - 2 (network and broadcast are reserved)',
        'Block size = 256 - mask octet. Subnets start on multiples of the block size',
        'Private ranges (RFC 1918): 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16',
        '/30 gives 2 usable hosts; /31 is allowed on point-to-point links',
        '127.0.0.0/8 is loopback; 169.254.0.0/16 is APIPA (DHCP failed)',
      ],
      trap: '172.16.0.0/12 covers 172.16.x.x through 172.31.x.x. 172.32.1.1 is public.',
      q: [
        ['How many usable hosts are in a /27?', ['32', '30', '62', '14'], 1, '5 host bits: 2^5 - 2 = 30.'],
        ['Which address is in the RFC 1918 private range?', ['172.32.10.1', '192.169.1.1', '172.20.5.5', '11.0.0.1'], 2, '172.16.0.0/12 runs from 172.16.0.0 to 172.31.255.255.'],
        ['A PC has 169.254.12.7. What does that suggest?', ['A static IP', 'It could not reach a DHCP server', 'It is on a VPN', 'It is a loopback'], 1, '169.254.0.0/16 is APIPA, self-assigned when DHCP fails.'],
      ],
    },
    {
      id: 'ipv6', domain: 'fund', name: 'IPv6', layer: 'L3', ports: '',
      summary: '128-bit addresses written in hex. There is no broadcast; neighbor discovery (NDP) over ICMPv6 replaces ARP.',
      facts: [
        'Global unicast 2000::/3, link-local FE80::/10, unique local FC00::/7, multicast FF00::/8',
        'Shorten by dropping leading zeros and replacing ONE run of all-zero groups with ::',
        'EUI-64: split the MAC, insert FFFE, flip the 7th bit',
        'NDP uses Neighbor Solicitation and Neighbor Advertisement (ICMPv6)',
        'SLAAC lets a host build its own address from the router\'s prefix',
      ],
      trap: ':: can appear only once in an address.',
      q: [
        ['Which prefix identifies an IPv6 link-local address?', ['2000::/3', 'FC00::/7', 'FE80::/10', 'FF00::/8'], 2, 'Link-local addresses are FE80::/10 and never leave the local link.'],
        ['What replaces ARP in IPv6?', ['DHCPv6', 'NDP using ICMPv6', 'IGMP', 'Broadcast ARP'], 1, 'Neighbor Discovery uses ICMPv6 NS and NA messages.'],
      ],
    },
    {
      id: 'wireless', domain: 'fund', name: 'Wireless (802.11)', layer: 'L1/L2', ports: 'CAPWAP UDP 5246, 5247',
      summary: 'Wi-Fi shares the air, so APs use channels and security protocols to coexist. Enterprise networks run lightweight APs managed by a wireless LAN controller.',
      facts: [
        '2.4 GHz non-overlapping channels: 1, 6, 11',
        'WPA2 uses AES with CCMP; WPA3 adds SAE for personal mode',
        'Lightweight APs tunnel to a WLC with CAPWAP: UDP 5246 control, 5247 data',
        'AP modes include local, FlexConnect, monitor and sniffer',
      ],
      trap: 'WEP and TKIP are obsolete. Pick AES/CCMP for WPA2.',
      q: [
        ['Which three 2.4 GHz channels do not overlap?', ['1, 5, 9', '1, 6, 11', '2, 7, 12', '1, 7, 13'], 1, 'In North America, 1, 6 and 11 are the non-overlapping set.'],
      ],
    },

    /* ---------------- Network Access ---------------- */
    {
      id: 'vlan', domain: 'access', name: 'VLANs', layer: 'L2', ports: '',
      summary: 'Splits one physical switch into several logical ones. Each VLAN is its own broadcast domain, and traffic between VLANs needs a router or Layer 3 switch.',
      facts: [
        'Every port starts in VLAN 1',
        'Normal range 1 to 1005; extended range 1006 to 4094',
        'switchport mode access + switchport access vlan N',
        'show vlan brief lists access ports only, never trunks',
      ],
      trap: 'An access port assigned to a VLAN that does not exist on the switch is inactive.',
      q: [
        ['Two PCs in the same subnet are on ports in VLAN 10 and VLAN 20 of one switch. Can they ping each other without a router?', ['Yes', 'No'], 1, 'Different VLANs are different broadcast domains. ARP never crosses between them.'],
      ],
    },
    {
      id: 'trunk', domain: 'access', name: '802.1Q trunking and DTP', layer: 'L2', ports: '',
      summary: 'A trunk carries many VLANs over one link by adding a 4-byte 802.1Q tag to each frame, except frames in the native VLAN, which go untagged.',
      facts: [
        'Native VLAN is 1 by default and must match on both ends',
        'switchport trunk allowed vlan 10,20 REPLACES the list; add appends',
        'DTP modes: dynamic auto + dynamic auto = access; desirable + auto = trunk',
        'Best practice: switchport nonegotiate and a hard-coded mode',
      ],
      trap: 'Two ports left at dynamic auto never form a trunk.',
      q: [
        ['What does "switchport trunk allowed vlan 30" do on a trunk that allowed VLANs 10 and 20?', ['Adds VLAN 30', 'Replaces the list with only VLAN 30', 'Removes VLAN 30', 'Nothing'], 1, 'Without add, the command replaces the allowed list.'],
        ['Both ends of a link are set to dynamic auto. What forms?', ['A trunk', 'An access link', 'An EtherChannel', 'Err-disabled'], 1, 'Auto only answers; neither side initiates, so the link stays access.'],
      ],
    },
    {
      id: 'stp', domain: 'access', name: 'Spanning Tree (STP and RSTP)', layer: 'L2', ports: '',
      summary: 'Stops Layer 2 loops by electing a root bridge and blocking redundant paths. RSTP (802.1w) does the same job with much faster convergence.',
      facts: [
        'Root bridge = lowest bridge ID (priority, default 32768 + VLAN ID, then lowest MAC)',
        'Roles: root port, designated port, non-designated (blocking). RSTP adds alternate and backup',
        '802.1D states: blocking, listening, learning, forwarding. RSTP: discarding, learning, forwarding',
        'Timers: hello 2 s, forward delay 15 s, max age 20 s',
        'PortFast on edge ports; BPDU Guard err-disables a PortFast port that receives a BPDU',
      ],
      trap: 'Lower priority wins. Setting priority 4096 makes a switch MORE likely to be root.',
      q: [
        ['Which switch becomes the STP root bridge?', ['Highest MAC address', 'Lowest bridge ID', 'Most ports', 'Highest priority value'], 1, 'Lowest priority wins; lowest MAC breaks a tie.'],
        ['What does BPDU Guard do when a PortFast port receives a BPDU?', ['Ignores it', 'Puts the port in err-disabled', 'Makes the port root', 'Moves it to VLAN 1'], 1, 'It assumes a switch was plugged in where only hosts belong and shuts the port.'],
      ],
    },
    {
      id: 'etherchannel', domain: 'access', name: 'EtherChannel', layer: 'L2/L3', ports: '',
      summary: 'Bundles up to eight physical links into one logical link, so STP sees one path and traffic load-shares across all members.',
      facts: [
        'LACP (IEEE 802.3ad): active and passive',
        'PAgP (Cisco): desirable and auto',
        'mode on = static, no negotiation',
        'Members must match speed, duplex, mode and VLANs',
      ],
      trap: 'passive + passive (LACP) or auto + auto (PAgP) never forms a bundle.',
      q: [
        ['Which LACP combination forms an EtherChannel?', ['passive + passive', 'active + passive', 'auto + auto', 'on + active'], 1, 'At least one side must be active.'],
      ],
    },
    {
      id: 'cdp', domain: 'access', name: 'CDP and LLDP', layer: 'L2', ports: '',
      summary: 'Neighbor discovery: each device announces its name, platform, interface and addresses to directly connected neighbors.',
      facts: [
        'CDP: Cisco proprietary, every 60 s, holdtime 180 s, on by default',
        'LLDP: IEEE 802.1AB, every 30 s, holdtime 120 s, off by default on IOS',
        'show cdp neighbors detail shows the neighbor\'s IP address',
        'Enable LLDP with lldp run',
      ],
      trap: 'LLDP is disabled by default on Cisco devices.',
      q: [
        ['Which command enables LLDP globally on a Cisco switch?', ['cdp run', 'lldp run', 'lldp enable', 'feature lldp'], 1, 'lldp run turns it on globally.'],
      ],
    },

    /* ---------------- IP Connectivity ---------------- */
    {
      id: 'rtable', domain: 'ipconn', name: 'Route selection', layer: 'L3', ports: '',
      summary: 'A router picks the route with the longest matching prefix. Administrative distance only decides between routes to the same prefix from different sources; metric decides within one protocol.',
      facts: [
        '1. Longest prefix match. 2. Lowest administrative distance. 3. Lowest metric',
        'AD: connected 0, static 1, eBGP 20, EIGRP 90, OSPF 110, RIP 120, external EIGRP 170, iBGP 200',
        'A floating static route has a higher AD so it only appears when the primary route disappears',
        'Codes in show ip route: C connected, L local, S static, O OSPF, D EIGRP',
      ],
      trap: 'Prefix length is checked first. A /24 learned by RIP beats a /16 learned by OSPF.',
      q: [
        ['A router has 10.1.0.0/16 via OSPF and 10.1.1.0/24 via RIP. Which is used for 10.1.1.5?', ['OSPF, lower AD', 'RIP, longer prefix', 'Both, load balanced', 'Neither'], 1, 'Longest prefix match is checked before administrative distance.'],
        ['What is the administrative distance of OSPF?', ['90', '110', '120', '1'], 1, 'OSPF is 110; EIGRP is 90; RIP is 120.'],
      ],
    },
    {
      id: 'static', domain: 'ipconn', name: 'Static and default routes', layer: 'L3', ports: '',
      summary: 'Routes you type by hand. Simple and predictable, but they never adapt when the network changes.',
      facts: [
        'ip route NETWORK MASK NEXT-HOP (or EXIT-INTERFACE)',
        'Default route: ip route 0.0.0.0 0.0.0.0 NEXT-HOP, shown as S* and "Gateway of last resort"',
        'The route installs only if the next hop is reachable through a connected network',
        'Every path needs a return route',
        'Floating static: give a backup route a higher AD (ip route ... 10.0.0.2 200) so it installs only when the primary disappears',
        'Host route: a /32 (mask 255.255.255.255) to a single address',
      ],
      trap: 'A static route with an unreachable next hop silently stays out of the routing table.',
      q: [
        ['Which command creates a default route via 203.0.113.1?', ['ip default-gateway 203.0.113.1', 'ip route 0.0.0.0 0.0.0.0 203.0.113.1', 'ip route 0.0.0.0 255.255.255.255 203.0.113.1', 'default route 203.0.113.1'], 1, 'A default route matches every destination: 0.0.0.0 with mask 0.0.0.0.'],
      ],
    },
    {
      id: 'ospf', domain: 'ipconn', name: 'OSPF', layer: 'L3', ports: 'IP protocol 89',
      summary: 'A link-state protocol. Every router in an area builds the same map of the network and runs Dijkstra\'s SPF algorithm to find the lowest-cost path to each prefix.',
      facts: [
        'Cost = reference bandwidth (100 Mbps default) / interface bandwidth',
        'Hellos to 224.0.0.5 every 10 s on broadcast links, dead interval 40 s; DR/BDR use 224.0.0.6',
        'Neighbor states: Down, Init, 2-Way, ExStart, Exchange, Loading, Full',
        'Must match: area, subnet and mask, hello/dead timers, authentication, stub flag. Router IDs must be unique. MTU must match to reach Full',
        'Router ID order: router-id command, highest loopback IP, highest active interface IP',
        'DR election: highest priority (default 1), then highest router ID. Priority 0 never becomes DR',
      ],
      trap: 'A passive interface is still advertised. It only stops sending hellos.',
      q: [
        ['Two OSPF routers on the same link are stuck and never become neighbors. Which mismatch causes this?', ['Router priority', 'Area ID', 'Interface description', 'Process ID'], 1, 'Area IDs must match. Process IDs are local and do not have to match.'],
        ['With the default reference bandwidth, what is the OSPF cost of a FastEthernet interface?', ['1', '10', '100', '0'], 0, '100 Mbps / 100 Mbps = 1. GigabitEthernet also gets 1 unless you raise the reference bandwidth.'],
        ['Which multicast address do all OSPF routers listen on?', ['224.0.0.5', '224.0.0.6', '224.0.0.9', '224.0.0.10'], 0, '224.0.0.5 is all OSPF routers; 224.0.0.6 is DR and BDR.'],
      ],
    },
    {
      id: 'fhrp', domain: 'ipconn', name: 'First-hop redundancy (HSRP, VRRP, GLBP)', layer: 'L3', ports: '',
      summary: 'Two or more routers share one virtual IP that hosts use as their gateway. If the active router fails, a standby takes over and the hosts never notice.',
      facts: [
        'HSRP: Cisco, active and standby, default priority 100, preemption off by default',
        'HSRPv1 virtual MAC 0000.0c07.acXX (XX = group)',
        'VRRP: open standard, master and backup',
        'GLBP: Cisco, load-balances across routers (AVG and AVFs)',
      ],
      trap: 'Without preempt, a recovered higher-priority HSRP router does not take back the active role.',
      q: [
        ['Which FHRP is an open standard?', ['HSRP', 'GLBP', 'VRRP', 'CDP'], 2, 'VRRP is IETF standard; HSRP and GLBP are Cisco proprietary.'],
      ],
    },

    /* ---------------- IP Services ---------------- */
    {
      id: 'dhcp', domain: 'svc', name: 'DHCP', layer: 'L7', ports: 'UDP 67 server, 68 client',
      summary: 'Hands out IP addresses, masks, gateways and DNS servers automatically.',
      facts: [
        'DORA: Discover, Offer, Request, Acknowledge',
        'Discover is a broadcast, so a router needs ip helper-address to relay it to a server on another subnet',
        'ip dhcp excluded-address keeps static addresses out of the pool',
        'A router can be a client too: ip address dhcp on the interface; it installs the offered default route with AD 254',
      ],
      trap: 'ip helper-address goes on the interface facing the CLIENTS, not the server.',
      q: [
        ['What is the order of the DHCP exchange?', ['Request, Offer, Discover, Ack', 'Discover, Offer, Request, Ack', 'Offer, Discover, Ack, Request', 'Discover, Request, Offer, Ack'], 1, 'DORA.'],
        ['Clients on 10.1.1.0/24 need a DHCP server on 10.9.9.9. Where does ip helper-address 10.9.9.9 go?', ['On the server', 'On the router interface facing the clients', 'On the switch trunk', 'In global config'], 1, 'The router relays the client broadcasts it receives on that interface.'],
      ],
    },
    {
      id: 'dns', domain: 'svc', name: 'DNS', layer: 'L7', ports: 'UDP/TCP 53',
      summary: 'Turns names into addresses. Queries usually use UDP 53; zone transfers and large answers use TCP 53.',
      facts: [
        'A record = IPv4, AAAA = IPv6, CNAME = alias, MX = mail',
        'On IOS: ip name-server, and ip domain lookup (on by default)',
        'no ip domain lookup stops a typo from hanging the CLI',
      ],
      trap: 'AAAA is the IPv6 record; A is IPv4.',
      q: [
        ['Which DNS record type holds an IPv6 address?', ['A', 'AAAA', 'MX', 'PTR'], 1, 'AAAA (quad-A) maps a name to an IPv6 address.'],
      ],
    },
    {
      id: 'nat', domain: 'svc', name: 'NAT and PAT', layer: 'L3', ports: '',
      summary: 'Translates private inside addresses to public ones. PAT (overload) lets many inside hosts share one public IP by tracking source ports.',
      facts: [
        'Inside local = private host IP; inside global = what the internet sees',
        'Static NAT: one-to-one, permanent. Dynamic NAT: from a pool. PAT: many-to-one with ports',
        'ip nat inside / ip nat outside on the interfaces',
        'ip nat inside source list 1 interface g0/1 overload',
        'Static: ip nat inside source static LOCAL GLOBAL (inside local first!)',
        'Pool: ip nat pool NAME START END netmask M, then ip nat inside source list 1 pool NAME [overload]',
        'Without overload, a pool runs out after one host per address; extra hosts get no translation',
      ],
      trap: 'Inside global is the public address that represents an inside host.',
      q: [
        ['Which NAT term describes the public address assigned to an inside host?', ['Inside local', 'Inside global', 'Outside local', 'Outside global'], 1, 'Inside = the host is ours; global = the address as seen on the internet.'],
        ['Which keyword turns dynamic NAT into PAT?', ['pat', 'overload', 'extendable', 'multiple'], 1, 'overload lets many hosts share one address using port numbers.'],
      ],
    },
    {
      id: 'ntp', domain: 'svc', name: 'NTP', layer: 'L7', ports: 'UDP 123',
      summary: 'Keeps device clocks in sync so logs and certificates line up.',
      facts: [
        'Stratum = distance from a reference clock; stratum 1 is attached to one',
        'ntp server ADDRESS on a client; ntp master makes the router a server',
        'show ntp associations, show ntp status',
        'An unsynchronized clock shows * at the start of show clock',
      ],
      trap: 'A lower stratum number is more accurate.',
      q: [['Which port does NTP use?', ['TCP 123', 'UDP 123', 'UDP 161', 'UDP 514'], 1, 'NTP uses UDP 123.']],
    },
    {
      id: 'snmp', domain: 'svc', name: 'SNMP', layer: 'L7', ports: 'UDP 161 agent, 162 traps',
      summary: 'Lets a manager poll devices for counters and status, and lets devices push alerts (traps and informs).',
      facts: [
        'Manager polls the agent on UDP 161; traps and informs go to the manager on UDP 162',
        'Data lives in the MIB; each value has an OID',
        'v1 and v2c use community strings in clear text; v3 adds authentication and encryption',
        'Informs are acknowledged; traps are not',
      ],
      trap: 'Only SNMPv3 encrypts.',
      q: [['Which SNMP version supports encryption?', ['v1', 'v2c', 'v3', 'All of them'], 2, 'SNMPv3 with authPriv authenticates and encrypts.']],
    },
    {
      id: 'syslog', domain: 'svc', name: 'Syslog', layer: 'L7', ports: 'UDP 514',
      summary: 'Sends log messages to the console, a buffer or a remote server, each tagged with a severity level from 0 to 7.',
      facts: [
        '0 Emergency, 1 Alert, 2 Critical, 3 Error, 4 Warning, 5 Notification, 6 Informational, 7 Debugging',
        'Memory aid: Even After Coffee, Everyone Wants Naps In December',
        'logging trap 4 sends levels 0 through 4',
        'logging synchronous stops messages from breaking up your typing',
      ],
      trap: 'The number is the most severe at 0. Setting level 4 includes 0 to 4.',
      q: [['Which syslog level is Warning?', ['2', '3', '4', '5'], 2, '4 is Warning; 5 is Notification. The LINK-5 messages in this game are notifications.']],
    },
    {
      id: 'ssh', domain: 'svc', name: 'SSH and Telnet', layer: 'L7', ports: 'TCP 22, Telnet TCP 23',
      summary: 'Remote CLI access. Telnet sends everything, passwords included, in clear text; SSH encrypts the session.',
      facts: [
        'Setup: hostname, ip domain-name, crypto key generate rsa (768 bits or more for v2)',
        'username NAME secret PASSWORD, line vty 0 15, login local, transport input ssh',
        'ip ssh version 2',
        'A switch needs an IP on an SVI and ip default-gateway to be managed remotely',
      ],
      trap: 'RSA keys need a hostname other than the default and a domain name.',
      q: [['Which command restricts VTY lines to SSH only?', ['transport input ssh', 'ip ssh only', 'login ssh', 'service ssh'], 0, 'Under line vty, transport input ssh blocks Telnet.']],
    },
    {
      id: 'qos', domain: 'svc', name: 'QoS', layer: 'L2/L3', ports: '',
      summary: 'Gives important traffic, mostly voice and video, priority when links are congested.',
      facts: [
        'Classification and marking: DSCP in the IP header, CoS in the 802.1Q tag',
        'Voice is usually marked DSCP EF (46)',
        'LLQ gives voice a strict-priority queue',
        'Policing drops excess traffic; shaping buffers it',
        'Voice targets: one-way delay 150 ms or less, jitter 30 ms or less, loss 1% or less',
      ],
      trap: 'Shaping delays traffic; policing drops (or re-marks) it.',
      q: [['Which DSCP value is standard for voice?', ['AF41', 'CS1', 'EF (46)', '0'], 2, 'Expedited Forwarding, DSCP 46.']],
    },

    /* ---------------- Security ---------------- */
    {
      id: 'acl', domain: 'sec', name: 'Access control lists', layer: 'L3/L4', ports: '',
      summary: 'Ordered permit and deny rules that filter traffic in or out of an interface. The first match wins, and an invisible deny any ends every list.',
      facts: [
        'Standard: 1 to 99 and 1300 to 1999, match source IP only. Place close to the DESTINATION',
        'Extended: 100 to 199 and 2000 to 2699, match source, destination, protocol and port. Place close to the SOURCE',
        'Wildcard masks: 0 = must match, 1 = ignore. 0.0.0.255 matches a /24',
        'One ACL per interface, per direction, per protocol',
      ],
      trap: 'An ACL with only deny statements blocks everything because of the implicit deny.',
      q: [
        ['Where should a standard ACL be placed?', ['Close to the source', 'Close to the destination', 'On every interface', 'On the trunk'], 1, 'It matches only the source, so placing it near the source would block too much.'],
        ['Which wildcard mask matches all hosts in 192.168.5.0/24?', ['255.255.255.0', '0.0.0.255', '0.0.255.255', '0.0.0.0'], 1, 'The wildcard is the inverse of the subnet mask.'],
      ],
    },
    {
      id: 'portsec', domain: 'sec', name: 'Port security', layer: 'L2', ports: '',
      summary: 'Limits which and how many MAC addresses can use an access port.',
      facts: [
        'Default: 1 MAC address, violation mode shutdown (err-disabled)',
        'Violation modes: shutdown, restrict (drops and logs), protect (drops silently)',
        'switchport port-security mac-address sticky learns and saves addresses',
        'Recover an err-disabled port with shutdown then no shutdown',
      ],
      trap: 'Port security only works on a port set to switchport mode access (or trunk), not dynamic.',
      q: [['What is the default port security violation mode?', ['protect', 'restrict', 'shutdown', 'log'], 2, 'The port goes err-disabled.']],
    },
    {
      id: 'snooping', domain: 'sec', name: 'DHCP snooping and Dynamic ARP Inspection', layer: 'L2', ports: '',
      summary: 'DHCP snooping blocks rogue DHCP servers and builds a binding table of IP-to-MAC-to-port. DAI uses that table to drop forged ARP replies.',
      facts: [
        'Ports are untrusted by default once snooping is on; trust the uplink toward the real server',
        'Untrusted ports drop DHCP server messages (Offer, Ack)',
        'DAI checks ARP against the snooping binding table',
      ],
      trap: 'Forget to trust the uplink and every client loses DHCP.',
      q: [['After enabling DHCP snooping, clients stop getting addresses. Most likely cause?', ['The pool is full', 'The uplink to the server is not trusted', 'DAI is off', 'The VLAN is wrong'], 1, 'Untrusted ports drop the server\'s Offer and Ack messages.']],
    },
    {
      id: 'aaa', domain: 'sec', name: 'AAA: RADIUS and TACACS+', layer: 'L7', ports: 'RADIUS UDP 1812/1813, TACACS+ TCP 49',
      summary: 'Authentication (who you are), authorization (what you may do) and accounting (what you did), handled by a central server.',
      facts: [
        'RADIUS: open standard, UDP, encrypts only the password, combines authentication and authorization',
        'TACACS+: Cisco, TCP 49, encrypts the whole payload, separates all three functions',
        'TACACS+ is favored for device administration; RADIUS for network access (802.1X)',
      ],
      trap: 'TACACS+ encrypts the entire packet body; RADIUS does not.',
      q: [['Which AAA protocol uses TCP and encrypts the entire payload?', ['RADIUS', 'TACACS+', 'LDAP', 'Kerberos'], 1, 'TACACS+ uses TCP 49 and encrypts the full body.']],
    },

    /* ---------------- Automation ---------------- */
    {
      id: 'sdn', domain: 'auto', name: 'Software-defined networking', layer: 'Mgmt', ports: 'OpenFlow TCP 6653',
      summary: 'SDN pulls the control plane out of each device into a central controller. Apps talk to the controller northbound; the controller programs devices southbound.',
      facts: [
        'Planes: data (forward frames and packets), control (build tables: OSPF, STP, ARP), management (SSH, SNMP, syslog)',
        'Northbound interface: apps to controller, usually a REST API. Southbound: controller to devices (OpenFlow, NETCONF, RESTCONF, SSH)',
        'Cisco SD-Access: DNA Center (Catalyst Center) controller, underlay of IS-IS routed links, VXLAN overlay, LISP control plane',
        'Cisco SD-WAN components: vManage (management), vSmart (control), vBond (orchestration), WAN Edge routers',
      ],
      trap: 'Underlay is the physical network that carries traffic; overlay is the virtual network built on top of it (VXLAN tunnels in SD-Access).',
      q: [
        ['Which interface do applications use to talk to an SDN controller?', ['Southbound', 'Northbound', 'Eastbound', 'Management'], 1, 'Northbound faces up toward apps; southbound faces down toward the devices.'],
        ['In Cisco SD-Access, which protocol builds the VXLAN overlay\'s control plane?', ['OSPF', 'LISP', 'BGP', 'EIGRP'], 1, 'SD-Access uses LISP for the control plane and VXLAN for the data plane.'],
      ],
    },
    {
      id: "switchif", domain: "access", name: "Switch interfaces, speed and duplex", layer: "L1/L2", ports: "",
      summary: "Every switch port negotiates speed and duplex. A mismatch still lets the link come up, which is why it causes slow, error-filled links instead of a clean outage.",
      facts: [
        "Autonegotiation picks the best common speed and duplex. If one side is hard-set, the other side senses speed but falls back to half duplex at 10/100",
        "Duplex mismatch symptoms: late collisions on the half-duplex side, CRC and runts on the full-duplex side",
        "show interfaces status: connected, notconnect, disabled, err-disabled",
        "Runts are under 64 bytes, giants over 1518 bytes; CRC errors usually mean bad cabling or interference",
      ],
      trap: "Late collisions on a modern switch almost always mean a duplex mismatch.",
      q: [
        ["A port shows late collisions. What is the most likely cause?", ["A VLAN mismatch", "A duplex mismatch", "A native VLAN mismatch", "STP blocking"], 1, "Late collisions happen when one side runs half duplex while the other runs full."],
        ["A switch port is autonegotiating and the neighbor is hard-set to 100 Mbps full. What does the switch choose at 100 Mbps?", ["Full duplex", "Half duplex", "It disables the port", "1000 Mbps"], 1, "Without negotiation the switch senses speed but must assume half duplex at 10 or 100 Mbps."],
      ],
    },
    {
      id: "ipv4hdr", domain: "fund", name: "The IPv4 header", layer: "L3", ports: "",
      summary: "Each IPv4 packet carries a 20-byte minimum header. A few fields matter most: TTL stops loops, Protocol says what is inside, and DSCP marks priority.",
      facts: [
        "Version 4, IHL (header length), DSCP and ECN (old ToS byte), Total Length, Identification, Flags, Fragment Offset",
        "TTL drops by 1 at every router; at 0 the packet is discarded and an ICMP Time Exceeded is sent (traceroute uses this)",
        "Protocol field: 1 ICMP, 6 TCP, 17 UDP, 89 OSPF, 88 EIGRP",
        "Header checksum covers only the header and is recalculated at every hop because TTL changes",
      ],
      trap: "The Protocol field identifies the Layer 4 (or routing) protocol, not the application. Port numbers live in the TCP or UDP header.",
      q: [
        ["Which IPv4 field prevents a packet from looping forever?", ["Identification", "Flags", "TTL", "DSCP"], 2, "Each router decrements TTL and drops the packet when it hits zero."],
        ["What value in the IPv4 Protocol field means OSPF?", ["6", "17", "88", "89"], 3, "OSPF is IP protocol 89; EIGRP is 88."],
      ],
    },
    {
      id: "packet", domain: "ipconn", name: "The life of a packet", layer: "L2/L3", ports: "",
      summary: "As a packet crosses routers, the IP addresses stay the same end to end, but the Ethernet frame is rebuilt at every hop with new MAC addresses.",
      facts: [
        "A host sends to a remote network by framing the packet to its default gateway's MAC (found with ARP)",
        "Each router strips the frame, looks up the destination IP, decrements TTL, and builds a new frame for the next hop",
        "Source and destination IP do not change (unless NAT is involved); source and destination MAC change at every hop",
        "ARP request is a broadcast (ffff.ffff.ffff); the ARP reply is unicast",
      ],
      trap: "When asked for the destination MAC of a frame leaving a PC for a remote server, the answer is the default gateway's MAC, not the server's.",
      q: [
        ["PC1 sends a packet to a server two routers away. What is the destination MAC of the frame leaving PC1?", ["The server's MAC", "The default gateway's MAC", "ffff.ffff.ffff", "The second router's MAC"], 1, "Frames only travel one hop; PC1 frames the packet to its gateway."],
        ["What changes at every router hop when there is no NAT?", ["Destination IP", "Source IP", "Source and destination MAC", "The TCP port numbers"], 2, "Routers rebuild the Layer 2 frame; the IP header addresses stay the same."],
      ],
    },
    {
      id: "vlsm", domain: "fund", name: "VLSM", layer: "L3", ports: "",
      summary: "Variable-length subnet masking cuts one block into subnets of different sizes, so a 2-host WAN link does not waste a /24.",
      facts: [
        "Sort the requirements from largest to smallest and assign the biggest subnet first",
        "Hosts per subnet = 2^(host bits) minus 2; a /30 gives 2 hosts, /29 gives 6, /28 14, /27 30, /26 62",
        "Each subnet starts on a multiple of its block size (a /27 starts on .0, .32, .64 ...)",
        "Point-to-point links usually get a /30 (or /31, which has no network or broadcast address)",
      ],
      trap: "Always allocate the largest subnet first. Starting small can leave the remaining space misaligned for the big one.",
      q: [
        ["A LAN needs 50 hosts. What is the smallest subnet that fits?", ["/27", "/26", "/25", "/28"], 1, "A /26 gives 62 usable hosts; a /27 gives only 30."],
        ["When allocating with VLSM, which subnet should you assign first?", ["The smallest", "The WAN links", "The largest", "Any order works"], 2, "Biggest first keeps every block aligned on its boundary."],
      ],
    },
    {
      id: "dtpvtp", domain: "access", name: "DTP and VTP", layer: "L2", ports: "",
      summary: "DTP negotiates whether a link becomes a trunk. VTP shares the VLAN list between switches. Both are Cisco-only, and best practice is to turn both down.",
      facts: [
        "DTP modes: dynamic desirable (asks to trunk), dynamic auto (waits to be asked), trunk, access. switchport nonegotiate stops DTP",
        "auto + auto = access. desirable + auto or desirable = trunk",
        "VTP modes: server (create VLANs and advertise), client (cannot create; syncs), transparent (local VLANs; forwards ads)",
        "A switch with a higher VTP revision number in the same domain overwrites everyone's VLAN database",
      ],
      trap: "Two switch ports both left on dynamic auto never form a trunk.",
      q: [
        ["Two ports are both set to dynamic auto. What forms?", ["A trunk", "An access link", "An EtherChannel", "Nothing; the ports err-disable"], 1, "Auto only answers; neither side asks, so the link stays access."],
        ["Which VTP mode keeps its own VLANs but still forwards VTP advertisements?", ["Server", "Client", "Transparent", "Off"], 2, "Transparent switches do not sync but pass advertisements through (VTP v2)."],
      ],
    },
    {
      id: "dynrouting", domain: "ipconn", name: "Dynamic routing basics", layer: "L3", ports: "",
      summary: "Routing protocols share routes automatically. The router picks the route with the lowest administrative distance first, then the lowest metric within a protocol.",
      facts: [
        "IGPs run inside one organization (OSPF, EIGRP, RIP); EGPs run between them (BGP)",
        "Distance vector (RIP, EIGRP) shares routes with neighbors; link state (OSPF) shares the whole map",
        "AD: connected 0, static 1, eBGP 20, EIGRP 90, OSPF 110, RIP 120, external EIGRP 170, iBGP 200",
        "Longest prefix match wins before AD is even considered. A floating static route has a higher AD than the dynamic route it backs up",
      ],
      trap: "The most specific prefix always wins. AD only breaks ties between routes to the same exact prefix.",
      q: [
        ["A router has an OSPF route and an EIGRP route to 10.1.1.0/24. Which goes in the table?", ["OSPF", "EIGRP", "Both, load-balanced", "Whichever arrived first"], 1, "EIGRP's AD of 90 beats OSPF's 110."],
        ["A router has a static route to 10.0.0.0/8 and an OSPF route to 10.1.0.0/16. A packet goes to 10.1.5.5. Which route is used?", ["The static route", "The OSPF route", "Both", "The default route"], 1, "Longest prefix match: /16 is more specific than /8."],
      ],
    },
    {
      id: "eigrp", domain: "ipconn", name: "RIP and EIGRP", layer: "L3", ports: "EIGRP IP 88, RIP UDP 520",
      summary: "RIP counts hops; EIGRP uses bandwidth and delay. EIGRP converges fast because it already knows a loop-free backup path.",
      facts: [
        "RIP: hop count, max 15 (16 = unreachable), updates every 30 seconds, v2 multicasts to 224.0.0.9",
        "EIGRP: hellos to 224.0.0.10, AD 90 internal and 170 external, neighbors must share the AS number and K-values",
        "Successor = best route. Feasible successor = backup whose reported distance is lower than the successor's feasible distance",
        "variance lets EIGRP load-balance over unequal-cost paths; network without a wildcard is classful",
      ],
      trap: "A feasible successor must meet the feasibility condition: its reported (advertised) distance is less than the current feasible distance.",
      q: [
        ["What must match for two EIGRP routers to become neighbors?", ["Router ID", "AS number", "Hostname", "Hello interval only"], 1, "Different AS numbers never peer. K-values and the subnet must also match."],
        ["What is RIP's maximum usable hop count?", ["15", "16", "255", "100"], 0, "A metric of 16 means unreachable."],
      ],
    },
    {
      id: "ipv6route", domain: "ipconn", name: "IPv6 static routing", layer: "L3", ports: "",
      summary: "IPv6 routing looks like IPv4 with longer addresses, but a router will not forward IPv6 at all until ipv6 unicast-routing is on.",
      facts: [
        "ipv6 unicast-routing enables forwarding; without it the router acts like an IPv6 host",
        "Recursive: ipv6 route 2001:db8:2::/64 2001:db8:12::2. Directly attached: exit interface only (point-to-point links). Fully specified: both",
        "A link-local next hop (FE80::) always needs the exit interface too",
        "Default route: ipv6 route ::/0 <next hop>. show ipv6 route marks connected C, local L, static S",
      ],
      trap: "IPv6 connected routes come with a local /128 host route (L) for the interface address, just like IPv4 /32 local routes.",
      q: [
        ["Which command lets a Cisco router forward IPv6 packets?", ["ipv6 enable", "ipv6 unicast-routing", "ipv6 routing", "ip routing v6"], 1, "ipv6 unicast-routing is off by default."],
        ["What is the IPv6 default route prefix?", ["::/128", "FE80::/10", "::/0", "FF00::/8"], 2, "::/0 matches every IPv6 address."],
      ],
    },
    {
      id: "ftp", domain: "svc", name: "FTP and TFTP", layer: "L7", ports: "FTP TCP 20/21, TFTP UDP 69",
      summary: "Both move files, often IOS images and configs. FTP is reliable with login; TFTP is tiny with no login, used for quick transfers on a trusted network.",
      facts: [
        "FTP: TCP 21 control, TCP 20 data (active mode); supports usernames, passwords and directory listing",
        "Active mode: the server opens the data connection to the client. Passive mode: the client opens both, which is friendlier to firewalls",
        "TFTP: UDP 69, no authentication, no directory listing; reliability handled by the app (lock-step acks)",
        "copy tftp: flash: loads an image; boot system flash:<file> picks which one boots; show flash lists files",
      ],
      trap: "Neither FTP nor TFTP encrypts. SFTP (over SSH) and FTPS (over TLS) are the secure options.",
      q: [
        ["Which port does TFTP use?", ["TCP 21", "UDP 69", "TCP 22", "UDP 161"], 1, "TFTP runs over UDP port 69."],
        ["In passive FTP, who opens the data connection?", ["The server", "The client", "The router", "A proxy"], 1, "In passive mode the client connects to a port the server gives it."],
      ],
    },
    {
      id: "secfund", domain: "sec", name: "Security concepts", layer: "All", ports: "",
      summary: "The exam wants the vocabulary: threats exploit vulnerabilities, and mitigation reduces risk. Know the common attack types and the defenses for each.",
      facts: [
        "Vulnerability = weakness, exploit = way to use it, threat = potential to exploit it, mitigation = reduces it",
        "Attacks: DoS and DDoS, spoofing, reflection and amplification, MITM, reconnaissance, malware, phishing, password attacks",
        "MFA combines at least two of: something you know, have, are",
        "Security program elements: user awareness, user training, physical access control",
      ],
      trap: "Social engineering attacks the people, not the gear. Phishing by email, vishing by voice, smishing by SMS, whaling targets executives.",
      q: [
        ["An attacker sends spoofed requests so that large replies flood a victim. What is this?", ["Reconnaissance", "Amplification attack", "Brute force", "Tailgating"], 1, "Reflection and amplification use third-party servers to multiply traffic."],
        ["A password plus a code from a phone app is an example of what?", ["Single-factor authentication", "Multi-factor authentication", "Accounting", "Authorization"], 1, "Something you know plus something you have."],
      ],
    },
    {
      id: "lanarch", domain: "fund", name: "LAN architectures", layer: "L2/L3", ports: "",
      summary: "Campus networks are built in layers so they scale and fail gracefully. Smaller sites collapse the core into the distribution layer.",
      facts: [
        "Three-tier: access (end hosts), distribution (policy, L3 boundary), core (fast transport)",
        "Two-tier (collapsed core): access plus a combined distribution and core layer",
        "Spine-leaf (data center): every leaf connects to every spine; leaves never connect to each other; equal hops between any two servers",
        "SOHO: one device often combines router, switch, firewall and wireless AP",
      ],
      trap: "In spine-leaf, servers connect to leaf switches only, and every leaf connects to every spine.",
      q: [
        ["In spine-leaf, what do leaf switches connect to?", ["Other leaves", "Every spine", "Only one spine", "The core layer"], 1, "Every leaf uplinks to every spine, giving equal paths."],
        ["Which layer of a three-tier campus usually holds the Layer 3 boundary for user VLANs?", ["Access", "Distribution", "Core", "Edge"], 1, "Distribution switches route between VLANs and apply policy."],
      ],
    },
    {
      id: "wanarch", domain: "fund", name: "WAN architectures", layer: "L1-L3", ports: "",
      summary: "WANs link sites over distance. Private options give predictable service; internet options are cheaper and are secured with VPNs.",
      facts: [
        "Leased line: dedicated point-to-point, often with HDLC or PPP",
        "MPLS: provider-run; CE routers peer with PE routers; labels forward traffic; Layer 3 VPN or Layer 2 VPN service",
        "Internet access: DSL, cable, fiber, 4G/5G. Site-to-site VPN uses IPsec; remote access VPN uses TLS or IPsec",
        "GRE carries any protocol (including multicast routing) but does not encrypt; GRE over IPsec does both",
      ],
      trap: "In MPLS terms, CE is the customer edge router, PE the provider edge, and P the provider core router.",
      q: [
        ["Which tunnel type can carry multicast routing traffic but does not encrypt?", ["IPsec", "GRE", "SSL VPN", "PPPoE"], 1, "GRE wraps any packet; IPsec adds encryption."],
        ["In an MPLS VPN, which router does the customer's CE router peer with?", ["P", "PE", "CE", "ABR"], 1, "Customer edge peers with provider edge."],
      ],
    },
    {
      id: "cloud", domain: "fund", name: "Virtualization and cloud", layer: "All", ports: "",
      summary: "Virtualization runs many systems on one physical server. Cloud services rent that capacity on demand.",
      facts: [
        "Type 1 hypervisor runs on bare metal (ESXi, Hyper-V); Type 2 runs on top of an OS (VirtualBox)",
        "Containers share the host OS kernel, so they start fast and are small (Docker; orchestrated by Kubernetes)",
        "VRF splits one router into separate routing tables, so overlapping addresses can coexist",
        "Service models: IaaS (you manage OS up), PaaS (you manage the app), SaaS (you just use it). NIST traits include on-demand self-service and rapid elasticity",
      ],
      trap: "Containers do not each include a full OS. VMs do.",
      q: [
        ["Which hypervisor type runs directly on the hardware?", ["Type 1", "Type 2", "Container engine", "Kernel module"], 0, "Type 1 is bare-metal."],
        ["What feature lets one router keep separate routing tables for overlapping customer networks?", ["VLAN", "VRF", "HSRP", "PAT"], 1, "Virtual routing and forwarding."],
      ],
    },
    {
      id: "wififund", domain: "access", name: "Wireless fundamentals", layer: "L1/L2", ports: "",
      summary: "Wi-Fi is half-duplex radio shared by everyone on the channel. Clients take turns with CSMA/CA, and channel planning keeps neighbors from stepping on each other.",
      facts: [
        "2.4 GHz: longer range, only 1, 6 and 11 do not overlap. 5 GHz: many more non-overlapping channels, shorter range. 6 GHz: Wi-Fi 6E",
        "Standards: 802.11n Wi-Fi 4, 802.11ac Wi-Fi 5 (5 GHz), 802.11ax Wi-Fi 6/6E",
        "BSS = one AP and its clients; BSSID = AP radio MAC; SSID = network name; ESS = several APs with one SSID for roaming",
        "Wireless uses CSMA/CA (avoidance); wired Ethernet used CSMA/CD (detection)",
      ],
      trap: "In 2.4 GHz, only channels 1, 6 and 11 are non-overlapping in the US.",
      q: [
        ["Which 2.4 GHz channels do not overlap?", ["1, 5, 9", "1, 6, 11", "2, 7, 12", "1, 4, 8"], 1, "Channels are 5 MHz apart but 22 MHz wide."],
        ["How do wireless clients share the medium?", ["CSMA/CD", "CSMA/CA", "Token passing", "Full duplex"], 1, "Collision avoidance, because radios cannot detect collisions while sending."],
      ],
    },
    {
      id: "wifiarch", domain: "access", name: "Wireless architectures", layer: "L2", ports: "CAPWAP UDP 5246/5247",
      summary: "APs can stand alone, be managed in the cloud, or be lightweight APs that tunnel everything to a wireless LAN controller.",
      facts: [
        "Autonomous APs are configured one by one. Lightweight APs split MAC: real-time work on the AP, management on the WLC",
        "CAPWAP tunnels: control UDP 5246 (encrypted), data UDP 5247",
        "AP modes: local, FlexConnect (switch traffic locally if the WLC link drops), monitor, sniffer, rogue detector, bridge (mesh), SE-Connect",
        "Deployments: unified (WLC appliance), cloud-based (Meraki), embedded (WLC in a switch), Mobility Express (WLC in an AP)",
      ],
      trap: "A lightweight AP's switch port is an access port; an autonomous AP serving several VLANs needs a trunk.",
      q: [
        ["Which AP mode keeps forwarding client traffic locally if the link to the WLC fails?", ["Local", "Monitor", "FlexConnect", "Sniffer"], 2, "FlexConnect is built for branches over a WAN."],
        ["What protocol tunnels traffic between a lightweight AP and a WLC?", ["GRE", "CAPWAP", "LWAPP v3", "IPsec"], 1, "CAPWAP, UDP 5246 for control and 5247 for data."],
      ],
    },
    {
      id: "wifisec", domain: "access", name: "Wireless security", layer: "L2", ports: "RADIUS UDP 1812/1813",
      summary: "Wi-Fi security comes down to authenticating clients and encrypting frames. WPA2 and WPA3 are the only acceptable choices today.",
      facts: [
        "WEP is broken (RC4). WPA used TKIP. WPA2 uses AES-CCMP. WPA3 uses GCMP and SAE",
        "Personal mode = pre-shared key (PSK; SAE in WPA3). Enterprise mode = 802.1X with a RADIUS server",
        "802.1X roles: supplicant (client), authenticator (AP or WLC), authentication server (RADIUS)",
        "EAP methods: EAP-TLS (certs both sides), PEAP and EAP-TTLS (server cert, tunnel), LEAP (old Cisco, weak), EAP-FAST",
      ],
      trap: "WPA3-Personal replaces PSK with SAE, which resists offline dictionary attacks.",
      q: [
        ["Which encryption does WPA2 use?", ["RC4", "TKIP", "AES-CCMP", "GCMP-256"], 2, "WPA2 requires CCMP with AES."],
        ["In 802.1X, which device is the authenticator?", ["The client", "The AP or WLC", "The RADIUS server", "The DHCP server"], 1, "The authenticator relays EAP between supplicant and server."],
      ],
    },
    {
      id: "wificfg", domain: "access", name: "Configuring a WLC", layer: "L2", ports: "",
      summary: "On a Cisco WLC you build a WLAN by tying an SSID to a dynamic interface (a VLAN) and picking its security, all from the GUI.",
      facts: [
        "Ports connect the WLC to the switch, usually as trunks; a LAG bundles them (no LACP or PAgP, mode on only)",
        "Interfaces: management (CAPWAP, admin), dynamic (one per client VLAN), virtual (DHCP relay, web auth)",
        "WLAN = SSID + dynamic interface + security (WPA2/WPA3, PSK or 802.1X) + QoS profile",
        "Manage the WLC with HTTPS, SSH, SNMP; the GUI is the exam's focus",
      ],
      trap: "WLC link aggregation (LAG) supports only static EtherChannel, so the switch side must be channel-group mode on.",
      q: [
        ["Which WLC interface type maps a WLAN to a client VLAN?", ["Management", "Virtual", "Dynamic", "Service port"], 2, "Each dynamic interface is tied to one VLAN."],
        ["What EtherChannel mode must the switch use for a WLC LAG?", ["LACP active", "PAgP desirable", "On", "LACP passive"], 2, "WLCs do not negotiate, so the bundle must be static."],
      ],
    },
    {
      id: "netauto", domain: "auto", name: "Network automation", layer: "Mgmt", ports: "",
      summary: "Automation replaces typing the same change into fifty devices. Fewer manual steps means fewer mistakes, faster changes and consistent configs.",
      facts: [
        "Benefits: consistency, fewer human errors, faster deployment, easier compliance checks",
        "Traditional networks: each device has its own control plane. Controller-based: one controller manages many devices",
        "Cisco DNA Center (Catalyst Center): intent-based management, assurance, software image management, northbound REST API",
        "Compare: traditional = per-device CLI; controller-based = central policy, faster rollout, API-driven",
      ],
      trap: "Controller-based networking does not remove the data plane from devices. Devices still forward traffic; the controller manages them.",
      q: [
        ["What is a key benefit of network automation?", ["More manual checks", "Consistent configs and fewer errors", "Faster console access", "No need for routing protocols"], 1, "Automation repeats the same steps the same way every time."],
        ["In controller-based networking, where does packet forwarding still happen?", ["On the controller", "On each network device", "In the cloud", "On the hypervisor"], 1, "The data plane stays on the devices."],
      ],
    },
    {
      id: "dataformats", domain: "auto", name: "JSON, XML and YAML", layer: "Mgmt", ports: "",
      summary: "Automation tools exchange structured data. JSON is the exam's focus: know how to read it and spot its data types.",
      facts: [
        "JSON types: object {}, array [], string \"\", number, true/false, null",
        "JSON keys must be strings in double quotes; values are separated by commas, with no trailing comma",
        "XML uses opening and closing tags like <hostname>R1</hostname>. YAML uses indentation and is used by Ansible playbooks",
        "Whitespace is not significant in JSON but is in YAML",
      ],
      trap: "In JSON, true, false and null are lowercase and unquoted. \"true\" in quotes is a string.",
      q: [
        ["In JSON, which brackets define an array?", ["{ }", "[ ]", "( )", "< >"], 1, "Square brackets are arrays; curly braces are objects."],
        ["Which data format uses indentation for structure and is used by Ansible?", ["JSON", "XML", "YAML", "CSV"], 2, "YAML is indentation-based."],
      ],
    },
    {
      id: "rest", domain: "auto", name: "REST APIs", layer: "Mgmt", ports: "HTTPS TCP 443",
      summary: "REST APIs let software read and change devices over HTTP. Each request uses a verb that maps to create, read, update or delete.",
      facts: [
        "CRUD to HTTP: Create POST, Read GET, Update PUT or PATCH, Delete DELETE",
        "REST is stateless, uses a client-server model, and responses can be cacheable",
        "Status codes: 200 OK, 201 Created, 204 No Content, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 500 Server Error",
        "Authentication: basic, bearer tokens, API keys, OAuth",
      ],
      trap: "401 means the request is not authenticated; 403 means you are authenticated but not allowed.",
      q: [
        ["Which HTTP verb is used to create a new resource?", ["GET", "POST", "DELETE", "HEAD"], 1, "POST creates; PUT and PATCH update."],
        ["What does HTTP status 404 mean?", ["Unauthorized", "Not Found", "Server error", "Created"], 1, "The requested resource does not exist."],
      ],
    },
{
      id: "cfgmgmt", domain: "auto", name: "Ansible and Terraform", layer: "Mgmt", ports: "SSH 22, HTTPS 443",
      summary: "Configuration management and infrastructure-as-code tools keep many devices in a defined state, so changes are repeatable and drift gets corrected.",
      facts: [
        "Ansible: agentless, push model. Connects over SSH (or device APIs), runs playbooks written in YAML against an inventory of hosts; modules are idempotent, so running twice changes nothing new",
        "Terraform (HashiCorp): infrastructure as code. Declarative: you describe the desired end state in HCL files, terraform plan previews the changes, terraform apply makes them. Keeps a state file; providers talk to cloud and network APIs; agentless",
        "Puppet and Chef are older agent-based, pull-model tools (Puppet manifests on TCP 8140, Chef recipes in cookbooks). They were on CCNA v1.0; v1.1 names Ansible and Terraform",
        "Configuration drift: a device's running config wanders away from the standard. These tools detect and fix it",
      ],
      trap: "Ansible = YAML playbooks, push, agentless. Terraform = declarative HCL plus a state file, plan then apply.",
      q: [
        ["Which tool uses declarative HCL files and a state file to manage infrastructure?", ["Ansible", "Terraform", "Puppet", "Python Netmiko"], 1, "Terraform is declarative, written in HCL, and tracks what it built in a state file."],
        ["Which tool is agentless and pushes changes over SSH using YAML playbooks?", ["Ansible", "Chef", "Puppet", "Terraform Cloud agent"], 0, "Ansible needs no agent on managed devices and runs YAML playbooks over SSH."],
      ],
    },
    {
      id: "aiml", domain: "auto", name: "AI and machine learning in network operations", layer: "Mgmt", ports: "",
      summary: "Machine learning finds patterns in network data that no human would spot at 3 a.m. Predictive AI forecasts and flags problems; generative AI writes new content, like a config draft or a plain-English summary of an outage.",
      facts: [
        "Machine learning (ML): algorithms learn from data instead of following hand-written rules. Supervised learning uses labeled examples; unsupervised learning finds clusters and anomalies on its own; reinforcement learning improves through rewards",
        "Predictive AI: baselines what \"normal\" looks like, then detects anomalies, forecasts capacity or failures, and suggests likely root causes (Cisco Catalyst Center uses this in its assurance features)",
        "Generative AI: large language models create new text, code or configurations from a prompt, for example a chat assistant that explains an outage or drafts a CLI change",
        "Risks: hallucination (confident but wrong answers), leaking sensitive data in prompts, and bias in training data. A human reviews AI-generated changes before they touch production",
      ],
      trap: "Predictive AI analyzes existing data to forecast or classify. Generative AI produces brand-new content. Exam questions hinge on that difference.",
      q: [
        ["A system learns normal traffic levels for each site and alerts when a link behaves unusually. Which type of AI is this?", ["Generative AI", "Predictive AI", "Rule-based scripting", "Reinforcement routing"], 1, "Learning a baseline and flagging anomalies is predictive (analytical) AI. Generative AI creates new content."],
        ["What is a key risk of using generative AI to produce device configurations?", ["It cannot read JSON", "It may produce confident but incorrect output", "It only works with SNMPv1", "It requires a dedicated controller"], 1, "Generative models can hallucinate, so a human must review generated configs before deployment."],
      ],
    },
    {
      id: "osverify", domain: "fund", name: "Checking IP settings on Windows, macOS and Linux", layer: "L3", ports: "",
      summary: "When a user says \"the internet is down,\" first check what their computer actually has: an IP address, mask, default gateway and DNS servers. Every OS shows this a little differently.",
      facts: [
        "Windows: ipconfig (IP, mask, gateway), ipconfig /all (adds MAC, DHCP server, DNS servers, lease times), ipconfig /release and /renew, route print for the routing table, nslookup for DNS",
        "macOS: ifconfig (or ipconfig getifaddr en0) for the address, netstat -rn for the default gateway, networksetup -getinfo \"Wi-Fi\" for a summary, scutil --dns for DNS servers",
        "Linux: ip address (ip addr) for addresses, ip route for the default gateway (\"default via ...\"), ifconfig on older systems, resolvectl status or /etc/resolv.conf for DNS",
        "A 169.254.x.x address means the client gave up on DHCP and self-assigned (APIPA)",
      ],
      trap: "Linux and macOS show the default gateway in the routing table (ip route / netstat -rn), not in the interface output.",
      q: [
        ["Which Windows command shows the MAC address and DNS servers of each adapter?", ["ipconfig", "ipconfig /all", "netstat -an", "arp -a"], 1, "ipconfig alone shows IP, mask and gateway; /all adds MAC, DHCP and DNS details."],
        ["On a Linux host, which command shows the default gateway?", ["ip route", "ip address", "hostname -I", "ifconfig -a"], 0, "ip route prints the routing table, including the \"default via\" line."],
      ],
    },
    {
      id: "pwpolicy", domain: "sec", name: "Password policy and alternatives", layer: "All", ports: "",
      summary: "Passwords are the weakest lock on the door, so policy makes them harder to guess and adds other proof of identity on top.",
      facts: [
        "Complexity and length: long passphrases beat short \"complex\" ones; current NIST guidance favors length, checking against known-breached passwords, and not forcing changes without a reason",
        "Management: no reuse, account lockout after failed attempts, change default credentials, store secrets in a password manager",
        "Alternatives: multifactor authentication (two different factor types: something you know, have or are), digital certificates (issued by a certificate authority), biometrics (fingerprint, face)",
        "On IOS: security passwords min-length 10, login block-for 120 attempts 3 within 60, and enable secret (hashed) instead of enable password",
      ],
      trap: "Two things you know (password plus PIN) is still single-factor. MFA needs different factor types.",
      q: [
        ["Which combination is true multifactor authentication?", ["Password and security question", "Password and a code from a phone authenticator app", "Two different passwords", "Username and password"], 1, "Something you know (password) plus something you have (the phone) is two factors."],
        ["Which IOS command enforces a minimum password length?", ["service password-encryption", "security passwords min-length 10", "enable secret 10", "login block-for 10"], 1, "security passwords min-length sets the minimum length for new passwords."],
      ],
    },
    {
      id: "ipsec", domain: "sec", name: "IPsec VPNs", layer: "L3", ports: "ESP IP 50, AH IP 51, IKE UDP 500/4500",
      summary: "A VPN builds a private tunnel across a public network. Site-to-site VPNs join whole offices; remote-access VPNs connect one user's laptop.",
      facts: [
        "IPsec protects IP packets with confidentiality (encryption such as AES), integrity (hashing such as SHA), authentication (pre-shared keys or certificates) and anti-replay",
        "ESP (IP protocol 50) encrypts and authenticates; AH (IP protocol 51) authenticates only and never encrypts. IKE negotiates keys on UDP 500, or UDP 4500 with NAT traversal",
        "Site-to-site: a permanent tunnel between two gateways (routers or firewalls); hosts behind them do not need VPN software. GRE over IPsec carries routing protocols and multicast; DMVPN builds hub-and-spoke tunnels with dynamic spoke-to-spoke paths",
        "Remote access: client software on the user's device (for example Cisco Secure Client) connects on demand to a VPN headend, usually over TLS, sometimes IPsec",
      ],
      trap: "AH provides no encryption. If the question needs confidentiality, the answer is ESP.",
      q: [
        ["Which IPsec protocol provides encryption?", ["AH", "ESP", "IKE", "GRE"], 1, "ESP encrypts; AH only authenticates. GRE does not encrypt at all."],
        ["Which VPN type requires software on each user's device?", ["Site-to-site VPN", "Remote-access VPN", "GRE tunnel", "DMVPN"], 1, "Remote-access VPNs run a client on the endpoint; site-to-site VPNs are handled by the gateways."],
      ],
    },
    {
      id: "ipv6types", domain: "fund", name: "IPv6 address types and EUI-64", layer: "L3", ports: "",
      summary: "IPv6 has no broadcast. Instead it has unicast types for different scopes, multicast groups, and anycast. Hosts can even build their own interface ID from their MAC address.",
      facts: [
        "Global unicast 2000::/3 (routable on the internet). Unique local FC00::/7, with FD00::/8 used in practice (private). Link-local FE80::/10: every IPv6 interface has one, never routed, used by NDP and as routing next hops",
        "Multicast FF00::/8: FF02::1 all nodes, FF02::2 all routers, FF02::5 and FF02::6 OSPFv3, FF02::A EIGRP. Anycast: the same unicast address on several devices; the nearest one answers",
        ":: is unspecified, ::1 is loopback. IPv6 has no broadcast at all",
        "Modified EUI-64: split the 48-bit MAC in half, insert FFFE in the middle, then flip the 7th bit of the first byte. MAC 0050.7966.6801 becomes interface ID 0250:79FF:FE66:6801",
        "IOS: ipv6 address 2001:db8:1::/64 eui-64, ipv6 address autoconfig (SLAAC), ipv6 enable (link-local only)",
      ],
      trap: "Flipping the 7th bit turns 00 into 02 and 02 into 00. Forgetting the flip is the classic wrong answer.",
      q: [
        ["What is the modified EUI-64 interface ID for MAC address 0011.2233.4455?", ["0011:22FF:FE33:4455", "0211:22FF:FE33:4455", "0211:2233:FFFE:4455", "FE80::0011:2233:4455"], 1, "Insert FFFE in the middle (0011:22FF:FE33:4455) and flip the 7th bit of the first byte (00 to 02)."],
        ["Which prefix identifies IPv6 link-local addresses?", ["FC00::/7", "FF00::/8", "FE80::/10", "2000::/3"], 2, "FE80::/10 is link-local. FC00::/7 is unique local and FF00::/8 is multicast."],
      ],
    },
    {
      id: "stpguard", domain: "access", name: "STP protection: PortFast, BPDU guard, root guard, loop guard, BPDU filter", layer: "L2", ports: "",
      summary: "Spanning tree trusts every BPDU it hears. These features decide which ports are allowed to speak and what happens when the wrong device starts talking.",
      facts: [
        "PortFast: an access port to an end host skips listening/learning and forwards immediately",
        "BPDU guard: err-disables a port the moment a BPDU arrives (spanning-tree bpduguard enable, or globally for all PortFast ports with spanning-tree portfast bpduguard default)",
        "Root guard: the port can never become a root port. A superior BPDU puts it in root-inconsistent (blocking) until those BPDUs stop; then it recovers on its own",
        "Loop guard: on root and alternate ports between switches. If BPDUs stop arriving (a one-way link), the port goes loop-inconsistent instead of forwarding",
        "BPDU filter: on an interface it stops sending and receiving BPDUs, effectively turning STP off there (dangerous between switches). Globally (spanning-tree portfast bpdufilter default) PortFast ports stop sending BPDUs but fall back to normal STP if one arrives",
        "Rapid PVST+ roles: root, designated, alternate, backup. States: discarding, learning, forwarding",
      ],
      trap: "BPDU guard err-disables the port; root guard and loop guard only block it and recover automatically.",
      q: [
        ["A port connected to a switch that must never become root should use which feature?", ["PortFast", "Root guard", "BPDU filter", "Loop guard"], 1, "Root guard blocks the port (root-inconsistent) if superior BPDUs arrive."],
        ["Which feature err-disables an access port when it receives any BPDU?", ["Root guard", "Loop guard", "BPDU guard", "UplinkFast"], 2, "BPDU guard shuts the port down (err-disabled) on any BPDU."],
      ],
    },
  ];

  // Quick-reference ports table (also built from cards that list ports)
  TT.ports = [
    ['FTP', 'TCP', '20, 21'],
    ['SSH', 'TCP', '22'],
    ['Telnet', 'TCP', '23'],
    ['SMTP', 'TCP', '25'],
    ['DNS', 'UDP/TCP', '53'],
    ['DHCP', 'UDP', '67, 68'],
    ['TFTP', 'UDP', '69'],
    ['HTTP', 'TCP', '80'],
    ['POP3', 'TCP', '110'],
    ['NTP', 'UDP', '123'],
    ['SNMP', 'UDP', '161, 162'],
    ['HTTPS', 'TCP', '443'],
    ['Syslog', 'UDP', '514'],
    ['RADIUS', 'UDP', '1812, 1813'],
    ['TACACS+', 'TCP', '49'],
    ['NETCONF', 'TCP', '830'],
    ['CAPWAP', 'UDP', '5246, 5247'],
  ];
})(typeof globalThis !== 'undefined' ? globalThis : window);
