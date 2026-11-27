/** Only AI failures belong here: auth, score loading and persistence stay outside. */
export async function withTuneAiFallback<T>(options: {
  apiKey?: string;
  request: unknown;
  toolName: string;
  parse: (value: unknown) => T;
  fallback: () => T;
  timeoutMs?: number;
}): Promise<T> {
  if (!options.apiKey) return options.fallback();
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(options.request),
      signal: AbortSignal.timeout(options.timeoutMs ?? 8_000),
    });
    if (!response.ok) throw new Error(`AI gateway returned ${response.status}`);
    const data = await response.json();
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    if (call?.function?.name !== options.toolName) throw new Error("Invalid AI tool response");
    return options.parse(JSON.parse(call.function.arguments));
  } catch (error) {
    console.warn(`[${options.toolName}] Using deterministic fallback:`, error instanceof Error ? error.message : "AI unavailable");
    return options.fallback();
  }
}
