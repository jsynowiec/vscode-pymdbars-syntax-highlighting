/**
 * Generates the injection grammars in `syntaxes/`. The Handlebars rules exist once per delimiter
 * style (`{{` in plain strings, `{{{{` in f-strings) and the string rules once per prefix family,
 * so they are built here rather than maintained by hand. Run `pnpm generate` after editing.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type Rule = { [key: string]: Json };

export const ROOT_PATH = join(__dirname, "..");
export const SYNTAX_PATH = "syntaxes";
export const SYNTAX_ROOT_PATH = join(ROOT_PATH, SYNTAX_PATH);

/** Lookahead for the string's own closing quotes; ends any construct still open when they arrive. */
const QUOTES_AHEAD = `(?="""|''')`;
const STRING_SCOPES = "string.interpolated.python string.quoted.multi.python";
/** Marks Handlebars tags so the injections that would otherwise match inside them can exclude them. */
const HANDLEBARS_SCOPE = "meta.handlebars.pymdbars";
const SUPPORT_CONSTANT = "support.constant.handlebars";
const TICK = "`";

function captures(...names: string[]): Rule {
  return Object.fromEntries(names.map((name, i) => [String(i + 1), { name }]));
}

type Delimiters = {
  /** Suffix of the rule names, one set per delimiter style. */
  id: string;
  open: string;
  close: string;
  /** Optional extra brace pair that makes a tag unescaped output: `{{{x}}}`. */
  extraOpen: string;
  extraClose: string;
};

const PLAIN: Delimiters = {
  id: "plain",
  open: String.raw`\{\{`,
  close: String.raw`\}\}`,
  extraOpen: String.raw`\{?`,
  extraClose: String.raw`\}?`,
};

// In an f-string Python turns `{{{{` into `{{`, so Handlebars is written with doubled braces.
const FSTRING: Delimiters = {
  id: "fstring",
  open: String.raw`\{\{\{\{`,
  close: String.raw`\}\}\}\}`,
  extraOpen: String.raw`(?:\{\{)?`,
  extraClose: String.raw`(?:\}\})?`,
};

/** A Python `{expression}` in an f-string. */
function fstringInterpolationRule(quote: Quote): Rule {
  const quotesAhead = `(?=${quote.text})`;
  const placeholder = { name: "constant.character.format.placeholder.other.python" };

  return {
    name: "meta.interpolation.pymdbars",
    begin: String.raw`\{(?!\{)`,
    beginCaptures: { "0": placeholder },
    end: String.raw`(\})|${quotesAhead}`,
    endCaptures: { "1": placeholder },
    patterns: [
      { include: "source.python#fstring-terminator-multi" },
      { include: "source.python#f-expression" },
    ],
  };
}

