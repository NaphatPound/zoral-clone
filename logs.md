# Change Log

Living log of bugs found, features updated, and their fixes. Newest first.

---

## 2026-04-24 — Review pass: 2 bugs + 4 UX enhancements

### Bug 1 — `toReactFlow` position normalisation was biased by unpositioned nodes

**Severity:** Medium (visible drift for mixed graphs where only some nodes had
layout entries).

**Where:** `src/lib/parser.ts` → `toReactFlow`.

**Symptom**
The old code computed `minX = Math.min(...nodes.map(n => n.position?.x ?? 0))`.
When positioned nodes sat at positive coordinates (e.g. 500–1000) but any
node lacked a position, the `?? 0` sentinel dragged `minX` down to `0`, so
the positioned nodes were **not** translated to the origin — the graph
still started several hundred pixels off-screen.

**Repro**
Added `toReactFlow > normalises using only nodes that actually have positions (bug fix)`.
Laying out only items `1` (x=500) and `2` (x=800) produced:

```
AssertionError: expected 500 to be +0
```

**Fix**
Filter to just the nodes with real positions before computing the min.
Replaced `Math.min(...spread)` with a fold to avoid the stack-size pitfall
of large workflows. Unpositioned nodes still fall back to a deterministic
grid layout.

### Bug 2 — `extractText` silently lost numeric script bodies

**Severity:** Low (the real sample never hits it, but the parser would
silently drop scripts whose body parses as a literal number, e.g.
`<Script>1</Script>`).

**Where:** `src/lib/parser.ts` → `extractText`.

**Symptom**
`fast-xml-parser` coerces purely numeric text to a `number` by default, so
`extractText` — which only checked `typeof value === "string"` — returned
`undefined` for those scripts. The details panel would render an empty
script box with no error.

**Repro**
Added `numeric <Script> content > still returns a string for script bodies parsed as numbers`:

```
AssertionError: expected undefined to be '1'
```

**Fix**
Introduced a `coerceText` helper that also accepts `number` / `boolean`
and returns their string form. `extractText` now walks the common shapes
(`string | { "#text" } | { Script }`) through `coerceText`, so a numeric
or boolean body survives the round trip.

### Enhancement 1 — Wire gateway `if` / `else` branches to distinct handles

`NodeCard` now renders per-kind handles:
- Start: source only, right.
- End: target only, left.
- Gateway: target on left, source handles `id="if"` (right) and
  `id="else"` (bottom) — so conditional branches visibly fan out.
- Default (task): target left, source right.

`toReactFlow` sets `sourceHandle` to `"if"` / `"else"` **only** when the
source node is a gateway; other edges keep the default handle so
non-gateway graphs still route correctly. Covered by
`toReactFlow > wires sourceHandle for gateway if/else branches only`.

### Enhancement 2 — JSON export button

`GraphCanvas` ships a **Download JSON** button that serialises the full
parsed `Workflow` (meta, globals, nodes, edges) via a Blob URL. Matches
the user's "JSON focus" goal — any parsed XML can now be extracted as a
clean JSON artefact for downstream tooling / diffing.

### Enhancement 3 — Live search / filter

A search input in the canvas toolbar dims non-matching nodes and edges.
Matches check node id, name, and `componentName` (so typing `Adw` isolates
every AdwQuery task). No re-layout — just visual dimming, zero latency.

### Enhancement 4 — Kind legend overlay

Added `src/components/Legend.tsx`: a bottom-left, pointer-events-none card
showing the colour ↔ kind mapping plus the boundary-error stroke. Makes
the six-colour palette self-documenting.

### Cleanup
- Removed the dead `Connections` entry from the `isArray` predicate (the
  layout sidecar is JSON, never fed through `XMLParser`).

### Verification
```
Test Files  2 passed (2)
Tests       21 passed (21)
```
`next build` clean — no type regressions.

---

## 2026-04-24 — Bug: `<Gateway>` branches were silently dropped

**Severity:** High (graph was incomplete — conditional routing invisible)

**Where:** `src/lib/parser.ts`

**Symptom**
The Zoral sample `INT_CPL_inquiry_assessment_0.xml` contains four
`<Gateway GatewayType="Exclusive">` elements whose outgoing flow is defined
as `<GatewayConnections><Connection ToId="..." IsElse="..."/>` rather than
the usual `NextId` attribute. The first version of the parser:

1. Only mapped `ExclusiveGateway` / `InclusiveGateway` / `ParallelGateway`
   tags to `kind: 'gateway'`. Zoral uses the bare tag name `<Gateway>` with
   a `GatewayType` attribute, so every gateway was classified as
   `kind: 'unknown'`.
2. Did not read `<GatewayConnections>` at all, so the conditional branches
   produced **zero edges** in the graph. Users would see the gateway node
   but no outgoing arrows to its targets.

**Repro**
Added a failing test:
`src/lib/parser.test.ts` → `parses <Gateway GatewayType=...> as a gateway node with branch edges`.
The test asserts the gateway resolves to `kind: 'gateway'` and that it
produces two outgoing edges, labelled `if` / `else`.

Initial run:
```
AssertionError: expected 'unknown' to be 'gateway'
Tests  1 failed | 17 passed (18)
```

**Fix**
1. Added `Gateway: 'gateway'` to `TAG_TO_KIND` so the bare Zoral tag is
   recognised.
2. Added `GatewayConnections` to `IGNORED_FIELDS` (it's now handled
   explicitly, not dumped into `attributes`).
3. Forced `<Connection>` into an array via the `isArray` callback so a
   gateway with a single branch still behaves like a list.
4. New helper `parseGatewayBranches` extracts `{ targetId, isElse, condition }`
   for every `<Connection>`.
5. `nodeFromItem` now returns both the node and its branches;
   `parseItems` stores the branches keyed by node id.
6. `buildEdges` emits one `sequence` edge per branch, labelled
   `if` (when `IsElse="false"`) or `else` (when `IsElse="true"`).

**Verification**
```
Test Files  2 passed (2)
Tests       18 passed (18)
```
`next build` also succeeds — no type regressions.

---

## 2026-04-24 — Feature: Initial project scaffold

- Created Next.js 14 (App Router) + TypeScript + Tailwind shell.
- `src/lib/parser.ts`: XML → JSON workflow parser. Converts Zoral
  `ProcessWorkflowConfiguration` into a node/edge graph:
  - Node kinds: `start`, `end`, `componentTask`, `scriptTask`, `gateway`,
    `unknown`.
  - Sequence edges from `NextId`; boundary edges from
    `<BoundaryErrorEvent>`; (after fix above) branch edges from
    `<GatewayConnections>`.
  - `applyLayout` merges positions from the sibling `.xml.layout` JSON.
  - `toReactFlow` normalises coordinates to `(0, 0)` and marks boundary
    edges with an animated red stroke.
- `src/components/GraphCanvas.tsx`: React Flow canvas + side panel.
- `src/components/NodeCard.tsx`: colour-coded node card per kind.
- `src/components/DetailsPanel.tsx`: JSON + script viewer for the
  selected node.
- `app/page.tsx`: server component loads the bundled
  `INT_CPL_inquiry_assessment_0.xml` and renders it.
- Vitest suite with 18 tests covering parser, layout merge, React Flow
  conversion, and the real fixture.

**How to run**

```bash
npm install
npm run dev       # http://localhost:3000
npm test          # vitest run
```
