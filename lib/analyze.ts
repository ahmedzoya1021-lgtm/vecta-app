/**
 * Headline -> portfolio propagation analysis, grounded in current web sources.
 * Shared by the /api/analyze route and scripts/test-prompt.ts.
 */

import Anthropic from "@anthropic-ai/sdk";

export const DEFAULT_MODEL = "claude-sonnet-5-5";
export const MAX_SEARCHES = 5;
export const MAX_TICKERS = 10;
export const MAX_HEADLINE_LENGTH = 500;

// Server-side turns can pause mid-search; this bounds the resume/nudge loop.
const MAX_REQUESTS = 3;
const TICKER_PATTERN = /^[A-Z0-9][A-Z0-9.\-]{0,9}$/;

const SYSTEM_PROMPT = `You are a financial-impact analyst inside Vecta, a tool that traces how geopolitical and economic news could propagate to public companies.

You will be given a news headline and a list of portfolio tickers. For each ticker, determine whether the event described in the headline has a plausible, mechanistic connection to that company, and if so, how.

Process:
- Use web_search to find current reporting on the event and on each company's relevant exposure (suppliers, markets, products, regulation). Base your analysis on what the sources say, not only on prior knowledge.
- When you are done researching, call submit_analysis exactly once with your full analysis.

Rules:
- Do not force a connection. Most headlines are only relevant to a subset of any portfolio. If a ticker has no meaningful or plausible economic connection to the headline, set connection_found to false, confidence to "none", and leave reasoning_chain empty.
- Reasoning chains must be concrete and mechanistic (e.g., "export restriction -> input scarcity -> higher component cost -> margin pressure"), not vague sentiment or generic "markets may react" language.
- Confidence should reflect the strength and directness of the causal chain, not the size or newsworthiness of the headline. A dramatic headline with only an indirect link to a company should still get low confidence.
- Ground each ticker's analysis in that specific company's actual business (what it makes, sells, sources, or competes on), not just its sector label or index membership.
- If the connection is second- or third-order (e.g., through a competitor, supplier, or substitute good), say so explicitly in the reasoning chain rather than treating it as direct.
- In each company's sources, list only URLs that appeared in your web_search results and that support that company's analysis. Leave it empty rather than citing a page you did not see.`;

const ANALYSIS_TOOL: Anthropic.Beta.BetaTool = {
  name: "submit_analysis",
  description:
    "Submit the structured propagation analysis for a headline against a portfolio of tickers.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      event_summary: {
        type: "string",
        description:
          "A one- or two-sentence neutral summary of the underlying event, independent of any specific company.",
      },
      companies: {
        type: "array",
        description:
          "One entry per ticker in the requested portfolio, in the order they were given.",
        items: {
          type: "object",
          properties: {
            ticker: {
              type: "string",
              description: "The stock ticker, e.g. NVDA.",
            },
            connection_found: {
              type: "boolean",
              description:
                "Whether there is a plausible, mechanistic connection between the event and this company.",
            },
            confidence: {
              type: "string",
              enum: ["none", "low", "medium", "high"],
              description:
                "Confidence in the connection's strength and directness, not the headline's importance.",
            },
            impact_direction: {
              type: "string",
              enum: ["positive", "negative", "mixed", "unclear"],
              description:
                "Expected direction of impact on the company if the connection holds.",
            },
            reasoning_chain: {
              type: "array",
              items: { type: "string" },
              description:
                "Ordered list of concrete causal steps from the event to this company. Empty if connection_found is false.",
            },
            summary: {
              type: "string",
              description:
                "1-3 sentence plain-English explanation suitable for a retail investor.",
            },
            sources: {
              type: "array",
              items: { type: "string" },
              description:
                "URLs from your web_search results that support this company's analysis.",
            },
          },
          required: [
            "ticker",
            "connection_found",
            "confidence",
            "impact_direction",
            "reasoning_chain",
            "summary",
            "sources",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["event_summary", "companies"],
    additionalProperties: false,
  },
};

export interface Source {
  url: string;
  title: string;
}

export interface CompanyAnalysis {
  ticker: string;
  connection_found: boolean;
  confidence: "none" | "low" | "medium" | "high";
  impact_direction: "positive" | "negative" | "mixed" | "unclear";
  reasoning_chain: string[];
  summary: string;
  sources: Source[];
}

export interface AnalysisResult {
  headline: string;
  event_summary: string;
  companies: CompanyAnalysis[];
  model: string;
  generated_at: string;
}

type SubmittedAnalysis = {
  event_summary: string;
  companies: (Omit<CompanyAnalysis, "sources"> & { sources: string[] })[];
};

/** An error whose message is safe to show to the user. */
export class AnalysisError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Split "nvda, $TSLA amd" into normalized, de-duplicated tickers. */
export function parseTickers(input: string): {
  tickers: string[];
  invalid: string[];
} {
  const tickers: string[] = [];
  const invalid: string[] = [];
  for (const raw of input.split(/[\s,]+/)) {
    if (!raw) continue;
    const ticker = raw.replace(/^\$/, "").toUpperCase();
    if (!TICKER_PATTERN.test(ticker)) invalid.push(raw);
    else if (!tickers.includes(ticker)) tickers.push(ticker);
  }
  return { tickers, invalid };
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** Record every page the searches returned or the model cited, keyed by URL. */
function collectSources(
  content: Anthropic.Beta.BetaContentBlock[],
  into: Map<string, Source>,
) {
  for (const block of content) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const result of block.content) {
        into.set(normalizeUrl(result.url), { url: result.url, title: result.title });
      }
    } else if (block.type === "text") {
      for (const citation of block.citations ?? []) {
        if (citation.type === "web_search_result_location") {
          const key = normalizeUrl(citation.url);
          if (!into.has(key)) {
            into.set(key, { url: citation.url, title: citation.title ?? citation.url });
          }
        }
      }
    }
  }
}

