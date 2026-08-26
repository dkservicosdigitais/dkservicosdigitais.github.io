# Painel da Noiva — aplicativo (versão funcional front-end)

Este é o **sistema** que a cliente usa após comprar o acesso — separado da landing page comercial.

## Arquivos
- `painel-app.html` — o aplicativo completo (abre direto no navegador, sem instalação).
- `painel-da-noiva.html` — a landing page (o botão **Entrar** já aponta para `painel-app.html`; mantenha os dois arquivos na mesma pasta).

## Como usar
1. Abra `painel-app.html` no navegador (ou hospede junto com a landing).
2. **Acesso do dono:** `dkservicosdigitais@gmail.com` / `784566` — entra já com um painel de demonstração preenchido (Juliana & Lucas) e no menu tem **Administração**.
3. **Conta nova:** em "Criar minha conta", uma noiva nasce com o painel **zerado**, passa pelo onboarding (nome, foto, data, parceiro, orçamento) e começa a cadastrar tudo.

## O que já funciona (de verdade)
- Login, cadastro, recuperação (fluxo), logout, sessão com expiração e "lembrar de mim".
- Onboarding em etapas com upload de foto.
- Dashboard com contagem regressiva, progresso ponderado, orçamento, convidados, checklist, pagamentos, donut de convidados, cronograma e galeria.
- Módulos com CRUD real e cálculos automáticos: Checklist, Convidados (donut + filtros + busca), Fornecedores (saldo automático), Orçamento (uso % + alertas), Pagamentos (status automático de atraso), Cronograma, Mesas, Presentes, Músicas, Padrinhos, Documentos (upload), Galeria e Inspirações (upload), Anotações.
- Configurações (perfil, casamento → recalcula indicadores, troca de senha, carregar/limpar demonstração).
- Área administrativa: lista de contas, bloquear/desbloquear, estatísticas.
- Notificações por regras, busca global, estados vazios, animações, responsivo (sidebar vira menu no celular).
- Persistência local: nada some ao atualizar a página. Senha guardada como hash (não em texto puro).
- Sem funcionalidades falsas: a IA aparece como **"Em breve"**; não há Kiwify simulada.

## Etapa 2 — backend (produção)
Para virar um produto multiusuário seguro de verdade, mova para um servidor:
- **Autenticação real** (verificação de senha no backend, tokens/sessões seguros, rate limiting no login).
- **Banco de dados** com as entidades: users, weddings, guests, suppliers, budget, payments, tasks, timeline, tables, gifts, songs, wedding_party, documents, gallery, inspirations, notes, notifications, activity_logs.
- **Isolamento por usuário no servidor**: toda consulta filtra por `user_id`/`wedding_id` (não confiar no front). Aqui os dados ficam namespaced por conta em `pn_wed_<id>` / `pn_data_<id>`, o que serve de protótipo, mas o isolamento garantido é responsabilidade do backend.
- **Webhook Kiwify** (`/api/webhooks/kiwify`) com validação de assinatura, idempotência por ID de evento e criação/liberação de acesso.
- **Uploads** para storage de arquivos (hoje ficam embutidos como dataURL, adequado só para protótipo).
- `.env` para segredos; nunca expor senha/segredos no front.

A estrutura de dados do front já foi desenhada para espelhar esse modelo, facilitando a migração.
