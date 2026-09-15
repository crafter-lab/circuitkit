# Clean React consumer

A standalone Next.js host for the local `circuitkit` tarball. Its only CircuitKit import is `circuitkit/react`. It does not import repository source, call a backend, fetch fonts, or duplicate rendering. The surrounding UI uses system fonts; figure typography comes from the package.

## Install in isolation

The dependency placeholder is `file:../../artifacts/circuitkit-0.1.0.tgz`. From the CircuitKit repository root, after the parent build has produced that artifact:

```sh
ROOT="$PWD"
CONSUMER="$(mktemp -d /tmp/circuitkit-consumer.XXXXXX)"
cp -R examples/react-consumer/. "$CONSUMER/"
cd "$CONSUMER"
TARBALL="$ROOT/artifacts/circuitkit-0.1.0.tgz" bun -e 'const p = await Bun.file("package.json").json(); p.dependencies["circuitkit"] = `file:${process.env.TARBALL}`; await Bun.write("package.json", JSON.stringify(p, null, 2) + "\n")'
bun install
bun run typecheck
bun run build
bun run dev --port 3011
```

Open http://127.0.0.1:3011. Package installation needs registry access or cached dependencies, but figure generation is local. The tarball must exist before installation. No publication, account, or deployment is needed.

## Exercise the adapter

Change R1 from `10000` to `22000`, switch Light / Dark / Print, and select R1, C1, Output net, or None. All updates are immutable host-owned document props. Clear the numeric field or enter `-1`: the old SVG must disappear and the package must show structured errors. Restore a positive value to recover. The typed diagnostics callback also reports errors to the host.

Expand Current host-owned JSON and save that JSON as `figure.json`. Render it through the installed package:

```sh
./node_modules/.bin/circuitkit validate figure.json --json
./node_modules/.bin/circuitkit render figure.json --out figure.svg --json
```

Compare the inline SVG with the exported SVG. They use the same package renderer. The default document matches the package RC example, including output-net focus. Exported files have no dependence on this app's CSS or fonts.

The root adapter tests cover byte equality against the real core renderer. This template still needs installation/build and browser verification against the final tarball; its presence alone is not that verification.
