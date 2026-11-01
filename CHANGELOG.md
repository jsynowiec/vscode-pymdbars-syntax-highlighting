# Changelog

## [0.1.0] - 2026-11-01

### Added

- Markdown highlighting in triple-quoted strings passed to `TemplateStr(...)`. Both quote styles and the `f`, `r`, `rf`, and `fr` prefixes are supported, regardless of case.
- Highlighting for Python f-string expressions, `{{` and `}}` escapes, and Python escape sequences in those strings.
- Opt-in highlighting for other triple-quoted string assignments. Place `# prompt: markdown` on the line above an assignment to highlight the string like an f-string, even without an `f` prefix. Use `# prompt: markdown-handlebars` to highlight a string without an `f` prefix as a Handlebars template.
- Highlighting for Handlebars variables, conditionals, loops, partials, comments, and helper calls. Use `{{name}}` in plain strings and `{{{{name}}}}` in f-strings.
