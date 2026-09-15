# Participant evaluator code

This repository contains TypeScript evaluators and a Copilot tracing launcher.
Run commands from the repository root. Use Node.js 24.11 or newer within Node 24.

- Keep evaluator examples readable for workshop participants.
- Keep credentials, personal data and raw traces out of the repository.
- Check changes with `npm test` and `npm run typecheck` after running
  `npm --prefix evals/typescript ci`.
- Record actual commands and results. A trace shows activity; repository tests
  and human review establish the quality of the resulting code.
