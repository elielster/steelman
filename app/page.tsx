"use client";

import { useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

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
    <main className="flex h-dvh flex-col bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Adversary
          </h1>
          <p className="mt-1 text-sm text-neutral-400 sm:text-base">
            It will argue with everything you say.
          </p>
        </div>
      </header>

      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-4 py-6 sm:px-6"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {messages.length === 0 && (
            <div className="mt-12 text-center text-neutral-500">
              Say something. Anything. You will be wrong.
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "flex justify-end"
                  : "flex justify-start"
              }
            >
              <div
                className={
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-[15px] leading-relaxed sm:max-w-[75%] " +
                  (m.role === "user"
                    ? "bg-neutral-100 text-neutral-900"
                    : "bg-neutral-900 text-neutral-100 ring-1 ring-neutral-800")
                }
              >
                {m.content ||
                  (isStreaming && i === messages.length - 1 ? "…" : "")}
              </div>
            </div>
          ))}
        </div>
      </div>

      <footer className="border-t border-neutral-800 bg-neutral-950 px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="State your position…"
            className="flex-1 resize-none rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-[15px] text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-600 focus:outline-none"
            disabled={isStreaming}
          />
          <button
            onClick={send}
            disabled={isStreaming || !input.trim()}
            className="h-11 shrink-0 rounded-2xl bg-neutral-100 px-5 text-sm font-medium text-neutral-900 transition disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
          >
            {isStreaming ? "Arguing…" : "Send"}
          </button>
        </div>
      </footer>
    </main>
  );
}
