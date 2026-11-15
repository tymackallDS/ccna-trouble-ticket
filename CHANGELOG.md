# Changelog

All notable changes to Trouble Ticket. Dates are release dates.

## [2.2.0] - 2026-11-15

### Added
- **Night-shift theme:** dark is now the default, with a light-mode toggle in the header.
- **Watch it happen:** 36 animated concept scenes in the lessons and a gallery on the Learn page. Each shows packets moving step by step with narration, and has play, pause, step and speed controls.
- **Animated pings and traceroutes** in tickets and labs. They follow the simulator's real path and end with a red X at the device that drops the packet, along with the reason.
- **`traceroute` / `tracert`** commands.
- **Living links:** a pulse when a link comes up, a red flash when it goes down, and a blinking marker on STP-blocked ports.
- **Career mode:** XP, 8 ranks, 15 badges, pager alerts, a promotion overlay, and a shift record with a streak on the Progress page.

### Fixed
- Port and device labels no longer overlap in any ticket or lab diagram.

## [2.1.0] - 2026-11-15

### Added
- **Practice exams A to E** - five fixed 100-question, 120-minute exams. Each one matches the blueprint weights and has 5 CLI labs, and together they cover all 433 questions. Each exam's best score and attempt count are saved.

## [2.0.0] - 2026-11-15

The "one stop shop" release: the site now teaches, drills and tests every CCNA 200-301 v1.1 objective.

### Added
- **Learn** - 53 lessons, one per exam objective, written as case files with CLI samples, exam traps, "try it" terminal tasks and check questions.
- **Mock exam** - 433 original questions, including 25 CLI sims, in a timed, exam-style format: single and multiple answer, drag-to-order, matching, exhibits, all graded in the browser; the sims are checked against the simulator.
- **Flashcards** - 1,015 cards in topic decks with spaced repetition.
- **Lab sandbox** - a free-build topology editor plus 15 guided projects.
- **Wireless controller lab** - a generic WLC GUI with three WLAN tasks and a read quiz.
- **Tickets TT-1019 to TT-1023** - OSPF DR/BDR, Layer 3 switching, static and pool NAT, STP guards, and a branch-router build.
- **Course map by exam objective** - all 53 v1.1 objectives, each linked to its lesson, cards, tickets and questions.
- **Progress dashboard** - next step and readiness by domain.
- **Simulator features:**
  - Routing and switching: SVIs, routed ports, Layer 3 EtherChannel, OSPF DR/BDR election, network types, priority, `passive-interface default` and `default-information originate`.
  - Services: static, pool and PAT NAT; router DHCP client and server; NTP; CDP/LLDP with per-port control; named ACLs; VTY `access-class`; logging and SNMP configuration.
  - Layer 2: DTP, native VLAN, voice VLAN, speed/duplex mismatches, BPDU guard err-disable, root guard and BPDU filter.
  - New `show` commands: `version`, `startup-config`, `logging`, `mac address-table`, `ip arp`, `interfaces <if>` (with error counters), `interfaces <if> switchport`, `ip protocols`, `ip dhcp binding` and `pool`, `ip nat statistics`, `ipv6 neighbors`.
- Field guide grown to 58 topic cards (AI/ML, IPsec, IPv6 address types, STP guards, password policy and more).

### Changed
- Every lesson, question and flashcard was accuracy-reviewed against vendor documentation and standards.
- `show running-config` now reflects every configurable setting.
- EtherChannel `mode on` bundles without negotiating, as real IOS does.

### Fixed
- `channel-group` on routed member ports now creates a Layer 3 Port-channel.
- The GitHub OIDC trust policy accepts GitHub's new subject-claim format.

## [1.0.0] - 2026-11

### Added
- First public release: 18 trouble tickets on a browser-based IOS simulator, a field guide, a subnet drill, a hardware lab, a quick quiz, and progress tracking.
- Hosting on AWS S3 + CloudFront, deployed by GitHub Actions through OIDC.
