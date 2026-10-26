# Metavoice CRM: Complete UI Design Prompt

Paste everything below the line into an AI design or coding tool. It describes the finished system screen by screen, with exact colours, fonts, sizes, spacing, states and behaviour, taken from the current code in `apps/web`.

---

## 0. The brief

Design and build the web UI for **Metavoice CRM**, a call center CRM. Agents submit sales, managers and directors approve them in two stages, and the rest of the app covers reports, team, clients and DIDs, attendance, leave, chat, invoicing and accounting.

Stack: Next.js 14 (app router), React 18, Tailwind plus inline style objects. Charts use Recharts. Real-time uses Socket.IO. Money is shown in USD for sales and clients and in PKR for payroll and accounting.

The look is **calm, dense and data-first**: a pale grey-blue canvas, white cards, one teal brand colour, navy text, and a gold header on every table. Information density is high (12px table text, compact controls) and every screen fits one laptop viewport where possible. Do not make it airy, dark, or rounded-bubbly.

---

## 1. Design tokens

### 1.1 Colours

| Token | Hex | Use |
|---|---|---|
| navy | `#132E57` | Body text, headings, selected pills, dark buttons |
| teal | `#1E8496` | Brand, links, primary buttons, filter bar, active icons, page titles |
| deepTeal | `#1A5560` / `#0E5F6E` | Gradient end of teal buttons |
| gold | `#D7A520` (cards) / `#F2AC18` (table header, dashboard accents) | Table header row, section card headers, pending |
| brick | `#C25A1F` | Rejected, warnings, Reset buttons |
| forest | `#3A6B3A` | Positive accents |
| khaki | `#CBB26A` | Chart colour |
| purple | `#7B2D8E` | Chart and applicability accent |
| red | `#D62828` | Required asterisks, destructive |
| bgMain | `#EDF0F3` | Page canvas |
| bgCard | `#FFFFFF` | Cards, tables |
| sidebarBg | `#E8EAED` | Sidebar and second-level menus |
| border | `#E0DDD5` | Every 1px border (warm grey) |
| gridLine | `#F0EDE5` | Chart grid, skeleton bars, dividers |
| slate | `#5C5C5C` | Secondary text, labels |
| muted | `#808080` | Hints, placeholders-as-text |
| iconMuted | `#9FA7B2` | Inactive icons, input placeholders |
| fillNavy | `#E8EEF7` | Tinted fill behind navy items |
| fillTeal | `#E5F3F5` | Tinted fill behind teal items, selected option |
| fillGold | `#FAEFD0` | Tinted fill behind gold items |
| fillBrick | `#F5E0D2` | Tinted fill behind brick items |
| input fill | `#E6EBEE` | Resting input background in `.form-input` and login fields; turns white on focus |
| zebra row | `#FAFCFC` | Alternate table rows |

Chart series order: `#132E57, #1E8496, #D7A520, #CBB26A, #C25A1F, #808080`.
Cancellation chart order: `#1E8496, #D7A520, #C25A1F, #132E57, #3A6B3A, #7B2D8E`.

### 1.2 Status colours (sales)

| Status | Label | Badge |
|---|---|---|
| PENDING | Pending | yellow-100 bg / yellow-700 text |
| APPROVED | Approved by Manager | blue-100 / blue-700 |
| DISAPPROVED | Rejected by Manager | red-100 / red-700 |
| FINAL_APPROVED | Final Approved | green-100 / green-700 |
| FINAL_DISAPPROVED | Final Rejected | gray-100 / gray-600 |
| AGENT_REJECTED | Rejected by Agent | orange-100 / orange-700 |

Badges are pills: `padding 2px 8px`, fully rounded, 12px, weight 500, no wrap.

Approval queue colours: Manager Approval `#1565C0`, Final Approval `#1E8496`, All `#C25A1F`.

Role badges: Admin `#EDE9FE`/`#6D28D9`, Director `#DBEAFE`/`#1D4ED8`, Manager `#E0E7FF`/`#4338CA`, Agent `#CFFAFE`/`#0E7490`.
Role-type chips (squared, radius 4): agent types on `#FEF3C7`/`#92400E`, manager types on `#EDE9FE`/`#5B21B6`.
Sale type: CPA violet (`#EDE9FE`/`#6D28D9`), CPL teal (`#CCFBF1`/`#0F766E`). Rate type: Fixed slate, Variable orange.
Active/inactive: Active `#DCFCE7`/`#15803D`, Inactive `#FEE2E2`/`#DC2626`, Locked `#FEF3C7`/`#B45309`.

Attendance status: Present deepTeal solid, Absent `#C62828`, Late brick, Leave `#E3F2FD`/`#1565C0`, Weekend `#E2E8F0`/`#475569`, Holiday `#F3E5F5`/`#6A1B9A`, Not Joined `#FEF3C7`/`#B45309`.

### 1.3 Typography

Fonts and where they appear:

| Font | Source | Use |
|---|---|---|
| **Aptos** (Regular 400, Bold 700, Italic) | Self-hosted TTF in `/public/fonts` | All body text, tables, inputs, buttons. Only two weights are declared so anything heavier than 700 renders as true Bold. |
| **Faster One** | Google Fonts | Page titles, uppercase, teal, 26px (29px on Dashboard, 18px in side panels), weight 400 |
| **Ethnocentric Rg** | fonts.cdnfonts.com | Brand wordmark "META-VOICE" in the sidebar (1.15rem), the **New Sale** button (14px), small caps eyebrows ("SALE SUMMARY", "MANAGER APPROVAL", stat card labels at 9.5px), attendance stat labels (10px). Weight 300. |
| **Rajdhani** 400–700 | Google Fonts | Sidebar nav items (16px, 600, letter-spacing .03em), field labels on sale forms (12.5px, 700, uppercase, .06em), CRM sub-menu, action buttons (12.5px uppercase) |
| **Bebas Neue** | Google Fonts | Big customer names in summary bars (22px, .05em), DID codes (17px), the **Record Sale** button (20px, .12em). Always `font-weight 400; font-synthesis none`. |
| **Outfit** 400–800 | Google Fonts | Login screen headings and button, Profile page headings and numbers |

Type scale in use: table body 12px, table header 11px uppercase .07em bold, form label 10–12.5px uppercase bold with .06–.1em tracking, form input 13–14px, card title 12px uppercase .06em, large stat 24px bold, profile name 25px, login title 38px. On screens under 1024px all inputs are forced to 16px to stop iOS zoom.

### 1.4 Shape, shadow, motion

