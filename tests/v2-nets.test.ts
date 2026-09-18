import { expect, test } from "bun:test";
import { Resvg } from "@resvg/resvg-js";
import { analyzeElectrical } from "../src/v2/electrical.ts";
import { dividerPanel, privacyFixture } from "../src/v2/fixtures.ts";
import {
  authorFigure,
  type ElectricalPanel,
  electricalPanel,
  inspectEducational,
  inspectElectricalNets,
  type NetTarget,
  netTargetId,
  type PublicFigure,
  point,
  projectFigure,
  type Result,
  renderEducationalSVG,
  stageModel,
  type Target,
  targetDOMId,
  validateAuthorFigure,
  validateEducational,
} from "../src/v2/index.ts";

function success<T>(result: Result<T>) {
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result;
}
function author(panel: ElectricalPanel, expose: Target[] = []) {
  const model = stageModel([panel], { expose });
  return authorFigure("net-example", { teaching: model, question: model, correction: model });
}
function project(panel: ElectricalPanel, expose: Target[] = []): PublicFigure {
  return success(projectFigure(author(panel, expose), "teaching")).document;
}
function request(panel: string, net: string): Target {
  return { id: netTargetId(panel, net), label: `${net} conductor`, role: "net" };
}
function button(state: "open" | "closed" = "open"): ElectricalPanel {
  return electricalPanel(
    "switch",
    [
      { id: "a", at: point(0, 0), connection: "free" },
      { id: "b", at: point(100, 0), connection: "free" },
    ],
    [{ id: "S1", kind: "button", state, intent: "normal", terminals: ["a", "b"] }],
    [],
  );
}
function netDocument() {
  const panel = dividerPanel();
  panel.namedNets = [
    { id: "supply", terminal: "vp" },
    { id: "middle", terminal: "rb" },
  ];
  return project(panel, [
    request("circuit", "supply"),
    request("circuit", "middle"),
    { id: "circuit/terminal/vp", label: "Source positive", role: "terminal" },
  ]);
}
function net(document: PublicFigure, id = "circuit/net/supply"): NetTarget {
  const target = document.targets.find((t) => t.id === id);
  if (target?.role !== "net") throw new Error("missing net target");
  return target;
}

test("an open button bypass requires explicit fault intent, just like a resistor", () => {
  const panel = button();
  panel.routes.push({
    id: "jumper",
    from: "a",
    to: "b",
    via: [point(0, 40), point(100, 40)],
    state: "connected",
    intent: "normal",
  });
  expect(() => analyzeElectrical(panel)).toThrow();
  expect(validateAuthorFigure(author(panel)).diagnostics[0]?.code).toBe("graph.unintended-bypass");
  expect(projectFigure(author(panel), "question").ok).toBe(false);
  const jumper = panel.routes[0];
  if (!jumper) throw new Error("fixture");
  jumper.intent = "intentional-fault";
  expect(() => analyzeElectrical(panel)).toThrow();
  jumper.bypass = "S1";
  expect(analyzeElectrical(panel)).toEqual([["a", "b"]]);
  success(validateAuthorFigure(author(panel)));
  delete jumper.bypass;
  jumper.intent = "normal";
  const component = panel.components[0];
  if (component?.kind !== "button") throw new Error("fixture");
  component.intent = "intentional-fault";
  success(validateAuthorFigure(author(panel)));
  component.intent = "normal";
  component.state = "closed";
  success(validateAuthorFigure(author(panel)));
});

test("fault and net declarations never excuse bad endpoints, false bypasses, or degenerate routes", () => {
  const panel = button();
  panel.namedNets = [{ id: "allowed", terminal: "a" }];
  panel.routes.push({
    id: "jumper",
    from: "a",
    to: "b",
    via: [],
    state: "connected",
    intent: "intentional-fault",
    bypass: "S1",
  });
  success(inspectElectricalNets(panel));
  const route = panel.routes[0];
  if (!route) throw new Error("fixture");
  route.to = "absent";
  expect(inspectElectricalNets(panel).diagnostics[0]?.code).toBe("graph.route-reference");
  route.to = "b";
  route.bypass = "absent";
  expect(inspectElectricalNets(panel).diagnostics[0]?.code).toBe("graph.bypass-intent");
  route.bypass = "S1";
  route.via = [point(0, 0)];
  expect(inspectElectricalNets(panel).diagnostics[0]?.code).toBe("graph.route-degenerate");
  expect(projectFigure(author(panel, [request("switch", "allowed")]), "teaching").ok).toBe(false);
});

