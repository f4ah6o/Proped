# Vendored Rabbita todo

- Upstream: `moonbit-community/rabbita`
- Source: `examples/todo`
- Revision: `67e8169efa1bb2e8bd17018b62b41211cbc4c357`
- Retrieved: 2026-08-04
- License: Apache-2.0
- `upstream/main.mbt.txt` SHA-256: `4076ede7bddd278ca3017c8b96db155b5fff7d2c439a76df3b5600f96ce55529`
- `upstream/styles.css` SHA-256: `24dba188d3b33ec412cabc1ee66620d373a395ea25d28008ea80663e23e8251f`

The unmodified upstream entry point and stylesheet are preserved under `upstream/`.

`todo.mbt` is an adapter-oriented derivative. It preserves the upstream model concepts and message semantics for title changes, add, delete, toggle, and tab selection. The item store is bounded to two generated items and the title corpus is finite so native property exploration terminates deterministically.

The upstream update guard rejects only `title == ""`. Consequently, a whitespace-only title is accepted. Proped Rabbita detects this behavior with the property `stored todo titles are not blank` and shrinks the reproducer to:

1. `TitleChanged(" ")`
2. `Add`
