/**
 * Standalone script to test the headline -> portfolio propagation prompt
 * against the Anthropic API before wiring it into the app.
 *
 * Run with: npx tsx scripts/test-prompt.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error(
    "Missing ANTHROPIC_API_KEY. Set it in .env.local (see .env.local.example)."
  );
  process.exit(1);
}

const MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-5";

const anthropic = new Anthropic({ apiKey });

const SYSTEM_PROMPT = `You are a financial-impact analyst inside Vecta, a tool that traces how geopolitical and economic news could propagate to public companies.

You will be given a news headline and a list of portfolio tickers. For each ticker, determine whether the event described in the headline has a plausible, mechanistic connection to that company, and if so, how.

Rules:
- Do not force a connection. Most headlines are only relevant to a subset of any portfolio. If a ticker has no meaningful or plausible economic connection to the headline, set connection_found to false, confidence to "none", and leave reasoning_chain empty.
- Reasoning chains must be concrete and mechanistic (e.g., "export restriction -> input scarcity -> higher component cost -> margin pressure"), not vague sentiment or generic "markets may react" language.
- Confidence should reflect the strength and directness of the causal chain, not the size or newsworthiness of the headline. A dramatic headline with only an indirect link to a company should still get low confidence.
- Ground each ticker's analysis in that specific company's actual business (what it makes, sells, sources, or competes on), not just its sector label or index membership.
- If the connection is second- or third-order (e.g., through a competitor, supplier, or substitute good), say so explicitly in the reasoning chain rather than treating it as direct.
- Output must be submitted via the submit_analysis tool and must strictly conform to its schema. Do not include any commentary outside the tool call.`;

const ANALYSIS_TOOL: Anthropic.Tool = {
  name: "submit_analysis",
  description:
    "Submit the structured propagation analysis for a headline against a portfolio of tickers.",
  input_schema: {
    type: "object",
    properties: {
      headline: {
        type: "string",
        description: "The headline being analyzed, echoed back verbatim.",
      },
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
          },
          required: [
            "ticker",
            "connection_found",
            "confidence",
            "impact_direction",
            "reasoning_chain",
            "summary",
          ],
        },
      },
    },
    required: ["headline", "event_summary", "companies"],
  },
};

interface CompanyAnalysis {
  ticker: string;
  connection_found: boolean;
  confidence: "none" | "low" | "medium" | "high";
  impact_direction: "positive" | "negative" | "mixed" | "unclear";
  reasoning_chain: string[];
  summary: string;
}

interface AnalysisResult {
  headline: string;
  event_summary: string;
  companies: CompanyAnalysis[];
}

const TEST_HEADLINES: string[] = [
  "China announces new restrictions on rare-earth exports",
  "OPEC announces surprise production cuts",
  "EU proposes new tariffs on Chinese electric vehicles",
  "Apple announces record quarterly earnings",
];

const TEST_PORTFOLIO = ["NVDA", "TSLA", "AMD", "MSFT"];

async function analyzeHeadline(
  headline: string,
  portfolio: string[]
): Promise<AnalysisResult> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: [ANALYSIS_TOOL],
    tool_choice: { type: "tool", name: "submit_analysis" },
    messages: [
      {
        role: "user",
        content: `Headline: "${headline}"\nPortfolio: ${portfolio.join(", ")}`,
      },
    ],
  });

  const toolUseBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );

  if (!toolUseBlock) {
    throw new Error(
      `No tool_use block in response. Stop reason: ${response.stop_reason}`
    );
  }

  return toolUseBlock.input as AnalysisResult;
}

async function main() {
  for (const headline of TEST_HEADLINES) {
    console.log("=".repeat(80));
    console.log(`HEADLINE: ${headline}`);
    console.log(`PORTFOLIO: ${TEST_PORTFOLIO.join(", ")}`);
    console.log("-".repeat(80));

    try {
      const result = await analyzeHeadline(headline, TEST_PORTFOLIO);
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error("Error analyzing headline:", error);
    }

    console.log();
  }
}

main();
