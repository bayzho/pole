// Replace with the main site's URL if its Cloudflare Pages project uses another name.
window.SEYCHAS_API_BASE = location.hostname === "localhost" || location.hostname === "127.0.0.1"
  ? "http://localhost:8788"
  : "https://seychas-world-news.pages.dev";
