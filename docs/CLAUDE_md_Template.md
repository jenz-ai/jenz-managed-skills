# The Comprehensive CLAUDE.md Template & Best Practices Guide

**Version 1.0** | Based on empirical analysis of 253 CLAUDE.md files + community best practices

---

## Executive Summary

This document serves as both a **meta-guide** (how to think about CLAUDE.md) and a **practical template** (what to include). It's designed for AI assistants (Claude Code, ChatGPT, or other coding agents) to generate optimal project-specific CLAUDE.md files.

### The Core Principle
> **CLAUDE.md is persistent memory injected into every Claude Code session.** Make every line count.

---

## Part 1: Understanding CLAUDE.md

### What Is CLAUDE.md?

CLAUDE.md is a markdown file that Claude Code automatically reads at the start of every session. It's:
- **Persistent memory** across sessions
- **Context-injected** into every conversation
- **Action-oriented** (focus on what Claude should do, not just information)
- **Lightweight** (100-200 lines optimal)

### Why It Matters

Claude Code has limited context (~200k tokens). A well-structured CLAUDE.md:
- **Reduces token waste** by eliminating repeated context gathering
- **Improves consistency** by enforcing standards automatically
- **Prevents hallucination** by providing authoritative project details
- **Enables delegation** by giving Claude explicit permission and guidelines

### The Token Economics

| Component | Typical Cost | Notes |
|-----------|--------------|-------|
| CLAUDE.md | 500-2000 tokens | Loaded in EVERY session |
| Your code | 10,000-50,000 tokens | Actual work you're doing |
| Context overhead | 10,000-30,000 tokens | Tool outputs, conversation history |
| **Total available** | **~200,000 tokens** | Frontier models (Sonnet, Opus) |

**Math: If CLAUDE.md is bloated (>2500 tokens), you've wasted 1-2% of your context window on every session.**

---

## Part 2: Optimal CLAUDE.md Structure

### Template: Shallow Hierarchy (Empirically Proven)

```markdown
# [Project Name]

## Quick Facts
- **Stack**: [Languages, frameworks]
- **Test Framework**: [Jest, Vitest, pytest, etc.]
- **Build System**: [npm, cargo, make, etc.]

## Key Directories
- `src/` – Source code
- `tests/` – Test files
- `docs/` – Documentation

## Essential Commands

### Development
- `npm run dev` – Start dev server
- `npm run build` – Production build
- `npm test` – Run tests
- `npm run lint` – Lint code
- `npm run type-check` – TypeScript checking

### CI/CD
- `npm run ci` – Full validation
- `git push` – Triggers CI pipeline

## Code Standards

### [Language] Style
- [Key style point 1]
- [Key style point 2]
- [Key style point 3]

### Architecture Patterns
- [Pattern 1 with file reference: @src/patterns/example.ts]
- [Pattern 2 description]

## Testing Standards
- [Testing requirement 1]
- [Testing requirement 2]
- [Reference: @docs/testing.md]

## Development Workflow
- [Workflow step 1]
- [Workflow step 2]
- [Git conventions: @docs/git.md]

## Critical Rules
- [Rule that has caused bugs: specific constraint]
- [Rule about file modifications: what NOT to do]
- [Rule about permissions: what needs approval]

## Common Gotchas
- [Non-obvious behavior 1]
- [Non-obvious behavior 2]

## When You Need Help
- Architecture questions: see @docs/architecture.md
- API details: see @docs/api.md
- Setup issues: see @docs/setup.md
```

### Section-by-Section Breakdown

#### 1. **Quick Facts** (3-5 lines)
Essential information that changes rarely.

```markdown
## Quick Facts
- **Stack**: React 19, TypeScript, Node.js 20
- **Test Framework**: Vitest + React Testing Library
- **Build System**: Vite
- **Package Manager**: pnpm
```

**Why this works:**
- Sets expectations immediately
- Claude knows what tools to use
- Rarely changes (no maintenance burden)

#### 2. **Key Directories** (5-8 lines)
Map the codebase structure so Claude knows boundaries.

```markdown
## Key Directories
- `src/components/` – React components
- `src/hooks/` – Custom React hooks
- `src/api/` – API clients and integration
- `src/types/` – TypeScript type definitions
- `src/utils/` – Utility functions
- `tests/` – Jest test files
- `docs/` – Markdown documentation
```

**Why this works:**
- Prevents Claude from creating files in wrong locations
- Critical for monorepos (Claude needs to know boundaries)
- Short, scannable list