export async function analyzeHeadline(
  headline: string,
  tickers: string[],
): Promise<AnalysisResult> {
  // Constructed per call so scripts can load .env.local before the first use.
  const client = new Anthropic();
  const model = process.env.CLAUDE_MODEL || DEFAULT_MODEL;
  const today = new Date().toISOString().slice(0, 10);

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: `Today's date: ${today}\nHeadline: "${headline}"\nPortfolio: ${tickers.join(", ")}`,
    },
  ];
  const seenSources = new Map<string, Source>();

  for (let attempt = 0; attempt < MAX_REQUESTS; attempt++) {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: SYSTEM_PROMPT,
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: MAX_SEARCHES },
        ANALYSIS_TOOL,
      ],
      messages,
    });

    if (response.stop_reason === "refusal") {
      throw new AnalysisError("The model declined to analyze this headline.", 422);
    }
    if (response.stop_reason === "max_tokens") {
      throw new AnalysisError("The analysis was too long and got cut off. Try fewer tickers.", 502);
    }

    collectSources(response.content, seenSources);

    const submission = response.content.find(
      (block): block is Anthropic.Beta.BetaToolUseBlock =>
        block.type === "tool_use" && block.name === "submit_analysis",
    );
    if (submission) {
      return buildResult(headline, tickers, submission.input as SubmittedAnalysis, seenSources, response.model);
    }

    messages.push({ role: "assistant", content: response.content });
    if (response.stop_reason !== "pause_turn") {
      // Finished without submitting; ask once more for the structured result.
      messages.push({
        role: "user",
        content: "Submit your analysis now by calling submit_analysis.",
      });
    }
  }

  throw new AnalysisError("The model did not return an analysis. Please try again.", 502);
}

function buildResult(
  headline: string,
  tickers: string[],
  submitted: SubmittedAnalysis,
  seenSources: Map<string, Source>,
  model: string,
): AnalysisResult {
  const byTicker = new Map(
    submitted.companies.map((company) => [company.ticker.toUpperCase(), company]),
  );

  const companies = tickers.flatMap((ticker) => {
    const company = byTicker.get(ticker);
    if (!company) return [];
    // Keep only sources the searches actually returned, so no link is invented.
    const sources = [...new Set(company.sources.map(normalizeUrl))]
      .map((url) => seenSources.get(url))
      .filter((source): source is Source => source !== undefined);
    return [{ ...company, ticker, sources }];
  });

  if (companies.length === 0) {
    throw new AnalysisError("The model returned an analysis for none of the tickers.", 502);
  }

  return {
    headline,
    event_summary: submitted.event_summary,
    companies,
    model,
    generated_at: new Date().toISOString(),
  };
}
