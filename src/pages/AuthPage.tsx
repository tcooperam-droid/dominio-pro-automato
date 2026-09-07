import { useState } from "react";
import { Mail, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isAllowedWorkEmail } from "@/lib/authConfig";

export default function AuthPage({ rejectedEmail }: { rejectedEmail?: string }) {
  const [email, setEmail] = useState("tcooperam@gmail.com");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function sendMagicLink() {
    const normalized = email.trim().toLowerCase();
    setError("");
    setMessage("");
    if (!isAllowedWorkEmail(normalized)) {
      setError("Este acesso está reservado ao e-mail autorizado do trabalho.");
      return;
    }
    setSending(true);
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: { emailRedirectTo: window.location.origin },
    });
    setSending(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    setMessage("Link enviado. Verifique a caixa de entrada e abra o link neste dispositivo.");
  }

  return (
    <main className="min-h-screen bg-[#0d0d14] text-white grid place-items-center px-5">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl">
        <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-emerald-400/10 text-emerald-300">
          <ShieldCheck className="h-8 w-8" />
        </div>
        <h1 className="text-center text-2xl font-bold">Acesso de trabalho</h1>
        <p className="mt-2 text-center text-sm text-white/50">
          O Domínio Pro Automato agora exige autenticação por e-mail.
        </p>
        {rejectedEmail && (
          <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">
            O endereço {rejectedEmail} não está autorizado neste clone.
          </p>
        )}
        <label className="mt-7 block text-xs font-semibold uppercase tracking-wider text-white/50">E-mail autorizado</label>
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3">
          <Mail className="h-4 w-4 text-white/40" />
          <input
            value={email}
            onChange={event => setEmail(event.target.value)}
            type="email"
            autoComplete="email"
            className="w-full bg-transparent py-3 text-sm outline-none"
            placeholder="seu@email.com"
          />
        </div>
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        {message && <p className="mt-3 text-sm text-emerald-300">{message}</p>}
        <button
          type="button"
          onClick={() => void sendMagicLink()}
          disabled={sending}
          className="mt-5 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-60"
        >
          {sending ? "Enviando link..." : "Enviar link de acesso"}
        </button>
        <p className="mt-5 text-center text-xs leading-relaxed text-white/35">
          Nenhuma senha é armazenada neste aplicativo. O link é temporário e a sessão fica vinculada ao Supabase.
        </p>
      </section>
    </main>
  );
}
