"use client";
import { useState } from "react";
import type { WorkflowDocumentation } from "@/lib/documentation";

interface WorkflowAssistantPanelProps {
  document: WorkflowDocumentation;
  onClose: () => void;
  onDownload: () => void;
  onGenerate: () => void;
  onSave: () => Promise<void>;
  saveStatus: { state: "idle" | "saving" | "saved" | "error"; message?: string };
  generationStatus: {
    state: "idle" | "loading" | "ready" | "fallback" | "error";
    source: "local" | "gemini" | "fallback";
    message?: string;
  };
}

export default function WorkflowAssistantPanel({
  document,
  onClose,
  onDownload,
  onGenerate,
  onSave,
  saveStatus,
  generationStatus,
}: WorkflowAssistantPanelProps) {
  const [view, setView] = useState<"summary" | "markdown">("summary");

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-slate-950/75 px-4 py-10 backdrop-blur-sm">
      <div className="flex h-[calc(100vh-5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-sky-400">
              AI Assistant
            </div>
            <div className="mt-1 text-lg font-semibold text-white">
              {document.title}
            </div>
            <div className="mt-1 text-sm text-slate-400">
              Generated from the current workflow graph, node content, and branch conditions.
            </div>
            <div className="mt-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
              {generationStatus.source === "gemini"
                ? "Source: Gemini CLI"
                : generationStatus.source === "fallback"
                  ? "Source: Local fallback"
                  : "Source: Local draft"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onGenerate}
              disabled={generationStatus.state === "loading"}
              className="rounded-md border border-violet-400 bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generationStatus.state === "loading" ? "Generating..." : "Generate"}
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saveStatus.state === "saving" || generationStatus.state === "loading"}
              className="rounded-md border border-emerald-500 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveStatus.state === "saving" ? "Saving..." : "Save .md"}
            </button>
            <button
              type="button"
              onClick={onDownload}
              disabled={generationStatus.state === "loading"}
              className="rounded-md border border-sky-400 bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
            >
              Download .md
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-400"
            >
              Close
            </button>
          </div>
        </div>
        <div className="border-b border-slate-700 px-6 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setView("summary")}
              className={`rounded-md px-3 py-1.5 text-sm ${
                view === "summary"
                  ? "bg-sky-600 text-white"
                  : "border border-slate-700 text-slate-300"
              }`}
            >
              Summary
            </button>
            <button
              type="button"
              onClick={() => setView("markdown")}
              className={`rounded-md px-3 py-1.5 text-sm ${
                view === "markdown"
                  ? "bg-sky-600 text-white"
                  : "border border-slate-700 text-slate-300"
              }`}
            >
              Markdown
            </button>
          </div>
          {generationStatus.message ? (
            <div
              className={`mt-3 text-sm ${
                generationStatus.state === "error" || generationStatus.state === "fallback"
                  ? "text-amber-300"
                  : "text-sky-300"
              }`}
            >
              {generationStatus.message}
            </div>
          ) : null}
          {saveStatus.message ? (
            <div
              className={`mt-3 text-sm ${
                saveStatus.state === "error" ? "text-rose-300" : "text-emerald-300"
              }`}
            >
              {saveStatus.message}
            </div>
          ) : null}
        </div>
        <div className="flex-1 overflow-auto px-6 py-5">
          {view === "summary" ? (
            <div className="space-y-6">
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Executive Summary
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-200">
                  {document.summary}
                </p>
              </section>
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Highlights
                </h2>
                <ul className="mt-3 space-y-2 text-sm text-slate-200">
                  {document.highlights.map((item) => (
                    <li key={item} className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">
                  What This Generates
                </h2>
                <div className="mt-3 grid gap-3 text-sm text-slate-200 md:grid-cols-2">
                  <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-3">
                    Primary flow narrative
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-3">
                    Decision and condition documentation
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-3">
                    Error and boundary route explanation
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-3">
                    Full node-by-node reference in Markdown
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <pre className="whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-900 p-4 text-[12px] leading-6 text-slate-200">
              {document.markdown}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
