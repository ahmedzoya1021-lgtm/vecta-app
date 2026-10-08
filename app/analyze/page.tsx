"use client";

import { useState } from "react";

export default function AnalyzePage() {
  const [headline, setHeadline] = useState("");
  const [portfolio, setPortfolio] = useState("");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">Analyze a headline</h1>
      <p className="text-sm text-slate-400">
        Placeholder screen — not wired up yet.
      </p>

      <div className="flex flex-col gap-2">
        <label htmlFor="headline" className="text-sm font-medium text-slate-300">
          Headline
        </label>
        <textarea
          id="headline"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="e.g. China announces new restrictions on rare-earth exports"
          className="min-h-24 rounded-md border border-slate-700 bg-slate-900 p-3 text-sm text-slate-100 placeholder:text-slate-500"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="portfolio" className="text-sm font-medium text-slate-300">
          Portfolio (comma-separated tickers)
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
        type="button"
        disabled
        className="cursor-not-allowed rounded-md bg-indigo-500/50 px-5 py-2.5 text-sm font-medium text-white"
      >
        Analyze (not wired up yet)
      </button>
    </main>
  );
}
