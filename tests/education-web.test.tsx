import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { GET, POST } from "../app/api/education/route.ts";
import AuthorWorkspacePage from "../app/editor/education/author/page.tsx";
import EducationEditorPage from "../app/editor/education/page.tsx";
import { exportPublicPNG } from "../app/education/browser-export.ts";
import {
  adapterFamilies,
  defaultSelection,
  examples,
  families,
  parseSelection,
  selectionQuery,
  stages,
  themes,
} from "../app/education/catalog.ts";
import { authorExample, publicAdapterExamples, publicExample } from "../app/education/examples.ts";
import { FigureViewport } from "../app/education/FigureViewport.tsx";
import { GalleryFigure } from "../app/education/gallery-figure.tsx";
import { HostContent } from "../app/education/host-content.tsx";
import { NetManifest } from "../app/education/net-manifest.tsx";
import EducationPage from "../app/education/page.tsx";
import {
  maxUploadBytes,
  parsePublicDraft,
  publicExport,
  retainSelection,
} from "../app/education/public-state.ts";
import {
  figureViewportLayout,
  measureFigureViewport,
  minimumFigureFontSize,
  revealViewportAxis,
  viewportPanDelta,
} from "../app/education/viewport-layout.ts";
import { EducationWorkbench } from "../app/education/workbench.tsx";
import LocalCorpusPage, { localComparisonURL } from "../app/gallery/education/local/page.tsx";
import EducationGalleryPage from "../app/gallery/education/page.tsx";
import { projectFigure } from "../src/v2/index.ts";
import { inspectElectricalNets, netTargetId } from "../src/v2/nets.ts";
import { EducationalFigure } from "../src/v2/react.tsx";
import { renderEducationalSVG } from "../src/v2/render.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const request = (
  body: unknown,
  headers: Record<string, string> = {},
  url = "http://localhost/api/education",
) =>
  new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const question = () => publicExample(defaultSelection);

function publicOnly(value: unknown) {
  const text = JSON.stringify(value);
  expect(text).not.toContain("circuitkit.educational.author.v2");
  for (const forbidden of [
    '"stages":',
    '"panels":',
    '"terminals":',
    '"potential":',
    '"assumptions":',
    '"solution":',
  ])
    expect(text).not.toContain(forbidden);
}

describe("public education catalog and rendering", () => {
  test("covers all 12 panel kinds, 17 public cases and 18 generic adapter families", () => {
    expect(families).toHaveLength(12);
    expect(examples).toHaveLength(17);
    expect(new Set(examples.map((entry) => entry.family))).toEqual(new Set(families));
    expect(adapterFamilies).toHaveLength(18);
    for (const stage of stages)
      for (const theme of themes) {
        for (const entry of examples) {
          const document = publicExample({ case: entry.id, stage, theme });
          publicOnly(document);
          expect(document.theme).toBe(theme);
          expect(renderEducationalSVG(document).ok).toBe(true);
          expect(document.targets.length).toBeGreaterThan(0);
        }
        const adapters = publicAdapterExamples(stage, theme);
        expect(adapters.map((entry) => entry.family)).toEqual([...adapterFamilies]);
        for (const projection of adapters) {
          publicOnly(projection);
          expect(projection.host).not.toHaveProperty("additions");
          if (projection.document) expect(renderEducationalSVG(projection.document).ok).toBe(true);
          else expect(projection.host.kind).toBe("record");
          expect(renderToStaticMarkup(<HostContent host={projection.host} />)).not.toContain(
            "<script",
          );
        }
      }
  });
  test("stage templates are independent even when the upstream fixture shares object references", () => {
    for (const id of ["timeline", "levels", "scale"] as const) {
      const author = authorExample(id, "geist-light");
      expect(author.stages.question).not.toBe(author.stages.teaching);
      expect(author.stages.question.panels).not.toBe(author.stages.correction.panels);
      const q = author.stages.question.panels[0];
      const c = author.stages.correction.panels[0];
      if (q?.kind === "timeline" && c?.kind === "timeline") {
        expect(q.showElapsed).toBe(false);
        expect(c.showElapsed).toBe(true);
      }
      if (q?.kind === "levels" && c?.kind === "levels") {
        expect(q.showClassification).toBe(false);
        expect(c.showClassification).toBe(true);
      }
      if (q?.kind === "scale" && c?.kind === "scale") {
        expect(q.showConverted).toBe(false);
        expect(c.showConverted).toBe(true);
      }
    }
  });
  test("strict selectors keep legacy and v2 case namespaces separate", () => {
    expect(parseSelection({})).toEqual(defaultSelection);
    expect(parseSelection({ case: "rc-lowpass/audio-low/geist-dark" })).toBeNull();
    expect(parseSelection({ case: ["measurement"] })).toBeNull();
    expect(parseSelection({ stage: "solution" })).toBeNull();
    expect(parseSelection({ theme: "dark" })).toBeNull();
    expect(selectionQuery(defaultSelection)).toBe(
      "case=measurement&stage=question&theme=geist-light",
    );
  });
  test("question is a projection, not CSS-hidden correction data", () => {
    const q = question();
    const c = publicExample({ ...defaultSelection, stage: "correction" });
    const qs = publicExport(q, "svg");
    const cs = publicExport(c, "svg");
    expect(qs?.text).toContain("? V");
    expect(qs?.text).not.toContain("-12 V");
    expect(cs?.text).toContain("-12 V");
    expect(q.display.some((part) => part.id.startsWith("explanation/"))).toBe(false);
  });
});

