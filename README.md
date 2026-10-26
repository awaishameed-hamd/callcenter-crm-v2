# Metavoice CRM

Call center CRM, live at **https://metavoice.cloud**. Agents submit sales, managers and directors approve them, and the rest of the app covers reports, team, clients and DIDs, attendance, leave, HR interviews, chat, invoicing and accounting.

## Stack

| Part | Tech | Folder |
|---|---|---|
| API | NestJS 10, Prisma 5, PostgreSQL | `apps/api` |
| Web | Next.js 14 (app router), React 18, Tailwind | `apps/web` |
| Shared enums and constants | TypeScript package `@crm/shared` | `packages/shared` |

It is a pnpm + Turborepo monorepo. Node 20+ and pnpm 9+ are required.

## Run it locally

```bash
pnpm install
pnpm --filter @crm/shared build        # web and api import the built package

# API: copy apps/api/.env.example to apps/api/.env and fill it in, then
cd apps/api
npx prisma migrate deploy               # create the tables
npx ts-node prisma/seed.ts              # admin user (ADMIN / SEED_ADMIN_PASSWORD) and default settings
pnpm dev                                # http://localhost:4000/api

# Web: copy apps/web/.env.example to apps/web/.env.local, then
cd apps/web
pnpm dev                                # http://localhost:3000
```

After editing anything in `packages/shared`, run `pnpm --filter @crm/shared build` again.

## Roles

`ADMIN > DIRECTOR > MANAGER > AGENT`

- **Manager types:** Floor Manager/Team Lead, QA Manager, HR Manager, Accountant
- **Agent types:** Closer, Verifier, Self Closer, Fronter