function handlebarsRules(
  { id, open, close, extraOpen, extraClose }: Delimiters,
  quote: Quote,
): {
  rules: Rule;
  tags: Rule;
} {
  const quotesAhead = `(?=${quote.text})`;
  const notAtQuotes = `(?!${quote.text})`;
  const end = `(~?${close})|${quotesAhead}`;
  const endCaptures = captures(SUPPORT_CONSTANT);
  const helperName: Rule = {
    patterns: [
      {
        match: String.raw`\b(?:if|unless|each|with)(?![\w./@-])`,
        name: "keyword.control.handlebars",
      },
      { match: String.raw`[\w./@-]+`, name: "entity.name.function.handlebars" },
    ],
  };
  const args = `#args-${id}`;
  // In an f-string Python substitutes `{expression}` before Handlebars sees the text.
  const interpolation = id === "fstring" ? [{ include: "#fstring-interpolation" }] : [];

  const rules: Rule = {
    [`args-${id}`]: {
      patterns: [
        ...interpolation,
        {
          name: "meta.subexpression.handlebars",
          begin: String.raw`\(`,
          end: String.raw`\)|(?=~?${close})|${quotesAhead}`,
          patterns: [{ include: args }],
        },
        {
          match: String.raw`\b(as)\s+(\|)((?:${notAtQuotes}[^|\n])*)(\|)`,
          captures: captures(
            "keyword.control.handlebars",
            "punctuation.definition.parameters.begin.handlebars",
            "variable.parameter.handlebars",
            "punctuation.definition.parameters.end.handlebars",
          ),
        },
        {
          match: String.raw`([\w-]+)(=)`,
          captures: captures(
            "entity.other.attribute-name.handlebars",
            "keyword.operator.assignment.handlebars",
          ),
        },
        {
          name: "string.quoted.double.handlebars",
          begin: String.raw`"(?=(?:${notAtQuotes}[^"\n])*${notAtQuotes}")`,
          end: '"',
        },
        {
          name: "string.quoted.single.handlebars",
          begin: String.raw`'(?=(?:${notAtQuotes}[^'\n])*${notAtQuotes}')`,
          end: "'",
        },
        {
          name: "string.quoted.double.handlebars",
          begin: '"',
          end: `${quotesAhead}|(?=~?${close})|"|$`,
        },
        {
          name: "string.quoted.single.handlebars",
          begin: "'",
          end: `${quotesAhead}|(?=~?${close})|'|$`,
        },
        {
          name: "constant.numeric.handlebars",
          match: String.raw`(?<![\w.@/-])-?\d+(?:\.\d+)?(?![\w.@/-])`,
        },
        {
          name: "constant.language.handlebars",
          match: String.raw`(?<![\w.@/-])(?:true|false|null|undefined)(?![\w.@/-])`,
        },
        { name: "variable.parameter.handlebars", match: String.raw`[\w./@-]+` },
      ],
    },
    [`comment-block-${id}`]: {
      name: `comment.block.handlebars ${HANDLEBARS_SCOPE}`,
      begin: String.raw`${open}~?!--`,
      end: String.raw`--~?${close}|${quotesAhead}`,
    },
    [`comment-${id}`]: {
      name: `comment.block.handlebars ${HANDLEBARS_SCOPE}`,
      begin: String.raw`${open}~?!`,
      end: `${close}|${quotesAhead}`,
    },
    [`block-close-${id}`]: {
      name: `meta.function.block.end.handlebars ${HANDLEBARS_SCOPE}`,
      begin: String.raw`(${open}~?/)\s*([\w./@-]+)`,
      beginCaptures: { "1": { name: SUPPORT_CONSTANT }, "2": helperName },
      end,
      endCaptures,
    },
    [`block-open-${id}`]: {
      name: `meta.function.block.start.handlebars ${HANDLEBARS_SCOPE}`,
      begin: String.raw`(${open}~?[#^]\*?)\s*([\w./@-]+)`,
      beginCaptures: { "1": { name: SUPPORT_CONSTANT }, "2": helperName },
      end,
      endCaptures,
      patterns: [{ include: args }],
    },
    [`bare-else-${id}`]: {
      name: `meta.function.inline.else.handlebars ${HANDLEBARS_SCOPE}`,
      match: String.raw`(${open}~?)\s*(\^)\s*(~?${close})`,
      captures: captures(SUPPORT_CONSTANT, "keyword.control.handlebars", SUPPORT_CONSTANT),
    },
    [`else-${id}`]: {
      name: `meta.function.inline.else.handlebars ${HANDLEBARS_SCOPE}`,
      begin: String.raw`(${open}~?)\s*(else)(?![\w./@-])`,
      beginCaptures: captures(SUPPORT_CONSTANT, "keyword.control.handlebars"),
      end,
      endCaptures,
      patterns: [{ include: args }],
    },
    [`partial-${id}`]: {
      name: `meta.function.inline.other.handlebars ${HANDLEBARS_SCOPE}`,
      begin: String.raw`(${open}~?>)\s*([\w./@-]+)`,
      beginCaptures: captures(SUPPORT_CONSTANT, "variable.parameter.handlebars"),
      end,
      endCaptures,
      patterns: [{ include: args }],
    },
    [`expression-${id}`]: {
      name: `meta.function.inline.other.handlebars ${HANDLEBARS_SCOPE}`,
      // A first word followed by more arguments is a helper call; alone it is a variable.
      begin: String.raw`(${open}${extraOpen}~?&?)\s*(?:([\w./@-]+)(?=\s+[^\s~}])|([\w./@-]+))?`,
      beginCaptures: captures(
        SUPPORT_CONSTANT,
        "entity.name.function.handlebars",
        "variable.parameter.handlebars",
      ),
      end: `(~?${close}${extraClose})|${quotesAhead}`,
      endCaptures,
      patterns: [{ include: args }],
    },
  };

  const tags: Rule = {
    patterns: [
      "comment-block",
      "comment",
      "block-close",
      "block-open",
      "bare-else",
      "else",
      "partial",
      "expression",
    ].map((name) => ({ include: `#${name}-${id}` })),
  };

  return { rules, tags };
}