describe("explicit whole-net showcase", () => {
  const supply = netTargetId("circuit", "supply");
  const expectedMembers = {
    supply: ["circuit/route/top", "circuit/terminal/ra", "circuit/terminal/vp"],
    midpoint: ["circuit/route/middle", "circuit/terminal/rb", "circuit/terminal/rc"],
    return: ["circuit/route/bottom", "circuit/terminal/rd", "circuit/terminal/vn"],
  };
  test("uses actual divider anchors and emits only explicit public net groups", () => {
    for (const theme of themes) {
      const author = authorExample("named-nets", theme);
      expect(author.id).toBe("named-nets-demo");
      for (const stage of ["teaching", "correction"] as const) {
        const panel = author.stages[stage].panels.find((panel) => panel.kind === "electrical");
        if (panel?.kind !== "electrical") throw new Error("Expected divider panel");
        expect(panel.namedNets).toEqual([
          { id: "supply", terminal: "vp" },
          { id: "midpoint", terminal: "rb" },
          { id: "return", terminal: "vn" },
        ]);
        for (const net of panel.namedNets ?? [])
          expect(panel.terminals.some((terminal) => terminal.id === net.terminal)).toBe(true);
        expect(inspectElectricalNets(panel).ok).toBe(true);
        const document = publicExample({ case: "named-nets", stage, theme });
        publicOnly(document);
        expect(document.schema).toBe("circuitkit.educational.public.v2");
        expect(document.targets.filter((target) => target.role === "net")).toHaveLength(3);
        for (const [name, members] of Object.entries(expectedMembers)) {
          const target = document.targets.find(
            (target) => target.id === netTargetId("circuit", name),
          );
          expect(target).toMatchObject({ role: "net", kind: "group", members });
          expect(target).not.toHaveProperty("anchor");
          expect(target).not.toHaveProperty("terminals");
          for (const member of members)
            expect(document.display.some((part) => part.id === member)).toBe(true);
        }
        expect(JSON.parse(publicExport(document, "json")?.text ?? "null")).toEqual(document);
      }
      const symbols = authorExample("electrical", theme).stages.teaching.panels[0];
      if (symbols?.kind !== "electrical") throw new Error("Expected symbol panel");
      expect(symbols.terminals.some((terminal) => terminal.id === "vp")).toBe(false);
      expect(symbols.namedNets).toBeUndefined();
    }
  });
  test("question author and API carry no net hints despite changing unselected declarations", async () => {
    for (const theme of themes) {
      const author = authorExample("named-nets", theme);
      const q = publicExample({ case: "named-nets", stage: "question", theme });
      for (const panel of author.stages.question.panels)
        if (panel.kind === "electrical") expect(panel.namedNets).toBeUndefined();
      expect(author.stages.question.expose.some((target) => target.role === "net")).toBe(false);
      expect(q.targets.some((target) => target.role === "net")).toBe(false);
      expect(JSON.stringify(q)).not.toContain('"members":');
      expect(JSON.stringify(q)).not.toContain("circuit/net/");
      expect(renderToStaticMarkup(<NetManifest document={q} />)).toBe("");
      const get = await GET(
        new Request(`http://localhost/api/education?case=named-nets&stage=question&theme=${theme}`),
      );
      expect(get.status).toBe(200);
      expect(await get.json()).toEqual({ document: q });
      for (const stage of ["teaching", "correction"] as const) {
        const panel = author.stages[stage].panels.find((panel) => panel.kind === "electrical");
        if (panel?.kind !== "electrical") throw new Error("Expected divider panel");
        panel.namedNets = [{ id: "private-canary", terminal: "absent" }];
        author.stages[stage].expose = [
          { id: netTargetId(panel.id, "private-canary"), role: "net", label: "private-canary" },
        ];
      }
      const projected = projectFigure(author, "question");
      expect(projected.ok).toBe(true);
      if (projected.ok) expect(projected.document).toEqual(q);
      const posted = await POST(request({ author, stage: "question", theme }));
      expect(posted.status).toBe(200);
      expect(await posted.json()).toEqual({ document: q });
    }
  });
  test("whole-net selection uses core member overlays and remains outside exported document state", () => {
    const document = publicExample({ case: "named-nets", stage: "teaching", theme: "geist-light" });
    const before = JSON.stringify(document);
    const output = publicExport(document, "svg");
    const html = renderToStaticMarkup(
      <EducationalFigure
        document={document}
        selectedTargets={[supply]}
        onSelectionChange={() => {}}
      />,
    );
    expect(html).toMatch(
      /<g\b[^>]*data-target="circuit\/net\/supply"[^>]*data-kind="group"[^>]*aria-pressed="true"/,
    );
    for (const member of expectedMembers.supply) expect(html).toContain(`data-member="${member}"`);
    expect(html.match(/role="button"/g)).toHaveLength(document.targets.length);
    expect(JSON.stringify(document)).toBe(before);
    expect(publicExport(document, "svg")).toEqual(output);
    const gallery = renderToStaticMarkup(<GalleryFigure document={document} />);
    expect(gallery).toContain("Public net targets (3)");
    expect(gallery).toContain("kind group");
    expect(gallery).toContain("can reveal connectivity answers");
    expect(gallery).toContain("circuit/route/top");
  });
  test("stage changes retain approved net identity, then drop it on question without resurrection", () => {
    const t = publicExample({ case: "named-nets", stage: "teaching", theme: "geist-light" });
    const c = publicExample({ case: "named-nets", stage: "correction", theme: "geist-light" });
    const q = publicExample({ case: "named-nets", stage: "question", theme: "geist-light" });
    const selected = ["circuit/terminal/ra", supply];
    expect(retainSelection(t, c, selected)).toEqual(selected);
    const questionSelection = retainSelection(c, q, selected);
    expect(questionSelection).toEqual(["circuit/terminal/ra"]);
    expect(retainSelection(q, c, questionSelection)).toEqual(questionSelection);
    const html = renderToStaticMarkup(
      <EducationWorkbench
        initialDocument={q}
        initialSelection={{ case: "named-nets", stage: "question", theme: "geist-light" }}
        editor
      />,
    );
    expect(html).toContain("Question intentionally exposes no whole-net targets");
    expect(html).toContain("not an assessment privacy feature");
    expect(html).toContain("Try whole-net targets");
    expect(html).not.toContain("circuit/net/");
  });
});