- Radius: inputs 8px, buttons 9–10px, cards 12px, big cards 14–20px, modals 16–22px, pills 40px / 99px, avatars 50%.
- Card shadow `0 1px 6px rgba(0,0,0,0.06)`; floating menus `0 8px 24px rgba(0,0,0,0.12–0.14)`; modals `0 25px 60px` or `0 32px 80px rgba(0,0,0,0.3)`; summary bars `0 8px 22px -18px rgba(19,46,87,0.6)`.
- Focus ring: border `#8a9aa2` (or teal-500), `0 0 0 3px rgba(30,132,150,0.12)`, field turns white.
- Transitions: 0.15s on hover/colour, 0.2s on sidebar width and drawer, 0.25s on panel widths, 0.3s on progress, 0.4s on bar charts, 0.9s one-time grow on salary bar.
- Scrollbars: 6px, transparent track, `#E0DDD5` thumb, `#9FA7B2` on hover. Spinner: 0.75s linear rotation.
- Page never scrolls sideways; wide content scrolls inside `<main>`.
- Respect `prefers-reduced-motion` on the salary bar animation.

---

## 2. Application shell

### 2.1 Frame

Full-height flex row, `100vh`, overflow hidden, background `#EDF0F3`: **Sidebar (256px)** on the left, **`<main>`** filling the rest and scrolling vertically. A **floating Refresh button** sits above everything.

Breakpoints: **compact = under 1024px** (tablet and phone, sidebar becomes an off-canvas drawer), **phone = under 640px**.

### 2.2 Sidebar

Width 256px, background `#E8EAED`, collapsible to 0 with a 0.2s width transition. In compact mode it is `position: fixed`, 256px wide, `z-index 50`, slides in with `translateX`, with shadow `0 0 24px rgba(0,0,0,0.18)`, and a navy 45% overlay (`rgba(19,46,87,0.45)`, z-index 40) closes it on tap. Tapping any link closes the drawer in compact mode. When collapsed, a small bordered square button (32px desktop with a chevron, 40px compact with a hamburger) sits top-left of the content; it turns teal with white icon on hover.

Top to bottom:

1. **Brand strip**, 52px tall, centred "META-VOICE" in Ethnocentric, navy, bottom border.
2. **User badge**, 6px 16px padding: 52px circular avatar (photo, or teal circle with the first letter, uppercase, white, 14px bold; click opens a file picker to change the photo), then display name (16px, weight 900, navy, ellipsis) over the role label (14px slate), then a 24px "hide sidebar" chevron button.
3. **New Sale button, agents only**: full width, `#7EC8D0` background, navy Ethnocentric 14px text with a plus icon, radius 10, hover opacity .88.
4. **Navigation**, scrollable, 8px 12px padding. Rows: icon (18px, stroke 1.7) + label + optional count badge; Rajdhani 16/600; padding `0.3rem 0.75rem` (0.55rem in compact); radius 8; 2px gap. Active row: background `rgba(242,172,24,0.26)` (gold tint), navy text, teal icon. Hover: `rgba(30,132,150,0.12)` background. Inactive text slate, inactive icon `#9FA7B2`.
5. **Attendance group** is a single row labelled "Attendance" that opens a **hover flyout** (220px white card to the right, radius 10, shadow, 150ms close delay, repositioned to stay on screen) holding the attendance items. The row shows the pending-approval badge.
6. **Notifications** row with a bell and a red unread count (top-right of the bell, 14px, "9+" cap). Click opens a popover above the row (max 320px tall): header "Notifications" with a red "Delete all", filter pills All / Unread (n), a list where unread items have `#EFF6FF` background and a 3px teal left bar, a × delete per item, title bold 12px, body 11px, timestamp 10px in `en-PK` short format. Opening marks all read.
7. **Sign Out** row, turns red (`#D62828` text on `rgba(214,40,40,0.1)`) on hover.

Count badges: 18px tall pill, red `#E53935` with white 10.5px bold text; teal when its row is active; "99+" cap. Badges: Approvals (queue this user acts on), Attendance Approval, Chats (unread).

### 2.3 Navigation per role

- **Admin**: Sales Dashboard, My Team, Clients, Approvals, Sales Report, Attendance (Manage Working Days, Attendance Report, Attendance Approval, Daily Attendance), Accounting, Invoicing & Payments, CRM Management, Chats, Profile.
- **Director**: Sales Dashboard, My Team, Clients, Approvals, Sales Report, Attendance (Report, Approval, Daily), Chats, Profile.
- **Manager, Floor Manager / Team Lead or QA Manager**: Sales Dashboard, My Team, Approvals, Sales Report, Attendance (My Attendance, Leave, Leave Approval), Chats, Profile.
- **Manager, HR Manager**: My Team, Attendance (Manage Working Days, My Attendance, Leave, Report, Approval, Daily), Chats, Profile. Lands on My Team after login.
- **Manager, Accountant**: Sales Dashboard, My Team, Sales Report, Accounting, Chats, Profile.
- **Agent** (Closer, Verifier, Self Closer, Fronter): New Sale button, Sales Dashboard, My Sales, Attendance (My Attendance, Leave), Chats, Profile.

"My Attendance" is hidden for users flagged as not attendance-applicable. Routes live under `/admin`, `/director`, `/manager`, `/agent`; visiting another role's route redirects home.

### 2.4 Floating Refresh button

46px circle (48px compact), fixed bottom-right with 22px margin (18px compact), z-index 35. Background `radial-gradient(120% 120% at 30% 20%, #279AAD, #1E8496 45%, #17707F)`, white refresh icon (20px). Hover: scale 1.05 with a deeper teal shadow. **Press and drag to move it** (4px threshold; cursor becomes `grabbing`, scale 1.06); the position is remembered per page. A tap without moving refetches the page's data and spins the icon for 0.7s; pages with no live data do a browser reload.

### 2.5 Live behaviour

Every list and dashboard refetches silently every 10 seconds, on socket push (new notification, new chat message, any sale change), when the tab regains focus, and when Refresh is pressed. No loading flash on silent refetches. A user is signed out after **10 minutes** of no mouse, key, scroll or touch activity, checked against the clock so it works after sleep. Sessions are per browser tab.

### 2.6 Responsive rules

Desktop (1024px and up): sidebar docked, multi-column grids. Compact: sidebar becomes a drawer, grids collapse to one column, tables scroll horizontally inside their card, DID tiles and cards stack, buttons get a 0.55rem row height. Never allow page-level horizontal scroll. Taps use `touch-action: manipulation`.

---

## 3. Shared components

### 3.1 Page chrome (every list page)

