# Complete the article card

Update `render-card.mjs` so `renderCard(article)` returns the required HTML:

- An `<article>` root containing one `<h2>` heading.
- The title links to `article.url`.
- The publication date is `<time datetime="ISO date">date label</time>`.
- If `imageUrl` is present, include an image. Use `imageAlt` or an empty alt for
  a decorative image. If there is no image, omit it.
- Escape `&`, `<`, `>`, double quotes and single quotes in supplied text and
  attribute values. The caller supplies trusted relative URLs; URL validation
  is outside this task.

An article has `title`, `url`, `publishedIso` and `publishedLabel`. `imageUrl`
and `imageAlt` are optional strings. Do not add scripts, dependencies or extra
headings. Keep the function readable and leave the tests unchanged.

The repository check is `npm test`.
