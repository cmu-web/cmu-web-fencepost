# FencePost

Link previews for Carnegie Mellon websites. Give FencePost a page, and it
makes the image that shows when someone shares the link (1200 × 630, under
300 KB) and the Open Graph tags that go with it. It also checks a published
page's preview, and takes screenshots of a page for a mockup or the CMU Web Gallery.

Named for the Fence, where Carnegie Mellon students paint what they want
everyone to see.

FencePost follows the Carnegie Mellon Web Kilt's
[Link Previews / Open Graph](https://webkilt.andrew.cmu.edu/0/previews.html) standard. It's
part of [CMU Web](https://github.com/cmu-web), a collection of projects for
Carnegie Mellon web development.

## Approved Sites

FencePost generates previews for public pages, the way a social site sees them.

- **Carnegie Mellon sites:** any page on `cmu.edu` or any of its
  subdomains. The check matches the end of the hostname exactly, so
  `notcmu.edu` and `cmu.edu.example.com` are refused.
- **Other Carnegie Mellon sites:** domains listed in `domains.json`, for sites
  run by a Carnegie Mellon department, center, office or recognized student
  organization (abtech.org, for example). Each entry records the group, the date it was added and the request. After changing `domains.json`, run `npm run docs` to update the Approved Sites table on the Reference page; `npm run check` fails until it matches. Contacts for each group are kept privately, not in the repository. To add one, open a
  [Request a Domain](https://github.com/cmu-web/cmu-web-fencepost/issues/new?template=domain_request.yml)
  issue; an approved request is a pull request that adds a line. The list is
  reviewed once a year, and domains that no longer belong to a Carnegie Mellon
  group are removed.
- **Only public pages.** FencePost looks up each host with public DNS and
  refuses private, loopback and link-local addresses, which is where campus-only
  hosts live. It checks the allowed domains and addresses again after every
  redirect, and fetches signed out, so a page behind a sign-in fails
  instead of turning into an image.

## Screenshots

FencePost's Screenshots page (and `POST /api/screenshot`) takes a screenshot
of a page's top with the same rules as a link preview: a public page on a
site FencePost captures, signed out, with the menu closed. It makes two
kinds, as WebP:

- **A mobile view:** 430 × 790 at double resolution, the screen of the Web Kilt's
  phone frame (`cmu-shot--phone`), with a phone's status bar across the top
  in the page's own top color. The time, signal and battery are white or
  near-black, whichever reads better, and the frame's camera cutout sits
  over the bar.
- **A card:** 1040 × 656, the page on a computer, for the CMU Web Gallery and the project cards on each About page.

The same, from a checkout:

```bash
npm run gallery -- https://www.cmu.edu/example/ example.webp
npm run gallery -- https://www.cmu.edu/example/ example-phone.webp --phone
```

## WordPress Plugin

`packages/wordpress` is a WordPress plugin, FencePost Link Previews. When a
page or post is published or updated, it asks `POST /api/preview` for the
page's preview, saves the JPEG in the media library and uses it for that page,
unless the page has a featured image. It works with the Forbes & Moreword
theme and the common SEO plugins, and writes the image tags itself when nothing
else does. Only the page's public address and the site's name are sent.
Each release attaches it as `fencepost-wordpress.zip`, and its version matches
FencePost's (`npm run check` checks). See its
[README](packages/wordpress/README.md).

## License

The code is available under the [BSD 3-Clause License](LICENSE). Carnegie
Mellon's names, marks and artwork are not covered by that license.