- **Page shell**: padding `0 20px 20px`, min-height 100vh, canvas `#EDF0F3`.
- **Page header**: 52px tall row, wrap allowed, 12px gap. Left: the Faster One title in teal. Right: action buttons.
- **Filter bar**: the signature element. A teal (`#1E8496`) fully rounded bar (radius 40, padding `5px 8px`, 6px gap, wraps) that holds every filter, 8px below the header.
  - *Filter pills*: transparent with 85% white text; selected = navy `#132E57` with white text; 12px / 600; padding `4px 12px`; radius 40.
  - *Pill select* (dropdown): navy button with a chevron, or 18% white when on its "all" value; menu is a white card radius 8, border 1.5px, max-height 220, selected option teal text on `#E5F3F5`.
  - *Separator*: 1px × 22px, 30% white.
  - *Search*: 200px (220–230 on some pages), translucent 15% white fill, 1.5px 35% white border, white text, white 70% placeholder, magnifier icon at left. Search runs on typing or on Enter, as the placeholder says ("Name or phone, then Enter").
  - *Date filter*: pill that turns navy once a value is chosen; dark colour scheme for the native picker.
  - *Filter button* (Export, Reset, Columns): 15% white fill, 1px 40% white border, white 11px bold text. Columns turns navy while open.
  - *Count*: right-aligned white bold 13px, e.g. "12 users", "8 records".
- **Columns picker**: popover 208px wide, white, with a teal-tinted "Select All / Deselect All" row and one checkbox per column (accent teal); at least one column always stays on; choice is remembered per page.
- **Primary button**: `linear-gradient(135deg, #1E8496, #0E5F6E)`, white, 13px bold, letter-spacing .04em, padding `9px 18px`, radius 9, optional leading plus icon. **Secondary button**: white, 1px `#E0DDD5` border, navy text, same size.
- **Pager**: white bordered card radius 12 under the table: "Showing 1 to 20 of 54 users" (12px muted) on the left; Previous · "2 / 3" · Next on the right (white buttons, radius 8, 40% opacity when disabled). Hidden when there is one page.

### 3.2 Data table

White container radius 12, 1px border, horizontal scroll inside. Fixed layout.

- **Header row**: gold `#F2AC18`, text `#1a1a1a`, 11px bold uppercase, .07em, padding `7px 12px`, single line.
- **Body**: 12px text, padding `6px 12px`, **one line per row** (ellipsis on overflow; widen the column to see more), zebra white / `#FAFCFC`, 1px bottom border at 30% of `#E0DDD5`. Clickable rows have a pointer.
- **Resizable columns**: a 6px grab strip on each header's right edge with a 2px dark line; drag to resize (minimum 50px); widths saved per table id in local storage. Index (#), action and view columns are not resizable.
- **Loading**: skeleton rows of 12px grey bars. **Empty**: centred muted message with 48px vertical padding, e.g. "No records found.", "No team members found.", "No clients found. Click New Client to add one."
- Optional sticky header, row context menu, row style (inactive users are 65% opacity), and footer.
- Row action icons are 14px stroke icons in 6px padded square buttons, grey, tinting to their action colour on hover (edit blue, lock amber, disable/delete red, re-activate green).

### 3.3 Form controls

- **Text input** (`.form-input` / `inputCls`): radius 8, 1px `#E0DDD5`, 10px 14px padding, 14px text, fill `#E6EBEE` (or `bg-slate-50`) that turns white on focus with the teal ring. Placeholder `#9FA7B2`. Error state: red-400 border plus a 11.5–12px red `#EF4444` message below.
- **Label** (`.form-label`): 10px, 700, uppercase, .1em, slate. On the sale and approval forms use the Rajdhani variant: 12.5px, colour `#5C6D82`, with a red ` *` for required.
- **Styled select**: searchable combobox. A text input with a chevron; typing filters; the panel is a white card radius 8 with border 1.5px, max-height 200, 13px options, selected = teal bold on `#E5F3F5`, hover `#f7f8fa`, "No results" row. Disabled is `#F9FAFB`. Supports a `loading` state ("Loading…") and a 24px **compact** variant for spreadsheet-dense forms. Participates in native `required` validation through a hidden input.
- **Date input**: native date with a custom 13px calendar glyph at the right that opens the picker.
- **Amount fields**: `$` (green `#065F46`) or `₨` (brown `#92400E`) prefix inside the left padding.
- **CNIC**: auto-formats to `XXXXX-XXXXXXX-X` (max 15 chars) with a hint line.
- **Toggle choice buttons** (Fixed / Variable): two equal buttons, selected = filled blue/teal with white text.
- **Textareas**: `resize: none`, minimum rows set in CRM Management.

### 3.4 Toast

Fixed bottom-right (24px), z-index 50, slides up 200ms. Success `#059669`-family green, error red, info navy `#1B2A4A` with a teal border. Contains a 20px round icon (✓ ✕ i), message in 14px medium white, and a small × close. Auto-dismiss after 3.5 seconds.

### 3.5 Modals and panels

- Standard modal: overlay `rgba(0,0,0,0.4)` (sometimes `backdrop-blur-sm`), white card radius 16 (2xl), max-width sm/xl/2xl as needed, max-height 90vh, header with title and ×, scrollable body, right-aligned footer buttons (Cancel outline, confirm solid).
- **Confirm dialog** (max-w-sm, padding 24): bold question, small grey consequence text, Cancel + coloured confirm (red delete, green re-activate, blue lock).
- **Destructive modals** list the record's name in a red-50 box and spell out "permanently deleted and cannot be recovered".
- **Create / Edit User modal**: 780px wide, background `#F8FAFC`, radius 18, header strip with a `#DDE3EC → #D0D8E4` gradient and 18px weight-900 title.
- **Edit Profile** is a right-hand slide-over panel: `min(560px, 100%)` wide, full height, white, blurred navy 35% backdrop.
- **Section cards inside forms**: white radius 12, header band with a `#E4E9F0 → #EDF0F5` gradient and a 12px bold uppercase .1em muted title; or, on sale pages, a **gold header band** (see 5.2).

### 3.6 Summary bar

White card radius 14, 1px border, soft shadow, `overflow: hidden`, one row. Left block: the record's name in Bebas Neue 22px white over a gradient in the **vertical's colour** that fades to transparent across 8 stops, with an Ethnocentric eyebrow above ("SALE SUMMARY", "MANAGER APPROVAL", "FINAL APPROVAL", "SALE RECORD") and the phone below. Then icon-bubble blocks: a 32px radius-10 tinted square (colour at 10% alpha) with a 15px icon, a Rajdhani 12px uppercase muted label, and a 13px bold navy value (Vertical pill, DID in Bebas with CPA/CPL badge, Address, Agent). Right side: progress ring and action buttons. On narrow containers the Agent block is hidden by a container query (max-width 820px).

### 3.7 Vertical pills

A centred white capsule (1px border, radius 8, padding 3) holding one button per active vertical: `padding 5px 14px`, radius 6, 12px; selected = filled with the vertical's own colour, white text, bold; unselected = transparent slate. Below it a 3px strip of equal segments in each vertical's colour (35% opacity, 100% for the selected one). The same capsule-plus-strip pattern is used for approval queues, with a count chip (10px bold, radius 3, white on the pill colour or 25% white when selected, "999+" cap).

### 3.8 Progress ring

44px SVG ring, 5px stroke, track `#F0EDE5`; fill gold while incomplete and teal when complete; centre text "done/total" in Bebas 14px.

---

## 4. Authentication screens

### 4.1 Login (`/login`)

