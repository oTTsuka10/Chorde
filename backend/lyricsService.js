/**
 * Busca de letras no letras.com.br (uso pessoal/educacional).
 *
 * IMPORTANTE: isto faz "web scraping" de um site de terceiros. O HTML pode mudar a qualquer
 * momento e quebrar os seletores abaixo. Para uso comercial, revise os Termos de Uso do
 * letras.com.br — o ideal e tratar isto como um atalho de busca (abrir o link oficial) e nao
 * como republicacao do conteudo.
 */
const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://www.letras.com.br';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; ChordeApp/1.0; +https://example.com)' };

/** Busca musicas por termo livre (titulo e/ou artista). Retorna candidatos para o usuario escolher. */
async function searchLyrics(query) {
  const url = `${BASE_URL}/?q=${encodeURIComponent(query)}`;
  const { data: html } = await axios.get(url, { headers: HEADERS, timeout: 10000 });
  const $ = cheerio.load(html);

  const results = [];
  $('a.item-box').each((_, el) => {
    const href = $(el).attr('href');
    const title = $(el).find('.title-default').first().text().trim();
    const artist = $(el).find('.subtitle-default').first().text().trim();
    if (href && title) {
      results.push({ title, artist, url: href });
    }
  });

  return results.slice(0, 20);
}

/** Baixa o texto completo da letra a partir da URL da pagina da musica no letras.com.br. */
async function fetchLyricsText(pageUrl) {
  if (!pageUrl.startsWith(BASE_URL)) {
    throw new Error('URL fora do dominio letras.com.br');
  }
  const { data: html } = await axios.get(pageUrl, { headers: HEADERS, timeout: 10000 });
  const $ = cheerio.load(html);

  const paragraphs = [];
  $('.lyrics-section p').each((_, p) => {
    const htmlInner = $(p).html() || '';
    const lines = htmlInner
      .split(/<br\s*\/?>/i)
      .map((line) => cheerio.load(`<div>${line}</div>`)('div').text().trim())
      .filter(Boolean);
    paragraphs.push(lines.join('\n'));
  });

  const text = paragraphs.join('\n\n').trim();
  if (!text) throw new Error('nao foi possivel extrair a letra dessa pagina');
  return text;
}

module.exports = { searchLyrics, fetchLyricsText };
