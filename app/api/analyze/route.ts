import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import {
  AnalysisError,
  MAX_HEADLINE_LENGTH,
  MAX_TICKERS,
  analyzeHeadline,
  parseTickers,
} from "@/lib/analyze";

// Web search runs can take a minute or more.
export const maxDuration = 300;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Request body must be JSON.", 400);
  }

  const { headline, portfolio } = (body ?? {}) as Record<string, unknown>;
  if (typeof headline !== "string" || typeof portfolio !== "string") {
    return errorResponse("Both headline and portfolio are required.", 400);
  }

  const trimmedHeadline = headline.trim();
  if (!trimmedHeadline) {
    return errorResponse("Enter a headline.", 400);
  }
  if (trimmedHeadline.length > MAX_HEADLINE_LENGTH) {
    return errorResponse(`Headlines are limited to ${MAX_HEADLINE_LENGTH} characters.`, 400);
  }

  const { tickers, invalid } = parseTickers(portfolio);
  if (invalid.length > 0) {
    return errorResponse(`These don't look like tickers: ${invalid.join(", ")}`, 400);
  }
  if (tickers.length === 0) {
    return errorResponse("Enter at least one ticker.", 400);
  }
  if (tickers.length > MAX_TICKERS) {
    return errorResponse(`Analyze at most ${MAX_TICKERS} tickers at a time.`, 400);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set");
    return errorResponse("The server is missing its API key.", 500);
  }

  try {
    const result = await analyzeHeadline(trimmedHeadline, tickers);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AnalysisError) {
      return errorResponse(error.message, error.status);
    }
    console.error("Analysis failed:", error);
    if (error instanceof Anthropic.RateLimitError) {
      return errorResponse("Too many requests right now. Wait a minute and try again.", 429);
    }
    if (error instanceof Anthropic.AuthenticationError) {
      return errorResponse("The server's API key was rejected.", 500);
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return errorResponse("Couldn't reach the analysis service. Try again.", 502);
    }
    if (error instanceof Anthropic.APIError && (error.status ?? 0) >= 500) {
      return errorResponse("The analysis service is busy. Try again shortly.", 503);
    }
    return errorResponse("Something went wrong running the analysis.", 500);
  }
}