function handlebarsGrammar(quote: Quote): Rule {
  const plain = handlebarsRules(PLAIN, quote);
  const fstring = handlebarsRules(FSTRING, quote);

  return {
    scopeName: `markdown-template.python.handlebars.${quote.id}`,
    injectionSelector: `L:meta.template.pymdbars.plain meta.template.quotes.${quote.id} -${HANDLEBARS_SCOPE}`,
    patterns: [{ include: "#plain-tags" }],
    repository: {
      "plain-tags": plain.tags,
      "fstring-tags": fstring.tags,
      "fstring-interpolation": fstringInterpolationRule(quote),
      ...plain.rules,
      ...fstring.rules,
    },
  };
}

function interpolationGrammar(quote: Quote): Rule {
  return {
    scopeName: `markdown-template.python.interpolation.${quote.id}`,
    injectionSelector: `L:meta.template.pymdbars.fstring meta.template.quotes.${quote.id} -meta.interpolation.pymdbars -${HANDLEBARS_SCOPE}`,
    patterns: [
      { include: `markdown-template.python.handlebars.${quote.id}#fstring-tags` },
      { include: "#escaped-brace" },
      { include: `markdown-template.python.handlebars.${quote.id}#fstring-interpolation` },
    ],
    repository: {
      "escaped-brace": { name: "constant.character.escape.python", match: String.raw`\{\{|\}\}` },
    },
  };
}

/** How a triple-quoted string is read: which prefixes it accepts and which interpolation applies. */
type StringFamily = {
  /** Scope suffix of the string body; selects the interpolation injection. */
  kind: "fstring" | "plain";
  /** Regex for the prefix right before the quotes; capture 1 is the prefix. */
  prefix: string;
  raw: boolean;
  /** Real f-strings are scoped as such; strings only read like f-strings are not. */
  isPythonFString: boolean;
};

const STRING_FAMILIES: Record<string, StringFamily> = {
  "string-fstring": {
    kind: "fstring",
    prefix: String.raw`\b([fF])`,
    raw: false,
    isPythonFString: true,
  },
  "string-fstring-raw": {
    kind: "fstring",
    prefix: String.raw`\b([rR][fF]|[fF][rR])`,
    raw: true,
    isPythonFString: true,
  },
  "string-plain": {
    kind: "plain",
    prefix: String.raw`(?<!\w)([uU]?)`,
    raw: false,
    isPythonFString: false,
  },
  "string-plain-raw": {
    kind: "plain",
    prefix: String.raw`(?<!\w)([rR])`,
    raw: true,
    isPythonFString: false,
  },
  // Under `# prompt: markdown` a string without the f prefix is still read like an f-string.
  "string-default-fstring": {
    kind: "fstring",
    prefix: String.raw`(?<!\w)([uU]?)`,
    raw: false,
    isPythonFString: false,
  },
  "string-default-fstring-raw": {
    kind: "fstring",
    prefix: String.raw`(?<!\w)([rR])`,
    raw: true,
    isPythonFString: false,
  },
};

