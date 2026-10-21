# Figma foundation coverage baseline

Reviewed 2026-10-20. This ledger defines the scope of version 0.1.0. It is documentation, not a per-resource capability-status system, and does not encode subscription-plan restrictions.

The native data source is the pinned public `@figma/plugin-typings` 1.142.0 package. [figma-baseline.json](figma-baseline.json) records the exact input SHA-256 and the participating native records. [fields.md](fields.md) enumerates the resulting FFS fields and nested alternatives. The normative [specification](../spec/0.1.0.md) explains normalization and resolution.

## Coverage by source surface

| Figma surface | FFS representation and field mapping |
| --- | --- |
| Variable | `variable`; native resolved type becomes `dataType`; owning collection becomes an address; `valuesByMode` becomes `values`; aliases become `ref`; scopes/code syntax remain explicit |
| Variable composed color | `color` expression with base/alpha aliases, explicit alpha unit and replace/multiply operation |
| VariableCollection | `collection`; native modes map to immutable mode IDs, default mode remains explicit, optional mode/variable ordering arrays preserve available ordering |
| ExtendedVariableCollection | `extends`, immediate-parent `modeMap`, inherited variable identities, sparse override-record array; root identity is derived from the parent chain |
| BaseStyle/Publishable | Name/descriptions/Markdown/documentation links in common fields; object IDs, library keys, remote state, publish state in source links |
| PaintStyle | `style.family: paint`; native `paints` array becomes the expression's resolved `paintStack` directly |
| SolidPaint | Type, canonical color, opacity, visibility, blend mode; explicit `bind` preserves a color-variable binding |
| GradientPaint/ColorStop | All four gradient kinds; source geometry variant, stops, positions, colors, stable item IDs, per-stop color bindings, opacity/visibility/blending |
| ImagePaint/VideoPaint | Scale mode, source transforms, scaling factor, rotation, filters, opacity/visibility/blending; native content hashes become asset addresses |
| PatternPaint | Source artwork asset, tile type, scaling, spacing, horizontal alignment; supplemental REST vertical alignment |
| ShaderPaint | Shader asset, property-definition IDs, typed assignments and metadata; not a fake bundled shader implementation |
| EffectStyle | `style.family: effect`; native effect array becomes `effectStack` |
| DropShadowEffect/InnerShadowEffect | Type, color/alpha, offsets, radius/spread, blend/visibility, drop-shadow background behavior, eligible variable bindings |
| BlurEffectNormal/Progressive | Layer/background kinds, uniform/progressive discrimination, start/end geometry and radii, visibility, radius binding |
| NoiseEffect variants | Monotone/duotone/multitone distinction, colors, secondary color or opacity where appropriate, size/vector, density, blending, visibility |
| TextureEffect/GlassEffect | All declared data parameters, including optional size vector and the glass lighting/refraction/depth/dispersion/radius fields |
| ShaderEffect | Same typed shader dependency/property machinery, with effect visibility |
| TextStyle | Complete native style payload, including font/variation settings, size, letter spacing, automatic/measured line height, trim, paragraph/list spacing and hanging behavior, case, decoration, wrapping |
| TextNode/range formatting | Partial `text.properties` preset for typography, detailed decoration, sparse OpenType flags, alignment, resize/truncation, lists/indentation; mixed editor selection markers are not authored values |
| FontName | Named style and variable-font axes; optional font asset and preserved source identity |
| GridStyle/LayoutGrid | `style.family: grid`; uniform/row/column variants, counts/automatic count, section size, gutters, offset/alignment, guide color/visibility and eligible bindings |
| Minimal/individual/complex stroke mixins | Partial stroke preset; paint stack, alignment/weights, joins/caps/miter, dash pattern, variable-width profiles and points, dynamic and stretch/scatter brush parameter variants |
| Corner mixins | Partial corner preset, including independent radii and smoothing |
| Auto-layout/grid mixins | Partial layout preset with native direction/wrapping/alignment/sizing/padding/spacing fields, grid tracks/gaps/placement, child spans/anchors/alignment, min/max dimensions |
| Motion easing/physical spring | Named easing, custom Bezier, normalized spring, HOLD; physical spring retains separate physical parameters |
| CustomAnimationStyle | `style.family: motion`; animation entries, provider identities/assets, props and timing configuration |
| Figma/custom animation configuration | `motion.properties` preset |
| VectorNetwork | Bounded `vectorArtwork`, with vertices, segments, region loops/fills, and typed paint-style dependencies; not a full scene document |
| Native IDs, library keys, history version IDs | Provenance/source mappings, separate from authored FFS identities |

## REST supplements

The [official REST property definitions](https://developers.figma.com/docs/rest-api/file-property-types/) differ from the Plugin API. Version 0.1.0 deliberately preserves these distinctions:

- Gradient handle positions as an alternative to a transform, never two authoritative geometries in one paint.
- Image STRETCH placement and a separately addressed animated GIF payload.
- Pattern vertical alignment.
- Intrinsic-relative percentage line height and PostScript font identity in text presets.
- An explicit FFS emoji paint carrying a rendering asset and optional original emoji text. The REST API lists the paint kind without a complete Plugin API counterpart; FFS does not claim the invented existence of such a counterpart.

The supplemental REST document is cited by URL and review date. It is not silently mixed into the pinned TypeScript input. Updating either surface requires reviewing this ledger and releasing any changed format contract explicitly.

## Boundaries and verification

The catalog demonstrates the payload families, six color spaces, all Plugin API paint/effect discriminants, supplemental REST variants, collection inheritance, and reusable motion. Static invalid fixtures exercise failure behavior. Behavioral tests additionally check dependency-local references, source fragments, integrity, mode interactions, pointer selection, and binding preservation.

The validator does not render these definitions or execute a Figma plugin. In particular, it does not establish live parity for beta effects, shader-provider resources, custom brush artwork, or font-specific capabilities. Source API methods and editor-only mixed-state markers are intentionally excluded. Component trees, document relationships, interactions, and per-node animation tracks belong in a component/document format.

The coverage claim is that these foundation data contracts are explicitly represented and validated against this baseline. It is not a claim that every Figma product feature has been modeled, that every provider resource is obtainable, or that every payload can be applied on every subscription plan.
