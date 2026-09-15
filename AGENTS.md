# EIMS / Web workshop instructions

This directory contains the shared iterative agentic workflows workshop. Its
`slides/iterative-workflows.md`, participant guide and TypeScript examples belong
together. When this kit is inside another repository, run workshop commands
from this directory.

- Preserve the supplied exercise and evaluator examples unless the workshop task
  explicitly asks you to change them.
- Read `sample/AGENTS.md` and `sample/task.md` before doing the sample exercise.
  Make a disposable copy outside the entire cloned repository and work there.
- Keep credentials, personal data, raw traces and production actions out of the kit.
- Record actual commands and results. A trace shows activity; repository tests
  and human review establish the quality of the resulting code.
- Use `npm test` and `npm run typecheck` to check the kit. The sample's own six
  tests intentionally fail until a participant implements its task.
