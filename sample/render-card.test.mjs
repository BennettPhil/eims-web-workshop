import assert from "node:assert/strict";
import test from "node:test";
import { renderCard } from "./render-card.mjs";

const article = {
  title: "Workshop notes",
  url: "/notes",
  publishedIso: "2026-09-07",
  publishedLabel: "7 September 2026",
};

test("uses an article and one linked level-two heading", () => {
  const html = renderCard(article);
  assert.match(html, /^<article(?:\s[^>]*)?>[\s\S]*<\/article>$/);
  assert.match(html, /<h2>\s*<a href="\/notes">Workshop notes<\/a>\s*<\/h2>/);
  assert.equal((html.match(/<h[1-6](?:\s|>)/g) ?? []).length, 1);
});

test("marks up the date", () => {
  assert.match(renderCard(article), /<time datetime="2026-09-07">7 September 2026<\/time>/);
});

test("escapes supplied text and attribute values", () => {
  const html = renderCard({
    ...article,
    title: '<script>"A" & \'B\'</script>',
    url: '/notes?q="a"&tag=\'b\'',
    publishedIso: 'date"<&\'',
    publishedLabel: '<b>Today & "now"</b>',
  });
  assert.ok(html.includes("&lt;script&gt;&quot;A&quot; &amp; &#39;B&#39;&lt;/script&gt;"));
  assert.ok(html.includes('href="/notes?q=&quot;a&quot;&amp;tag=&#39;b&#39;"'));
  assert.ok(html.includes('datetime="date&quot;&lt;&amp;&#39;"'));
  assert.ok(html.includes("&lt;b&gt;Today &amp; &quot;now&quot;&lt;/b&gt;"));
  assert.doesNotMatch(html, /<script>|<b>/);
});

test("escapes image attributes", () => {
  const html = renderCard({ ...article, imageUrl: '/photo?x="1"&y=2', imageAlt: 'A <view> & \'quote\'' });
  assert.match(html, /<img\b/);
  assert.ok(html.includes('src="/photo?x=&quot;1&quot;&amp;y=2"'));
  assert.ok(html.includes('alt="A &lt;view&gt; &amp; &#39;quote&#39;"'));
});

test("uses empty alt for a decorative image", () => {
  const html = renderCard({ ...article, imageUrl: "/decoration.png" });
  assert.match(html, /<img\b[^>]*\balt=""/);
});

test("omits an absent image while keeping the article", () => {
  const html = renderCard(article);
  assert.match(html, /^<article(?:\s|>)/);
  assert.doesNotMatch(html, /<img\b/);
});