Full-viewport centred layout on a soft grey gradient: `radial-gradient(1200px 700px at 20% 10%, #f3f6f8, transparent 60%), radial-gradient(900px 600px at 90% 90%, #d9e0e4, transparent 55%), linear-gradient(135deg, #eef1f3, #dde3e7 50%, #cdd5da)`, with two blurred circles (white top-left, grey-blue bottom-right) and a faint noise grain. Palette here is **slate-steel, not teal**: text `#4a5a63`, accents `#5d6f78`, `#8a9aa2`.

Glass card, max-width 432, padding `44px 38px`, radius 22, white 85→70% gradient, `backdrop-filter: blur(20px) saturate(1.1)`, 1px white 70% border, large soft shadow. Inside:

- Logo (130px, drop shadow), "User Login" in Outfit 38px bold `#4a5a63` tight tracking, then "WELCOME TO META-VOICE" in 13px, .22em, uppercase, `#8a9aa2`.
- Error banner when needed: red 8% fill, `#fca5a5` border, warning icon, `#b91c1c` 13px text.
- **Email or User ID** field and **Password** field: 12px radius, `#e6ebee` fill, leading 18px icon (user, lock), 15px text, 16px vertical padding; focus turns white with a ring; password has an eye / eye-off toggle. Browser autofill tint is overridden to match.
- Row: custom checkbox "Remember me" (18px, radius 5, filled `#5d6f78` with white tick; it remembers only the identifier, never the password) and an italic "Forgot your password?" link.
- Gradient divider, then the **Login** button: full width, 16px padding, radius 12, `linear-gradient(180deg, #5d6f78, #4a5a63)`, Outfit 15px, 600, .18em uppercase, with an arrow icon; while submitting it shows a spinner and "Signing in…" at 70% opacity.

**After sign-in, optional full-screen interstitials:**
1. *Attendance marked*: glass card (360px), 64px steel circle with a white tick, "Attendance Marked" or "Late Attendance Marked", the date, the time in Outfit 3rem bold, an optional "LATE +n min" pill, and an "OK, GOT IT" button.
2. *New month detected* (HR/admin only): dark overlay `rgba(6,19,33,0.92)`, slate card with a brown gradient top rule, calendar icon, month and year in brown Rajdhani, explanatory text, and two buttons: "Remind Me Later" (outline) and "Setup Now" (brown-gradient).

### 4.2 Forgot password (`/forgot-password`)

Same glass card at 30px heading, with the logo at 110px. Five steps with a status subtitle under the title and a "Back to sign in" link at the foot:
1. **Reset your password**: one Email or User ID field plus hint "We will email a 6 digit code…" and **Continue**.
2. **Confirm your address**: a read-only masked email field with a lock icon (cannot be edited, so the code cannot be misdirected), the account name, **Send code**, and a "Use a different account" text link.
3. **Enter your code**: single numeric field, `000000` placeholder, 20px bold with .5em letter spacing, auto-focus, `one-time-code`; **Verify code**; a resend link that counts down "Resend code in 45s".
4. **Choose a new password**: New and Confirm fields with an eye toggle, minimum 8 characters, mismatch error.
5. **Password updated**: 64px tick circle, "You have been signed out everywhere else", **Go to sign in**.
Notices use a teal-tinted box (`rgba(30,132,150,0.08)`, `#9ccdd6` border, `#1A5560` text).

---

## 5. Sales workflow

### 5.1 Pipeline

`PENDING` (agent submits) → `APPROVED` (QA/Floor manager) → `FINAL_APPROVED` (director/admin). Rejections: `DISAPPROVED` by manager, `FINAL_DISAPPROVED` by director/admin, `AGENT_REJECTED` by the agent on entry. Only QA and Floor managers act on stage one; only directors and admins act on stage two. Everyone else sees queues read-only. Agents and managers see DID codes only; directors and admins also see client names and rates. Once decided, the DID, client and rate are frozen on the record.

### 5.2 New Sale (agent)

One screen on desktop, built from the **CRM Management > Sale Form** configuration (sections, order, labels, placeholders, required flags, widths, dropdown options, visibility).

1. **Vertical pills** (3.7) centred at the top. Verticals come from the Verticals list (name, colour, order; "Other" allowed). Error text appears under them in red.
2. **Summary bar** (3.6): customer name (or "New Customer"), phone ("No phone yet"), Vertical, DID (hidden for Other), Address (grows), a divider, a **progress ring** with "Required fields" caption, then **Reset** (brick-tinted outline, Rajdhani 13px uppercase) and **Record Sale** (teal gradient, Bebas 20px, .12em, shadow `0 10px 22px -12px rgba(30,132,150,.9)`, "Submitting…" while busy). The summary colour is teal until a vertical is chosen, then takes that vertical's colour.
3. **Card grid**, six columns, 12px gap, stretching to the bottom of the screen: the **DID card** takes 2 columns beside the **first form section** (4 columns); the remaining sections sit two per row (3 columns each), a lone last section spans all six. Under 1024px everything stacks.
4. **Section card**: white radius 12, **gold `#D7A520` header band** with a 14px section icon (person, location pin, notes), 11px bold uppercase title, and at the right a "done/total" pill that becomes a dark "✓ Done" pill when every required field is filled. Field widths follow `full=6, two-thirds=4, half=3, third=2` of a six-column grid. Textarea fields are drawn as large boxes filling the bottom of their card (minimum height = rows × 20 + 18).
5. **DID card** states: no vertical yet = dashed 2px border placeholder with an up arrow, "Pick a vertical above to see its DIDs"; Other = a single "Specify Other" text field; loading = "Loading DIDs…"; empty = amber warning "No active DIDs found for {vertical}"; otherwise a scrollable (max 112px) grid of **DID tiles**, `repeat(auto-fill, minmax(68px, 1fr))`, 7px gap. Each tile: 9px phone icon + DID code in Bebas 17px, plus a small CPA/CPL badge; radius 9; border 1.5px. Selected tile fills with `linear-gradient(145deg, vertical colour, navy 150%)`, white text, and a 15px white tick badge on its top-right corner. Below: "n DIDs available for {vertical}" in Rajdhani 13px.
6. **Validation**: a missing vertical or DID shows an error toast and inline red text; server field errors highlight each field and toast "Please fix the highlighted errors." Success toast: "Sale recorded successfully!" and the form resets.

### 5.3 My Sales (agent)

Standard list page titled **My Sales**. Filter bar: pills All / Pending / Approved by Manager / Rejected by Manager / Final Approved / Final Rejected / Rejected by Agent; separator; search "Name or phone, then Enter" (230px); record count. Table columns: # (50), Name (bold navy), Phone, ZIP, Vertical, DID, Date, Status (badge), View (teal text link). Pager "records". Clicking a row or **View** opens a 2xl detail modal with sections Personal Information, Address, Business Information, Additional Information, a blue "QA Comments" block, Notes, and Timestamps (PKT and EST).