test("named nets are an explicit host manifest and never implicit public targets", () => {
  const panel = dividerPanel();
  const before = project(panel);
  panel.namedNets = [
    { id: "PRIVATE_SUPPLY_NAME", terminal: "vp" },
    { id: "PRIVATE_OTHER_NAME", terminal: "rb" },
  ];
  const host = success(inspectElectricalNets(panel));
  expect(host.nets[0]).toEqual({
    id: "circuit/net/PRIVATE_SUPPLY_NAME",
    anchor: "vp",
    terminals: ["ra", "vp"],
    members: ["circuit/route/top", "circuit/terminal/ra", "circuit/terminal/vp"],
  });
  expect(project(panel)).toEqual(before);
  expect(renderEducationalSVG(project(panel))).toEqual(renderEducationalSVG(before));
  expect(inspectEducational(project(panel))).toEqual(inspectEducational(before));
  expect(JSON.stringify(project(panel))).not.toContain("PRIVATE_");
  expect(success(projectFigure(author(panel), "question")).document).toEqual(before);
  panel.namedNets = [{ id: "PRIVATE_UNRESOLVED", terminal: "absent" }];
  expect(project(panel)).toEqual(before);
  expect(validateAuthorFigure(author(panel)).diagnostics[0]?.code).toBe("net.unresolved-anchor");
  expect(inspectElectricalNets(panel).diagnostics[0]?.code).toBe("net.unresolved-anchor");
  const failed = projectFigure(
    author(panel, [request("circuit", "PRIVATE_UNRESOLVED")]),
    "teaching",
  );
  expect(failed).toEqual({
    ok: false,
    diagnostics: [
      { code: "educational.invalid", message: "Invalid or unsupported educational figure." },
    ],
  });
});

test("exposed group targets preserve display parts and old individual target shape", () => {
  const panel = dividerPanel();
  panel.namedNets = [{ id: "supply", terminal: "vp" }];
  const baseline = project(panel);
  const document = project(panel, [
    request("circuit", "supply"),
    { id: "circuit/terminal/vp", label: "Source positive", role: "terminal" },
  ]);
  expect(document.display).toEqual(baseline.display);
  expect(
    success(projectFigure(author(panel, [request("circuit", "supply")]), "question")).document
      .targets,
  ).toEqual([net(document)]);
  expect(net(document)).toEqual({
    id: "circuit/net/supply",
    role: "net",
    label: "supply conductor",
    kind: "group",
    members: ["circuit/route/top", "circuit/terminal/ra", "circuit/terminal/vp"],
  });
  expect(document.targets[1]).toEqual({
    id: "circuit/terminal/vp",
    label: "Source positive",
    role: "terminal",
  });
  expect(net(document).members.every((id) => document.display.some((p) => p.id === id))).toBe(true);
  expect(JSON.stringify(document)).not.toContain('"anchor"');
  expect(JSON.stringify(document)).not.toContain('"terminals"');
  expect(JSON.stringify(document)).not.toContain('"namedNets"');
});

