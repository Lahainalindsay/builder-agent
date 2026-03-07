export interface LookupReference {
  label: string;
  url: string;
}

export interface LookupItem {
  type:
    | "price"
    | "market"
    | "github"
    | "weather"
    | "timezone"
    | "geocoding"
    | "docs"
    | "exchange-rate";
  summary: string;
  details: Record<string, unknown>;
  references: LookupReference[];
}

export interface LookupResult {
  items: LookupItem[];
  warnings: string[];
}

interface FetchOptions {
  timeoutMs?: number;
}

const LOOKUP_BUDGET_MS = 12_000;

const KNOWN_ASSETS: Record<string, string> = {
  bitcoin: "bitcoin",
  btc: "bitcoin",
  ethereum: "ethereum",
  eth: "ethereum",
  solana: "solana",
  sol: "solana",
  dogecoin: "dogecoin",
  doge: "dogecoin"
};

const KNOWN_DOC_PACKAGES = [
  "react",
  "vite",
  "tailwindcss",
  "typescript",
  "next",
  "nextjs",
  "node",
  "express",
  "python",
  "fastapi"
];

function containsAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

function shouldDisableLookups(prompt: string): boolean {
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

function extractGitHubRepo(prompt: string): { owner: string; repo: string } | null {
  const urlMatch = prompt.match(/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i);
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2].replace(/\.git$/i, "") };
  }

  const shorthandMatch = prompt.match(/\b([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\b/);
  if (shorthandMatch && !shorthandMatch[0].includes("http")) {
    return { owner: shorthandMatch[1], repo: shorthandMatch[2].replace(/\.git$/i, "") };
  }

  return null;
}

function extractLocation(prompt: string): string | null {
  const match =
    prompt.match(/\b(?:in|for|at)\s+([A-Za-z][A-Za-z\s,.-]{2,60})/i) ??
    prompt.match(/\b([A-Za-z][A-Za-z\s]{2,40},\s*[A-Za-z][A-Za-z\s]{1,40})\b/);
  return match?.[1]?.trim() ?? null;
}

function detectAssets(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  const found = new Set<string>();

  for (const [token, coinId] of Object.entries(KNOWN_ASSETS)) {
    if (lower.includes(token)) {
      found.add(coinId);
    }
  }

  if (found.size === 0 && containsAny(lower, ["crypto", "coin", "market cap", "current price"])) {
    found.add("bitcoin");
    found.add("ethereum");
    found.add("solana");
  }

  return Array.from(found).slice(0, 5);
}

function detectDocPackages(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  const found = KNOWN_DOC_PACKAGES.filter((pkg) => lower.includes(pkg));
  return Array.from(new Set(found)).slice(0, 4);
}

async function fetchJson<T>(url: string, cache: Map<string, unknown>, options?: FetchOptions): Promise<T> {
  if (cache.has(url)) {
    return cache.get(url) as T;
  }

  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 8000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as T;
    cache.set(url, data);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function lookupPrices(prompt: string, cache: Map<string, unknown>): Promise<LookupItem | null> {
  const assets = detectAssets(prompt);
  if (!assets.length) return null;

  const ids = assets.join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`;
  const data = await fetchJson<Record<string, { usd?: number }>>(url, cache);

  const lines = assets.map((asset) => `${asset}: $${data[asset]?.usd ?? "n/a"}`);
  return {
    type: "price",
    summary: `Live price check: ${lines.join(", ")}`,
    details: { prices: data },
    references: [{ label: "CoinGecko Simple Price API", url }]
  };
}

async function lookupCryptoMarket(prompt: string, cache: Map<string, unknown>): Promise<LookupItem | null> {
  const lower = prompt.toLowerCase();
  if (
    !containsAny(lower, [
      "market analysis",
      "market size",
      "best crypto",
      "invest in now",
      "top crypto",
      "top coins",
      "market cap"
    ])
  ) {
    return null;
  }

  const globalUrl = "https://api.coingecko.com/api/v3/global";
  const marketsUrl =
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=5&page=1&sparkline=false&price_change_percentage=24h";
  const [globalData, markets] = await Promise.all([
    fetchJson<{ data?: Record<string, unknown> }>(globalUrl, cache),
    fetchJson<Array<Record<string, unknown>>>(marketsUrl, cache)
  ]);

  const global = globalData.data ?? {};
  const totalCap = (global.total_market_cap as { usd?: number } | undefined)?.usd;
  const totalVolume = (global.total_volume as { usd?: number } | undefined)?.usd;
  const btcDominance = (global.market_cap_percentage as { btc?: number } | undefined)?.btc;
  const leaders = markets
    .slice(0, 5)
    .map((coin) => {
      const symbol = String(coin.symbol ?? "").toUpperCase();
      const price = Number(coin.current_price ?? 0);
      const change = Number(coin.price_change_percentage_24h ?? 0);
      return `${symbol}: $${price.toLocaleString()} (${change >= 0 ? "+" : ""}${change.toFixed(2)}% 24h)`;
    })
    .join(", ");

  const capText = typeof totalCap === "number" ? `$${Math.round(totalCap).toLocaleString()}` : "n/a";
  const volumeText = typeof totalVolume === "number" ? `$${Math.round(totalVolume).toLocaleString()}` : "n/a";
  const domText = typeof btcDominance === "number" ? `${btcDominance.toFixed(2)}%` : "n/a";

  return {
    type: "market",
    summary: `Crypto market snapshot: total cap ${capText}, 24h volume ${volumeText}, BTC dominance ${domText}. Top movers/liquidity leaders: ${leaders}`,
    details: {
      global: {
        totalMarketCapUsd: totalCap ?? null,
        totalVolumeUsd: totalVolume ?? null,
        btcDominancePct: btcDominance ?? null
      },
      topMarkets: markets.map((coin) => ({
        id: coin.id,
        symbol: coin.symbol,
        name: coin.name,
        currentPrice: coin.current_price,
        marketCap: coin.market_cap,
        marketCapRank: coin.market_cap_rank,
        priceChange24hPct: coin.price_change_percentage_24h
      }))
    },
    references: [
      { label: "CoinGecko Global API", url: globalUrl },
      { label: "CoinGecko Markets API", url: marketsUrl }
    ]
  };
}

async function lookupGitHub(prompt: string, cache: Map<string, unknown>): Promise<LookupItem | null> {
  const repo = extractGitHubRepo(prompt);
  if (!repo) return null;

  const repoUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}`;
  const commitsUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}/commits?per_page=3`;
  const [meta, commits] = await Promise.all([
    fetchJson<Record<string, unknown>>(repoUrl, cache),
    fetchJson<Array<Record<string, unknown>>>(commitsUrl, cache)
  ]);

  return {
    type: "github",
    summary: `GitHub repo ${repo.owner}/${repo.repo} loaded with latest commits.`,
    details: {
      repo: {
        fullName: meta.full_name,
        stars: meta.stargazers_count,
        forks: meta.forks_count,
        openIssues: meta.open_issues_count,
        defaultBranch: meta.default_branch,
        description: meta.description
      },
      recentCommits: commits.map((commit) => ({
        sha: String(commit.sha ?? "").slice(0, 7),
        message: (commit.commit as { message?: string } | undefined)?.message ?? "",
        author: ((commit.commit as { author?: { name?: string } } | undefined)?.author?.name ?? "") as string
      }))
    },
    references: [
      { label: "GitHub Repo API", url: repoUrl },
      { label: "GitHub Commits API", url: commitsUrl }
    ]
  };
}

async function geocodeLocation(location: string, cache: Map<string, unknown>): Promise<{
  latitude: number;
  longitude: number;
  name: string;
  country?: string;
  timezone?: string;
} | null> {
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`;
  const geo = await fetchJson<{ results?: Array<Record<string, unknown>> }>(geoUrl, cache);
  const best = geo.results?.[0];
  if (!best) return null;

  return {
    latitude: Number(best.latitude),
    longitude: Number(best.longitude),
    name: String(best.name ?? location),
    country: best.country ? String(best.country) : undefined,
    timezone: best.timezone ? String(best.timezone) : undefined
  };
}

async function lookupWeatherAndGeo(prompt: string, cache: Map<string, unknown>): Promise<LookupItem[]> {
  const lower = prompt.toLowerCase();
  const location = extractLocation(prompt);
  if (!location) return [];

  const needsGeo = containsAny(lower, ["geocode", "coordinates", "lat", "lng", "latitude", "longitude"]);
  const needsWeather = containsAny(lower, ["weather", "forecast", "temperature"]);
  const needsTime = containsAny(lower, ["timezone", "time in", "local time"]);
  if (!needsGeo && !needsWeather && !needsTime) return [];

  const geo = await geocodeLocation(location, cache);
  if (!geo) return [];

  const items: LookupItem[] = [];
  items.push({
    type: "geocoding",
    summary: `Geocoded ${geo.name}${geo.country ? `, ${geo.country}` : ""} (${geo.latitude}, ${geo.longitude})`,
    details: geo,
    references: [
      {
        label: "Open-Meteo Geocoding API",
        url: `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`
      }
    ]
  });

  if (needsWeather) {
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&current=temperature_2m,wind_speed_10m&hourly=temperature_2m&timezone=auto`;
    const weather = await fetchJson<Record<string, unknown>>(weatherUrl, cache);
    const current = weather.current as Record<string, unknown> | undefined;
    items.push({
      type: "weather",
      summary: `Current weather near ${geo.name}: ${current?.temperature_2m ?? "n/a"}°C, wind ${current?.wind_speed_10m ?? "n/a"} km/h`,
      details: {
        location: geo,
        current
      },
      references: [{ label: "Open-Meteo Forecast API", url: weatherUrl }]
    });
  }

  if (needsTime && geo.timezone) {
    const timeUrl = `https://worldtimeapi.org/api/timezone/${encodeURIComponent(geo.timezone)}`;
    const time = await fetchJson<Record<string, unknown>>(timeUrl, cache);
    items.push({
      type: "timezone",
      summary: `Local time in ${geo.name}: ${String(time.datetime ?? "n/a")}`,
      details: {
        timezone: geo.timezone,
        datetime: time.datetime,
        utcOffset: time.utc_offset
      },
      references: [{ label: "WorldTimeAPI", url: timeUrl }]
    });
  }

  return items;
}

async function lookupDocs(prompt: string, cache: Map<string, unknown>): Promise<LookupItem | null> {
  const lower = prompt.toLowerCase();
  if (!containsAny(lower, ["documentation", "docs", "how to", "api reference"])) return null;

  const packages = detectDocPackages(prompt);
  if (!packages.length) return null;

  const details: Array<Record<string, unknown>> = [];
  const refs: LookupReference[] = [];

  for (const pkg of packages) {
    const normalized = pkg === "nextjs" ? "next" : pkg;
    const url = `https://registry.npmjs.org/${encodeURIComponent(normalized)}`;
    const data = await fetchJson<Record<string, unknown>>(url, cache, { timeoutMs: 7000 });
    const latest = String((data["dist-tags"] as { latest?: string } | undefined)?.latest ?? "");
    const latestMeta = latest && typeof data.versions === "object" ? (data.versions as Record<string, unknown>)[latest] : undefined;
    details.push({
      package: normalized,
      latestVersion: latest || null,
      description: (latestMeta as { description?: string } | undefined)?.description ?? data.description,
      homepage: (latestMeta as { homepage?: string } | undefined)?.homepage ?? data.homepage
    });
    refs.push({ label: `npm registry: ${normalized}`, url });
  }

  return {
    type: "docs",
    summary: `Documentation/package metadata loaded for: ${details.map((d) => d.package).join(", ")}`,
    details: { packages: details },
    references: refs
  };
}

async function lookupExchangeRates(prompt: string, cache: Map<string, unknown>): Promise<LookupItem | null> {
  const lower = prompt.toLowerCase();
  if (!containsAny(lower, ["exchange rate", "fx", "convert currency", "usd to", "eur to"])) return null;

  const base = lower.includes("eur") ? "EUR" : "USD";
  const url = `https://api.frankfurter.app/latest?from=${base}`;
  const data = await fetchJson<Record<string, unknown>>(url, cache);
  const rates = (data.rates as Record<string, number> | undefined) ?? {};
  const sample = ["USD", "EUR", "GBP", "JPY", "CAD"]
    .filter((code) => code !== base && rates[code] != null)
    .map((code) => `${base}/${code}: ${rates[code]}`);

  return {
    type: "exchange-rate",
    summary: `FX rates snapshot (${base} base): ${sample.join(", ") || "no sample rates available"}`,
    details: data,
    references: [{ label: "Frankfurter FX API", url }]
  };
}

export async function runExternalLookups(prompt: string): Promise<LookupResult> {
  const cache = new Map<string, unknown>();
  const items: LookupItem[] = [];
  const warnings: string[] = [];
  if (shouldDisableLookups(prompt)) {
    return { items, warnings };
  }

  const tasks: Array<Promise<void>> = [
    (async () => {
      try {
        const item = await lookupPrices(prompt, cache);
        if (item) items.push(item);
      } catch (error) {
        warnings.push(`price lookup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })(),
    (async () => {
      try {
        const item = await lookupCryptoMarket(prompt, cache);
        if (item) items.push(item);
      } catch (error) {
        warnings.push(`market lookup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })(),
    (async () => {
      try {
        const item = await lookupGitHub(prompt, cache);
        if (item) items.push(item);
      } catch (error) {
        warnings.push(`github lookup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })(),
    (async () => {
      try {
        const geoItems = await lookupWeatherAndGeo(prompt, cache);
        items.push(...geoItems);
      } catch (error) {
        warnings.push(`weather/geocoding lookup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })(),
    (async () => {
      try {
        const item = await lookupDocs(prompt, cache);
        if (item) items.push(item);
      } catch (error) {
        warnings.push(`docs lookup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })(),
    (async () => {
      try {
        const item = await lookupExchangeRates(prompt, cache);
        if (item) items.push(item);
      } catch (error) {
        warnings.push(`exchange-rate lookup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })()
  ];

  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(() => {
      warnings.push(`lookup budget exceeded (${LOOKUP_BUDGET_MS}ms), continuing with partial/offline context.`);
      resolve();
    }, LOOKUP_BUDGET_MS);
  });

  await Promise.race([Promise.all(tasks).then(() => undefined), timeoutPromise]);
  return { items, warnings };
}

export function serializeLookupsForPrompt(lookup: LookupResult): string {
  if (!lookup.items.length && !lookup.warnings.length) return "";

  const lines: string[] = [];
  lines.push("## External Lookup Context");
  lines.push(`Retrieved at: ${new Date().toISOString()}`);
  for (const item of lookup.items) {
    lines.push(`- [${item.type}] ${item.summary}`);
    for (const reference of item.references) {
      lines.push(`  - source: ${reference.label} - ${reference.url}`);
    }
  }
  for (const warning of lookup.warnings) {
    lines.push(`- [warning] ${warning}`);
  }
  return lines.join("\n");
}
