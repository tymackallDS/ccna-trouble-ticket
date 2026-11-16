/* Harbor Point Night Shift — Wireless LAN controller GUI lab.
 * A generic controller web interface laid out like the one the CCNA exam shows in its screenshots
 * (exam topics 2.9 and 5.10). The learner creates WLANs, picks the dynamic interface,
 * sets WPA2-PSK or 802.1X, the QoS profile and advanced options, then checks the task.
 */
(function (G) {
  'use strict';
  const TT = (G.TT = G.TT || {});
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const IFACES = [
    { name: 'management', vlan: 1, ip: '10.1.1.5' },
    { name: 'staff-vlan20', vlan: 20, ip: '10.20.0.5' },
    { name: 'guest-vlan30', vlan: 30, ip: '10.30.0.5' },
    { name: 'voice-vlan40', vlan: 40, ip: '10.40.0.5' },
  ];
  const QOS = [
    ['platinum', 'Platinum (voice)'],
    ['gold', 'Gold (video)'],
    ['silver', 'Silver (best effort)'],
    ['bronze', 'Bronze (background)'],
  ];

  const newWlan = (id, profile, ssid) => ({
    id, profile, ssid, enabled: false, radio: 'all', iface: 'management', broadcast: true,
    l2: 'wpa2', wpa: false, wpa2: true, aes: true, tkip: false, akm8021x: true, akmPsk: false, pskFormat: 'ascii', psk: '',
    radius: '', qos: 'silver', aaaOverride: false, sessionTimeout: 1800, dhcpRequired: false, peerBlocking: false, flexLocal: false,
  });

  const TASKS = [
    {
      id: 'staff',
      title: 'Task 1: the staff WLAN',
      brief: 'Warehouse handhelds need a new network. Create WLAN ID 2 with profile and SSID HPL-STAFF on interface staff-vlan20. Secure it with WPA2 only, AES, and a pre-shared key of at least 8 characters. Best-effort QoS. Turn it on.',
      check: (s) => {
        const w = s.wlans.find((x) => x.ssid === 'HPL-STAFF');
        const fails = [];
        if (!w) return ['No WLAN with SSID HPL-STAFF exists yet. WLANs, then Create New, then Go.'];
        if (w.id !== 2) fails.push('The WLAN ID should be 2.');
        if (w.profile !== 'HPL-STAFF') fails.push('Profile name should also be HPL-STAFF.');
        if (!w.enabled) fails.push('Status is not Enabled (General tab).');
        if (w.iface !== 'staff-vlan20') fails.push('Interface should be staff-vlan20, which maps the WLAN to VLAN 20.');
        if (w.l2 !== 'wpa2' || !w.wpa2 || w.wpa) fails.push('Layer 2 security should be WPA+WPA2 with only the WPA2 policy checked.');
        if (!w.aes || w.tkip) fails.push('WPA2 encryption should be AES only. TKIP is the older WPA cipher.');
        if (!w.akmPsk || w.akm8021x) fails.push('Authentication key management should be PSK, not 802.1X. 802.1X needs a RADIUS server.');
        if (w.psk.length < 8 || w.psk.length > 63) fails.push('An ASCII pre-shared key must be 8 to 63 characters.');
        if (w.qos !== 'silver') fails.push('QoS should be Silver (best effort).');
        return fails;
      },
    },
    {
      id: 'guest',
      title: 'Task 2: the lobby guest WLAN',
      brief: 'Visitors in the lobby get internet only. Create WLAN ID 3, profile and SSID HPL-GUEST on guest-vlan30, WPA2 PSK with AES, Bronze QoS, and stop guests from talking to each other (peer-to-peer blocking). Enable it.',
      check: (s) => {
        const w = s.wlans.find((x) => x.ssid === 'HPL-GUEST');
        const fails = [];
        if (!w) return ['No WLAN with SSID HPL-GUEST exists yet.'];
        if (w.id !== 3) fails.push('The WLAN ID should be 3.');
        if (!w.enabled) fails.push('Status is not Enabled.');
        if (w.iface !== 'guest-vlan30') fails.push('Interface should be guest-vlan30.');
        if (w.l2 !== 'wpa2' || !w.wpa2 || w.wpa || !w.aes || w.tkip || !w.akmPsk || w.akm8021x) fails.push('Security should be WPA2, AES, PSK.');
        if (w.psk.length < 8) fails.push('Set a pre-shared key of at least 8 characters.');
        if (w.qos !== 'bronze') fails.push('QoS should be Bronze (background).');
        if (!w.peerBlocking) fails.push('Turn on peer-to-peer blocking (Advanced tab).');
        return fails;
      },
    },
    {
      id: 'voice',
      title: 'Task 3: Wi-Fi calling for the supervisors',
      brief: 'Supervisors use Wi-Fi phones. Create WLAN ID 4, profile and SSID HPL-VOICE on voice-vlan40, WPA2 with AES and 802.1X (enterprise) authentication against the RADIUS server 10.1.1.20 (Security, AAA Servers). Platinum QoS. Enable it.',
      check: (s) => {
        const w = s.wlans.find((x) => x.ssid === 'HPL-VOICE');
        const fails = [];
        if (!w) return ['No WLAN with SSID HPL-VOICE exists yet.'];
        if (w.id !== 4) fails.push('The WLAN ID should be 4.');
        if (!w.enabled) fails.push('Status is not Enabled.');
        if (w.iface !== 'voice-vlan40') fails.push('Interface should be voice-vlan40.');
        if (w.l2 !== 'wpa2' || !w.wpa2 || w.wpa || !w.aes || w.tkip) fails.push('Use WPA2 with AES only.');
        if (!w.akm8021x || w.akmPsk) fails.push('Authentication key management should be 802.1X (enterprise), not PSK.');
        if (w.radius !== '10.1.1.20') fails.push('Point the WLAN at RADIUS server 10.1.1.20 (Security tab, AAA Servers).');
        if (w.qos !== 'platinum') fails.push('Voice belongs in Platinum QoS.');
        return fails;
      },
    },
  ];

  const READ_QS = [
    ['On this controller, which setting decides the VLAN a wireless client lands in?', ['The SSID name', 'The WLAN\'s interface (dynamic interface) on the General tab', 'The QoS profile', 'The radio policy'], 1, 'Each WLAN is mapped to a controller interface, and each dynamic interface belongs to one VLAN.'],
    ['A WLAN shows Layer 2 Security "WPA+WPA2" with the 802.1X box checked under Authentication Key Management. What else must exist for clients to connect?', ['A pre-shared key', 'A RADIUS server', 'A DHCP pool on the controller', 'A TFTP server'], 1, '802.1X (WPA2-Enterprise) authenticates each user against a RADIUS server, configured under AAA Servers.'],
    ['Which QoS profile should a WLAN for voice handsets use?', ['Bronze', 'Silver', 'Gold', 'Platinum'], 3, 'Platinum is for voice, Gold for video, Silver for best effort (the default) and Bronze for background traffic.'],
    ['What is the valid length of an ASCII WPA2 pre-shared key?', ['4 to 32 characters', '8 to 63 characters', '12 to 128 characters', 'Exactly 64 characters'], 1, 'ASCII passphrases are 8 to 63 characters. A raw HEX key is exactly 64 hex digits.'],
  ];

  let st = load();
  function load() {
    try { const x = JSON.parse(localStorage.getItem('trouble-ticket-wlc-v1')); if (x && x.wlans) return x; } catch (e) { /* storage blocked */ }
    return { wlans: [newWlan(1, 'HPL-CORP', 'HPL-CORP')], page: 'wlans', edit: null, tab: 'general', task: 'staff', done: {}, msg: null };
  }
  function save() { try { localStorage.setItem('trouble-ticket-wlc-v1', JSON.stringify(st)); } catch (e) { /* ignore */ } }
  st.wlans[0].enabled = true;

  function render(root) {
    const task = TASKS.find((t) => t.id === st.task) || TASKS[0];
    root.innerHTML = `
      <div class="wl-wrap">
        <section class="wl-tasks" aria-label="WLC tasks">
          <p class="label">Wireless controller lab</p>
          <div class="chips" role="group" aria-label="Choose a task">
            ${TASKS.map((t) => `<button class="chip" type="button" data-task="${t.id}" aria-pressed="${t.id === task.id}">${st.done[t.id] ? '✓ ' : ''}${esc(t.title.split(':')[0])}</button>`).join('')}
            <button class="chip" type="button" data-task="read" aria-pressed="${st.task === 'read'}">Read the screen</button>
          </div>
          ${st.task === 'read' ? readQuiz() : `<h3 style="margin:10px 0 4px">${esc(task.title)}</h3><p class="wl-brief">${esc(task.brief)}</p>
          <div class="tools"><button class="btn primary" type="button" id="wlCheck">Check my work</button> <button class="btn quiet" type="button" id="wlReset">Reset controller</button></div>
          <div id="wlFb" class="wl-fb" role="status">${st.msg || ''}</div>`}
        </section>
        <section class="wl-gui" aria-label="Controller web interface">
          <div class="wl-bar"><span class="wl-brand">WLC-HPL-1</span>
            ${['MONITOR', 'WLANs', 'CONTROLLER', 'WIRELESS', 'SECURITY', 'MANAGEMENT'].map((m) => `<button type="button" class="wl-menu" data-menu="${m}" aria-current="${(m === 'WLANs') === (st.page !== 'other')}">${m}</button>`).join('')}
            <span class="wl-save">Save Configuration | Logout</span></div>
          <div class="wl-page">${page()}</div>
        </section>
      </div>`;
    wire(root);
  }

  function page() {
    if (st.page === 'other') return '<p class="wl-note">This lab only covers the WLANs menu, which is where the CCNA exam screenshots live. Click WLANs.</p>';
    if (st.page === 'new') {
      return `<h4 class="wl-h">WLANs &gt; New</h4>
        <div class="wl-form">
          <label>Type <select id="nType"><option>WLAN</option></select></label>
          <label>Profile Name <input id="nProf" maxlength="32" autocomplete="off"></label>
          <label>SSID <input id="nSsid" maxlength="32" autocomplete="off"></label>
          <label>ID <select id="nId">${Array.from({ length: 16 }, (_, k) => k + 1).filter((n) => !st.wlans.some((w) => w.id === n)).map((n) => `<option>${n}</option>`).join('')}</select></label>
        </div>
        <div class="wl-actions"><button type="button" class="wl-btn" id="nBack">&lt; Back</button><button type="button" class="wl-btn primary" id="nApply">Apply</button></div>`;
    }
    if (st.page === 'edit') return editPage(st.wlans.find((w) => w.id === st.edit));
    return `<h4 class="wl-h">WLANs</h4>
      <div class="wl-actions"><select aria-label="Action"><option>Create New</option></select><button type="button" class="wl-btn" id="goNew">Go</button></div>
      <div class="wl-tablewrap"><table class="wl-table"><thead><tr><th>WLAN ID</th><th>Type</th><th>Profile Name</th><th>WLAN SSID</th><th>Admin Status</th><th>Security Policies</th></tr></thead><tbody>
      ${st.wlans.sort((a, b) => a.id - b.id).map((w) => `<tr><td><button type="button" class="wl-link" data-edit="${w.id}">${w.id}</button></td><td>WLAN</td><td><button type="button" class="wl-link" data-edit="${w.id}">${esc(w.profile)}</button></td><td>${esc(w.ssid)}</td><td>${w.enabled ? 'Enabled' : 'Disabled'}</td><td>${esc(policyText(w))}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
  function policyText(w) {
    if (w.l2 === 'none') return 'None';
    const p = [];
    if (w.wpa2) p.push('[WPA2]'); if (w.wpa) p.push('[WPA]');
    const a = []; if (w.akm8021x) a.push('802.1X'); if (w.akmPsk) a.push('PSK');
    return p.join('') + (a.length ? `[Auth(${a.join(' + ')})]` : '');
  }
  const cb = (id, on, label) => `<label class="wl-cb"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}> ${label}</label>`;
  function editPage(w) {
    if (!w) { st.page = 'wlans'; return page(); }
    const tabs = [['general', 'General'], ['security', 'Security'], ['qos', 'QoS'], ['advanced', 'Advanced']];
    let body = '';
    if (st.tab === 'general') {
      body = `<div class="wl-form">
        <div class="wl-row"><span>Profile Name</span><span>${esc(w.profile)}</span></div>
        <div class="wl-row"><span>Type</span><span>WLAN</span></div>
        <label>SSID <input id="eSsid" value="${esc(w.ssid)}" maxlength="32"></label>
        <div class="wl-row"><span>Status</span>${cb('eEn', w.enabled, 'Enabled')}</div>
        <div class="wl-row"><span>Security Policies</span><span>${esc(policyText(w))}<br><small>(Modifications done under the Security tab will appear after applying the changes.)</small></span></div>
        <label>Radio Policy <select id="eRadio">${[['all', 'All'], ['a', '802.11a only'], ['bg', '802.11b/g only'], ['g', '802.11g only']].map(([v, l]) => `<option value="${v}" ${w.radio === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Interface/Interface Group(G) <select id="eIf">${IFACES.map((i) => `<option value="${i.name}" ${w.iface === i.name ? 'selected' : ''}>${i.name}</option>`).join('')}</select></label>
        <div class="wl-row"><span>Broadcast SSID</span>${cb('eBc', w.broadcast, 'Enabled')}</div>
      </div>`;
    } else if (st.tab === 'security') {
      const sub = st.sub || 'l2';
      body = `<div class="wl-subtabs">${[['l2', 'Layer 2'], ['l3', 'Layer 3'], ['aaa', 'AAA Servers']].map(([k, l]) => `<button type="button" class="wl-subtab" data-sub="${k}" aria-pressed="${sub === k}">${l}</button>`).join('')}</div>`;
      if (sub === 'l2') {
        body += `<div class="wl-form">
          <label>Layer 2 Security <select id="eL2"><option value="none" ${w.l2 === 'none' ? 'selected' : ''}>None</option><option value="wpa2" ${w.l2 === 'wpa2' ? 'selected' : ''}>WPA+WPA2</option><option value="wep" ${w.l2 === 'wep' ? 'selected' : ''}>Static WEP</option></select></label>
          ${w.l2 === 'wpa2' ? `<fieldset class="wl-fs"><legend>WPA+WPA2 Parameters</legend>
            ${cb('eWpa', w.wpa, 'WPA Policy')} ${cb('eWpa2', w.wpa2, 'WPA2 Policy')}
            <div class="wl-row"><span>WPA2 Encryption</span><span>${cb('eAes', w.aes, 'AES')} ${cb('eTkip', w.tkip, 'TKIP')}</span></div>
          </fieldset>
          <fieldset class="wl-fs"><legend>Authentication Key Management</legend>
            ${cb('e8021x', w.akm8021x, '802.1X')} ${cb('ePsk', w.akmPsk, 'PSK')}
            ${w.akmPsk ? `<label>PSK Format <select id="eFmt"><option value="ascii" ${w.pskFormat === 'ascii' ? 'selected' : ''}>ASCII</option><option value="hex" ${w.pskFormat === 'hex' ? 'selected' : ''}>HEX</option></select></label>
            <label>Pre-shared key <input id="eKey" type="password" value="${esc(w.psk)}" autocomplete="off" maxlength="64"></label>` : ''}
          </fieldset>` : w.l2 === 'wep' ? '<p class="wl-note">WEP is broken (RC4 with weak IVs). It is here so you can recognize it. Never use it.</p>' : '<p class="wl-note">An open WLAN: anyone in range can join and nothing is encrypted.</p>'}
        </div>`;
      } else if (sub === 'l3') {
        body += '<div class="wl-form"><label>Layer 3 Security <select><option>None</option><option>Web Policy</option></select></label><p class="wl-note">Web policy (a captive portal) is how hotel-style guest login pages work. Not needed for these tasks.</p></div>';
      } else {
        body += `<div class="wl-form"><p class="wl-note">Select the RADIUS servers that authenticate users of this WLAN (used with 802.1X).</p>
          <label>Authentication Server 1 <select id="eRad"><option value="">None</option><option value="10.1.1.20" ${w.radius === '10.1.1.20' ? 'selected' : ''}>IP:10.1.1.20, Port:1812</option><option value="10.1.1.21" ${w.radius === '10.1.1.21' ? 'selected' : ''}>IP:10.1.1.21, Port:1812</option></select></label></div>`;
      }
    } else if (st.tab === 'qos') {
      body = `<div class="wl-form"><label>Quality of Service (QoS) <select id="eQos">${QOS.map(([v, l]) => `<option value="${v}" ${w.qos === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <p class="wl-note">Platinum = voice, Gold = video, Silver = best effort (default), Bronze = background.</p></div>`;
    } else {
      body = `<div class="wl-form">
        <div class="wl-row"><span>Allow AAA Override</span>${cb('eAo', w.aaaOverride, 'Enabled')}</div>
        <label>Enable Session Timeout (secs) <input id="eSt" type="number" min="0" max="86400" value="${w.sessionTimeout}"></label>
        <div class="wl-row"><span>DHCP Addr. Assignment</span>${cb('eDhcp', w.dhcpRequired, 'Required')}</div>
        <label>P2P Blocking Action <select id="eP2p"><option value="disabled" ${!w.peerBlocking ? 'selected' : ''}>Disabled</option><option value="drop" ${w.peerBlocking ? 'selected' : ''}>Drop</option></select></label>
        <div class="wl-row"><span>FlexConnect Local Switching</span>${cb('eFlex', w.flexLocal, 'Enabled')}</div>
      </div>`;
    }
    return `<h4 class="wl-h">WLANs &gt; Edit '${esc(w.profile)}'</h4>
      <div class="wl-tabs">${tabs.map(([k, l]) => `<button type="button" class="wl-tab" data-tab="${k}" aria-pressed="${st.tab === k}">${l}</button>`).join('')}</div>
      ${body}
      <div class="wl-actions"><button type="button" class="wl-btn" id="eBack">&lt; Back</button><button type="button" class="wl-btn primary" id="eApply">Apply</button></div>`;
  }

  function readQuiz() {
    return `<div class="wl-read">${READ_QS.map((q, i) => `<fieldset class="wl-fs"><legend>${esc(q[0])}</legend>${q[1].map((o, k) => `<label class="wl-cb"><input type="radio" name="rq${i}" value="${k}"> ${esc(o)}</label>`).join('')}<div class="wl-fb" id="rqf${i}"></div></fieldset>`).join('')}
      <button class="btn primary" type="button" id="rqCheck">Check answers</button></div>`;
  }

  /** Copy the visible form fields of the open WLAN into state. */
  function collect(root) {
    const w = st.wlans.find((x) => x.id === st.edit);
    if (!w) return;
    const $ = (id) => root.querySelector('#' + id);
    const val = (id, k, f) => { const e = $(id); if (e) w[k] = f ? f(e) : e.value; };
    val('eSsid', 'ssid', (e) => e.value.trim());
    val('eEn', 'enabled', (e) => e.checked);
    val('eRadio', 'radio');
    val('eIf', 'iface');
    val('eBc', 'broadcast', (e) => e.checked);
    if ($('eL2')) {
      const was = w.l2;
      w.l2 = $('eL2').value;
      if (w.l2 === 'wpa2' && was !== 'wpa2') Object.assign(w, { wpa: false, wpa2: true, aes: true, tkip: false, akm8021x: true, akmPsk: false });
    }
    val('eWpa', 'wpa', (e) => e.checked);
    val('eWpa2', 'wpa2', (e) => e.checked);
    val('eAes', 'aes', (e) => e.checked);
    val('eTkip', 'tkip', (e) => e.checked);
    val('e8021x', 'akm8021x', (e) => e.checked);
    val('ePsk', 'akmPsk', (e) => e.checked);
    val('eFmt', 'pskFormat');
    val('eKey', 'psk');
    val('eRad', 'radius');
    val('eQos', 'qos');
    val('eAo', 'aaaOverride', (e) => e.checked);
    val('eSt', 'sessionTimeout', (e) => Number(e.value) || 0);
    val('eDhcp', 'dhcpRequired', (e) => e.checked);
    val('eP2p', 'peerBlocking', (e) => e.value === 'drop');
    val('eFlex', 'flexLocal', (e) => e.checked);
  }

  function wire(root) {
    const re = () => { save(); render(root); };
    root.querySelectorAll('[data-task]').forEach((b) => b.addEventListener('click', () => { st.task = b.dataset.task; st.msg = null; re(); }));
    root.querySelectorAll('[data-menu]').forEach((b) => b.addEventListener('click', () => { st.page = b.dataset.menu === 'WLANs' ? 'wlans' : 'other'; re(); }));
    root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => { st.page = 'edit'; st.edit = Number(b.dataset.edit); st.tab = 'general'; re(); }));
    root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { collect(root); st.tab = b.dataset.tab; re(); }));
    root.querySelectorAll('[data-sub]').forEach((b) => b.addEventListener('click', () => { collect(root); st.sub = b.dataset.sub; re(); }));
    const on = (id, fn) => { const e = root.querySelector('#' + id); if (e) e.addEventListener('click', fn); };
    // live re-render when the security choices change the form
    ['eL2', 'ePsk', 'e8021x'].forEach((id) => { const e = root.querySelector('#' + id); if (e) e.addEventListener('change', () => { collect(root); re(); }); });
    on('goNew', () => { st.page = 'new'; re(); });
    on('nBack', () => { st.page = 'wlans'; re(); });
    on('nApply', () => {
      const prof = root.querySelector('#nProf').value.trim();
      const ssid = root.querySelector('#nSsid').value.trim();
      const id = Number(root.querySelector('#nId').value);
      if (!prof || !ssid) { alertBox(root, 'Profile Name and SSID are required.'); return; }
      if (st.wlans.some((w) => w.profile === prof)) { alertBox(root, 'A WLAN with that profile name already exists.'); return; }
      st.wlans.push(newWlan(id, prof, ssid));
      st.page = 'edit'; st.edit = id; st.tab = 'general';
      re();
    });
    on('eBack', () => { st.page = 'wlans'; re(); });
    on('eApply', () => {
      collect(root);
      const w = st.wlans.find((x) => x.id === st.edit);
      if (w && w.akmPsk && w.l2 === 'wpa2' && w.pskFormat === 'ascii' && w.psk && (w.psk.length < 8 || w.psk.length > 63)) { alertBox(root, 'An ASCII PSK must be between 8 and 63 characters.'); return; }
      st.msg = '<span class="wl-ok">Changes applied.</span>';
      re();
    });
    on('wlCheck', () => {
      const t = TASKS.find((x) => x.id === st.task);
      if (st.page === 'edit') collect(root);
      const fails = t.check(st);
      if (!fails.length) { st.done[t.id] = true; st.msg = '<b class="wl-ok">Resolved. Clients can join with the right security and land in the right VLAN.</b>'; }
      else st.msg = '<b>Not yet:</b><ul>' + fails.map((f) => `<li>${esc(f)}</li>`).join('') + '</ul>';
      re();
    });
    on('wlReset', () => { st = { wlans: [Object.assign(newWlan(1, 'HPL-CORP', 'HPL-CORP'), { enabled: true })], page: 'wlans', edit: null, tab: 'general', task: st.task, done: st.done, msg: null }; re(); });
    on('rqCheck', () => {
      READ_QS.forEach((q, i) => {
        const pick = root.querySelector(`input[name="rq${i}"]:checked`);
        const fb = root.querySelector('#rqf' + i);
        const ok = pick && Number(pick.value) === q[2];
        fb.innerHTML = `<b class="${ok ? 'wl-ok' : 'wl-bad'}">${ok ? 'Correct.' : 'Not quite.'}</b> ${esc(q[3])}`;
      });
    });
  }
  function alertBox(root, text) {
    const fb = root.querySelector('#wlFb');
    if (fb) fb.innerHTML = '<b class="wl-bad">' + esc(text) + '</b>';
  }

  TT.renderWlc = render;
  TT.wlcTasks = TASKS;
})(typeof globalThis !== 'undefined' ? globalThis : window);
