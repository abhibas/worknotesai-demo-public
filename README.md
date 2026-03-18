# worknotesai-demo-public

Worknotesai helps you capture real work experiences and transform them into interview-ready STAR stories with AI feedback. Build your professional story bank, one conversation at a time!

## What This Repo Contains

- `notesai-mvp/`: backend API (Express + Prisma + OpenAI)
- `notesai-mvp/frontend/`: frontend app (Next.js, with optional Clerk auth)
- `DEMO_DAY_SUBMISSION.md`: project description and public-facing narrative

## Quickstart

### Live Demo (No Local Setup)

Reviewers can evaluate the live product directly without local setup:

- Demo Day Experience: [www.worknotesai.com](https://www.worknotesai.com)
- Current Experience: [www.careernotesai.com](https://www.careernotesai.com)
- If the hosted backend/API endpoint is exposed separately, add it here: `<add-your-hosted-backend-url>`

For hosted deployments, point backend `DATABASE_URL` to a hosted PostgreSQL instance (for example Neon/Supabase/Railway), then set frontend to call that backend URL.

### 1) Prerequisites

- Node.js 20+ (or latest LTS)
- PostgreSQL
- OpenAI API key

### OpenAI Setup (Required for STAR Generation)

The app can load in demo mode without auth, but STAR generation requires a valid OpenAI key.

1. Create/sign in to your OpenAI account: [platform.openai.com](https://platform.openai.com/)
2. Create an API key in the dashboard
3. Add the key to backend env:

```env
OPENAI_API_KEY="sk-..."
```

Use this in `notesai-mvp/.env` (not in frontend `.env.local`).

If `OPENAI_API_KEY` is missing/invalid:
- UI can still load
- STAR generation requests will fail

### 2) Quick Path (No Account Required)

Use demo mode for the fastest evaluator experience. This path does not require creating a Clerk account.

Backend terminal:

```bash
cd notesai-mvp
npm install
cp .env.example .env
```

Update `notesai-mvp/.env`:

- keep `DEMO_MODE="true"`
- set `DATABASE_URL`
- set `OPENAI_API_KEY` (required for STAR generation)
- Clerk values are not required in local `.env` for demo mode

Then run:

```bash
npm run db:generate
npm run db:push
npm run dev
```

Frontend terminal:

```bash
cd notesai-mvp/frontend
npm install
cp .env.example .env.local
npm run dev
```

Update `notesai-mvp/frontend/.env.local`:

- keep `NEXT_PUBLIC_DEMO_MODE="true"`
- set `NEXT_PUBLIC_API_URL` if needed
- Clerk values are not required in local `.env.local` for demo mode

### 3) Full Auth Path (Production-Like)

Use this path to run with real Clerk authentication.

### Backend setup

```bash
cd notesai-mvp
npm install
cp .env.example .env
```

Update `notesai-mvp/.env` with your values, then run:

```bash
npm run db:generate
npm run db:push
npm run dev
```

Backend runs at `http://localhost:3000`.

Set `DEMO_MODE="false"` in `notesai-mvp/.env`, and set Clerk values:

- `CLERK_SECRET_KEY`

### Frontend setup

In a second terminal:

```bash
cd notesai-mvp/frontend
npm install
cp .env.example .env.local
npm run dev
```

Frontend runs at `http://localhost:3001` (or next available port).

Set `NEXT_PUBLIC_DEMO_MODE="false"` in `notesai-mvp/frontend/.env.local`, and set:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

### Env File Convention

- Local files (`.env`, `.env.local`) can stay minimal for demo mode.
- Template files (`.env.example`) include optional Clerk placeholders so reviewers can run full-auth mode with their own credentials.

## What To Test

1. Open the frontend (demo mode is no-sign-in; full mode uses Clerk sign-in).
2. Add a work experience entry.
3. Generate/view STAR-structured output and feedback (requires valid `OPENAI_API_KEY` in backend `.env`).
4. Verify saved experiences can be revisited.

## Notes

- No real secrets are included in this public repo.
- Use `.env.example` files as setup templates.

## CI and Security Notes

- GitHub Actions CI is included at `.github/workflows/ci.yml` and runs backend/frontend install + build checks on pushes and pull requests.
- Dependency vulnerabilities were remediated to remove critical/high issues in this demo snapshot.
- Remaining advisories are moderate Next.js ecosystem items that require a major framework upgrade path (Next.js 16) for full remediation.

## Troubleshooting

- `Failed to fetch` on Dashboard:
  - Confirm backend is running on `http://localhost:3000`
  - Confirm frontend uses `NEXT_PUBLIC_API_URL="http://localhost:3000"`
  - Confirm PostgreSQL is running and reachable at your `DATABASE_URL` (default local is `localhost:5432`)
- Frontend opens but Dashboard fails:
  - This usually means API is up, but DB is down. Start PostgreSQL, then run `npm run db:push` in `notesai-mvp`.
- STAR generation fails:
  - Confirm `OPENAI_API_KEY` is set in `notesai-mvp/.env`
  - Restart backend after changing env vars

