import fs from "node:fs/promises";
import { resolveRepoPath } from "../lib/workshop-utils.mjs";

await fs.mkdir(resolveRepoPath("exports"), { recursive: true });
