import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as vscodeOniguruma from "vscode-oniguruma";
import * as vscodeTextmate from "vscode-textmate";
import { ROOT_PATH } from "../scripts/generate-grammars";
import { manifest } from "./helpers";

const GRAMMAR_PATH = join(__dirname, "grammars");
const GRAMMAR_FILES: Record<string, string> = {
  "source.python": join(GRAMMAR_PATH, "MagicPython.tmLanguage.json"),
  "text.html.markdown": join(GRAMMAR_PATH, "markdown.tmLanguage.json"),
};

const injectionFiles: Record<string, string> = Object.fromEntries(
  manifest.contributes.grammars.map((g) => [g.scopeName, join(ROOT_PATH, g.path)]),
);

export type Token = { text: string; scopes: string[] };

const onigLib = vscodeOniguruma
  .loadWASM(readFileSync(require.resolve("vscode-oniguruma/release/onig.wasm")).buffer)
  .then(() => ({
    createOnigScanner: (patterns: string[]) => new vscodeOniguruma.OnigScanner(patterns),
    createOnigString: (s: string) => new vscodeOniguruma.OnigString(s),
  }));

function loadPython(withInjections: boolean) {
  const files = { ...GRAMMAR_FILES, ...injectionFiles };

  return new vscodeTextmate.Registry({
    onigLib,
    loadGrammar: async (scopeName) => {
      const path = files[scopeName];
      if (!path) return null;
      return vscodeTextmate.parseRawGrammar(readFileSync(path, "utf8"), path);
    },
    getInjections: (scopeName) =>
      withInjections && scopeName === "source.python" ? Object.keys(injectionFiles) : undefined,
  }).loadGrammar("source.python");
}

const pythonGrammars = { true: loadPython(true), false: loadPython(false) };

async function getGrammar(withInjections = true) {
  const grammar = await pythonGrammars[`${withInjections}`];
  if (!grammar) throw new Error("source.python grammar failed to load");

  return grammar;
}

/** Tokenizes Python source line by line. Without injections this is plain MagicPython. */
export async function tokenizePython(code: string, withInjections = true): Promise<Token[][]> {
  const grammar = await getGrammar(withInjections);
  let ruleStack = vscodeTextmate.INITIAL;

  return code.split("\n").map((line) => {
    const result = grammar.tokenizeLine(line, ruleStack);
    ruleStack = result.ruleStack;

    return result.tokens.map((t) => ({
      text: line.slice(t.startIndex, t.endIndex),
      scopes: t.scopes,
    }));
  });
}

export type StandardTokenType = "other" | "comment" | "string" | "regex";
const STANDARD_TOKEN_TYPES: StandardTokenType[] = ["other", "comment", "string", "regex"];

/**
 * The token type VS Code derives for every character (it drives bracket matching, auto-closing
 * and whether suggestions pop up), one entry per source line. Decoded from the binary token
 * metadata, where bits 8-9 hold the type.
 */
export async function tokenTypesOf(code: string): Promise<StandardTokenType[][]> {
  const grammar = await getGrammar(true);
  let ruleStack = vscodeTextmate.INITIAL;

  return code.split("\n").map((line) => {
    const result = grammar.tokenizeLine2(line, ruleStack);
    ruleStack = result.ruleStack;

    const types: StandardTokenType[] = [];

    for (let i = 0; i < result.tokens.length; i += 2) {
      const end = result.tokens[i + 2] ?? line.length;
      const type = STANDARD_TOKEN_TYPES[(result.tokens[i + 1] >>> 8) & 3];
      for (let col = result.tokens[i]; col < end; col++) types[col] = type;
    }

    return types;
  });
}

/**
 * Tokenizes with the injections and asserts the result equals plain Python, for one line
 * (negative indexes count from the end) or for the whole source. Returns the tokens
 * produced with the injections.
 */
export async function assertLikePlainPython(
  source: string,
  lineIndex?: number,
): Promise<Token[][]> {
  const injected = await tokenizePython(source);
  const plain = await tokenizePython(source, false);

  if (lineIndex === undefined) assert.deepEqual(injected, plain);
  else assert.deepEqual(injected.at(lineIndex), plain.at(lineIndex));
  return injected;
}

/** The last token that is a triple-quote delimiter. */
export function closerToken(lines: Token[][]): Token | undefined {
  return lines
    .flat()
    .filter((t) => /^("""|''')$/.test(t.text))
    .at(-1);
}

/** Scopes of the first token on the given line whose text, ignoring surrounding spaces, equals `text`. */
export function scopesOf(lines: Token[][], lineIndex: number, text: string): string[] {
  const token = lines[lineIndex]?.find((t) => t.text.trim() === text.trim());

  if (!token) {
    const seen = (lines[lineIndex] ?? []).map((t) => JSON.stringify(t.text)).join(" ");
    throw new Error(`no token ${JSON.stringify(text)} on line ${lineIndex}; tokens: ${seen}`);
  }

  return token.scopes;
}

/** Asserts the token has every expected scope; the message lists the scopes it does have. */
export function assertScopes(scopes: string[], expected: string[]): void {
  const missing = expected.filter((e) => !scopes.includes(e));

  assert.deepEqual(missing, [], `missing scopes; token has: ${scopes.join(" ")}`);
}

export function assertNoScopes(scopes: string[], unexpected: string[]): void {
  const present = unexpected.filter((e) => scopes.includes(e));

  assert.deepEqual(present, [], `unexpected scopes; token has: ${scopes.join(" ")}`);
}
