# FencePost Link Previews

A WordPress plugin that makes each page's link preview image with
[FencePost](https://fencepost.andrew.cmu.edu/). When a page or post is
published or updated, it asks FencePost for the page's 1200 × 630 preview,
saves it in the media library and uses it for that page. A featured image
always wins.

## How It Works

- **About a minute after a page is published or updated,** a WordPress
  scheduled event sends the page's public address and the site's name to
  FencePost's `POST /api/preview`. Saving twice before it runs still makes one
  request. FencePost stores nothing.
- **The image goes in the media library,** in place of the page's previous
  FencePost image, and the page notes when it was made.
- **When FencePost is busy or slow** (429, 504 or no answer), the plugin tries
  once more five minutes later. When FencePost can't capture the page (403, a
  Cloudflare bot check, a sign-in), the plugin records why and stops.
- **Where the image goes:**
  - Forbes & Moreword: its `fam_link_preview` filter.
  - Yoast SEO: `wpseo_add_opengraph_additional_images`, after the page's own
    social and featured images and before the site's default.
  - Rank Math: `rank_math/opengraph/{facebook,twitter}/add_additional_images`,
    the same way.
  - All in One SEO: `aioseo_opengraph_default_image`, used when the page's own
    image source has none.
  - SEOPress: `seopress_social_og_thumb`, unless the page has its own social
    image or the site applies one image everywhere.
  - Anything else: it writes `og:image`, its size and `twitter:image` itself,
    but only when nothing else in the head wrote an `og:image`.
- **Settings › FencePost** turns it off or points it at another copy of
  FencePost, such as a local one (`http://127.0.0.1:3010`).
- **Pages and Posts** get a Link Preview column with the last result and a
  Make a New Preview link under each title.

## Install

Download `fencepost-wordpress.zip` from FencePost's
[latest release](https://github.com/cmu-web/cmu-web-fencepost/releases/latest/download/fencepost-wordpress.zip),
then select **Plugins › Add New Plugin › Upload Plugin**. Or with WP-CLI:

```bash
wp plugin install https://github.com/cmu-web/cmu-web-fencepost/releases/latest/download/fencepost-wordpress.zip --activate
```

It needs WordPress 6.6 and PHP 8.1 or later. Its version matches FencePost's.

## Test

The test runs in any WordPress, with FencePost's answers mocked. It loads the
plugin without installing it and removes everything it makes:

```bash
wp eval-file packages/wordpress/tests/test-fencepost.php
```

In Forbes & Moreword's local site:

```bash
docker compose -f dev/compose.yml run --rm -T \
  -v /path/to/cmu-web-fencepost/packages/wordpress:/fencepost:ro \
  cli wp eval-file /fencepost/tests/test-fencepost.php
```
