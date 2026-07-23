# Galeria de Convidados — Lucas & Joyce

Galeria de fotos de casamento imersiva: um globo 3D escuro e elegante onde as
memórias enviadas pelos convidados flutuam na superfície. Inspirada no
comportamento de exploração do unseen.co/world, com identidade visual própria
(preto profundo, marfim e champagne).

## Stack

- **Next.js 14 (App Router)** — frontend + backend (route handlers)
- **React Three Fiber / three.js** — globo 3D, arraste com inércia, zoom, foco cinematográfico
- **Framer Motion** — abertura, lightbox e microtransições
- **Supabase** — banco Postgres, RLS, Realtime e autenticação dos noivos
- **Cloudinary** — armazenamento e otimização das imagens (upload unsigned pelo navegador)
- **archiver** — ZIP em streaming no backend ("Baixar todas")

## Estrutura

```
src/
  app/
    page.jsx                  → galeria pública (abertura + globo + upload + lightbox)
    noivos/page.jsx           → área dos noivos (login, moderação, downloads)
    api/photos/route.js       → GET fotos públicas / POST registrar foto enviada
    api/admin/photos/...      → listar tudo, favoritar/ocultar/aprovar, excluir
    api/admin/download-all/   → ZIP em streaming de todas (ou selecionadas)
  components/                 → Intro, GlobeScene, Lightbox, UploadModal
  lib/                        → config, posições (esfera de Fibonacci), clients Supabase, Cloudinary assinado
supabase/schema.sql           → tabela, índices, RLS, realtime e seed opcional
```

## 1. Configurar o Supabase

1. Crie um projeto em https://supabase.com.
2. Abra **SQL Editor** e execute todo o conteúdo de `supabase/schema.sql`.
   - Ele cria a tabela `photos`, índices, políticas RLS, ativa o Realtime e
     insere 1 foto demo (a galeria começa com uma única memória, como na spec).
3. Em **Authentication → Users**, crie o usuário dos noivos
   (e-mail + senha). Não há cadastro público — só quem você criar aqui entra.
4. Anote em **Settings → API**:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (**somente no servidor, nunca no navegador**)

## 2. Configurar o Cloudinary

1. Cloud name já definido: `dotko9ym`.
2. Em **Settings → Upload → Upload presets**, confirme que existe o preset
   `fotos_casamento` como **Unsigned**.
   - Recomendado no preset: `Folder = casamentos/lucas-joyce`,
     formatos permitidos `jpg, png, webp, heic`, limite de 10 MB.
3. Em **Settings → Access Keys**, anote `API Key` e `API Secret` →
   `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` (só no servidor; usados
   apenas para excluir fotos na área dos noivos).

Observação sobre HEIC (iPhone): o Cloudinary aceita o upload e, como a galeria
entrega tudo com `f_auto`, os navegadores recebem JPEG/WebP automaticamente.

## 3. Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

| Variável | Onde vive | Descrição |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | público | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | público | chave anon (protegida por RLS) |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | público | `dotko9ym` |
| `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | público | `fotos_casamento` (unsigned) |
| `NEXT_PUBLIC_WEDDING_SLUG` | público | `lucas-joyce` |
| `SUPABASE_SERVICE_ROLE_KEY` | **servidor** | escrita no banco e área admin |
| `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | **servidor** | exclusão assinada no Cloudinary |
| `ADMIN_EMAILS` | **servidor** | e-mails autorizados na área dos noivos, separados por vírgula |

Nenhum segredo aparece no JavaScript do navegador: o upload dos convidados é
unsigned (preset), e toda operação sensível (registrar, moderar, excluir, ZIP)
passa pelas rotas de API, que validam o token dos noivos e o `ADMIN_EMAILS`.

## 4. Rodar localmente

```bash
npm install
npm run dev
# http://localhost:3000        → galeria
# http://localhost:3000/noivos → área dos noivos
```

## 5. Publicar (Vercel)

1. Suba o projeto para um repositório Git.
2. Importe na Vercel e cadastre **todas** as variáveis acima
   (as `NEXT_PUBLIC_*` e as de servidor).
3. Deploy. Nada mais é necessário — o Realtime do Supabase funciona direto do
   navegador e, se a conexão cair, a galeria faz polling a cada 45 s.

## 6. Checklist de aceitação

- [ ] Abertura: fundo preto → globo wireframe → "Galeria de Convidados" → "Lucas & Joyce" → dica de arraste → câmera avança.
- [ ] Globo: arrastar com inércia, zoom por roda/pinça, fotos na superfície.
- [ ] Enviar foto: nome + várias fotos + progresso individual → Cloudinary → registro no banco → aparece **sem recarregar** com fade/escala → toast "Sua memória foi adicionada à galeria."
- [ ] Persistência: fechar e reabrir em outro aparelho → mesmas fotos, mesmas posições.
- [ ] Tempo real: segundo navegador aberto vê a foto nova aparecer sozinha.
- [ ] Foto aberta: setas, teclado (← → Esc), swipe, nome do convidado, data, baixar, fechar.
- [ ] `/noivos`: login → estatísticas → busca por convidado → favoritar/ocultar/aprovar → baixar uma (nome `lucas-joyce_nome_data_001.jpg`) → **Baixar todas** (ZIP) → excluir com confirmação (remove do Cloudinary e do banco).
- [ ] Falha de rede ao registrar no banco → foto entra na fila local e é reenviada automaticamente ao reabrir o site.

## Notas de resiliência e performance

- **Posição persistente**: calculada uma única vez no backend (esfera de
  Fibonacci com distância mínima), gravada no banco e nunca regenerada.
- **Fila de recuperação**: se o Cloudinary confirmar mas o banco falhar, o
  registro fica em `localStorage` e é reprocessado no próximo carregamento.
- **Miniaturas**: o globo usa `w_512,q_auto:eco,f_auto`; o original só é
  carregado ao ampliar ou baixar. Suporta centenas/milhares de fotos.
- **Rate limit**: o POST público aceita no máx. 40 registros/10 min por IP
  (em memória; para tráfego alto, troque por Upstash/Redis).
- **Acessibilidade**: `prefers-reduced-motion`, navegação por teclado no
  lightbox, contraste alto e safe areas no mobile.
