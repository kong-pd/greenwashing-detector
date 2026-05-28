# GreenCheck — Contributing Guide

> Development guidelines for the team. Three people, keep it simple.

---

## Daily Development Workflow

### Before starting any new feature

```bash
# 1. Make sure your local main is up to date
git checkout main
git pull origin main

# 2. Create a new branch (never commit directly to main)
git checkout -b feat/your-feature-name
```

### After finishing your feature

```bash
# 3. Stage and commit your changes
git add .
git commit -m "feat: brief description of what changed"

# 4. Push your branch to GitHub
git push origin feat/your-feature-name

# 5. Open a Pull Request on GitHub
#    GitHub will show a prompt — click "Compare & pull request"

# 6. Wait for CI to pass (3 green checks) → teammate Approves → Merge

# 7. Sync your local main after merge
git checkout main
git pull origin main
```

---

## Branch Naming

```
feat/xxx     New feature       e.g. feat/reports-history
fix/xxx      Bug fix           e.g. fix/petrovera-data-leak
docs/xxx     Documentation     e.g. docs/update-readme
test/xxx     Test changes      e.g. test/enricher-serper
```

---

## Commit Message Format

```
feat:      added a new feature
fix:       fixed a bug
docs:      documentation changes only
test:      added or updated tests
refactor:  code restructure (no new feature, no bug fix)
```

**Examples:**
```
feat: connect ReportsScreen to real API history (FR-29)
fix: remove Petrovera data leak in makeLiveClaim (FR-37)
docs: update API keys in .env.example
test: update enricher tests for Serper/Guardian API
```

---

## Pull Request Guidelines

**Title:** Follow the same format as commit messages

**Description — include at minimum:**
```
## What changed
- One-line summary

## Testing
- [ ] Tested locally
- [ ] All CI checks pass
```

**Before merging:**
- All 3 CI checks green ✅
- At least 1 teammate Approval ✅

---

## Local Development (3 terminals)

```bash
# Terminal 1 — Backend (web-service)
cd backend
uvicorn main:app --reload --port 8000

# Terminal 2 — Analysis Service
cd analysis
uvicorn main:app --reload --port 8001

# Terminal 3 — Frontend
cd frontend
npm run dev
# Open http://localhost:5173
```

---

## Emergency Procedures

**CI is failing but you need to merge urgently before demo:**

The repo owner can temporarily disable the branch protection rule under
GitHub → Settings → Branches, merge, then re-enable it afterwards.

**Your branch is behind main (merge conflict):**

```bash
git checkout main
git pull origin main
git checkout feat/your-branch
git merge main        # bring latest main into your branch
# resolve conflicts, then push again
git push origin feat/your-branch
```

---

## File Location Reference

| What you want to change | File path |
|------------------------|-----------|
| Frontend pages / components | `frontend/src/` |
| API routes | `backend/routes/analyze.py` |
| AI scoring logic | `analysis/analyzer.py` |
| Web scraper | `analysis/scraper.py` |
| News evidence pipeline | `analysis/enricher.py` |
| Local cache (demo companies) | `analysis/local_cache.json` |
| Database operations | `backend/db/supabase.py` |
| Demo portfolio data | `frontend/src/data.js` (Petrovera only) |
