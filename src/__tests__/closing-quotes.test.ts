import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertScopes, closerToken, tokenizePython } from "./tokenize";

// The grammar cannot see the end of a string until the closing quotes arrive, so every Markdown
// and template construct must give way to them, however unfinished it is. The oracle is the
// line after the string: it must tokenize as plain Python tokenizes that line on its own. (Plain
// Python is no oracle for the whole source: it leaves f-strings with an unterminated brace open.)
// Wholesale inclusion of the Markdown grammar failed most of these: its paragraph and
// indented-code rules were still open when the quotes arrived.

interface Wrapper {
  /** Everything before the opening quotes. */
  before: string;
  quote: '"""' | "'''";
  /** Everything after the closing quotes. */
  after: string;
}

const wrappers: Record<string, Wrapper> = {
  "TemplateStr f-string": { before: "p = TemplateStr(f", quote: '"""', after: ")" },
  "TemplateStr plain": { before: "p = TemplateStr(", quote: '"""', after: ")" },
  "TemplateStr raw f-string, single quotes": {
    before: "p = TemplateStr(rf",
    quote: "'''",
    after: ")",
  },
  "TemplateStr keyword argument": {
    before: "p = TemplateStr(strict=True, source=",
    quote: '"""',
    after: ")",
  },
  "marker, default": { before: "# prompt: markdown\nP = ", quote: '"""', after: "" },
  "marker, handlebars": { before: "# prompt: markdown-handlebars\nP = ", quote: "'''", after: "" },
};

type Layout = (open: string, body: string, close: string) => string;

const layouts: Record<string, Layout> = {
  "same line": (open, body, close) => `${open}${body}${close}`,
  "closing quotes on their own line": (open, body, close) => `${open}\n${body}\n${close}`,
  "indented, inside a function": (open, body, close) => {
    const indent = (text: string) => text.replace(/^/gm, "    ");
    return `def f():\n${indent(`${open}\n${body}\n${close}`)}`;
  },
};

// Unfinished or hostile constructs: each opens something the string could mistake for its own
// content. None ends in a backslash, which would legitimately escape the closing quotes.
const bodies = [
  "# T",
  "text",
  "more text",
  "**bold",
  "*em",
  "`code",
  "[link",
  "[link](",
  "[link](http://x",
  "[![img](a.png)](",
  "```python\nprint(1)",
  "~~~",
  "> quote",
  "- item",
  "1. item",
  "    indented code",
  "| a | b |",
  "<div",
  "{x}",
  "{",
  "}",
  "{{",
  "}}",
  "{{{{",
  "{{{x}}}",
  "{{{{#if a}}}}",
  "{{name",
  "{{#each xs}}",
  "{{!-- note",
  "{{> partial",
  // Handlebars arguments that read up to the end of the line must stop at the quotes.
  '{{upper "value',
  "{{upper 'value",
  "{{upper <Q>value",
  "{{{{upper <Q>value",
  "{{#each xs as |item",
  "{{{{#each xs as |item",
  // Escaped quotes inside block constructs must not end the string either.
  "# Say <ESC> here",
  "```python\nx = <ESC>doc<ESC>\n```",
  "> quote <ESC>",
  "- item <ESC>",
  "Use `<ESC>` here",
  "Use `a<ESC>",
];

const FOLLOWING_LINE = "x = 1";

describe("closing quotes end the string", () => {
  for (const [wrapperName, wrapper] of Object.entries(wrappers)) {
    for (const [layoutName, layout] of Object.entries(layouts)) {
      it(`${wrapperName}, ${layoutName}`, async () => {
        const [expected] = await tokenizePython(FOLLOWING_LINE, false);
        for (const template of bodies) {
          const body = template
            .replaceAll("<ESC>", `\\${wrapper.quote}`)
            .replaceAll("<Q>", wrapper.quote[0]);
          const open = `${wrapper.before}${wrapper.quote}`;
          const close = `${wrapper.quote}${wrapper.after}`;
          const source = `${layout(open, body, close)}\n${FOLLOWING_LINE}`;
          const context = JSON.stringify(source);
          const lines = await tokenizePython(source);
          assert.deepEqual(lines.at(-1), expected, `code after the string is affected: ${context}`);
          const closer = closerToken(lines);
          assert.ok(closer, `no closing quotes found: ${context}`);
          assertScopes(closer.scopes, ["punctuation.definition.string.end.python"]);
        }
      });
    }
  }
});

describe("code after the closing quotes", () => {
  it("does not extend an unfinished inline code span past the quotes", async () => {
    const source = 'p = TemplateStr("""Use `x""")  # see `y`\n' + FOLLOWING_LINE;
    const lines = await tokenizePython(source);
    assertScopes(closerToken(lines)?.scopes ?? [], ["punctuation.definition.string.end.python"]);
    assert.deepEqual(lines.at(-1), (await tokenizePython(FOLLOWING_LINE, false))[0]);
  });
});
