// Cloudflare Pages worker (advanced mode): serves the static build as is,
// except that X's crawler gets the entry's composed card as twitter:image.
//
// Pages carry it as <meta name="catalogue:x-image" …>, which no crawler reads;
// for Twitterbot this renames those tags to twitter:*. Every other crawler
// (iMessage, Slack, Discord, WhatsApp, Telegram, LinkedIn, Facebook) sees no
// twitter:image and takes og:image, the plain first image. Static tags alone
// can't do this: Slack and iMessage take whichever image tag comes first, and
// Discord counts twitter:image among its images. _routes.json keeps media,
// styles and preview images off this worker.

// X's crawler sends "Twitterbot/<version>". iMessage's fetcher sends that
// too, alongside AppleWebKit and facebookexternalhit (a real X crawler claims
// neither), and Telegram's says "TelegramBot (like TwitterBot)".
function isX(userAgent) {
  const ua = userAgent.toLowerCase();
  if (!/(^|[\s(;])twitterbot\/\d/.test(ua)) return false;
  return !(ua.includes("applewebkit") || ua.includes("facebookexternalhit"));
}

export default {
  async fetch(request, env, ctx) {
    // If anything below throws, serve the static file rather than an error page.
    ctx?.passThroughOnException?.();
    const response = await env.ASSETS.fetch(request);
    if (!(response.headers.get("content-type") || "").includes("text/html")) return response;
    const html = new Response(response.body, response);
    html.headers.append("Vary", "User-Agent");
    if (!isX(request.headers.get("user-agent") || "")) return html;
    return new HTMLRewriter()
      .on('meta[name^="catalogue:x-"]', {
        element(el) {
          el.setAttribute("name", el.getAttribute("name").replace("catalogue:x-", "twitter:"));
        },
      })
      .transform(html);
  },
};
