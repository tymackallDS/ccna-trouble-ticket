/* Trouble Ticket — guided lab projects for the Lab Sandbox (sandbox.js).
 * Each project: a Harbor Point story, steps, a starting canvas (devices may be partly built or
 * not cabled at all), live checks against the world, hints, and one reference solution.
 * Solutions are { deviceId: [commands] } or an ordered list of [deviceId, commands]; the pseudo
 * device "_build" holds canvas steps (add / delete / cable / uncable) for TT.sandbox.applyBuild.
 * All designs and text are original.
 */
(function (G) {
  'use strict';
  const TT = (G.TT = G.TT || {});

  /* ---- spec builders (short interface names are fine; sandbox.js expands them) ---- */
  const R = (hostname, interfaces, extra) => Object.assign({ type: 'router', hostname, interfaces: interfaces || {} }, extra);
  const SW = (hostname, interfaces, extra) => Object.assign({ type: 'switch', hostname, interfaces: interfaces || {} }, extra);
  const HOST = (type) => (hostname, ip, mask, gw, extra) => ({ type, hostname, pc: Object.assign({ ip: ip || '', mask: mask || '', gw: gw || '', dhcp: false }, extra) });
  const PC = HOST('pc');
  const LAP = HOST('laptop');
  const SRV = (hostname, ip, mask, gw, pools) => ({ type: 'server', hostname, pc: { ip, mask, gw, dhcp: false, server: true, pools: pools || [] } });
  const up = (ip, mask) => ({ ip, mask, shutdown: false });
  const acc = (v) => ({ mode: 'access', accessVlan: v, modeSet: true });
  const M24 = '255.255.255.0';
  const M30 = '255.255.255.252';

  /* ---- check helpers (every one tolerates missing devices) ---- */
  const D = (w, id) => w.devices[id] || { interfaces: {}, flags: {}, pc: {} };
  const ifc = (w, id, n) => (D(w, id).interfaces || {})[n] || {};
  const host = (w, id) => D(w, id).hostname;
  const ip = (s) => TT.ip.ipToInt(s);
  const ping = (w, from, to) => { try { return !!w.devices[from] && TT.net.ping(w, from, to).ok; } catch (e) { return false; } };
  const linksBetween = (w, a, b) => w.links.filter((l) => (l[0] === a && l[2] === b) || (l[0] === b && l[2] === a));
  const endOn = (l, id) => (l[0] === id ? l[1] : l[3]);
  const bothUp = (w, l) => TT.net.linkUp(w, l[0], l[1]) && TT.net.linkUp(w, l[2], l[3]);
  const peer = (w, id, port) => (w.devices[id] ? TT.net.linkPeer(w, id, port) : null);
  const savedCfg = (w, id) => { const s = D(w, id).flags && D(w, id).flags.saved; try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };
  const isAccess = (i, v) => i.mode !== 'trunk' && i.modeSet && i.accessVlan === v;
  const rt = (w, id) => { try { return TT.net.routingTable(w, id); } catch (e) { return []; } };
  const routeVia = (w, id, net, p, nh, type) => rt(w, id).some((r) => r.type !== 'L' && r.net === ip(net) && r.p === p && (!nh || r.nh === nh) && (!type || r.type === type));
  const hosts = (w) => Object.values(w.devices).filter((d) => d.kind === 'pc' && !d.pc.server);
  /** Run fn on a throwaway copy of the world (for "what if this fails" checks). */
  const whatIf = (w, change, fn) => { const c = TT.net.clone(w); change(c); return fn(c); };
  const shutAll = (c, id) => { for (const i of Object.values((c.devices[id] || {}).interfaces || {})) i.shutdown = true; };

  const projects = [
    /* ------------------------------------------------------------------ 1 */
    {
      id: 'basics',
      title: 'Out of the box',
      day: 'Day 4',
      level: 'Starter',
      minutes: 15,
      blueprint: ['2.8', '5.3'],
      brief: 'The Fells Point annex just got a router and a switch from the depot. Both run factory defaults, nobody has cabled them together, and anyone who walks up to a console port gets straight in. Name them to the Harbor Point standard, lock the router console, and save before the day shift shows up.',
      steps: [
        'Pick the Cable tool. Click R1 and choose GigabitEthernet0/0, then click SW1 and choose GigabitEthernet0/1. The router end stays red: router ports start shut down.',
        'Double-click R1 to open its CLI. Type enable, then configure terminal.',
        'Name the router: hostname FP-R1.',
        'Set the privileged password: enable secret, then a password of your choice.',
        'Lock the console: line console 0, password (your choice), login, then exit.',
        'Run service password-encryption so plain-text passwords stop showing up in the config.',
        'Bring the LAN port up: interface g0/0, then no shutdown. Both lights go green.',
        'On SW1: hostname FP-SW1 and an enable secret.',
        'Save both devices: copy running-config startup-config (or write memory) from privileged EXEC.',
      ],
      start: {
        devices: { R1: R('Router'), SW1: SW('Switch') },
        links: [],
        positions: { R1: { x: 200, y: 160 }, SW1: { x: 480, y: 160 } },
      },
      checks: [
        { text: 'R1 and SW1 are joined by a cable', fn: (w) => linksBetween(w, 'R1', 'SW1').length > 0 },
        { text: 'The router is named FP-R1 and the switch FP-SW1', fn: (w) => host(w, 'R1') === 'FP-R1' && host(w, 'SW1') === 'FP-SW1' },
        { text: 'Both devices have an enable secret', fn: (w) => !!D(w, 'R1').enableSecret && !!D(w, 'SW1').enableSecret },
        { text: 'The router console asks for a password', fn: (w) => { const c = D(w, 'R1').con || {}; return (c.login === 'password' && !!c.password) || (c.login === 'local' && Object.keys(D(w, 'R1').users || {}).length > 0); } },
        { text: 'Plain-text passwords on the router are encrypted', fn: (w) => !!D(w, 'R1').pwEnc },
        { text: 'The router-to-switch link is up at both ends', fn: (w) => linksBetween(w, 'R1', 'SW1').some((l) => bothUp(w, l)) },
        { text: 'Both configurations are saved with the new names', fn: (w) => (savedCfg(w, 'R1') || {}).hostname === 'FP-R1' && (savedCfg(w, 'SW1') || {}).hostname === 'FP-SW1' },
      ],
      hints: [
        'Switch ports come up on their own. Router ports ship shut down, so the router side needs no shutdown.',
        'line console 0 takes you to the (config-line)# prompt. password sets it, and login tells the line to ask for it.',
        'Saving happens in privileged EXEC. From config mode, type end first, or use do write memory.',
      ],
      takeaway: 'The running-config lives in RAM and the startup-config in NVRAM; until you copy one to the other, a reload wipes your work. enable secret is stored as a hash. service password-encryption only applies weak type 7 scrambling to the other passwords, so treat it as protection from shoulder-surfing, not real security.',
      solution: {
        _build: ['cable R1 Gi0/0 SW1 Gi0/1'],
        R1: ['enable', 'configure terminal', 'hostname FP-R1', 'enable secret Harb0rNight!', 'line console 0', 'password c0nsole', 'login', 'exit', 'service password-encryption', 'interface g0/0', 'no shutdown', 'end', 'copy running-config startup-config'],
        SW1: ['enable', 'configure terminal', 'hostname FP-SW1', 'enable secret Harb0rNight!', 'end', 'write memory'],
      },
    },

    /* ------------------------------------------------------------------ 2 */
    {
      id: 'ping',
      title: 'First light on the dock',
      day: 'Days 5-8',
      level: 'Starter',
      minutes: 15,
      blueprint: ['1.6', '1.10', '1.13'],
      brief: 'Locust Point is opening two pick stations next to the loading dock. The boxes are still on the floor: one switch and two PCs. Build the little network from nothing and prove the PCs can talk to each other.',
      steps: [
        'Drag a Switch onto the canvas, then two PCs (or press each palette button to drop it in a free spot).',
        'Choose the Cable tool. Click a PC (it has one port, so it picks itself), then click the switch and choose a FastEthernet port. Cable the second PC the same way.',
        'Double-click the first PC. In IP Configuration choose Static and enter 192.168.10.11, mask 255.255.255.0, gateway 192.168.10.1. The router that will own .1 arrives next week.',
        'Give the second PC 192.168.10.12 with the same mask and gateway.',
        'Open a PC\'s Command Prompt and run ping 192.168.10.12, or use Ping test on the toolbar and watch the packet cross the switch.',
        'Run ipconfig on each PC to see its address and MAC.',
      ],
      start: { devices: {}, links: [], positions: {} },
      checks: [
        { text: 'A switch and at least two PCs are on the canvas', fn: (w) => Object.values(w.devices).some((d) => d.kind === 'switch') && hosts(w).length >= 2 },
        { text: 'Two PCs are cabled to the same switch', fn: (w) => { const c = {}; for (const h of hosts(w)) { const p = peer(w, h.id, 'NIC'); if (p && w.devices[p[0]].kind === 'switch') c[p[0]] = (c[p[0]] || 0) + 1; } return Object.values(c).some((n) => n >= 2); } },
        { text: 'Two PCs have different addresses in 192.168.10.0/24 (mask 255.255.255.0)', fn: (w) => new Set(hosts(w).filter((d) => d.pc.mask === M24 && TT.ip.netOf(ip(d.pc.ip) || 0, 24) === ip('192.168.10.0')).map((d) => d.pc.ip)).size >= 2 },
        { text: 'Each of those PCs uses the gateway 192.168.10.1', fn: (w) => { const l = hosts(w).filter((d) => d.pc.ip && TT.ip.netOf(ip(d.pc.ip) || 0, 24) === ip('192.168.10.0')); return l.length >= 2 && l.every((d) => d.pc.gw === '192.168.10.1'); } },
        { text: 'The two PCs can ping each other', fn: (w) => { const l = hosts(w).filter((d) => d.pc.ip); return l.some((a) => l.some((b) => a !== b && ping(w, a.id, b.pc.ip) && ping(w, b.id, a.pc.ip))); } },
      ],
      hints: [
        'Switch ports come up by themselves, unlike router ports. If a light is red, check the cable went where you think.',
        'Same subnet means the first three octets match and both masks are 255.255.255.0.',
        'In the Command Prompt you can also type ipconfig 192.168.10.11 255.255.255.0 192.168.10.1, the Packet Tracer way.',
      ],
      takeaway: 'A switch forwards frames inside one LAN by MAC address and needs no IP address to do it. Hosts in the same subnet reach each other directly after an ARP; the default gateway only matters once traffic leaves the subnet.',
      solution: {
        _build: ['add switch SW1', 'add pc PC1', 'add pc PC2', 'cable PC1 NIC SW1 Fa0/1', 'cable PC2 NIC SW1 Fa0/2'],
        PC1: ['ipconfig 192.168.10.11 255.255.255.0 192.168.10.1'],
        PC2: ['ipconfig 192.168.10.12 255.255.255.0 192.168.10.1', 'ping 192.168.10.11'],
      },
    },

    /* ------------------------------------------------------------------ 3 */
    {
      id: 'vlans',
      title: 'Two crews, one switch',
      day: 'Day 16',
      level: 'Starter',
      minutes: 20,
      blueprint: ['2.1'],
      brief: 'On the Canton warehouse floor the dock crew and the office staff share one switch, and right now every broadcast from one lands on the other. Split them into their own VLANs: DOCK is VLAN 10, OFFICE is VLAN 20.',
      steps: [
        'Open CAN-SW1 and run show vlan brief. Every port sits in VLAN 1.',
        'Create the VLANs: vlan 10, name DOCK, then vlan 20, name OFFICE.',
        'Dock ports: interface range fa0/1 - 2, switchport mode access, switchport access vlan 10.',
        'Office ports: interface range fa0/3 - 4, switchport mode access, switchport access vlan 20.',
        'Run show vlan brief again, then ping DOCK-PC2 from DOCK-PC1 and OFFICE-PC2 from OFFICE-PC1.',
        'Save the configuration.',
      ],
      start: {
        devices: {
          SW1: SW('CAN-SW1'),
          D1: PC('DOCK-PC1', '10.10.10.11', M24, '10.10.10.1'),
          D2: PC('DOCK-PC2', '10.10.10.12', M24, '10.10.10.1'),
          O1: PC('OFFICE-PC1', '10.10.20.11', M24, '10.10.20.1'),
          O2: PC('OFFICE-PC2', '10.10.20.12', M24, '10.10.20.1'),
        },
        links: [['D1', 'NIC', 'SW1', 'Fa0/1'], ['D2', 'NIC', 'SW1', 'Fa0/2'], ['O1', 'NIC', 'SW1', 'Fa0/3'], ['O2', 'NIC', 'SW1', 'Fa0/4']],
        positions: { SW1: { x: 380, y: 110 }, D1: { x: 140, y: 290 }, D2: { x: 300, y: 310 }, O1: { x: 460, y: 310 }, O2: { x: 620, y: 290 } },
      },
      checks: [
        { text: 'VLAN 10 is named DOCK and VLAN 20 is named OFFICE', fn: (w) => (D(w, 'SW1').vlans || {})[10] === 'DOCK' && (D(w, 'SW1').vlans || {})[20] === 'OFFICE' },
        { text: 'Fa0/1 and Fa0/2 are static access ports in VLAN 10', fn: (w) => ['FastEthernet0/1', 'FastEthernet0/2'].every((n) => isAccess(ifc(w, 'SW1', n), 10)) },
        { text: 'Fa0/3 and Fa0/4 are static access ports in VLAN 20', fn: (w) => ['FastEthernet0/3', 'FastEthernet0/4'].every((n) => isAccess(ifc(w, 'SW1', n), 20)) },
        { text: 'The dock PCs ping each other, and so do the office PCs', fn: (w) => ping(w, 'D1', '10.10.10.12') && ping(w, 'O1', '10.10.20.12') },
        { text: 'Dock and office PCs are in separate broadcast domains', fn: (w) => !!w.devices.D1 && !TT.net.l2Domain(w, 'D1', 'NIC').some(([id]) => id === 'O1' || id === 'O2') },
        { text: 'The configuration is saved with the new port VLANs', fn: (w) => { const c = savedCfg(w, 'SW1'); return !!c && (c.interfaces['FastEthernet0/1'] || {}).accessVlan === 10 && (c.interfaces['FastEthernet0/3'] || {}).accessVlan === 20; } },
      ],
      hints: [
        'A VLAN is its own broadcast domain. Ports in different VLANs cannot reach each other without a router.',
        'switchport mode access pins the port as an access port instead of letting it negotiate (DTP).',
        'interface range works on consecutive ports: interface range fa0/1 - 2.',
      ],
      takeaway: 'Each VLAN is a separate broadcast domain on the same hardware. Access ports carry one VLAN, untagged. Hosts in different VLANs now need a router (or a Layer 3 switch) to talk, which is exactly what the next projects add.',
      solution: {
        SW1: ['enable', 'configure terminal', 'vlan 10', 'name DOCK', 'vlan 20', 'name OFFICE', 'exit', 'interface range fa0/1 - 2', 'switchport mode access', 'switchport access vlan 10', 'interface range fa0/3 - 4', 'switchport mode access', 'switchport access vlan 20', 'end', 'write memory'],
      },
    },

    /* ------------------------------------------------------------------ 4 */
    {
      id: 'trunk',
      title: 'Stretching VLANs across the floor',
      day: 'Day 17',
      level: 'Core',
      minutes: 20,
      blueprint: ['2.1', '2.2'],
      brief: 'Canton grew. A second switch, CAN-SW2, went in at the far end of the warehouse with one dock PC and one office PC, but nobody ran the uplink or built its VLANs. One cable has to carry both VLANs between the switches.',
      steps: [
        'With the Cable tool, connect CAN-SW1 GigabitEthernet0/1 to CAN-SW2 GigabitEthernet0/1.',
        'On CAN-SW2 create vlan 10 (name DOCK) and vlan 20 (name OFFICE). VLANs are local to each switch.',
        'On CAN-SW2 make Fa0/1 an access port in VLAN 10 and Fa0/2 an access port in VLAN 20.',
        'On both switches: interface g0/1, switchport mode trunk, switchport trunk allowed vlan 10,20.',
        'Run show interfaces trunk on either switch. The trunk is thicker on the canvas.',
        'Ping DOCK-PC2 from DOCK-PC1 and OFFICE-PC2 from OFFICE-PC1.',
      ],
      start: {
        devices: {
          SW1: SW('CAN-SW1', { 'Fa0/1': acc(10), 'Fa0/2': acc(20) }, { vlans: { 1: 'default', 10: 'DOCK', 20: 'OFFICE' } }),
          SW2: SW('CAN-SW2'),
          D1: PC('DOCK-PC1', '10.10.10.11', M24, '10.10.10.1'),
          O1: PC('OFFICE-PC1', '10.10.20.11', M24, '10.10.20.1'),
          D2: PC('DOCK-PC2', '10.10.10.12', M24, '10.10.10.1'),
          O2: PC('OFFICE-PC2', '10.10.20.12', M24, '10.10.20.1'),
        },
        links: [['D1', 'NIC', 'SW1', 'Fa0/1'], ['O1', 'NIC', 'SW1', 'Fa0/2'], ['D2', 'NIC', 'SW2', 'Fa0/1'], ['O2', 'NIC', 'SW2', 'Fa0/2']],
        positions: { SW1: { x: 220, y: 120 }, SW2: { x: 540, y: 120 }, D1: { x: 120, y: 300 }, O1: { x: 290, y: 300 }, D2: { x: 470, y: 300 }, O2: { x: 640, y: 300 } },
      },
      checks: [
        { text: 'The switches are joined by a Gigabit cable', fn: (w) => linksBetween(w, 'SW1', 'SW2').some((l) => /^Gigabit/.test(l[1]) && /^Gigabit/.test(l[3])) },
        { text: 'CAN-SW2 has VLAN 10 (DOCK) and VLAN 20 (OFFICE)', fn: (w) => (D(w, 'SW2').vlans || {})[10] === 'DOCK' && (D(w, 'SW2').vlans || {})[20] === 'OFFICE' },
        { text: 'The PCs on CAN-SW2 sit on access ports in the right VLANs', fn: (w) => { const a = peer(w, 'D2', 'NIC'); const b = peer(w, 'O2', 'NIC'); return !!a && !!b && a[0] === 'SW2' && b[0] === 'SW2' && isAccess(ifc(w, 'SW2', a[1]), 10) && isAccess(ifc(w, 'SW2', b[1]), 20); } },
        { text: 'The link between the switches is a trunk at both ends', fn: (w) => linksBetween(w, 'SW1', 'SW2').some((l) => ifc(w, 'SW1', endOn(l, 'SW1')).mode === 'trunk' && ifc(w, 'SW2', endOn(l, 'SW2')).mode === 'trunk') },
        { text: 'The trunk allows only VLANs 10 and 20', fn: (w) => linksBetween(w, 'SW1', 'SW2').some((l) => [ifc(w, 'SW1', endOn(l, 'SW1')), ifc(w, 'SW2', endOn(l, 'SW2'))].every((i) => Array.isArray(i.trunkAllowed) && i.trunkAllowed.join(',') === '10,20')) },
        { text: 'Dock PCs reach each other across the trunk, and so do office PCs', fn: (w) => ping(w, 'D1', '10.10.10.12') && ping(w, 'O1', '10.10.20.12') },
      ],
      hints: [
        'An access port carries one VLAN. A trunk carries many, tagging each frame with an 802.1Q VLAN ID (the native VLAN goes untagged).',
        'A VLAN has to exist on every switch that carries it. Check show vlan brief on CAN-SW2.',
        'switchport trunk allowed vlan 10,20 replaces the list. To add to an existing list later, use switchport trunk allowed vlan add.',
      ],
      takeaway: 'A trunk carries several VLANs over one link with 802.1Q tags. Pruning the allowed list keeps VLANs off links that do not need them. The classic exam trap: allowed vlan without the word add replaces the whole list.',
      solution: {
        _build: ['cable SW1 Gi0/1 SW2 Gi0/1'],
        SW1: ['enable', 'configure terminal', 'interface g0/1', 'switchport mode trunk', 'switchport trunk allowed vlan 10,20', 'end'],
        SW2: ['enable', 'configure terminal', 'vlan 10', 'name DOCK', 'vlan 20', 'name OFFICE', 'exit', 'interface fa0/1', 'switchport mode access', 'switchport access vlan 10', 'interface fa0/2', 'switchport mode access', 'switchport access vlan 20', 'interface g0/1', 'switchport mode trunk', 'switchport trunk allowed vlan 10,20', 'end'],
      },
    },

    /* ------------------------------------------------------------------ 5 */
    {
      id: 'roas',
      title: 'One router, two VLANs',
      day: 'Days 17-18',
      level: 'Core',
      minutes: 25,
      blueprint: ['2.1', '2.2'],
      brief: 'The dock and office VLANs are working, but now dispatch needs the dock PCs to reach the office printer queue. There is one router, CAN-R1, with one cable into the switch. Route between the VLANs over that single link: router-on-a-stick.',
      steps: [
        'On CAN-SW1, turn the port facing the router into a trunk: interface g0/1, switchport mode trunk.',
        'On CAN-R1: interface g0/0, no shutdown. The physical interface carries no address of its own.',
        'Create the VLAN 10 subinterface: interface g0/0.10, encapsulation dot1q 10, ip address 10.10.10.1 255.255.255.0.',
        'Same for VLAN 20: interface g0/0.20, encapsulation dot1q 20, ip address 10.10.20.1 255.255.255.0.',
        'Run show ip interface brief on the router, then ping OFFICE-PC1 (10.10.20.11) from DOCK-PC1.',
      ],
      start: {
        devices: {
          R1: R('CAN-R1'),
          SW1: SW('CAN-SW1', { 'Fa0/1': acc(10), 'Fa0/2': acc(20) }, { vlans: { 1: 'default', 10: 'DOCK', 20: 'OFFICE' } }),
          D1: PC('DOCK-PC1', '10.10.10.11', M24, '10.10.10.1'),
          O1: PC('OFFICE-PC1', '10.10.20.11', M24, '10.10.20.1'),
        },
        links: [['R1', 'Gi0/0', 'SW1', 'Gi0/1'], ['D1', 'NIC', 'SW1', 'Fa0/1'], ['O1', 'NIC', 'SW1', 'Fa0/2']],
        positions: { R1: { x: 380, y: 70 }, SW1: { x: 380, y: 200 }, D1: { x: 220, y: 340 }, O1: { x: 540, y: 340 } },
      },
      checks: [
        { text: 'The switch port facing the router is a trunk', fn: (w) => { const p = peer(w, 'R1', 'GigabitEthernet0/0'); return !!p && ifc(w, p[0], p[1]).mode === 'trunk'; } },
        { text: 'CAN-R1 Gi0/0 is up', fn: (w) => !ifc(w, 'R1', 'GigabitEthernet0/0').shutdown && TT.net.linkUp(w, 'R1', 'GigabitEthernet0/0') },
        { text: 'Gi0/0.10 tags VLAN 10 and holds 10.10.10.1/24', fn: (w) => { const i = ifc(w, 'R1', 'GigabitEthernet0/0.10'); return i.encap === 10 && i.ip === '10.10.10.1' && i.mask === M24; } },
        { text: 'Gi0/0.20 tags VLAN 20 and holds 10.10.20.1/24', fn: (w) => { const i = ifc(w, 'R1', 'GigabitEthernet0/0.20'); return i.encap === 20 && i.ip === '10.10.20.1' && i.mask === M24; } },
        { text: 'DOCK-PC1 can ping its gateway, 10.10.10.1', fn: (w) => ping(w, 'D1', '10.10.10.1') },
        { text: 'DOCK-PC1 can ping OFFICE-PC1 (inter-VLAN routing works)', fn: (w) => ping(w, 'D1', '10.10.20.11') },
      ],
      hints: [
        'The router sees tagged frames on g0/0. Each subinterface claims one VLAN tag with encapsulation dot1q.',
        'Bring up the physical interface. Subinterfaces follow its state.',
        'If the gateway ping fails, check the switch side is a trunk. An access port would drop the router\'s tagged frames.',
      ],
      takeaway: 'Router-on-a-stick gives each VLAN a subinterface with its own 802.1Q tag and gateway address, all over one trunk. It is cheap, but every inter-VLAN packet crosses that one link twice, which is why bigger sites use a Layer 3 switch.',
      solution: {
        SW1: ['enable', 'configure terminal', 'interface g0/1', 'switchport mode trunk', 'end'],
        R1: ['enable', 'configure terminal', 'interface g0/0', 'no shutdown', 'interface g0/0.10', 'encapsulation dot1q 10', 'ip address 10.10.10.1 255.255.255.0', 'interface g0/0.20', 'encapsulation dot1q 20', 'ip address 10.10.20.1 255.255.255.0', 'end'],
      },
    },

    /* ------------------------------------------------------------------ 6 */
    {
      id: 'svi',
      title: 'Swap the stick for a Layer 3 switch',
      day: 'Day 18',
      level: 'Core',
      minutes: 25,
      blueprint: ['1.1', '2.1'],
      brief: 'Canton\'s router-on-a-stick link is saturated at shift change. Engineering approved a Layer 3 switch to route between the VLANs in hardware. It is still in the box: only the two PCs are on the bench.',
      steps: [
        'Drag a Layer 3 switch onto the canvas between the PCs.',
        'Cable DOCK-PC1 to GigabitEthernet1/0/1 and OFFICE-PC1 to GigabitEthernet1/0/2.',
        'Open the switch CLI: hostname CAN-MLS1, then vlan 10 (name DOCK) and vlan 20 (name OFFICE).',
        'Make Gi1/0/1 an access port in VLAN 10 and Gi1/0/2 an access port in VLAN 20.',
        'Turn routing on: ip routing.',
        'Build the gateways: interface vlan 10, ip address 10.10.10.1 255.255.255.0, no shutdown. Then interface vlan 20 with 10.10.20.1.',
        'Ping OFFICE-PC1 from DOCK-PC1, then run show ip route on the switch: one connected route per SVI.',
      ],
      start: {
        devices: {
          D1: PC('DOCK-PC1', '10.10.10.11', M24, '10.10.10.1'),
          O1: PC('OFFICE-PC1', '10.10.20.11', M24, '10.10.20.1'),
        },
        links: [],
        positions: { D1: { x: 180, y: 300 }, O1: { x: 580, y: 300 } },
      },
      checks: [
        { text: 'A Layer 3 switch is on the canvas with both PCs cabled to it', fn: (w) => { const a = peer(w, 'D1', 'NIC'); const b = peer(w, 'O1', 'NIC'); return !!a && !!b && a[0] === b[0] && !!w.devices[a[0]].multilayer; } },
        { text: 'The Layer 3 switch is named CAN-MLS1', fn: (w) => Object.values(w.devices).some((d) => d.multilayer && d.hostname === 'CAN-MLS1') },
        { text: 'Each PC sits on an access port in its VLAN (DOCK 10, OFFICE 20)', fn: (w) => { const a = peer(w, 'D1', 'NIC'); const b = peer(w, 'O1', 'NIC'); return !!a && !!b && isAccess(ifc(w, a[0], a[1]), 10) && isAccess(ifc(w, b[0], b[1]), 20); } },
        { text: 'SVIs Vlan10 (10.10.10.1/24) and Vlan20 (10.10.20.1/24) are up', fn: (w) => { const a = peer(w, 'D1', 'NIC'); if (!a) return false; const s = a[0]; return ifc(w, s, 'Vlan10').ip === '10.10.10.1' && ifc(w, s, 'Vlan20').ip === '10.10.20.1' && TT.net.linkUp(w, s, 'Vlan10') && TT.net.linkUp(w, s, 'Vlan20'); } },
        { text: 'IP routing is enabled on the switch', fn: (w) => Object.values(w.devices).some((d) => d.multilayer && d.ipRouting) },
        { text: 'DOCK-PC1 can ping OFFICE-PC1', fn: (w) => ping(w, 'D1', '10.10.20.11') },
      ],
      hints: [
        'An SVI (interface vlan N) is the switch\'s Layer 3 interface for that VLAN. It comes up only when the VLAN exists and at least one port in it is up.',
        'SVIs you create start shut down here. Type no shutdown on each.',
        'Without ip routing the switch answers pings on its SVIs but will not route between them.',
      ],
      takeaway: 'A Layer 3 switch routes between VLANs internally: one SVI per VLAN acts as that VLAN\'s gateway, and ip routing turns the forwarding on. No trunk to a router, no hairpin.',
      solution: {
        _build: ['add mls MLS1', 'cable D1 NIC MLS1 Gi1/0/1', 'cable O1 NIC MLS1 Gi1/0/2'],
        MLS1: ['enable', 'configure terminal', 'hostname CAN-MLS1', 'vlan 10', 'name DOCK', 'vlan 20', 'name OFFICE', 'exit', 'interface g1/0/1', 'switchport mode access', 'switchport access vlan 10', 'interface g1/0/2', 'switchport mode access', 'switchport access vlan 20', 'exit', 'ip routing', 'interface vlan 10', 'ip address 10.10.10.1 255.255.255.0', 'no shutdown', 'interface vlan 20', 'ip address 10.10.20.1 255.255.255.0', 'no shutdown', 'end'],
      },
    },

    /* ------------------------------------------------------------------ 7 */
    {
      id: 'stp',
      title: 'Who elected the closet switch?',
      day: 'Days 20-22',
      level: 'Core',
      minutes: 25,
      blueprint: ['2.5'],
      brief: 'Someone noticed the amber light sitting on the link between the two Canton core switches. With every priority at default, Spanning Tree picked the root by lowest MAC address, and the oldest box in the building won: the access switch in the wiring closet. Put the root where the traffic actually flows.',
      steps: [
        'Look first: open any switch and run show spanning-tree. Find the one that says This bridge is the root, and note where the amber light sits.',
        'On CAN-CORE1: spanning-tree vlan 1 root primary. It drops its priority below every other switch.',
        'On CAN-CORE2: spanning-tree vlan 1 priority 28672. That is the value root secondary would set: next in line.',
        'Watch the amber light move to CAN-ACC1, the switch with the least important link.',
        'On CAN-ACC1, the PC port fa0/1: spanning-tree portfast, then spanning-tree bpduguard enable.',
        'Run show spanning-tree vlan 1 on CAN-ACC1 and find its Root port and its Altn (alternate) port.',
      ],
      start: {
        devices: {
          C1: SW('CAN-CORE1', {}, { mac: '0019.e8a1.0300' }),
          C2: SW('CAN-CORE2', {}, { mac: '0019.e8a1.0400' }),
          A1: SW('CAN-ACC1', {}, { mac: '000a.41c2.0100' }),
          PC1: PC('PICK-PC1', '10.0.1.11', M24, '10.0.1.1'),
        },
        links: [['C1', 'Gi0/1', 'C2', 'Gi0/1'], ['C1', 'Gi0/2', 'A1', 'Gi0/1'], ['C2', 'Gi0/2', 'A1', 'Gi0/2'], ['PC1', 'NIC', 'A1', 'Fa0/1']],
        positions: { C1: { x: 200, y: 90 }, C2: { x: 560, y: 90 }, A1: { x: 380, y: 260 }, PC1: { x: 380, y: 410 } },
      },
      checks: [
        { text: 'CAN-CORE1 is the root bridge for VLAN 1', fn: (w) => { const s = TT.net.computeStp(w, 1); return !!s && s.root.dev === 'C1'; } },
        { text: 'CAN-CORE2 has priority 28672 for VLAN 1 (the backup root)', fn: (w) => ((D(w, 'C2').stp || {}).prio || {})[1] === 28672 },
        { text: 'The blocked (alternate) port is on CAN-ACC1, not between the cores', fn: (w) => { const s = TT.net.computeStp(w, 1); if (!s) return false; const alt = (id) => Object.values(s.ports[id] || {}).some((p) => p.role === 'Altn'); return alt('A1') && !alt('C1') && !alt('C2'); } },
        { text: 'If CAN-CORE1 dies, CAN-CORE2 takes over as root', fn: (w) => !!w.devices.C1 && whatIf(w, (c) => shutAll(c, 'C1'), (c) => { const s = TT.net.computeStp(c, 1); return !!s && s.rootOf.C2 && s.rootOf.C2.dev === 'C2'; }) },
        { text: 'The PC port on CAN-ACC1 has PortFast and BPDU guard', fn: (w) => { const p = peer(w, 'PC1', 'NIC'); return !!p && !!ifc(w, p[0], p[1]).portfast && !!ifc(w, p[0], p[1]).bpduguard; } },
      ],
      hints: [
        'Lowest bridge ID wins: priority first, then MAC address. The default priority shows as 32769 for VLAN 1 (32768 plus the VLAN number, the extended system ID).',
        'Priorities go in steps of 4096. root primary usually lands on 24576; 28672 is the classic secondary.',
        'PortFast only belongs on ports facing end hosts. BPDU guard err-disables the port if a switch ever shows up there.',
      ],
      takeaway: 'Leave STP priorities at default and the root is chosen by MAC address, usually the oldest switch. Set a primary and a secondary root on purpose, and the blocked port lands at the edge of the network instead of on your core link. PortFast plus BPDU guard on host ports skips the listening and learning wait and keeps rogue switches out.',
      solution: {
        C1: ['enable', 'configure terminal', 'spanning-tree vlan 1 root primary', 'end'],
        C2: ['enable', 'configure terminal', 'spanning-tree vlan 1 priority 28672', 'end'],
        A1: ['enable', 'configure terminal', 'interface fa0/1', 'spanning-tree portfast', 'spanning-tree bpduguard enable', 'end', 'show spanning-tree vlan 1'],
      },
    },

    /* ------------------------------------------------------------------ 8 */
    {
      id: 'lacp',
      title: 'Double the uplink',
      day: 'Day 23',
      level: 'Core',
      minutes: 20,
      blueprint: ['2.4'],
      brief: 'The single gigabit link between the two Canton distribution switches is maxed out every evening. Facilities pulled a second cable. Plug it in, and bundle both links with LACP so they work as one instead of Spanning Tree blocking one of them.',
      steps: [
        'Cable a second link: CAN-DIST1 Gi0/2 to CAN-DIST2 Gi0/2. One end turns amber: STP blocks the extra path so it cannot loop.',
        'On CAN-DIST1: interface range g0/1 - 2, then switchport mode trunk and channel-group 1 mode active.',
        'On CAN-DIST2: the same range and trunk, with channel-group 1 mode passive.',
        'Run show etherchannel summary. Po1 should show (SU) with both ports flagged (P). The amber light goes green: STP now treats the bundle as one link.',
        'Ping PC2 (10.0.5.12) from PC1 to confirm traffic still flows.',
      ],
      start: {
        devices: {
          S1: SW('CAN-DIST1', {}, { mac: '0019.aa10.0001' }),
          S2: SW('CAN-DIST2', {}, { mac: '0019.aa10.0002' }),
          PC1: PC('PC1', '10.0.5.11', M24, '10.0.5.1'),
          PC2: PC('PC2', '10.0.5.12', M24, '10.0.5.1'),
        },
        links: [['S1', 'Gi0/1', 'S2', 'Gi0/1'], ['PC1', 'NIC', 'S1', 'Fa0/1'], ['PC2', 'NIC', 'S2', 'Fa0/1']],
        positions: { S1: { x: 220, y: 140 }, S2: { x: 540, y: 140 }, PC1: { x: 220, y: 320 }, PC2: { x: 540, y: 320 } },
      },
      checks: [
        { text: 'Two cables join CAN-DIST1 and CAN-DIST2', fn: (w) => linksBetween(w, 'S1', 'S2').length >= 2 },
        { text: 'Both links are in channel-group 1 with LACP on each switch', fn: (w) => { const L = linksBetween(w, 'S1', 'S2'); return L.length >= 2 && L.every((l) => ['S1', 'S2'].every((s) => { const c = ifc(w, s, endOn(l, s)).channel; return !!c && c.group === 1 && ['active', 'passive'].includes(c.mode); })); } },
        { text: 'At least one side actively negotiates (mode active)', fn: (w) => linksBetween(w, 'S1', 'S2').some((l) => ['S1', 'S2'].some((s) => (ifc(w, s, endOn(l, s)).channel || {}).mode === 'active')) },
        { text: 'Port-channel 1 is up with both links bundled on both switches', fn: (w) => { const L = linksBetween(w, 'S1', 'S2'); return L.length >= 2 && ['S1', 'S2'].every((s) => { const g = TT.net.computeEc(w, s)[1]; return !!g && g.up && L.every((l) => g.members[endOn(l, s)] === 'P'); }); } },
        { text: 'The bundled links are trunks', fn: (w) => { const L = linksBetween(w, 'S1', 'S2'); return L.length >= 2 && L.every((l) => ifc(w, 'S1', endOn(l, 'S1')).mode === 'trunk' && ifc(w, 'S2', endOn(l, 'S2')).mode === 'trunk'); } },
        { text: 'PC1 can ping PC2', fn: (w) => ping(w, 'PC1', '10.0.5.12') },
      ],
      hints: [
        'LACP modes: active starts negotiating, passive only answers. Active plus passive bundles; passive plus passive never does.',
        'Members must match: same speed, same mode (access or trunk) and same VLAN settings, or they get suspended.',
        'Configure the members together with interface range so they stay identical.',
      ],
      takeaway: 'EtherChannel bundles parallel links into one logical port-channel, so Spanning Tree sees a single link and nothing gets blocked. LACP (IEEE 802.3ad) negotiates the bundle: at least one side must be active. The bundle balances flows across members; it does not split a single flow.',
      solution: {
        _build: ['cable S1 Gi0/2 S2 Gi0/2'],
        S1: ['enable', 'configure terminal', 'interface range g0/1 - 2', 'switchport mode trunk', 'channel-group 1 mode active', 'end'],
        S2: ['enable', 'configure terminal', 'interface range g0/1 - 2', 'switchport mode trunk', 'channel-group 1 mode passive', 'end', 'show etherchannel summary'],
        PC1: ['ping 10.0.5.12'],
      },
    },

    /* ------------------------------------------------------------------ 9 */
    {
      id: 'static',
      title: 'Three sites, no routing protocol',
      day: 'Days 11 and 24',
      level: 'Core',
      minutes: 30,
      blueprint: ['3.1', '3.2', '3.3'],
      brief: 'The port office (HPL-PORT) and the warehouse (HPL-WHSE) talk through the core router over fiber. There is also a cheap direct backup circuit between them that nobody routes over. This contract allows no routing protocol, so it is static routes, with a floating backup for the day the core goes dark.',
      steps: [
        'Run show ip route on HPL-PORT. It only knows its connected networks.',
        'On HPL-PORT: ip route 10.3.3.0 255.255.255.0 10.0.12.2 (the warehouse LAN, via the core).',
        'On HPL-CORE: ip route 10.1.1.0 255.255.255.0 10.0.12.1 and ip route 10.3.3.0 255.255.255.0 10.0.23.2.',
        'On HPL-WHSE: ip route 10.1.1.0 255.255.255.0 10.0.23.1.',
        'Ping PC-WHSE (10.3.3.10) from PC-PORT. Use Ping test to watch it pass through the core.',
        'Add floating backups over the direct circuit with administrative distance 200: on HPL-PORT ip route 10.3.3.0 255.255.255.0 10.0.13.2 200, on HPL-WHSE ip route 10.1.1.0 255.255.255.0 10.0.13.1 200.',
        'show ip route still lists only the core path: a floating route waits until the better one disappears. Test it: shut down both HPL-CORE interfaces, ping again, then bring them back up.',
      ],
      start: {
        devices: {
          R1: R('HPL-PORT', { 'Gi0/0': up('10.0.12.1', M30), 'Gi0/1': up('10.0.13.1', M30), 'Gi0/2': up('10.1.1.1', M24) }),
          R2: R('HPL-CORE', { 'Gi0/0': up('10.0.12.2', M30), 'Gi0/1': up('10.0.23.1', M30) }),
          R3: R('HPL-WHSE', { 'Gi0/0': up('10.0.23.2', M30), 'Gi0/1': up('10.0.13.2', M30), 'Gi0/2': up('10.3.3.1', M24) }),
          PC1: PC('PC-PORT', '10.1.1.10', M24, '10.1.1.1'),
          PC3: PC('PC-WHSE', '10.3.3.10', M24, '10.3.3.1'),
        },
        links: [['R1', 'Gi0/0', 'R2', 'Gi0/0'], ['R2', 'Gi0/1', 'R3', 'Gi0/0'], ['R1', 'Gi0/1', 'R3', 'Gi0/1'], ['R1', 'Gi0/2', 'PC1', 'NIC'], ['R3', 'Gi0/2', 'PC3', 'NIC']],
        positions: { R1: { x: 150, y: 180 }, R2: { x: 390, y: 60 }, R3: { x: 630, y: 180 }, PC1: { x: 150, y: 350 }, PC3: { x: 630, y: 350 } },
      },
      checks: [
        { text: 'HPL-PORT routes to 10.3.3.0/24 via the core (10.0.12.2)', fn: (w) => routeVia(w, 'R1', '10.3.3.0', 24, '10.0.12.2') },
        { text: 'HPL-WHSE routes to 10.1.1.0/24 via the core (10.0.23.1)', fn: (w) => routeVia(w, 'R3', '10.1.1.0', 24, '10.0.23.1') },
        { text: 'PC-PORT can ping PC-WHSE', fn: (w) => ping(w, 'PC1', '10.3.3.10') },
        { text: 'That traffic goes through HPL-CORE', fn: (w) => { try { const r = TT.net.ping(w, 'PC1', '10.3.3.10'); return r.ok && r.there.hops.includes('R2'); } catch (e) { return false; } } },
        { text: 'Both edge routers hold a floating static route over the direct circuit', fn: (w) => (D(w, 'R1').routes || []).some((r) => r.net === '10.3.3.0' && r.nh === '10.0.13.2' && r.ad > 1) && (D(w, 'R3').routes || []).some((r) => r.net === '10.1.1.0' && r.nh === '10.0.13.1' && r.ad > 1) },
        { text: 'If HPL-CORE loses power, PC-PORT still reaches PC-WHSE', fn: (w) => !!w.devices.R2 && whatIf(w, (c) => shutAll(c, 'R2'), (c) => ping(c, 'PC1', '10.3.3.10')) },
      ],
      hints: [
        'Every router on the path needs a route there and a route back. The core needs both LANs.',
        'The number at the end of a static route is its administrative distance. A plain static route is 1; any higher value makes it a backup.',
        'A floating route only appears in show ip route once the primary route is gone, for example when its exit interface goes down.',
      ],
      takeaway: 'Routers pick the longest prefix match first, then the lowest administrative distance. A static route with AD 200 stays out of the table until the AD 1 route to the same prefix disappears. The catch: a static route only notices failures that take its own interface or next hop down.',
      solution: {
        R1: ['enable', 'configure terminal', 'ip route 10.3.3.0 255.255.255.0 10.0.12.2', 'ip route 10.3.3.0 255.255.255.0 10.0.13.2 200', 'end'],
        R2: ['enable', 'configure terminal', 'ip route 10.1.1.0 255.255.255.0 10.0.12.1', 'ip route 10.3.3.0 255.255.255.0 10.0.23.2', 'end'],
        R3: ['enable', 'configure terminal', 'ip route 10.1.1.0 255.255.255.0 10.0.23.1', 'ip route 10.1.1.0 255.255.255.0 10.0.13.1 200', 'end'],
      },
    },

    /* ------------------------------------------------------------------ 10 */
    {
      id: 'ospf',
      title: 'Let the routers figure it out',
      day: 'Days 26-28',
      level: 'Challenge',
      minutes: 35,
      blueprint: ['3.4'],
      brief: 'Harbor Point is moving its three Baltimore offices off static routes. The routers share one backbone LAN in the data center. Run single-area OSPF, make BAL-R1 (the one with the most memory) the DR, and keep BAL-R3, the oldest box, out of the election for good.',
      steps: [
        'On BAL-R1 set its backbone priority before OSPF starts: interface g0/0, ip ospf priority 255.',
        'Still on BAL-R1: router ospf 1, router-id 1.1.1.1, network 10.0.0.0 0.0.0.255 area 0, network 10.1.1.0 0.0.0.255 area 0, passive-interface g0/1.',
        'On BAL-R2: router ospf 1, router-id 2.2.2.2, networks 10.0.0.0 and 10.2.2.0 (wildcard 0.0.0.255) in area 0, passive-interface g0/1.',
        'On BAL-R3: interface g0/0, ip ospf priority 0. Then router ospf 1 with router-id 3.3.3.3, its two networks in area 0 and passive-interface g0/1.',
        'On BAL-R2 run show ip ospf neighbor: BAL-R1 should be FULL/DR. If another router grabbed DR first, run clear ip ospf process on that router. The DR election does not preempt.',
        'show ip route on BAL-R1 should list O routes to 10.2.2.0/24 and 10.3.3.0/24. Ping PC3 from PC1.',
      ],
      start: {
        devices: {
          SW: SW('HPL-BB-SW'),
          R1: R('BAL-R1', { 'Gi0/0': up('10.0.0.1', M24), 'Gi0/1': up('10.1.1.1', M24) }),
          R2: R('BAL-R2', { 'Gi0/0': up('10.0.0.2', M24), 'Gi0/1': up('10.2.2.1', M24) }),
          R3: R('BAL-R3', { 'Gi0/0': up('10.0.0.3', M24), 'Gi0/1': up('10.3.3.1', M24) }),
          PC1: PC('PC1', '10.1.1.10', M24, '10.1.1.1'),
          PC2: PC('PC2', '10.2.2.10', M24, '10.2.2.1'),
          PC3: PC('PC3', '10.3.3.10', M24, '10.3.3.1'),
        },
        links: [['R1', 'Gi0/0', 'SW', 'Gi0/1'], ['R2', 'Gi0/0', 'SW', 'Gi0/2'], ['R3', 'Gi0/0', 'SW', 'Fa0/1'], ['R1', 'Gi0/1', 'PC1', 'NIC'], ['R2', 'Gi0/1', 'PC2', 'NIC'], ['R3', 'Gi0/1', 'PC3', 'NIC']],
        positions: { SW: { x: 390, y: 360 }, R1: { x: 150, y: 210 }, R2: { x: 390, y: 210 }, R3: { x: 630, y: 210 }, PC1: { x: 150, y: 60 }, PC2: { x: 390, y: 60 }, PC3: { x: 630, y: 60 } },
      },
      checks: [
        { text: 'Router IDs are 1.1.1.1, 2.2.2.2 and 3.3.3.3', fn: (w) => ['R1', 'R2', 'R3'].every((r, i) => !!D(w, r).ospf && TT.net.routerId(D(w, r)) === `${i + 1}.${i + 1}.${i + 1}.${i + 1}`) },
        { text: 'All three routers are FULL neighbors on the backbone', fn: (w) => { const { adj } = TT.net.computeOspf(w); return [['R1', 'R2'], ['R1', 'R3'], ['R2', 'R3']].every(([a, b]) => adj.some((x) => x.a === a && x.b === b && x.full && x.usable)); } },
        { text: 'BAL-R1 is the DR on 10.0.0.0/24', fn: (w) => { TT.net.computeOspf(w); return (w.ospfRoles || {})['R1|GigabitEthernet0/0'] === 'DR'; } },
        { text: 'BAL-R3 can never become DR or BDR (priority 0)', fn: (w) => ifc(w, 'R3', 'GigabitEthernet0/0').ospfPrio === 0 },
        { text: 'The PC-facing interfaces are passive', fn: (w) => ['R1', 'R2', 'R3'].every((r) => ((D(w, r).ospf || {}).passive || []).includes('GigabitEthernet0/1')) },
        { text: 'BAL-R1 learned both remote LANs through OSPF', fn: (w) => routeVia(w, 'R1', '10.2.2.0', 24, null, 'O') && routeVia(w, 'R1', '10.3.3.0', 24, null, 'O') },
        { text: 'PC1 can ping PC2 and PC3', fn: (w) => ping(w, 'PC1', '10.2.2.10') && ping(w, 'PC1', '10.3.3.10') },
      ],
      hints: [
        'Wildcard masks are inverted subnet masks: a /24 is 0.0.0.255.',
        'Highest interface priority wins DR, then highest router ID breaks ties. Priority 0 means the router never takes DR or BDR.',
        'The election is not preemptive. A better priority set later changes nothing until the DR leaves the segment or someone runs clear ip ospf process.',
      ],
      takeaway: 'On a broadcast segment OSPF elects a DR and BDR so routers form full adjacencies only with them; DROTHERs stay in 2-WAY with each other. Priority decides the election, router ID breaks ties, and the result sticks until the DR leaves. Passive interfaces still advertise their subnet but send no hellos to the hosts.',
      solution: {
        R1: ['enable', 'configure terminal', 'interface g0/0', 'ip ospf priority 255', 'exit', 'router ospf 1', 'router-id 1.1.1.1', 'network 10.0.0.0 0.0.0.255 area 0', 'network 10.1.1.0 0.0.0.255 area 0', 'passive-interface g0/1', 'end'],
        R2: ['enable', 'configure terminal', 'router ospf 1', 'router-id 2.2.2.2', 'network 10.0.0.0 0.0.0.255 area 0', 'network 10.2.2.0 0.0.0.255 area 0', 'passive-interface g0/1', 'end'],
        R3: ['enable', 'configure terminal', 'interface g0/0', 'ip ospf priority 0', 'exit', 'router ospf 1', 'router-id 3.3.3.3', 'network 10.0.0.0 0.0.0.255 area 0', 'network 10.3.3.0 0.0.0.255 area 0', 'passive-interface g0/1', 'end'],
      },
    },

    /* ------------------------------------------------------------------ 11 */
    {
      id: 'dhcp',
      title: 'Scanners need addresses',
      day: 'Day 39',
      level: 'Core',
      minutes: 25,
      blueprint: ['4.3', '4.6'],
      brief: 'The Dundalk warehouse handhelds are set to DHCP, but the only DHCP server sits on the server VLAN behind DUN-R1, and its pool list is empty. Give the scanners a pool and get their requests across the router.',
      steps: [
        'Open DUN-DHCP (the server) and go to Services: DHCP. Add a pool named SCANNERS: network 10.20.10.0, mask 255.255.255.0, gateway 10.20.10.1, first address 10.20.10.100, last 10.20.10.199.',
        'The scanners broadcast their DHCP Discover, and routers do not forward broadcasts. On DUN-R1: interface g0/0, ip helper-address 10.20.99.10. The router now relays the request to the server as unicast.',
        'Open each scanner, choose DHCP in IP Configuration and press Apply (or run ipconfig /renew in its Command Prompt).',
        'Run leases in the server\'s Command Prompt to see who got what.',
        'Ping the server (10.20.99.10) from each scanner.',
      ],
      start: {
        devices: {
          R1: R('DUN-R1', { 'Gi0/0': up('10.20.10.1', M24), 'Gi0/1': up('10.20.99.1', M24) }),
          SW1: SW('DUN-SW1'),
          S1: LAP('SCAN-01', '', '', '', { dhcp: true }),
          S2: LAP('SCAN-02', '', '', '', { dhcp: true }),
          SRV: SRV('DUN-DHCP', '10.20.99.10', M24, '10.20.99.1', []),
        },
        links: [['R1', 'Gi0/0', 'SW1', 'Gi0/1'], ['S1', 'NIC', 'SW1', 'Fa0/1'], ['S2', 'NIC', 'SW1', 'Fa0/2'], ['R1', 'Gi0/1', 'SRV', 'NIC']],
        positions: { R1: { x: 400, y: 110 }, SW1: { x: 230, y: 240 }, S1: { x: 130, y: 390 }, S2: { x: 330, y: 390 }, SRV: { x: 600, y: 250 } },
      },
      checks: [
        { text: 'The server has a pool for 10.20.10.0/24 with gateway 10.20.10.1', fn: (w) => ((D(w, 'SRV').pc || {}).pools || []).some((p) => p.network === '10.20.10.0' && p.mask === M24 && p.gw === '10.20.10.1') },
        { text: 'DUN-R1 Gi0/0 relays DHCP to 10.20.99.10', fn: (w) => (ifc(w, 'R1', 'GigabitEthernet0/0').helpers || []).includes('10.20.99.10') },
        { text: 'Both scanners leased an address from the server', fn: (w) => { const L = (D(w, 'SRV').pc || {}).leases || {}; return ['S1', 'S2'].every((s) => { const d = w.devices[s]; return !!d && d.pc.dhcp && !!d.pc.ip && L[s] === d.pc.ip && TT.ip.netOf(ip(d.pc.ip), 24) === ip('10.20.10.0'); }); } },
        { text: 'Both scanners can ping the server', fn: (w) => ping(w, 'S1', '10.20.99.10') && ping(w, 'S2', '10.20.99.10') },
      ],
      hints: [
        'The server picks the pool whose network matches the relay\'s address (the giaddr), which is DUN-R1 Gi0/0, 10.20.10.1.',
        'ip helper-address goes on the interface where the clients live, not the one facing the server.',
        'A 169.254.x.x address means no DHCP server answered: the client gave itself an APIPA address.',
      ],
      takeaway: 'DHCP starts with a broadcast (Discover, Offer, Request, Acknowledge), and broadcasts stop at the router. ip helper-address turns the router into a relay agent: it forwards the request as unicast to the server and stamps its own interface address in the giaddr field so the server knows which pool to use.',
      solution: {
        SRV: ['dhcp pool add SCANNERS 10.20.10.0 255.255.255.0 10.20.10.1 10.20.10.100 10.20.10.199'],
        R1: ['enable', 'configure terminal', 'interface g0/0', 'ip helper-address 10.20.99.10', 'end'],
        S1: ['ipconfig /renew', 'ping 10.20.99.10'],
        S2: ['ipconfig /renew', 'ping 10.20.99.10'],
      },
    },

    /* ------------------------------------------------------------------ 12 */
    {
      id: 'acl',
      title: 'Guests stay in the lobby',
      day: 'Days 34-35',
      level: 'Challenge',
      minutes: 30,
      blueprint: ['5.6'],
      brief: 'The Federal Hill office gives visitors a guest network. Last month\'s audit found that a guest laptop can reach the office PCs and the payroll server. Lock it down with ACLs on FED-R1, and keep the public web server open to guests.',
      steps: [
        'Prove the problem: from GUEST-LT ping 10.30.1.11 (office PC) and 10.30.9.10 (payroll). Both answer. They should not.',
        'Standard ACL for the office: access-list 10 deny 10.30.2.0 0.0.0.255, then access-list 10 permit any. Standard ACLs only check the source, so put them close to the destination: interface g0/0, ip access-group 10 out.',
        'Extended ACL for payroll: access-list 110 deny ip 10.30.2.0 0.0.0.255 host 10.30.9.10, then access-list 110 permit ip any any. Extended ACLs can be precise, so put them close to the source: interface g0/1, ip access-group 110 in.',
        'Test from GUEST-LT: the office PC and payroll fail, the web server (10.30.9.20) still answers.',
        'Test from OFFICE-PC: payroll and the web server both answer.',
        'Read show access-lists on FED-R1.',
      ],
      start: {
        devices: {
          R1: R('FED-R1', { 'Gi0/0': up('10.30.1.1', M24), 'Gi0/1': up('10.30.2.1', M24), 'Gi0/2': up('10.30.9.1', M24) }),
          SW1: SW('FED-SRV-SW'),
          OFF: PC('OFFICE-PC', '10.30.1.11', M24, '10.30.1.1'),
          GST: LAP('GUEST-LT', '10.30.2.50', M24, '10.30.2.1'),
          PAY: SRV('PAYROLL', '10.30.9.10', M24, '10.30.9.1'),
          WEB: SRV('WEB', '10.30.9.20', M24, '10.30.9.1'),
        },
        links: [['R1', 'Gi0/0', 'OFF', 'NIC'], ['R1', 'Gi0/1', 'GST', 'NIC'], ['R1', 'Gi0/2', 'SW1', 'Gi0/1'], ['PAY', 'NIC', 'SW1', 'Fa0/1'], ['WEB', 'NIC', 'SW1', 'Fa0/2']],
        positions: { R1: { x: 330, y: 150 }, OFF: { x: 110, y: 90 }, GST: { x: 110, y: 290 }, SW1: { x: 560, y: 150 }, PAY: { x: 480, y: 330 }, WEB: { x: 650, y: 330 } },
      },
      checks: [
        { text: 'ACL 10 is a standard ACL applied outbound on Gi0/0', fn: (w) => ifc(w, 'R1', 'GigabitEthernet0/0').aclOut === 10 && ((D(w, 'R1').acls || {})[10] || []).length > 0 && D(w, 'R1').acls[10].every((e) => e.std) },
        { text: 'ACL 110 is an extended ACL applied inbound on Gi0/1', fn: (w) => ifc(w, 'R1', 'GigabitEthernet0/1').aclIn === 110 && ((D(w, 'R1').acls || {})[110] || []).length > 0 },
        { text: 'GUEST-LT cannot reach OFFICE-PC', fn: (w) => !!w.devices.GST && !ping(w, 'GST', '10.30.1.11') },
        { text: 'GUEST-LT cannot reach payroll (10.30.9.10)', fn: (w) => !!w.devices.GST && !ping(w, 'GST', '10.30.9.10') },
        { text: 'GUEST-LT can still reach the web server (10.30.9.20)', fn: (w) => ping(w, 'GST', '10.30.9.20') },
        { text: 'OFFICE-PC still reaches payroll and the web server', fn: (w) => ping(w, 'OFF', '10.30.9.10') && ping(w, 'OFF', '10.30.9.20') },
      ],
      hints: [
        'Every ACL ends with an invisible deny any. Without its permit line, ACL 10 would block everyone, office included.',
        'Direction is from the router\'s point of view: in means arriving on that interface, out means leaving it.',
        'If GUEST-LT loses the web server too, check the order of ACL 110: the deny for payroll must come before permit ip any any. Entries are checked top down and the first match wins.',
      ],
      takeaway: 'Standard ACLs (1-99, 1300-1999) match only the source address, so place them near the destination. Extended ACLs (100-199, 2000-2699) match protocol, source and destination, so place them near the source and drop traffic early. Notice ACL 10 also blocks the office\'s replies to guests: ACLs filter every packet, including return traffic.',
      solution: {
        R1: ['enable', 'configure terminal', 'access-list 10 deny 10.30.2.0 0.0.0.255', 'access-list 10 permit any', 'access-list 110 deny ip 10.30.2.0 0.0.0.255 host 10.30.9.10', 'access-list 110 permit ip any any', 'interface g0/0', 'ip access-group 10 out', 'interface g0/1', 'ip access-group 110 in', 'end', 'show access-lists'],
      },
    },

    /* ------------------------------------------------------------------ 13 */
    {
      id: 'nat',
      title: 'One public address for everyone',
      day: 'Days 44-45',
      level: 'Core',
      minutes: 30,
      blueprint: ['1.7', '4.1'],
      brief: 'The new Harbor Point satellite office has one public address from its ISP, 203.0.113.2, and a LAN full of private 192.168.50.x hosts. The ISP will not route private addresses, and its router is not yours to touch. Get the office online with PAT on HPL-EDGE.',
      steps: [
        'Try it first: ping 198.51.100.10 (the ISP\'s web server) from PC1. It fails: HPL-EDGE has no route out, and the ISP would never route a 192.168 address back anyway.',
        'On HPL-EDGE add a default route to the ISP: ip route 0.0.0.0 0.0.0.0 203.0.113.1.',
        'Define who gets translated: access-list 1 permit 192.168.50.0 0.0.0.255.',
        'Mark the sides: interface g0/0, ip nat inside; interface g0/1, ip nat outside.',
        'Turn on PAT: ip nat inside source list 1 interface g0/1 overload.',
        'Ping 198.51.100.10 from both PCs, then run show ip nat translations on HPL-EDGE.',
      ],
      start: {
        devices: {
          R1: R('HPL-EDGE', { 'Gi0/0': up('192.168.50.1', M24), 'Gi0/1': up('203.0.113.2', M30) }),
          SW1: SW('HPL-LAN-SW'),
          PC1: PC('PC1', '192.168.50.11', M24, '192.168.50.1'),
          PC2: PC('PC2', '192.168.50.12', M24, '192.168.50.1'),
          ISP: R('ISP-RTR', { 'Gi0/0': up('203.0.113.1', M30), 'Gi0/1': up('198.51.100.1', M24) }, { locked: true }),
          EXT: SRV('WEB-EXT', '198.51.100.10', M24, '198.51.100.1'),
        },
        links: [['R1', 'Gi0/0', 'SW1', 'Gi0/1'], ['PC1', 'NIC', 'SW1', 'Fa0/1'], ['PC2', 'NIC', 'SW1', 'Fa0/2'], ['R1', 'Gi0/1', 'ISP', 'Gi0/0'], ['ISP', 'Gi0/1', 'EXT', 'NIC']],
        positions: { SW1: { x: 150, y: 220 }, PC1: { x: 70, y: 380 }, PC2: { x: 230, y: 380 }, R1: { x: 340, y: 110 }, ISP: { x: 560, y: 110 }, EXT: { x: 660, y: 290 } },
      },
      checks: [
        { text: 'HPL-EDGE has a default route to the ISP (203.0.113.1)', fn: (w) => routeVia(w, 'R1', '0.0.0.0', 0, '203.0.113.1') },
        { text: 'Gi0/0 is the NAT inside and Gi0/1 the NAT outside', fn: (w) => ifc(w, 'R1', 'GigabitEthernet0/0').nat === 'inside' && ifc(w, 'R1', 'GigabitEthernet0/1').nat === 'outside' },
        { text: 'ACL 1 matches the 192.168.50.0/24 LAN', fn: (w) => { const d = D(w, 'R1'); return !!(d.acls && (d.acls[1] || []).length) && TT.net.aclPermits(d, 1, ip('192.168.50.11'), 0) && TT.net.aclPermits(d, 1, ip('192.168.50.200'), 0); } },
        { text: 'PAT translates ACL 1 to Gi0/1\'s address (overload)', fn: (w) => { const n = D(w, 'R1').nat; return !!n && n.list === 1 && n.outIf === 'GigabitEthernet0/1'; } },
        { text: 'Both PCs reach WEB-EXT (198.51.100.10)', fn: (w) => ping(w, 'PC1', '198.51.100.10') && ping(w, 'PC2', '198.51.100.10') },
        { text: 'A ping from a PC created a NAT translation', fn: (w) => (D(w, 'R1').natTable || []).length > 0 },
      ],
      hints: [
        'Without a default route, HPL-EDGE drops anything for an address it does not know.',
        'NAT only translates traffic that enters an inside interface and leaves an outside one. Both labels are required.',
        'overload is what makes it PAT: many inside hosts share one address, told apart by port number.',
      ],
      takeaway: 'Private ranges (10/8, 172.16/12, 192.168/16) are not routed on the internet. PAT (NAT overload) rewrites each inside source to one public address and tracks the conversations by port, which is how almost every office and home gets online. The ACL in a NAT rule selects traffic to translate; it does not filter.',
      solution: {
        R1: ['enable', 'configure terminal', 'ip route 0.0.0.0 0.0.0.0 203.0.113.1', 'access-list 1 permit 192.168.50.0 0.0.0.255', 'interface g0/0', 'ip nat inside', 'interface g0/1', 'ip nat outside', 'exit', 'ip nat inside source list 1 interface g0/1 overload', 'end'],
        PC1: ['ping 198.51.100.10'],
        PC2: ['ping 198.51.100.10'],
      },
    },

    /* ------------------------------------------------------------------ 14 */
    {
      id: 'ssh',
      title: 'Retire Telnet',
      day: 'Day 42',
      level: 'Core',
      minutes: 25,
      blueprint: ['2.8', '4.8', '5.3'],
      brief: 'The Locust Point router still takes Telnet with the password cisco. Telnet sends everything in clear text, password included, so anyone on the LAN with a packet capture can read it. Move management to SSH version 2 with a real local account, and shut Telnet off.',
      steps: [
        'From ADMIN-PC\'s Command Prompt try telnet 10.40.0.1. It works, which is the problem.',
        'On the router: hostname LOC-R1 and ip domain-name harborpoint.local. The RSA key is named after both.',
        'crypto key generate rsa modulus 2048, then ip ssh version 2.',
        'Create an account: username netadmin secret (your choice). Set an enable secret too.',
        'line vty 0 15, then login local and transport input ssh. Add exec-timeout 10 0 while you are there.',
        'From ADMIN-PC: ssh -l netadmin 10.40.0.1 should work, and telnet 10.40.0.1 should be refused.',
        'Save the configuration.',
      ],
      start: {
        devices: {
          R1: R('Router', { 'Gi0/0': up('10.40.0.1', M24) }, { vty: { transport: ['telnet'], login: 'password', password: 'cisco' } }),
          SW1: SW('LOC-SW1'),
          ADM: PC('ADMIN-PC', '10.40.0.50', M24, '10.40.0.1'),
        },
        links: [['R1', 'Gi0/0', 'SW1', 'Gi0/1'], ['ADM', 'NIC', 'SW1', 'Fa0/1']],
        positions: { R1: { x: 380, y: 80 }, SW1: { x: 380, y: 220 }, ADM: { x: 380, y: 370 } },
      },
      checks: [
        { text: 'The router has its own hostname and a domain name', fn: (w) => !!D(w, 'R1').hostname && D(w, 'R1').hostname !== 'Router' && !!D(w, 'R1').domain },
        { text: 'RSA keys of at least 1024 bits, and SSH version 2', fn: (w) => (D(w, 'R1').rsa || 0) >= 1024 && D(w, 'R1').sshver === 2 },
        { text: 'A local user exists and the VTY lines use login local', fn: (w) => Object.keys(D(w, 'R1').users || {}).length > 0 && (D(w, 'R1').vty || {}).login === 'local' },
        { text: 'The VTY lines accept SSH only', fn: (w) => { const t = (D(w, 'R1').vty || {}).transport || []; return t.length === 1 && t[0] === 'ssh'; } },
        { text: 'ADMIN-PC can SSH in with the local account', fn: (w) => Object.keys(D(w, 'R1').users || {}).some((u) => TT.net.remoteLogin(w, 'ADM', '10.40.0.1', 'ssh', u).ok) },
        { text: 'Telnet to the router is refused', fn: (w) => !!w.devices.ADM && !TT.net.remoteLogin(w, 'ADM', '10.40.0.1', 'telnet').ok },
        { text: 'The configuration is saved', fn: (w) => { const c = savedCfg(w, 'R1'); return !!c && c.hostname === D(w, 'R1').hostname && c.hostname !== 'Router'; } },
      ],
      hints: [
        'crypto key generate rsa refuses to run until the hostname is not Router and a domain name is set.',
        'SSH version 2 needs a key of at least 768 bits. 2048 is the sensible choice today.',
        'transport input ssh replaces the list. login local makes the lines check the username database instead of a line password.',
      ],
      takeaway: 'SSH encrypts the whole management session; Telnet (TCP 23) sends it in clear text. SSH (TCP 22) on IOS needs a hostname, a domain name, RSA keys, and VTY lines set to login local and transport input ssh. Use version 2 only.',
      solution: {
        R1: ['enable', 'configure terminal', 'hostname LOC-R1', 'ip domain-name harborpoint.local', 'crypto key generate rsa modulus 2048', 'ip ssh version 2', 'username netadmin secret Dock$ide42', 'enable secret Harb0rNight!', 'line vty 0 15', 'login local', 'transport input ssh', 'exec-timeout 10 0', 'end', 'write memory'],
        ADM: ['ssh -l netadmin 10.40.0.1', 'telnet 10.40.0.1'],
      },
    },

    /* ------------------------------------------------------------------ 15 */
    {
      id: 'portsec',
      title: 'Lock the hot desk',
      day: 'Day 49',
      level: 'Core',
      minutes: 25,
      blueprint: ['5.7'],
      brief: 'The open port at the hot desk on the Canton office floor is a favorite of visiting vendors, who plug in whatever they brought. Allow only the desk PC on Fa0/5, prove it by plugging in a visitor laptop, then put things back.',
      steps: [
        'On HPL-FLOOR-SW: interface fa0/5, switchport mode access. Port security refuses ports that are still dynamic.',
        'switchport port-security maximum 1, switchport port-security mac-address sticky, switchport port-security violation shutdown, then switchport port-security to turn it on.',
        'Run show port-security interface fa0/5. PC-DESK\'s MAC is now the sticky address.',
        'Test it like an intruder: select PC-DESK\'s cable and delete it, then cable VISITOR-LT into Fa0/5. The light goes red: the port is err-disabled.',
        'Recover: delete the visitor\'s cable and cable PC-DESK back into Fa0/5. On the switch, interface fa0/5, shutdown, then no shutdown.',
        'Ping the printer (10.60.0.50) from PC-DESK, then save the configuration so the sticky MAC survives a reload.',
      ],
      start: {
        devices: {
          SW1: SW('HPL-FLOOR-SW'),
          DESK: PC('PC-DESK', '10.60.0.21', M24, '10.60.0.1'),
          PRN: PC('PRINTER', '10.60.0.50', M24, '10.60.0.1'),
          VIS: LAP('VISITOR-LT', '10.60.0.99', M24, '10.60.0.1'),
        },
        links: [['DESK', 'NIC', 'SW1', 'Fa0/5'], ['PRN', 'NIC', 'SW1', 'Fa0/6']],
        positions: { SW1: { x: 360, y: 120 }, DESK: { x: 220, y: 300 }, PRN: { x: 500, y: 300 }, VIS: { x: 640, y: 120 } },
      },
      checks: [
        { text: 'Fa0/5 is a static access port with port security on', fn: (w) => { const i = ifc(w, 'SW1', 'FastEthernet0/5'); return !!i.modeSet && i.mode === 'access' && !!(i.ps && i.ps.on); } },
        { text: 'It allows one MAC address and learns it sticky', fn: (w) => { const ps = ifc(w, 'SW1', 'FastEthernet0/5').ps || {}; return (ps.max || 1) === 1 && !!ps.sticky; } },
        { text: 'PC-DESK\'s MAC is the secure address on Fa0/5', fn: (w) => !!w.devices.DESK && ((ifc(w, 'SW1', 'FastEthernet0/5').ps || {}).macs || []).includes(TT.net.pcMac(w.devices.DESK)) },
        { text: 'The visitor laptop test tripped a violation', fn: (w) => ((ifc(w, 'SW1', 'FastEthernet0/5').ps || {}).violations || 0) >= 1 },
        { text: 'PC-DESK is back on a working Fa0/5 and reaches the printer', fn: (w) => { const p = peer(w, 'DESK', 'NIC'); return !!p && p[0] === 'SW1' && p[1] === 'FastEthernet0/5' && !ifc(w, 'SW1', 'FastEthernet0/5').errdis && ping(w, 'DESK', '10.60.0.50'); } },
        { text: 'The saved config holds the sticky MAC', fn: (w) => { const c = savedCfg(w, 'SW1'); const ps = c && c.interfaces['FastEthernet0/5'] && c.interfaces['FastEthernet0/5'].ps; return !!ps && !!w.devices.DESK && (ps.macs || []).includes(TT.net.pcMac(w.devices.DESK)); } },
      ],
      hints: [
        'switchport port-security is rejected on a dynamic port. Set switchport mode access first.',
        'Violation modes: shutdown err-disables the port (the default), restrict drops and logs, protect drops silently.',
        'An err-disabled port stays down until you run shutdown then no shutdown on it (or errdisable recovery is configured).',
      ],
      takeaway: 'Port security limits which MAC addresses may use an access port. Sticky learning writes the first MAC it sees into the running-config, so save to keep it. In the default shutdown mode a violation err-disables the port, and a shutdown and no shutdown brings it back once the intruder is gone.',
      solution: [
        ['SW1', ['enable', 'configure terminal', 'interface fa0/5', 'switchport mode access', 'switchport port-security maximum 1', 'switchport port-security mac-address sticky', 'switchport port-security violation shutdown', 'switchport port-security', 'end', 'show port-security interface fa0/5']],
        ['_build', ['uncable SW1 Fa0/5', 'cable VIS NIC SW1 Fa0/5']],
        ['_build', ['uncable SW1 Fa0/5', 'cable DESK NIC SW1 Fa0/5']],
        ['SW1', ['configure terminal', 'interface fa0/5', 'shutdown', 'no shutdown', 'end', 'write memory']],
        ['DESK', ['ping 10.60.0.50']],
      ],
    },
  ];

  TT.labProjects = projects;
  TT.labProjects.byId = Object.fromEntries(projects.map((p) => [p.id, p]));
})(typeof globalThis !== 'undefined' ? globalThis : window);