/**
 * The two triple-quote styles. Rules that must stop at the string's own closing quotes, and only
 * those (a fenced code block may contain the other style), exist once per style.
 */
const QUOTES = [
  { id: "dq", text: `"""` },
  { id: "sq", text: `'''` },
] as const;
type Quote = (typeof QUOTES)[number];

/** Each rule name once per quote style. */
const perQuote = (names: string[]) =>
  names.flatMap((name) => QUOTES.map(({ id }) => `${name}-${id}`));

function stringRule({ kind, prefix, raw, isPythonFString }: StringFamily, quote: Quote): Rule {
  const rule: Rule = {
    begin: `${prefix}(${quote.text})`,
    beginCaptures: {
      "1": { name: `storage.type.string.python ${STRING_SCOPES}` },
      "2": { name: `punctuation.definition.string.begin.python ${STRING_SCOPES}` },
    },
    end: `(${quote.text})`,
    endCaptures: { "1": { name: `punctuation.definition.string.end.python ${STRING_SCOPES}` } },
    // The body counts as a string for VS Code (bracket pairing, auto-closing, suggestions).
    contentName: `string.quoted.multi.python meta.template.pymdbars.${kind} meta.template.quotes.${quote.id}`,
    patterns: [
      // Consume escaped quotes and backslashes so `\"""` does not close the string.
      { include: raw ? "#raw-escape" : "source.python#escape-sequence" },
      ...(raw ? [] : [{ include: "source.python#escape-sequence-unicode" }]),
      { include: `#markdown-body-${quote.id}` },
    ],
  };

  if (isPythonFString) rule.name = "meta.fstring.python";

  return rule;
}

/** Prefixes the string rules accept; the assignment rule only starts when one of them follows. */
const STRING_START_AHEAD = String.raw`(?=(?:[fF]|[rR][fF]|[fF][rR]|[rR]|[uU])?(?:"""|'''))`;
const ASSIGNMENT_TO_STRING = String.raw`^[ \t]*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)(?:[ \t]*(:)[ \t]*([^=\n]+?))?[ \t]*(=)[ \t]*${STRING_START_AHEAD}`;

/** Rules for strings read as written: an `f` prefix means f-string, otherwise Handlebars. */
const TEMPLATE_STRING_RULES = perQuote([
  "string-fstring-raw",
  "string-fstring",
  "string-plain-raw",
  "string-plain",
]);

/**
 * `# prompt: <mode>` on the line above `name = """..."""`. The comment rule stays open only for
 * that one assignment: it ends when the next line is not such an assignment, or right after the
 * string closes.
 */
function markerRules(mode: "markdown" | "markdown-handlebars"): Rule {
  const stringRules =
    mode === "markdown"
      ? perQuote([
          "string-fstring-raw",
          "string-fstring",
          "string-default-fstring-raw",
          "string-default-fstring",
        ])
      : TEMPLATE_STRING_RULES;

  return {
    [`marker-${mode}`]: {
      begin: String.raw`^[ \t]*((#)[ \t]*prompt:[ \t]*${mode}[ \t]*)$`,
      beginCaptures: {
        "1": { name: "comment.line.number-sign.python" },
        "2": { name: "punctuation.definition.comment.python" },
      },
      end: String.raw`^(?!${ASSIGNMENT_TO_STRING})|(?<="""|''')`,
      patterns: [{ include: `#assignment-${mode}` }],
    },
    [`assignment-${mode}`]: {
      begin: ASSIGNMENT_TO_STRING,
      beginCaptures: {
        "2": { name: "punctuation.separator.annotation.variable.python" },
        "3": { patterns: [{ include: "source.python#expression" }] },
        "4": { name: "keyword.operator.assignment.python" },
      },
      end: String.raw`(?<="""|''')`,
      patterns: stringRules.map((name) => ({ include: `#${name}` })),
    },
  };
}

