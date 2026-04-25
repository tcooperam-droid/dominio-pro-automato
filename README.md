# Domínio Pro

Sistema de gestão para salões de beleza e barbearias, com agente IA integrado (GitHub Models).

## 🚀 Setup rápido

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar variáveis de ambiente
Copie o exemplo e preencha com seus valores:
```bash
cp .env.example .env
```

Edite o arquivo `.env`:

| Variável | Onde obter |
|---|---|
| `VITE_GITHUB_TOKEN` | https://github.com/settings/tokens — crie um token *Fine-grained* com a permissão **Models: Read** |
| `VITE_SUPABASE_URL` | Painel do Supabase → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Painel do Supabase → Settings → API → `anon public` key |

### 3. Rodar em modo desenvolvimento
```bash
npm run dev
```
Acesse http://localhost:5173

### 4. Gerar build de produção
```bash
npm run build
npm run serve
```
A pasta `dist/` é o que você publica em qualquer hosting estático (Vercel, Netlify, Cloudflare Pages, GitHub Pages, etc.).

## 🧠 Agente IA

O agente usa **GitHub Models** (camada gratuita) com o modelo `openai/gpt-4o-mini`.

### Capacidades ativas nesta versão
- ✅ Conversa em linguagem natural sobre clientes, agenda, financeiro
- ✅ Criar/cancelar/mover agendamentos via chat
- ✅ Análise de imagens (foto de comprovante, agenda escrita à mão, documentos)
- ✅ Síntese de voz (lê respostas em voz alta — usa voz nativa do navegador)
- ✅ Memória de preferências e regras

### Capacidades que precisam de servidor próprio (desabilitadas)
- ❌ Transcrição de voz gravada (Whisper) — use o ditado nativo do teclado do celular
- ❌ Pesquisa na internet — requer um backend para evitar CORS

Se quiser reativar essas, você precisa subir um servidor Node mínimo com endpoints `/api/stt` e `/api/search`. Posso te ajudar quando quiser.

## 📁 Estrutura

```
src/
├── App.tsx              # Router e inicialização do agente
├── lib/
│   ├── agentV2.ts       # Cérebro do agente (chama GitHub Models)
│   ├── agentMedia.ts    # Visão / voz
│   ├── agentMemory.ts   # Memória persistente do agente
│   ├── agentTracker.ts  # Rastreamento de uso
│   ├── store.ts         # Store dos dados (Supabase)
│   ├── supabase.ts      # Cliente Supabase
│   ├── analytics.ts     # Cálculos de relatório
│   ├── access.ts        # Controle de perfis (Dono/Gerente/Funcionário)
│   └── utils.ts         # Utilitários (cn)
├── components/          # Componentes de UI
└── pages/               # Páginas
```

## 🛠 Stack

- **React 19 + Vite 7** — frontend SPA
- **TypeScript** — tipagem
- **TailwindCSS 4** — estilo
- **shadcn/ui + Radix** — componentes
- **Supabase** — banco PostgreSQL + Auth
- **Wouter** — router leve
- **GitHub Models** — LLM (gpt-4o-mini)

## 📜 Licença

Proprietário. Uso interno.
