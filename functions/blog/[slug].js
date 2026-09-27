// functions/blog/[slug].js
// Renders a single published AutoSEO article at /blog/:slug

export async function onRequestGet(context) {
  const { env, params } = context;
  const slug = params.slug;

  try {
    const article = await env.DB.prepare(
      `SELECT title, meta_description, content_html, hero_image_url,
              hero_image_alt, faq_schema, language_code, published_at
       FROM articles WHERE slug = ? AND status = 'published' LIMIT 1`
    ).bind(slug).first();

    if (!article) {
      return new Response(renderNotFound(), {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const faqScript = article.faq_schema
      ? `<script type="application/ld+json">${article.faq_schema}</script>`
      : "";

    const html = `<!DOCTYPE html>
<html lang="${article.language_code || 'en'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escape(article.title)} — Boostinger</title>
<meta name="description" content="${escape(article.meta_description || '')}">
${faqScript}
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         background: #0b0b0d; color: #e8e8e8; line-height: 1.7; font-size: 17px; }
  nav { position: sticky; top: 0; z-index: 100;
        background: rgba(11,11,13,0.92); backdrop-filter: blur(10px);
        border-bottom: 1px solid #2a2a30;
        display: flex; justify-content: center; gap: 6px; padding: 10px 12px; }
  nav a { padding: 9px 18px; border-radius: 999px; color: #d0d0d0;
          text-decoration: none; font-size: 14px; font-weight: 700;
          letter-spacing: 1px; text-transform: uppercase; }
  nav a.buy { background: linear-gradient(90deg,#f5b942,#ff7a00); color: #0b0b0d; }
  main { max-width: 720px; margin: 0 auto; padding: 40px 20px 80px; }
  .back { display: inline-block; margin-bottom: 24px; color: #ff7a00;
          text-decoration: none; font-weight: 700; }
  h1 { font-size: 34px; line-height: 1.25; color: #fff; margin-bottom: 10px; }
  .meta { color: #888; font-size: 14px; text-transform: uppercase;
          letter-spacing: 1px; margin-bottom: 28px;
          padding-bottom: 20px; border-bottom: 1px solid #2a2a30; }
  .hero { width: 100%; border-radius: 12px; margin: 16px 0 28px; }
  article h2 { color: #f5b942; font-size: 22px; margin: 32px 0 12px; }
  article h3 { color: #f5b942; font-size: 19px; margin: 24px 0 10px; }
  article p { margin: 14px 0; color: #d8d8d8; }
  article a { color: #ff7a00; }
  article ul, article ol { margin: 14px 0 14px 26px; }
  article li { margin: 6px 0; color: #d8d8d8; }
  article img { max-width: 100%; height: auto; border-radius: 10px; margin: 20px 0; }
  article blockquote { border-left: 3px solid #ff7a00; padding: 10px 18px;
                       margin: 20px 0; background: #121216; color: #b8b8b8;
                       font-style: italic; border-radius: 6px; }
  article code { background: #121216; padding: 2px 6px; border-radius: 4px;
                 color: #f5b942; font-size: 15px; }
  article pre { background: #121216; padding: 16px; border-radius: 8px;
                overflow-x: auto; margin: 20px 0; }
  .cta { margin-top: 48px; padding: 28px; background: linear-gradient(180deg,#121216,#1c1610);
         border: 1px solid #2a2a30; border-radius: 14px; text-align: center; }
  .cta h3 { color: #f5b942; margin-bottom: 8px; }
  .cta a { display: inline-block; margin-top: 14px; padding: 14px 28px;
           background: linear-gradient(90deg,#f5b942,#ff7a00); color: #0b0b0d;
           font-weight: 800; border-radius: 10px; text-decoration: none; }
  footer { text-align: center; padding: 40px 20px; color: #666; font-size: 14px;
           border-top: 1px solid #1a1a1e; margin-top: 60px; }
  footer a { color: #ff7a00; text-decoration: none; }
</style>
</head>
<body>
<nav>
  <a href="/">Home</a>
  <a href="/blog.html">Blog</a>
  <a href="/Pay" class="buy">Buy Now</a>
</nav>
<main>
  <a class="back" href="/blog.html">← All posts</a>
  <h1>${escape(article.title)}</h1>
  <div class="meta">${formatDate(article.published_at)}</div>
  ${article.hero_image_url ? `<img class="hero" src="${escape(article.hero_image_url)}" alt="${escape(article.hero_image_alt || '')}">` : ''}
  <article>${article.content_html || ''}</article>
  <div class="cta">
    <h3>Ready to grow your trades business?</h3>
    <p>Boostinger builds conversion-ready websites for local trades — starting at $1,100.</p>
    <a href="/Pay">Get Started →</a>
  </div>
</main>
<footer>
  <a href="/">Boostinger</a> · (951) 428-1407 · getboostinger@gmail.com
</footer>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8",
                 "Cache-Control": "public, max-age=300" },
    });
  } catch (err) {
    return new Response(renderNotFound(), {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

function escape(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function formatDate(iso) {
  try { return new Date(iso).toLocaleDateString('en-US',
    { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch { return ''; }
}
function renderNotFound() {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Post not found — Boostinger</title>
  <style>body{font-family:system-ui;background:#0b0b0d;color:#e8e8e8;
  text-align:center;padding:80px 20px;} a{color:#ff7a00;}</style></head>
  <body><h1>Post not found</h1>
  <p>Sorry, that post doesn't exist or was removed.</p>
  <p><a href="/blog.html">← Back to all posts</a></p></body></html>`;
}