/** Mirrors MagicPython's `function-arguments` so other arguments keep their usual scopes. */
const CALL_ARGUMENTS: Rule[] = [
  { name: "punctuation.separator.arguments.python", match: "(,)" },
  {
    match: String.raw`(?x) (?:(?<=[,(])|^) \s* (\*{1,2})`,
    captures: { "1": { name: "keyword.operator.unpacking.arguments.python" } },
  },
  { include: "source.python#lambda-incomplete" },
  { include: "source.python#illegal-names" },
  {
    match: String.raw`\b([[:alpha:]_]\w*)\s*(=)(?!=)`,
    captures: {
      "1": { name: "variable.parameter.function-call.python" },
      "2": { name: "keyword.operator.assignment.python" },
    },
  },
  { name: "keyword.operator.assignment.python", match: "=(?!=)" },
  { include: "source.python#expression" },
];

/**
 * Block structure is written here instead of including text.html.markdown wholesale: its
 * paragraph (begin/while) and indented-code rules are still on the stack when the closing quotes
 * arrive, so the string never ends. Inline spans and thematic breaks are delegated to the
 * Markdown grammar. A fenced code block ends at the string's own quote style only.
 */
function markdownBodyRules({ id, text }: Quote): [string, Rule][] {
  const quotesAhead = `(?=${text})`;
  const info = String.raw`((?:(?!${text})[^\s${TICK}])*)(?:(?!${text})[^${TICK}\n])*(?=$|${text})`;

  return [
    [
      `markdown-body-${id}`,
      {
        patterns: [
          { include: `#fenced-code-${id}` },
          { include: "#heading" },
          { include: "#blockquote-marker" },
          { include: "#list-marker" },
          { include: "text.html.markdown#separator" },
          { include: "#inline-code" },
          { include: `#link-unfinished-${id}` },
          { include: "text.html.markdown#inline" },
        ],
      },
    ],
    [
      // Markdown's link rule accepts the closing quotes (and the call's `)` after them) as the
      // link destination, which would swallow the end of the string.
      `link-unfinished-${id}`,
      {
        name: "meta.link.inline.markdown",
        match: String.raw`(\[)((?<square>(?!${text})[^\[\]\\]|\\.|\[\g<square>*+\])*+)(\])(\()([^\s()]*?)(?=${text})`,
        captures: {
          "1": { name: "punctuation.definition.link.title.begin.markdown" },
          "2": { name: "string.other.link.title.markdown" },
          "4": { name: "punctuation.definition.link.title.end.markdown" },
          "5": { name: "punctuation.definition.metadata.markdown" },
          "6": { name: "markup.underline.link.markdown" },
        },
      },
    ],
    [
      `fenced-code-${id}`,
      {
        name: "markup.fenced_code.block.markdown",
        begin: String.raw`(?:^|\G)[ ]*(${TICK}{3,}|~{3,})[ ]*${info}`,
        beginCaptures: {
          "1": { name: "punctuation.definition.markdown" },
          "2": { name: "fenced_code.block.language.markdown" },
        },
        end: String.raw`(?:^|\G)[ ]*\1[${TICK}~]*[ ]*$|${quotesAhead}`,
        endCaptures: { "0": { name: "punctuation.definition.markdown" } },
        patterns: [{ include: "#raw-escape" }],
      },
    ],
  ];
}