describe("selected-stage API", () => {
  test("GET returns one public document and no author or stage map", async () => {
    const response = await GET(
      new Request(`http://localhost/api/education?${selectionQuery(defaultSelection)}`),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const payload = await response.json();
    expect(Object.keys(payload)).toEqual(["document"]);
    expect(payload.document).toEqual(question());
    publicOnly(payload);
    expect(JSON.stringify(payload)).not.toContain("-12 V");
  });
  test("unknown, duplicate, array-like and author requests fail without echoing input", async () => {
    for (const query of [
      "case=not-secret",
      "stage=solution",
      "theme=blue",
      "case=measurement&case=board",
      "author=true",
      "stage[]=question",
    ]) {
      const response = await GET(new Request(`http://localhost/api/education?${query}`));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Invalid or unsupported educational figure.",
      });
    }
  });
  test("intentional author upload returns only chosen projection with theme", async () => {
    const author = authorExample("measurement", "geist-light");
    const before = JSON.stringify(author);
    const response = await POST(request({ author, stage: "question", theme: "geist-print" }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    publicOnly(payload);
    expect(payload.document.theme).toBe("geist-print");
    expect(JSON.stringify(payload)).not.toContain("-12 V");
    expect(JSON.stringify(author)).toBe(before);
    const changed = structuredClone(author);
    changed.stages.correction.description = "unselected-private-canary";
    const other = await POST(request({ author: changed, stage: "question", theme: "geist-print" }));
    expect(await other.json()).toEqual(payload);
  });
  test("malformed nonselected stages leave the question response byte-identical", async () => {
    const author = authorExample("measurement", "geist-light");
    for (const theme of themes) {
      const baseline = await POST(request({ author, stage: "question", theme }));
      expect(baseline.status).toBe(200);
      const expected = await baseline.text();
      for (const malformed of [
        null,
        false,
        17,
        "private-canary",
        [],
        { panels: "invalid-private-canary" },
        { ...author.stages.correction, theme: "unsupported" },
      ]) {
        for (const replacement of [
          { correction: malformed },
          { teaching: malformed },
          { teaching: malformed, correction: malformed },
        ]) {
          const changed = { ...author, stages: { ...author.stages, ...replacement } };
          const response = await POST(request({ author: changed, stage: "question", theme }));
          expect(response.status).toBe(200);
          expect(response.headers.get("cache-control")).toBe("no-store");
          expect(await response.text()).toBe(expected);
        }
      }
    }
  });
  test("selected-stage and strict outer-envelope failures remain fixed errors", async () => {
    const author = authorExample("measurement", "geist-light");
    for (const invalid of [
      { ...author, unexpected: "private-canary" },
      { ...author, stages: { ...author.stages, unexpected: null } },
      { ...author, stages: { ...author.stages, question: null } },
      {
        ...author,
        stages: { ...author.stages, question: { ...author.stages.question, panels: "invalid" } },
      },
    ]) {
      const response = await POST(
        request({ author: invalid, stage: "question", theme: "geist-light" }),
      );
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({
        error: "Invalid or unsupported educational figure.",
      });
    }
  });
  test("empty selected stages return valid public JSON despite malformed correction", async () => {
    const author = authorExample("measurement", "geist-light");
    const empty = { ...author.stages.question, panels: [], expose: [] };
    const response = await POST(
      request({
        author: { ...author, stages: { ...author.stages, question: empty, correction: null } },
        stage: "question",
        theme: "geist-print",
      }),
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    publicOnly(payload);
    expect(payload.document).toMatchObject({ theme: "geist-print", display: [], targets: [] });
    expect(publicExport(payload.document, "svg")).toEqual({
      text: "",
      bounds: { x: 0, y: 0, width: 0, height: 0 },
    });
    expect(JSON.parse(publicExport(payload.document, "json")?.text ?? "null")).toEqual(
      payload.document,
    );
  });
  test("invalid drafts, cross-origin posts and media types fail closed", async () => {
    for (const author of [
      null,
      question(),
      { schema: "circuitkit.educational.author.v2", secret: "no-echo-canary" },
    ]) {
      const response = await POST(request({ author, stage: "question", theme: "geist-light" }));
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({
        error: "Invalid or unsupported educational figure.",
      });
    }
    const body = {
      author: authorExample("board", "geist-light"),
      stage: "question",
      theme: "geist-light",
    };
    expect((await POST(request(body, { origin: "https://elsewhere.invalid" }))).status).toBe(403);
    expect((await POST(request(body, { "Content-Type": "text/plain" }))).status).toBe(415);
    expect((await POST(request({ ...body, store: true }))).status).toBe(400);
    expect((await POST(request({ ...body, stage: null }))).status).toBe(400);
  });
  test("bounded author uploads reject oversized declared and streamed bodies", async () => {
    expect((await POST(request({}, { "Content-Length": String(maxUploadBytes + 1) }))).status).toBe(
      413,
    );
    const oversized = new Request("http://localhost/api/education", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(" ".repeat(maxUploadBytes + 1)));
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit);
    expect((await POST(oversized)).status).toBe(413);
  });
});

describe("author request origin boundary", () => {
  const upload = () => ({
    author: authorExample("measurement", "geist-light"),
    stage: "question",
    theme: "geist-light",
  });
  const fixedError = async (response: Response, status = 403) => {
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.json()).toEqual({ error: "Invalid or unsupported educational figure." });
  };
  test("actual Host handles Next's rewritten URL and canonical HTTP(S) origins", async () => {
    const cases = [
      {
        url: "http://localhost:3228/api/education",
        host: "127.0.0.1:3228",
        origin: "http://127.0.0.1:3228",
      },
      {
        url: "http://localhost:3000/api/education",
        host: "127.0.0.1:3228",
        origin: "http://127.0.0.1:3228",
      },
      {
        url: "http://127.0.0.1:3228/api/education",
        host: "localhost:3228",
        origin: "http://localhost:3228",
      },
      {
        url: "http://internal.test:3000/api/education",
        host: "localhost:4444",
        origin: "http://localhost:4444",
      },
      {
        url: "http://internal.test:3000/api/education",
        host: "LOCALHOST:80",
        origin: "HTTP://localhost",
      },
      {
        url: "http://internal.test:3000/api/education",
        host: "localhost:03228",
        origin: "http://localhost:3228",
      },
      {
        url: "https://internal.test:3000/api/education",
        host: "EXAMPLE.test:443",
        origin: "https://example.test",
      },
      {
        url: "https://internal.test:3000/api/education",
        host: "127.0.0.1:443",
        origin: "https://127.0.0.1",
      },
      {
        url: "http://localhost:3228/api/education",
        host: "[::1]:3228",
        origin: "http://[0:0:0:0:0:0:0:1]:3228",
      },
      {
        url: "http://localhost:3228/api/education",
        host: "[0:0:0:0:0:0:0:1]:3228",
        origin: "http://[::1]:3228",
      },
      {
        url: "https://internal.test:3000/api/education",
        host: "[2001:db8::1]:9443",
        origin: "https://[2001:DB8:0:0:0:0:0:1]:9443",
      },
    ];
    const expected = { document: question() };
    for (const { url, host, origin } of cases) {
      const response = await POST(request(upload(), { host, origin }, url));
      expect(response.status, `${host} / ${origin}`).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const payload = await response.json();
      expect(payload).toEqual(expected);
      publicOnly(payload);
    }
  });
  test("ports, schemes, localhost/IP aliases and suffixes are distinct origins", async () => {
    for (const { host, origin, url } of [
      {
        host: "127.0.0.1:3228",
        origin: "http://localhost:3228",
        url: "http://localhost:3228/api/education",
      },
      {
        host: "localhost:3228",
        origin: "http://127.0.0.1:3228",
        url: "http://127.0.0.1:3228/api/education",
      },
      {
        host: "127.0.0.1:3228",
        origin: "http://127.0.0.1:3229",
        url: "http://localhost:3228/api/education",
      },
      {
        host: "127.0.0.1:3229",
        origin: "http://127.0.0.1:3228",
        url: "http://localhost:3228/api/education",
      },
      {
        host: "127.0.0.1:3228",
        origin: "https://127.0.0.1:3228",
        url: "http://localhost:3228/api/education",
      },
      {
        host: "127.0.0.1:3228",
        origin: "http://127.0.0.1.attacker.test:3228",
        url: "http://localhost:3228/api/education",
      },
      {
        host: "localhost:3228",
        origin: "http://localhost.attacker.test:3228",
        url: "http://localhost:3228/api/education",
      },
      {
        host: "[::1]:3228",
        origin: "http://[::1]:3229",
        url: "http://localhost:3228/api/education",
      },
      {
        host: "[::1]:3228",
        origin: "http://[::2]:3228",
        url: "http://localhost:3228/api/education",
      },
      {
        host: "example.test:443",
        origin: "https://example.test:444",
        url: "https://localhost:3228/api/education",
      },
    ])
      await fixedError(await POST(request(upload(), { host, origin }, url)));
  });
  test("only an absent Host falls back to the request URL", async () => {
    for (const url of [
      "http://127.0.0.1:3228/api/education",
      "http://localhost:3229/api/education",
      "https://localhost:443/api/education",
      "http://[::1]:3228/api/education",
    ]) {
      const response = await POST(request(upload(), { origin: new URL(url).origin }, url));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ document: question() });
    }
    await fixedError(await POST(request(upload(), { host: "", origin: "http://localhost" })));
    await fixedError(await POST(request(upload(), { origin: "http://localhost:3228" })));
  });
  test("null, malformed, credential-bearing and path-bearing Origin values fail closed", async () => {
    for (const origin of [
      "null",
      "",
      "*",
      "127.0.0.1:3228",
      "//127.0.0.1:3228",
      "ftp://127.0.0.1:3228",
      "http://127.0.0.1:3228/",
      "http://127.0.0.1:3228/api/education",
      "http://127.0.0.1:3228/..",
      "http://127.0.0.1:3228?x",
      "http://127.0.0.1:3228#x",
      "http://user:secret@127.0.0.1:3228",
      "http://@127.0.0.1:3228",
      "http://127.0.0.1:3228\\evil",
      "http://127.0.0.1:3228 http://other.test",
      "http://127.0.0.1:3228,http://other.test",
      "http://127.0.0.1:3228, http://127.0.0.1:3228",
      "http://%31%32%37.0.0.1:3228",
      "http://127.0.0.1:",
      "http://127.0.0.1:65536",
      "http://127.0.0.1:+3228",
      "http://127.0.0.1:3e3",
      "http://127.0.\t0.1:3228",
      "http://local host:3228",
      "http://[::1",
      "http://[::1%25lo0]:3228",
      "http://[127.0.0.1]:3228",
    ])
      await fixedError(
        await POST(
          request(
            upload(),
            { host: "127.0.0.1:3228", origin },
            "http://localhost:3228/api/education",
          ),
        ),
      );
  });
  test("invalid or multiple Host values never fall back or grant no-Origin access", async () => {
    for (const host of [
      "",
      "localhost:3228, 127.0.0.1:3228",
      "localhost:3228 localhost:3228",
      "http://localhost:3228",
      "localhost:3228/path",
      "localhost:3228?x",
      "localhost:3228#x",
      "user:secret@localhost:3228",
      "@localhost:3228",
      "*.localhost:3228",
      "localhost\\path",
      "local_host:3228",
      "localhost:",
      "localhost:+3228",
      "localhost:65536",
      "localhost:000080",
      "[::1",
      "::1:3228",
      "[127.0.0.1]:3228",
      "[::1%25lo0]:3228",
      "[:::]:3228",
      ".localhost",
      "local..host",
      "-localhost",
      "localhost-",
      `${"a".repeat(64)}.test`,
      "localhost;evil",
      "%6cocalhost:3228",
    ]) {
      await fixedError(
        await POST(
          request(
            upload(),
            { host, origin: "http://localhost:3228" },
            "http://localhost:3228/api/education",
          ),
        ),
      );
      await fixedError(
        await POST(request(upload(), { host }, "http://localhost:3228/api/education")),
      );
    }
    for (const key of ["host", "origin"]) {
      const headers = new Headers({
        host: "localhost:3228",
        origin: "http://localhost:3228",
        "Content-Type": "application/json",
      });
      headers.append(key, key === "host" ? "localhost:3228" : "http://localhost:3228");
      await fixedError(
        await POST(
          new Request("http://localhost:3228/api/education", {
            method: "POST",
            headers,
            body: JSON.stringify(upload()),
          }),
        ),
      );
    }
  });
  test("forwarded-host/proto spoofing cannot override actual Host or URL protocol", async () => {
    const forwarded = {
      "x-forwarded-host": "attacker.test",
      "x-forwarded-proto": "https",
      forwarded: "host=attacker.test;proto=https",
    };
    const url = "http://localhost:3228/api/education";
    await fixedError(
      await POST(
        request(
          upload(),
          { host: "127.0.0.1:3228", origin: "https://attacker.test", ...forwarded },
          url,
        ),
      ),
    );
    await fixedError(
      await POST(
        request(
          upload(),
          {
            host: "127.0.0.1:3228",
            origin: "https://127.0.0.1:3228",
            "x-forwarded-proto": "https",
          },
          url,
        ),
      ),
    );
    await fixedError(
      await POST(request(upload(), { origin: "https://attacker.test", ...forwarded }, url)),
    );
    await fixedError(
      await POST(
        request(upload(), { host: "", origin: "https://attacker.test", ...forwarded }, url),
      ),
    );
    const valid = await POST(
      request(
        upload(),
        { host: "127.0.0.1:3228", origin: "http://127.0.0.1:3228", ...forwarded },
        url,
      ),
    );
    expect(valid.status).toBe(200);
    expect(await valid.json()).toEqual({ document: question() });
  });
  test("valid direct tool uploads without Origin remain allowed, not authenticated", async () => {
    const cases: Record<string, string>[] = [
      {},
      { host: "127.0.0.1:3228" },
      { host: "[::1]:3228", "x-forwarded-host": "attacker.test", "x-forwarded-proto": "https" },
    ];
    for (const headers of cases) {
      const response = await POST(
        request(upload(), headers, "http://localhost:3228/api/education"),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ document: question() });
    }
  });
  test("same-origin rewritten requests still enforce media, byte, stream and UTF-8 limits", async () => {
    const headers = {
      host: "127.0.0.1:3228",
      origin: "http://127.0.0.1:3228",
      "Content-Type": "application/json",
    };
    const url = "http://localhost:3228/api/education";
    await fixedError(
      await POST(request(upload(), { ...headers, "Content-Type": "text/plain" }, url)),
      415,
    );
    await fixedError(
      await POST(
        request(upload(), { ...headers, "Content-Length": String(maxUploadBytes + 1) }, url),
      ),
      413,
    );
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(maxUploadBytes + 1));
        controller.close();
      },
    });
    await fixedError(
      await POST(
        new Request(url, { method: "POST", headers, body: stream, duplex: "half" } as RequestInit),
      ),
      413,
    );
    await fixedError(
      await POST(new Request(url, { method: "POST", headers, body: new Uint8Array([0xc3, 0x28]) })),
      422,
    );
    const recovered = await POST(request(upload(), headers, url));
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toEqual({ document: question() });
  });
});

