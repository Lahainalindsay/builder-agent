import { ToolResultItem } from "./types";

function isWritingTask(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return [
    "email",
    "tweet",
    "thread",
    "newsletter",
    "marketing copy",
    "landing page copy",
    "pitch deck outline",
    "partnership outreach",
    "cold email"
  ].some((token) => lower.includes(token));
}

function shouldSearch(prompt: string): boolean {
  if (isWritingTask(prompt)) return false;
  const lower = prompt.toLowerCase();
  return ["research", "latest", "current", "top ", "market", "compare", "find", "search"].some((token) =>
    lower.includes(token)
  );
}

function queryFromPrompt(prompt: string): string {
  const quoted = prompt.match(/"([^"]{4,120})"/)?.[1];
  if (quoted) return quoted;
  return prompt.slice(0, 140).replace(/\s+/g, " ").trim();
}

export async function runWebSearchTool(prompt: string): Promise<ToolResultItem | null> {
  if (!shouldSearch(prompt)) return null;
  const query = queryFromPrompt(prompt);
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = (await response.json()) as {
    AbstractText?: string;
    AbstractURL?: string;
    Heading?: string;
  };
  const summary = data.AbstractText?.trim()
    ? `Search summary for "${query}": ${data.AbstractText.slice(0, 220)}`
    : `Search executed for "${query}" (no direct abstract returned).`;
  return {
    tool: "web-search",
    summary,
    details: {
      query,
      heading: data.Heading ?? null,
      abstract: data.AbstractText ?? null
    },
    references: [{ label: "DuckDuckGo Instant Answer API", url: data.AbstractURL || url }]
  };
}
