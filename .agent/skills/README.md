# Skills Index 📚

This folder contains reusable, human-authored "skills" for the assistant. Each skill is a Markdown document (`SKILL.md`) with optional `references/` guidance. Use this index to discover skills and see quick invocation examples.

---

## Available skills

| Skill | Path | Short description | Triggers |
|-------|------|-------------------|----------|
| **backend-development** | `./backend-development/SKILL.md` | Production-ready backend development guidance: architectures, security, testing, DevOps. | (none defined) |
| **nestjs-expert** | `./nestjs-expert/SKILL.md` | Senior NestJS specialist: modules, controllers, DI, DTOs, guards, and testing. | `NestJS`, `Nest`, `Node.js backend`, `TypeScript backend` |

> Tip: Add a `triggers:` array to a skill's frontmatter to make it easier to discover and auto-invoke based on prompt content.

---

## Quick usage examples

- Manual (easy):

  ```text
  Use the `nestjs-expert` skill to create a NestJS controller and DTOs for a `POST /users` endpoint that validates input and writes to PostgreSQL.
  ```

- Programmatic (recommended for automation):

  ```js
  // Read the SKILL.md and send it as system context before the user's message
  const skill = fs.readFileSync('.github/skills/nestjs-expert/SKILL.md', 'utf8');
  const systemMsg = `Skill: nestjs-expert\n\n${skill}`;
  // Send systemMsg as the system prompt followed by the user's task
  ```

- Trigger-based (lightweight):
  - If your tooling scans prompts for keywords (e.g., `NestJS`, `security`, `testing`) you can map those to a skill and prepend the skill content automatically.

---

## Recommendations

- Standardize frontmatter fields across skills (suggested: `name`, `triggers`, `role`, `scope`, `output-format`, `maintainer`, `last_updated`).
- Add `triggers` to `backend-development` if you want it auto-discovered.
- Consider adding a small `skills/manifest.yaml` if you want programmatic discovery or CI checks.

---

## How to add a new skill

1. Create a new folder under `.github/skills/<skill-name>/`.
2. Add `SKILL.md` with YAML frontmatter containing at least `name` and `description`.
3. (Optional) Add a `references/` folder with helpful docs.
4. (Optional) Add `triggers:` to frontmatter to enable keyword-based discovery.

---

If you'd like, I can (pick one):
1) Add `triggers` + `maintainer` to `backend-development`, or
2) Create `skills/manifest.yaml` for programmatic discovery, or
3) Add a simple `scripts/invoke-skill.js` example to the repo.

Reply with the number and I'll proceed. ✅
