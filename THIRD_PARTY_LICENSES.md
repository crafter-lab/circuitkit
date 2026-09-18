# Third-party resources

Geist Sans Regular and Geist Mono Regular are pinned from vercel/geist-font commit 10dc7658f13c38a474cde201bb09a4617267545b. Unmodified TTFs and their prepared outlines are distributed under the SIL Open Font License in fonts/OFL.txt. The upstream fonts/LICENSE.txt is also included.

- Geist-Regular.ttf SHA-256: 85a1c6b18a6b0a06dfe9fd4f6d6a5d4979f74ec861eaef4bc7868b5492b8a117
- GeistMono-Regular.ttf SHA-256: 5a0de4b3d54ab272f76a1d8c84b7fb24c67bbec6591d5300e61c7bc10094b6c8

opentype.js (MIT) prepares deterministic glyph paths and metrics during the build. Its code is not bundled into the pure renderer. Zod (MIT) supplies the shared runtime/JSON schema; its license travels with the installed dependency. React is an optional peer, not a core dependency.

The isolated `circuitkit/png` entry uses @resvg/resvg-js 2.6.2 (MPL-2.0) as an external dependency. Its native bindings and license remain with that installed package; CircuitKit does not bundle a platform-specific native binary into dist.

The Markdown entry uses mdast-util-from-markdown 2.0.3 and its CommonMark dependencies. Their upstream licenses remain with the installed packages. The direct parser's MIT notice follows:

(The MIT License)

Copyright (c) Titus Wormer <tituswormer@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The web source editors lazy-load CodeMirror 6 and Lezer (MIT) with their supporting packages. Complete upstream notices, including transitive dependencies, are retained in public/licenses/code-editor.txt and served at /licenses/code-editor.txt. These are web-app development dependencies, not dependencies of the circuitkit rendering package.

CircuitKit source code is licensed under Apache-2.0; see LICENSE and NOTICE. The package is not published to npm yet. The bundled fonts retain their upstream licenses. This project is not an official Vercel product.