test("group bounds and same-instance native references do not duplicate any drawing", () => {
  const document = netDocument();
  const rendered = success(renderEducationalSVG(document, { namespace: "first" }));
  const second = success(renderEducationalSVG(document, { namespace: "second" }));
  expect(second.targets).toEqual(rendered.targets);
  expect(second.svg).toBe(rendered.svg.replaceAll("edu-first-", "edu-second-"));
  const target = rendered.targets.find((t) => t.id === "circuit/net/supply");
  if (target?.role !== "net") throw new Error("fixture");
  expect(target.bounds).toEqual({ x: -4, y: -4, width: 188, height: 8 });
  expect(success(inspectEducational(document)).targets).toEqual(rendered.targets);
  const ids = [...rendered.svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  expect(new Set(ids).size).toBe(ids.length);
  for (const group of document.targets.filter((t) => t.role === "net")) {
    const references = group.members.map((member) => targetDOMId("first", member));
    expect(rendered.svg).toContain(
      `id="${targetDOMId("first", group.id)}" data-target="${group.id}" data-kind="group" data-members="${references.join(" ")}" aria-owns="${references.join(" ")}"`,
    );
    for (const reference of references) expect(ids).toContain(reference);
  }
  expect(rendered.svg.match(/data-target=/g)?.length).toBe(document.targets.length);
  expect(rendered.svg).not.toMatch(/<use\b|href=/);
  const unexposed = { ...document, targets: [] };
  const base = success(renderEducationalSVG(unexposed));
  const paths = (svg: string) =>
    [...svg.matchAll(/<(?:path|circle|rect)\b[^>]*>/g)].map((m) => m[0]);
  expect(paths(rendered.svg)).toEqual(paths(base.svg));
  for (const theme of ["geist-light", "geist-dark", "geist-print"] as const) {
    const withNet = success(renderEducationalSVG({ ...document, theme })).svg;
    const withoutNet = success(renderEducationalSVG({ ...unexposed, theme })).svg;
    const options = { font: { loadSystemFonts: false } };
    expect(new Resvg(withNet, options).render().asPng()).toEqual(
      new Resvg(withoutNet, options).render().asPng(),
    );
  }
});

test("an anchored net follows opens and closed buttons; merged definitions are explicitly ambiguous", () => {
  const panel = button();
  panel.namedNets = [
    { id: "left", terminal: "a" },
    { id: "right", terminal: "b" },
  ];
  const open = project(panel, [request("switch", "left"), request("switch", "right")]);
  expect(net(open, "switch/net/left").members).toEqual(["switch/terminal/a"]);
  expect(net(open, "switch/net/right").members).toEqual(["switch/terminal/b"]);
  const component = panel.components[0];
  if (component?.kind !== "button") throw new Error("fixture");
  component.state = "closed";
  expect(inspectElectricalNets(panel).diagnostics[0]?.code).toBe("net.ambiguous-anchor");
  expect(
    projectFigure(
      author(panel, [request("switch", "left"), request("switch", "right")]),
      "teaching",
    ).ok,
  ).toBe(false);
  const closed = project(panel, [request("switch", "left")]);
  expect(net(closed, "switch/net/left").members).toEqual([
    "switch/component/S1",
    "switch/terminal/a",
    "switch/terminal/b",
  ]);
  expect(
    validateAuthorFigure(author(panel, [request("switch", "left")])).diagnostics[0]?.code,
  ).toBe("net.ambiguous-anchor");
  panel.namedNets = [{ id: "left", terminal: "a" }];
  success(validateAuthorFigure(author(panel, [request("switch", "left")])));
  component.state = "open";
  expect(net(project(panel, [request("switch", "left")]), "switch/net/left").members).toEqual([
    "switch/terminal/a",
  ]);
});

test("open routes are excluded, explicit shorts merge, and bypassed open-button bodies stay excluded", () => {
  const panel = button();
  panel.components = [];
  panel.namedNets = [{ id: "node", terminal: "a" }];
  panel.routes = [
    { id: "wire", from: "a", to: "b", via: [], state: "open", intent: "intentional-fault" },
  ];
  expect(success(inspectElectricalNets(panel)).nets[0]?.members).toEqual(["switch/terminal/a"]);
  if (panel.routes[0]) panel.routes[0].state = "connected";
  expect(success(inspectElectricalNets(panel)).nets[0]?.members).toEqual([
    "switch/route/wire",
    "switch/terminal/a",
    "switch/terminal/b",
  ]);
  panel.routes = [];
  panel.components = [
    {
      id: "R1",
      kind: "resistor",
      terminals: ["a", "b"],
      state: "short",
      intent: "intentional-fault",
    },
  ];
  expect(success(inspectElectricalNets(panel)).nets[0]?.members).toEqual([
    "switch/component/R1",
    "switch/terminal/a",
    "switch/terminal/b",
  ]);
  panel.components = [
    { id: "S1", kind: "button", terminals: ["a", "b"], state: "open", intent: "normal" },
  ];
  panel.routes = [
    {
      id: "bypass",
      from: "a",
      to: "b",
      via: [],
      state: "connected",
      intent: "intentional-fault",
      bypass: "S1",
    },
  ];
  expect(success(inspectElectricalNets(panel)).nets[0]?.members).toEqual([
    "switch/route/bypass",
    "switch/terminal/a",
    "switch/terminal/b",
  ]);
});

test("unexposed ambiguous names remain private but exposed missing names and duplicate declarations fail", () => {
  const panel = dividerPanel();
  const baseline = project(panel);
  panel.namedNets = [
    { id: "one", terminal: "vp" },
    { id: "two", terminal: "ra" },
  ];
  expect(project(panel)).toEqual(baseline);
  expect(inspectElectricalNets(panel).diagnostics[0]?.code).toBe("net.ambiguous-anchor");
  expect(projectFigure(author(panel, [request("circuit", "absent")]), "question").ok).toBe(false);
  panel.namedNets = [
    { id: "one", terminal: "vp" },
    { id: "one", terminal: "ra" },
  ];
  expect(inspectElectricalNets(panel).diagnostics[0]?.code).toBe("identity.duplicate");
  expect(projectFigure(author(panel, [request("circuit", "one")]), "question").ok).toBe(false);
});

test("ideal probes never union or enter net membership, and nonselected net data stays private", () => {
  const fixture = privacyFixture();
  const teaching = fixture.stages.teaching.panels[0];
  if (teaching?.kind !== "electrical") throw new Error("fixture");
  teaching.namedNets = [
    { id: "supply", terminal: "vp" },
    { id: "return", terminal: "vn" },
  ];
  fixture.stages.teaching.expose.push(request("circuit", "supply"), request("circuit", "return"));
  const baseline = success(projectFigure(fixture, "teaching")).document;
  const meter = fixture.stages.teaching.panels[1];
  if (meter?.kind !== "measurement") throw new Error("fixture");
  meter.negative.terminal = meter.positive.terminal;
  const changed = success(projectFigure(fixture, "teaching")).document;
  expect(changed.targets.filter((t) => t.role === "net")).toEqual(
    baseline.targets.filter((t) => t.role === "net"),
  );
  for (const target of changed.targets.filter((t) => t.role === "net"))
    expect(target.members.some((m) => m.startsWith("meter/") || m.includes("probe"))).toBe(false);
  const expectedQuestion = projectFigure(fixture, "question");
  teaching.namedNets = [{ id: "PRIVATE_NEW_ID", terminal: "PRIVATE_ABSENT_ANCHOR" }];
  expect(projectFigure(fixture, "question")).toEqual(expectedQuestion);
  expect(JSON.stringify(expectedQuestion)).not.toContain("PRIVATE_");
});

test("public group metadata rejects dangling, cross-instance, nested and ambiguous references", () => {
  const invalid: ((document: PublicFigure) => void)[] = [
    (d) => {
      net(d).members = [];
    },
    (d) => {
      net(d).members.push("circuit/terminal/absent");
    },
    (d) => {
      net(d).members.push("circuit/terminal/vp");
    },
    (d) => {
      net(d).members = [targetDOMId("other-instance", "circuit/terminal/vp")];
    },
    (d) => {
      const p = d.display.find((p) => p.id === "circuit/terminal/vp");
      if (p) d.display.push({ ...p, id: "another/terminal/vp" });
      net(d).members = ["another/terminal/vp"];
    },
    (d) => {
      net(d).members = ["circuit/net/middle"];
    },
    (d) => {
      net(d).members = ["circuit/value/V1"];
    },
    (d) => {
      net(d, "circuit/net/middle").members.push("circuit/terminal/vp");
    },
    (d) => {
      const p = d.display[0];
      if (p) d.display.push({ ...p, id: "circuit/net/supply" });
    },
    (d) => {
      Object.assign(net(d), { kind: "net", hidden: "PRIVATE_VALUE" });
    },
    (d) => {
      const t = d.targets.find((t) => t.role !== "net");
      if (t) Object.assign(t, { members: ["circuit/terminal/vp"] });
    },
    (d) => {
      Object.assign(net(d), { members: [{ id: "circuit/terminal/vp" }] });
    },
  ];
  const expected = {
    ok: false as const,
    diagnostics: [
      { code: "educational.invalid", message: "Invalid or unsupported educational figure." },
    ],
  };
  for (const mutate of invalid) {
    const document = netDocument();
    mutate(document);
    for (const api of [validateEducational, inspectEducational, renderEducationalSVG])
      expect(api(document)).toEqual(expected);
  }
  const forged = author(dividerPanel(), []);
  forged.stages.question.expose.push({
    id: "circuit/net/supply",
    role: "net",
    label: "Supply",
    members: ["circuit/terminal/vp"],
  } as Target);
  expect(projectFigure(forged, "question")).toEqual(expected);
});

test("net projection, inspection and rendering return detached deterministic metadata", () => {
  const document = netDocument();
  const original = structuredClone(document);
  const first = success(renderEducationalSVG(document));
  expect(success(renderEducationalSVG(document))).toEqual(first);
  const exposed = first.targets.find((t) => t.role === "net");
  if (exposed?.role !== "net") throw new Error("fixture");
  exposed.members.length = 0;
  exposed.bounds.width = 99999;
  net(first.document).members.push("invalid");
  expect(document).toEqual(original);
  const inspected = success(inspectEducational(document));
  expect(inspected.targets.find((t) => t.role === "net")?.bounds.width).toBe(188);
});
