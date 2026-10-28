# UI Prototype

Build several structurally different UI variants on one route.
Let the user compare them with a floating bottom bar.
After a choice or combination, remove the rejected designs from main.
For logic or state questions, follow [LOGIC.md](LOGIC.md) instead.

## When this is the right shape

Use this branch to explore a page's appearance, dashboard options or a different settings layout.
Show concrete variants rather than ask the user to choose between descriptions.

## Two sub-shapes: strongly prefer sub-shape A

Prefer an existing page when the variants have a plausible home there.
Its real header, sidebar, data and density expose issues that an isolated route can hide.
Use a new page only when no suitable host exists.

### Sub-shape A: adjustment to an existing page (preferred)

Render variants on the existing route behind the `?variant=` URL search parameter.
Keep its data fetching, parameters and authentication.
Swap only the rendered content.
This is the default unless a specific reason rules it out.

A new dashboard section, settings card or step within an existing flow still belongs to sub-shape A.
Mount its variants inside that host page.

### Sub-shape B: a new page (last resort)

Use this only for a genuinely new top-level area or a flow that cannot fit an existing page.
Follow the repo's routing convention for a temporary route.
Do not invent a new top-level structure.
Make the prototype status obvious through its path or filename, such as `prototype`.
Use the same `?variant=` pattern.
Before choosing this route, check again for a suitable existing page.
Both sub-shapes use the same floating bottom bar.

## Process

### 1. State the question and pick N

Default to 3 variants and cap the count at 5.
Give the plan in one line in a visible intro or adjacent README.
For example, state that three settings variants use `?variant=` on the existing `/settings` route.
This records the assumption even when the user is unavailable.

### 2. Generate radically different variants

Keep each variant consistent with the page's purpose, available data and existing component or styling system.
Export clear component names such as `VariantA`, `VariantB` and `VariantC`.
Vary layout, information hierarchy or the primary interaction.
Color changes alone do not provide different designs.
If two drafts are too similar, rebuild one with an explicit structural constraint.
For example, prohibit another card grid.

### 3. Wire them together

Put one switcher component on the route:

```tsx
// pseudo-code, adapt to the project's framework
const variant = searchParams.get('variant') ?? 'A';
return (
  <>
    {variant === 'A' && <VariantA {...data} />}
    {variant === 'B' && <VariantB {...data} />}
    {variant === 'C' && <VariantC {...data} />}
    <PrototypeSwitcher variants={['A','B','C']} current={variant} />
  </>
);
```

For sub-shape A, keep existing data fetching above the switcher.
Change only the rendered subtree for each variant.
For sub-shape B, mount the same switcher under `/prototype/<name>`.

### 4. Build the floating switcher

Use a small fixed bar at the bottom center with these parts:

- A left arrow selects the previous variant and wraps at the start.
- A label shows the current key and any exported variant name, such as `B (Sidebar layout)`.
- A right arrow selects the next variant and wraps at the end.

Apply these behavior rules:

- Arrow clicks update the URL parameter through the framework router, such as `router.replace` or `navigate`. Links and reloads must retain the variant.
- Keyboard `←` and `→` also cycle variants. Do not intercept them while `<input>`, `<textarea>` or `[contenteditable]` has focus.
- Distinguish the bar visually from the design under review, such as a high-contrast pill with a subtle shadow.
- Hide it in production with `process.env.NODE_ENV !== 'production'` or an equivalent guard. An accidental merge must not expose the switcher to users.

Keep the switcher in one reusable component in the repo's shared UI location.
Both sub-shapes use that component.

### 5. Hand it over

Give the user the URL and `?variant=` keys.
They can compare variants when available.
Combine parts when their feedback selects elements from several designs.

### 6. Capture the answer and clean up

Record the winning variant and its reason.
Preserve the full prototype as [SKILL.md](SKILL.md) directs.
Move the chosen design into real code and put rejected variants on the temporary branch.

- For sub-shape A, integrate the winner into the existing page. Remove losing variants and the switcher from main.
- For sub-shape B, promote the winner to a real route. Remove the temporary route and switcher from main.

The full variant set is the primary source.
Keep it on the temporary branch rather than discard it or leave obsolete components in main.

## Anti-patterns

- Do not vary only color or wording. Use structural differences.
- Share a small element such as `<Header>` when useful. Do not force all variants into one shared `<Layout>`.
- Use read-only data or stub mutations. Do not connect prototype actions to real writes.
- Do not promote prototype code directly to production. Rewrite the winner with production tests and error handling when you integrate it.
