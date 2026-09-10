import { createClient } from "@supabase/supabase-js";

const GITHUB_MODELS_ENDPOINT = "https://models.github.ai/inference/chat/completions";

function getSupabaseClient(accessToken) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const githubToken = process.env.GITHUB_MODELS_TOKEN || process.env.GITHUB_TOKEN;
  if (!githubToken) {
    return res.status(500).json({ error: "GITHUB_MODELS_TOKEN não configurado na Vercel." });
  }

  const authHeader = req.headers.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const supabase = getSupabaseClient(accessToken);
  if (!supabase || !accessToken) {
    return res.status(401).json({ error: "Sessão autenticada obrigatória." });
  }

  const { data, error } = await supabase.auth.getUser(accessToken);
  const email = data.user?.email?.trim().toLowerCase() || "";
  if (error || !data.user || !email) {
    return res.status(401).json({ error: "Usuário não autorizado." });
  }

  const { data: authorizedUser, error: authorizationError } = await supabase
    .from("authorized_users")
    .select("id, email, active")
    .eq("email", email)
    .eq("active", true)
    .maybeSingle();
  if (authorizationError || !authorizedUser) {
    return res.status(401).json({ error: "Usuário não autorizado." });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return res.status(400).json({ error: "Body inválido (JSON esperado)." });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({ error: "messages required" });
  }

  const payload = {
    model: typeof body.model === "string" ? body.model : "openai/gpt-4o-mini",
    messages: body.messages,
    temperature: typeof body.temperature === "number" ? body.temperature : 0.2,
    max_tokens: Math.min(Math.max(Number(body.max_tokens) || 1200, 1), 2000),
  };

  try {
    const upstream = await fetch(GITHUB_MODELS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${githubToken}`,
      },
      body: JSON.stringify(payload),
    });
    const text = await upstream.text();
    return res.status(upstream.status).send(text);
  } catch (error) {
    return res.status(502).json({ error: "Falha ao chamar o provedor do agente.", details: String(error?.message || error).slice(0, 300) });
  }
}