**Anti-pattern:**
```markdown
❌ DON'T: Include every single folder
❌ DON'T: Add line-by-line file descriptions (bloat)
```

#### 3. **Essential Commands** (8-15 lines)
Commands Claude will run to verify work.

```markdown
## Essential Commands

### Development
- `npm run dev` – Start dev server (runs on http://localhost:3000)
- `npm run build` – Production build
- `npm test` – Run all tests
- `npm run lint` – ESLint check
- `npm run type-check` – TypeScript strict mode check

### Git & CI
- `git push origin feature-branch` – Push changes (triggers CI)
- `npm run ci` – Full validation (runs before merging)
```

**Why this works:**
- Claude knows exactly what to run
- Includes success criteria ("runs on http://localhost:3000")
- Grouped logically

**Pro tip:** Include expected behavior
```markdown
❌ `npm test` (vague)
✅ `npm test` – Runs test suite; should pass without errors
```

#### 4. **Code Standards** (10-20 lines)
Style rules that are NOT enforced by linters.

```markdown
## Code Standards

### TypeScript
- Use `interface` for object types, `type` for unions/tuples
- No `any` types; use `unknown` with type guards instead
- Mark optional properties with `?`, not `undefined` in unions
- Import type-only imports: `import type { Foo } from 'bar'`

### React Components
- Use functional components with hooks (no class components)
- Destructure props in function signature
- Use `React.FC` for component type annotations
- Memoize with `React.memo()` only if re-renders are expensive

### Error Handling
- Always use `try/catch` in async functions
- Log errors to Sentry before re-throwing
- Provide user-friendly error messages
```

**Why this works:**
- Rules Claude **can't infer** from code alone
- Specific, actionable guidance
- Includes reasoning (helps Claude apply them correctly)

**Anti-pattern:**
```markdown
❌ "Write clean, maintainable code"
❌ 50+ style rules (Claude will ignore half)
✅ 10-15 specific, frequently-violated rules
```

#### 5. **Architecture Patterns** (10-15 lines)
How to structure new features or modules.

```markdown
## Architecture Patterns

### Feature Modules
Follow the pattern in `@src/features/auth/`:
- `index.ts` – Public exports
- `hooks/` – Feature-specific hooks
- `components/` – Feature UI components
- `api/` – API calls for this feature
- `types.ts` – TypeScript types
- `utils.ts` – Helper functions

### API Calls
- Use the client in `@src/api/client.ts`
- Always define types for responses: `@src/types/api.ts`
- Handle errors with `@src/utils/errorHandler.ts`

### State Management
- Use React Context for feature-level state
- Use `useLocalStorage` hook for persistent state
- Reference example: `@src/features/settings/SettingsContext.tsx`
```

**Why this works:**
- Claude knows where to put new code
- Provides reference files to examine
- Prevents architecture divergence

#### 6. **Testing Standards** (8-12 lines)
How to write tests Claude should verify.

```markdown
## Testing Standards

### Test Structure
- Place test file next to source: `Component.tsx` → `Component.test.tsx`
- Use `describe()` for grouping, `it()` for individual tests
- Follow AAA pattern: Arrange, Act, Assert
- Use data factories: `createMockUser({ name: 'John' })`

### What to Test
- User interactions (clicks, form submissions)
- Conditional rendering (loading, error, empty states)
- Integration with API layer
- DO NOT test implementation details (internal state)

### Running Tests
- `npm test` – Run all tests
- `npm test -- Component.test.tsx` – Single file
- `npm test -- --coverage` – Coverage report (aim for >80%)
```

**Why this works:**
- Clear expectations
- Claude knows when to run tests
- Prevents common testing mistakes

#### 7. **Development Workflow** (8-12 lines)
How you want Claude to approach tasks.

```markdown
## Development Workflow

### Before Starting
1. Read relevant files mentioned in the task
2. Ask clarifying questions if requirements are ambiguous
3. Create a brief plan (3-5 bullet points)

### Implementation
1. Write tests first (if not already provided)
2. Implement until tests pass
3. Run lint and type-check: `npm run lint && npm run type-check`
4. Run full test suite: `npm test`

### Before Committing
1. Review your changes: `git diff`
2. Write descriptive commit message (Conventional Commits format)
3. Push to feature branch

### Git Conventions
- Branch names: `feature/user-auth`, `fix/login-bug`, `docs/readme`
- Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`
- PRs require: passing tests, code review, zero lint errors
```

**Why this works:**
- Sets clear expectations
- Prevents common mistakes
- Makes Claude's work predictable

#### 8. **Critical Rules** (5-10 lines)
Rules that prevent real bugs.

```markdown
## Critical Rules

