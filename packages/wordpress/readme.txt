=== FencePost Link Previews ===
Tags: link previews, open graph, social sharing, preview image
Requires at least: 6.6
Tested up to: 7.0
Requires PHP: 8.1
Stable tag: 0.1.0
License: BSD-3-Clause
License URI: https://opensource.org/license/bsd-3-clause

Makes each page's link preview image with FencePost when it's published or updated.

== Description ==

When a page or post is published or updated, the plugin asks FencePost for its link preview image: the picture Slack, Teams and social sites show when someone shares the link. FencePost captures the top of the public page at 1200 × 630, and the plugin saves it in the media library and uses it for that page. A featured image always wins.

It works with the Forbes & Moreword theme, Yoast SEO, Rank Math, All in One SEO and SEOPress, and writes the image tags itself when nothing else does.

Pages must be public and on cmu.edu or a domain FencePost accepts. Only the page's public address and the site's name are sent, and FencePost stores nothing.

== Installation ==

1. Download fencepost-wordpress.zip from FencePost's latest release.
2. Select Plugins › Add New Plugin › Upload Plugin, choose the file and select Install Now.
3. Select Activate.

Settings › FencePost turns it off or points it at another copy of FencePost.

== Frequently Asked Questions ==

= When does a page get its preview? =

About a minute after it's published or updated. To make one now, select Make a New Preview under the page's title in Pages or Posts.

= Why didn't a page get one? =

The Link Preview column in Pages and Posts says why: the page is behind a sign-in, it isn't on a domain FencePost accepts, or a Cloudflare bot check stopped FencePost. When FencePost is busy, the plugin tries once more five minutes later.

== Changelog ==

= 0.1.0 =
* First release.
