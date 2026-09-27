/**
 * AutoSEO Webhook Receiver
 * POST /api/autoseo-publish
 *
 * Required Cloudflare bindings / env vars:
 *   DB                      – D1 database binding
 *   IMAGES                  – R2 bucket binding
 *   AUTOSEO_BEARER_TOKEN    – Bearer token for Authorization header
 *   AUTOSEO_WEBHOOK_SECRET  – HMAC-SHA256 secret
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    // ---- 1. Auth: Bearer token ----
    const authHeader = request.headers.get("Authorization") || "";
    const expectedToken = env.AUTOSEO_BEARER_TOKEN;
    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ---- 2. Read raw body (must be exact bytes for HMAC) ----
    const rawBody = await request.arrayBuffer();
    const bodyText = new TextDecoder().decode(rawBody);

    // ---- 3. HMAC-SHA256 verification ----
    const signatureHeader = request.headers.get("X-AutoSEO-Signature") || "";
    const secret = env.AUTOSEO_WEBHOOK_SECRET;
    if (!secret) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBuffer = await crypto.subtle.sign("HMAC", key, rawBody);
    const computedSig = Array.from(new Uint8Array(sigBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Accept both "sha256=<hex>" and raw hex
    const providedSig = signatureHeader.replace(/^sha256=/i, "").toLowerCase();
    if (providedSig !== computedSig) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ---- 4. Parse payload ----
    let payload;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Support both { event, article } and flat article shapes
    const article = payload.article || payload;
    const event = payload.event || "article.published";
    
// Handle test events — return success without storing anything
if (event === "test") {
  return new Response(JSON.stringify({ url: "https://boostinger.pages.dev/test" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

    if (!article || !article.id) {
      return new Response(JSON.stringify({ error: "Missing article.id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const id = String(article.id);
    const title = article.title || "";
    const slug =
      article.slug ||
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") ||
      id;
    const metaDescription = article.meta_description || article.metaDescription || "";
    const contentHtml = article.content_html || article.contentHtml || article.body || "";
    const contentMarkdown = article.content_markdown || article.contentMarkdown || "";
    const heroImageUrl = article.heroImageUrl || article.hero_image_url || null;
    const heroImageAlt = article.heroImageAlt || article.hero_image_alt || "";
    const infographicImageUrl =
      article.infographicImageUrl || article.infographic_image_url || null;
    const keywords = Array.isArray(article.keywords)
      ? article.keywords.join(",")
      : article.keywords || "";
    const metaKeywords = article.meta_keywords || article.metaKeywords || keywords;
    const faqSchema =
      typeof article.faq_schema === "object"
        ? JSON.stringify(article.faq_schema)
        : article.faq_schema || article.faqSchema || null;
    const languageCode = article.language_code || article.languageCode || "en";
    const status = article.status || "published";
    const publishedAt =
      article.published_at || article.publishedAt || new Date().toISOString();
    const updatedAt =
      article.updated_at || article.updatedAt || new Date().toISOString();
    const createdAt =
      article.created_at || article.createdAt || new Date().toISOString();

    // ---- 5. Download images to R2 ----
    let heroR2Key = null;
    let infographicR2Key = null;

    async function downloadToR2(url, keyPrefix) {
      if (!url || !env.IMAGES) return null;
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const contentType = res.headers.get("content-type") || "image/jpeg";
        const ext = contentType.includes("png")
          ? "png"
          : contentType.includes("webp")
          ? "webp"
          : contentType.includes("gif")
          ? "gif"
          : "jpg";
        const key = `\( {keyPrefix}. \){ext}`;
        await env.IMAGES.put(key, res.body, {
          httpMetadata: { contentType },
        });
        return key;
      } catch {
        return null;
      }
    }

    if (heroImageUrl) {
      heroR2Key = await downloadToR2(heroImageUrl, `articles/${id}/hero`);
    }
    if (infographicImageUrl) {
      infographicR2Key = await downloadToR2(
        infographicImageUrl,
        `articles/${id}/infographic`
      );
    }

    // Public URLs (R2 custom domain or fallback to original)
    // Adjust R2_PUBLIC_BASE if you have a custom domain on the bucket
    const r2PublicBase = env.R2_PUBLIC_BASE || "";
    const heroPublicUrl = heroR2Key
      ? r2PublicBase
        ? `\( {r2PublicBase}/ \){heroR2Key}`
        : heroImageUrl
      : heroImageUrl;
    const infographicPublicUrl = infographicR2Key
      ? r2PublicBase
        ? `\( {r2PublicBase}/ \){infographicR2Key}`
        : infographicImageUrl
      : infographicImageUrl;

    // ---- 6. Upsert into D1 ----
    await env.DB.prepare(
      `
      INSERT INTO articles (
        id, title, slug, meta_description, content_html, content_markdown,
        hero_image_url, hero_image_alt, infographic_image_url,
        keywords, meta_keywords, faq_schema, language_code, status,
        published_at, updated_at, created_at,
        hero_image_r2_key, infographic_image_r2_key
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        slug = excluded.slug,
        meta_description = excluded.meta_description,
        content_html = excluded.content_html,
        content_markdown = excluded.content_markdown,
        hero_image_url = excluded.hero_image_url,
        hero_image_alt = excluded.hero_image_alt,
        infographic_image_url = excluded.infographic_image_url,
        keywords = excluded.keywords,
        meta_keywords = excluded.meta_keywords,
        faq_schema = excluded.faq_schema,
        language_code = excluded.language_code,
        status = excluded.status,
        published_at = excluded.published_at,
        updated_at = excluded.updated_at,
        hero_image_r2_key = COALESCE(excluded.hero_image_r2_key, articles.hero_image_r2_key),
        infographic_image_r2_key = COALESCE(excluded.infographic_image_r2_key, articles.infographic_image_r2_key)
      `
    )
      .bind(
        id,
        title,
        slug,
        metaDescription,
        contentHtml,
        contentMarkdown,
        heroPublicUrl,
        heroImageAlt,
        infographicPublicUrl,
        keywords,
        metaKeywords,
        faqSchema,
        languageCode,
        status,
        publishedAt,
        updatedAt,
        createdAt,
        heroR2Key,
        infographicR2Key
      )
      .run();

    // ---- 7. Success response ----
    const publicUrl = `https://boostinger.pages.dev/blog/${slug}`;
    return new Response(JSON.stringify({ url: publicUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("autoseo-publish error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
