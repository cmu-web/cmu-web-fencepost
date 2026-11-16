# FencePost

Link previews for Carnegie Mellon websites. Give FencePost a page, and it
makes the image that shows when someone shares the link (1200 by 630, under
300 KB) and the Open Graph tags that go with it.

Named for the Fence, where Carnegie Mellon students paint what they want
everyone to see.

FencePost follows the Carnegie Mellon Web Kilt's
[Link Previews / Open Graph](https://webkilt.andrew.cmu.edu/0/previews.html) standard. It's
part of [CMU Web](https://github.com/cmu-web), a collection of projects for
Carnegie Mellon web development.

## Which Sites It Captures

FencePost makes previews for public pages, the way a social site sees them.

- **Carnegie Mellon sites:** any page on `cmu.edu` or any of its
  subdomains. The check matches the end of the hostname exactly, so
  `notcmu.edu` and `cmu.edu.example.com` are refused.
- **Other Carnegie Mellon sites:** domains listed in `domains.json`, for sites
  run by a Carnegie Mellon department, center, office or recognized student
  organization (abtech.org, for example). Each entry records the group, a
  contact, the date it was added and the request. To add one, open a
  [Request a Domain](https://github.com/cmu-web/cmu-web-fencepost/issues/new?template=domain_request.yml)
  issue; an approved request is a pull request that adds a line. The list is
  reviewed once a year, and domains that no longer belong to a Carnegie Mellon
  group are removed.
- **Only public pages.** FencePost looks up each host with public DNS and
  refuses private, loopback and link-local addresses, which is where campus-only
  hosts live. It checks the allowed domains and addresses again after every
  redirect, and fetches signed out, so a page behind a sign-in fails
  instead of turning into an image.

## Gallery Shots

For the CMU Web gallery and the project cards on each About page, FencePost
takes the same kind of screenshot at 1040 by 656, as WebP:

```bash
npm run gallery -- https://www.cmu.edu/example/ example.webp
```

It follows the same rules as a link preview: a public page on a site
FencePost captures, signed out, with the menu closed. It isn't part of the
site or the API.

Add `--phone` for the page on a phone instead: 390 by 844 at double
resolution, with a phone's status bar across the top in the page's own top
color, its time and battery in white or near-black, whichever reads better.
It's made for the Web Kilt's phone frame (`cmu-shot--phone`), whose camera
sits over that bar.

```bash
npm run gallery -- https://www.cmu.edu/example/ example-phone.webp --phone
```

## License

The code is available under the [BSD 3-Clause License](LICENSE). Carnegie
Mellon's names, marks and artwork are not covered by that license.
