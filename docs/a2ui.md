# Model-composed cards with A2UI

mascop draws most tool results with a fixed card per tool (`TOOL_CARDS`). For answers that combine or select from several reads (a regional lead and his team, open positions and courses), the model composes one card instead. The card is an A2UI v0.9 surface, drawn by CopilotKit's A2UI renderer with mascop's own components. This page records how A2UI works in the installed versions and how mascop uses it.

## How A2UI works in the installed versions

Versions: `@copilotkit/runtime`, `@copilotkit/react-core` and `@copilotkit/a2ui-renderer` 1.77.0, `@a2ui/web_core` 0.10.4, `@ag-ui/mastra` 1.1.6, `@ag-ui/a2ui-middleware` (through `@copilotkit/shared`).

- **Wire format.** A2UI v0.9 (`@a2ui/web_core/v0_9`): `createSurface { surfaceId, catalogId }`, `updateComponents { surfaceId, components }`, `updateDataModel { surfaceId, path, value }`. Components are flat (`{ id, component, ...props }`) with `children: ["id"]` or a template `{ componentId, path }` that repeats one component per list item. A prop is a literal or `{ path }` into the surface's data model; inside a template, paths are relative to the item. A button's `action: { event: { name, context } }` reaches the client as `{ userAction: { name, context } }` with the context paths resolved.
- **The runtime path.** `new CopilotRuntime({ a2ui })` attaches `A2UIMiddleware` to each run. The middleware injects a client tool `render_a2ui { surfaceId, components, data }` and its prompt guidelines, turns that tool's streamed arguments into `ACTIVITY_SNAPSHOT` events (`activityType: "a2ui-surface"`), and converts any tool result that contains `a2ui_operations` into the same activity. `MastraAgent` can instead inject a server tool `generate_a2ui` that runs a second model call to write the surface.
- **The client.** `createCatalog(definitions, renderers)` from `@copilotkit/a2ui-renderer` registers React components under a catalog id. `A2UIProvider` holds the surface store, `A2UIRenderer { surfaceId }` draws a surface, and `useA2UIActions().processMessages` feeds it. No Lit. Prop binding is driven by the zod schema: the binder (`GenericBinder`) reads zod v3 internals, so catalog schemas must be built with `zod/v3`.
- **History.** Mastra memory keeps assistant, user and tool messages only. AG-UI activity messages are not stored, so a reloaded thread loses any surface that existed only as an activity.

## Why mascop does not use the runtime path

- `render_a2ui` carries `data` that the model writes itself, so the model would type every number and name into the card. That breaks the grounding rule.
- `render_a2ui` is a client tool and `generate_a2ui` runs outside the harness, so neither passes the gateway (policy, audit, kill switch). `generate_a2ui` also adds a second model call per card.
- Activities are not in Mastra memory, so history restore would need a second store.

## What mascop does instead

- **`compose_card`** (`lib/server/tools/compose-card.ts`) is a native read tool through the gateway, offered to every role. The model writes the components only. The data model is the turn's read results, keyed by tool name (`/get_person/data/name`, a repeat call is `get_person_2`). The gateway records each read result on the turn (`recordResult` in `lib/server/request-context.ts`).
- **Grounding** (`lib/compose/ground.ts`) checks the composition before anything is drawn: components from the closed catalog (`lib/compose/catalog.ts`), a `Card` root, every `{ path }` resolving to a value a tool returned this turn, and no literal carrying a number, a `คุณ…` name or a picture that no tool returned. Results of `query_metric`, `get_alerts`, `get_forecast` and `explain_gap` are not in the data model, so a metric can never be composed. The data model sent to the client is pruned to the paths the card shows. A refused composition returns `ok: false` with every problem, so the model can fix it.
- **Result.** `{ ok, summary, a2ui_operations }`. The model reads back only `{ ok, summary }` (Mastra `toModelOutput`); the stored tool result keeps the surface, so a reloaded thread draws the same card from Mastra memory with no extra store.
- **Drawing** (`components/chat/composed-card.tsx`). mascop's `components/ui` primitives are the A2UI catalog. Each composed card gets its own `A2UIProvider`. An `ask` action sends the question to the chat; an `enroll_course` action runs the write behind its approval card.
- **Fallback.** Once an exchange holds a composed card, the fixed cards of composable reads in that exchange are not drawn; the metric cards stay. While a reply streams, those fixed cards wait, so none flashes up and then disappears. A refused composition leaves the fixed cards as the answer.
- **Streaming.** The card appears when the grounded result returns, not while the model writes it. Partial surfaces would show content the server has not checked.
