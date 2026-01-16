# Skills

On-demand expertise for AI agents. Skills are task-specific procedures that get activated when relevant.

> Project: Studio-Lagosta-v2

## How Skills Work

1. **Discovery**: AI agents discover available skills
2. **Matching**: When a task matches a skill's description, it's activated
3. **Execution**: The skill's instructions guide the AI's behavior

## Available Skills

### Built-in Skills

| Skill | Description | Phases |
|-------|-------------|--------|
| [commit-message](./commit-message/SKILL.md) | Generate commit messages following conventional commits with scope detection | E, C |
| [pr-review](./pr-review/SKILL.md) | Review pull requests against team standards and best practices | R, V |
| [code-review](./code-review/SKILL.md) | Review code quality, patterns, and best practices | R, V |
| [test-generation](./test-generation/SKILL.md) | Generate comprehensive test cases for code | E, V |
| [documentation](./documentation/SKILL.md) | Generate and update technical documentation | P, C |
| [refactoring](./refactoring/SKILL.md) | Safe code refactoring with step-by-step approach | E |
| [bug-investigation](./bug-investigation/SKILL.md) | Systematic bug investigation and root cause analysis | E, V |
| [feature-breakdown](./feature-breakdown/SKILL.md) | Break down features into implementable tasks | P |
| [api-design](./api-design/SKILL.md) | Design RESTful APIs following best practices | P, R |
| [security-audit](./security-audit/SKILL.md) | Security review checklist for code and infrastructure | R, V |

## Creating Custom Skills

Create a new skill by adding a directory with a `SKILL.md` file:

```
.context/skills/
└── my-skill/
    ├── SKILL.md          # Required: skill definition
    └── templates/        # Optional: helper resources
        └── checklist.md
```

### SKILL.md Format

```yaml
---
name: my-skill
description: When to use this skill
phases: [P, E, V]  # Optional: PREVC phases
mode: false        # Optional: mode command?
---

# My Skill

## When to Use
[Description of when this skill applies]

## Instructions
1. Step one
2. Step two

## Examples
[Usage examples]
```

## PREVC Phase Mapping

| Phase | Name | Skills |
|-------|------|--------|
| P | Planning | feature-breakdown, documentation, api-design |
| R | Review | pr-review, code-review, api-design, security-audit |
| E | Execution | commit-message, test-generation, refactoring, bug-investigation |
| V | Validation | pr-review, code-review, test-generation, security-audit |
| C | Confirmation | commit-message, documentation |