describe("public draft, export and target recovery", () => {
  test("invalid source removes renderable output; valid recovery restores only a public document", () => {
    const q = question();
    expect(parsePublicDraft("{")).toBeNull();
    expect(
      parsePublicDraft(JSON.stringify(authorExample("measurement", "geist-light"))),
    ).toBeNull();
    expect(parsePublicDraft(JSON.stringify({ ...q, stages: {} }))).toBeNull();
    expect(parsePublicDraft(" ".repeat(maxUploadBytes + 1))).toBeNull();
    expect(parsePublicDraft(JSON.stringify(q))).toEqual(q);
    expect(publicExport(null, "svg")).toBeNull();
    expect(publicExport(null, "json")).toBeNull();
  });
  test("empty public drafts retain JSON, disable image downloads and preserve caption-only rendering", async () => {
    const empty = { ...question(), display: [], targets: [] };
    expect(parsePublicDraft(JSON.stringify(empty))).toEqual(empty);
    const html = renderToStaticMarkup(
      <EducationWorkbench initialDocument={empty} initialSelection={defaultSelection} editor />,
    );
    for (const format of ["SVG", "PNG", "JSON"]) {
      const button = html.match(new RegExp(`<button\\b[^>]*>Download ${format}</button>`))?.[0];
      expect(button).toBeDefined();
      expect(button?.includes("disabled")).toBe(format !== "JSON");
    }
    expect(html).not.toContain("<svg");
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("data:image/svg");
    expect(html).toContain("No drawing in this public stage");
    expect(html).toContain("JSON export remains available");
    const caption = renderToStaticMarkup(
      <EducationalFigure document={empty} caption={<span>Caption-only public lesson</span>} />,
    );
    expect(caption).toContain("<figcaption><span>Caption-only public lesson</span></figcaption>");
    expect(caption).not.toContain("<svg");
    expect(caption).not.toContain('role="alert"');
    expect(JSON.parse(publicExport(empty, "json")?.text ?? "null")).toEqual(empty);
    await expect(exportPublicPNG(empty, new AbortController().signal)).resolves.toBeUndefined();
    expect(retainSelection(question(), empty, ["meter/reading"])).toEqual([]);
    expect(publicExport(question(), "svg")?.text).toContain("<svg");
  });
  test("target identity retains allowed selection, drops absent correction targets, and resets across cases", () => {
    const q = question();
    const c = publicExample({ ...defaultSelection, stage: "correction" });
    const ids = ["meter/reading", "explanation/reading/difference", "secret/net", "meter/reading"];
    expect(retainSelection(q, c, ids)).toEqual(["meter/reading", "explanation/reading/difference"]);
    expect(retainSelection(c, q, ids)).toEqual(["meter/reading"]);
    expect(retainSelection(q, publicExample({ ...defaultSelection, case: "board" }), ids)).toEqual(
      [],
    );
    expect(retainSelection(q, null, ids)).toEqual([]);
    expect(retainSelection(q, q, ids)).toEqual(["meter/reading"]);
  });
  test("canonical figure-only exports use public renderer bytes, never interactive DOM or author source", () => {
    const q = question();
    const before = JSON.stringify(q);
    const canonical = renderEducationalSVG(q, { namespace: "CircuitFigure" });
    expect(canonical.ok).toBe(true);
    expect(publicExport(q, "svg")?.text).toBe(canonical.ok ? canonical.svg : "");
    expect(JSON.parse(publicExport(q, "json")?.text ?? "null")).toEqual(q);
    expect(publicExport(authorExample("measurement", "geist-light"), "json")).toBeNull();
    expect(JSON.stringify(q)).toBe(before);
  });
});

