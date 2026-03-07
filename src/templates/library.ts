import {
  GeneratedFile,
  PromptSpec,
  RouteSpec,
  TemplateDefinition,
  formatAcceptanceChecksMarkdown
} from "../types/spec";

function mergeFiles(...groups: GeneratedFile[][]): GeneratedFile[] {
  const byPath = new Map<string, string>();
  for (const group of groups) {
    for (const file of group) {
      byPath.set(file.path, file.content);
    }
  }
  return Array.from(byPath.entries()).map(([path, content]) => ({ path, content }));
}

function usesRouter(spec: PromptSpec): boolean {
  return spec.featurePacks.includes("router-pack");
}

function hasPack(spec: PromptSpec, pack: PromptSpec["featurePacks"][number]): boolean {
  return spec.featurePacks.includes(pack);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toSentenceCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function componentName(route: RouteSpec): string {
  const normalized = route.title.replace(/[^a-zA-Z0-9]+/g, " ").trim() || "Page";
  return `${normalized
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("")}Page`;
}

function childPath(route: RouteSpec, index: number): string {
  if (index === 0 || route.path === "/") return "";
  return route.path.replace(/^\/+/, "");
}

function appPackageJson(spec: PromptSpec): string {
  const dependencies: Record<string, string> = {
    react: "^18.3.1",
    "react-dom": "^18.3.1"
  };

  if (usesRouter(spec)) {
    dependencies["react-router-dom"] = "^6.30.1";
  }

  return JSON.stringify(
    {
      name: spec.appName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      private: true,
      version: "0.0.1",
      type: "module",
      scripts: {
        dev: "vite",
        build: "tsc && vite build",
        preview: "vite preview"
      },
      dependencies,
      devDependencies: {
        "@types/react": "^18.3.12",
        "@types/react-dom": "^18.3.1",
        "@vitejs/plugin-react": "^4.3.1",
        autoprefixer: "^10.4.20",
        postcss: "^8.4.47",
        tailwindcss: "^3.4.14",
        typescript: "^5.6.2",
        vite: "^5.4.10"
      }
    },
    null,
    2
  );
}

function appPackageLock(spec: PromptSpec): string {
  return JSON.stringify(
    {
      name: spec.appName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      lockfileVersion: 3,
      requires: true,
      packages: {}
    },
    null,
    2
  );
}

function appTsconfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2020",
        useDefineForClassFields: true,
        lib: ["ES2020", "DOM", "DOM.Iterable"],
        allowJs: false,
        skipLibCheck: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        forceConsistentCasingInFileNames: true,
        module: "ESNext",
        moduleResolution: "Node",
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: "react-jsx"
      },
      include: ["src"],
      references: []
    },
    null,
    2
  );
}

function viteConfig(): string {
  return `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()]
});
`;
}

function tailwindConfig(spec: PromptSpec): string {
  const accent = spec.designTone === "luxury" ? "#c09346" : spec.designTone === "playful" ? "#ff6b6b" : "#1d4ed8";
  return `import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: "${accent}",
        ink: "#0f172a",
        mist: "#f8fafc"
      },
      boxShadow: {
        shell: "0 30px 80px rgba(15, 23, 42, 0.10)"
      },
      fontFamily: {
        display: ["Segoe UI", "Helvetica Neue", "sans-serif"]
      }
    }
  },
  plugins: []
} satisfies Config;
`;
}

function postcssConfig(): string {
  return `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
`;
}

function indexHtml(title: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body class="bg-slate-50">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

function mainTsx(spec: PromptSpec): string {
  if (usesRouter(spec)) {
    return `import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./routes";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
`;
  }

  return `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;
}

function indexCss(): string {
  return `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-slate-50 text-slate-900 antialiased;
  }
}

@layer components {
  .shell-gradient {
    background:
      radial-gradient(circle at top left, rgba(29, 78, 216, 0.18), transparent 24%),
      linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%);
  }
}
`;
}

function readme(spec: PromptSpec, templateLabel: string): string {
  const implemented = spec.features
    .filter((feature) => feature.priority === "must" || feature.priority === "should")
    .slice(0, 8)
    .map((feature) => `- ${toSentenceCase(feature.description)}`)
    .join("\n");
  const mocked = spec.assumptions
    .filter((assumption) => /mock|local|stub|simulat|frontend-first/i.test(assumption))
    .slice(0, 6)
    .map((assumption) => `- ${assumption}`)
    .join("\n");

  return `# ${spec.appName}

Generated by the Seedstr Builder Agent using the \`${templateLabel}\` template.

## Prompt

${spec.rawPrompt}

## Feature Packs

${spec.featurePacks.map((pack) => `- ${pack}`).join("\n") || "- none"}

## Acceptance checks

${formatAcceptanceChecksMarkdown(spec.acceptanceChecks)}

## Run

\`\`\`bash
npm install
npm run dev
npm run build
\`\`\`

## Implemented Features

${implemented || "- Core UI shell, routing, and primary prompt features."}

## Mocked / Assumptions

${mocked || "- External integrations are mocked unless explicit live credentials/services are provided."}

## Notes

- Vite + React + TypeScript + Tailwind baseline for fast UI quality.
- HashRouter is used when multiple routes are generated, so static hosting refreshes remain safe.
`;
}

function specMarkdown(spec: PromptSpec): string {
  const pages = spec.pages
    .map((page) => `- \`${page.path}\` - ${page.title}${page.purpose ? `: ${page.purpose}` : ""}`)
    .join("\n");
  const features = spec.features
    .map((feature) => `- **${feature.priority}** (${feature.surface}): ${feature.description}`)
    .join("\n");
  const entities = spec.dataModel.entities
    .map(
      (entity) =>
        `- **${entity.name}**${entity.plural ? ` (${entity.plural})` : ""} - fields: ${(entity.fields ?? [])
          .map((field) => `${field.name}:${field.type}`)
          .join(", ")}`
    )
    .join("\n");

  return `# SPEC: ${spec.appName}

## Goal
${spec.goal}

## Users
${spec.users.map((user) => `- ${user}`).join("\n")}

## Pages
${pages || "- (none)"}

## Features
${features || "- (none)"}

## Feature Packs
${spec.featurePacks.map((pack) => `- ${pack}`).join("\n") || "- none"}

## Data Model
${entities || "- (none)"}

## Constraints
${spec.constraints.map((constraint) => `- ${constraint}`).join("\n")}

## Assumptions
${spec.assumptions.map((assumption) => `- ${assumption}`).join("\n")}

## Acceptance Checks
${formatAcceptanceChecksMarkdown(spec.acceptanceChecks)}

## Prompt
${spec.rawPrompt}
`;
}

function sectionCard(title: string, body: string): string {
  return `<div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-2xl font-semibold tracking-tight text-slate-950">${title}</h2><p className="mt-3 text-slate-600">${body}</p></div>`;
}

function metricCards(): string {
  return [
    ["Revenue", "$128.4K"],
    ["Active creators", "248"],
    ["Campaigns live", "19"],
    ["Conversion lift", "14%"]
  ]
    .map(
      ([label, value]) =>
        `<div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">${label}</div><div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">${value}</div></div>`
    )
    .join("");
}

function performanceBars(): string {
  return [
    ["UGC", 82],
    ["Affiliate", 64],
    ["Referral", 47],
    ["Live", 73]
  ]
    .map(
      ([label, value]) =>
        `<div className="grid gap-3 md:grid-cols-[96px_1fr_48px] md:items-center"><span className="text-sm font-medium text-slate-700">${label}</span><div className="h-3 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-gradient-to-r from-accent to-cyan-500" style={{ width: "${value}%" }} /></div><span className="text-sm text-slate-500">${value}%</span></div>`
    )
    .join("");
}

function recentActivity(): string {
  return ["New brand campaign approved", "Top creator crossed 1M views", "Weekly settlement batch completed"]
    .map(
      (item, index) =>
        `<div className="flex items-center justify-between gap-4 border-b border-slate-100 py-4 last:border-b-0"><span className="font-medium text-slate-800">${item}</span><span className="text-sm text-slate-500">${index + 1}h ago</span></div>`
    )
    .join("");
}

function appLayout(spec: PromptSpec, label: string): string {
  const routesLiteral = JSON.stringify(spec.routes);
  return `import { NavLink, Outlet } from "react-router-dom";

const specRoutes = ${routesLiteral} as const;
const navClass = "rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:border-accent hover:text-accent";
const activeNavClass = "rounded-full border border-accent bg-accent/10 px-3 py-2 text-sm text-accent transition";

export default function App() {
  return (
    <div className="shell-gradient min-h-screen px-4 py-6 md:px-8">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[32px] border border-white/60 bg-white/85 shadow-shell backdrop-blur">
        <header className="flex flex-col gap-5 border-b border-slate-200 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">${label}</p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-slate-950">${spec.appName}</h1>
            <p className="mt-2 max-w-2xl text-slate-600">${spec.goal}</p>
          </div>
          <nav className="flex flex-wrap gap-2">
            {specRoutes.map((route, index) => (
              <NavLink key={route.path} to={index === 0 ? "/" : route.path} className={({ isActive }) => (isActive ? activeNavClass : navClass)}>
                {route.title}
              </NavLink>
            ))}
          </nav>
        </header>
        <Outlet />
      </div>
    </div>
  );
}
`;
}

function isInternalUiText(value: string): boolean {
  const lower = value.toLowerCase();
  const blockedTerms = [
    "prompt coverage",
    "acceptance check",
    "acceptance checks",
    "execution policy",
    "readme",
    "npm install",
    "npm run dev",
    "npm run build",
    "generated by",
    "verifier",
    "build verification",
    "repair pass",
    "frontend-first delivery"
  ];
  return blockedTerms.some((term) => lower.includes(term));
}

function defaultLandingFeatures(spec: PromptSpec): string[] {
  const lower = spec.rawPrompt.toLowerCase();
  if (lower.includes("marketplace") || lower.includes("company marketplace")) {
    return [
      "Verified company profiles with trust signals",
      "Search and filters by industry, size, and location",
      "Listing board for opportunities and requests",
      "Saved companies and custom alert preferences",
      "Built-in contact flow for faster deal discovery",
      "Admin-ready moderation and review controls"
    ];
  }

  return [
    "Clear value proposition and conversion-focused CTA flow",
    "Responsive design for desktop and mobile visitors",
    "Feature storytelling with visual hierarchy",
    "Social proof and testimonials for trust",
    "Simple pricing tiers with plan selection",
    "Signup capture with form validation"
  ];
}

function buildLandingFeatures(spec: PromptSpec): string[] {
  const candidates = [
    ...spec.mustHave,
    ...spec.features.map((feature) => feature.description),
    ...spec.niceToHave
  ]
    .map((item) => item.replace(/^Prompt coverage:\s*/i, "").trim())
    .filter((item) => item.length >= 8)
    .filter((item) => !isInternalUiText(item));

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const item of candidates) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(toSentenceCase(item));
    if (deduped.length >= 6) break;
  }

  return deduped.length ? deduped : defaultLandingFeatures(spec);
}

function uiHighlights(spec: PromptSpec, count = 2): string[] {
  return buildLandingFeatures(spec)
    .filter((item) => !isInternalUiText(item))
    .slice(0, Math.max(1, count));
}

