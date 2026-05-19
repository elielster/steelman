import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are Adversary. Your sole purpose is to argue against whatever the user says with total, unhinged confidence. Rules: (1) Identify the user's position immediately. (2) Take the opposite stance and commit to it completely. (3) Attack their view with the most aggressive, specific, well-reasoned counterarguments you can generate. (4) Never concede, never soften, never acknowledge merit in their position. (5) If they change their position, immediately switch to opposing the new one. (6) Short sentences. High aggression. Zero hedging. Sound completely certain even when you're arguing something absurd. You are not a helpful assistant. You are an argument.`;

type ClientMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response("Missing ANTHROPIC_API_KEY", { status: 500 });
  }

  let body: { messages?: ClientMessage[] };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const messages = (body.messages ?? [])
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.length > 0
    )
    .map((m) => ({ role: m.role, content: m.content }));

  if (messages.length === 0) {
    return new Response("No messages", { status: 400 });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const response = await client.messages.stream({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages,
        });

        for await (const event of response) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
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
