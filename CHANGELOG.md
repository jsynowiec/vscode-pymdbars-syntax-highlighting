# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Markdown highlighting inside triple-quoted strings passed to `TemplateStr(...)`, including `f`, `r`, `rf` and `fr` prefixes (any case) and both quote styles.
- Python f-string expressions, `{{` and `}}` escapes, and Python escape sequences in those strings.
- Opt-in highlighting for other triple-quoted strings with a `# prompt: markdown` comment on the line above the assignment. Strings without an `f` prefix are read like f-strings. Use `# prompt: markdown-handlebars` to read them as Handlebars templates instead.
- Handlebars variables, conditionals, loops, partials, comments and helper calls. In plain strings they are written as `{{name}}`; in f-strings as `{{{{name}}}}`.