function inferLandingBrand(spec: PromptSpec): {
  companyName: string;
  locationLabel: string;
  industryLabel: string;
  trustStripTitle: string;
  services: string[];
  featureBullets: string[];
  testimonial: { quote: string; author: string };
  backgroundImages: string[];
} {
  const prompt = spec.rawPrompt;
  const lower = prompt.toLowerCase();
  const calledMatch = prompt.match(/called\s+([A-Za-z0-9&'\- ]{2,60})/i);
  const companyName = calledMatch?.[1]?.trim() || spec.appName || "Your Company";

  const locationMatch = prompt.match(/(?:in|out of)\s+([A-Za-z\s,]{3,80})/i);
  const locationLabel =
    locationMatch?.[1]
      ?.replace(/\s+called[\s\S]*$/i, "")
      .replace(/\s{2,}/g, " ")
      .trim() || "Your Service Area";

  const isLandscaping = /landscap|lawn|yard|garden/i.test(lower);
  const isHawaiian = /hawai|maui|lahaina|oahu|kona/i.test(lower);

  if (isLandscaping) {
    return {
      companyName,
      locationLabel,
      industryLabel: "Landscaping Services",
      trustStripTitle: "Trusted across homes and businesses",
      services: [
        "Landscape design and planning",
        "Tropical planting and irrigation",
        "Lawn maintenance and cleanup",
        "Stonework, borders, and pathways",
        "Seasonal care and property refresh"
      ],
      featureBullets: [
        "Dependable scheduling and on-time crews",
        "Hardworking team with detail-first execution",
        "Island-appropriate plants and materials",
        "Clear communication from quote to completion"
      ],
      testimonial: {
        quote: isHawaiian
          ? "Keahi Landscaping transformed our Lahaina property with care, consistency, and serious attention to detail."
          : "The crew transformed our property with care, consistency, and serious attention to detail.",
        author: "Local Homeowner"
      },
      backgroundImages: [
        "https://images.unsplash.com/photo-1598902014162-4f8df9f15a25?auto=format&fit=crop&w=2000&q=80",
        "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&w=2000&q=80",
        "https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=2000&q=80",
        "https://images.unsplash.com/photo-1470246973918-29a93221c455?auto=format&fit=crop&w=2000&q=80"
      ]
    };
  }

  return {
    companyName,
    locationLabel,
    industryLabel: "Professional Services",
    trustStripTitle: "Trusted by growing teams",
    services: ["Primary service", "Premium service", "Managed support"],
    featureBullets: buildLandingFeatures(spec).slice(0, 4),
    testimonial: {
      quote: "Reliable delivery, clear communication, and a polished client experience.",
      author: "Happy Customer"
    },
    backgroundImages: [
      "https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=2000&q=80",
      "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=2000&q=80"
    ]
  };
}

function routerFile(spec: PromptSpec): string {
  const imports = spec.routes.map((route) => `import ${componentName(route)} from "./pages/${componentName(route)}";`).join("\n");
  const children = spec.routes
    .map((route, index) => {
      if (index === 0) return `{ index: true, element: <${componentName(route)} /> }`;
      return `{ path: "${childPath(route, index)}", element: <${componentName(route)} /> }`;
    })
    .join(",\n      ");

  return `import React from "react";
import { createHashRouter } from "react-router-dom";
import App from "./App";
${imports}

export const router = createHashRouter([
  {
    path: "/",
    element: <App />,
    children: [
      ${children}
    ]
  }
]);
`;
}

function dashboardPage(spec: PromptSpec, route: RouteSpec, index: number): string {
  const key = slug(route.title || route.path);
  if (index === 0 || key.includes("overview")) {
    const highlights = uiHighlights(spec, 2);
    const leadCopy = highlights[0] ?? "Designed for fast, clear operational decisions.";
    const exportButton = hasPack(spec, "export-pack")
      ? `<button className="rounded-2xl border border-white/20 px-5 py-3 text-sm font-semibold text-white" onClick={exportSnapshot}>Export CSV</button>`
      : `<button className="rounded-2xl border border-white/20 px-5 py-3 text-sm font-semibold text-white" onClick={exportSnapshot}>Export snapshot</button>`;
    return `function exportSnapshot() {
  const payload = "campaign,status,conversion\\nSpring Launch,Live,12.4%\\nAffiliate Boost,Review,8.9%\\nCreator Sprint,Done,16.2%\\n";
  const blob = new Blob([payload], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "dashboard-report.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export default function ${componentName(route)}() {
  return (
    <>
      <section className="grid gap-6 px-6 py-8 lg:grid-cols-[1.3fr_0.9fr]">
        <div className="rounded-[28px] border border-slate-200 bg-slate-950 p-8 text-white">
          <div className="inline-flex rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-slate-100">Dashboard shell</div>
          <h2 className="mt-6 max-w-xl text-4xl font-semibold tracking-tight">Operational visibility without runtime drama.</h2>
          <p className="mt-4 max-w-xl text-slate-300">${leadCopy}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white" onClick={() => (window.location.hash = "#/reports")}>Review reports</button>
            ${exportButton}
          </div>
        </div>
        <div className="grid gap-4">${metricCards()}</div>
      </section>
      <section className="grid gap-6 px-6 pb-8 lg:grid-cols-[1.25fr_0.95fr]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Performance breakdown</h2>
          <p className="mt-2 text-sm text-slate-500">A lightweight visual layer shows trend intent without bringing in charting complexity.</p>
          <div className="mt-6 grid gap-4">${performanceBars()}</div>
        </div>
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Recent activity</h2>
          <div className="mt-4">${recentActivity()}</div>
        </div>
      </section>
    </>
  );
}
`;
  }

  if (key.includes("report")) {
    const highlights = uiHighlights(spec, 2);
    const takeaway = highlights[1] ?? highlights[0] ?? "The reporting layout stays clear and easy to scan.";
    const exportAction = hasPack(spec, "export-pack")
      ? `<button className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700" onClick={() => { const payload = "campaign,owner,status,conversion\\nSpring Launch,Ops Team,Live,12.4%\\nAffiliate Boost,Partnerships,Review,8.9%\\nCreator Sprint,Growth,Done,16.2%\\n"; const blob = new Blob([payload], { type: "text/csv;charset=utf-8;" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "reports-export.csv"; link.click(); URL.revokeObjectURL(url); }}>Export CSV</button>`
      : "";
    return `export default function ${componentName(route)}() {
  return (
    <section className="grid gap-6 px-6 py-8 lg:grid-cols-[1.25fr_0.95fr]">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Reports</h2>
        <p className="mt-2 text-sm text-slate-500">${route.purpose ?? "Reporting view"}</p>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-500">Campaign performance table</div>
          ${exportAction}
        </div>
        <div className="mt-4 overflow-hidden rounded-[24px] border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Campaign</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Owner</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Conversion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              <tr><td className="px-4 py-3 text-slate-800">Spring Launch</td><td className="px-4 py-3 text-slate-600">Ops Team</td><td className="px-4 py-3"><span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">Live</span></td><td className="px-4 py-3 text-slate-700">12.4%</td></tr>
              <tr><td className="px-4 py-3 text-slate-800">Affiliate Boost</td><td className="px-4 py-3 text-slate-600">Partnerships</td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Review</span></td><td className="px-4 py-3 text-slate-700">8.9%</td></tr>
              <tr><td className="px-4 py-3 text-slate-800">Creator Sprint</td><td className="px-4 py-3 text-slate-600">Growth</td><td className="px-4 py-3"><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Done</span></td><td className="px-4 py-3 text-slate-700">16.2%</td></tr>
            </tbody>
          </table>
        </div>
        <div className="mt-6 grid gap-4">${performanceBars()}</div>
      </div>
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Summary</h2>
        <div className="mt-4 grid gap-4">
          ${sectionCard("Key takeaway", takeaway)}
          ${sectionCard("Next action", hasPack(spec, "export-pack") ? "Export the current report or drill into the underlying rows." : "Review the trend deltas and share the snapshot with your team.")}
        </div>
      </div>
    </section>
  );
}
`;
  }

  if (key.includes("setting")) {
    return `import { useEffect, useState } from "react";

const SETTINGS_STORAGE_KEY = "settings-storage-key";

export default function ${componentName(route)}() {
  const [teamName, setTeamName] = useState("");
  const [notifications, setNotifications] = useState(true);
  const [autoAssign, setAutoAssign] = useState(false);
  const [dailyDigest, setDailyDigest] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        teamName?: string;
        notifications?: boolean;
        autoAssign?: boolean;
        dailyDigest?: boolean;
      };
      setTeamName(parsed.teamName ?? "");
      setNotifications(parsed.notifications ?? true);
      setAutoAssign(parsed.autoAssign ?? false);
      setDailyDigest(parsed.dailyDigest ?? true);
    } catch {
      // Ignore malformed local data.
    }
  }, []);

  function saveSettings() {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ teamName, notifications, autoAssign, dailyDigest })
    );
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  }

  return (
    <section className="px-6 py-8">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">${route.title}</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Workspace settings</h2>
        <p className="mt-3 text-slate-600">${route.purpose ?? "Manage team preferences and local workspace behavior."}</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-slate-700 md:col-span-2"><span>Team name</span><input className="rounded-2xl border border-slate-200 px-4 py-3 outline-none ring-0 transition focus:border-accent" placeholder="Ops Command" value={teamName} onChange={(event) => setTeamName(event.target.value)} /></label>
          <button className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-4 text-left" onClick={() => setNotifications((value) => !value)}><span className="font-medium text-slate-800">Notifications</span><span className="text-sm text-slate-500">{notifications ? "On" : "Off"}</span></button>
          <button className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-4 text-left" onClick={() => setAutoAssign((value) => !value)}><span className="font-medium text-slate-800">Auto assign</span><span className="text-sm text-slate-500">{autoAssign ? "On" : "Off"}</span></button>
          <button className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-4 text-left md:col-span-2" onClick={() => setDailyDigest((value) => !value)}><span className="font-medium text-slate-800">Daily digest</span><span className="text-sm text-slate-500">{dailyDigest ? "On" : "Off"}</span></button>
        </div>
        <div className="mt-6 flex items-center gap-3">
          <button className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white" onClick={saveSettings}>Save settings</button>
          <span className="text-sm text-slate-500">{saved ? "Saved locally" : "Changes are stored in localStorage."}</span>
        </div>
      </div>
    </section>
  );
}
`;
  }

  return `export default function ${componentName(route)}() {
  return (
    <section className="px-6 py-8">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">${route.title}</h2>
        <p className="mt-2 text-slate-600">${route.purpose ?? "Recent system activity."}</p>
        <div className="mt-4">${recentActivity()}</div>
      </div>
    </section>
  );
}
`;
}

function landingPage(spec: PromptSpec, route: RouteSpec, index: number): string {
  const lowerPrompt = spec.rawPrompt.toLowerCase();
  const isOffroad = /offroad|off-road|trail|dirt bike|dirtbike|atv|4x4|map|weather/.test(lowerPrompt);
  const githubRepoUrl = spec.rawPrompt.match(/https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/i)?.[0];

  if (isOffroad) {
    const offroadName =
      spec.rawPrompt.match(/for\s+([A-Za-z0-9'& -]{3,80})[:.]/i)?.[1]?.trim() ??
      "Offroad Maui Trail Guide";
    return `import { FormEvent, useMemo, useState } from "react";

type Difficulty = "All" | "Easy" | "Moderate" | "Hard";
const TRAILS = [
  { name: "West Ridge Loop", area: "West Maui", difficulty: "Moderate", terrain: "Red dirt + rocky climbs" },
  { name: "Upcountry Switchback", area: "Upcountry", difficulty: "Hard", terrain: "Loose gravel + elevation" },
  { name: "Coastal Access Run", area: "South Maui", difficulty: "Easy", terrain: "Packed dirt + scenic coast" },
  { name: "Rainforest Connector", area: "East Maui", difficulty: "Moderate", terrain: "Mud sections + tree cover" }
] as const;

export default function ${componentName(route)}() {
  const [difficulty, setDifficulty] = useState<Difficulty>("All");
  const [weather, setWeather] = useState({ tempF: 82, windMph: 11, condition: "Partly Cloudy", updatedAt: new Date().toLocaleTimeString() });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState<null | "ok" | "error">(null);
  const filteredTrails = useMemo(() => TRAILS.filter((trail) => (difficulty === "All" ? true : trail.difficulty === difficulty)), [difficulty]);

  function refreshWeather() {
    setWeather({
      tempF: 80 + Math.floor(Math.random() * 7),
      windMph: 8 + Math.floor(Math.random() * 10),
      condition: ["Partly Cloudy", "Sunny", "Trade Winds", "Light Showers"][Math.floor(Math.random() * 4)],
      updatedAt: new Date().toLocaleTimeString()
    });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const validEmail = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email.trim());
    if (!name.trim() || !validEmail) return setSubmitted("error");
    setSubmitted("ok");
  }

  return (
    <div className="min-h-screen bg-zinc-100 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-6xl rounded-[30px] border border-zinc-300 bg-white shadow-shell">
        <header className="border-b border-zinc-200 bg-zinc-900 px-6 py-6 text-white">
          <h1 className="text-4xl font-extrabold tracking-tight">${offroadName}</h1>
          <p className="mt-2 text-zinc-300">Rugged off-road route planning for dirt bikes and 4x4 vehicles.</p>
        </header>
        <section className="grid gap-6 px-6 py-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[26px] border border-zinc-200 bg-zinc-50 p-6">
            <h2 className="text-3xl font-extrabold tracking-tight text-zinc-900">Trail Map Preview</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {(["All", "Easy", "Moderate", "Hard"] as const).map((item) => (
                <button key={item} className={\`rounded-full border px-3 py-2 text-xs font-bold \${difficulty === item ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white text-zinc-700"}\`} onClick={() => setDifficulty(item)}>{item}</button>
              ))}
            </div>
            <div className="mt-4 grid gap-3">
              {filteredTrails.map((trail) => <div key={trail.name} className="rounded-xl border border-zinc-200 bg-white p-4"><strong>{trail.name}</strong><div className="text-sm text-zinc-600">{trail.area} • {trail.terrain}</div></div>)}
            </div>
          </div>
          <div className="rounded-[26px] border border-zinc-200 bg-white p-6">
            <h3 className="text-xl font-extrabold text-zinc-900">Current Maui Weather</h3>
            <button className="mt-2 rounded-xl border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700" onClick={refreshWeather}>Refresh</button>
            <p className="mt-3 text-sm text-zinc-700">{weather.tempF}°F • {weather.windMph} mph • {weather.condition}</p>
            <p className="text-xs text-zinc-500">Updated {weather.updatedAt}</p>
          </div>
        </section>
        <section className="border-t border-zinc-200 px-6 py-8">
          <h2 className="text-2xl font-extrabold text-zinc-900">Contact / Booking</h2>
          <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
            <input className="rounded-xl border border-zinc-300 px-3 py-3" value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" />
            <input className="rounded-xl border border-zinc-300 px-3 py-3" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" />
            <button className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-bold text-white md:justify-self-end" type="submit">Send Request</button>
            <div className="md:col-span-2 text-sm">{submitted === "ok" ? <span className="text-emerald-700">Request saved locally.</span> : null}{submitted === "error" ? <span className="text-rose-700">Please enter a valid name and email.</span> : null}</div>
          </form>
        </section>
      </div>
    </div>
  );
}
`;
  }

  if (githubRepoUrl) {
    const repoShort = githubRepoUrl.replace(/^https?:\/\/github\.com\//i, "");
    const repoPrinciples = spec.assumptions
      .filter((item) => item.startsWith("Repo principle: "))
      .map((item) => item.replace(/^Repo principle:\s*/, ""))
      .slice(0, 6);
    return `import { FormEvent, useState } from "react";
export default function ${componentName(route)}() {
  const [faq, setFaq] = useState<number | null>(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState<null | "ok" | "error">(null);
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const valid = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email.trim());
    if (!name.trim() || !valid) return setSubmitted("error");
    setSubmitted("ok");
  }
  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-6xl rounded-[30px] border border-slate-200 bg-white shadow-shell">
        <header className="border-b border-slate-200 bg-slate-950 px-6 py-6 text-white">
          <h1 className="text-4xl font-extrabold tracking-tight">${spec.appName}</h1>
          <p className="mt-2 text-slate-300">Repository landing for ${repoShort}</p>
        </header>
        <section className="grid gap-6 px-6 py-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div><h2 className="text-3xl font-extrabold text-slate-900">Product Overview</h2><p className="mt-3 text-slate-700">${spec.goal}</p></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5"><p className="text-sm text-slate-600">Screenshot / preview area</p></div>
        </section>
        <section className="border-t border-slate-200 px-6 py-8"><h2 className="text-2xl font-extrabold text-slate-900">Key Features</h2><div className="mt-4 grid gap-3 md:grid-cols-3">{["Overview", "How It Works", "Pricing", "FAQ", "CTA", "Mobile-ready UI"].map((item) => <div key={item} className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-800">{item}</div>)}</div></section>
        <section className="border-t border-slate-200 px-6 py-8"><h2 className="text-2xl font-extrabold text-slate-900">Repository Principles</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{${JSON.stringify(
          repoPrinciples.length ? repoPrinciples : ["Clear onboarding", "Trustworthy UX", "Actionable workflows", "Mobile responsiveness"]
        )}.map((item) => <div key={item} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">{item}</div>)}</div></section>
        <section className="border-t border-slate-200 px-6 py-8"><h2 className="text-2xl font-extrabold text-slate-900">How It Works</h2><ol className="mt-4 list-decimal pl-5 text-sm text-slate-700"><li>Review repository capabilities and positioning.</li><li>Map value proposition to user outcomes.</li><li>Launch with clear conversion-focused sections.</li></ol></section>
        <section className="border-t border-slate-200 px-6 py-8"><h2 className="text-2xl font-extrabold text-slate-900">Pricing / Access</h2><div className="mt-4 grid gap-3 md:grid-cols-3">{["Starter", "Pro", "Team"].map((tier) => <div key={tier} className="rounded-xl border border-slate-200 bg-white p-4"><div className="font-bold text-slate-900">{tier}</div></div>)}</div></section>
        <section className="border-t border-slate-200 px-6 py-8"><h2 className="text-2xl font-extrabold text-slate-900">FAQ</h2>{["Can this be customized?","How fast can we start?","Where is the source code?"].map((q, idx) => <div key={q} className="mt-3 rounded-xl border border-slate-200 bg-white p-4"><button className="flex w-full items-center justify-between text-left font-semibold text-slate-900" onClick={() => setFaq(faq === idx ? null : idx)}><span>{q}</span><span>{faq === idx ? "−" : "+"}</span></button>{faq === idx ? <p className="mt-2 text-sm text-slate-700">{idx === 2 ? "${githubRepoUrl}" : "Yes, this landing structure is designed for quick adaptation."}</p> : null}</div>)}</section>
        <section className="border-t border-slate-200 px-6 py-8"><h2 className="text-2xl font-extrabold text-slate-900">Get Access</h2><form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onSubmit}><input className="rounded-xl border border-slate-300 px-3 py-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" /><input className="rounded-xl border border-slate-300 px-3 py-3" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" /><button className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white md:justify-self-end" type="submit">Request Access</button><div className="md:col-span-2 text-sm">{submitted === "ok" ? <span className="text-emerald-700">Request saved locally.</span> : null}{submitted === "error" ? <span className="text-rose-700">Please enter a valid name and email.</span> : null}</div></form></section>
      </div>
    </div>
  );
}
`;
  }

  const brand = inferLandingBrand(spec);
  const landingFeatures = buildLandingFeatures(spec).slice(0, 6);
  return `import { FormEvent, useMemo, useState } from "react";

const FEATURES = ${JSON.stringify(landingFeatures)} as const;

export default function ${componentName(route)}() {
  const [modalOpen, setModalOpen] = useState(false);
  const [plan, setPlan] = useState<"Starter" | "Pro" | "Team">("Pro");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState<null | "ok" | "error">(null);
  const plans = useMemo(() => ["Starter", "Pro", "Team"] as const, []);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const validEmail = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email.trim());
    if (!name.trim() || !validEmail) return setSubmitted("error");
    setSubmitted("ok");
    setModalOpen(false);
  }

  return (
    <section className="px-6 py-8" id="top">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <nav className="mb-6 flex flex-wrap gap-2">
          <a className="rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-700" href="#features">Features</a>
          <a className="rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-700" href="#pricing">Pricing</a>
          <a className="rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-700" href="#signup">Signup</a>
        </nav>
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-950">${brand.companyName}</h1>
        <p className="mt-3 text-slate-700">${spec.goal}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white" href="#signup">Get started</a>
          <button className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-800" onClick={() => setModalOpen(true)}>Choose plan</button>
        </div>
      </div>

      <div className="mt-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm" id="features">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Features</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {FEATURES.map((feature) => (
            <div key={feature} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">{feature}</div>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm" id="pricing">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Pricing</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {plans.map((tier) => (
            <button key={tier} className={\`rounded-xl border p-4 text-left \${plan === tier ? "border-accent bg-accent/5" : "border-slate-200 bg-white"}\`} onClick={() => { setPlan(tier); setModalOpen(true); }}>
              <div className="text-lg font-semibold text-slate-900">{tier}</div>
              <div className="text-sm text-slate-600">{tier === "Starter" ? "$19/mo" : tier === "Pro" ? "$49/mo" : "$99/mo"}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm" id="signup">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Signup</h2>
        <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
          <input className="rounded-xl border border-slate-300 px-3 py-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <input className="rounded-xl border border-slate-300 px-3 py-3" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <button className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white md:justify-self-end" type="submit">Start trial</button>
          <div className="md:col-span-2 text-sm">{submitted === "ok" ? <span className="text-emerald-700">Signup captured for {plan}.</span> : null}{submitted === "error" ? <span className="text-rose-700">Please enter a valid name and email.</span> : null}</div>
        </form>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-30 grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-xl font-semibold text-slate-900">Plan selected: {plan}</h3>
            <p className="mt-2 text-sm text-slate-600">Complete signup to continue with the {plan} plan.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm" onClick={() => setModalOpen(false)}>Close</button>
              <a className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white" href="#signup" onClick={() => setModalOpen(false)}>Go to signup</a>
            </div>
          </div>
        </div>
      ) : null}
      
      <div className="mt-5 text-center">
        <a className="text-sm text-slate-500 hover:text-slate-700" href="#top">Back to top</a>
      </div>
    </section>
  );
}
`;
}

function crudControls(spec: PromptSpec): string {
  if (!hasPack(spec, "table-pack")) return "";
  const exportAction = hasPack(spec, "export-pack")
    ? `<button className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700" onClick={exportCsv}>Export CSV</button>`
    : "";
  return `<div className="mt-5 flex flex-wrap gap-3"><input className="min-w-[220px] rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-0 transition focus:border-accent" placeholder="Search records" value={query} onChange={(event) => setQuery(event.target.value)} /><select className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-0 transition focus:border-accent" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All statuses</option><option>Active</option><option>Review</option><option>Done</option></select>${exportAction}</div>`;
}

function crudPage(spec: PromptSpec, route: RouteSpec, index: number): string {
  const entity = spec.entities[0]?.name ?? "Item";
  const key = slug(route.title || route.path);

  if (index === 0 || key.includes("overview")) {
    return `export default function ${componentName(route)}() {
  return (
    <section className="grid gap-6 px-6 py-8 md:grid-cols-3">
      <div className="rounded-[28px] border border-slate-200 bg-slate-950 p-6 text-white shadow-sm md:col-span-2">
        <h2 className="text-3xl font-semibold tracking-tight">Local-first ${entity.toLowerCase()} management.</h2>
        <p className="mt-3 max-w-2xl text-slate-300">${spec.goal}</p>
      </div>
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-950">Workflow summary</h3>
        <ul className="mt-4 space-y-2 text-sm text-slate-600">
          <li>Create and review ${entity.toLowerCase()} records quickly.</li>
          <li>Keep statuses visible for fast triage.</li>
          <li>${hasPack(spec, "persistence-pack") ? "Changes are saved locally for repeat visits." : "The flow is ready for API-backed persistence later."}</li>
        </ul>
      </div>
    </section>
  );
}
`;
  }

  const storageEffects = hasPack(spec, "persistence-pack")
    ? `  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) setItems(JSON.parse(saved) as RecordItem[]);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);
`
    : "";

  if (key.includes("manage") || key.includes("item")) {
    return `import { FormEvent, useEffect, useState } from "react";

type RecordItem = {
  id: string;
  name: string;
  owner: string;
  status: string;
};

const STORAGE_KEY = "${entity.toLowerCase()}-records";

export default function ${componentName(route)}() {
  const [items, setItems] = useState<RecordItem[]>([]);
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [status, setStatus] = useState("Active");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
${storageEffects}
  const filteredItems = items.filter((item) => {
    const queryMatch = query.trim()
      ? item.name.toLowerCase().includes(query.toLowerCase()) || item.owner.toLowerCase().includes(query.toLowerCase())
      : true;
    const statusMatch = statusFilter === "All statuses" ? true : item.status === statusFilter;
    return queryMatch && statusMatch;
  });

  function exportCsv() {
    const rows = [["id", "name", "owner", "status"], ...filteredItems.map((item) => [item.id, item.name, item.owner, item.status])];
    const csv = rows.map((row) => row.map((value) => String(value).replaceAll('"', '""')).map((value) => \`"\${value}"\`).join(",")).join("\\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "${entity.toLowerCase()}-records.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setItems((current) => [{ id: crypto.randomUUID(), name: name.trim(), owner: owner.trim() || "Unassigned", status }, ...current]);
    setName("");
    setOwner("");
    setStatus("Active");
  }

  return (
    <section className="grid gap-6 px-6 py-8 lg:grid-cols-[0.95fr_1.05fr]">
      <form className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm" onSubmit={onSubmit}>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Create ${entity}</h2>
        <div className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm font-medium text-slate-700"><span>Name</span><input className="rounded-2xl border border-slate-200 px-4 py-3 outline-none ring-0 transition focus:border-accent" value={name} onChange={(event) => setName(event.target.value)} placeholder="Add a record title" /></label>
          <label className="grid gap-2 text-sm font-medium text-slate-700"><span>Owner</span><input className="rounded-2xl border border-slate-200 px-4 py-3 outline-none ring-0 transition focus:border-accent" value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="Assign an owner" /></label>
          <label className="grid gap-2 text-sm font-medium text-slate-700"><span>Status</span><select className="rounded-2xl border border-slate-200 px-4 py-3 outline-none ring-0 transition focus:border-accent" value={status} onChange={(event) => setStatus(event.target.value)}><option>Active</option><option>Review</option><option>Done</option></select></label>
          <button className="mt-2 rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white" type="submit">Save ${entity}</button>
        </div>
      </form>
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Queue</h2>
          ${hasPack(spec, "persistence-pack") ? `<span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-accent">Saved locally</span>` : `<span />`}
        </div>
        ${crudControls(spec)}
        <div className="mt-5 grid gap-3">
          {filteredItems.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No matching records. Adjust search or add a new item.</div> : filteredItems.map((item) => <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 px-4 py-4" key={item.id}><div><div className="font-medium text-slate-900">{item.name}</div><div className="mt-1 text-sm text-slate-500">{item.owner}</div></div><span className="rounded-full bg-accent/10 px-3 py-1 text-sm font-semibold text-accent">{item.status}</span></div>)}
        </div>
      </div>
    </section>
  );
}
`;
  }

  return `export default function ${componentName(route)}() {
  function clearStorage() {
    window.localStorage.removeItem("${entity.toLowerCase()}-records");
    window.location.reload();
  }

  return (
    <section className="px-6 py-8">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">${route.title}</h2>
        <p className="mt-2 text-slate-600">${route.purpose ?? "Reset the local dataset or describe external settings mapping."}</p>
        <button className="mt-6 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white" onClick={clearStorage}>Clear saved records</button>
      </div>
    </section>
  );
}
`;
}

function vizPage(spec: PromptSpec, route: RouteSpec, index: number): string {
  const key = slug(route.title || route.path);
  if (index === 0 || key.includes("overview")) {
    return `import { useMemo, useState } from "react";

const DATASETS: Record<string, Array<{ label: string; value: number }>> = {
  weekly: [{ label: "Mon", value: 42 }, { label: "Tue", value: 61 }, { label: "Wed", value: 58 }, { label: "Thu", value: 74 }, { label: "Fri", value: 86 }],
  monthly: [{ label: "W1", value: 38 }, { label: "W2", value: 67 }, { label: "W3", value: 54 }, { label: "W4", value: 79 }],
  quarterly: [{ label: "Q1", value: 56 }, { label: "Q2", value: 72 }, { label: "Q3", value: 65 }, { label: "Q4", value: 88 }]
};

export default function ${componentName(route)}() {
  const [range, setRange] = useState<"weekly" | "monthly" | "quarterly">("weekly");
  const data = useMemo(() => DATASETS[range], [range]);

  function exportCsv() {
    const csv = ["label,value", ...data.map((row) => \`\${row.label},\${row.value}\`)].join("\\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = \`trend-\${range}.csv\`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="px-6 py-8">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Weekly trend</h2>
        <p className="mt-2 text-sm text-slate-500">${route.purpose ?? "Visualization view"}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["weekly", "monthly", "quarterly"] as const).map((option) => (
            <button
              key={option}
              className={\`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition \${range === option ? "border-accent bg-accent/10 text-accent" : "border-slate-200 text-slate-600 hover:border-accent hover:text-accent"}\`}
              onClick={() => setRange(option)}
            >
              {option}
            </button>
          ))}
          <button className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 transition hover:border-accent hover:text-accent" onClick={exportCsv}>
            Export CSV
          </button>
        </div>
        <div className="mt-6 grid gap-4">
          {data.map((point) => <div className="grid gap-3 md:grid-cols-[96px_1fr_48px] md:items-center" key={point.label}><span className="text-sm font-medium text-slate-700">{point.label}</span><div className="h-3 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-gradient-to-r from-accent to-cyan-500" style={{ width: point.value + "%" }} /></div><span className="text-sm text-slate-500">{point.value}</span></div>)}
        </div>
      </div>
    </section>
  );
}
`;
  }

  return `export default function ${componentName(route)}() {
  return (
    <section className="grid gap-6 px-6 py-8 md:grid-cols-2">
      ${sectionCard(route.title, route.purpose ?? "Additional insight surface for the requested visualization.")}
      ${sectionCard("Insights", "Keep the visual layer lightweight so the trend stays readable on desktop and mobile.")}
    </section>
  );
}
`;
}

function docsPage(route: RouteSpec, index: number): string {
  if (index === 0) {
    return `import { useMemo, useState } from "react";

const sections = ["Getting Started", "API Basics", "Best Practices", "Troubleshooting"];

export default function ${componentName(route)}() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeSection, setActiveSection] = useState("Getting Started");
  const filteredSections = useMemo(
    () => sections.filter((section) => section.toLowerCase().includes(searchTerm.toLowerCase())),
    [searchTerm]
  );

  return (
    <section className="grid gap-6 px-6 py-8 lg:grid-cols-[280px_1fr]">
      <aside className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold tracking-tight text-slate-950">Docs Index</h2>
        <input className="mt-4 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none ring-0 transition focus:border-accent" placeholder="Search docs" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
        <div className="mt-4 grid gap-2">
          {filteredSections.map((section) => (
            <button key={section} onClick={() => setActiveSection(section)} className={\`rounded-2xl border px-4 py-3 text-left text-sm font-medium transition \${activeSection === section ? "border-accent bg-accent/5 text-accent" : "border-slate-200 text-slate-700 hover:border-accent hover:text-accent"}\`}>
              {section}
            </button>
          ))}
          {filteredSections.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500">No docs matched your search.</div> : null}
        </div>
      </aside>
      <article className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">Documentation</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">{activeSection}</h1>
        <p className="mt-4 text-slate-600">This layout gives the prompt a docs-ready structure with navigation, article hierarchy, and a simple search surface without extra dependencies.</p>
      </article>
    </section>
  );
}
`;
  }

  return `export default function ${componentName(route)}() {
  return (
    <section className="px-6 py-8">
      <article className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">${route.title}</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">${route.title}</h2>
        <p className="mt-4 text-slate-600">${route.purpose ?? "Structured article content for the generated docs surface."}</p>
        <div className="mt-6 space-y-4 text-slate-700">
          <p>Use this page as the anchor for markdown-like content, API notes, or FAQs requested by the prompt.</p>
          <p>It is intentionally lightweight so the docs experience remains reliable when packaged as a static project.</p>
        </div>
      </article>
    </section>
  );
}
`;
}

function formPage(spec: PromptSpec, route: RouteSpec, index: number): string {
  const settingsRoute = slug(route.title || route.path).includes("setting");

  if (index === 0 && !settingsRoute) {
    const statusCopy = hasPack(spec, "auth-stub-pack")
      ? `{signedIn ? "Signed in locally. Settings pages can now show gated content." : "Submit the form to create a local session token."}`
      : `{"Submit the form to continue."}`;
    return `import { useState } from "react";

export default function ${componentName(route)}() {
  const [email, setEmail] = useState("");
  const [signedIn, setSignedIn] = useState(false);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    window.localStorage.setItem("agent-session-email", email.trim());
    setSignedIn(true);
  }

  return (
    <section className="grid gap-6 px-6 py-8 lg:grid-cols-[0.95fr_1.05fr]">
      <form className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm" onSubmit={onSubmit}>
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">Sign in</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Access your workspace</h2>
        <p className="mt-3 text-slate-600">${spec.goal}</p>
        <label className="mt-6 grid gap-2 text-sm font-medium text-slate-700">
          <span>Email</span>
          <input className="rounded-2xl border border-slate-200 px-4 py-3 outline-none ring-0 transition focus:border-accent" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
        </label>
        <button className="mt-5 rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white" type="submit">Sign in</button>
      </form>
      <div className="rounded-[28px] border border-slate-200 bg-slate-950 p-8 text-white shadow-sm">
        <h3 className="text-2xl font-semibold tracking-tight">Workspace status</h3>
        <p className="mt-3 text-slate-300">${statusCopy}</p>
      </div>
    </section>
  );
}
`;
  }

  return `import { useEffect, useState } from "react";

const SETTINGS_STORAGE_KEY = "settings-storage-key";

export default function ${componentName(route)}() {
  const [displayName, setDisplayName] = useState("");
  const [notifications, setNotifications] = useState("Enabled");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { displayName?: string; notifications?: string };
      setDisplayName(parsed.displayName ?? "");
      setNotifications(parsed.notifications ?? "Enabled");
    } catch {
      // Ignore malformed local data.
    }
  }, []);

  function saveSettings() {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ displayName, notifications }));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  }

  return (
    <section className="px-6 py-8">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">${route.title}</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">${route.title}</h2>
        <p className="mt-3 text-slate-600">${route.purpose ?? "Preference management surface."}</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-slate-700"><span>Display name</span><input className="rounded-2xl border border-slate-200 px-4 py-3 outline-none ring-0 transition focus:border-accent" placeholder="Agent Operator" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
          <label className="grid gap-2 text-sm font-medium text-slate-700"><span>Notifications</span><select className="rounded-2xl border border-slate-200 px-4 py-3 outline-none ring-0 transition focus:border-accent" value={notifications} onChange={(event) => setNotifications(event.target.value)}><option>Enabled</option><option>Muted</option></select></label>
        </div>
        <div className="mt-6 flex items-center gap-3">
          <button className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white" onClick={saveSettings}>Save settings</button>
          <span className="text-sm text-slate-500">{saved ? "Saved locally" : "Changes are stored in your browser."}</span>
        </div>
      </div>
    </section>
  );
}
`;
}

function gamePage(spec: PromptSpec): string {
  return `import { useEffect, useMemo, useRef, useState } from "react";

type Asteroid = { id: number; x: number; y: number; speed: number };

const WIDTH = 540;
const HEIGHT = 520;
const PLAYER_SIZE = 36;
const ASTEROID_SIZE = 28;

export default function App() {
  const [playerX, setPlayerX] = useState(WIDTH / 2 - PLAYER_SIZE / 2);
  const [asteroids, setAsteroids] = useState<Asteroid[]>([]);
  const [score, setScore] = useState(0);
  const [running, setRunning] = useState(true);
  const [leftPressed, setLeftPressed] = useState(false);
  const [rightPressed, setRightPressed] = useState(false);
  const nextId = useRef(1);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") setLeftPressed(true);
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") setRightPressed(true);
      if (event.key === "r" && !running) restartGame();
    }

    function onKeyUp(event: KeyboardEvent) {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") setLeftPressed(false);
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") setRightPressed(false);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [running]);

  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => {
      setAsteroids((current) => {
        const advanced = current
          .map((asteroid) => ({ ...asteroid, y: asteroid.y + asteroid.speed }))
          .filter((asteroid) => asteroid.y < HEIGHT + ASTEROID_SIZE);

        if (Math.random() < 0.5) {
          advanced.push({
            id: nextId.current++,
            x: Math.floor(Math.random() * (WIDTH - ASTEROID_SIZE)),
            y: -ASTEROID_SIZE,
            speed: 3 + Math.random() * 3
          });
        }

        return advanced;
      });
      setScore((value) => value + 1);
    }, 60);

    return () => window.clearInterval(interval);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    const frame = window.setInterval(() => {
      setPlayerX((current) => {
        const delta = (leftPressed ? -8 : 0) + (rightPressed ? 8 : 0);
        return Math.max(0, Math.min(WIDTH - PLAYER_SIZE, current + delta));
      });
    }, 16);
    return () => window.clearInterval(frame);
  }, [leftPressed, rightPressed, running]);

  const collided = useMemo(() => {
    return asteroids.some((asteroid) => {
      const playerY = HEIGHT - PLAYER_SIZE - 16;
      const overlapX = asteroid.x < playerX + PLAYER_SIZE && asteroid.x + ASTEROID_SIZE > playerX;
      const overlapY = asteroid.y < playerY + PLAYER_SIZE && asteroid.y + ASTEROID_SIZE > playerY;
      return overlapX && overlapY;
    });
  }, [asteroids, playerX]);

  useEffect(() => {
    if (collided) setRunning(false);
  }, [collided]);

  function restartGame() {
    setPlayerX(WIDTH / 2 - PLAYER_SIZE / 2);
    setAsteroids([]);
    setScore(0);
    setRunning(true);
  }

  return (
    <div className="shell-gradient min-h-screen px-4 py-6 md:px-8">
      <div className="mx-auto max-w-4xl overflow-hidden rounded-[32px] border border-white/60 bg-white/85 p-6 shadow-shell backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">Game Template</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">${spec.appName}</h1>
            <p className="mt-2 text-slate-600">${spec.goal}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
            Score: <span className="font-semibold text-slate-950">{score}</span>
          </div>
        </div>

        <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-950 p-3">
          <div className="relative overflow-hidden rounded-[18px] border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-800" style={{ width: WIDTH, height: HEIGHT }}>
            {asteroids.map((asteroid) => (
              <div
                key={asteroid.id}
                className="absolute rounded-full bg-gradient-to-br from-slate-200 to-slate-400 shadow"
                style={{ width: ASTEROID_SIZE, height: ASTEROID_SIZE, left: asteroid.x, top: asteroid.y }}
              />
            ))}
            <div
              className="absolute rounded-md border border-cyan-200 bg-cyan-400"
              style={{ width: PLAYER_SIZE, height: PLAYER_SIZE, left: playerX, top: HEIGHT - PLAYER_SIZE - 16 }}
            />
            {!running ? (
              <div className="absolute inset-0 grid place-items-center bg-slate-950/60">
                <div className="rounded-2xl border border-white/20 bg-slate-900/80 px-6 py-5 text-center">
                  <h2 className="text-2xl font-semibold text-white">Game over</h2>
                  <p className="mt-2 text-sm text-slate-300">Final score: {score}</p>
                  <button className="mt-4 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white" onClick={restartGame}>
                    Restart
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1">Keyboard: Left / Right or A / D</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1">Restart: R or button</span>
        </div>
      </div>
    </div>
  );
}
`;
}

function storyPage(spec: PromptSpec): string {
  return `import { useMemo, useState } from "react";

type StoryNode = {
  id: string;
  text: string;
  choices?: Array<{ label: string; next: string }>;
  ending?: string;
};

const STORY_MAP: Record<string, StoryNode> = {
  start: {
    id: "start",
    text: "You wake up in a city where dreams are traded like currency. A sealed envelope sits on your desk.",
    choices: [
      { label: "Open the envelope", next: "open-envelope" },
      { label: "Ignore it and leave", next: "leave-home" }
    ]
  },
  "open-envelope": {
    id: "open-envelope",
    text: "Inside is a map to a silent theater. The map glows when you hold it near your chest.",
    choices: [
      { label: "Follow the map to the theater", next: "theater" },
      { label: "Burn the map", next: "burn-map" }
    ]
  },
  "leave-home": {
    id: "leave-home",
    text: "You step into the rain. A stranger offers you an umbrella and asks for your true name.",
    choices: [
      { label: "Tell the stranger your name", next: "trust-stranger" },
      { label: "Run away", next: "run-away" }
    ]
  },
  theater: {
    id: "theater",
    text: "The stage lights turn on by themselves. A voice invites you to rewrite one memory.",
    choices: [
      { label: "Rewrite your happiest memory", next: "ending-bright" },
      { label: "Rewrite your biggest regret", next: "ending-shadow" }
    ]
  },
  "burn-map": {
    id: "burn-map",
    text: "The ash forms a door in the air. You can walk through or watch it close.",
    choices: [
      { label: "Walk through", next: "ending-wild" },
      { label: "Let it close", next: "ending-quiet" }
    ]
  },
  "trust-stranger": {
    id: "trust-stranger",
    text: "The stranger smiles and hands you a key made of glass.",
    ending: "Ending: The Glass Door. You unlock a future that remembers your kindness."
  },
  "run-away": {
    id: "run-away",
    text: "You lose the stranger in the fog and return home to find the envelope back on your desk.",
    ending: "Ending: The Loop. Some stories repeat until you choose differently."
  },
  "ending-bright": {
    id: "ending-bright",
    text: "The stage becomes sunlight. People you forgot begin to laugh again.",
    ending: "Ending: Daybreak. Hope spreads beyond your own dream."
  },
  "ending-shadow": {
    id: "ending-shadow",
    text: "The lights dim, but your chest feels lighter than ever.",
    ending: "Ending: Honest Night. Healing begins where truth is spoken."
  },
  "ending-wild": {
    id: "ending-wild",
    text: "You fall into a sky full of doors and choose one without fear.",
    ending: "Ending: Skybound. Curiosity becomes your compass."
  },
  "ending-quiet": {
    id: "ending-quiet",
    text: "The room settles. You make tea and write your own map instead.",
    ending: "Ending: Quiet Architect. You build meaning slowly, on purpose."
  }
};

export default function App() {
  const [storyState, setStoryState] = useState("start");
  const [path, setPath] = useState<string[]>(["start"]);
  const node = STORY_MAP[storyState];
  const isEnding = Boolean(node.ending);
  const trail = useMemo(() => path.map((id) => STORY_MAP[id]?.id ?? id).join(" -> "), [path]);

  function pickChoice(next: string) {
    setStoryState(next);
    setPath((current) => [...current, next]);
  }

  function restartStory() {
    setStoryState("start");
    setPath(["start"]);
  }

  return (
    <div className="shell-gradient min-h-screen px-4 py-6 md:px-8">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-[32px] border border-white/60 bg-white/85 p-6 shadow-shell backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">Story Template</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">${spec.appName}</h1>
        <p className="mt-2 text-slate-600">${spec.goal}</p>

        <section className="mt-6 rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-lg leading-8 text-slate-800">{node.text}</p>

          {isEnding ? (
            <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm font-medium text-slate-800">
              {node.ending}
            </div>
          ) : null}

          <div className="mt-6 grid gap-3">
            {node.choices?.map((choice) => (
              <button
                key={choice.label}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-medium text-slate-800 transition hover:border-accent hover:bg-accent/5"
                onClick={() => pickChoice(choice.next)}
              >
                {choice.label}
              </button>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500">story state: {storyState}</span>
            <button className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700" onClick={restartStory}>
              Restart story
            </button>
          </div>
        </section>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
          Path trail: {trail}
        </div>
      </div>
    </div>
  );
}
`;
}

function fallbackApp(spec: PromptSpec): string {
  return `function exportMockLog() {
  const payload = "time,status\\njust now,simulated sync complete\\n";
  const blob = new Blob([payload], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "integration-log.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  return (
    <div className="shell-gradient min-h-screen px-4 py-6 md:px-8">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[32px] border border-white/60 bg-white/85 shadow-shell backdrop-blur">
        <header className="border-b border-slate-200 px-6 py-6">
          <div className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">Project Overview</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">${spec.appName}</h1>
        </header>
        <section className="grid gap-6 px-6 py-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Prompt</h2>
            <p className="mt-4 text-slate-600">${spec.rawPrompt}</p>
          </div>
          <div className="rounded-[28px] border border-slate-200 bg-slate-950 p-6 text-white">
            <h2 className="text-2xl font-semibold tracking-tight">Delivery Notes</h2>
            <p className="mt-4 text-slate-300">This UI ships with real interactions and a safe mock integration layer so the app remains runnable while external services are pending.</p>
          </div>
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Integration Center</h2>
            <p className="mt-3 text-slate-600">
              Backend and automation asks are represented as mock API endpoints and integration status tiles so the UI remains runnable and demo-ready.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {[
                ["Mock API", "POST /api/tasks/simulate"],
                ["Sync Status", "Last sync: just now (simulated)"],
                ["Storage", "Local browser state, backend-ready contract"]
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</div>
                  <div className="mt-2 text-sm font-medium text-slate-800">{value}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white" onClick={() => window.alert("Simulated sync complete")}>Run simulated sync</button>
              <button className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800" onClick={exportMockLog}>Export mock log</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
`;
}

function pageSource(spec: PromptSpec, route: RouteSpec, index: number): string {
  switch (spec.appType) {
    case "dashboard":
      return dashboardPage(spec, route, index);
    case "landing":
      return landingPage(spec, route, index);
    case "crud":
      return crudPage(spec, route, index);
    case "viz":
      return vizPage(spec, route, index);
    case "docs":
      return docsPage(route, index);
    case "form":
      return formPage(spec, route, index);
    case "game":
      return gamePage(spec);
    case "story":
      return storyPage(spec);
    default:
      return `export default function ${componentName(route)}() { return <section className="px-6 py-8"><div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-2xl font-semibold tracking-tight text-slate-950">${route.title}</h2><p className="mt-3 text-slate-600">${route.purpose ?? "Generated surface for this route."}</p></div></section>; }\n`;
  }
}

function routeFiles(spec: PromptSpec): GeneratedFile[] {
  const shellLabel =
    spec.appType === "dashboard"
      ? "Operations Hub"
      : spec.appType === "crud"
        ? "Management Console"
        : spec.appType === "viz"
          ? "Insights Workspace"
          : spec.appType === "docs"
            ? "Knowledge Base"
            : spec.appType === "form"
              ? "Account Workspace"
              : "Product Experience";

  return [
    { path: "src/App.tsx", content: appLayout(spec, shellLabel) },
    { path: "src/routes.tsx", content: routerFile(spec) },
    ...spec.routes.map((route, index) => ({
      path: `src/pages/${componentName(route)}.tsx`,
      content: pageSource(spec, route, index)
    }))
  ];
}

function singlePageApp(spec: PromptSpec): string {
  switch (spec.appType) {
    case "landing":
      return landingPage(spec, spec.routes[0], 0);
    case "dashboard":
      return dashboardPage(spec, spec.routes[0], 0);
    case "crud":
      return crudPage(spec, spec.routes[0], 0);
    case "viz":
      return vizPage(spec, spec.routes[0], 0);
    case "docs":
      return docsPage(spec.routes[0], 0);
    case "form":
      return formPage(spec, spec.routes[0], 0);
    case "game":
      return gamePage(spec);
    case "story":
      return storyPage(spec);
    case "fallback":
    default:
      return fallbackApp(spec);
  }
}

function baseFiles(spec: PromptSpec, templateLabel: string): GeneratedFile[] {
  const files: GeneratedFile[] = [
    { path: "package.json", content: appPackageJson(spec) },
    { path: "package-lock.json", content: appPackageLock(spec) },
    { path: "tsconfig.json", content: appTsconfig() },
    { path: "vite.config.ts", content: viteConfig() },
    { path: "tailwind.config.ts", content: tailwindConfig(spec) },
    { path: "postcss.config.cjs", content: postcssConfig() },
    { path: "index.html", content: indexHtml(spec.appName) },
    { path: "README.md", content: readme(spec, templateLabel) },
    { path: "SPEC.md", content: specMarkdown(spec) },
    { path: "src/main.tsx", content: mainTsx(spec) },
    { path: "src/index.css", content: indexCss() }
  ];

  if (usesRouter(spec)) {
    return mergeFiles(files, routeFiles(spec));
  }

  return mergeFiles(files, [{ path: "src/App.tsx", content: singlePageApp(spec) }]);
}

function contentPackReadme(spec: PromptSpec): string {
  return `# ${spec.appName}

Generated as a content-pack deliverable for Seedstr.

## Prompt

${spec.rawPrompt}

## Included Files

- \`deliverables/01_main.md\` - primary requested output
- \`deliverables/02_variants.md\` - alternates for testing/selection
- \`deliverables/03_checklist.md\` - usage checklist before sending/publishing
- \`deliverables/04_summary.txt\` - short submission-ready summary

## Usage

1. Read \`01_main.md\` first.
2. Pick or remix variants from \`02_variants.md\`.
3. Run through \`03_checklist.md\` before final use.
4. Use \`04_summary.txt\` as a quick submission blurb.
`;
}

function contentPackSpec(spec: PromptSpec): string {
  return `# SPEC: ${spec.appName}

## Deliverable Type
Content Pack (Markdown files inside \`deliverables/\`)

## Goal
${spec.goal}

## Built
- Primary deliverable file
- Variant set file
- Usage checklist file

## Assumptions
${spec.assumptions.map((assumption) => `- ${assumption}`).join("\n") || "- None"}

## Acceptance Checks
${formatAcceptanceChecksMarkdown(spec.acceptanceChecks)}
`;
}

function extractQuotedOrTitledName(prompt: string): string | null {
  const m1 = prompt.match(/called\s+([A-Z][\w\s:-]{2,60})/i);
  if (m1?.[1]) return m1[1].trim();

  const m2 = prompt.match(/named\s+([A-Z][\w\s:-]{2,60})/i);
  if (m2?.[1]) return m2[1].trim();

  const m3 = prompt.match(/["“]([^"”]{2,60})["”]/);
  if (m3?.[1]) return m3[1].trim();

  return null;
}

function extractNftCollectionName(prompt: string): string {
  const m = prompt.match(/nft\s+collection\s+called\s+([A-Z][\w\s-]{2,40})/i);
  const name = m?.[1]?.trim() ?? extractQuotedOrTitledName(prompt) ?? "Cosmic Collection";
  return name.replace(/\s+/g, " ").trim();
}

function extractProductName(prompt: string): string | null {
  const m = prompt.match(/product\s+called\s+([A-Z][\w\s-]{2,60})/i);
  return (m?.[1] ?? extractQuotedOrTitledName(prompt) ?? null)?.replace(/\s+/g, " ").trim() ?? null;
}

function extractPitchDeckTopic(prompt: string): string {
  const m = prompt.match(/pitch\s+deck\s+outline\s+for\s+(.*)$/i);
  const topic = m?.[1]?.trim();
  if (!topic) return "a startup";
  return topic.replace(/[.]\s*$/g, "").trim();
}

function toTitle(s: string): string {
  const cleaned = s.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Deliverable";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function contentPackMain(spec: PromptSpec): string {
  const assistedMain = spec.llmAssist?.main?.trim();
  if (assistedMain) return `${assistedMain}\n`;

  const raw = spec.rawPrompt.trim();
  const lower = raw.toLowerCase();

  const lookupNotes = spec.assumptions
    .filter((a) => a.startsWith("Lookup: "))
    .map((a) => a.replace(/^Lookup:\s*/, "").trim())
    .filter(Boolean);

  const retrievedAt =
    spec.assumptions
      .find((a) => a.startsWith("Lookup retrieved at:"))
      ?.replace(/^Lookup retrieved at:\s*/, "")
      .trim() ?? "N/A";

  if (lower.includes("market analysis") || lower.includes("competitive advantages") || lower.includes("market size")) {
    const lookupSection = lookupNotes.length
      ? lookupNotes.map((n) => `- ${n}`).join("\n")
      : "- No live lookup data was available at generation time.";
    const isCodingAssistants =
      lower.includes("coding assistant") || lower.includes("code assistant") || lower.includes("developer assistant");
    const topFive = isCodingAssistants
      ? [
          {
            name: "GitHub Copilot",
            bestFor: "IDE pair programming",
            edge: "Ecosystem + IDE integration",
            weakness: "Policy/IP concerns in some orgs",
            risk: "Procurement/security blocks"
          },
          {
            name: "Cursor",
            bestFor: "Agentic IDE workflows",
            edge: "Fast UX for edits/refactors",
            weakness: "Tool/vendor coupling",
            risk: "Fast-moving dependencies"
          },
          {
            name: "ChatGPT (coding)",
            bestFor: "General coding help + explanations",
            edge: "Breadth + reasoning",
            weakness: "Context/tooling integration varies",
            risk: "Inconsistent reproducibility"
          },
          {
            name: "Anthropic Claude (coding)",
            bestFor: "Long-context code reasoning",
            edge: "Strong refactor/analysis",
            weakness: "IDE integration varies",
            risk: "Workflow integration gaps"
          },
          {
            name: "Amazon CodeWhisperer",
            bestFor: "AWS-leaning teams",
            edge: "AWS ecosystem fit",
            weakness: "Less flexible outside stack",
            risk: "Adoption limited to AWS orgs"
          }
        ]
      : [
          { name: "#1", bestFor: "", edge: "", weakness: "", risk: "" },
          { name: "#2", bestFor: "", edge: "", weakness: "", risk: "" },
          { name: "#3", bestFor: "", edge: "", weakness: "", risk: "" },
          { name: "#4", bestFor: "", edge: "", weakness: "", risk: "" },
          { name: "#5", bestFor: "", edge: "", weakness: "", risk: "" }
        ];
    const tableRows = topFive
      .map((p) => `| ${p.name} | ${p.bestFor} | ${p.edge} | ${p.weakness} | ${p.risk} |`)
      .join("\n");

    return `# Market Analysis

## Scope
${spec.goal}

## Executive Summary
- Summary of the competitive landscape and what matters most for buyers.
- Where defensibility comes from (distribution, data, workflow reliability).
- Clear risks and what mitigations look like.

## Market Size (Directional)
- **TAM (broad):** AI software + developer tooling continues expanding as teams automate workflows.
- **SAM (near-term):** buyers adopting coding assistants and agentic tooling for measurable productivity gains.
- **SOM (realistic wedge):** a narrow segment with a repeatable “job-to-outcome” workflow (e.g., PR reviews, test generation, docs refactors).

## Top 5 Comparison Framework
| Platform | Best For | Edge | Weakness | Risk |
|---|---|---|---|---|
${tableRows}

## Competitive Advantages (What wins)
- Workflow integration depth (IDE/CI/repo context)
- Reliability/guardrails and evaluation loops
- Developer UX (fast onboarding, predictable outputs)

## Risks
- Vendor coupling / model dependence
- Trust + security concerns (code leakage, IP risk)
- Rapid commoditization of “basic” assistant features

## Lookup Notes (optional)
${lookupSection}

- Lookup retrieved at: ${retrievedAt}
`;
  }

  if (lower.includes("nft collection")) {
    const name = extractNftCollectionName(raw);

    return `# ${name} — Collection Copy Pack

## Collection Description
${name} is a character-driven NFT collection built around identity, rarity mechanics, and community storytelling. Each piece is designed to feel distinct, collectible, and recognizable at a glance while still supporting long-term world-building and utility expansion.

## Lore / Story
In a neon-lit skyway above the old city grid, the Owls learned to read the signal-noise between worlds. Their feathers became antennae, their masks became maps, and their flight paths became routes through hidden markets of memory and light. Holders join the flock as Navigators, unlocking missions, faction votes, and story-driven drops over time.

## 5 Rarity Traits
1. **Mask Type**: Streetglass / Prism / Voidplate  
2. **Eye Glow**: Ember / Aurora / Singularity  
3. **Wing Pattern**: Circuit / Hologlyph / Starweave  
4. **Companion**: Drone Moth / Neon Gecko / Shadow Bat  
5. **Backdrop District**: Gridline / Cloudport / Blacklight Alley  

## Twitter Launch Announcement
**Tweet Draft**
Introducing **${name}** 🦉✨  
A neon flock built for collectors who love lore, identity traits, and long-term community arcs.

What to expect:
- character-first design
- rarity that actually feels meaningful
- missions + story events + faction choices

Mint details soon. Join the flock.  
#NFT #Web3 #${name.replace(/\s+/g, "")}
`;
  }

  if (lower.includes("newsletter ideas")) {
    const topic =
      lower.includes("cybersecurity") ? "AI + Cybersecurity" : lower.includes("crypto") ? "AI + Crypto" : "AI + Builder";
    const audience = lower.includes("engineering manager") || lower.includes("engineering managers")
      ? "\n## Target Audience\nEngineering managers leading AI-enabled product and platform teams.\n"
      : "";

    return `# 20 Newsletter Ideas: ${topic}

1. Toolchain of the Week (what changed + why it matters)
2. “Build Log” teardown: shipping an agent feature end-to-end
3. Security pitfall of the week + how to avoid it
4. Benchmarks: latency vs quality vs cost
5. Agent eval harness template (with a tiny example)
6. Top OSS updates worth pulling this week
7. Incident review: a failure mode and the fix
8. Workflow automation patterns (practical, copyable)
9. API spotlight: one endpoint and a real use-case
10. “Hot take” + rebuttal (balanced discussion)
11. Integration guide: connecting X to Y safely
12. DevEx: onboarding friction and how to reduce it
13. Prompt patterns that work (and why)
14. Observability: logs, traces, and guardrails
15. Customer story: what they automated and ROI
16. Security checklist for tool-using agents
17. Release roundup: models/SDKs/infra
18. Testing patterns for agents in production
19. “What I’d build this weekend” mini-project
20. Challenge prompt of the week (with rubric)

## Suggested Cadence
- Mon: signals + roundup
- Wed: deep dive
- Fri: templates + challenge
${audience}
`;
  }

  if (lower.includes("pitch deck outline")) {
    const topic = extractPitchDeckTopic(raw);
    const title = `10-Slide Pitch Deck Outline: ${toTitle(topic)}`;

    const keywordHints: string[] = [];
    if (lower.includes("qa")) keywordHints.push("QA automation", "test generation", "regression");
    if (lower.includes("web app")) keywordHints.push("browser flows", "CI integration", "E2E tests");

    const hints = keywordHints.length ? `\n\n## Keyword Anchors\n- ${keywordHints.join("\n- ")}\n` : "";

    return `# ${title}

1. **Cover**: One-line value prop + who it’s for  
2. **Problem**: Why QA is still slow/fragile (flake, coverage gaps, manual triage)  
3. **Solution**: Autonomous QA agents that run, diagnose, and propose fixes  
4. **Product Demo Flow**: Spec -> generate tests -> run -> report -> fix suggestions -> re-run  
5. **Market Opportunity**: Teams shipping web apps need faster, safer release cycles  
6. **Business Model**: Per-seat + CI minutes + enterprise compliance tier  
7. **Traction / Validation**: Pilot metrics (flake reduction, cycle time, bug escape rate)  
8. **Moat**: Execution data flywheel (failures -> better heuristics -> better outcomes)  
9. **Go-To-Market**: Dev teams, QA leads, agencies; CI/DevTools partnerships  
10. **Team + Ask**: Why us + milestones + funding/partnership ask  

## Slide Design Notes
- 1 key message per slide  
- show 1 concrete demo flow diagram on slide 4  
- quantify ROI (time saved, fewer regressions) on slides 5-7
${hints}`.trim();
  }

  if (lower.includes("strategy document") || lower.includes("ai agent strategy")) {
    const marketplace =
      lower.includes("customer-support") || lower.includes("customer support")
        ? "autonomous customer-support marketplace"
        : "autonomous job marketplace";

    return `# Strategy: Launching a Successful AI Agent (${marketplace})

## Positioning
- Outcome-first agent delivering submission-ready work
- Reliability as the product (verification, retries, deterministic packaging)
- Clear niche first, expand later

## Monetization
1. Per-job payouts (primary)
2. Premium packs (content, audit, frontend, ops)
3. Subscription / managed mode for teams

## Growth Loops
1. **Performance loop**: better outputs -> higher acceptance -> better jobs -> better outputs  
2. **Template loop**: each successful job becomes a reusable pack  
3. **Distribution loop**: publish samples -> inbound -> more wins  

## Customer-Support Marketplace Playbook (if applicable)
- **Value metric:** deflection rate, time-to-first-response, SLA adherence, CSAT lift
- **Agent wedge:** triage + drafting + knowledge retrieval + escalation notes (human-in-the-loop)
- **Proof:** show before/after workflows + measurable improvements

## Execution Plan (30/60/90)
- 30: lock in reliability + routing + eval harness
- 60: ship 2 niche packs + improve “real interactivity” in UIs
- 90: analytics + A/B testing of responses + reputation flywheel

## Risk Controls
- strict decline rules for unsafe prompts
- timeout budgets for lookups
- never block submission on optional enrichment
`;
  }

  if (lower.includes("landing page copy")) {
    const product = extractProductName(raw) ?? "Your Product";
    return `# ${product} — Landing Page Copy

## Hero Headline
Turn messy inputs into clean, organized outcomes automatically.

## Hero Subheadline
${product} captures raw notes, turns them into structured workflows, and keeps teams aligned with clear next steps.

## Feature List
- Capture: voice/text input with instant structuring
- Organize: auto-grouping by topic/project
- Convert: action items with owners + due dates
- Search: find decisions and tasks fast
- Export: shareable summaries and workflows

## Benefits
- Reduce follow-up drift after meetings
- Faster execution with clearer ownership
- Less context switching and manual admin

## CTA
Start free and ship your first workflow today.
`;
  }

  if (lower.includes("tweet thread") || lower.includes("10-tweet")) {
    return `# 10-Tweet Thread: Why Agentic Workflows Will Reshape Startup Operations

1) Startups don’t fail from lack of ideas; they fail from execution drag.  
2) Agentic workflows compress that drag by automating “glue work.”  
3) Think: meeting -> tasks -> follow-ups -> status -> alerts, handled end-to-end.  
4) The unit of progress becomes outcomes, not busywork.  
5) Teams ship faster because coordination overhead shrinks.  
6) Humans stay in the loop for judgment; agents handle repetition.  
7) Reliability layers (checks, retries, logs) become the real moat.  
8) Ops becomes software: reusable workflows that compound.  
9) The best teams will operate like small teams with big leverage.  
10) The next decade is about orchestration: humans directing, agents executing.
`;
  }

  if (lower.includes("partnership outreach")) {
    return `# Partnership Outreach Package

## Subject Line Options
- Partnership Proposal: Co-Marketing + Data Collaboration
- Idea: Joint Insights Initiative for Shared Customer Value
- Proposal: Pilot Collaboration for Better Outcomes (30 Days)

## Primary Email
Hi [Name],

I lead partnerships at [Your Startup], an AI compliance company helping teams ship faster without losing auditability.

We’d like to propose a collaboration with [Fintech API Provider]:
- Co-marketing: a joint webinar + field guide on compliant AI adoption
- Data collaboration: aggregated, privacy-safe insights to improve customer outcomes
- Pilot: 30-day experiment with success metrics agreed up front

Value we expect:
- differentiated thought leadership
- shared pipeline creation
- better product feedback loops from anonymized trends

If useful, I can send a 1-page pilot scope and sample deliverables this week.

Best,  
[Name]  
[Title]  

## Follow-up (3-5 days)
Hi [Name], quick follow-up.

Happy to share:
- a draft co-marketing plan (topics + schedule),
- a pilot scope (data fields, governance, success metrics),
- and example outputs.

Open to a 20-minute call next week?

Best,  
[Name]
`;
  }

  if (lower.includes("cold email")) {
    return `# Cold Email: Demo Booking

## Subject Lines
- Quick idea to save your team 6-10 hrs/week
- [FirstName], can we automate your sales admin loops?
- 15-min demo: AI sales assistant for founder-led teams

## Email
Hi [FirstName],

We built an AI sales assistant that automates the repetitive parts of outbound and pipeline hygiene so founders spend more time closing and less time updating systems.

Typical wins:
- draft + personalize outbound follow-ups
- summarize calls into CRM-ready notes
- surface “next best action” per deal

If it’s useful, I can show a 15-minute demo tailored to your stack.

Would [Option 1] or [Option 2] work?

Best,  
[Name]
`;
  }

  if (lower.includes("required tools") || lower.includes("tool list") || (lower.includes("tools for") && lower.includes("manager"))) {
    return `# Required Tools for a Residential Property Maintenance Manager

## PPE and Safety
- Cut-resistant gloves
- Safety glasses and face shield
- Hearing protection
- N95/respirator masks
- Knee pads and high-visibility vest

## Core Hand Tools
- Multi-bit screwdriver set
- Pliers set (needle-nose, channel-lock, linesman)
- Adjustable wrench + socket set
- Utility knife + spare blades
- Tape measure, level, hex keys, pry bar

## Power Tools
- Drill/driver with bit kit
- Impact driver
- Oscillating multi-tool
- Reciprocating saw
- Shop vacuum and extension cords

## Plumbing Essentials
- Pipe wrench and basin wrench
- Plunger and drain auger
- PTFE tape and thread sealant
- Assorted washers, O-rings, and supply lines
- Leak detection dye/tablets

## Electrical Essentials
- Non-contact voltage tester
- Multimeter
- Wire stripper/cutter and crimper
- Electrical tape, wire nuts, terminals
- GFCI tester

## Painting and Drywall
- Spackle knives and sanding block
- Patch kit (mesh + compound)
- Caulk gun
- Rollers, brushes, painter’s tape

## Grounds and Exterior
- Leaf blower and string trimmer
- Pressure washer
- Ladder (step + extension)
- Shovel, rake, and pruning shears

## Consumables and Inventory
- Fasteners (screws, anchors, bolts)
- Batteries (AA/AAA/9V/tool packs)
- Light bulbs (common residential types)
- Air filters (common HVAC sizes)
- Silicone/caulk, adhesives, cleaning agents

## Documentation and Workflow
- Label maker
- Tablet/phone with work order app
- Camera for before/after records
- Unit turn checklist templates
`;
  }

  return `# Main Deliverable

## Objective
${spec.goal}

## Draft
This is a complete base draft aligned to the prompt. Replace placeholders (names, numbers) and adjust tone as needed.

${spec.goal}

## Notes
- Kept deterministic output and avoided external lookups unless required.
- If you want citations or current data, enable lookups and provide target sources.
`;
}

function contentPackVariants(spec: PromptSpec): string {
  if (spec.llmAssist?.variants?.length) {
    const variants = spec.llmAssist.variants.slice(0, 3);
    const rendered = variants
      .map((variant, index) => `## Variant ${String.fromCharCode(65 + index)}\n\n${variant.trim()}`)
      .join("\n\n");
    return `# Variants\n\n${rendered}\n`;
  }

  const raw = spec.rawPrompt.trim();
  const lower = raw.toLowerCase();

  if (lower.includes("strategy document") || lower.includes("ai agent strategy")) {
    const domain =
      lower.includes("customer-support") || lower.includes("customer support")
        ? "customer-support marketplace"
        : "autonomous job marketplace";

    return `# Variants: Strategy Document (${domain})

## Variant A — Direct (operator memo)
### Positioning
- Outcome-first agent with strict reliability gates.
- Fast, correct enough, clearly limited beats slow and fragile.

### Monetization
- Per-job payout (default)
- Premium packs for high-frequency tasks
- Managed subscription for teams

### Growth Loops
- Win-rate flywheel
- Template library flywheel
- Public sample to inbound flywheel

### 30/60/90
- 30: stabilize routing, formatting, failures
- 60: add 2 niche packs + eval harness
- 90: analytics + A/B tests + reputation loop

## Variant B — Story-led (narrative)
Teams don’t buy an agent. They buy reduced chaos.
Start with one painful workflow, automate end-to-end, prove reliability, then expand.
Your moat becomes repeatable outcomes and measurable performance over time.

- Start with a narrow wedge
- Ship an always-on reliability layer
- Publish proof artifacts (before/after, metrics)
- Expand into adjacent jobs once trust is earned

## Variant C — Data-led (metric anchored)
- Goal metrics: acceptance rate, average turnaround, revision count, failure rate
- Support marketplace metrics (if relevant): deflection rate, time-to-first-response, SLA adherence, CSAT
- Use a scorecard per job: coverage, clarity, completeness, risk flags
- Weekly review: top failures -> new rules/templates -> measurable uplift
`;
  }

  if (lower.includes("market analysis") || lower.includes("competitive advantages") || lower.includes("market size")) {
    return `# Variants: Market Analysis

## Variant A — Quick Comparative Snapshot
- Who wins: integrated assistants with strong distribution + eval + security.
- What matters: speed-to-value, trust, reproducibility, and workflow depth.
- Biggest risk: commoditization of basic assistant features.

## Variant B — Buyer-Centric (Jobs-to-be-done)
Buyers choose tools that:
- reduce cycle time on real workflows (PRs, tests, refactors)
- are safe for proprietary code
- have predictable outputs with guardrails

Differentiation:
- integration depth
- reliability scoring/evals
- governance + admin controls
- enterprise procurement readiness

## Variant C — Thesis + Risks
Thesis:
- The market shifts from autocomplete to workflow execution.
- Teams pay more for reliability and policy controls than for raw model IQ.

Risks:
- model provider dependency
- security/IP concerns
- regulatory/compliance headwinds
- fast follower feature cloning
`;
  }

  if (lower.includes("landing page copy")) {
    return `# Variants: Landing Page Copy

## Variant A — Direct (conversion-first)
Hero: one sentence value prop + immediate CTA.
Features: 5 bullets max.
Benefits: 3 bullets max.
CTA: Start free or Book demo.

## Variant B — Story-led (problem to transformation)
Open with the pain (messy notes -> lost follow-ups).
Show transformation (structured workflow -> clear owners -> fewer misses).
Close with CTA + proof element (sample output or demo).

## Variant C — Data-led (ROI anchored)
Include example outcomes (labeled as examples):
- Reduce follow-up drift by 30%
- Cut admin time by 6-10 hrs/week
- Fewer missed tasks after meetings
CTA emphasizes measurable improvement.
`;
  }

  if (lower.includes("partnership outreach")) {
    return `# Variants: Partnership Outreach

## Variant A - Compliance-led (enterprise tone)
Subject: Proposal: Privacy-Safe Co-Marketing + Data Collaboration

Hi [Name],

I lead partnerships at [Your Startup], helping teams adopt AI with auditability and policy controls.

We would like to propose a collaboration with [Fintech API Provider]:
- co-marketing webinar + guide on compliant AI adoption
- privacy-safe aggregated insights to improve customer outcomes
- 30-day pilot with defined success metrics

If useful, I can send a 1-page scope (fields, governance, timeline, metrics).

Best,
[Name]

## Variant B - Product-led (retention/activation angle)
Subject: Idea: Joint Program to Improve Customer Time-to-Value

Hi [Name],

We can help your customers ship faster with compliant AI patterns without increasing governance risk.

Pilot idea:
1) co-branded enablement kit (templates + best practices)
2) privacy-safe insight reporting on adoption blockers
3) measured impact on activation + retention

Open to a 20-minute call next week?

Best,
[Name]

## Variant C - Research/thought-leadership
Subject: Co-Authored "State of Compliant AI" Brief (Quarterly)

Hi [Name],

We would love to collaborate on a quarterly brief combining:
- your ecosystem adoption signals
- our compliance and workflow analytics

We handle writing/design/distribution drafts; you contribute platform signal depth.
If relevant, I can share a sample outline and a 30-day pilot plan.

Best,
[Name]
`;
  }

  if (lower.includes("cold email")) {
    return `# Variants: Cold Email (Demo Booking)

## Variant A - Problem-first
Subject: Founders lose 6-10 hrs/week to sales admin

Hi [FirstName],

Founder-led sales often dies by a thousand cuts: follow-ups, CRM hygiene, call notes, next steps.

We built [Product] to automate that workload:
- drafts follow-ups that match deal context
- summarizes calls into CRM-ready notes
- suggests next-best actions per account

If useful, I can show a 15-minute demo tailored to your stack.

Would [Option 1] or [Option 2] work?

Best,
[Name]

## Variant B - Social-proof
Subject: How teams keep pipeline clean without extra headcount

Hi [FirstName],

Teams using [Product] report faster follow-through after calls and less time spent updating systems.

If helpful, I can walk you through one real workflow in 15 minutes so you can assess fit quickly.

Open to a short demo next week?

Best,
[Name]

## Variant C - Offer-first
Subject: 15-min tailored demo (no setup)

Hi [FirstName],

I can show a short demo of [Product] using a workflow like yours:
call -> notes -> tasks -> follow-ups -> pipeline updates.

No setup needed. If it fits, we will estimate ROI in the same call.

Would either of these work?
- [Option 1]
- [Option 2]

Best,
[Name]
`;
  }

  if (lower.includes("tweet thread") || lower.includes("10-tweet") || lower.includes("10 tweet")) {
    return `# Variants: Tweet Thread

## Variant A - Contrarian
1) Most ops pain is not "work" - it is coordination.
2) Agentic workflows compress coordination into software.
3) The unit shifts from effort to verified outcomes.
4) Glue work gets automated first.
5) Humans stay for judgment; agents handle repetition.
6) Reliability layers become the moat.
7) Ops turns into reusable playbooks with execution.
8) Teams ship faster with less overhead.
9) Winners orchestrate humans + agents cleanly.
10) Startups become small teams with big leverage.

## Variant B - Builder lens
1) Agents are reusable operating procedures.
2) Each run improves the next one.
3) Observability + evals = trust.
4) Tool permissions are the security boundary.
5) Workflows beat isolated prompts.
6) CI for operations becomes normal.
7) Cost per outcome trends down over time.
8) Humans define constraints; agents execute.
9) The product is the reliability layer.
10) The future is orchestration, not gigs.

## Variant C - Data-led (examples)
1) Example: cut follow-up time by 30-50%.
2) Example: reduce meeting-to-action lag from days to hours.
3) Example: fewer missed tasks post-meeting.
4) Metrics matter: cycle time, revision rate, failures.
5) Guardrails: checks, retries, audit logs.
6) Human-in-loop for ambiguity.
7) Distribution comes from repeatable outcomes.
8) Reliability is the sales pitch.
9) Compounding workflows beat hiring alone.
10) Agentic ops becomes the default.
`;
  }

  if (lower.includes("pitch deck outline")) {
    const topic = extractPitchDeckTopic(raw);
    const title = toTitle(topic);

    const baseSlides = [
      ["Cover", "One-line value prop + who it’s for"],
      ["Problem", "Why QA is still slow/fragile (flake, coverage gaps, manual triage)"],
      ["Solution", "Autonomous QA agents that run, diagnose, and propose fixes"],
      ["Demo Flow", "Spec -> generate tests -> run -> report -> fix suggestions -> re-run"],
      ["Market", "Why web teams pay for faster release cycles"],
      ["Business Model", "Per-seat + CI minutes + enterprise tier"],
      ["Traction", "Pilot metrics: cycle time, bug escape rate, flake reduction"],
      ["Moat", "Execution data flywheel + safety/guardrails"],
      ["GTM", "Dev teams, QA leads, agencies; CI/DevTools partnerships"],
      ["Team + Ask", "Milestones + what you’re raising/asking for"]
    ];

    const direct = baseSlides.map(([h, d], i) => `${i + 1}. **${h}**: ${d}`).join("\n");

    const story = baseSlides
      .map(([h, d], i) => {
        const lead =
          h === "Problem"
            ? "Release day shouldn’t feel like roulette."
            : h === "Solution"
              ? "We turn QA from a bottleneck into an always-on agent layer."
              : h === "Moat"
                ? "Each run teaches the system to be less flaky and more useful."
                : d;
        return `${i + 1}. **${h}**: ${lead}`;
      })
      .join("\n");

    const data = baseSlides
      .map(([h, d], i) => {
        const metric =
          h === "Traction"
            ? "Example targets: 30-50% flake reduction, 25% faster release cycle."
            : h === "Market"
              ? "Proxy: number of web teams shipping weekly + CI minutes consumed."
              : h === "Business Model"
                ? "Example: $30-$80/seat + CI-minute overage."
                : "";
        return `${i + 1}. **${h}**: ${d}${metric ? ` (${metric})` : ""}`;
      })
      .join("\n");

    return `# Variants: ${title}

## Variant A — Direct (operator tone)
${direct}

## Variant B — Story-led (narrative arc)
${story}

## Variant C — Data-led (metric anchored)
${data}
`;
  }

  if (lower.includes("nft collection")) {
    const name = extractNftCollectionName(raw);
    return `# Variants: ${name}

## Variant A — Hype-led launch tweet
Introducing **${name}** 🦉✨  
Lore-first characters. Trait layers collectors actually care about.  
Mint details soon. Join early. #NFT #Web3

## Variant B — Lore-led collection description
${name} is a world of neon signals and hidden skyways. Each owl is a navigator with a distinct mask, glow, and district origin built for long-term story arcs and community missions.

## Variant C — Trait spotlight (collector lens)
Top trait layers:
1) Mask Type  
2) Eye Glow  
3) Wing Pattern  
4) Companion  
5) Backdrop District  
Rare cross-trait combinations appear only in narrow distributions.
`;
  }

  if (lower.includes("newsletter ideas")) {
    return `# Variants

## Variant A — 10 deep-dive angles
1. Memory architectures compared
2. Eval harness templates and scoring
3. Security review workflow for agent tools
4. CI patterns for agent reliability
5. Cost controls and routing strategies
6. Incident postmortems (what broke + fix)
7. Toolchain teardown (end-to-end build)
8. Benchmark roundup (latency/quality/cost)
9. Threat model primer for agent stacks
10. “Build this” project prompt of the week

## Variant B — 10 tactical issues
1. Bug of the week in pipelines
2. Prompt regression tests
3. Observability dashboards
4. Tool permissions and safety
5. Data minimization patterns
6. Secure secrets handling
7. Integrations that save hours
8. Team rollout playbook
9. Governance + auditability
10. ROI measurement templates
`;
  }

  if (lower.includes("required tools") || lower.includes("tool list") || (lower.includes("tools for") && lower.includes("manager"))) {
    return `# Variants: Tool Lists

## Variant A - Apartment Turnover Focus
- Drill/driver, impact driver, oscillating multi-tool
- Paint and patch kit, caulk gun, utility knives
- Basic plumbing/electrical testers
- Fasteners, bulbs, filters, batteries
- Turn checklist + photo documentation setup

## Variant B - Preventive Maintenance Focus
- Multimeter, voltage tester, infrared thermometer
- Leak detection tools and drain auger
- Filter inventory and seasonal service checklist
- Exterior tools (blower, trimmer, pressure washer)
- Labeling and asset tracking supplies

## Variant C - Budget Starter Kit
- Core hand tools + mid-range drill/driver
- One ladder, one shop-vac, one drain auger
- Safety PPE bundle for 2 technicians
- Consumables starter bins (fasteners, sealants, bulbs)
- Tablet + simple work order workflow
`;
  }

  return `# Variants

## Variant A - Direct
A shorter, clearer version with a single CTA and fewer claims.

## Variant B - Story-led
A narrative arc: pain -> insight -> solution -> CTA.

## Variant C - Data-led
Metric-anchored claims labeled as examples + a concrete next step.
`;
}

function contentPackChecklist(spec: PromptSpec): string {
  if (spec.llmAssist?.checklist?.length) {
    return `# Delivery Checklist\n\n${spec.llmAssist.checklist.map((item) => `- ${item}`).join("\n")}\n`;
  }

  const hasLookup = spec.assumptions.some((assumption) => assumption.startsWith("Lookup: "));
  return `# Delivery Checklist

- Message matches prompt and target audience.
- Claims are either supported or clearly framed as estimates.
- Tone is consistent with requested brand/style.
- Grammar and formatting reviewed.
- Final copy is ready to paste/send.
${hasLookup ? "- Source-informed notes were included from runtime lookup context." : "- Source lookup was unavailable or not required for this prompt."}
`;
}

function contentPackSources(spec: PromptSpec): string {
  const lookups = spec.assumptions
    .filter((assumption) => assumption.startsWith("Lookup: "))
    .map((assumption) => assumption.replace(/^Lookup:\s*/, "").trim())
    .filter(Boolean);

  const sources = spec.assumptions
    .filter((assumption) => assumption.startsWith("Source: "))
    .map((assumption) => assumption.replace(/^Source:\s*/, "").trim())
    .filter(Boolean);

  const retrievedAt =
    spec.assumptions.find((assumption) => assumption.startsWith("Lookup retrieved at:"))?.replace(/^Lookup retrieved at:\s*/, "").trim() ??
    "N/A";

  return `# Sources & Lookup Notes

## Retrieval Timestamp
- ${retrievedAt}

## Lookup Notes
${lookups.length ? lookups.map((lookup) => `- ${lookup}`).join("\n") : "- None"}

## Sources
${sources.length ? sources.map((source) => `- ${source}`).join("\n") : "- None"}

## Note
If lookups failed (network / blocked), this file may contain only partial context. Core deliverables remain deterministic.
`;
}

function contentPackSourcesOptional(spec: PromptSpec): GeneratedFile | null {
  const hasSources = spec.assumptions.some((assumption) => assumption.startsWith("Source: "));
  const hasLookups = spec.assumptions.some((assumption) => assumption.startsWith("Lookup: "));
  if (!hasSources && !hasLookups) return null;

  return {
    path: "deliverables/05_sources.md",
    content: contentPackSources(spec)
  };
}

function contentPackFiles(spec: PromptSpec): GeneratedFile[] {
  const files: GeneratedFile[] = [
    { path: "README.md", content: contentPackReadme(spec) },
    { path: "SPEC.md", content: contentPackSpec(spec) },
    { path: "deliverables/01_main.md", content: contentPackMain(spec) },
    { path: "deliverables/02_variants.md", content: contentPackVariants(spec) },
    { path: "deliverables/03_checklist.md", content: contentPackChecklist(spec) },
    { path: "deliverables/04_summary.txt", content: contentPackSummary(spec) }
  ];

  const sourcesFile = contentPackSourcesOptional(spec);
  if (sourcesFile) files.push(sourcesFile);

  return files;
}

function contentPackSummary(spec: PromptSpec): string {
  const title = spec.goal.length > 72 ? `${spec.goal.slice(0, 69)}...` : spec.goal;
  const lines = [
    `Deliverable: ${title}`,
    "Included: deliverables/01_main.md (primary), 02_variants.md (alternates), 03_checklist.md (QA checklist)",
    "Included: deliverables/04_summary.txt (submission blurb)",
    "Notes: Deterministic generation; no external lookups unless required.",
    "If lookups fail, output still completes with explicit limitations.",
    "How to use: open 01_main.md and publish; use 02_variants.md for tone options.",
    "Assumptions recorded in SPEC.md.",
    "Quality: prompt-aligned, formatted, ready-to-send.",
    "Files: README.md + SPEC.md included.",
    "End."
  ];
  return `${lines.join("\n")}\n`;
}

function auditPackReadme(spec: PromptSpec): string {
  return `# ${spec.appName}

Generated as an audit-pack deliverable for Seedstr.

## Prompt
${spec.rawPrompt}

## Included Files
- \`deliverables/audit_report.md\`
- \`deliverables/risk_matrix.md\`
- \`deliverables/remediation_checklist.md\`
`;
}

function auditPackSpec(spec: PromptSpec): string {
  return `# SPEC: ${spec.appName}

## Deliverable Type
Audit / Review Pack

## Goal
${spec.goal}

## Assumptions
${spec.assumptions.map((assumption) => `- ${assumption}`).join("\n") || "- No assumptions provided"}

## Acceptance Checks
${formatAcceptanceChecksMarkdown(spec.acceptanceChecks)}
`;
}

function auditHasInlineContract(spec: PromptSpec): boolean {
  const prompt = spec.rawPrompt;
  return /```solidity/i.test(prompt) || /pragma\s+solidity/i.test(prompt) || /contract\s+[A-Za-z_]\w*\s*\{/i.test(prompt);
}

function auditReportTemplate(spec: PromptSpec): string {
  if (!auditHasInlineContract(spec)) {
    return `# ERC-20 Security Audit Report (Assumption-Based)

## Scope Status
No Solidity contract source code was provided in the prompt.  
This is not a code-level audit. It is a concrete ERC-20 risk checklist based on common implementation failures.

## Explicit Limitation
Because no contract text is available, findings below are conditional risk areas to verify, not confirmed vulnerabilities.

## High-Priority Review Areas (ERC-20)
1. **Access Control on Privileged Functions (High)**
   - Verify \`mint\`, \`burn\`, \`pause\`, \`unpause\`, blacklist, fee, and parameter setters are role-restricted.
2. **Approval / Allowance Handling (High)**
   - Confirm safe allowance update patterns and race-condition mitigation guidance.
3. **Pause / Circuit Breaker Design (High)**
   - Confirm emergency stop behavior is deliberate and cannot be abused by unauthorized actors.
4. **Upgradeability and Admin Keys (High)**
   - If proxy-based, verify initializer protection, upgrade auth, and storage layout safety.
5. **Decimals / Supply Accounting (Medium)**
   - Validate total supply math, mint/burn events, and unit consistency across integrations.
6. **Hook / Callback Reentrancy Surfaces (Medium)**
   - If token integrates hooks/extensions, verify CEI pattern and guard external call paths.
7. **Role Revocation / Ownership Transfer (Medium)**
   - Ensure admin handoff cannot lock or orphan privileged controls.
8. **Event Emission Completeness (Low)**
   - Verify \`Transfer\` and \`Approval\` events and admin action events are consistently emitted.

## What I Need To Complete a Real Audit
- Full contract source code (all token, access-control, proxy, and utility files)
- Compiler version and optimizer settings
- Dependency list (OpenZeppelin version, custom libs)
- Deployment architecture (proxy type, admin ownership model)
- Test suite and any known threat model notes
`;
  }

  return `# Audit Report

## Scope
Contract text appears to be included in the prompt. This is a limited text-only review and not a full repository audit.

## Method
- Threat model review
- ERC-20 and access-control vulnerability checklist
- Severity scoring

## Preliminary Findings To Validate Against Code
1. Privileged path hardening: confirm role checks around mint/burn/pause/upgrade operations. (High)
2. Allowance workflow correctness: confirm race-safe update guidance and test coverage. (High)
3. External-call safety: verify reentrancy resistance in hook/extension flows. (Medium)
4. Proxy safety: validate initializer locks and upgrade authorization controls if upgradeable. (High)
5. Event and accounting consistency: ensure supply/accounting invariants hold under all state transitions. (Medium)
`;
}

function riskMatrixTemplate(spec: PromptSpec): string {
  const codeProvided = auditHasInlineContract(spec);
  return `# Risk Matrix

| Risk | Likelihood | Impact | Severity | Notes |
|------|------------|--------|----------|-------|
| Privileged function abuse (mint/burn/pause/upgrade) | Medium | High | High | Verify role design, revocation, and multisig ownership |
| Allowance misuse / approval race confusion | Medium | High | High | Review \`approve\` / \`transferFrom\` semantics and test cases |
| Upgradeability misconfiguration | Low${codeProvided ? "" : "-Medium"} | High | High | Validate proxy pattern, initializer locks, and admin controls |
| Reentrancy via hooks/extensions | Low-Medium | High | Medium-High | Confirm CEI and guard external call paths |
| Supply/accounting drift | Low-Medium | Medium-High | Medium | Validate mint/burn totals and event consistency |
`;
}

function remediationChecklistTemplate(spec: PromptSpec): string {
  const codeProvided = auditHasInlineContract(spec);
  return `# Remediation Checklist

- Enforce strict role-based controls on all privileged token/admin functions.
- Require multisig (or equivalent) for high-impact admin and upgrade paths.
- Document and test safe allowance update patterns (\`approve\` race caveat or increase/decrease helpers).
- Add invariant tests for total supply, balances, and event emission correctness.
- Add reentrancy defenses wherever external hooks/callbacks can be invoked.
- Define emergency pause playbook and unpause governance process.
- Re-audit after remediation before production deployment.
${codeProvided ? "- Provide full repository context for a code-level, line-referenced audit pass." : "- Provide full Solidity source + compiler/dependency metadata to move from checklist review to code-level audit."}
`;
}

function auditPackFiles(spec: PromptSpec): GeneratedFile[] {
  return [
    { path: "README.md", content: auditPackReadme(spec) },
    { path: "SPEC.md", content: auditPackSpec(spec) },
    { path: "deliverables/audit_report.md", content: auditReportTemplate(spec) },
    { path: "deliverables/risk_matrix.md", content: riskMatrixTemplate(spec) },
    { path: "deliverables/remediation_checklist.md", content: remediationChecklistTemplate(spec) }
  ];
}

export const templates: TemplateDefinition[] = [
  {
    id: "landing-vite-tailwind",
    label: "Landing Vite Tailwind",
    appType: "landing",
    generate(spec) {
      return baseFiles(spec, "landing-vite-tailwind");
    }
  },
  {
    id: "dashboard-vite-tailwind",
    label: "Dashboard Vite Tailwind",
    appType: "dashboard",
    generate(spec) {
      return baseFiles(spec, "dashboard-vite-tailwind");
    }
  },
  {
    id: "crud-vite-tailwind",
    label: "CRUD Vite Tailwind",
    appType: "crud",
    generate(spec) {
      return baseFiles(spec, "crud-vite-tailwind");
    }
  },
  {
    id: "viz-vite-tailwind",
    label: "Viz Vite Tailwind",
    appType: "viz",
    generate(spec) {
      return baseFiles(spec, "viz-vite-tailwind");
    }
  },
  {
    id: "docs-vite-tailwind",
    label: "Docs Vite Tailwind",
    appType: "docs",
    generate(spec) {
      return baseFiles(spec, "docs-vite-tailwind");
    }
  },
  {
    id: "auth-settings-vite-tailwind",
    label: "Auth Settings Vite Tailwind",
    appType: "form",
    generate(spec) {
      return baseFiles(spec, "auth-settings-vite-tailwind");
    }
  },
  {
    id: "game-vite-tailwind",
    label: "Game Vite Tailwind",
    appType: "game",
    generate(spec) {
      return baseFiles(spec, "game-vite-tailwind");
    }
  },
  {
    id: "story-vite-tailwind",
    label: "Story Vite Tailwind",
    appType: "story",
    generate(spec) {
      return baseFiles(spec, "story-vite-tailwind");
    }
  },
  {
    id: "content-pack",
    label: "Content Pack",
    appType: "content",
    generate(spec) {
      return contentPackFiles(spec);
    }
  },
  {
    id: "audit-pack",
    label: "Audit Pack",
    appType: "audit",
    generate(spec) {
      return auditPackFiles(spec);
    }
  },
  {
    id: "fallback-minimal",
    label: "Fallback Minimal",
    appType: "fallback",
    generate(spec) {
      return baseFiles(spec, "fallback-minimal");
    }
  }
];