describe("web route SSR and scoped boundaries", () => {
  test("ordinary workspaces start minimal and never receive authored source", async () => {
    for (const page of [await EducationEditorPage(), EducationPage()]) {
      const html = renderToStaticMarkup(page);
      expect(html.match(/<main\b/g)).toHaveLength(1);
      expect(html).toContain('data-workspace="public"');
      expect(html).toContain("data-public-preview");
      expect(html).not.toContain("circuitkit.educational.author.v2");
      expect(html).not.toContain("<figcaption");
      expect(html).not.toContain('role="button"');
      expect(html).toContain("Download SVG");
      expect(html).toContain("Download PNG");
      expect(html).toContain("Download JSON");
      expect(html).toContain("All 12 panel families");
    }
  });
  test("author source requires the explicit labelled author route", async () => {
    const html = renderToStaticMarkup(await AuthorWorkspacePage());
    expect(html).toContain('data-workspace="author"');
    expect(html).toContain("circuitkit.educational.author.v2");
    expect(html).toContain("not assessment privacy");
    expect(html).toContain("CSS stage hiding is not protection");
    expect(html).toContain("not automatically saved");
    expect(html).toContain("Leave author workspace");
  });
  test("gallery lists each engine and adapter case with stage, theme and selected state", async () => {
    const html = renderToStaticMarkup(
      await EducationGalleryPage({
        searchParams: Promise.resolve({ stage: "question", theme: "geist-print", case: "board" }),
      }),
    );
    expect(html.match(/data-family=/g)).toHaveLength(examples.length);
    expect(html.match(/data-adapter-family=/g)).toHaveLength(18);
    expect(html.match(/data-selected="true"/g)).toHaveLength(1);
    for (const family of families) expect(html).toContain(`data-family="${family}"`);
    for (const family of adapterFamilies) expect(html).toContain(`data-adapter-family="${family}"`);
    expect(html).toMatch(/<a\b[^>]*aria-current="true"[^>]*>Selected case<\/a>/);
    expect(html).toContain("geist-print");
    expect(html).toContain("Public observation record");
    expect(html).toContain('href="/gallery/education/local"');
    expect(html).not.toContain("circuitkit.educational.author.v2");
    expect(html).not.toContain("manifest.json");
  });
  test("host runs and record tables use escaped React text with no HTML fallback", () => {
    const html = renderToStaticMarkup(
      <HostContent
        host={{
          kind: "record",
          caption: [
            { text: "<script>alert(1)</script>", script: "base" },
            { text: "out", script: "sub" },
          ],
          notes: [],
          record: [
            {
              id: "row",
              label: [{ text: "Reading", script: "base" }],
              value: [{ text: "latent-canary", script: "base" }],
              missing: true,
              flagged: true,
            },
          ],
        }}
      />,
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<sub>out</sub>");
    expect(html).toContain('scope="row"');
    expect(html).toContain("Missing");
    expect(html).toContain("Flagged");
    expect(html).not.toContain("latent-canary");
  });
  test("gallery interaction exposes only explicit targets", () => {
    const html = renderToStaticMarkup(<GalleryFigure document={question()} />);
    expect(html.match(/role="button"/g)).toHaveLength(question().targets.length);
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("Selected: none");
  });
  test("public client entrypoints never import compiler, catalog authors or corpus source", () => {
    for (const path of [
      "app/education/workbench.tsx",
      "app/education/gallery-figure.tsx",
      "app/education/browser-export.ts",
      "app/education/public-state.ts",
      "app/education/catalog.ts",
      "app/education/host-content.tsx",
      "app/education/net-manifest.tsx",
      "app/education/FigureViewport.tsx",
      "app/education/viewport-layout.ts",
    ]) {
      const source = read(path);
      for (const forbidden of [
        "v2/index",
        "v2/compiler",
        "v2/fixtures",
        "./examples",
        "manifest.json",
        "dangerouslySetInnerHTML",
        "renderGradualHost",
      ])
        expect(source).not.toContain(forbidden);
    }
    expect(read("app/education/examples.ts")).toContain('import "next/headers"');
    expect(read("app/education/workbench.tsx")).toContain(
      'import { EducationalFigure } from "../../src/v2/react.tsx"',
    );
    expect(read("app/education/public-state.ts")).toContain('from "../../src/v2/render.ts"');
    expect(read("app/education/browser-export.ts")).toContain('publicExport(document, "svg")');
  });
  test("scoped controls and grids support compact and coarse-pointer layouts", () => {
    const css = read("app/education/education.css");
    expect(css).toContain("min-height: 32px");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("@media (pointer: coarse)");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(css).toContain(":focus-visible");
    const html = renderToStaticMarkup(
      <EducationWorkbench
        initialDocument={question()}
        initialSelection={defaultSelection}
        editor
      />,
    );
    for (const label of ["Family", "Case", "Stage", "Figure theme", "Selected public figure JSON"])
      expect(html).toContain(label);
    expect(html).toContain("aria-describedby=");
    expect(html).toContain('role="status"');
  });
});

describe("readable host figure viewports", () => {
  test("all native and adapter projections keep at least 12px base labels at mobile and desktop budgets", () => {
    for (const stage of stages) {
      const documents = [
        ...examples.map((entry) => publicExample({ case: entry.id, stage, theme: "geist-light" })),
        ...publicAdapterExamples(stage, "geist-light").flatMap((entry) =>
          entry.document ? [entry.document] : [],
        ),
      ];
      for (const document of documents) {
        const before = JSON.stringify(document);
        const metrics = measureFigureViewport(document);
        expect(metrics).not.toBeNull();
        if (!metrics) continue;
        const baseSizes = document.display.flatMap((part) =>
          part.shapes.flatMap((shape) =>
            shape.kind === "math" && shape.runs.some((run) => run.text.trim()) ? [shape.size] : [],
          ),
        );
        expect(metrics.minimumBaseSize).toBe(baseSizes.length ? Math.min(...baseSizes) : null);
        for (const width of [264, 288, 358, 568, 1232]) {
          const size = { width, heightLimit: 480 };
          const readable = figureViewportLayout(metrics, size, "readable");
          const fit = figureViewportLayout(metrics, size, "fit");
          expect(readable.width).toBe(metrics.readableWidth);
          expect(readable.scale).toBeGreaterThanOrEqual(1);
          if (metrics.minimumBaseSize !== null)
            expect(readable.scale * metrics.minimumBaseSize).toBeGreaterThanOrEqual(
              minimumFigureFontSize,
            );
          expect(fit.width).toBeLessThanOrEqual(width);
          expect(fit.height).toBeLessThanOrEqual(size.heightLimit + 0.000001);
          expect(fit.scale).toBeLessThanOrEqual(readable.scale);
          expect(readable.needsOverview).toBe(
            metrics.readableWidth > width + 0.5 || metrics.readableHeight > size.heightLimit + 0.5,
          );
        }
        expect(JSON.stringify(document)).toBe(before);
      }
    }
  });
  test("readable size follows real bounds and small base fonts, without a fixed minimum canvas", () => {
    const small = structuredClone(question());
    small.targets = [];
    small.display = [
      {
        id: "tiny-label",
        shapes: [
          {
            kind: "math",
            at: { x: 0, y: 0 },
            size: 8,
            runs: [{ text: "R", script: "base" }],
            align: "left",
            family: "sans",
            tone: "ink",
          },
        ],
      },
    ];
    const metrics = measureFigureViewport(small);
    expect(metrics?.minimumBaseSize).toBe(8);
    expect(metrics?.minReadableScale).toBe(1.5);
    if (!metrics) throw new Error("Expected public metrics");
    expect(metrics.readableWidth).toBe(Math.ceil(metrics.contentWidth * 1.5));
    expect(metrics.readableWidth).toBeLessThan(50);
    const readable = figureViewportLayout(metrics, { width: 288, heightLimit: 480 }, "readable");
    expect(readable.needsOverview).toBe(false);
    expect(figureViewportLayout(metrics, { width: 288, heightLimit: 480 }, "fit").width).toBe(
      readable.width,
    );
    expect(figureViewportLayout(metrics, null, "readable").width).toBe(readable.width);
    const html = renderToStaticMarkup(
      <FigureViewport document={small}>
        <EducationalFigure document={small} />
      </FigureViewport>,
    );
    expect(html).toContain('data-view-mode="readable"');
    expect(html).not.toContain(">Fit</button>");
    expect(html).not.toContain(">Readable</button>");
  });
  test("empty and invalid public figures add no fake scroll region or overview controls", () => {
    const empty = { ...question(), display: [], targets: [] };
    expect(measureFigureViewport(empty)).toBeNull();
    expect(measureFigureViewport(authorExample("measurement", "geist-light"))).toBeNull();
    const html = renderToStaticMarkup(
      <FigureViewport document={empty}>
        <EducationalFigure document={empty} caption={<span>Public caption only</span>} />
      </FigureViewport>,
    );
    expect(html).toContain("<figcaption><span>Public caption only</span></figcaption>");
    expect(html).not.toContain("data-figure-viewport");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain('role="alert"');
  });
  test("viewport modes do not change the document, core SVG, public exports or selection", () => {
    const document = publicExample({ case: "named-nets", stage: "teaching", theme: "geist-dark" });
    const source = JSON.stringify(document);
    const svg = publicExport(document, "svg");
    const json = publicExport(document, "json");
    if (!svg || !json) throw new Error("Expected canonical public exports");
    const selected = ["circuit/net/supply"];
    const metrics = measureFigureViewport(document);
    if (!metrics) throw new Error("Expected public metrics");
    const readable = figureViewportLayout(metrics, { width: 264, heightLimit: 480 }, "readable");
    const fit = figureViewportLayout(metrics, { width: 264, heightLimit: 480 }, "fit");
    expect(readable.needsOverview).toBe(true);
    expect(readable.width).toBeGreaterThan(fit.width);
    const html = renderToStaticMarkup(
      <FigureViewport document={document}>
        <EducationalFigure
          document={document}
          namespace="CircuitFigure"
          selectedTargets={selected}
          onSelectionChange={() => {}}
        />
      </FigureViewport>,
    );
    const embedded = html.match(/<image href="data:image\/svg\+xml,([^"]+)"/)?.[1];
    expect(decodeURIComponent(embedded ?? "")).toBe(svg.text);
    expect(html).toContain(`data-readable-width="${metrics.readableWidth}"`);
    expect(html).toContain('class="education-viewport-canvas"');
    expect(html).toContain(`style="width:${readable.width}px"`);
    expect(html).toContain('aria-pressed="true"');
    expect(JSON.stringify(document)).toBe(source);
    expect(selected).toEqual(["circuit/net/supply"]);
    expect(publicExport(document, "svg")).toEqual(svg);
    expect(publicExport(document, "json")).toEqual(json);
  });
  test("arrow keys pan locally and focus reveal never needs document scrolling", () => {
    expect(viewportPanDelta("ArrowLeft")).toEqual({ left: -64, top: 0 });
    expect(viewportPanDelta("ArrowRight")).toEqual({ left: 64, top: 0 });
    expect(viewportPanDelta("ArrowUp")).toEqual({ left: 0, top: -64 });
    expect(viewportPanDelta("ArrowDown")).toEqual({ left: 0, top: 64 });
    for (const key of ["Enter", " ", "Escape", "Tab"]) expect(viewportPanDelta(key)).toBeNull();
    expect(revealViewportAxis(40, 80, 8, 256)).toBe(0);
    expect(revealViewportAxis(-20, 20, 8, 256)).toBe(-28);
    expect(revealViewportAxis(400, 420, 8, 256)).toBe(164);
    expect(revealViewportAxis(50, 650, 8, 256)).toBe(42);
    const component = read("app/education/FigureViewport.tsx");
    expect(component).toContain("region.scrollBy");
    expect(component).not.toContain("scrollIntoView");
    expect(component).not.toContain("window.scroll");
    expect(component).toContain("onFocusCapture");
    expect(component).toContain("event.defaultPrevented");
    expect(component).toContain("ResizeObserver");
    expect(component).toContain("observer?.disconnect()");
  });
  test("every gallery figure and the public editor use bounded local viewports, with complete mobile case text", async () => {
    const gallery = renderToStaticMarkup(await EducationGalleryPage());
    const svgCount = gallery.match(/<svg\b/g)?.length ?? 0;
    expect(svgCount).toBeGreaterThan(0);
    expect(gallery.match(/data-figure-viewport="true"/g)).toHaveLength(svgCount);
    const document = publicExample({ case: "named-nets", stage: "teaching", theme: "geist-light" });
    const editor = renderToStaticMarkup(
      <EducationWorkbench
        initialDocument={document}
        initialSelection={{ case: "named-nets", stage: "teaching", theme: "geist-light" }}
        editor
      />,
    );
    expect(editor).toContain('class="education-case-control"');
    expect(editor).toContain(
      'class="education-case-name">Selected case: Explicit whole-net targets</span>',
    );
    expect(editor).toMatch(/<select[^>]*aria-describedby="[^"]*-case-name [^"]*-case-help"/);
    expect(editor).toContain('data-view-mode="readable"');
    expect(editor).toContain("figure viewport");
    const css = read("app/education/education.css");
    expect(css).toMatch(
      /\.education-viewport-scroll\s*\{[^}]*max-width: 100%;[^}]*overflow: auto;/,
    );
    expect(css).toContain("max-height: var(--education-viewport-height)");
    expect(css).toContain("overscroll-behavior: contain");
    expect(css).toContain(".education-viewport-scroll:focus-visible");
    expect(css).toMatch(
      /\.education-toolbar \.education-case-control\s*\{\s*flex: 1 1 100%;\s*width: 100%;/,
    );
    expect(css).not.toContain("text-overflow: ellipsis");
    expect(css).not.toContain("overflow: hidden");
  });
});

