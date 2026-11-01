import { readdirSync, readFileSync } from "fs";
import { join } from "path/posix";
import { ROOT_PATH, SYNTAX_ROOT_PATH } from "../scripts/generate-grammars";

export interface GrammarContribution {
  scopeName: string;
  path: string;
  injectTo: string[];
}

export const manifest: { contributes: { grammars: GrammarContribution[] } } = JSON.parse(
  readFileSync(join(ROOT_PATH, "package.json"), "utf8"),
);

export function listSyntaxFiles() {
  return readdirSync(SYNTAX_ROOT_PATH);
}

export function readSyntaxFile(file: string): string {
  return readFileSync(join(SYNTAX_ROOT_PATH, file), "utf8");
}
