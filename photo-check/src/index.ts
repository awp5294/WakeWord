// Wake Word photo check: a Cloudflare Worker that asks Claude whether a photo shows the word's object.
// The Anthropic API key lives here as a Worker secret (ANTHROPIC_API_KEY), never in the app.
import Anthropic from "@anthropic-ai/sdk";

interface Env {
  ANTHROPIC_API_KEY: string;
  // Optional shared token the app sends in x-wakeword-token. A speed bump against strangers, not a secret.
  APP_TOKEN?: string;
}

type CheckRequest = { image: string; word: string; english: string; language: string };

const MAX_IMAGE_CHARS = 1_500_000; // about 1.1 MB of JPEG, plenty for a 768px photo

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") return json({ error: "POST a photo" }, 405);
    if (env.APP_TOKEN && request.headers.get("x-wakeword-token") !== env.APP_TOKEN) {
      return json({ error: "Not allowed" }, 401);
    }

    let body: CheckRequest;
    try {
      body = (await request.json()) as CheckRequest;
    } catch {
      return json({ error: "Bad JSON" }, 400);
    }
    const { image, word, english, language } = body;
    if (typeof image !== "string" || !image || image.length > MAX_IMAGE_CHARS) return json({ error: "Missing or oversized image" }, 400);
    if (![word, english, language].every((s) => typeof s === "string" && s.length > 0 && s.length < 80)) {
      return json({ error: "Missing word" }, 400);
    }

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    try {
      const response = await client.beta.messages.create({
        model: "claude-opus-5-5",
        max_tokens: 2000,
        output_config: { effort: "low" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
              {
                type: "text",
                text:
                  `A language learner was asked to find and photograph "${word}" (${language} for "${english}") ` +
                  `to switch off their morning alarm. Does this photo show that thing? Be lenient: part of it, ` +
                  `an unusual style, poor light or a cluttered shot all count. A picture of it on a screen or in ` +
                  `print does not count. Reply with YES or NO, then a dash and at most 12 words saying what you see.`,
              },
            ],
          },
        ],
      });

      if (response.stop_reason === "refusal") return json({ ok: false, reason: "The photo couldn't be checked." });
      const text = response.content
        .flatMap((b) => (b.type === "text" ? [b.text] : []))
        .join(" ")
        .trim();
      const ok = /^\W*yes\b/i.test(text);
      const reason = text.replace(/^\W*(yes|no)\b\W*/i, "").slice(0, 140);
      return json({ ok, reason });
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) return json({ error: "Busy, try again" }, 429);
      if (error instanceof Anthropic.APIError) return json({ error: `Check failed (${error.status ?? "network"})` }, 502);
      return json({ error: "Check failed" }, 500);
    }
  },
};
