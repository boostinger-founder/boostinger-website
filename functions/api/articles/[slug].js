/**
 * GET /api/articles/:slug
 * Returns a single article by slug
 *
 * Binding: DB (D1)
 */

export async function onRequestGet(context) {
  const { env, params } = context;
  const slug = params.slug;

  if (!slug) {
    return new Response(JSON.stringify({ error: "Missing slug" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const article = await env.DB.prepare(
      `
      SELECT
        id,
        title,
        slug,
        meta_description,
        content_html,
        content_markdown,
        hero_image_url,
        hero_image_alt,
        infographic_image_url,
        keywords,
        meta_keywords,
        faq_schema,
        language_code,
        status,
        published_at,
        updated_at,
        created_at,
        hero_image_r2_key,
        infographic_image_r2_key
      FROM articles
      WHERE slug = ? AND status = 'published'
      LIMIT 1
      `
    )
      .bind(slug)
      .first();

    if (!article) {
      return new Response(JSON.stringify({ error: "Article not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ article }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (err) {
    console.error("article by slug error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