describe("isolated local corpus link", () => {
  test("requires explicit opt-in and HTTP loopback without credentials", () => {
    expect(localComparisonURL(undefined, "http://localhost:4317/results")).toBeNull();
    expect(localComparisonURL("true", "http://localhost:4317")).toBeNull();
    expect(localComparisonURL("1", undefined)).toBeNull();
    for (const value of [
      "https://localhost:4317",
      "http://example.org",
      "file:///private/corpus",
      "http://user:secret@localhost:4317",
      "javascript:alert(1)",
      "http://127.0.0.1.example.org",
    ])
      expect(localComparisonURL("1", value)).toBeNull();
    expect(localComparisonURL("1", "http://127.0.0.1:4317/results")).toBe(
      "http://127.0.0.1:4317/results",
    );
    expect(localComparisonURL("1", "http://[::1]:4317/results")).toBe("http://[::1]:4317/results");
  });
  test("fallback explains non-bundling without reading or serving the corpus", () => {
    const html = renderToStaticMarkup(<LocalCorpusPage />);
    expect(html).toContain("The private corpus is not bundled");
    const source = read("app/gallery/education/local/page.tsx");
    expect(source).not.toContain("readFile");
    expect(source).not.toContain("manifest.json");
    expect(source).not.toContain("process.env.NEXT_PUBLIC");
  });
});
