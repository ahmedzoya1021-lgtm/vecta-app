/**
 * Standalone script to run the headline -> portfolio propagation analysis
 * (the same code the /api/analyze route uses) against a few sample headlines.
 *
 * Run with: npm run test-prompt
 * Each headline makes up to 5 web searches, so a full run costs real money.
 */

import dotenv from "dotenv";
import path from "node:path";
import { analyzeHeadline } from "../lib/analyze";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "Missing ANTHROPIC_API_KEY. Set it in .env.local (see .env.local.example)."
  );
  process.exit(1);
}

const TEST_HEADLINES: string[] = [
  "China announces new restrictions on rare-earth exports",
  "OPEC announces surprise production cuts",
  "EU proposes new tariffs on Chinese electric vehicles",
  "Apple announces record quarterly earnings",
];

const TEST_PORTFOLIO = ["NVDA", "TSLA", "AMD", "MSFT"];

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
