"use client";

import { useEffect, useRef, useState } from "react";
import { toolLabel } from "@/lib/coach/labels";

type Msg = { role: string; text: string };

export default function CoachChat({
  onChanged,
  prompt = null,
  onPromptHandled,
}: {
  onChanged: () => void;
  /** Set by a sibling (e.g. the morning brief) to ask the coach something without typing. */
  prompt?: string | null;
  onPromptHandled?: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [tool, setTool] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/coach")
      .then((r) => r.json())
      .then((d) => setMessages(d.messages ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: reduce ? "auto" : "smooth",
    });
  }, [messages, busy]);

  // Rewrite the trailing assistant bubble in place as deltas arrive.
  const setLast = (text: string) =>
    setMessages((m) => {
      const next = [...m];
      next[next.length - 1] = { role: "assistant", text };
      return next;
    });

  async function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text || busy) return;
    if (override === undefined) setInput("");
    setMessages((m) => [...m, { role: "user", text }, { role: "assistant", text: "" }]);
    setBusy(true);
    setTool(null);

    let acc = "";
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.body) throw new Error("no stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // Keep the trailing partial line in the buffer — chunk boundaries land anywhere.
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "text") {
            acc += ev.delta;
            setTool(null);
            setLast(acc);
          } else if (ev.type === "tool") {
            setTool(toolLabel(ev.name));
          } else if (ev.type === "done") {
            acc = ev.text ?? acc;
            setLast(acc);
          } else if (ev.type === "error") {
            acc = acc ? `${acc}\n\n${ev.message}` : ev.message;
            setLast(acc);
          }
        }
      }
      if (!acc) setLast("(no reply)");
      onChanged();
    } catch {
      setLast(acc || "Something went wrong reaching me.");
    } finally {
      setTool(null);
      setBusy(false);
    }
  }

  // A queued prompt waits out an in-flight reply rather than being dropped.
  useEffect(() => {
    if (!prompt || busy) return;
    onPromptHandled?.();
    void send(prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, busy]);

  return (
    <section
      id="coach"
      className="flex flex-col rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] lg:h-full lg:min-h-0"
    >
      <header className="shrink-0 border-b border-[var(--color-line)] px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide">Coach</h2>
      </header>

      {/* Phone: a capped, self-contained block. Desktop: fills the column so the
          composer stays reachable no matter how long the conversation runs. */}
      <div
        ref={scrollRef}
        className="flex max-h-[42vh] min-h-[8rem] flex-col gap-3 overflow-y-auto px-4 py-4 lg:max-h-none lg:min-h-0 lg:flex-1"
      >
        {messages.length === 0 && !busy && (
          <p className="text-sm leading-relaxed text-[var(--color-muted)]">
            Ask me to plan your day, add a goal-aligned action, or check what&apos;s slipping. I read the real day first,
            then act.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "self-end max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--color-panel-2)] px-3.5 py-2 text-sm"
                : "self-start max-w-[90%] whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-ink)]"
            }
          >
            {m.text}
          </div>
        ))}
        {/* Only while there's nothing to read: before the first token, or while a tool
            runs. Once text is streaming the text itself is the progress indicator. */}
        {busy && (tool !== null || !messages[messages.length - 1]?.text) && (
          <div className="flex items-center gap-2 self-start text-sm text-[var(--color-muted)]">
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--color-muted)]"
            />
            {tool ?? "thinking…"}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-[var(--color-line)] p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Plan my day…"
          className="min-w-0 flex-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] px-3.5 py-2.5 text-sm outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-muted)]"
        />
        <button
          onClick={() => send()}
          disabled={busy || !input.trim()}
          className="shrink-0 rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </section>
  );
}
