# Sections, highlights and illustrative flow

Available in this local revision of the CircuitKit v1 text language. This is a presentation layer, not electrical simulation or a change to the circuit graph. It does not introduce switch/relay state models, inferred paths through modules, scripts or author-supplied coordinates.

## Try it

Run the web app with `bun run dev`, then open `/editor?mode=circuitkit`. The initial example is [Cueva with presentation](../examples/diagrams/cueva-presentation.ck). Edit the source, choose a scene, pause/replay the sweep, or change its visual speed. The compiler runs locally after a short pause or Cmd/Ctrl+Enter. Errors are clickable source ranges; invalid drafts remove stale preview and disable image exports. Download .ck remains available for invalid drafts. The new editor does not persist drafts automatically. It starts with a fit-width overview so the whole circuit is visible; choose Readable size to inspect labels at full size.

`/editor` still hosts legacy recipes and their shared links; `/editor?case=...` still opens gallery cases. The source mode is separate and accepts .ck text, not arbitrary JSON or legacy recipes. `/markdown` also previews presentations inside inert `circuitkit` fences; choose “Cueva: sections, highlights & flow”. Markdown prose/HTML is not executed. The landing embeds the same viewer and a syntax excerpt.

## Syntax

Append this to a circuit that already declares ESP32, MAX98357 and the I2S bus. It is an excerpt, not a standalone circuit:

```text
presentation {
  section audio {
    module ESP32
    module MAX98357
    bus I2S
  }
  scene sending "Sending audio" {
    highlight section audio
    dim others
    flow bus I2S {
      style sweep
      period 2s
    }
  }
}
```

Only one document-level `presentation` block is allowed. It is not allowed inside `define`. A section is a reusable visual selection, not a new assembly, bus or net. Sections cannot contain other sections. All references, including unused sections, are validated.

A scene needs at least one highlight or flow. Its optional quoted label defaults to its ID. IDs begin with a letter, contain letters/digits/underscore/hyphen, and have at most 48 characters; labels have at most 160 characters. Sections and scenes have separate unique-name namespaces. Unknown statements and duplicate declarations/flow properties fail with source locations.

Selectors:

```text
highlight module MAX98357
highlight port ESP32.GPIO27
highlight bus I2S
highlight section audio
highlight link MAX98357.SPK+ -- Speaker.+
```

`module` selects the module's graphic, not every attached wire. `port` selects a declared terminal. `bus` selects its explicit connections without joining their nets. `link` looks up an existing undirected endpoint pair; it cannot add a connection. `section` is permitted in scene highlights, not within another section or as a flow target. This audio section does not automatically include the speaker or its wires.

`dim others` mutes other non-text strokes. Labels retain their original contrast. Selected strokes use the figure's existing accent palette; positions, glyphs, dimensions and connections are unchanged. Dimming is not hiding, authorization or assessment privacy.

## Direction and time

Flow selects `bus` or `link` only. Each selected connection gets its own sweep; several bus signals do not become one continuous route. Direction defaults to `declared`, which requires the original connection to use `->`.

An undirected `--` or bidirectional `<->` connection needs `direction forward` or `direction reverse` in its flow block. These are relative to the original authored connection's endpoints, not the order of an unordered link selector. Reverse flow on a `->` connection is rejected because it contradicts the declared arrow. The compiler preserves direction separately from its canonical endpoint sorting.

```text
flow bus I2C {
  style sweep
  period 3000ms
  direction forward
}
```

This illustrates an explicitly authored direction; it does not model I2C arbitration, a waveform, simultaneous traffic or actual electrical current. There is no inference of activity from arrows alone. A connection may appear in at most one flow per scene, including overlapping bus/link selections.

Only `style sweep` is accepted. The default period is 3600ms. Explicit periods are whole-number ms or seconds from 500ms to 30s. This is time per illustrative traversal, not signal frequency, current, power or propagation delay. The viewer's 0.5×/1×/2× speed is another visual playback control, never a circuit parameter.

## Hierarchy and views

Use instance paths, such as `module audio/amplifier`, `port audio.input` or `bus audio/I2S`, for nested content. A root bus does not match same-named buses in other scopes. Collisions between scoped names and slash-containing literal bus labels are diagnosed as ambiguous. Public port aliases resolve to their declared terminals.

References are validated against the complete resolved system before drawing. A valid target omitted by the selected scope/detail makes that scene unavailable in that projection, with a reason. The scene selector still lists it; choosing it displays the base diagram and the reason, not a fabricated path. At initial load the viewer selects the first available scene, or the base diagram if none is available.

Per-wire flow is unavailable in blocks view because it aggregates connections. Wiring supports explicit routed connections. Schematic supports flows only where the renderer produces a continuous route; split power/ground rail symbols cannot be animated as a made-up wire. Use wiring for those routes. Opaque modules remain opaque. Highlights without flow can still work in blocks.

Switching scenes within a projection reuses its layout. View/scope changes produce a different projection and reset the viewer's local selection/playback state. State is local to each viewer, not saved back into source. A hidden document pauses playback. Reduced motion or unavailable animation APIs select static direction cues. SSR starts motion-safe.

## Exports, library and CLI

SVG/PNG downloads and CLI render always export the deterministic static base diagram, not the selected scene or a random animation frame. Highlighted-scene export, animated SVG/video export and simulation-backed output are not implemented. Keep the .ck source or Markdown fence to retain presentation; projected flat diagram JSON contains only the circuit. Exporting or copying it alone loses sections/scenes, just as it loses source hierarchy.

`resolveCircuitSource` validates presentation and returns optional resolved `presentation` alongside `program` and `system`. `compileCircuitSource` and `renderCircuitSource` return optional projected `presentation.scenes`, including target identities, oriented route points, visual periods and unavailability reasons. `system.nets` and `semantics.nets` keep their existing meanings. The normal SVG remains byte-identical to the same circuit without a presentation block. `formatCircuitSource` preserves presentation, canonicalizes periods to ms and discards comments.

The playback viewer currently belongs to the bundled web app, not a new exported `circuitkit/react` component. SDK consumers can inspect the plans; they must supply their own viewer. Existing React recipe/lesson APIs remain separate.

```sh
bun run build
node dist/cli.js grammar --json
node dist/cli.js validate examples/diagrams/cueva-presentation.ck --json
node dist/cli.js inspect examples/diagrams/cueva-presentation.ck --json
node dist/cli.js format examples/diagrams/cueva-presentation.ck --out formatted-presentation.ck
node dist/cli.js render examples/diagrams/cueva-presentation.ck --out cueva-base.svg
```

These commands require a build containing this increment, not the earlier qualified tarball or an arbitrary public checkout. No new release, registry publication or deployment is implied.

## Budgets and checks

The existing 64 KiB UTF-8 / 16,384 token source limits still apply. Presentation additionally permits at most 32 sections, 16 scenes, 256 authored selectors, 32 flow declarations and 32 resolved animated connections per scene. Existing drawing and PNG pixel limits remain unchanged.

Focused checks live in `tests/language-presentation.test.ts` and `tests/presentation-ui.test.tsx`. They cover validation, canonical format, unchanged graphs/SVG, hierarchy, direction, budgets, immutable static emphasis, SSR, source mode, Markdown and landing wiring. Real playback, native editing, media preference changes, responsive layout and browser export require the separate browser receipt, not only these tests.
