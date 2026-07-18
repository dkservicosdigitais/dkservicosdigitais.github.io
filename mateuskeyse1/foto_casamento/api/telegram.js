// Função serverless (Vercel) — envia as fotos dos convidados ao grupo privado do Telegram.
// O token e o chat_id ficam em VARIÁVEIS DE AMBIENTE, nunca no código do site.
// Configure no painel da Vercel: TELEGRAM_BOT_TOKEN e TELEGRAM_GROUP_CHAT_ID

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_GROUP_CHAT_ID;
  if (!TOKEN || !CHAT_ID) {
    return res.status(500).json({ erro: 'Variáveis de ambiente não configuradas' });
  }

  try {
    const { nome, mensagem, fotos } = req.body || {};

    // Validações básicas (anti-abuso)
    if (!Array.isArray(fotos) || fotos.length === 0 || fotos.length > 10) {
      return res.status(400).json({ erro: 'Envie de 1 a 10 fotos' });
    }
    const urlsValidas = fotos.filter(
      (u) => typeof u === 'string' && u.startsWith('https://res.cloudinary.com/')
    );
    if (urlsValidas.length === 0) {
      return res.status(400).json({ erro: 'URLs inválidas' });
    }

    const nomeLimpo = String(nome || 'Convidado(a)').slice(0, 60);
    const msgLimpa = String(mensagem || '').slice(0, 500);
    const legenda =
      `📸 Novas fotos de ${nomeLimpo}` + (msgLimpa ? `\n💬 "${msgLimpa}"` : '');

    const api = `https://api.telegram.org/bot${TOKEN}`;

    if (urlsValidas.length === 1) {
      // Uma foto: sendPhoto simples
      await chamarTelegram(`${api}/sendPhoto`, {
        chat_id: CHAT_ID,
        photo: urlsValidas[0],
        caption: legenda,
      });
    } else {
      // Várias fotos: sendMediaGroup (até 10 por chamada)
      await chamarTelegram(`${api}/sendMediaGroup`, {
        chat_id: CHAT_ID,
        media: urlsValidas.map((url, i) => ({
          type: 'photo',
          media: url,
          caption: i === 0 ? legenda : undefined,
        })),
      });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Erro Telegram:', e.message);
    return res.status(502).json({ erro: 'Falha ao notificar o Telegram' });
  }
}

async function chamarTelegram(url, corpo) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.description || 'Resposta inválida do Telegram');
  return j;
}
