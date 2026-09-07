import { createClient } from "@supabase/supabase-js";

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string;
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "❌ Variáveis de ambiente Supabase não configuradas.\n" +
    "Crie um arquivo .env na raiz do projeto com:\n" +
    "VITE_SUPABASE_URL=https://xxxx.supabase.co\n" +
    "VITE_SUPABASE_ANON_KEY=eyJxxx..."
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// O aplicativo só acessa dados depois que AuthGate valida uma sessão
// autenticada com o e-mail autorizado. Não criar sessões anônimas aqui:
// elas não representam uma identidade confiável e enfraquecem o RLS.
