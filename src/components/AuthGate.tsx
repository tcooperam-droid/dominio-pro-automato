import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import AuthPage from "@/pages/AuthPage";
import { normalizeEmail, type AuthorizedUser } from "@/lib/authConfig";

export default function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"loading" | "signed-out" | "ready">("loading");
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const acceptSession = async (session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]) => {
      if (!mounted) return;
      if (!session || (session.user as { is_anonymous?: boolean }).is_anonymous) {
        if (session && (session.user as { is_anonymous?: boolean }).is_anonymous) await supabase.auth.signOut();
        setEmail(null);
        setStatus("signed-out");
        return;
      }
      const normalized = normalizeEmail(session.user.email);
      const { data: authorized, error } = await supabase
        .from("authorized_users")
        .select("id, email, display_name, role, active")
        .eq("email", normalized)
        .maybeSingle();
      if (error || !(authorized as AuthorizedUser | null)?.active) {
        await supabase.auth.signOut();
        setEmail(session.user.email ?? null);
        setStatus("signed-out");
        return;
      }
      setEmail(session.user.email ?? null);
      setStatus("ready");
    };

    supabase.auth.getSession().then(({ data }) => acceptSession(data.session)).catch(() => { if (mounted) setStatus("signed-out"); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { void acceptSession(session); });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  if (status === "loading") return <div className="min-h-screen bg-[#0d0d14] text-white grid place-items-center">Verificando acesso...</div>;
  if (status === "signed-out") return <AuthPage rejectedEmail={email ?? undefined} />;
  return <>{children}</>;
}
