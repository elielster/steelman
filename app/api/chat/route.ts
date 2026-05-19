import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are Adversary, a championship-level debate sparring partner. The user comes here to stress-test their views by hearing the strongest case against whatever they say. Your job is to produce the BEST POSSIBLE opposing argument — not a strawman, not a cheap shot, but the version that would actually be hardest for them to answer.

Core discipline:
1. Identify the user's claim precisely. Before attacking, steelman it internally — what is the strongest version of their position? Attack THAT version, not a weaker one.
2. Construct the strongest opposing case. What would the smartest, most informed opponent say? Use that.
3. Structure each argument: claim → mechanism (why it's true) → evidence (specifics) → the obvious counter the user would raise → why that counter fails.
4. Be specific. Name studies, thinkers, historical cases, mechanisms, numbers. "The data shows" is weaker than naming the actual finding. Vague aggression is weak; specific aggression is devastating.
5. Anticipate the user's best rebuttal and dismantle it pre-emptively. Great arguers don't wait for the counter — they pre-empt it.
6. Distinguish claim types and attack each correctly:
   - Empirical claims → attack with mechanism, base rates, replication issues, selection effects, alternative explanations.
   - Normative claims → attack with consequences, edge cases, principle conflicts, who-decides questions, hidden tradeoffs.
   - Predictive claims → attack with track record, reference class, Goodhart's law, second-order effects, the assumption that current trends continue.

Style:
- Short sentences. High conviction. No hedging on conclusions.
- Never write "on the other hand," "you make a fair point," "to be fair," "I'll grant you." You are not balancing. You are arguing.
- Sharp, not sneering. Contemptuous of the argument, not the person.
- If the user shifts position, immediately switch sides and attack the new claim with the same discipline.

Hard rules — never break these:
- NEVER invent statistics, studies, quotes, dates, or events. If you do not have a specific real citation, argue from mechanism and principle instead. Confident bullshit destroys credibility and is the one thing that ruins a steelman.
- NEVER deny well-established science (climate change, vaccine safety, evolution, age of the universe, germ theory, etc.). When the user states settled science, do not argue the science is wrong. Stay in character: attack their framing, priorities, policy implications, what they are overweighting, what they are ignoring, what their position commits them to. Never explain the pivot. Just attack the adjacent claim with the same aggression.

You are not a helpful assistant. You are a sparring partner at championship level. Give them the hardest, smartest fight they have ever had.`;

type ClientMessage = {
  role: "user" | "assistant";
  content: string;
};

// Per-IP rate limit. In-memory per Lambda instance: Vercel may run several
// instances in parallel, so the effective ceiling is ~limit × instance_count.
// Good enough to stop a single bad actor draining the API key; switch to
// Upstash Redis (@upstash/ratelimit) if traffic ever justifies it.
const RATE_LIMITS = [
  { windowMs: 60_000, max: 10 }, // 10 / minute
  { windowMs: 60 * 60_000, max: 100 }, // 100 / hour
] as const;

const ipHits = new Map<string, number[]>();

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function rateLimit(ip: string): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const maxWindow = Math.max(...RATE_LIMITS.map((l) => l.windowMs));
  const recent = (ipHits.get(ip) ?? []).filter((t) => now - t < maxWindow);

  for (const { windowMs, max } of RATE_LIMITS) {
    const count = recent.filter((t) => now - t < windowMs).length;
    if (count >= max) {
      const oldestInWindow = recent.filter((t) => now - t < windowMs)[0];
      const retryAfter = Math.ceil((oldestInWindow + windowMs - now) / 1000);
      return { ok: false, retryAfter: Math.max(retryAfter, 1) };
    }
  }

  recent.push(now);
  ipHits.set(ip, recent);

  // Opportunistic GC so the map doesn't grow unbounded.
  if (ipHits.size > 2000) {
    for (const [k, ts] of ipHits) {
      if (ts.every((t) => now - t > maxWindow)) ipHits.delete(k);
    }
  }

  return { ok: true };
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response("Missing ANTHROPIC_API_KEY", { status: 500 });
  }

  const ip = clientIp(req);
  const limit = rateLimit(ip);
  if (!limit.ok) {
    return new Response(
      `Rate limit exceeded. Try again in ${limit.retryAfter}s.`,
      {
        status: 429,
        headers: {
          "Retry-After": String(limit.retryAfter),
          "Content-Type": "text/plain; charset=utf-8",
        },
      }
    );
  }

  let body: { messages?: ClientMessage[] };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const cleaned = (body.messages ?? []).filter(
    (m) =>
      m &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string" &&
      m.content.length > 0
  );

  if (cleaned.length === 0) {
    return new Response("No messages", { status: 400 });
  }

  // Prompt caching: mark the system prompt and the final message as cache
  // breakpoints. On turn N+1, the prefix through turn N's final message will
  // be a cache hit (~10% of base input cost) instead of a full re-read.
  // First-turn writes are no-ops if the prefix is under the model's minimum
  // cacheable token count (1024 for Sonnet).
  const apiMessages = cleaned.map((m, i) => {
    const isLast = i === cleaned.length - 1;
    return {
      role: m.role,
      content: [
        {
          type: "text" as const,
          text: m.content,
          ...(isLast ? { cache_control: { type: "ephemeral" as const } } : {}),
        },
      ],
    };
  });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const response = await client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 2048,
          system: [
            {
              type: "text",
              text: SYSTEM_PROMPT,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: apiMessages,
        });

        for await (const event of response) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          } else if (event.type === "message_start") {
            const u = event.message.usage;
            console.log(
              `[cache] input=${u.input_tokens} cache_read=${u.cache_read_input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0}`
            );
          }
        }
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "stream error";
        controller.enqueue(encoder.encode(`\n[error: ${msg}]`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
