/* Harbor Point Night Shift — Hardware lab.
 * Three activities: Cable it (pick the right cable), Port ID (clickable front panels),
 * and Know your gear (device family cards). The drawings are generic, not any vendor's artwork.
 */
(function (G) {
  'use strict';
  const TT = (G.TT = G.TT || {});

  /* ---------------- cables ---------------- */
  TT.cables = {
    console: { name: 'Console cable', detail: 'RJ45 or USB to the device\'s console port; serial to the laptop', color: '#2f7fd8', dash: '' },
    straight: { name: 'Straight-through UTP', detail: 'Cat5e or Cat6, both ends wired the same (T568B)', color: '#5b6b78', dash: '' },
    cross: { name: 'Crossover UTP', detail: 'Transmit and receive pairs swapped between ends', color: '#a86a00', dash: '8 4' },
    mmf: { name: 'Multimode fiber', detail: 'OM3 or OM4, LC connectors, short-reach optics (SR)', color: '#00a3a3', dash: '' },
    smf: { name: 'Single-mode fiber', detail: 'OS2, yellow jacket, LC connectors, long-reach optics (LR)', color: '#d1a400', dash: '' },
    dac: { name: 'Direct attach copper (DAC)', detail: 'Twinax with SFP+ ends built in, a few meters at most', color: '#7a4fd1', dash: '2 3' },
  };

  TT.cableTasks = [
    { a: 'laptop', b: 'router', q: 'A brand-new router has no configuration. Connect your laptop so you can do the first-time setup.', ans: 'console', why: 'With no IP address configured, the only way in is the console port. Use a rollover (RJ45-to-DB9 or RJ45-to-USB) cable or a USB console cable, and a terminal program at 9600 baud.' },
    { a: 'pc', b: 'switch', q: 'Connect a desk PC to a port on the access switch.', ans: 'straight', why: 'Unlike devices (host to switch) use a straight-through cable. The switch port\'s pinout already crosses the pairs internally.' },
    { a: 'router', b: 'switch', q: 'Connect the router\'s Gi0/0 to an access switch port.', ans: 'straight', why: 'A router is treated like a host here. Router to switch is an unlike pair, so straight-through.' },
    { a: 'switch', b: 'switch', q: 'Two older switches without Auto MDI-X need a copper link between them.', ans: 'cross', why: 'Like devices (switch to switch) need the transmit and receive pairs crossed. Modern gear with Auto MDI-X fixes this automatically, but the exam still asks.' },
    { a: 'pc', b: 'pc', q: 'Two PCs need a direct link with no switch, and their NICs do not support Auto MDI-X.', ans: 'cross', why: 'PC to PC is a like pair. Without Auto MDI-X you need a crossover cable.' },
    { a: 'switch', b: 'switch', q: 'Two switches sit in the same rack, 2 m apart, with 10G SFP+ ports. Pick the cheapest correct option.', ans: 'dac', why: 'For a few meters in the same rack, a direct attach copper cable is cheaper than two optics and a fiber patch cord.' },
    { a: 'switch', b: 'switch', q: 'Link the core switch to a distribution switch 250 m away in the same building at 10 Gbps.', ans: 'mmf', why: 'Copper UTP stops at 100 m. Within a building, multimode fiber with 10GBASE-SR optics reaches 300 m on OM3 and 400 m on OM4.' },
    { a: 'switch', b: 'switch', q: 'Connect two buildings on the same campus, 8 km apart.', ans: 'smf', why: 'Kilometers means single-mode fiber with long-reach optics. 10GBASE-LR reaches 10 km on OS2.' },
    { a: 'switch', b: 'ap', q: 'A ceiling access point needs data and power from one cable, 60 m from the switch.', ans: 'straight', why: 'Use straight-through Cat6 from a PoE switch port. PoE (802.3af, at or bt) carries power on the same pairs as data, within the 100 m limit.' },
    { a: 'switch', b: 'pc', q: 'A printer in a far corner of the warehouse is 130 m from the nearest switch. Which run will work?', ans: 'mmf', why: 'Any UTP run over 100 m is out of spec. Use fiber to a small switch nearby, or move a switch closer. Multimode fiber is the usual answer inside one building.' },
  ];

  /* ---------------- front panels ---------------- */
  // Each port: id, label, info, and a rect {x,y,w,h}
  function switchPanel() {
    const ports = [];
    // 24 RJ45: odd on the top row, even on the bottom, in groups of 12 (6 columns x 2 rows) like most access switches
    for (let i = 1; i <= 24; i++) {
      const col = Math.floor((i - 1) / 2);
      const group = Math.floor(col / 6);
      const x = 150 + col * 34 + group * 18;
      const y = i % 2 ? 42 : 80;
      ports.push({ id: 'Gi1/0/' + i, label: 'Gi1/0/' + i, kind: 'rj45', info: `Copper access port ${i} (Gi1/0/${i}). Odd numbers sit on the top row, even numbers on the bottom. Up to 1 Gbps over Cat5e or better, often with PoE.`, x, y, w: 28, h: 30 });
    }
    for (let i = 1; i <= 4; i++) {
      ports.push({ id: 'Te1/1/' + i, label: 'Te1/1/' + i, kind: 'sfp', info: `SFP+ uplink ${i} (Te1/1/${i}). Takes a 1G SFP or 10G SFP+ transceiver, or a DAC cable. Used to connect up to distribution or core.`, x: 588 + (i - 1) * 36, y: 58, w: 30, h: 22 });
    }
    ports.push({ id: 'console', label: 'Console (RJ45)', kind: 'console', info: 'The RJ45 console port. Out-of-band access to the CLI with a rollover or console cable, even when the switch has no IP configuration.', x: 60, y: 42, w: 28, h: 30 });
    ports.push({ id: 'usbcon', label: 'USB console', kind: 'usb', info: 'USB console port (mini-B or USB-C). The same CLI access as the RJ45 console, using a normal USB cable and a driver on the laptop. If both are connected, the USB console wins.', x: 64, y: 82, w: 20, h: 12 });
    ports.push({ id: 'mgmt', label: 'Management port', kind: 'rj45', info: 'Dedicated Ethernet management port (Gi0/0 on many models). It lives in a separate management VRF, so you can reach the switch even if the data ports are down.', x: 100, y: 42, w: 28, h: 30 });
    ports.push({ id: 'mode', label: 'Mode button', kind: 'button', info: 'Mode button. Cycles the port LEDs between status, speed, duplex and PoE views. Holding it during boot starts password recovery on many models.', x: 22, y: 84, w: 18, h: 12 });
    ports.push({ id: 'leds', label: 'System LEDs', kind: 'led', info: 'System and status LEDs. Green system light = booted and healthy; amber = a fault or POST failure.', x: 18, y: 40, w: 26, h: 30 });
    return { title: '24-port access switch (front)', width: 760, height: 130, ports };
  }
  function routerPanel() {
    const ports = [
      { id: 'Gi0/0/0', label: 'Gi0/0/0', kind: 'rj45', info: 'Built-in WAN or LAN port Gi0/0/0 (slot/subslot/port). Copper RJ45, usually the link to the ISP or the internal switch.', x: 300, y: 54, w: 28, h: 30 },
      { id: 'Gi0/0/1', label: 'Gi0/0/1', kind: 'rj45', info: 'Built-in port Gi0/0/1. Router interfaces start shut down until you configure no shutdown.', x: 336, y: 54, w: 28, h: 30 },
      { id: 'sfp', label: 'SFP port', kind: 'sfp', info: 'SFP port for a fiber or copper transceiver. On many branch routers it shares a port number with an RJ45 port, and only one of the pair can be active (media-type).', x: 376, y: 58, w: 30, h: 22 },
      { id: 'console', label: 'Console (RJ45)', kind: 'console', info: 'Console port for out-of-band CLI access with a rollover cable at 9600 baud, 8 data bits, no parity, 1 stop bit.', x: 470, y: 54, w: 28, h: 30 },
      { id: 'aux', label: 'AUX port', kind: 'rj45', info: 'Auxiliary port. Historically for a dial-up modem for remote out-of-band access. Rarely used today, but you may see it on the exam.', x: 506, y: 54, w: 28, h: 30 },
      { id: 'usbcon', label: 'USB console', kind: 'usb', info: 'USB console port (mini-B). Same CLI access as the RJ45 console.', x: 546, y: 64, w: 20, h: 12 },
      { id: 'usb', label: 'USB storage', kind: 'usb', info: 'USB Type-A port for a flash drive: copy IOS images or configurations on and off the router.', x: 576, y: 62, w: 24, h: 14 },
      { id: 'nim1', label: 'NIM slot 1', kind: 'slot', info: 'Network Interface Module slot. Add more interfaces later: extra Ethernet ports, serial WAN, LTE, voice. The router you buy today can grow.', x: 40, y: 34, w: 110, h: 34 },
      { id: 'nim2', label: 'NIM slot 2', kind: 'slot', info: 'A second Network Interface Module slot. Modules in slot 0/1 become interfaces like Gi0/1/0.', x: 160, y: 34, w: 110, h: 34 },
      { id: 'power', label: 'Power switch', kind: 'button', info: 'Power switch and inlet. Enterprise routers and switches often take two power supplies for redundancy.', x: 690, y: 50, w: 30, h: 36 },
    ];
    return { title: 'Branch router (rear)', width: 760, height: 130, ports };
  }
  TT.panels = { switch: switchPanel(), router: routerPanel() };

  /* ---------------- gear cards ---------------- */
  TT.gear = [
    { name: 'Access switch', role: 'Where users plug in', facts: ['24 or 48 copper ports plus 2 to 8 SFP or SFP+ uplinks', 'PoE for phones, cameras and access points', 'Usually Layer 2; uplinks trunk to distribution', 'Examples: Cisco Catalyst 9200 and 9300, older Catalyst 2960-X'], ccna: 'Port security, VLANs, PortFast, BPDU Guard and DHCP snooping are all configured here.' },
    { name: 'Distribution and core switches', role: 'Aggregate the access layer and route between VLANs', facts: ['Dense 10, 25, 40 and 100 Gbps fiber ports', 'Layer 3: SVIs and routing protocols like OSPF', 'Redundant power supplies and supervisors', 'Examples: Cisco Catalyst 9400 and 9500'], ccna: 'Two-tier (collapsed core) versus three-tier campus design is an exam topic.' },
    { name: 'Router', role: 'Connects networks and the WAN', facts: ['Routes between subnets and toward the internet', 'Interfaces named slot/subslot/port, like Gi0/0/1', 'Modular slots (NIMs) for more ports, LTE or serial', 'Examples: Cisco ISR 1000 and 4000, Catalyst 8200 and 8300'], ccna: 'Every ticket in this game with a router uses the same IOS commands you would type on these.' },
    { name: 'Firewall', role: 'Stateful security between zones', facts: ['Tracks connections and allows return traffic automatically', 'Inside, outside and DMZ zones', 'Next-generation models add application control and intrusion prevention', 'Examples: Cisco Secure Firewall, older ASA'], ccna: 'Know how a stateful firewall differs from an ACL, which is stateless.' },
    { name: 'Wireless LAN controller and APs', role: 'Run enterprise Wi-Fi centrally', facts: ['Lightweight APs tunnel to the WLC over CAPWAP (UDP 5246 and 5247)', 'The WLC handles roaming, security and RF tuning', 'APs are powered by PoE from the access switch', 'Examples: Cisco Catalyst 9800 WLC, Catalyst 9100 APs'], ccna: 'Expect questions on AP modes (local, FlexConnect, monitor) and WLC ports versus interfaces.' },
    { name: 'Transceivers (SFP family)', role: 'Turn a port into fiber or copper', facts: ['SFP = 1 Gbps, SFP+ = 10 Gbps, SFP28 = 25 Gbps, QSFP = 40 or 100 Gbps', 'SR = short reach on multimode; LR = long reach on single-mode', 'Both ends of a fiber link need matching optics', 'DAC cables have the transceivers built in'], ccna: 'Fiber types and reach show up in the physical-layer questions.' },
    { name: 'Copper cabling', role: 'Most links in the building', facts: ['Cat5e: 1 Gbps; Cat6: 1 Gbps (10 Gbps to 55 m); Cat6a: 10 Gbps to 100 m', '100 m channel limit: 90 m horizontal run plus 10 m of patch cords', 'RJ45 connectors wired T568A or T568B', 'Auto MDI-X makes straight versus crossover mostly invisible'], ccna: 'Know when you need straight-through versus crossover, and the 100 m limit.' },
    { name: 'Power over Ethernet', role: 'Power and data on one cable', facts: ['802.3af (PoE): 15.4 W per port at the switch', '802.3at (PoE+): 30 W', '802.3bt: 60 W (Type 3) and 90 W (Type 4)', 'The switch has a total PoE budget shared by all ports'], ccna: 'PoE is listed in the exam\'s network access topics.' },
    { name: 'The rack', role: 'Where it all lives', facts: ['Standard 19-inch racks; 1U = 1.75 inches of height', 'Patch panels terminate the building\'s cable runs', 'Cable managers and labeled patch cords save hours in an outage', 'PDUs feed power; dual power supplies go to separate circuits'], ccna: 'Not heavily tested, but day one on the job.' },
  ];

  /* ======================================================================
   * Rendering
   * ====================================================================== */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let state = { tab: 'cable', i: 0, score: 0, answered: null, order: null, panel: 'switch', quiz: false, target: null, found: 0, tries: 0, picked: null };

  function devIcon(kind, x, y, label) {
    const g = {
      laptop: `<rect x="-24" y="-16" width="48" height="30" rx="3" fill="var(--sheet)" stroke="var(--ink)" stroke-width="1.6"/><path d="M-30 16h60" stroke="var(--ink)" stroke-width="2.4"/>`,
      pc: `<rect x="-20" y="-17" width="40" height="27" rx="3" fill="var(--sheet)" stroke="var(--ink)" stroke-width="1.6"/><path d="M-8 17h16M0 10v7" stroke="var(--ink)" stroke-width="1.6"/>`,
      router: `<circle r="21" fill="var(--sheet)" stroke="var(--ink)" stroke-width="1.6"/><path d="M-11 0h22M0 -11v22" stroke="var(--ink)" stroke-width="1.6"/>`,
      switch: `<rect x="-30" y="-15" width="60" height="30" rx="6" fill="var(--sheet)" stroke="var(--ink)" stroke-width="1.6"/><path d="M-16 -4h30m-5 -4 5 4-5 4M16 5h-30m5 -4-5 4 5 4" fill="none" stroke="var(--ink)" stroke-width="1.5"/>`,
      ap: `<ellipse rx="26" ry="11" fill="var(--sheet)" stroke="var(--ink)" stroke-width="1.6"/><circle r="3" fill="var(--ink)"/>`,
    }[kind];
    return `<g transform="translate(${x} ${y})">${g}<text y="38" text-anchor="middle" font-size="12" font-weight="600" fill="var(--ink)">${esc(label)}</text></g>`;
  }
  const NAMES = { laptop: 'Laptop', pc: 'PC', router: 'Router', switch: 'Switch', ap: 'Access point' };

  function renderCable(root) {
    const main = root.parentElement;
    if (!state.order) state.order = TT.cableTasks.map((_, k) => k);
    if (state.i >= state.order.length) {
      root.innerHTML = `<div class="sheet quiz"><p class="label">Cable it</p><div class="score">${state.score} / ${state.order.length}</div>
        <p>${state.score === state.order.length ? 'Every link cabled right. You would pass the physical-layer questions.' : 'Review the explanations, then run it again.'}</p>
        <div class="tools"><button class="btn primary" type="button" id="cAgain">Run it again</button></div></div>`;
      root.querySelector('#cAgain').addEventListener('click', () => { state.i = 0; state.score = 0; state.answered = null; render(main); });
      return;
    }
    const t = TT.cableTasks[state.order[state.i]];
    const chosen = state.answered ? TT.cables[state.answered] : null;
    const correct = state.answered === t.ans;
    const line = chosen ? `<line x1="150" y1="70" x2="530" y2="70" stroke="${chosen.color}" stroke-width="5" stroke-dasharray="${chosen.dash}" stroke-linecap="round"/>` : `<line x1="150" y1="70" x2="530" y2="70" stroke="var(--line)" stroke-width="2" stroke-dasharray="3 6"/>`;
    root.innerHTML = `
      <div class="sheet quiz" style="max-width:820px">
        <div class="qnum">Cable it · ${state.i + 1} of ${state.order.length} · Score ${state.score}</div>
        <div class="bar"><i style="width:${(state.i / state.order.length) * 100}%"></i></div>
        <p class="qtext">${esc(t.q)}</p>
        <div class="topo" style="margin-bottom:14px"><svg viewBox="0 0 680 130" role="img" aria-label="${esc(NAMES[t.a])} to ${esc(NAMES[t.b])}">${line}${devIcon(t.a, 110, 70, NAMES[t.a])}${devIcon(t.b, 570, 70, NAMES[t.b])}${chosen ? `<text x="340" y="56" text-anchor="middle" font-size="12" fill="var(--muted)">${esc(chosen.name)}</text>` : ''}</svg></div>
        <div class="opts">${Object.entries(TT.cables).map(([k, c], n) => `
          <button class="opt ${state.answered ? (k === t.ans ? 'right' : k === state.answered ? 'wrong' : '') : ''}" type="button" data-c="${k}" ${state.answered ? 'disabled' : ''}>
            <span class="k"><svg width="22" height="10" aria-hidden="true"><line x1="1" y1="5" x2="21" y2="5" stroke="${c.color}" stroke-width="4" stroke-dasharray="${c.dash}" stroke-linecap="round"/></svg></span>
            <span><b style="font-weight:600">${esc(c.name)}</b><br><span style="font-size:13px;color:var(--muted)">${esc(c.detail)}</span></span>
          </button>`).join('')}</div>
        ${state.answered ? `<div class="why"><b style="color:var(${correct ? '--good' : '--stamp'})">${correct ? 'Correct.' : 'Not quite.'}</b> ${esc(t.why)}
          <div class="tools"><button class="btn primary" type="button" id="cNext">${state.i + 1 < state.order.length ? 'Next connection' : 'See results'}</button></div></div>` : ''}
      </div>`;
    root.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => {
      state.answered = b.dataset.c;
      if (state.answered === t.ans) state.score++;
      render(main);
      const n = main.querySelector('#cNext');
      if (n) n.focus();
    }));
    const n = root.querySelector('#cNext');
    if (n) n.addEventListener('click', () => { state.i++; state.answered = null; render(main); });
  }

  function portShape(p) {
    const base = `x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}"`;
    switch (p.kind) {
      case 'rj45':
        return `<rect ${base} rx="2" fill="#0f1922" stroke="var(--ink)" stroke-width="1"/><rect x="${p.x + 8}" y="${p.y + p.h - 9}" width="${p.w - 16}" height="6" fill="#3a4a58"/>`;
      case 'console':
        return `<rect ${base} rx="2" fill="#0f1922" stroke="#2f7fd8" stroke-width="2.4"/><rect x="${p.x + 8}" y="${p.y + p.h - 9}" width="${p.w - 16}" height="6" fill="#3a4a58"/>`;
      case 'sfp':
        return `<rect ${base} rx="2" fill="#26323c" stroke="var(--ink)" stroke-width="1"/><rect x="${p.x + 3}" y="${p.y + 4}" width="${p.w - 6}" height="${p.h - 8}" fill="#0f1922"/>`;
      case 'usb':
        return `<rect ${base} rx="2" fill="#26323c" stroke="var(--ink)" stroke-width="1"/>`;
      case 'slot':
        return `<rect ${base} rx="3" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.2" stroke-dasharray="4 3"/>`;
      case 'led':
        return `<rect ${base} rx="3" fill="transparent" stroke="transparent"/><circle cx="${p.x + 6}" cy="${p.y + 8}" r="3.5" fill="#2bb673"/><circle cx="${p.x + 6}" cy="${p.y + 20}" r="3.5" fill="#2bb673"/><circle cx="${p.x + 18}" cy="${p.y + 8}" r="3.5" fill="#d9a21b"/><circle cx="${p.x + 18}" cy="${p.y + 20}" r="3.5" fill="#2bb673"/>`;
      default:
        return `<rect ${base} rx="4" fill="#26323c" stroke="var(--ink)" stroke-width="1"/>`;
    }
  }

  function newTarget(panel) {
    const pool = panel.ports;
    let p;
    do { p = pool[Math.floor(Math.random() * pool.length)]; } while (state.target && p.id === state.target.id && pool.length > 1);
    state.target = p;
    state.tries = 0;
  }

  function renderPorts(root) {
    const main = root.parentElement;
    const panel = TT.panels[state.panel];
    if (state.quiz && !state.target) newTarget(panel);
    const picked = state.picked && panel.ports.find((p) => p.id === state.picked);
    const labels = state.panel === 'switch'
      ? `<text x="150" y="30" font-size="10" fill="var(--muted)" font-family="var(--mono)">1 3 5 ...</text><text x="150" y="124" font-size="10" fill="var(--muted)" font-family="var(--mono)">2 4 6 ...</text><text x="588" y="46" font-size="10" fill="var(--muted)" font-family="var(--mono)">UPLINKS</text><text x="60" y="30" font-size="10" fill="#2f7fd8" font-family="var(--mono)">CON</text><text x="100" y="30" font-size="10" fill="var(--muted)" font-family="var(--mono)">MGMT</text>`
      : `<text x="470" y="44" font-size="10" fill="#2f7fd8" font-family="var(--mono)">CON</text><text x="506" y="44" font-size="10" fill="var(--muted)" font-family="var(--mono)">AUX</text><text x="300" y="44" font-size="10" fill="var(--muted)" font-family="var(--mono)">GE 0/0/0  0/0/1</text><text x="40" y="84" font-size="10" fill="var(--muted)" font-family="var(--mono)">NIM 1</text><text x="160" y="84" font-size="10" fill="var(--muted)" font-family="var(--mono)">NIM 2</text>`;
    root.innerHTML = `
      <div class="sheet" style="max-width:900px">
        <div class="guide-top" style="margin-bottom:10px">
          <div class="seg" role="group" aria-label="Device">
            <button type="button" data-p="switch" aria-pressed="${state.panel === 'switch'}">Access switch</button>
            <button type="button" data-p="router" aria-pressed="${state.panel === 'router'}">Branch router</button>
          </div>
          <div class="seg" role="group" aria-label="Mode">
            <button type="button" data-m="explore" aria-pressed="${!state.quiz}">Explore</button>
            <button type="button" data-m="quiz" aria-pressed="${state.quiz}">Find the port</button>
          </div>
        </div>
        <p class="qtext" style="margin:4px 0 10px">${state.quiz ? `Click: <span style="color:var(--accent)">${esc(state.target.label)}</span> <span class="qnum">found ${state.found}</span>` : 'Click any port, slot or light to see what it is for.'}</p>
        <div class="topo"><svg viewBox="0 0 ${panel.width} ${panel.height}" role="img" aria-label="${esc(panel.title)}" style="min-width:640px">
          <rect x="6" y="14" width="${panel.width - 12}" height="${panel.height - 20}" rx="8" fill="#c9d2d8" stroke="var(--ink)" stroke-width="1.4"/>
          <rect x="6" y="14" width="${panel.width - 12}" height="${panel.height - 20}" rx="8" fill="var(--sheet)" opacity="0.55"/>
          ${labels}
          ${panel.ports.map((p) => `<g class="hw" data-port="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(p.label)}" style="cursor:pointer">${portShape(p)}${state.picked === p.id ? `<rect x="${p.x - 3}" y="${p.y - 3}" width="${p.w + 6}" height="${p.h + 6}" rx="4" fill="none" stroke="var(--accent)" stroke-width="2.5"/>` : ''}</g>`).join('')}
        </svg></div>
        <p class="qnum" style="margin-top:6px">${esc(panel.title)}. Generic drawing; real models vary.</p>
        <div id="portInfo" class="why" style="min-height:3em">${picked ? `<b>${esc(picked.label)}.</b> ${esc(picked.info)}` : ''}</div>
      </div>`;
    root.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { state.panel = b.dataset.p; state.target = null; state.picked = null; render(main); }));
    root.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { state.quiz = b.dataset.m === 'quiz'; state.target = null; state.picked = null; state.found = 0; render(main); }));
    const pick = (id) => {
      const p = panel.ports.find((x) => x.id === id);
      if (state.quiz) {
        if (id === state.target.id) {
          state.found++;
          state.picked = id;
          const prev = state.target;
          newTarget(panel);
          render(main);
          main.querySelector('#portInfo').innerHTML = `<b style="color:var(--good)">Found it.</b> <b>${esc(prev.label)}.</b> ${esc(prev.info)}`;
        } else {
          state.tries++;
          state.picked = id;
          render(main);
          main.querySelector('#portInfo').innerHTML = `<b style="color:var(--stamp)">That is ${esc(p.label)}.</b> Look again for ${esc(state.target.label)}.${state.tries >= 2 && /^Gi1\/0\//.test(state.target.id) ? ' Tip: odd-numbered ports are on the top row.' : ''}`;
        }
      } else {
        state.picked = id;
        render(main);
      }
    };
    root.querySelectorAll('.hw').forEach((g) => {
      g.addEventListener('click', () => pick(g.dataset.port));
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(g.dataset.port); } });
    });
  }

  function renderGear(root) {
    root.innerHTML = `<div class="cards">${TT.gear.map((g) => `
      <article class="card">
        <h3>${esc(g.name)}</h3>
        <div class="tags"><span class="pill topic">${esc(g.role)}</span></div>
        <ul>${g.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
        <div class="trap" style="border-left-color:var(--accent)"><b style="color:var(--accent)">For the CCNA</b>${esc(g.ccna)}</div>
      </article>`).join('')}</div>`;
  }

  function render(main, tab) {
    if (tab && ['cable', 'ports', 'gear', 'wlc'].includes(tab)) state.tab = tab;
    main.innerHTML = `
      <div class="guide-top">
        <div class="chips" role="tablist" aria-label="Hardware lab">
          <button class="chip" type="button" data-t="cable" aria-pressed="${state.tab === 'cable'}">Cable it</button>
          <button class="chip" type="button" data-t="ports" aria-pressed="${state.tab === 'ports'}">Port ID</button>
          <button class="chip" type="button" data-t="gear" aria-pressed="${state.tab === 'gear'}">Know your gear</button>
          <button class="chip" type="button" data-t="wlc" aria-pressed="${state.tab === 'wlc'}">WLC GUI</button>
        </div>
      </div>
      <div id="hwBody"></div>`;
    main.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { state.tab = b.dataset.t; render(main); }));
    const body = main.querySelector('#hwBody');
    ({ cable: renderCable, ports: renderPorts, gear: renderGear, wlc: (b) => TT.renderWlc(b) })[state.tab](body);
  }

  TT.renderHardware = render;
})(typeof globalThis !== 'undefined' ? globalThis : window);
