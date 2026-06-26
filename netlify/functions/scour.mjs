// Netlify function — POST /api/scour  (routed via netlify.toml)
// Holds your Anthropic API key server-side. Set ANTHROPIC_API_KEY in Netlify's UI.

const INSTRUCTION =
"You are a B2B SaaS competitive-research assistant for a content strategist who writes comparison and 'alternatives' pages. Use web search to find REAL, recurring complaints actual users have posted about the competitor's product on public sites: G2, Capterra, TrustRadius, Gartner Peer Insights, Reddit, and Hacker News. Rules: (1) Only include a weakness if you can tie it to a real source URL you actually found via search. (2) Paraphrase every complaint in your own words — never copy more than a few words from any review. (3) Prefer weaknesses that recur across multiple users and that a buyer comparing tools would already have run into. (4) For each weakness write an 'angle': one sentence on how to weave it into a comparison-page intro so the buyer feels seen. Return ONLY a valid JSON object — no markdown fences, no preamble, no commentary.";

function buildUser(competitor, category, yours) {
  return "Competitor: " + competitor + ".\n"
    + "Category: " + (category || "(infer the product category yourself)") + ".\n"
    + (yours
        ? "The reader sells: " + yours + ". Frame each angle to set up why a buyer might prefer it — but never invent features it may not have.\n"
        : "No specific alternative product given; keep the angles product-neutral.\n")
    + "Find up to 6 distinct, recurring user-reported weaknesses.\n"
    + 'Return JSON exactly in this shape: {"competitor": string, "category": string, "complaints": [{"theme": string (2-4 words), "complaint": string (your own words, under 25 words), "source": string (platform name), "url": string (the exact page you found it on), "angle": string (one sentence)}]}\n'
    + "Return ONLY the JSON object.";
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json({ error: "ANTHROPIC_API_KEY is not set on the server." }, 500);

  try {
    const { competitor, category, yourProduct } = await req.json();
    if (!competitor || !String(competitor).trim()) {
      return json({ error: "competitor is required" }, 400);
    }

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: INSTRUCTION,
        messages: [{ role: "user", content: buildUser(competitor, category, yourProduct) }],
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }]
      })
    });

    const data = await r.json();
    if (!r.ok) return json({ error: data.error?.message || "Upstream error" }, r.status);
    return json(data, 200);
  } catch (e) {
    return json({ error: e.message || "Server error" }, 500);
  }
};