Admins, directors and HR managers form the "HR desk" (attendance and everyone's leave). The rules live in `apps/api/src/common/utils/staff-policy.ts` (enforced) and `apps/web/src/lib/roles.ts` (what the UI shows).

## Sale pipeline

```
agent submits             -> PENDING
QA/Floor manager approves -> APPROVED          QA/Floor manager rejects -> DISAPPROVED
director/admin approve    -> FINAL_APPROVED    director/admin reject    -> FINAL_DISAPPROVED
agent cancels on entry    -> AGENT_REJECTED
```

Only QA Managers and Floor Managers/Team Leads act on the first stage (`isSaleReviewer` in staff-policy.ts and lib/roles.ts); directors and admins only on the final stage. Everyone else sees the Approvals queues read-only.

When a sale is decided, its DID, client and rate are frozen onto the record (`sale_*` columns), so reports keep the values that applied at the time. Agents and managers see DID codes only; directors and admins also see client names and rates.

## Verticals

Medicare, Final Expense, Auto, Other and any vertical added later live in the `verticals` table, managed by Admin (CRM Management > Verticals) and Director (Clients > Verticals). Up to 10, "Other" included. That one list feeds the New Sale pills and colours, client and DID campaigns, the Sales Report filter, the Approvals edit form, the dashboard chart, and the Vertical Type / Campaign options of the Sale and Client forms. Sales, clients and DIDs store the vertical's name, so a rename is carried over to them; a vertical in use can only be turned off, not deleted. Code: `apps/api/src/modules/verticals`, `apps/web/src/lib/verticals.ts`, `components/admin/VerticalsManager.tsx`.

## Interviews (HR)

HR desk only (Admin, Director, HR Manager), under Interviews in the sidebar. Code: API `modules/interviews`, web `components/interviews`.

- **Schedule:** HR enters the candidate (contact, CNIC, background, salary, source), attaches the CV (stored under `UPLOAD_DIR/cv`) and picks the form, date and time (Pakistan time), mode, location or link and interviewer. With an email on file the candidate gets an invitation through Resend; the trail records whether it was sent.
- **Walk-in:** a candidate who came without an appointment starts as "Waiting" on a walk-in form.
- **During the interview:** HR fills the role's form (answers by type: short or long text, rating 1 to 5, yes/no, pick one, number), an overall rating, remarks and a result (Selected, On hold, Rejected). Answers save as a draft; Complete needs the result and the required questions. The questions are copied onto the interview, so later edits to the form do not change past interviews.
- **Reschedule / Book again** (counts reschedules, can email the new time), **No-show**, **Cancel** (can email the candidate), **Resend email**, **Called**, notes, delete.
- **Trail:** every step (scheduled, emails, reminder, called, rescheduled from and to, arrived and how late, answers saved, completed, notes) with who and when. A candidate's earlier interviews are listed too.
- **30 minute reminder:** a job runs every minute (`interview-reminders.service.ts`); for an interview starting within 30 minutes it notifies the HR managers and whoever scheduled it, with a bell notification and a popup (`InterviewReminder`, mounted in `AppLayout`) showing the phone, WhatsApp and "I Called Them". The popup is pushed over the socket (`modules/live/user-events.ts`) and also fetched on load.
- **Interview Forms tab:** one form per role (Medicare, Final Expense, Auto, General Agent, Manager / Team Lead, plus walk-in versions are seeded by the migration). HR adds, removes, reorders and edits questions; a form already used is turned off instead of deleted.

## Where things live

### API (`apps/api/src`)

- `main.ts`, `app.module.ts`: bootstrap and module list
- `modules/<feature>/`: one folder per feature, each with a `*.controller.ts` (routes), `*.service.ts` (logic) and `*.module.ts`
  - `auth`, `users`, `customers` (sales and approvals), `clients` (clients and DIDs), `reports`, `dashboard`
  - `attendance`, `leaves`, `working-days`, `interviews`, `chat`, `notifications`, `files`
  - `crm` (form builder and role changes), `invoicing`, `accounting`
- `common/`: auth guards, decorators, the response wrapper (`{ success, data }`), and utils for time zones, validation and staff policy
- `prisma/schema.prisma`: the database schema; `prisma/migrations/`: its history

Every route is under `/api` and needs a Bearer token, except `POST /api/auth/login` and `POST /api/auth/refresh`. Controllers opt in with `@UseGuards(JwtAuthGuard, RolesGuard)` and `@Roles(...)`.

### Web (`apps/web/src`)

- `app/(auth)/login`: login page
- `app/(dashboard)/<role>/<page>/page.tsx`: one thin route file per role and page, each rendering a component from `components/`
- `components/<area>/`: the actual screens (`sales`, `admin`, `reports`, `dashboard`, `attendance`, `leaves`, `interviews`, `chat`, `crm`, `invoicing`, `accounting`, `profile`)
  - `components/layout/`: `AppLayout` (role routing), `Sidebar`, `RefreshButton`
  - `components/ui/`: shared building blocks: `PageChrome` (page title, teal filter bar, buttons, pager), `DataTable` (gold-header table), `StyledSelect`, `PillSelect`, `Toast`
- `lib/`: `api.ts` (axios with token refresh), `roles.ts`, `format.tsx`, `palette.ts` (all colours), `socket.ts`
- `hooks/useAutoRefresh.ts`: refetches a page every 10 s, on notifications, on tab focus and when the refresh button is pressed; a hidden tab does not poll and catches up when shown. On screens without it (settings and forms) the refresh button reloads the page
- `lib/live.ts` + API `modules/live/sales-events.ts`: any write to a sale pushes a `sales_changed` tick over the chat socket (websocket), and screens using `useAutoRefresh(..., { sales: true })` (dashboard, reports, approvals, my sales, sidebar counts) refetch at once
- `hooks/useIdleLogout.ts`: signs a tab out after 10 minutes without mouse, keyboard, scroll or touch activity
- `lib/avatar.ts`: profile photos. The browser shrinks the picture and sends it to `PUT /api/profile/avatar`; the API keeps it under `UPLOAD_DIR/avatars` (users.avatar holds the file name) and serves it at `/api/files/avatar/:name`. The sidebar, Profile and chat all use it

### UI conventions

The look follows argroup.cloud: Aptos text, Faster One page titles, the teal pill filter bar, gold table headers.

The agent's New Sale page (`components/sales/NewSalePage.tsx`) is laid out from CRM Management > Sale Form: sections become cards, Width sizes each field, Textarea fields become the large boxes at the bottom of their card, and the Vertical Type options become the pills. Change the form there, not in code. To build a new list page, copy `components/sales/MySalesPage.tsx`: `PageShell` + `PageHeader` + `FilterBar` + `DataTable` + `Pager`. Use `StyledSelect` for form dropdowns.

## Deploying

The app runs on the argroup VPS (`ssh argroup-vps`), next to argroup.cloud. Never touch the `ca-firm-*` processes there.

- Code: `/var/www/callcenter-crm-v2`, PM2 processes `metavoice-api` (port 4100) and `metavoice-web` (port 3100), behind nginx
- Secrets: `apps/api/.env` and `apps/web/.env.production` on the server only
- Uploads (chat files, profile photos, candidate CVs): `UPLOAD_DIR` in `apps/api/.env`
- Email (forgot password codes, interview invitations) goes through Resend: set `RESEND_API_KEY` in `apps/api/.env` (optional `RESEND_FROM_EMAIL`, default noreply@metavoice.cloud, and `RESEND_FROM_NAME`), then `pm2 restart metavoice-api`. The sending domain must be verified in Resend. Without a key the forgot password page says it is not set up

To deploy, push to `main`, then on the server:

```bash
cd /var/www/callcenter-crm-v2
git fetch origin && git reset --hard origin/main
pnpm install --frozen-lockfile
pnpm --filter @crm/shared build
cd apps/api && npx prisma generate && npx prisma migrate deploy && rm -rf dist tsconfig.tsbuildinfo && npx nest build
cd ../web && npx next build
pm2 restart metavoice-api metavoice-web
```

Start Next with `node_modules/next/dist/bin/next start -p 3100` and never add `-H 127.0.0.1`.
