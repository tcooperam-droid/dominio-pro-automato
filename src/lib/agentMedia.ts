/**
 * agentMedia.ts — Capacidades multimídia do Agente (versão GitHub Models).
 *
 *   - describeImage  : visão por imagem via GitHub Models (gpt-4o-mini)
 *   - transcribeAudio: voz → texto via Web Speech API do navegador
 *   - speakWithOpenAI: texto → voz via Web Speech API do navegador
 *   - searchWeb      : DESABILITADO (requer servidor próprio)
 *
 * Token: lê import.meta.env.VITE_GITHUB_TOKEN.
 */

const LLM_ENDPOINT = "https://models.github.ai/inference/chat/completions";

function getToken(): string {
  const t = import.meta.env.VITE_GITHUB_TOKEN as string | undefined;
  if (!t) {
    throw new Error("GitHub token ausente. Configure VITE_GITHUB_TOKEN no .env");
  }
  return t;
}

// ─── Vision ────────────────────────────────────────────────

export async function describeImage(
  imageDataUrl: string,
  prompt?: string,
): Promise<string> {
  const userPrompt =
    prompt?.trim() ||
    "Analise esta imagem e descreva o que vê em português brasileiro. Se for um comprovante, recibo, agenda ou documento, extraia as informações relevantes.";

  const res = await fetch(LLM_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      max_tokens: 1024,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "Você é um assistente que analisa imagens enviadas em um sistema de gestão de salão de beleza. Responda em português brasileiro, de forma objetiva.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Falha ao analisar imagem: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "Não consegui analisar a imagem.";
}

// ─── Web Search (DESABILITADO em modo standalone) ──────────

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

export async function searchWeb(_query: string, _limit = 5): Promise<WebResult[]> {
  throw new Error(
    "Pesquisa na internet desabilitada. Esta funcionalidade requer um servidor backend.",
  );
}

export async function searchAndSummarize(_query: string): Promise<string> {
  return "🌐 A pesquisa na internet não está disponível nesta versão (requer servidor backend próprio).";
}

// ─── STT (voz → texto via Web Speech API) ──────────────────

export async function transcribeAudio(_blob: Blob): Promise<string> {
  // Em modo standalone usamos a Web Speech API ao vivo (em AgentChat).
  // Esta função é um placeholder mantido para compatibilidade.
  throw new Error(
    "Transcrição de áudio gravado não está disponível. Use ditado nativo do teclado do celular.",
  );
}

// ─── TTS (texto → voz via Web Speech API) ──────────────────

let currentAudio: HTMLAudioElement | null = null;

export async function speakWithOpenAI(
  text: string,
  _voice = "nova",
  onEnd?: () => void,
): Promise<void> {
  const clean = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\[[0-9]+\]/g, "")
    .replace(/📎[\s\S]*$/, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\n+/g, ". ")
    .trim();
  if (!clean) {
    onEnd?.();
    return;
  }
  stopSpeaking();
  speakBrowser(clean, onEnd);
}

function speakBrowser(text: string, onEnd?: () => void): void {
  if (!("speechSynthesis" in window)) {
    onEnd?.();
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = "pt-BR";
    utt.rate = 1.05;
    utt.pitch = 1.05;
    const voices = window.speechSynthesis.getVoices();
    const ptVoices = voices.filter((v) => v.lang.startsWith("pt"));
    const fem =
      ptVoices.find((v) =>
        /female|feminina|francisca|vitoria|vitória|luciana|renata|google/i.test(v.name),
      ) ?? ptVoices[0];
    if (fem) utt.voice = fem;
    if (onEnd) utt.onend = onEnd;
    window.speechSynthesis.speak(utt);
  } catch {
    onEnd?.();
  }
}

export function stopSpeaking(): void {
  if (currentAudio) {
    try {
      currentAudio.pause();
    } catch {}
    currentAudio = null;
  }
  try {
    window.speechSynthesis?.cancel();
  } catch {}
}

// ─── Helpers ──────────────────────────────────────────────

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