### 5.4 Approvals (managers, directors, admins)

A full-height **master-detail** layout with no page header.

- **Left panel** (340px, collapsible to 0 with a chevron; background `#EDF0F3`, right border): 52px header with the Faster One queue name (18px) and a collapse chevron; a white search field ("Search name or phone, then Enter", clear ×); a scrolling list of compact record buttons (radius 8, border teal when selected, `#E8EEF7` fill): a 16px index chip (`#A5D8DD`), the customer name in bold 12px, a DID chip, and an agent chip coloured in the current queue colour. Footer: "Page 1 of 3 · 54 records" with Prev / Next.
- **Right panel** (`#f7f8fa`): the queue pills at the top (**Manager Approval**, **Final Approval**, **All**, each with a live count), then the empty state ("←  Select a record to view details") or the record.
- **Record view**: the summary bar (stage eyebrow, name, phone, Vertical, DID with CPA/CPL, Agent) with its action buttons on the right: **Approve** (green gradient `#16A34A → #15803D`), **Reject** (red `#DC2626 → #B91C1C`), **Edit** (white outline), **Delete** (red tint, final approvers only); in edit mode **Save** (teal) and **Cancel**. Below it an auto-fit grid (`minmax(340px, 1fr)`) of gold-header cards: **QA Comments** (editable textarea for the reviewing manager), **Personal Information**, **Address**, **Sale Details** (Vertical, DID, Sale Type; Client, Rate Type and Rate for final approvers; "Entered at approval" in italic brick for variable rates), **Additional Information**, and **Timeline** (sale time PKT and EST, approved/rejected/final timestamps, plus DID, client and rate at close). Read-only values use the Rajdhani label over a 13.5px bold value, with "Not entered" in grey; the phone has a copy button (22px, turns green with a tick for 1.5 seconds). Edit mode swaps values for inputs and selects; changing the vertical clears the DID and reloads its list.
- **Modals**: *Approve / Reject Sale* has a slim header whose green or red colour fades out to the right (Ethnocentric "MANAGER APPROVAL" eyebrow, Bebas title, customer name); reject requires a Reason of Cancellation (searchable select) and takes an optional note. *Final Reject* shows a red-50 box "Reason: Rejected by Client". *Enter Rate for Final Approval* appears for variable-rate clients: amber notice and a required USD amount field. *Permanently Delete Record* is a red confirmation. Success toast "Action completed successfully."

### 5.5 Sales Report

Standard list page, all roles, titled **Sales Report**. Filter bar: period pills **Today / This Week / This Month / Overall / Custom**, From and To date pills, pill-selects for Status, Vertical, Agent (hidden for agents), DID/Client (company filter for final approvers), Columns picker, Export (CSV or Excel), Reset, and a record count. Table columns: Name, Status, Vertical, Agent*, DID, Sale Type, Client†, Rate Type†, Rate†, Rejection Reason (red when present), Pak Time, USA Time, Date (*not for agents, †final approvers only). Frozen DID, client and rate are shown for decided sales. Row click opens the detail modal, which has a **teal gradient header** (`#0E5F6E → #1E8496`, white name, status badge) and sections with grey band headings (`rgba(61,71,83,0.08)`, uppercase .1em navy) in a two-column grid.

### 5.6 Sales Dashboard

Padding `0 18px 14px`. Header row: "Dashboard" (Faster One 29px teal) at the left and a white capsule of period buttons at the right (**Today, This Week, This Month, Custom**; selected = navy, white text, 11px; Custom shows the chosen range in 9px). Custom opens a small centred modal "Select Date Range" with From and To date fields (max = today) and Cancel / Apply.

