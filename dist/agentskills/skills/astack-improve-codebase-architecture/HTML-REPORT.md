# HTML Report Format

Write one self-contained HTML file in the OS temp directory.
Load Tailwind and Mermaid from their CDNs.
Use Mermaid for graphs and custom divs or inline SVG for mass diagrams and cross-sections.
Mix these forms to fit the structure rather than use Mermaid for everything.

## Scaffold

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Architecture review for {{repo name}}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script type="module">
      import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
      mermaid.initialize({ startOnLoad: true, theme: "neutral", securityLevel: "loose" });
    </script>
    <style>
      /* small custom layer for things Tailwind doesn't cover cleanly:
         dashed seam lines, hand-drawn-feeling arrow heads, etc. */
      .seam { stroke-dasharray: 4 4; }
      .leak { stroke: #dc2626; }
      .deep { background: linear-gradient(135deg, #0f172a, #1e293b); }
    </style>
  </head>
  <body class="bg-stone-50 text-slate-900 font-sans">
    <main class="max-w-5xl mx-auto px-6 py-12 space-y-12">
      <header>...</header>
      <section id="candidates" class="space-y-10">...</section>
      <section id="top-recommendation">...</section>
    </main>
  </body>
</html>
```

## Header

Show the repo name, date and a compact legend.
The legend maps a solid box to Module and a dashed line to Seam.
A red arrow means leakage.
A thick dark box means a deep module.
Start the candidates without an introduction paragraph.

## Candidate card

Use diagrams for the main explanation.
Keep prose short and plain.
Use terms from `/astack-codebase-design`.

Put each candidate in one `<article>` with these parts:

- A short title naming the deepening, such as "Collapse the Order intake pipeline".
- A badge row. Use emerald for `Strong`, amber for `Worth exploring`, and slate for `Speculative`. Tag its dependency category as `in-process`, `local-substitutable`, `ports & adapters` or `mock`.
- A monospaced file list with `font-mono text-sm`.
- Before and after diagrams in two side-by-side columns, using the patterns below.
- One sentence for the problem and one for the solution.
- Wins bullets of at most 6 words each. Examples are "Tests hit one interface", "Pricing logic stops leaking" and "Delete 4 shallow wrappers".
- When needed, a one-line ADR callout in an amber box.

Avoid explanatory paragraphs.
Redraw a diagram if it needs a paragraph to be understood.

## Diagram patterns

Choose a pattern for each candidate.
Vary diagrams when different patterns explain the candidates better.

### Mermaid graph (the workhorse for dependencies / call flow)

Use a Mermaid `flowchart` or `graph` to explain calls and dependencies.
Place it in a Tailwind-styled card.
Use classDef to mark leakage red and the deep module dark.
Use a sequence diagram for a change such as 6 round trips becoming 1.

```html
<div class="rounded-lg border border-slate-200 bg-white p-4">
  <pre class="mermaid">
    flowchart LR
      A[OrderHandler] --> B[OrderValidator]
      B --> C[OrderRepo]
      C -.leak.-> D[PricingClient]
      classDef leak stroke:#dc2626,stroke-width:2px;
      class C,D leak
  </pre>
</div>
```

### Hand-built boxes-and-arrows (when Mermaid's layout fights you)

Represent modules with bordered, labeled `<div>` elements.
Position SVG `<line>` or `<path>` arrows over a relative container.
Use this form for a thick-bordered deep module with faded internal modules when Mermaid cannot express the needed emphasis.

### Cross-section (good for layered shallowness)

Use horizontal bands with `h-12 border-l-4` for layers in a call.
Compare 6 thin, pass-through layers with 1 thick band labeled with the combined responsibility.

### Mass diagram (good for "interface as wide as implementation")

Draw two rectangles for each module, one for interface size and one for implementation.
A shallow module has rectangles of nearly equal height.
A deep module has a short interface rectangle and tall implementation rectangle.

### Call-graph collapse

Show the original call tree as nested boxes.
Show the same tree inside one box after deepening.
Fade calls that become internal.

## Style guidance

- Use generous whitespace and a document layout. Optional `font-serif` headings fit stone and slate colors.
- Use one accent, emerald or indigo. Reserve red for leakage and amber for warnings.
- Keep diagrams about 320px tall so the before and after fit beside each other without scrolling.
- Use `text-xs uppercase tracking-wider` for module labels inside diagrams.
- Use only the Tailwind CDN script and Mermaid ESM import. Keep the rest static, without application code or interaction beyond Mermaid rendering.

## Top recommendation section

Use one larger card.
Give the candidate name, one reason sentence and an anchor link to its card.

## Tone

Write concise plain English with nouns and verbs from `/astack-codebase-design`.
Keep these exact terms:

- module, interface, implementation, depth, deep and shallow.
- seam, adapter, leverage and locality.

Do not replace Module with component, service or unit.
Do not replace Interface with API or signature.
Do not replace Seam with boundary.
Do not call a module a layer or wrapper when you mean Module.

Suitable phrasing includes:

- "The Order intake module is shallow. Its interface nearly matches the implementation."
- "Pricing leaks across the seam."
- "Deepen the module to give one interface and one place to test."
- "HTTP and in-memory adapters justify the seam for production and tests."

Use glossary terms to state each win.
Examples include concentrated bugs for Locality and one interface for N call sites for Leverage.
An interface can shrink as the implementation absorbs wrappers.
Avoid vague claims such as "easier to maintain" or "cleaner code".

Remove hedges and introductory filler.
Use a bullet when it states the point more directly.
Delete a bullet with no useful content.
Look for a glossary term before you invent another term.
