# Flux design

The owner selected **C — Layered City** on 5 November 2026 with “Lets go with C”, after the three proposals and before application UI code. The SVG files in design/ preserve the approved review direction.

Use a soft isometric canvas, neutral city blocks and roads, violet vehicles, explicit elevation labels and a plan-view editor. A floating experiment card sits left; a compact view HUD sits right; the metrics dock spans the bottom. Simulate, Network and Experiments are top-level modes. The engine remains 2D and independent of the camera.

Tokens are centralized in src/styles.css: background #F1EFF4, panel #FFFFFF, road #D4D0DA, elevated road #B2ACBE, primary/text #282730, secondary #6B6574, action #6554A4 with white text, vehicles #716393, borders #E0DCE6. System UI typeface; tabular metric numerals; 8 px spacing basis; 14–16 px panels, 8 px controls. Viridis speed-ratio overlay uses #440154, #31688E, #21918C, #35B779, #FDE725, always with numeric labels.

Canvas camera: plan identity or isometric `(x,y,z) → (0.82(x-y), 0.42(x+y)-z*28)` before fit/zoom/pan. Editing defaults to plan view. Every geometry gesture has a form equivalent. The renderer interpolates snapshots without changing engine state, obeys reduced-motion settings and uses device-pixel-ratio bounds. Decorative geometry is original and can be hidden. Elevation is also labeled numerically; signals use G/Y/R.

Laptop: floating configuration/editor panel plus canvas and bottom dock. Tablet: collapsible panel and stacked metrics, with keyboard-accessible native controls, 40–44 px targets, visible focus and explicit error/status feedback. Drawn map gestures do not replace accessible forms and road lists.

Recorded implementation choices: use plain CSS design tokens and custom SVG charts rather than Tailwind/charting dependencies. This preserves the approved tokens and layout while reducing the dependency surface. The live scene uses real worker snapshots; no illustrative proposal metric or vehicle is substituted for simulation data.

Verified implementation: scenario controls, responsive floating panels, pan/zoom/fit, layer/decor/congestion controls, source/sink and signal editor forms, coordinate/drag node placement, road/ramp construction, 20-change undo, local saves, JSON import/export, expandable metrics and paired experiment results. Numeric chart scales are shared across each paired metric. The live screenshot in screenshots/flux-layered-city.png is captured from the built app at 60 simulated seconds, not from the static proposal.

Responsive adjustment: the control card scrolls on shorter laptops and collapses behind Show controls on tablet/phone widths. This keeps the primary canvas and metrics dock available; every action remains accessible through forms.
