# Design decisions

FFS models reusable Figma Design foundations as an explicitly connected set of resources. The [specification](../spec/0.1.0.md) defines the contract; this document explains the architectural choices.

## Stable identity, editable organization

Resource IDs are independent of display names and organizational groups. Renaming a color or moving a style to another group therefore preserves its references. Groups help people navigate; they do not implicitly change types, values, or mode selection.

## Distinct foundation resources

Collections, variables, styles, reusable values, property presets, themes, and assets have distinct roles. A reusable effect stack can be a value without pretending to be a native variable. Likewise, text-node settings can be a preset without implying that Figma stores them in a native Text Style.

Sources: [Figma variables](https://developers.figma.com/docs/plugins/api/Variable/), [Text Styles](https://developers.figma.com/docs/plugins/api/TextStyle/), and [text nodes](https://developers.figma.com/docs/plugins/api/TextNode/).

## Explicit collection contexts

A theme selects modes by collection and mode identity. Matching display names do not connect otherwise independent collections. This makes relationships across collections explicit and allows their combinations to be validated consistently.

Sources: [variable collections](https://developers.figma.com/docs/plugins/api/VariableCollection/) and [extended collections](https://developers.figma.com/docs/plugins/api/ExtendedVariableCollection/).

## References and native bindings

A reference reuses a definition; a binding preserves a native variable relationship on a property. Keeping these distinct lets consumers compute a concrete value while retaining how it was authored. Flattened values alone cannot preserve that distinction.

Source: [working with variables](https://developers.figma.com/docs/plugins/working-with-variables/).

## Structured visual definitions and asset dependencies

Paint and effect definitions retain ordered entries, geometry, parameters, and dependencies. An image reference, pattern source, or shader provider ID identifies a dependency; it does not prove that the underlying content is bundled or independently reproducible.

Sources: [paints](https://developers.figma.com/docs/plugins/api/Paint/) and [effects](https://developers.figma.com/docs/plugins/api/Effect/).

## Reusable motion and separate document structure

Foundations includes reusable animation styles, timing, and easing. Node-specific tracks, component structure, and document interactions require a separate consuming document model.

Sources: [custom animation styles](https://developers.figma.com/docs/plugins/api/CustomAnimationStyle/) and [Motion](https://developers.figma.com/docs/plugins/api/Motion/).

## Versioned API mappings

The public Plugin and REST APIs expose different representations and fields. FFS documents its mappings against a fixed baseline rather than silently treating those surfaces as identical. New field contracts require an explicit format release.

See the [coverage ledger](coverage.md), [baseline inventory](figma-baseline.json), and [field reference](fields.md). Source: [REST property definitions](https://developers.figma.com/docs/rest-api/file-property-types/).

## Relationship to other formats

FFS defines its own resource model and evaluation rules. DTCG compatibility is not required. Typed values, references, and contextual resolution are established concepts; their presence alone does not distinguish FFS. Its focus is representing Figma foundation resources, native bindings, collection contexts, and asset relationships explicitly.

Related specifications: [DTCG Format](https://www.designtokens.org/tr/2025.10/format/) and [DTCG Resolver](https://www.designtokens.org/tr/2025.10/resolver/).
