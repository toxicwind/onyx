/**
 * marquee readme — maximal README renderer per readme-anatomy.md.
 * Borrowed structure from othneildrew/Best-README-Template (16k⭐) + matiassingers/awesome-readme (21k⭐).
 */
export interface ReadmeConfig {
  /** repo name, e.g. bge-oracle */
  name: string;
  /** repo URL, e.g. https://github.com/toxicwind/bge-oracle */
  repoUrl: string;
  /** one-line description, formula: [Project] is [what] for [who] that [benefit] */
  tagline: string;
  /** badge URLs (shields.io) — full markdown row; default built from repo/language/license */
  badges?: string;
  /** markdown for a demo asset above the fold (GIF/image/asciinema). Empty = omitted. */
  demo?: string;
  /** install command block, e.g. "bun install" */
  installCommand: string;
  /** example code block (fenced, without fences) */
  example?: string;
  /** language for code highlighting of example */
  exampleLang?: string;
  /** built-with items: name → link */
  builtWith?: Record<string, string>;
  /** feature bullets (already stringified) */
  features?: string[];
  /** roadmap: [ {done, label, issue?} ] */
  roadmap?: { done: boolean; label: string; issue?: string }[];
  /** license short name, e.g. MIT */
  license: string;
  /** maintainer handle, e.g. @toxicwind */
  maintainer?: string;
  /** acknowledgments: name → link */
  acknowledgments?: Record<string, string>;
}

function badgeRow(cfg: ReadmeConfig): string {
  if (cfg.badges) return cfg.badges;
  const enc = encodeURIComponent;
  const repo = cfg.repoUrl.replace(/https?:\/\/(www\.)?github\.com\//, "");
  return [
    `[![License: ${cfg.license}](https://img.shields.io/badge/License-${enc(cfg.license)}-blue.svg?style=for-the-badge)](LICENSE)`,
    `[![GitHub stars](https://img.shields.io/github/stars/${repo}?style=for-the-badge)](${cfg.repoUrl})`,
    `[![GitHub issues](https://img.shields.io/github/issues/${repo}?style=for-the-badge)](${cfg.repoUrl}/issues)`,
  ].join(" ");
}

export function renderReadme(cfg: ReadmeConfig): string {
  const issuesUrl = `${cfg.repoUrl}/issues`;
  const b = badgeRow(cfg);
  const sections: string[] = [];
  sections.push(
    `# ${cfg.name}`,
    ``,
    `<div align="center">`,
    ``,
    `${b}`,
    ``,
    `</div>`,
    ``,
    `---`,
    ``,
    `## ${cfg.tagline}`,
    ``,
  );
  sections.push(
    `<p align="center">`,
    `  <a href="docs/">Explore the docs »</a> ·`,
    `  <a href="${issuesUrl}/new?labels=bug">Report Bug</a> ·`,
    `  <a href="${issuesUrl}/new?labels=enhancement">Request Feature</a>`,
    `</p>`,
    ``,
  );
  if (cfg.demo) {
    sections.push(`## Demo`, ``, cfg.demo, ``);
  }
  if (cfg.example) {
    const lang = cfg.exampleLang ?? "ts";
    sections.push(`## Example`, ``, `\`\`\`${lang}`, cfg.example, `\`\`\``, ``);
  }
  sections.push(
    `## Features`,
    ``,
    ...(cfg.features ?? []).map((f) => `- ${f}`),
    ``,
    `## Getting Started`,
    ``,
    `### Prerequisites`,
    ``,
    `- Bun >= 1.1 (or the runtime your package targets)`,
    ``,
    `### Install`,
    ``,
    `\`\`\`bash`,
    cfg.installCommand,
    `\`\`\``,
    ``,
    `## Usage`,
    ``,
    cfg.example
      ? `Copy the example above — it works as-is. See [docs/](docs/) for the full API.`
      : `See [docs/](docs/) for the full API.`,
    ``,
  );
  if (cfg.builtWith && Object.keys(cfg.builtWith).length > 0) {
    sections.push(
      `## Built With`,
      ``,
      ...Object.entries(cfg.builtWith).map(([k, v]) => `- [${k}](${v})`),
      ``,
    );
  }
  sections.push(
    `## Roadmap`,
    ``,
    ...(cfg.roadmap ?? [{ done: true, label: "First release" }]).map((r) =>
      r.issue
        ? `- [${r.done ? "x" : " "}] ${r.label} ([#${r.issue}](${issuesUrl}/${r.issue}))`
        : `- [${r.done ? "x" : " "}] ${r.label}`,
    ),
    ``,
    `See the [open issues](${issuesUrl}) for full roadmap and proposed features.`,
    ``,
    `## Contributing`,
    ``,
    `Contributions are what make the open-source community such an amazing place — read [CONTRIBUTING.md](CONTRIBUTING.md) and jump in.`,
    ``,
    `## License`,
    ``,
    `Distributed under the ${cfg.license} License. See [LICENSE](LICENSE) for more information.`,
    ``,
  );
  if (cfg.maintainer || (cfg.acknowledgments && Object.keys(cfg.acknowledgments).length > 0)) {
    sections.push(`## Contact & Acknowledgments`, ``);
    if (cfg.maintainer) sections.push(`Maintainer: ${cfg.maintainer} — open a [discussion](${issuesUrl}).`, ``);
    if (cfg.acknowledgments) {
      sections.push(
        `Borrowed from / inspired by:`,
        ``,
        ...Object.entries(cfg.acknowledgments).map(([k, v]) => `- ${k} — ${v}`),
        ``,
      );
    }
  }
  sections.push(`---`, ``, `> Don't forget to give the project a star! ⭐ Thanks again!`, ``);
  return sections.join("\n");
}