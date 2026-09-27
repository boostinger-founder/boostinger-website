/**
 * GET /api/articles
 * Returns list of published articles (newest first)
 *
 * Binding: DB (D1)
 */

export async function onRequestGet(context) {
  const { env } = context;

  try {
    const { results } = await env.DB.prepare(
      `
      SELECT
        id,
        title,
        slug,
        meta_description,
        hero_image_url,
        hero_image_alt,
        keywords,
        language_code,
        status,
        published_at,
        updated_at,
        created_at
      FROM articles
      WHERE status = 'published'
      ORDER BY published_at DESC
      `
    ).all();

    return new Response(JSON.stringify({ articles: results || [] }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (err) {
    console.error("articles list error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
