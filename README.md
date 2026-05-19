# Steel Man

A chatbot that will always present the strongest possible argument for
whatever you don't believe.

State a position. Steel Man takes the opposite stance and defends it with
specific, well-reasoned counterarguments — championship-debate quality,
no fabricated facts, won't deny established science.

## Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Felielster%2Fadversary&env=ANTHROPIC_API_KEY&envDescription=Anthropic%20API%20key%20from%20console.anthropic.com&project-name=adversary&repository-name=adversary)

Set `ANTHROPIC_API_KEY` when prompted. Get one at
<https://console.anthropic.com/>.

## Local setup

```bash
npm install
cp .env.local.example .env.local
# edit .env.local and paste your key
npm run dev
```

Open <http://localhost:3000>.

## Stack

- Next.js App Router (15)
- Tailwind CSS
- Anthropic SDK (`@anthropic-ai/sdk`) — model `claude-sonnet-4-6`
- Streaming responses via `/api/chat`
- API key stays server-side