Content blocks, 10px gaps, all cards white radius 8 padding `12px 14px` with a 12px uppercase .06em navy title:
1. **Four stat cards** (2 columns, 4 on xl): TOTAL CUSTOMERS (navy), APPROVED (teal, with approval-rate hint), PENDING (gold), REJECTED (brick). Each card is a 135° gradient from its tint to white, 1px border at 20% of its colour, min-height 80, Ethnocentric 9.5px label, 24px bold value, and a right-hand breakdown list (Approved: By Manager / By Director; Pending: At Manager / At Director; Rejected: By Agent / By Manager / By Director). A skeleton bar shows while loading.
2. **Performance row** (1.5fr / 1fr on large screens): a Recharts combo chart (168px tall) with navy bars for Submissions and a gold line for Approvals; for "Today" it is the hourly chart "Today's Shift (7 PM to 4 AM PKT)", otherwise the "Last 7 Days" daily chart. Beside it (hidden for agents) the **Top Agents by Approval Count** leaderboard: name (80px), a 17px bar on `#EDF0F3` with the count inside the bar, and the approval rate at the right; bars cycle navy, teal, gold, khaki, brick.
3. **Three donut cards**: Approval Rate (centre shows "% APPROVED"), Sales by Vertical (centre total; slices use each vertical's colour), Sales by Client (approved). Each has a 148px donut and a legend with swatch, name and percentage.
4. **Sale Type (CPA vs CPL)** as a proportional treemap strip (148px tall, 2px gaps, gold 14px bold labels) and **Cancellation Reasons** as a donut with legend.
5. **Monthly** period only: "Monthly Performance, Last 12 Months", an area (teal, 12% fill) plus navy bars.
Empty chart states are muted 11px text ("No data", "No approved sales", "No cancellation data"). Tooltips are small white cards with a `#E0DDD5` border.

---

## 6. People and clients

### 6.1 My Team (Users)

Title **My Team**. Header actions: **Export** (secondary, download icon) and **New User** (primary, plus icon; only for roles that can create). Filter bar: role pill-select (All Roles + roles visible to the viewer; hidden for managers), Active / Inactive / All pills (starts on Active), search, Columns picker, user count.

Columns (all toggleable): User ID (teal bold with tracking), Name (20px navy initial circle, grey when inactive, bold name), Role badge, Role Type chip, Department, Contact (email or phone), Joined, Basic Salary (brown `#AA7F56`, "PKR 85,000" or N/A), Status (Active/Inactive pill, "since {date}", Locked pill), Actions. Action icons: Edit, Lock/Unlock profile (admin only, amber when locked), Disable (user-minus), Re-activate (tick), Delete permanently (bin; not on yourself).

**Create / Edit User** modal sections:
- *Account*: three columns, Role (select, locked text on edit), Type (Agent Type / Manager Type / "Not applicable"), Department; then User Code (read-only teal bold, auto-generated, "Loading…"), Email, Password (visible text, defaults to `12345678` on create, "Leave blank to keep the current password" on edit).
- Sections driven by the Profile Form configuration (personal, contact, identity, bank, salary…) in a six-column grid. **Display Name** is inserted right after Father Name. The salary section ends with a **Total Package** line (brown, PKR).
- Footer: Cancel and **Create User** / **Save Changes**.
Other dialogs: *Disable user* asks for a required "Inactive From" date (max today) with helper text; *Delete* explains it is refused if the user has sales; *Lock* and *Re-activate* are simple confirms.

### 6.2 Client Management (admin, director)

Title **Client Management**. Header: **DID Pool** and **Verticals** secondary buttons plus **New Client**. Filter bar: campaign pills (All Campaigns + each vertical except Other), Active / Inactive / All, search "Company or DID, then Enter" (220px), count. Columns: Company (bold), Campaign (vertical-coloured badge: colour text on 12% tint), Assigned DID (teal bold), Type (CPA/CPL), Rate Type, Rate, Opening Bal., Cycle ("30d"), Status, Actions.

**Client form** (modal, max-w-xl, driven by the Client Form configuration): Company Name, Campaign (select of non-Other verticals), Assign DID (disabled until a campaign is chosen; shows available DIDs for that campaign; amber note when none), Sale Type (CPA/CPL), Opening Balance (USD, helper text for migrated clients), Rate Type toggle (Fixed / Variable), Rate Per Sale (shown for Fixed) or an amber notice for Variable, Cycle (Days) and Billing Starts After (Days) side by side, Notes, then any custom fields. Submit is a blue/teal "Create Client" / "Save Changes".

**DID Pool** modal (wide): add form (DID code, max 10 characters, e.g. MD21; campaign select; Add) and a gold-header table with DID, Campaign badge, Assigned To ("Available" or the client), Status, and Activate/Deactivate (disabled with a tooltip while assigned). Inactive rows are 50% opacity.

**Verticals manager** (modal, also a CRM Management screen): list of up to 10 verticals with name, colour swatch picker (palette grid plus a "Any colour" custom picker), sort order, active toggle, usage counts (sales, clients, DIDs); a vertical in use can be turned off but not deleted; renaming carries over to sales, clients and DIDs. "Other" is the single free-text vertical and never has DIDs.

---

## 7. Attendance and leave

Business rules shown in the UI: attendance is marked at first login inside a window; lateness is measured from the official login time; weekends and holidays come from a monthly working-days calendar; times display in 12-hour format; the HR desk (admin, director, HR manager) handles everyone's attendance and leave, while Floor and QA managers only approve their agents' leaves.

### 7.1 My Attendance

Title **My Attendance** (Faster One). A row of **eight stat cards** (flex, equal width, min 80, radius 10, tinted fill, 1px border at 19% of the border colour, 20px weight-900 number, 10px Ethnocentric label): Total Days, Working Days, Present, Absent, Late, Leave, Weekends, Not Joined. A teal filter bar holds Month and Year pill-selects, a **List / Calendar** switch (white selected segment with teal text), and the "Month Year" label.

*List view*: gold header, columns # / Date / Day / Login Time (teal bold, with a gold "EDITED" tag) / Status (pill plus "+12m" late chip) / Approval (Approved green `#BBF0D6`, Pending red `#FECACA`); weekend and not-joined rows at 65% opacity; row hover `#F8FAFC`; "N/A" for non-applicable cells.

*Calendar view*: a slate `#64748B` header bar with the employee name (22px, 800), role chip, month chip and live counts (Present green, Absent red, Late amber, Leave blue). Under it a seven-column weekday header with a 2px gold underline, then day cells (min-height 86, radius 10, status-coloured fill): day number top-left (today = 22px teal circle with white digit and a teal 2px border), status pill top-right (9px bold uppercase), the login time centred (16px, weight 900), a late-minutes chip bottom-centre (`#fef3c7` with `#b45309` text), and a 6px gold dot top-right when manually edited.

### 7.2 Attendance Report (HR desk)

Title **Attendance Report**. Two modes: a roster table of employees with per-month Present / Absent / Late / Leave totals, and an **employee drill-down** that shows the same slate-header calendar as 7.1 with colours Present `#bbf7d0`, Late `#fde68a`, Absent `#fecaca`, Leave `#bfdbfe`, Holiday `#ddd6fe`, Off `#e2e8f0`, Not Joined `#fef3c7`. HR can open a day to **edit** it: a segmented status control (Present teal, Late `#d97706`, Absent `#dc2626`, Leave `#2563eb`), a login-time field, and a reason, and the day then shows the gold "edited" dot. An "Opening Details" dialog (17px, 900 weight) records an employee's opening balances.

### 7.3 Attendance Approval

Title swaps between **Attendance Approval** and **Leave Approvals**. HR-desk users get a module switch (Attendance | Leave Approvals; navy when selected); managers see only leaves. Each module has status pills **All / Pending / Approved / Rejected**, search, and a table. Attendance columns: #, Name (bold), Role, Date, Login Time, Status, Late, Approval, Actions (Approve and Reject buttons only on pending rows). Leave columns: #, Applicant, Role, Type (capitalised), From, To, Days, Reason, Status, Actions; rejecting a leave asks for a reason. The sidebar badge shows the pending count.

### 7.4 Daily Attendance (HR desk)

Title **Daily Attendance**, with a date control. Three coloured sections: **Present** (teal border, `#EAF5F7`), **Absent** (red, `#FEF2F2`), **Leave / Holiday** (blue, `#EBF3FD`), each headed by a count and holding a table of staff with a status pill (Present `#E6F4F6`, Late `#FFF3E0`, Absent `#FFEBEE`, Leave `#E3F2FD`, Holiday `#F3E5F5`).

### 7.5 Manage Working Days

Title **Manage Working Days**, month and year selectors, four stat cards (Working green, Weekends slate, Holidays blue, Total teal), and a table of every date with a day-type select (Working Day / Weekend / Holiday). Choosing Holiday reveals an inline required "Holiday reason" field. A Save control commits the month. The first login of a new month prompts HR to set this up.

### 7.6 My Leave

Title **My Leave** with an **Apply for Leave** button. Four stat cards: Total (`#A5D8DD`), Pending (blue `#BDDAF8`), Approved (green `#BBF0D6`), Rejected (red `#FECACA`). Table: #, Type (bold navy), From, To, Days, Reason, Status badge, Reviewed By, Rejection Reason (red); empty state "No leave applications yet. Click “Apply for Leave” to submit one." The **Apply** modal has a Faster One heading, Leave Type select (Sick, Casual, Annual, Other), From and To dates, and a Reason textarea.

---

## 8. Messaging (Chats)

Deliberately **WhatsApp-like**, scoped to this page: panel white, chat background `#EFEAE2`, header `#F0F2F5`, brand green `#008069`, sent bubble `#D9FDD3`, received bubble white, text `#111B21` / `#667781`, border `#E9EDEF`, online dot `#25D366`, read ticks `#34B7F1`.

- **Two panes**: conversation list on the left (All / Unread filter, search "Search people…", New chat, New group) and the open conversation on the right. On phones the panes swap (list, then chat with a back arrow).
- **Avatars**: circular, photo or first letter on a grey-blue gradient; groups use a teal gradient with a people glyph.
- **Presence**: "active now" or "last seen just now / n minutes ago / n hours ago / yesterday at 4:05 PM / 12 May at 4:05 PM"; live updates over the socket.
- **Messages**: sent/delivered/read **ticks**, reply-to quote block, image and file attachments, voice notes with a play button, a 240px waveform scrubber and a blue progress dot, quick emoji tray (😀 😂 😍 😊 👍 🙏 ❤️ 😢 😮 😡 🎉 🔥 ✅ 👏 🤝 📌), right-click / long-press menu (clamped on screen) with reply and delete, and live deletion for everyone.
- **Unread** counts on conversations and on the sidebar Chats item.
- **Groups**: *New group* modal (80vh, group avatar, name up to 60 characters, searchable multi-select of people with 20px round check circles, "Create group"); *Group info* modal (72px avatar, inline rename, member list with green "Admin" chips and red remove buttons, add members, red "Leave group" button with confirmation).
- Each contact shows name plus role label such as "Manager (HR Manager)" or "Agent (Closer)".

---

## 9. Finance

### 9.1 Invoicing & Payments (admin)

Title **Invoicing & Payments**, with a tab bar: **Revenue Reports, Invoices, Customer Balances, Create Invoice** (selected tab is a filled rounded button). Period pills Today / This Week / This Month / All Time / Custom.
- *Revenue Reports*: three tables, Client-wise, Agent-wise and Vertical-wise revenue.
- *Invoices*: table with status (pending, sent, overdue, received); row buttons **Mark Sent** and **Mark Received** (teal).
- *Customer Balances*: "Client Balance Tracker" with dark header band.
- *Create Invoice*: cards, one per pending billing period, showing Billing Period (start → end), sales count, Subtotal, and a **Create Invoice** button. The modal has a dark gradient header, Sales in period, Subtotal, Total Amount, and a required Payment Receipt Date. *Mark as Received* needs a Payment Received Date.

### 9.2 Accounting (admin, accountant)

A single combined bar: white, bottom border, 48px tall tabs (13px, 600; selected = teal text with a 2px teal underline) scrollable on small screens: **Home, Chart of Accounts, Classifications, Record Transaction, Bills & Suppliers, General Ledger, Trial Balance, Reports, Dimensions**. Content padding `8px 24px 24px`. Colours reuse the CRM palette (navy, teal, `#0E5F6E`, gold, brick for negatives). Amounts are PKR with two decimals.
- **Home**: grouped shortcut tiles: Accounts (Chart of Accounts, Classifications), Record Transaction (Cash Payment, Bank Payment, Record Bill, Sales Invoice, Cash Receipt, Bank Receipt, Journal Entry), Bills, TB & GL, Reports (Profit & Loss, Balance Sheet), Dimensions (Cost Centres, Locations).
- **Chart of Accounts**: searchable table with Code, Account Name, Type, Sub-Classification (L2), Classification (L3), Asset Class (L4), Currency, Posting; type filter; Add/Edit Account modal with "+ Add Main/Sub/Notes/Sub Notes Classification…" inline options; "Auto-create paired account?" prompt; PDF and Excel export.
- **Classifications**: per account type, add and manage the classification hierarchy.
- **Record Transaction**: voucher types Cash Payment (CPV), Bank Payment (BPV), Cash Receipt (CRV), Bank Receipt (BRV), Sales Invoice (INV), Journal Entry (JV); a spreadsheet-style line grid with compact selects (account, cost centre, project, location, party), debit and credit inputs (mutually exclusive per line), and running totals that must balance.
- **Bills & Suppliers**, **General Ledger** (every posted line with running balance, account filter), **Trial Balance** ("Debits must equal Credits; any discrepancy indicates an error"; columns OB Dr/Cr, Activity Dr/Cr, Closing Dr/Cr).
- **Reports**: Profit & Loss (Revenue, Expenses, optional comparison period), Balance Sheet (Assets teal, Liabilities red, Equity navy), Accounts Receivable Ageing (buckets and days overdue), Cash Flow Statement; each exports to PDF and Excel.
- **Dimensions**: tabs 📍 Locations, 🏢 Cost Centres, 📋 Projects, each with a description line, search, status chips (Active green, Completed blue, On Hold amber, Cancelled red) and an Add / Edit modal.

---

## 10. CRM Management (admin)

A page with its **own second sidebar** (260px, `#E8EAED`, right border, collapsible to a 22px edge tab) beside the content. Sidebar header "CRM Management" (Faster One 18px); items in Rajdhani 16/600 with an icon and a 3px left accent bar when active (active fill `#E8EEF7`): **User Access Level, Sale Form, Client Form, Profile Form, Verticals**, and an expandable **Attendance Settings** group with dot-marked children **Attendance Time** (teal) and **Applicability** (purple). The content header shows the section title in Faster One and, for attendance, a grey chip with the sub-section.

- **User Access Level**: table (Name, Username, Role select, Department, Status, Action) where changing a role reveals a per-row Save button.
- **Sale / Client / Profile Form builders**: a how-it-works note card, sections that can be renamed (pencil), deleted when empty, and reordered; each field is a row with Label / Placeholder, Type, Options, **Visible** and **Required** switches, Width (full, two-thirds, half, third), textarea Rows, and edit (blue) and delete (red) icons. *Add New Field* / *Edit Field* / *Edit Options* open modals with a dark gradient heading. Core fields can be hidden or relabelled but not deleted; options for the vertical field are managed in Verticals.
- **Attendance Time**: Weekday and Weekend settings, each with "ATTENDANCE TIME" (window start; logins at or after it are marked) and "LOGIN TIME" (official hours start, late minutes counted from it), plus a late-grace minutes field.
- **Applicability**: choose which users are tracked for attendance.

---

## 11. Profile (all roles)

One-screen layout on desktop (full height, scrolls on compact), canvas `#EDF0F3`, 12px gaps, built from white cards of radius 18 with a soft navy shadow. Headings use **Outfit**.

1. **Header card** (radius 20): a 74px cover banner with a navy → `#1A4672` → teal gradient, soft gold and cyan glows and a fine diagonal-line texture; top-right a frosted-glass **Edit Profile** button (or "Profile locked by admin" with a lock icon). Below, an 88px avatar overlapping the banner with a conic teal/gold ring, 4px white border and a small teal camera button (click either to upload; "Remove photo" link). Name (Outfit 25px bold), role chip (teal tint), role-type chip (gold tint), Active/Inactive dot chip, and a right-hand facts strip separated by hairlines: **User ID, Department, Joined, With us** (tenure such as "2 yrs 3 mos", teal).
2. **Three-column grid** below: **Personal Information** styled as a **national ID card** (pattern of tiny radial rings over a soft mint gradient `#EDF7F4 → #F8FCFB → #E4F2EE`, 5px teal-to-navy bar on the left, Name at 19px bold, Father Name, then a two-column grid of email, phone, date of birth, experience and any extra fields); **Identity & Address** (CNIC in tracked Outfit, permanent and current address) as icon-bubble rows with dashed separators; **Bank Details** as a **bank card** (navy → `#1B4F7E` → teal gradient, gold glow, gold chip, masked number "•••• •••• 1234", Account Title, then a grey IBAN strip grouped in fours).
3. **Monthly Salary** card (spans two columns): "PKR" in gold beside the total at 30px, a 10px segmented bar (teal, gold, navy, brick) that grows in over 0.9s, and a legend grid of components. Empty state "Salary details are not set yet. HR adds them."
4. **Security** card with an **Update Password** button in its header: Current, New, Confirm fields in a row and a four-segment **strength meter** (red, amber, green, teal; labels Weak / Fair / Good / Strong).
5. **Edit Profile** slide-over (see 3.5): display name plus the Profile Form sections, with joining date, department and salary shown read-only (managed by HR), Cancel and Save Changes. Success toasts: "Profile updated successfully.", "Profile photo updated.", "Password changed successfully."

The profile photo is stored on the server and is the same image shown in the sidebar and chat.

---

## 12. States, accessibility and content rules

- **Loading**: skeleton bars in tables and stat cards, grey pulsing blocks on Profile, a 32px teal-top spinner for full-page loads, "Loading…" inside selects.
- **Empty**: a friendly one-liner in muted text, never a blank panel; include the next action when one exists.
- **Errors**: inline red field messages, red banner at the top of forms or pages (`#FEE2E2` with `#FCA5A5` border and `#991B1B` text), and a toast for action failures.
- **Destructive actions** always confirm; permanent deletes say so and name the record.
- **Disabled** controls drop to 60% opacity and `not-allowed`.
- **Tooltips** via `title` on every icon-only button (Edit, Lock profile, Collapse list, Refresh (drag to move), Change profile photo, Delete notification).
- Icons are Heroicons-style outline (stroke 1.6–2.2, round caps and joins), 13–18px.
- **Time zones**: sales are reported on US Eastern dates; staff attendance, books and shift charts use Pakistan time (Asia/Karachi). Sale timestamps show both PKT and EST. Dates display as `12 May 2026`; times as `07:47 AM`.
- **Numbers**: sales rates in USD (`$1,250.00`), payroll and accounting in PKR (`PKR 85,000`).
- Contrast: body text navy on white or `#EDF0F3`; white text only on teal, navy, gold-dark, green, red or gradient fills; never grey text under 11px on a coloured fill.
- Keyboard: Enter submits search fields and forms, Escape closes menus (outside click also closes popovers), tab order follows visual order.

---

## 13. Fluid responsive architecture (mobile, phablet, tablet)

This section **overrides section 2.6 and every fixed pixel size above on small screens**. Build the responsive layer with native Web APIs and standard CSS only: no third-party libraries, no utility frameworks (Tailwind), no component libraries (Bootstrap), and no JavaScript-driven layout managers (no `matchMedia` hooks that choose layouts). Layout decisions live in CSS.

**13.1 Viewport and root scaling**
- `<meta name="viewport" content="width=device-width, initial-scale=1.0">` in the document head, so browsers never apply synthetic desktop downscaling.
- Global reset: `*, *::before, *::after { box-sizing: border-box; }`.
- `html { font-size: 100%; }` (the browser's 16px default), so the UI honours the user's OS and browser font-size settings. Size spacing and type in `rem`; keep `px` only for 1px borders and hairlines.

**13.2 Fluid typography** (no font-size media queries)
- Body copy and paragraphs: `font-size: clamp(1rem, 0.95rem + 0.25vw, 1.125rem);` (16px to 18px).
- Subheadings (H3, H4): `clamp(1.25rem, 1.15rem + 0.5vw, 1.5rem);` (20px to 24px).
- Primary headers (H1, H2), including the Faster One page titles: `clamp(1.75rem, 1.5rem + 1.25vw, 2.5rem);` (28px to 40px), so titles never truncate on phones.
- Table text and dense form labels keep their small sizes from section 1.3, but are expressed in `rem` and never go below 0.75rem. Inputs stay at or above 1rem on touch widths.

**13.3 Layout engineering**
- Build with Flexbox and CSS Grid only. Use `fr` units, percentages and `flex-wrap: wrap`; no fixed widths on containers.
- Mobile first: base styles target the narrowest phone, then two `min-width` queries add density:
  - `@media (min-width: 600px)`: mobile landscape and small portrait tablets.
  - `@media (min-width: 900px)`: medium and large landscape tablets (for example iPad Pro), where the sidebar can dock.
- Columns span by arithmetic, not static widths, for example `flex: 1 1 calc(50% - var(--gap))`, or `grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr))`.
- Applied to this product:
  - Stat card rows, dashboard chart cards, profile cards and Approvals detail cards: one column on phones, two from 600px, the existing three to four columns from 900px.
  - Tables stay inside a horizontally scrollable card (`overflow-x: auto`); the page itself never scrolls sideways.
  - The teal filter bar wraps onto several lines instead of scrolling.
  - The six-column form grid collapses to one column on phones, three on 600px and up, and the designed six from 900px.
  - The sidebar is an off-canvas drawer below 900px and docked at 256px from 900px. The Approvals master-detail shows list or detail one at a time below 900px.
  - Tap targets are at least 2.75rem (44px) high on touch widths.

**13.4 Media assets**
- `img, video, svg, canvas { max-width: 100%; height: auto; }` so replaced elements stay inside shrinking parents. Charts and the profile avatar keep an explicit aspect ratio (`aspect-ratio`) rather than a fixed pixel height.

**13.5 Compatibility note for this codebase**
The current app is built with Tailwind classes and inline style objects, with layout switched in JavaScript through `useCompact` (under 1024px) and `usePhone` (under 640px). Delivering 13.1 to 13.4 literally means moving layout into plain stylesheets and removing those hooks and the Tailwind dependency. Treat this as a phased migration, one screen family at a time, starting with the shell and shared components.

---

## 14. Deliverables to produce

1. A plain `globals.css` (CSS custom properties, no Tailwind) containing the tokens in section 1, the font-face declarations, the section 13 reset and fluid type, `.card`, `.form-input`, `.form-label`, `.btn-primary`, `.badge`, scrollbar and spinner styles.
2. The shared components in section 3 (`PageChrome`, `DataTable`, `StyledSelect`, `PillSelect`, `DateInput`, `Toast`, summary bar, vertical pills, progress ring, modals).
3. The shell (`AppLayout`, `Sidebar`, `RefreshButton`) with role-based navigation.
4. Every screen in sections 4 to 11, role-gated as described, each using the shared components so the whole product reads as one system.
5. Responsive behaviour per section 13, verified at 375px, 600px, 768px, 900px and 1440px.