⚠️ **NEVER**:
- Modify files in `src/shared/` without team discussion (shared across 5 apps)
- Push directly to `main` branch (always use feature branches + PR)
- Commit secrets or API keys (check .gitignore)
- Remove type safety: no `as any`, no `@ts-ignore` without justification
- Modify database migrations after they've been deployed

⚠️ **ALWAYS**:
- Run `npm test` before pushing
- Include error handling in async operations
- Ask before installing new dependencies
- Write tests for new features
```

**Why this works:**
- Prevents catastrophic mistakes
- Emphasizes constraints
- Uses visual markers (⚠️) for scannability

#### 9. **Common Gotchas** (5-8 lines)
Non-obvious behaviors Claude should know.

```markdown
## Common Gotchas

- **Environment variables**: `VITE_` prefix required for client-side vars (see `.env.example`)
- **TypeScript**: Strict mode is ON; `strictNullChecks` requires explicit type handling
- **Styling**: Use Tailwind classes, NOT inline styles; theme tokens in `@src/tailwind.config.ts`
- **API calls**: Always handle network errors; see error handling pattern in `@src/api/client.ts`
- **Build size**: Tree-shake unused exports; check bundle size with `npm run analyze`
```

**Why this works:**
- Catches real mistakes Claude makes
- Provides solutions (file references)
- Based on actual project pain points

#### 10. **Reference Documentation** (4-6 lines)
Pointers to detailed docs (NOT inline).

```markdown
## Additional References

For detailed guidance, see:
- **Architecture decisions**: `@docs/architecture.md`
- **Database schema**: `@docs/database.md`
- **API endpoints**: `@docs/api.md`
- **Deployment process**: `@docs/deployment.md`
- **Performance optimization**: `@docs/performance.md`

Ask Claude to read these files if the task requires them.
```

**Why this works:**
- Keeps CLAUDE.md lightweight
- Points to authoritative sources
- Claude reads them only when needed

---

## Part 3: Length & Token Guidelines

### The Rule: Less Is More

| Metric | Target | Rationale |
|--------|--------|-----------|
| Total lines | 100-200 | Scannability |
| Total tokens | <2000 | Context efficiency |
| Max section length | 15 lines | Prevents overwhelming |
| Number of sections | 8-12 | Comprehensive but focused |
| Code examples | 0-3 short | Show patterns, don't document |

### Token Estimation

```markdown
# Calculate tokens for your CLAUDE.md:

1. Copy your CLAUDE.md file
2. Paste into Claude's context counter tool
3. Target: <2000 tokens

Rule of thumb: ~100 tokens per 50 lines of markdown
```

### What to Cut (Aggressive Pruning)

**Remove if:**
- ❌ Claude can infer from code alone (e.g., "use lowercase filenames")
- ❌ Standard language conventions (e.g., "Python uses indentation")
- ❌ Information that changes weekly (move to docs/)
- ❌ Detailed API documentation (link to docs instead)
- ❌ File-by-file descriptions of codebase
- ❌ Multiple examples of the same pattern

**Keep if:**
- ✅ Claude frequently gets it wrong
- ✅ It breaks builds when ignored
- ✅ It's project-specific (not standard practice)
- ✅ It requires explicit permission
- ✅ It prevents security issues

---

## Part 4: Progressive Disclosure

### Principle: Avoid the Kitchen Sink

Don't put everything in CLAUDE.md. Use **three-tier hierarchy:**

```
Tier 1: CLAUDE.md (100-200 lines)
├─ Universal rules (apply to EVERY task)
├─ Essential commands (used multiple times per session)
├─ Stack overview (tech decisions)
└─ Pointers to Tier 2

Tier 2: @docs/ or @.claude/skills/ (500-1000 lines each)
├─ docs/testing.md – Testing strategies
├─ docs/architecture.md – System design
├─ docs/api.md – API documentation
└─ .claude/skills/SKILL.md – Domain-specific patterns

Tier 3: Source code (live, authoritative)
├─ Example files Claude reads when needed
├─ Working code as reference
└─ Actual implementations
```

### Linking Strategy

**In CLAUDE.md, use `@path` syntax to reference files:**

```markdown
## Testing Standards
For detailed patterns, see @docs/testing.md

## Architecture
Reference implementation: @src/features/auth/ for feature structure

