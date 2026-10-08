"use client";

import { useState, type FormEvent } from "react";
import type { AnalysisResult, CompanyAnalysis } from "@/lib/analyze";

const CONFIDENCE_STYLES: Record<CompanyAnalysis["confidence"], string> = {
  none: "bg-slate-800 text-slate-400",
  low: "bg-amber-500/15 text-amber-300",
  medium: "bg-orange-500/15 text-orange-300",
  high: "bg-rose-500/15 text-rose-300",
};

const DIRECTION_STYLES: Record<CompanyAnalysis["impact_direction"], string> = {
  positive: "bg-emerald-500/15 text-emerald-300",
  negative: "bg-rose-500/15 text-rose-300",
  mixed: "bg-sky-500/15 text-sky-300",
  unclear: "bg-slate-800 text-slate-400",
};

function isSafeLink(url: string) {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

export default function AnalyzePage() {
  const [headline, setHeadline] = useState("");
  const [portfolio, setPortfolio] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const canSubmit = headline.trim() !== "" && portfolio.trim() !== "" && !loading;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headline, portfolio }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error ?? `Request failed (${response.status}).`);
      }
      setResult(data as AnalysisResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">Analyze a headline</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="headline" className="text-sm font-medium text-slate-300">
            Headline
          </label>
          <textarea
            id="headline"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            maxLength={500}
            placeholder="e.g. China announces new restrictions on rare-earth exports"
            className="min-h-24 rounded-md border border-slate-700 bg-slate-900 p-3 text-sm text-slate-100 placeholder:text-slate-500"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="portfolio" className="text-sm font-medium text-slate-300">
            Portfolio (comma-separated tickers, up to 10)
          </label>
          <input
            id="portfolio"
            value={portfolio}
            onChange={(e) => setPortfolio(e.target.value)}
            placeholder="NVDA, TSLA, AMD, MSFT"
            className="rounded-md border border-slate-700 bg-slate-900 p-3 text-sm text-slate-100 placeholder:text-slate-500"
          />
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-md bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-indigo-500/50"
        >
          {loading ? "Searching sources…" : "Analyze"}
        </button>
      </form>

      {loading && (
        <p className="text-sm text-slate-400" role="status">
          Searching recent coverage and tracing each company. This usually takes 1–2 minutes.
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </p>
      )}

      {result && <Results result={result} />}
    </main>
  );
}

function Results({ result }: { result: AnalysisResult }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-md border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-sm font-medium text-slate-300">Event</h2>
        <p className="mt-1 text-sm text-slate-100">{result.event_summary}</p>
        <p className="mt-2 text-xs text-slate-500">
          Generated {new Date(result.generated_at).toLocaleString()} · {result.model}
        </p>
      </div>

      {result.companies.map((company) => (
        <CompanyCard key={company.ticker} company={company} />
      ))}
    </section>
  );
}

function CompanyCard({ company }: { company: CompanyAnalysis }) {
  const links = company.sources.filter((source) => isSafeLink(source.url));

  return (
    <article className="flex flex-col gap-3 rounded-md border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-lg font-semibold">{company.ticker}</h3>
        <span className={`rounded px-2 py-0.5 text-xs ${CONFIDENCE_STYLES[company.confidence]}`}>
          {company.confidence} confidence
        </span>
        {company.connection_found && (
          <span className={`rounded px-2 py-0.5 text-xs ${DIRECTION_STYLES[company.impact_direction]}`}>
            {company.impact_direction}
          </span>
        )}
      </div>

      <p className="text-sm text-slate-200">{company.summary}</p>

      {company.reasoning_chain.length > 0 && (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-400">
          {company.reasoning_chain.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      )}

      {links.length > 0 && (
        <div>
          <h4 className="text-xs font-medium uppercase tracking-wide text-slate-500">Sources</h4>
          <ul className="mt-1 space-y-1 text-sm">
            {links.map((source) => (
              <li key={source.url}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-300 underline-offset-2 hover:underline"
                >
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
