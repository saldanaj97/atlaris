---
description: Rules for using the CodeRabbit CLI for code reviews
applyTo: '*'
---
# ReactJS and Next.js Projects
If the project is a ReactJS or Next.js project, make sure to follow the specific development instructions outlined in `.github/instructions/reactjs.instructions.md` and `.github/instructions/nextjs.instructions.md` respectively when reviewing code related to those frameworks.

# Running the CodeRabbit CLI
CodeRabbit is already installed in the terminal. I want you to run coderabbit with the `--prompt-only` flag to review code changes. To review uncommitted changes (this is what we'll use most of the time) run: `coderrabit --prompt-only -t uncommitted`.

Only run the CodeRabbit CLI command on changes to actual code, not any .md files or other non-code files.

If code rabbit times out, then just let me know and don't try to run it again.

# Commit Messages
When making commits, follow the commit message instructions in `.github/instructions/commit-message.instructions.md`. Make sure to only stage and commit files that were discussed and modified as part of the task at hand. Do not include unrelated files or any other files that may have changes in the commit.