## API Integration
See our client implementation: @src/api/client.ts
Error handling pattern: @src/utils/errorHandler.ts
```

**Claude will:**
1. See the pointer in CLAUDE.md
2. Read the referenced file only when relevant
3. Save context by not loading unnecessary files

---

## Part 5: Real-World Examples by Project Type

### Example 1: React SPA with TypeScript & Vitest

```markdown
# Dashboard SPA

## Quick Facts
- **Stack**: React 19, TypeScript, Vite
- **Test Framework**: Vitest + React Testing Library
- **UI Library**: shadcn/ui (Tailwind-based)
- **State Management**: TanStack Query + React Context

## Key Directories
- `src/components/` – Reusable UI components
- `src/features/` – Feature modules (auth, dashboard, etc.)
- `src/api/` – React Query hooks and API clients
- `src/types/` – TypeScript type definitions

## Essential Commands

### Development
- `npm run dev` – Start Vite dev server (http://localhost:5173)
- `npm run build` – Production build
- `npm test` – Vitest in watch mode
- `npm run lint` – ESLint + Prettier
- `npm run type-check` – TypeScript check

### Before Commit
- `npm run ci` – Full validation (lint, type-check, tests)

## Code Standards

### TypeScript
- Use `interface` for object shapes, `type` for discriminated unions
- No `any`; use `unknown` with type guards
- Import types: `import type { User } from '@/types'`

### React Components
- Functional components only; use hooks
- Use `@` alias: `import { Button } from '@/components'`
- Memoize sparingly; profile before optimizing
- Props interface: `interface ComponentProps { ... }`

### Styling
- Tailwind classes in `className=""`, never inline styles
- Dark mode: wrap with `dark:` prefix for dark variants
- Spacing scale: use Tailwind units (e.g., `p-4`, not `p-6`)

## Testing Standards

### Test Structure
- Test file location: `Component.test.tsx` next to `Component.tsx`
- Use factories: `createMockUser()`, `createMockPost()`
- Render with wrapper: `renderWithProviders(<Component />)`

### What to Test
- User interactions (clicks, form input, navigation)
- Conditional rendering (loading, error states, empty lists)
- API integration (with mocked React Query)
- NOT implementation details (internal state, hook calls)

### Running Tests
- `npm test` – Watch mode
- `npm test -- --coverage` – Coverage report
- `npm test -- Button.test.tsx` – Single file

## Development Workflow

1. **Explore**: Read files mentioned in the task
2. **Plan**: Brief outline if changes affect multiple files
3. **Test-first**: Write test, implement, verify `npm test` passes
4. **Lint**: Run `npm run lint` to fix formatting
5. **Type-check**: Ensure `npm run type-check` passes
6. **Commit**: Use conventional commits: `feat:`, `fix:`, `refactor:`

## Critical Rules

⚠️ **NEVER**:
- Commit without `npm run ci` passing (fails CI pipeline)
- Use `//@ts-ignore` without comment explaining why
- Direct API calls outside `src/api/` (breaks mocking)
- Import from `.src` with relative paths; always use `@/`
- Add UI-critical logic without tests

⚠️ **ALWAYS**:
- Handle loading and error states in UI
- Await async operations (no floating Promises)
- Use React Query for server state, Context for UI state
- Write tests for new features

## Common Gotchas

- **Type imports**: Use `import type` to avoid circular dependencies
- **React Query**: Stale time defaults to 0; set explicit `staleTime` for static data
- **Event handlers**: Return void or undefined, not Promises
- **Modal/Dialog**: Use Radix UI primitives for accessibility
- **Environment variables**: Use `import.meta.env.VITE_*` not `process.env`

## References

For additional guidance:
- **Components**: See `@src/components/Button.tsx` for patterns
- **API calls**: See `@src/api/hooks.ts` for React Query patterns
- **Testing**: See `@src/features/auth/__tests__/` for examples
- **Feature structure**: See `@src/features/dashboard/` as reference
```

---

### Example 2: Next.js Full-Stack App

```markdown
# E-Commerce Platform

## Quick Facts
- **Frontend**: Next.js 15, React, TypeScript
- **Backend**: Next.js API Routes + Prisma ORM
- **Database**: PostgreSQL
- **Testing**: Jest + React Testing Library (frontend), Vitest (backend)

## Key Directories
- `app/` – Next.js App Router (pages, layouts, API)
- `app/(auth)/` – Auth-gated routes
- `components/` – React components (client and server)
- `lib/` – Utilities, database clients, helpers
- `prisma/` – Database schema and migrations

## Essential Commands

### Development
- `npm run dev` – Start Next.js dev server
- `npm run build` – Production build
- `npm test` – Run all tests (Jest + Vitest)
- `npm run lint` – ESLint
- `npm run db:push` – Apply Prisma migrations to local DB

### Database
- `npm run db:studio` – Open Prisma Studio (DB explorer)
- `npm run db:seed` – Seed test data

## Code Standards

### TypeScript
- Strict mode enabled
- Use `type` for DTOs, `interface` for runtime contracts
- Database models: use Prisma types, not manual interfaces

### Next.js Components
- Use Server Components by default
- Mark Client Components with `'use client'` at top
- Server Actions for mutations: `'use server'` in isolated files
- Props typing: `interface PageProps { params: { id: string } }`

### Database
- Prisma models: singular names (`User`, `Post`)
- Always include timestamps: `createdAt`, `updatedAt`
- Relationships: use `select` to control returned fields
- Migrations: versioned, never manual edits after `db:push`

## Testing Standards

### Frontend Tests
- Mock API responses: use MSW (Mock Service Worker)
- Test user flows, not implementation
- Location: `__tests__/` folder in component directory

### Backend Tests
- Test API routes with test database (separate from dev DB)
- Use Prisma transactions for isolation
- Clean up after tests: delete test data

## Development Workflow

1. **Feature planning**: Outline API changes, data models
2. **Database first**: Write Prisma schema, run `npm run db:push`
3. **Backend**: Write API route, tests
4. **Frontend**: Build UI, integrate with API
5. **Test**: `npm test` passes, visual verification
6. **Deploy**: Push to `main` triggers CI/CD

## Critical Rules

⚠️ **NEVER**:
- Commit without database migration in `prisma/migrations/`
- Use `eval()` or dynamic `require()` in production
- Expose database credentials in client-side code
- Deploy without running `npm run build`
- Skip tests for API changes

⚠️ **ALWAYS**:
- Use Server Actions for POST/PUT/DELETE
- Validate input on both client AND server
- Handle database errors gracefully
- Include error boundaries around Client Components
- Log errors to Sentry

## Common Gotchas

- **Server vs Client**: Default to Server Components; `'use client'` only if needed
- **Caching**: Next.js caches responses aggressively; use `revalidate: 0` for dynamic content
- **Environment variables**: Prefix with `NEXT_PUBLIC_` only for client-safe variables
- **Database pooling**: Limit connections in serverless environments (Prisma has built-in pooling)
- **Images**: Always use `next/image` component, not `<img>`

## References

See:
- **API patterns**: `@app/api/users/route.ts`
- **Database patterns**: `@lib/db.ts`
- **Component examples**: `@components/ProductCard.tsx`
```

---

### Example 3: Python Backend (FastAPI)

```markdown
# ML Model API Service

## Quick Facts
- **Framework**: FastAPI with Python 3.11
- **Testing**: pytest + pytest-asyncio
- **Database**: PostgreSQL with SQLAlchemy ORM
- **Package Manager**: Poetry
- **Deployment**: Docker + Kubernetes

## Key Directories
- `app/` – FastAPI application
- `app/api/` – API endpoints (routes)
- `app/models/` – SQLAlchemy models
- `app/schemas/` – Pydantic schemas (request/response)
- `app/services/` – Business logic
- `tests/` – Test files (mirror app structure)
- `alembic/` – Database migrations

## Essential Commands

### Development
- `poetry run uvicorn app.main:app --reload` – Dev server (http://localhost:8000)
- `poetry run pytest` – Run tests
- `poetry run pytest --cov` – Coverage report
- `poetry run black app/` – Format code
- `poetry run mypy app/` – Type checking

### Database
- `poetry run alembic revision --autogenerate -m "message"` – Create migration
- `poetry run alembic upgrade head` – Apply migrations

## Code Standards

### Python
- Black for formatting, isort for imports
- Type hints everywhere (enable mypy strict)
- Use `@dataclass` or Pydantic for structured data
- Docstrings for public functions/classes

### FastAPI Routes
- Endpoint naming: `POST /users`, `GET /users/{user_id}`
- Response models: define Pydantic `ResponseSchema` for each endpoint
- Error handling: use FastAPI exceptions for HTTP errors
- Example: `@router.get("/users/{user_id}", response_model=UserResponse)`

### Database
- Model names: singular (`User`, `Product`)
- Always include timestamps: `created_at`, `updated_at`
- Use lazy loading cautiously (use `selectinload` for relationships)
- Migrations: auto-generate with Alembic, never manual

## Testing Standards

### Test Structure
- Location: `tests/test_<module>.py` mirroring app structure
- Use fixtures for setup: `@pytest.fixture`, `conftest.py`
- Use async fixtures for async operations

### What to Test
- API endpoints: correct status codes and response shapes
- Business logic: edge cases and error conditions
- Database: transactions, cascades, constraints

### Running Tests
- `poetry run pytest` – Full suite
- `poetry run pytest tests/api/ -v` – Specific directory
- `poetry run pytest --cov=app` – Coverage report

## Development Workflow

1. **Start with schema**: Define request/response Pydantic models
2. **Database migration**: Write/migrate Alembic migration for data changes
3. **Implement endpoint**: Create route, service, database layer
4. **Write tests**: Test edge cases, error handling
5. **Format & type-check**: Run Black, isort, mypy
6. **Verify**: Run full test suite before commit

## Critical Rules

⚠️ **NEVER**:
- Commit without migrations in `alembic/versions/`
- Use `eval()` or `exec()` on user input
- Expose database connection strings in code (use `.env`)
- Forget to validate input with Pydantic schemas
- Log sensitive data (passwords, tokens, PII)

⚠️ **ALWAYS**:
- Define request/response schemas with Pydantic
- Handle database errors gracefully
- Include comprehensive error messages in responses
- Test both success and failure paths
- Use dependency injection for services

## Common Gotchas

- **Async operations**: Use `async`/`await` for database operations; FastAPI auto-detects
- **SQLAlchemy sessions**: Sessions auto-managed by `Depends(get_db)` in endpoints
- **N+1 queries**: Use `selectinload()` or `joinedload()` to load relationships
- **Migrations**: Always commit migrations; never modify applied migrations
- **CORS**: Configure explicitly for production (see `app/main.py`)

## References

See:
- **Route patterns**: `@app/api/users.py`
- **Service patterns**: `@app/services/user_service.py`
- **Test examples**: `@tests/api/test_users.py`
```

---

## Part 6: Do's and Don'ts (Verification Checklist)

### ✅ DO

- **Keep it concise**: 100-200 lines, <2000 tokens
- **Reference files, don't embed code**: Use `@path/to/file` syntax
- **Make it actionable**: Focus on commands, standards, rules
- **Update when you find bugs**: If Claude repeatedly makes the same mistake, add a rule
- **Check it into Git**: Make it part of version control and team standards
- **Use simple language**: Bullet points over paragraphs
- **Emphasize constraints**: What Claude MUST and MUST NOT do
- **Include command examples**: Exact commands to run, expected outcomes

### ❌ DON'T

- **Don't over-specify**: If Claude already does it correctly without a rule, delete the rule
- **Don't embed entire files**: Link to them instead (save tokens)
- **Don't explain standard conventions**: Claude already knows Python conventions
- **Don't include frequently-changing info**: Move to docs/ and reference instead
- **Don't create a manual**: CLAUDE.md is a quick reference, not comprehensive documentation
- **Don't use vague language**: "Write clean code" is useless; "No `any` types" is actionable
- **Don't auto-generate**: Use `/init` as a starting point, then manually refine
- **Don't forget to update it**: Review and prune regularly (at least monthly)

---

## Part 7: Rules for Different Project Types

### Monorepo CLAUDE.md (Root Level)

```markdown
# Monorepo Root Configuration

## Quick Facts
- **Package Manager**: pnpm (with workspaces)
- **Build Tool**: Turborepo
- **Apps**: 3 (web, mobile, admin)
- **Shared Packages**: 4 (ui, utils, auth, types)

## Monorepo Structure
- `apps/web/` – Main customer web application
- `apps/mobile/` – React Native mobile app
- `apps/admin/` – Internal admin dashboard
- `packages/ui/` – Shared UI component library
- `packages/utils/` – Shared utilities and helpers
- `packages/auth/` – Auth library (all apps use this)

## Workspace Commands
- `pnpm install` – Install all workspace dependencies
- `pnpm --filter <package> dev` – Run dev in specific workspace
- `pnpm run build` – Build all packages (respects dependency order)

## When Adding Features

### If it's app-specific:
- Add to `apps/web/src/features/...` (or mobile/admin)
- Don't share between apps; copy if needed

### If it's shared:
- Add to `packages/shared-name/`
- Update `packages.json` to export new module
- Version bump required for published packages

## Critical Rules

⚠️ **NEVER**:
- Import across apps (use shared packages instead)
- Create circular dependencies between workspaces
- Forget to update shared package versions
- Publish packages without running `pnpm run ci`

⚠️ **ALWAYS**:
- Run builds in dependency order (Turborepo handles this)
- Test changes in all affected workspaces
```

### Library CLAUDE.md

```markdown
# Design System Library (@acme/ui)

## Quick Facts
- **Framework**: React 19 + Storybook
- **Styling**: Tailwind + CSS Modules
- **Testing**: Chromatic (visual regression)
- **Versioning**: Semantic versioning

## Component Guidelines

### Structure
- Each component: folder with `index.ts`, `Component.tsx`, `Component.stories.tsx`
- Exports: only what's needed (use index.ts barrel exports)
- Types: define `interface ComponentProps { ... }` above component

### Storybook Stories
- Create `.stories.tsx` for every component
- Include all significant variants
- Document prop types and default values

### Accessibility
- ARIA labels where appropriate
- Keyboard navigation support
- Color contrast ratios (WCAG AA minimum)

## Critical Rules

⚠️ **NEVER**:
- Break existing component APIs (use feature flags for changes)
- Add uncontrolled props (components should be controlled)
- Assume consumer styling (always set defaults)

⚠️ **ALWAYS**:
- Update Storybook stories when changing components
- Run visual regression tests before publishing
- Document breaking changes in CHANGELOG.md
```

---

## Part 8: Maintenance & Evolution

### When to Update CLAUDE.md

**Update immediately after:**
1. Claude repeatedly makes the same mistake (add a rule)
2. You change build tools or dependencies
3. New architectural patterns emerge
4. You add new shared packages or services

**Review quarterly:**
- Remove rules Claude doesn't need (you observe they're wrong)
- Update commands after upgrades
- Prune rules that haven't been violated in 3 months

### Keeping It Fresh

```bash
# Automated check: ask Claude to review CLAUDE.md periodically
/project:reflection  # Custom command that analyzes chat history
# → "Based on this session, what should we add/remove from CLAUDE.md?"

# Manual review: monthly
# 1. Review issues/PRs for patterns of Claude mistakes
# 2. Add rules for the top 3 mistakes
# 3. Remove rules you never had to reinforce
```

### Version Control Strategy

```markdown
# In your project's CLAUDE.md

## CLAUDE.md Changelog

### v1.3 (2025-01-30)
- Added "Never use //@ts-ignore without explanation" (found in 2 PRs)
- Removed "Always use const" (Claude already follows this)
- Updated Node.js version to 20

### v1.2 (2025-01-15)
- Added monorepo import guidelines (circular dependency issue)
- Clarified testing standards for async functions
```

---

## Part 9: Advanced Patterns

### Skill-Based CLAUDE.md (For AI Agencies)

If you're running Claude Code as a service, segment instructions into skills:

```markdown
# Client Project: E-Commerce Platform

## Base CLAUDE.md (Universal Rules)
- Use TypeScript strict mode
- Run `npm test` before pushing
- Commit message format: Conventional Commits

## Skills (Applied Automatically by Claude Code)

### When working on checkout flow:
- Read @skills/payment-integration.md
- Payment provider: Stripe (API key in .env)
- Test cards: @docs/stripe-test-cards.md

### When writing tests:
- Read @skills/testing-patterns.md
- Use factory functions from @tests/factories/
- Coverage target: >80%

### When modifying database:
- Read @skills/prisma-migrations.md
- Never modify applied migrations
- Always write migration + rollback test
```

### Monorepo with Per-App CLAUDE.md

Root-level (universal) + per-app (specific):

```
project-root/
├── CLAUDE.md (universal rules)
├── apps/
│   ├── web/
│   │   └── CLAUDE.md (web-specific)
│   ├── mobile/
│   │   └── CLAUDE.md (mobile-specific)
│   └── api/
│       └── CLAUDE.md (API-specific)
```

**Root CLAUDE.md points to app-specific files:**

```markdown
## For App-Specific Work

When working in `apps/web/`, also read `apps/web/CLAUDE.md` for web-specific standards.
When working in `apps/api/`, also read `apps/api/CLAUDE.md` for API-specific standards.
```

---

## Part 10: Troubleshooting

### "Claude keeps ignoring my CLAUDE.md rules"

**Diagnosis:**
1. Check if the rule is in CLAUDE.md (verify the file exists)
2. Check token count: if >2500 tokens, Claude may ignore rules (context overload)
3. Test if the rule is actually violated: ask Claude "What does CLAUDE.md say about X?"

**Fix:**
1. Reduce CLAUDE.md length (cut less critical rules)
2. Move detailed rules to @docs/ and link instead
3. Use explicit priming: "Review our CLAUDE.md before proceeding"
4. Reword the rule: make it more specific, not vaguer

### "My CLAUDE.md is growing out of control"

**Solution: Apply progressive disclosure**

```markdown
# Before (bloated)
- 400 lines of details
- Every possible pattern documented
- Frequently-changing information mixed in

# After (streamlined)
- 150 lines in CLAUDE.md
- "See @docs/patterns.md for detailed patterns"
- Environment/configuration info in @docs/setup.md
```

### "I keep finding things Claude should know"

**Don't add everything immediately.** Use this filter:

- If it's an edge case or rare scenario → Skip it, document in code comments instead
- If Claude violates the rule twice in a month → Add to CLAUDE.md
- If it's a new technology or framework change → Add immediately

**Philosophy:** CLAUDE.md is for "stuff Claude gets wrong." As the codebase stabilizes, CLAUDE.md stabilizes too.

---

## Part 11: Metrics & Measurement

### How to Know Your CLAUDE.md Is Effective

| Metric | Good | Needs Work |
|--------|------|-----------|
| **Adherence rate** | Claude follows 80%+ of rules without reminding | <60% compliance |
| **Relevance** | Rarely need to tell Claude to "read CLAUDE.md" | Often repeating rules |
| **Length** | 100-200 lines, <2000 tokens | >300 lines, >3000 tokens |
| **Update frequency** | 1-2 new rules per month, quarterly reviews | Growing steadily, never pruned |
| **Team feedback** | "CLAUDE.md saves time" | Ignored or forgotten |
| **Bug reduction** | Fewer architectural/style issues in PRs | Same issues repeatedly |

### Questions to Ask Claude

```markdown
# For feedback, ask Claude:

"Review our CLAUDE.md file. Based on the work we just did:
1. What rules did I need to remind you about?
2. What rules were helpful?
3. What should we add or remove?"

(Save this as a monthly check-in)
```

---

## Conclusion: The CLAUDE.md Philosophy

**CLAUDE.md is not documentation. It's a contract between you and Claude.**

- **Document rules you've learned**: If Claude broke something, add a rule
- **Keep it lightweight**: Every line must earn its place
- **Update ruthlessly**: Remove rules that aren't needed; add rules that are
- **Trust the structure**: Shallow hierarchy, progressive disclosure, external references

The best CLAUDE.md files are:
1. **Specific** – Not "write good code," but "no `any` types"
2. **Action-oriented** – Focused on what to do, not abstract principles
3. **Maintainable** – Updated when reality changes, pruned when rules are violated
4. **Lightweight** – Under 200 lines, every section earning its place

---

## Appendix: Template Variations

### Minimal CLAUDE.md (for simple projects)

```markdown
# Project Name

## Stack
React, TypeScript, Vitest

## Commands
- `npm run dev` – Dev server
- `npm test` – Tests
- `npm run lint` – Linting

## Code Style
- Use interfaces, not types
- No `any` types
- Test before committing: `npm test`

## Architecture
- Features in `src/features/`
- Styles in `src/styles/`
- See `src/components/Button.tsx` for patterns

## When You're Stuck
- Ask clarifying questions
- Read relevant files before implementing
- Run tests early and often
```

### Enterprise CLAUDE.md (comprehensive)

See Examples 1-3 above for industry-standard structures.

### Open Source Project CLAUDE.md

```markdown
# [Project Name] – Contributing with Claude Code

We welcome Claude Code help! Please follow this guide to ensure your contributions match our standards.

## Quick Start
[Same as above, but add contributor section]

## Contribution Guidelines
- All PRs require tests
- Documentation updates required
- Code review from maintainers before merge
- License header on new files: see CONTRIBUTING.md

## When to Ask for Help
- Design decisions: open issue first
- Breaking API changes: discuss with maintainers
- Large refactors: file an RFC issue

## Code Review Process
1. Claude writes code and tests
2. Maintainer reviews
3. Maintainer requests changes or approves
4. Claude updates based on feedback
5. Maintainer merges
```

---

## Final Resources

**For more information, see:**
- Official Claude Code documentation
- The empirical study: "On the Use of Agentic Coding Manifests" (253 analyzed files)
- Community best practices from 50+ open source projects
- Real-world examples at github.com/ChrisWiles/claude-code-showcase

**Questions to ask Claude when creating your CLAUDE.md:**
- "Generate CLAUDE.md for a [project type] using these guidelines"
- "Review my CLAUDE.md for bloat and suggest cuts"
- "Based on my codebase, what standards should I add to CLAUDE.md?"

---

**Last Updated:** January 2026 | **Based on:** Empirical analysis of 253 CLAUDE.md files + 50+ community best practices
