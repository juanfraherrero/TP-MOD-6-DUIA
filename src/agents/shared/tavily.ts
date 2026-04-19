import { createLogger } from "@/lib/logger";

const log = createLogger("agent:tavily");

type TavilyResult = {
  title: string;
  url: string;
  content: string;
  score: number;
};

type TavilyResponse = {
  query: string;
  answer?: string;
  results?: TavilyResult[];
  response_time?: number;
};

export type TavilySearchResult = {
  answer: string;
  sources: { url: string; title: string }[];
};

export type TavilyOptions = {
  maxResults?: number;
  searchDepth?: "basic" | "advanced";
};

export async function tavilySearch(
  query: string,
  options: TavilyOptions = {},
): Promise<TavilySearchResult | null> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    log.warn("TAVILY_API_KEY ausente — skip enrichment");
    return null;
  }

  const end = log.time(`tavily "${query.slice(0, 40)}"`);
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: options.searchDepth ?? "basic",
        include_answer: true,
        max_results: options.maxResults ?? 3,
      }),
    });

    if (!res.ok) {
      log.error("tavily http error", { status: res.status });
      return null;
    }

    const data = (await res.json()) as TavilyResponse;
    end();

    const sourceTexts = (data.results ?? [])
      .map((r) => r.content)
      .filter(Boolean)
      .join("\n\n");
    const answer = data.answer || sourceTexts || "";

    return {
      answer,
      sources: (data.results ?? []).map((r) => ({ url: r.url, title: r.title })),
    };
  } catch (err) {
    log.error("tavily fetch fallo", { error: String(err) });
    return null;
  }
}
