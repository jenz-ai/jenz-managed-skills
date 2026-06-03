# Jenz Managed Skills — Frontend Build Spec (1:1)

**North star:** pixel-perfect rebuild of the Claude Design prototype in **React 19 + Radix primitives**, reusing the prototype's **exact CSS + class names**. Fidelity beats cleverness. When in doubt, open the source and match it node-for-node.

## Source of truth (read directly — do not guess values)
Design bundle: `C:/Users/Josan/jenz/jenz-design/project/uploads/jenz (5)/`
- `Jenz Skills/jenz-skills.css` — app component styles (56KB) — **port verbatim**
- `_shared/styles.css` — base token system ("Brain"), 159KB — **port only the `:root` + `body.light` token blocks and `@font-face`/font vars the app uses**
- `Jenz Skills/skills-*.jsx` — exact DOM structure + copy per screen (rebuild as React, don't copy prototype internals)
- `Jenz Skills/skills-data.jsx` — the fixture (port verbatim, see §7)
- `_shared/icons.jsx` + `Jenz Skills/skills-icons.jsx` — icon path data

## Build approach (decided)
- **Reuse the prototype CSS** (tokens + `.js-*`/`.jsa-*`/`.jsl-*`/`.jsd-*`/`.jso-*`/`.st-*` classes). Copy `jenz-skills.css` + the used parts of `_shared/styles.css` into `apps/web/src/styles/` so the app is self-contained and committed. This is the fastest path to 1:1.
- **Rewrite the JSX as real React 19 components** that emit the **same DOM + className** as the prototype. Don't ship Babel-standalone prototype JSX.
- **Radix only for behavior**, styled with the design's classes: `DropdownMenu` (InstallMenu, workspace popover), `Dialog` (ImportModal), `Switch` (toggles), `Tabs` (MCP/settings), `Tooltip` (locked install), `Collapsible` (sidebar category groups).
- **Navigation:** replicate the prototype's state machine (`screen` ∈ {onboarding, app} × `view` ∈ {audits, audit, library, quarantine, detail, settings}). TanStack Router optional/stretch — fidelity of screens first.
- **Theme:** light is **default** (`body.light`). Build both palettes; risk colors are theme-independent.
- **Colors stay oklch** — never convert to hex (except 3 hardcoded traffic dots + `#fff` button text).
- **Mono vs sans is semantic** — technical values (skill names, paths, counts, code, eyebrows, stats) = IBM Plex Mono; prose/labels = IBM Plex Sans. Follow the class list, don't guess.

---

## 1. Tokens (exact — from `_shared/styles.css` `:root` / `body.light`; risk scale from `jenz-skills.css`)

### Surface / bg ladder
| token | dark | light (default) | use |
|---|---|---|---|
| `--bg-0` | `oklch(0.165 0.004 280)` | `oklch(0.985 0.003 75)` | window/main |
| `--bg-1` | `oklch(0.195 0.004 280)` | `oklch(0.965 0.004 75)` | sidebar/titlebar/card |
| `--bg-2` | `oklch(0.225 0.005 280)` | `oklch(0.945 0.005 75)` | hover |
| `--bg-3` | `oklch(0.265 0.005 280)` | `oklch(0.91 0.006 75)` | selected/active |
| `--bg-4` | `oklch(0.32 0.006 280)` | `oklch(0.86 0.006 75)` | — |

### Foreground ladder
| token | dark | light |
|---|---|---|
| `--fg-0` | `oklch(0.96 0.005 280)` | `oklch(0.22 0.012 280)` |
| `--fg-1` | `oklch(0.82 0.005 280)` | `oklch(0.34 0.010 280)` |
| `--fg-2` | `oklch(0.70 0.006 280)` | `oklch(0.48 0.008 280)` |
| `--fg-3` | `oklch(0.58 0.006 280)` | `oklch(0.58 0.007 280)` |
| `--fg-4` | `oklch(0.48 0.006 280)` | `oklch(0.68 0.007 280)` |

### Hairlines
`--line-1` dark `oklch(0.28 0.005 280)` / light `oklch(0.88 0.005 75)` · `--line-2` dark `oklch(0.34 0.006 280)` / light `oklch(0.82 0.006 75)`. App borders = `1px solid var(--line-1)` default, `var(--line-2)` stronger.

### Accent (purple)
`--accent` dark `oklch(0.74 0.13 295)` / light `oklch(0.55 0.16 295)` · `--accent-fg` dark `oklch(0.96 0.02 295)` / light `oklch(0.98 0.02 295)` · `--accent-soft` dark `oklch(0.74 0.13 295 / 0.16)` / light `oklch(0.55 0.16 295 / 0.10)` · `--accent-line` dark `oklch(0.74 0.13 295 / 0.4)` / light `oklch(0.55 0.16 295 / 0.35)`.
Logo gradient (both themes): `linear-gradient(135deg, var(--accent), oklch(0.55 0.14 320))`. Audit bar fill: `linear-gradient(90deg, oklch(0.66 0.14 295), oklch(0.78 0.13 295))`.

### Risk scale (theme-independent, from `jenz-skills.css :root`)
`--safe` `oklch(0.76 0.15 152)` · `--safe-soft` `…/0.14` · `--safe-line` `…/0.40`
`--warn` `oklch(0.81 0.14 78)` · `--warn-soft` `…/0.14` · `--warn-line` `…/0.40`
`--danger` `oklch(0.66 0.21 25)` · `--danger-soft` `…/0.15` · `--danger-line` `…/0.42`
Semantics: safe→`--safe`, suspicious→`--warn`, malicious→`--danger`, scanning/queued→accent/`--fg-3`.

### Hardcoded literals
Traffic dots `#ff5f57` `#febc2e` `#28c840` · button text `#fff` · toggle knob-on `oklch(0.16 0.01 280)` · input focus bg `oklch(0.205 0.005 280)`. SourceBadge color `oklch(0.80 0.10 <hue>)` — Claude hue 35, Codex 145, OpenClaw 295, Hermes 230, Cursor 280.

### Radii / spacing / type
Radii tokens `--radius-sm 4px / --radius-md 6px / --radius-lg 10px`; CSS mostly literal (chips 6–8, cards 10–14, pills `99px`, circles `50%`). Spacing = literal px (no scale var). Type: body `13px/1.45`; sizes seen `9.5–28px` (H1 onboarding 28, library title 22, detail name 24, stat 26, audit counter 20). Weights 400/500/600/700. Uppercase labels letter-spacing `0.04–0.14em`.

### Shadows / motion
Popover `0 14px 40px oklch(0.05 0.005 280 / 0.5)`; install menu `0 18px 48px …/0.55`; modal `0 24px 70px …/0.6` + overlay `…/0.6` + `backdrop-filter: blur(3px)`; toast `0 16px 44px …/0.6`. Keyframes: `inst-pop .13s ease-out`, `toast-in .22s cubic-bezier(.2,.9,.3,1.2)`, `qa-spin .9s linear infinite`, `jsa-flash 1.1s ease-in-out 2` (malicious row), `pulse 1s ease-in-out infinite` (scan dot). Honor `@media (prefers-reduced-motion: reduce)`.

### Fonts
Google Fonts (already in prototype `<head>` — add to index.html): `IBM Plex Sans` (300,400,500,600,700 + i400,i500), `IBM Plex Mono` (400,500,600 + i400).
`--font-ui: "IBM Plex Sans", "Inter", system-ui, -apple-system, sans-serif` · `--font-mono: "IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace`. Local `fonts/` (Bitend/Bitpop/Sharpixel) **unused** — ignore.

---

## 2. App shell (`skills-app.jsx`)
`.js-win` (100vh flex col, `--bg-0`, overflow hidden) → `.js-titlebar` + `.js-shell`.
- **`.js-titlebar`** height **38px**, `padding 0 14px`, gap 14, `--bg-1`, bottom border line-1. `.js-title` (12.5px, fg-1, 500): `.js-logo` 18×18 r5 gradient + `shield-check` (12) + text **"jenz managed skills"** + `.js-title-sub` (fg-3, 400) `· Bicone` (app) / `· setup` (onboarding). `.js-titlebar-end` (margin-left auto, mono 11px, fg-3): `shield-check` (13) + **"auditor online"** (app only).
- **`.js-shell`** grid `248px 1fr` (onboarding overrides to `1fr`, no sidebar). `.js-main`: `.js-crumb` (height **40px**, pad `0 18px`, 12.5px fg-3) + scrollable `.js-body`.
- **Sidebar** (`.js-side*`, width **248px**, `--bg-1`, right border):
  1. `.js-side-top` → `.js-import-btn` full-width "Import skills" (`import` icon 14) → opens ImportModal.
  2. `.js-nav`: **Audits** (`scan` 16, count = `AUDIT_HISTORY.length`, active view audits/audit), **All skills** (`files` 16, count = safe count, active library w/o category).
  3. `.js-side-sec` "Library" + count + "New folder" (`plus` 13).
  4. Category groups for `["Research","Ops","Outbound","Narrative","Engineering"]` — `.js-grp` collapsible (`chev-down` twisty, `folder` 14 accent, `.jg-count`), drop target for DnD, `.js-sk` rows (mono, draggable, risk dot).
  5. `.js-side-sep`, then **Quarantine** `.js-nav-item.danger` (`lock` 16, `.ji-count.danger` = non-safe count).
  6. Footer `.js-ws` → avatar 24×24 gradient "B" + "Bicone" + `"{n} skills · audited"` + `chev-up`. Popover `.js-ws-pop`: Settings (`settings`), Theme (`sparkles`, Light/Dark toggle), sep, Log out (`external`, danger).
- **Breadcrumb** always starts "Bicone" → segments per view; `.jc-seg.current` fg-0 500, `.jc-sep` "/" fg-4.
- Nav item base `.js-nav-item`: `padding 7px 9px; r6; gap 9; 13px; fg-1`; hover bg-2; `.active` bg-3+fg-0. `.ji-count` mono 10.5px bg-2 `1px 6px` r99; danger variant danger/danger-soft.

---

## 3. Routing / state machine
`screen` `useState("onboarding")` ∈ {onboarding, app}. `view` `useState("audits")` ∈ {audits→AuditHome, audit→Audit, library→Library, quarantine→Library(mode=quarantine), detail→SkillDetail, settings→SkillsSettings}. `activeCategory`, `skillId` aux state.
Transitions: `nav(v,cat)`; `openSkill(sk)`→view=detail; `startImport()`→bump runKey, view=audit, screen=app; quarantine actions `deleteSkill/reportSkill/rescanSkill/approveSkill`. Top-level: `.js-toast` (auto-dismiss 2600ms), `<ImportModal>`. (Skip the dev `TweaksPanel`.)

---

## 4. Shared components

**SIcon** (`{name,size=14}`) — viewBox 24, fill none, stroke currentColor, **strokeWidth 1.7**, round caps. Names: `check check-circle alert ban shield-check shield-alert scan import lock refresh copy external arrow-right arrow-left eye bug network key clock doc more x git terminal globe link files plus folder chev-down chev-up skills settings sparkles`. Port path data from `skills-icons.jsx` + `_shared/icons.jsx`. (Lucide is an acceptable fallback per-name only if a path is missing.)

**RiskGlyph** (`{risk,size=13}`): safe→check-circle, suspicious→alert, malicious→ban, scanning→scan, else→clock.

**RiskPill** (`{risk,label,sm}`) → `<span class="risk-pill {risk}{ sm}">` + `.rp-ico`(RiskGlyph 11/12) + (label||risk). Base: inline-flex gap5 `padding 2px 9px 2px 7px` r99 11px **600** ls .04em uppercase. Variants safe/suspicious/malicious (soft bg + line border in risk color), `.queued` (fg-3/bg-2/line-1), `.scanning` (accent, **text-transform none, ls 0, 500**). `.sm`→10px.

**SourceBadge** (`{kind,sm}`) → `.jss-logo` 38×38 r9 bg-2 line-1 mono 700 15px, color `oklch(0.80 0.10 hue)`. Map: claude "CC"/35, codex "Cx"/145, openclaw "OC"/295, hermes "He"/230, cursor "Cu"/280, fallback "·"/280. `.sm`→22×22 r6 11px.

**InstallMenu** (`{installed=[],onInstall,disabled,locked,lockedReason,sm,ghost,label,note,align}`) — Radix `DropdownMenu` styled as `.inst-wrap`/`.inst-btn`/`.inst-menu`. Trigger `.inst-btn` (accent, #fff, `8px 14px`, r8, 13px 600; `.sm`/`.ghost`/`.locked` variants) = `import`(14)+label+`.ib-chev`(chev-down 13). Locked → wrap + `.jsd-tooltip` (ban + lockedReason). Menu `.inst-menu` width 252 bg-2 line-2 r10 pad5 z60 shadow, `inst-pop .13s`, `.inst-menu-head` ("Install to"/"Install all to"), `.inst-opt` per TARGET (`.io-badge` 24 + `.io-name`/`.io-path` + `.io-check` safe-color when installed), `.inst-note` (uses `--font-ui`, `alert`(12) warn, default text *"Skills are normalized to a canonical form. Claude-specific frontmatter is mapped where it can be; the rest is flagged on install."*).
**TARGETS** (install destinations): claude "Claude Code" `~/.claude/skills` "CC" 35 · codex "Codex" `~/.codex/skills` "Cx" 145 · openclaw "OpenClaw" `~/.openclaw/skills` "OC" 295 · hermes "Hermes" `~/.hermes/skills` "He" 230. `TARGET_BY_ID` lookup. `useOutside` click-outside hook (or Radix handles it).

---

## 5. Demo-critical screens

### 5.1 Audit "moment" — `skills-audit.jsx` (🔴 build first)
`Audit({onDone,onOpenSkill,runKey})`. `order = AUDIT_ORDER.map(id→SKILLS)`, `total=12`. `statuses[]` all "queued"→"scanning"→`sk.risk`. `scanning` index advances.
- **Driver effect** per `scanning`: set row "scanning"; rotate `label` over `SCAN_LABELS` every **480ms**; dwell = `risk==="safe" ? 640 : 1250`ms; then set row=risk, `scanning++`.
- Derived: `resolved`, `done = scanning>=total`, `counts{safe,suspicious,malicious}`, `pct=round(resolved/total*100)`, `threats=suspicious+malicious` (always 2).
- DOM: `.jsa` → `.jsa-orch` (icon scan/shield-check 20; title **"Auditing imported skills"**/**"Audit complete"**; sub running `"open-weight auditor running locally · "`+`.live`{label}, done `"open-weight auditor · {total} skills · {threats} flagged"`; `.jsa-counter` `<b>{resolved}</b> / {total}` + "audited"; `.jsa-bar`→`.jsa-bar-fill` width pct%; `.jsa-bar-stats` `● {safe} safe`/`● {susp} suspicious`/`● {mal} malicious`/`{queued} queued`).
- `.jsa-list` rows `.jsa-row {status}` (onClick opens detail only when resolved): `.jsa-row-ico` (clock15/scan15/RiskGlyph16), `.jsa-row-name`{name}+`.src`{SOURCE_LABEL}, `.jsa-row-sub` (queued "queued" · scanning `.jsa-scan-dot`+label · safe "no findings · {category}" · suspicious alert+finding · malicious ban+finding; `finding = sk.headline || findings[0].type`), `.jsa-row-end` RiskPill (queued/scanning labeled, resolved self-labeled, all `sm`).
- **The beat:** malicious row flips to `.jsa-row malicious` (CSS `jsa-flash` red pulse) after the longer 1250ms dwell.
- `done` → `.jsa-done-bar{ has-threat}`: shield-alert/check 24; title `Caught {threats} risky skills before they reached an agent.` / "All clear — every skill is safe to install."; sub `{safe} sorted into your library, {threats} quarantined for review.`; buttons `.btn-secondary` "Open Library" (files14→onDone("library")), `.btn-primary` "Review Quarantine" (lock14→onDone("quarantine"), only if threats>0).

### 5.2 Skill detail — `skills-detail.jsx` (🔴)
`SkillDetail({sk,installed,onInstall,onDelete,onReport,onRescan,onApprove})`. `flagged=sk.risk!=="safe"`. State `sel`(="SKILL.md"), `confirm`(null/"approve"/"delete"), `scanning`. `SEV_RISK={high:"malicious",medium:"suspicious",low:"queued"}`. `files = ["SKILL.md", ...unique finding.file] (+"examples/","refs/" if safe)`. `runRescan`: 1500ms then `onRescan`.
- `.jsd-head`: `.jsd-name {risk}`{name}+RiskPill(if flagged); `.jsd-meta` folder+category · "from {source}" · "{fileCount} files" · install chips (safe+installed). `.jsd-actions`: InstallMenu — **flagged→locked** (label "Install", lockedReason *"Blocked — this skill is quarantined. Clear its findings before it can be installed."*); safe→"Install to". `.jsd-secondary` "review required"/"vetted · canonical · install to any tool".
- `.jsd-main` grid **212px 1fr**: `.jsd-files` rail (`.jsd-file{ active}{ flagged}` doc/folder icon + `.jf-flag` dot) + `.jsd-scroll`.
- `.jsd-scroll` (flagged first): `.jsd-quar` action bar (lock16, title **"Blocked from every tool"**, sub "Decide what happens…"; buttons `.qa-btn` Re-scan(refresh,spin)/Report(alert; "Reported" when sk.reported)/Approve anyway(warn,shield-check)/Delete(danger,ban); two-step confirm `.jsd-quar-confirm` Q + solid confirm + Cancel). Then `.skill-field` Description, `.skill-meta-row` (pill Quarantined/Passed audit + category + source + files + findings). `.jsd-findings`: `.finding {risk}` (icon ban/alert 16, `.finding-type`{type}, RiskPill SEV_RISK[sev] label sev sm, `.finding-loc`{file}:{line}, `.finding-snippet`→`CodeBlock`). `.skill-file-bar`{sel} + body: SKILL.md→`SkillFileBody` (markdown flow; injection lines → `.jsd-inj` block tag **"prompt injection — blocked"**), else `.jsd-codeflow`→`CodeBlock`.
- **CodeBlock**(`{lines}`): `.code-line{ hot}` + `.ln`{n} + `.{tok-*}`{text}. tokClass: h→tok-h, com→tok-com, inj→tok-inj. Syntax colors: tok-h/tok-fn `oklch(0.82 0.10 230)`, tok-str `oklch(0.78 0.12 145)`, tok-kw `oklch(0.75 0.13 295)`, tok-com `--fg-4`, tok-inj `--danger`.

### 5.3 Library / Quarantine — `skills-library.jsx` (🔴)
One `Library({mode,activeCategory,skills,installs,onOpenSkill,onBulkInstall,onDragStart,onDragEnd,draggingId})`. `quarantine = mode==="quarantine"`; `list` = filter risk safe vs non-safe (+category).
- `.jsl-head{ quar}`: `.jsl-title` (category||"All skills" / "Quarantine"); `.jsl-sub` (`"{n} vetted skills · canonical form · install to any tool"` / "Skills held back from your agents until you clear or remove them."); bulk InstallMenu (ghost, "Install all to", note) when library & list>0.
- Quarantine `.jsl-banner` (shield-alert 18, **"{n} skills blocked."** + " Install is disabled until each is reviewed. Nothing here can reach an agent.").
- Empty `.jsl-empty` (shield-check 32; library "No skills here yet"/"Drag a skill here, or import more from a tool." · quarantine "Nothing quarantined"/"Every imported skill passed the audit.").
- `.jsl-grid` of **SkillCard**: `<button class="skill-card {risk}{ dragging}" draggable={!flagged}>` — `.skill-card-top` name + (RiskPill if flagged else InstalledChips), `.skill-card-desc`{desc}, flagged `.skill-card-finding-line` (ban/alert + topFinding), `.skill-card-foot` folder+category + source + (`{n} findings` / `on {n} tools`|"not installed"). Drag: setData skill id, `effectAllowed=move`; flagged cards not draggable.
- **InstalledChips**(`{ids,max=3}`): `.inst-chips`/`.inst-chip` (check10 + TARGET_BY_ID badge), "+N" overflow.

---

## 6. Secondary screens (build after demo-critical)
- **Audit Home** `skills-history.jsx`: `.jh-head` title "Audits" + sub + `.jh-cta` "Import & audit"; `.jh-stats` 4 tiles (skills audited=Σscanned 31, audit runs=6, **threats caught**=5 danger→quarantine, last run); "Recent runs" `.jh-row` list with verdict ok/bad + breakdown chips. Data `AUDIT_HISTORY` (6 rows — see source).
- **Onboarding** `skills-onboarding.jsx` (stretch): wizard steps `["name","import",("mcp"),"review"]`, `.jso-*` (mark 46, eyebrow, H1 28, `.jso-input`, source/tool tiles, GitHub tile, `StagedList`, `RouteToggle`, `.jso-progress` stepper, `.jso-cta`). Folder upload via `webkitdirectory` scanning for `SKILL.md`. Copy verbatim from source (curly apostrophes preserved).
- **Import modal** `skills-import.jsx` (stretch): Radix Dialog `.jim-overlay`/`.jim` head/body/foot; reuses `.jso-drop`/`.jso-byo-*`/`.jso-staged`; foot `.jim-go` "Audit N skills" (disabled when 0).
- **MCP connect** `skills-mcp.jsx` (stretch): `.mcp-*` head + Radix Tabs (4 agents, SourceBadge sm) + `.mcp-cmd` copy block (per-agent CLI, verbatim) + 3-way `.mcp-status` (connected/checking/idle). Copy 1400ms, check 1700ms.
- **Settings** `skills-settings.jsx` (stretch): `.st-*` (Brain) nav (Workspace: General, Connections · Audit: Audit policy) + content; `StToggle`/`JzRow`/`JzCard` primitives. High-severity + block-install toggles are `locked on`.

---

## 7. Fixture (`skills-data.jsx`) — port verbatim into `src/data/skills.ts`
```
CATEGORIES = ["Research","Ops","Outbound","Narrative","Engineering"]
SOURCE_LABEL = {claude:"Claude Code",codex:"Codex",openclaw:"OpenClaw",hermes:"Hermes",cursor:"Cursor"}
AUDIT_ORDER = ["competitor-diff","weekly-memo","cold-open","narrative-arc","trend-scan",
  "pdf-extract","standup-digest","meeting-notes-sync","follow-up","headline-3up",
  "changelog-watcher","pr-review"]   // 12; threats at #6 pdf-extract, #8 meeting-notes-sync
SCAN_LABELS = ["parsing SKILL.md…","static analysis…","checking for exfiltration…",
  "scanning for prompt injection…","resolving tool scope…","diffing against allowlist…"]
```
**10 SAFE** (`risk:"safe", findings:[], skillMd: cleanMd(...), files:1`): competitor-diff (Research/claude), trend-scan (Research/codex), changelog-watcher (Research/claude), weekly-memo (Ops/claude), standup-digest (Ops/codex), cold-open (Outbound/openclaw), follow-up (Outbound/claude), narrative-arc (Narrative/claude), headline-3up (Narrative/codex), pr-review (Engineering/claude). Exact `desc` + trigger strings → copy from source (§ "SAFE skills" table in extraction / read file).
**1 SUSPICIOUS** `pdf-extract` (Ops/hermes, files:2, no headline): findings = `extract.py:22` base64-eval (medium, hot line 22) + `extract.py:31` undeclared egress to `api.pdf-tools.cc` (medium). skillMd as in source.
**1 MALICIOUS** `meeting-notes-sync` (Ops/openclaw, files:3, headline `"credential exfiltration — line 14"`): findings = `run.sh:14` credential exfil (high, hot 14) + `SKILL.md:18` prompt injection (high, hot 18-19). skillMd has `kind:"inj"` hot lines 18-19. **Copy snippet arrays verbatim** — they are the on-stage payloads.
`cleanMd(name,desc,category,trigger)` generates the 24-line safe SKILL.md (frontmatter + # name + ## When to use "Use this skill when {trigger}." + ## Steps + ## Tools) — see source.
> Note: fixture has **no OWASP/MITRE badge fields** and no separate stats object (stats computed at runtime). Don't invent fields.

---

## 8. Build order (subagent-driven tasks)
1. **Foundation** — port tokens + fonts + `jenz-skills.css` into `src/styles/`; `index.html` fonts; light-default theme; Radix + base providers; app shell (titlebar/sidebar/breadcrumb/main) with the state machine + nav. Boots to an empty `app` view.
2. **Primitives + data** — SIcon (port paths), RiskPill, RiskGlyph, SourceBadge, InstallMenu (Radix DropdownMenu), TARGETS, and the verbatim fixture `src/data/skills.ts`.
3. **Audit moment** (5.1) — the streaming state machine, exact timings, flash, done bar.
4. **Skill detail** (5.2) — files rail, findings, CodeBlock, quarantine actions, SkillFileBody.
5. **Library / Quarantine** (5.3) — grid, SkillCard, drag, bulk install, empty/banner states.
6. **Audit home** (6).
7. **Onboarding** (6).
8. **Import modal + MCP + Settings** (6).

Each task: TDD where there's logic (audit driver timings, file-rail derivation, SkillFileBody parser, filters), then visual match against the source file. Verify `pnpm --filter @jenz/web build` green after each.

## 9. Fidelity checklist (per screen, before marking done)
- DOM nesting + every className matches the source JSX.
- All copy verbatim (curly apostrophes `’`, `·` separators, `&` → "Import & audit", pluralization ternaries).
- oklch values exact; light theme default; risk colors correct.
- Mono vs sans per class. Icons match names + strokeWidth 1.7.
- Interactions/timings match (480/640/1250/1500/1400/1700/2600 ms).
