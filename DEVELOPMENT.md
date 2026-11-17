# Developing FencePost

Notes for working on FencePost. The README covers what it does and how to run
it.

## Sites That Break Things

Real public pages that hit each path in Check a Link, Generate a Preview and Take
a Screenshot. Paste them in after a change. They're other people's sites, so
any of them can change; when one stops doing its job, find another and update
this list. Checked 2026-11-16.

| Link                                             | What it shows                                                                                 |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `webkilt.andrew.cmu.edu`                         | Passes every check                                                                            |
| `www.cmu.edu`                                    | Five fixes: no Open Graph tags, so the preview falls back to the page's title and description |
| `canvas.cmu.edu`                                 | Six fixes, including no site name                                                             |
| `www.cmu.edu/news/stories/`                      | An og:url fix, an image-size fix, a not-a-JPEG note and the "is this a news story?" note      |
| `http://www.cmu.edu/`                            | An http link, redirected to https                                                             |
| `miami.cmu.edu`                                  | Cloudflare's bot check (`bot-check`)                                                          |
| `example.com`                                    | Not on FencePost's list: the request-a-site notice                                            |
| `www.cmu.edu/this-page-does-not-exist-fp/`       | A 404                                                                                         |
| `webkilt.andrew.cmu.edu/0/images/preview.jpg`    | Not a web page                                                                                |
| `www.cmu.edu:1/`                                 | A site FencePost can't connect to, and a custom port accepted                                 |
| `fencepost.andrew.cmu.edu` (until it's deployed) | A certificate that doesn't match the link                                                     |