function entryGrammar(): Rule {
  const stringRules: Rule = {};

  for (const [name, family] of Object.entries(STRING_FAMILIES))
    for (const quote of QUOTES) stringRules[`${name}-${quote.id}`] = stringRule(family, quote);

  return {
    scopeName: "markdown-template.python.entry",
    injectionSelector: "L:source.python -string -comment -meta.template.pymdbars",
    patterns: [
      { include: "#template-str-call" },
      { include: "#marker-markdown" },
      { include: "#marker-markdown-handlebars" },
    ],
    repository: {
      ...markerRules("markdown"),
      ...markerRules("markdown-handlebars"),
      "template-str-call": {
        name: "meta.function-call.python",
        begin: String.raw`\b(TemplateStr)\s*(\()`,
        beginCaptures: {
          "1": { name: "meta.function-call.generic.python" },
          "2": { name: "punctuation.definition.arguments.begin.python" },
        },
        end: String.raw`\)`,
        endCaptures: { "0": { name: "punctuation.definition.arguments.end.python" } },
        patterns: [
          ...TEMPLATE_STRING_RULES.map((rule) => ({ include: `#${rule}` })),
          ...CALL_ARGUMENTS,
        ],
        contentName: "meta.function-call.arguments.python",
      },
      ...stringRules,
      "raw-escape": { match: String.raw`\\[\\"']` },
      ...Object.fromEntries(QUOTES.flatMap((quote) => markdownBodyRules(quote))),
      heading: {
        name: "markup.heading.markdown",
        begin: String.raw`(?:^|\G)[ ]*(#{1,6})(?=\s|$)`,
        beginCaptures: { "1": { name: "punctuation.definition.heading.markdown" } },
        end: `${QUOTES_AHEAD}|$`,
        contentName: "entity.name.section.markdown",
        patterns: [
          { include: "#raw-escape" },
          { include: "#inline-code" },
          { include: "text.html.markdown#inline" },
        ],
      },
      // Replaces Markdown's one-step code span rule, which hides placeholders and cannot be
      // ended by the closing quotes.
      "inline-code": {
        name: "markup.inline.raw.string.markdown",
        begin: String.raw`(?<!${TICK})(${TICK}+)(?!${TICK})`,
        beginCaptures: { "1": { name: "punctuation.definition.raw.markdown" } },
        end: String.raw`(?<!${TICK})(\1)(?!${TICK})|^[ \t]*$|${QUOTES_AHEAD}`,
        endCaptures: { "1": { name: "punctuation.definition.raw.markdown" } },
        patterns: [{ include: "#raw-escape" }],
      },
      "blockquote-marker": {
        match: String.raw`(?:^|\G)[ ]*(>)`,
        captures: { "1": { name: "punctuation.definition.quote.begin.markdown" } },
        name: "markup.quote.markdown",
      },
      "list-marker": {
        match: String.raw`(?:^|\G)[ ]*([*+-]|\d{1,9}[.)])(?=[ \t]|$)`,
        captures: { "1": { name: "punctuation.definition.list.begin.markdown" } },
        name: "markup.list.markdown",
      },
    },
  };
}

/**
 * Markdown spans (bold, italic, link text) include Markdown's own code span rule, which hides
 * placeholders. Inside them our code span rule is tried first.
 */
function spansGrammar(): Rule {
  return {
    scopeName: "markdown-template.python.spans",
    injectionSelector:
      "L:meta.template.pymdbars (markup.bold.markdown | markup.italic.markdown | string.other.link.title.markdown) -markup.inline.raw.string.markdown",
    patterns: [{ include: "markdown-template.python.entry#inline-code" }],
  };
}

/** File name in `syntaxes/` to grammar. */
export function buildGrammars(): Record<string, Rule> {
  return {
    "python-entry.injection.json": entryGrammar(),
    ...Object.fromEntries(
      QUOTES.flatMap((quote) => [
        [
          `python-interpolation${quote.id === "dq" ? "" : "-sq"}.injection.json`,
          interpolationGrammar(quote),
        ],
        [
          `python-handlebars${quote.id === "dq" ? "" : "-sq"}.injection.json`,
          handlebarsGrammar(quote),
        ],
      ]),
    ),
    "python-spans.injection.json": spansGrammar(),
  };
}

export function serialize(grammar: Rule): string {
  return `${JSON.stringify(grammar, null, 2)}\n`;
}

if (require.main === module) {
  for (const [file, grammar] of Object.entries(buildGrammars())) {
    writeFileSync(join(SYNTAX_ROOT_PATH, file), serialize(grammar));
  }
}
