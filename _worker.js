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

// iMessage's fetcher claims Twitterbot too, alongside Safari and
// facebookexternalhit; a real X crawler never claims to be Safari.
function isX(userAgent) {
  const ua = userAgent.toLowerCase();
  if (!ua.includes("twitterbot")) return false;
  return !(ua.includes("safari") && ua.includes("applewebkit") && ua.includes("facebookexternalhit"));
}

export default {
  async fetch(request, env) {
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
