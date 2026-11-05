# Flux design proposals

Design gate prepared on 5 November 2026, within the session's first hour. These are exactly three design directions. They are original static SVG review drawings, not application components. All figures and metrics displayed in them are illustrative, not simulation results. The implementation waits for the owner's A/B/C or hybrid choice as required by master prompt §7.0.

## Reference study and evidence

- [Traffic by Igor Kozak for 10Clouds](https://dribbble.com/shots/15608015-Traffic): viewed in the in-app browser, including a loaded animation frame. Verified pale grey/white isometric city blocks, soft shadows, warm glowing windows, road markings, zebra crossings, signals and violet vehicles. The scene is spacious, with vehicles carrying most of the saturated color. No research dashboard layout or typeface is established by the artwork. The published palette values supplied by the owner are #282730, #6B6B70, #706F8E, #9D9CA2 and #CDCACF; this session visually confirmed the overall palette, not a new numerical color extraction.
- [Supplied MP4](https://cdn.dribbble.com/userupload/31623398/file/large-a8a453248ae97c0be9527cb48738afe4.mp4): the text browser could not fetch it, but the native browser played it and displayed the 12-second clip's last frame. Verified the same grey isometric streets, violet bus/trucks/forklifts, white road markings and warm building interiors. The observed frames support the neutral-plus-violet direction. No quantitative easing curve or motion speed is inferred.
- [Realistic Traffic Just Got Way Easier with Envision](https://www.youtube.com/watch?v=BqqQUtikqmw): text fetch failed; the browser opened the 1:34 Chaos Enscape video and playback was started muted. The opening frame showed a photorealistic street with varied vehicle colors, buildings/trees and green signals. Only that opening imagery is relied on. A later observation had autoplayed to another video/ad; those unrelated frames are not used as evidence. No claim is made to have verified the full editor workflow or simulation science in the video.

All three references were visually accessible, so no replacement screenshots are currently required. No reference artwork, video, branding or code is bundled into Flux. C adapts the strongest visual cues; A and B translate the traffic subject into deliberately different research workspaces.

## Shared access and scientific clarity

Use native, labeled controls and visible focus rings; every editor action has a keyboard-accessible form alternative. Targets are at least 40 px, preferably 44 px. Meaning never depends on color alone: layer numbers, ramp arrows, G/Y/R signal labels, lane markings, numeric congestion values and a labeled legend accompany color. Typography uses system UI with Inter if locally available, requiring no external font request. Main text must meet WCAG AA contrast; faint road/building decor is not used as essential text. Tablet layouts use a collapsible inspector and stacked metrics. Reduced motion disables camera transitions and decorative easing; physics and numerical time stay unchanged.

All directions use a colorblind-safe viridis congestion ramp for mean-speed / posted-limit ratio: 0 #440154, 0.25 #31688E, 0.5 #21918C, 0.75 #35B779, 1 #FDE725. A segment inspector exposes the number and the term stopped/slow/free. The overlay is optional so violet agents remain legible; queue markers and numeric counts reinforce it. Static drawings show the legend, but do not encode a measured road overlay.

## A — Control Room

[Open static mockup](design/a-control-room.svg).

A dark operations workspace focuses on telemetry and repeatable experiments. It takes the reference's moving-vehicle emphasis and expresses it as luminous agents against a restrained orthographic graph. A persistent left control panel and two chart strips keep demand, seed, queue formation and outcomes visible. It is the densest and most analytical direction, with little decorative city context.

Tokens: background #0C1422; surfaces #141F30 and #172436; primary #95E0D1 with dark text #0B2429; main text #EDF2FA; secondary #A5B4C7; borders #2A3950. Congestion uses the shared ramp. Typeface system UI/Inter, tabular numerals for metrics. Spacing unit 8 px (24 px outer margin); 12 px panels and 8 px controls.

```text
MAIN
+--------------------------------------------------------------------+
| Flux / Traffic Lab      Simulate · Edit · Compare            Export |
+---------------+----------------------------------------------------+
| Preset        | Network canvas: orthographic streets / flyover L1   |
| Demand        | Time, layer toggles, fit and zoom, explicit legend   |
| Duration/seed |                                                    |
| Run/step/reset|                                                    |
+---------------+----------------------------------------------------+
| Controls      | Completed | Travel time | Queued | Mean speed       |
| Model status  | Throughput chart       | Completed trip-time chart  |
+---------------+----------------------------------------------------+

EDITOR
| Left node/road/ramp forms | Canvas + selection | Inline property HUD |
| Keyboard create/connect/delete commands       | Validity feedback   |

COMPARISON
| Shared demand + seed | Baseline and modified metrics in columns    |
| Two aligned chart traces / counts and warning totals / JSON export |

METRICS
| Time range / metric definitions | Large time series + edge table    |
```

Canvas: road body width reflects geometric width, dashed lane dividers show lane count, direction arrows show connectivity, and road IDs appear on selection. Junction circles show reservation state; signal G/Y/R badges are independent of fill. Cars are mint rounded rectangles. Elevated edges have offset shadows and pale outlines plus L1 labels; dashed ramp outlines and endpoint layer tags make connectivity explicit. Pan/zoom remain in plan coordinates.

Interactions: drag background to pan; wheel or labeled +/- to zoom; keyboard Fit, source/road forms, Escape to clear selection. Hover shows a short road summary, click opens editing controls. Playback has explicit run, pause, step and reset states. Charts update at one simulated second, without layout shifts.

Strengths: most screen space for data, easy orthographic hit testing, low rendering cost. Trade-offs: weaker connection to the clay reference, dark canvases less useful for printed reports, dense at tablet widths. Implementation cost: low to medium, approximately 3–5 focused UI hours after approval, excluding full browser/security QA. This is a planning estimate, not a guarantee.

## B — Blueprint Planner

[Open static mockup](design/b-blueprint-planner.svg).

A light technical drafting table prioritizes network construction, spatial legibility and inspectable road parameters. The reference's white road markings become precise lane and dimension notation rather than a city illustration. A narrow left tool rail and persistent right property inspector give planners a familiar editing workflow. Quiet bottom metrics keep the graph central.

Tokens: background #F7F8FA; panels #FFFFFF; primary #255C93; selection fill #E4EEF9; text #253A55; secondary #556273; borders #DBDFE5; agent accent #6554A4. Shared congestion ramp. Typeface system UI/Inter, tabular numerals and short monospaced IDs where useful. Spacing unit 4 px, 20 px outer margin, 6 px canvas/field corners and 10 px panels.

```text
MAIN
+--------------------------------------------------------------------+
| Flux          Edit Network · Simulate · Compare             Export |
+------+----------------------------------------------+--------------+
| Tools| Map-first plan with dimensions and layer key  | Inspector    |
| Node | Road selection / nodes / direction / lanes    | Selected ID  |
| Road |                                              | Lanes/speed  |
| Ramp |                                              | Layer/width  |
| Erase|                                              | Apply/delete |
+------+----------------------------------------------+--------------+
| Active/completed | Queue/pending | Travel time | Chart | Compare     |
+--------------------------------------------------------------------+

EDITOR
| Tool rail | Snap-free plan canvas / endpoint handles | Form editor  |
| Node source/sink role; road from/to; explicit ramp validation         |

COMPARISON
| Baseline plan | Modified plan | Shared seed/demand inspector          |
| Aligned results table and identical time axes; print-friendly cards  |

METRICS
| Full-width road table (lanes, layer, speed, occupancy, queue)          |
| Linked time-series charts; exported JSON preserves scenario + seed   |
```

Canvas: precise road outlines, lane dividers, endpoint handles, dimension annotations and direction arrows. Junction boxes show shared-node topology. Signals use letter badges. Violet cars remain the accent. Elevated roads have double outlines and L1 tags, ground roads single outlines and L0 tags; ramps have transition arrows and distinct endpoint labels. Layer-aware selection avoids accidental connections at visual crossings.

Interactions: click a tool then a location, or use the adjacent keyboard form. Drag nodes only in edit mode; simulation playback locks editing until reset. Hover reveals length and occupancy; selection highlights road geometry and inspector together. Minimal motion, no automatic camera movement; chart updates are subtle.

Strengths: clearest editing and printed comparisons, highest visual precision, economical renderer. Trade-offs: least expressive of depth, dual inspectors consume width, can feel utilitarian. At tablet widths the inspector becomes a dismissible bottom sheet while the tool rail stays accessible. Implementation cost: medium, approximately 4–6 focused UI hours after approval, excluding full QA.

## C — Layered City (recommended)

[Open static mockup](design/c-layered-city.svg).

A soft isometric traffic workspace adapts the reference's muted city and violet vehicles while making grade separation the central visual explanation. Roads and restrained geometric blocks give depth; a compact floating experiment card and a bottom metrics dock keep controls approachable. The entire simulation remains 2D. A reversible isometric camera transform affects only rendering and hit testing. A plan-view switch gives accurate editing when required.

Tokens: background #F1EFF4; panels #FFFFFF; road #D4D0DA; elevated road #B2ACBE; text #282730; secondary #6B6574; primary #6554A4 with white text; vehicles #716393 and light window detail #BDB4CF; borders #E0DCE6. The owner-supplied reference palette informs the neutral tones; the darker button accent provides stronger control contrast. Shared congestion ramp. Typeface system UI/Inter. Spacing unit 8 px, 32–40 px outer margins, 14–16 px panels, 8 px controls and 4 px vehicles.

```text
MAIN
+--------------------------------------------------------------------+
| Flux          Simulate · Network · Experiments              Export |
+--------------------------------------------------------------------+
| Explore the flow.                           Isometric / Plan / Fit |
| +---------------------+                                            |
| | Preset/demand/seed   |      Isometric road network                 |
| | Duration/layers/run |      Flyover deck + pillars + L1 tag         |
| +---------------------+      Ground road + L0 tag                    |
|                                             Congestion legend      |
| +----------------------------------------------------------------+ |
| | Completed | Travel time | Queue | Throughput curve | Compare     | |
| +----------------------------------------------------------------+ |
+--------------------------------------------------------------------+

EDITOR
| Compact toolbar | Plan view by default (optional iso) | Inspector    |
| Explicit source/sink, endpoints, lanes, layer, ramp; topology errors  |

COMPARISON
| Baseline / Modified toggle | Shared demand + seed | Run both         |
| Paired metric cards + aligned charts; active/rejected/warnings shown |

METRICS
| Expandable bottom dock → detailed chart and edge table                |
| Units, definitions and censoring note remain one click away           |
```

Canvas: lane-scaled roads, white lane markings, small rounded violet cars and neutral buildings that are purely decorative and noninteractive. Flyovers get a raised deck, pillar marks, shadow and explicit layer label. Ramp elevation interpolates visually between endpoint layers. Ground and elevated roads share no junction unless an explicit ramp/node connects them. Junction circles, G/Y/R signal badges and arrows remain clear with decor hidden. Cars and roads have a density mode so large populations avoid costly visual details.

Interactions: pan/zoom/fit and plan/isometric toggle preserve selected road and camera center. Hover/selection raise a compact inspector; selected topology has a strong outline. Edit defaults to plan view and exposes an equivalent form for every drag gesture. Playback does not move the camera automatically. Interpolate agent drawing between worker snapshots; reduced motion disables camera easing, shadows can be reduced for performance. Tablet layout collapses the experiment card and stacks the metrics dock.

Strengths: closest to verified references, clearest visual story for flyovers, approachable presentation with a scientific core. Trade-offs: inverse camera transforms and depth sorting add complexity; decorative blocks must never obscure roads; extra detail must be culled at 500+ agents. Implementation cost: medium to high, approximately 5–8 focused UI hours after approval, excluding full QA. Use lightweight Canvas 2D geometry, not a 3D dependency.

## Recommendation and gate

Recommend **C**, with its built-in plan view for editing, because it matches the owner's reference and makes the project's distinctive flyover rule visible. This is one direction with two camera modes, not an extra proposal. A is best for maximum telemetry density; B is best for continuous technical editing.

The owner must choose A, B, C or a stated hybrid and provide any change requests. The 72-hour clock continues while the gate is pending. The decision will be recorded in decisions.md and design.md before application UI implementation. Azure deployment is separately deferred by the owner to 6 November.

## Gate outcome

The owner selected C on 5 November 2026 (“Lets go with C”). The decision was recorded before any app UI file was written. The original three SVG proposals remain unchanged; the implementation and deviations are documented in design.md.
