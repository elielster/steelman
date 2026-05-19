"use client";

import { useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

const KNIGHT: string[] = [
  "......PP......",
  ".....PPPP.....",
  ".....PPPP.....",
  "...HHHHHHHH...",
  "..HHHHHHHHHH..",
  "..HHEEHHEEHH..",
  "..HHHHHHHHHH..",
  "....HHHHHH....",
  "..BBBBBBBBBB..",
  "BBBBBBBBBBBBBB",
  "BBGGGGGGGGGGBB",
  ".BAGGSSSSGGAB.",
  ".BBAGSSSSGABB.",
  "..BBBASSABBB..",
  "...BBBSSBBB...",
  "....BBSSBB....",
  "....BBSSBB....",
  "....LLSSLL....",
  "....LLSSLL....",
  "....LLSSLL....",
  "....LLSSLL....",
  "....LLSSLL....",
  "...KKKSSKKK...",
  "..KKKKKKKKKK..",
];

const KNIGHT_COLORS: Record<string, string> = {
  P: "#d94646", // plume red
  H: "#3f4a5c", // helmet (darker steel)
  E: "#0a0a0a", // eye slit
  B: "#5b6778", // breastplate
  A: "#aab4c2", // armor highlight (hands, gauntlets)
  G: "#2a3340", // crossguard / hilt (dark steel)
  S: "#dee3eb", // sword blade
  L: "#3f4a5c", // legs / greaves
  K: "#1a2230", // boots
};

function Knight({ size }: { size: number }) {
  const w = KNIGHT[0].length;
  const h = KNIGHT.length;
  const rects: React.ReactNode[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = KNIGHT[y][x];
      if (c === ".") continue;
      const fill = KNIGHT_COLORS[c];
      if (!fill) continue;
      rects.push(
        <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={fill} />
      );
    }
  }
  return (
    <svg
      width={size}
      height={(size * h) / w}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      style={{ imageRendering: "pixelated" }}
      aria-hidden="true"
    >
      {rects}
    </svg>
  );
}

export default function Page() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [input]);

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    const userMsg: Message = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setIsStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = {
            role: "assistant",
            content: `[error: ${errText || res.statusText}]`,
          };
          return copy;
        });
        setIsStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "request failed";
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = {
          role: "assistant",
          content: `[error: ${msg}]`,
        };
        return copy;
      });
    } finally {
      setIsStreaming(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <main className="flex h-dvh flex-col bg-[#6cb9e8] text-white">
      <header className="px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto flex max-w-3xl items-center justify-center gap-4 sm:gap-8">
          <div className="hidden sm:block">
            <Knight size={140} />
          </div>
          <div className="sm:hidden">
            <Knight size={70} />
          </div>
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight drop-shadow-sm sm:text-6xl">
              Steel Man
            </h1>
            <p className="mt-3 max-w-md text-sm leading-snug text-white/95 sm:text-base">
              A chatbot that will always present the strongest possible
              argument for whatever you don&apos;t believe.
            </p>
          </div>
          <div className="hidden sm:block">
            <Knight size={140} />
          </div>
          <div className="sm:hidden">
            <Knight size={70} />
          </div>
        </div>
      </header>

      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-4 py-6 sm:px-6"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {messages.length === 0 && (
            <div className="mt-8 text-center text-white/85">
              State a position. You will hear the strongest case against it.
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user" ? "flex justify-end" : "flex justify-start"
              }
            >
              <div
                className={
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-[15px] leading-relaxed text-white shadow-sm sm:max-w-[75%] " +
                  (m.role === "user"
                    ? "bg-[#e76b6b]"
                    : "bg-[#f08585]")
                }
              >
                {m.content ||
                  (isStreaming && i === messages.length - 1 ? "…" : "")}
              </div>
            </div>
          ))}
        </div>
      </div>

      <footer className="px-4 py-3 sm:px-6 sm:py-4">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="State your position…"
            className="flex-1 resize-none rounded-2xl bg-[#f08585] px-4 py-3 text-[15px] text-white placeholder:text-white/70 focus:outline-none focus:ring-2 focus:ring-white/60"
            disabled={isStreaming}
          />
          <button
            onClick={send}
            disabled={isStreaming || !input.trim()}
            className="h-11 shrink-0 rounded-2xl bg-white px-5 text-sm font-semibold text-[#3a7ab0] shadow-sm transition disabled:cursor-not-allowed disabled:bg-white/50 disabled:text-white/80"
          >
            {isStreaming ? "Arguing…" : "Send"}
          </button>
        </div>
      </footer>
    </main>
  );
}
