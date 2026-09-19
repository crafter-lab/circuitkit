import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { agentOverview } from "../app/agent-content.ts";
import { agentSetupPrompt } from "../app/landing/agent-prompt.ts";
import DeveloperLanding from "../app/landing/developer-landing.tsx";
import { copyInstallCommand } from "../app/landing/install-actions.tsx";
import SkillCTA from "../app/landing/skill-cta.tsx";

describe("copy-to-agent onboarding", () => {
  test("the prompt installs the latest package and project-scoped evergreen skill before loading the guide", () => {
    expect(agentSetupPrompt).toContain("bun add circuitkit@latest");
    expect(agentSetupPrompt).toContain("npm install circuitkit@latest");
    expect(agentSetupPrompt).toContain(
      "skills add crafter-lab/circuitkit --skill circuitkit --agent codex --yes",
    );
    expect(agentSetupPrompt).toContain("claude-code");
    expect(agentSetupPrompt.indexOf("skills get core --text")).toBeGreaterThan(
      agentSetupPrompt.indexOf("skills add"),
    );
    expect(agentSetupPrompt).toContain("existing pinned version");
    expect(agentSetupPrompt).toContain("package-age restrictions");
    expect(agentSetupPrompt).toContain("Do not install globally or bypass a blocked install");
    expect(agentSetupPrompt).toContain("read its SKILL.md and the CLI guide directly");
    expect(agentSetupPrompt).not.toMatch(/\s-g(?:\s|$)|--global|--force/);
  });

  test("the next input is only the circuit idea, then validated editable source and real images", () => {
    expect(agentSetupPrompt).toContain("Use the circuit idea I already gave you");
    expect(agentSetupPrompt).toContain('"What would you like to draw?"');
    expect(agentSetupPrompt).toContain("validate it with the CLI");
    expect(agentSetupPrompt).toContain("render both SVG and a PNG preview");
    expect(agentSetupPrompt).toContain("Do not overwrite existing files without permission");
    expect(agentSetupPrompt).toContain("never invent board pins");
    expect(agentSetupPrompt).toContain("No simulation or animated-export claims");
  });

  test("preview delivery distinguishes desktop inline, terminal GUI and headless capabilities", () => {
    expect(agentSetupPrompt).toContain("desktop agent or chat UI with inline image support");
    expect(agentSetupPrompt).toContain("not just an agent-only inspection or a text link");
    expect(agentSetupPrompt).toContain("terminal environment with a graphical desktop");
    expect(agentSetupPrompt).toContain("separate image-viewer window");
    for (const launcher of ["open on macOS", "xdg-open on Linux", "Invoke-Item -LiteralPath"]) {
      expect(agentSetupPrompt).toContain(launcher);
    }
    expect(agentSetupPrompt).toContain("actual output path safely quoted");
    expect(agentSetupPrompt).toContain("headless or SSH environments");
    expect(agentSetupPrompt).toContain("do not attempt GUI launchers");
    expect(agentSetupPrompt).toContain("unless that action succeeded");
  });

  test("copying transfers the exact multiline prompt and reports denied or missing clipboard", async () => {
    const values: string[] = [];
    let finish: (() => void) | undefined;
    const result = copyInstallCommand(agentSetupPrompt, {
      writeText: (text) => {
        values.push(text);
        return new Promise<void>((resolve) => {
          finish = resolve;
        });
      },
    });
    expect(values).toEqual([agentSetupPrompt]);
    let completed = false;
    void result.then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);
    if (!finish) throw new Error("Missing clipboard resolver");
    finish();
    expect(await result).toBe("copied");
    expect(
      await copyInstallCommand(agentSetupPrompt, {
        writeText: async () => {
          throw new Error("denied");
        },
      }),
    ).toBe("failed");
    expect(await copyInstallCommand(agentSetupPrompt, undefined)).toBe("failed");
  });

  test("both CTA placements have exact readable fallback text and unique accessible feedback", () => {
    const html = renderToStaticMarkup(
      <>
        <SkillCTA prompt={agentSetupPrompt} />
        <SkillCTA prompt={agentSetupPrompt} placement="Get started" />
      </>,
    );
    expect(html.match(/Copy prompt/g)).toHaveLength(2);
    expect(html.match(/<details/g)).toHaveLength(2);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html.match(/<textarea/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Introduction: CircuitKit setup prompt"');
    expect(html).toContain('aria-label="Get started: CircuitKit setup prompt"');
    expect(html.split(renderToStaticMarkup(agentSetupPrompt)).length - 1).toBe(2);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const match of html.matchAll(/aria-describedby="([^"]+)"/g))
      expect(ids).toContain(match[1]);
    expect(html.match(/role="status"/g)).toHaveLength(2);
    expect(html).not.toContain("Install skill");
  });

  test("landing and agent-readable overview share one prompt, not separate drifting instructions", async () => {
    const html = renderToStaticMarkup(await DeveloperLanding());
    expect(html.match(/Copy prompt/g)).toHaveLength(2);
    expect(html).not.toContain("Run once in your terminal");
    expect(html).not.toContain("Install the skill in your project.");
    expect(agentOverview).toContain(["```text", agentSetupPrompt, "```"].join("\n"));
  });
});
