# Development

Set up your computer once with
[Working on CMU Web Projects](https://github.com/cmu-web/.github/blob/main/DEVELOPMENT.md);
this page covers this project's own commands.

FencePost is a TypeScript service built with Express, Playwright and sharp.
It captures public pages in Playwright's Chromium and keeps nothing on disk.
The repository also holds its WordPress plugin (`packages/wordpress/`) and
its workflow action (`action.yml`).

## Build It

Use the Node version in [the Dockerfile](Dockerfile), then, from the
checkout:

```bash
make setup
make run
```

It serves FencePost at http://127.0.0.1:3400/ and restarts when `src/`
changes. Taking a screenshot uses Playwright's Chromium, installed as the
setup page describes; the container image includes its own.

### Capture From a Checkout

The command line makes the same images as the site:

```bash
npm run gallery -- https://www.cmu.edu/example/ example.webp
npm run gallery -- https://www.cmu.edu/example/ example-phone.webp --phone
npm run shoot -- http://127.0.0.1:4000/ --preview images/preview.jpg --phone phone.webp --delay 3
```

`npm run shoot` is what the workflow action runs. Only this command line
reaches private and loopback addresses; the website, the API and the MCP
server keep the public-only rule, and the tests check it.

### Preview a Web Kilt Change

To see an unreleased Web Kilt change in FencePost, run `make run`, then
`npm run preview:kilt` in a second terminal and open http://127.0.0.1:3401/.
It puts the Web Kilt's preview proxy in front of FencePost, with the pages'
Kilt links pointed at the checkout beside this one (`../cmu-web-kilt`, or
set `KILT_DIR`). FencePost itself is unchanged and still shows the pinned
release at http://127.0.0.1:3400/.

## Check a Change

The everyday check is `make check` (`npm run check`): it needs nothing
beyond `make setup` and no network access. It checks the Node version,
ESLint, Prettier and TypeScript, runs the tests, and checks that the
Approved Sites table, the WordPress plugin and the action match
`package.json` and `domains.json`. The tests don't start a browser. The
Publish Image workflow runs the same check in the Dockerfile's `test` stage;
to run it that way, use `docker build --target test .` (Podman takes the
same command).

After changing `domains.json`, run `make docs` to update the Approved
Sites table on the Reference page; `make check` fails until it matches.
Contacts for each group are kept privately, never in the repository.

The Test Action workflow also builds the container image on every push and
pull request and runs FencePost's own action against `docs/`, as a site's
workflow would. It runs only in CI. `test/forgejo/` runs the action on a
Forgejo runner in a NixOS VM.

### Linting and Formatting

`npm run lint:fix` and `npm run format` apply fixes; review the diff.
`npm run lint` and `npm run format:check` check without changing files.

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

## Release

1. Bump the version in four places, together: `package.json` (e.g.,
   `npm version 0.2.0 --no-git-tag-version`), the WordPress plugin's
   `Version` header and its `readme.txt` Stable tag, and the
   `RELEASE_IMAGE:` line in `action.yml`, which runs the release's container
   image. `make check` fails until all of them match.
2. Commit (`chore: release 0.2.0`), tag the commit (e.g., `0.2.0`, with no
   `v`) and push `main` and the tag together.
3. Create the tag's GitHub release with its notes. The Publish Image workflow
   publishes the image and attaches `fencepost-wordpress.zip` to the release
   once it exists.
4. The action works for the tag once its image is published, a few minutes
   after the tag is pushed.
5. Update deployments: get the new image's digest and pin it where FencePost
   runs (see [Deployment](DEPLOYMENT.md)), keeping the previous digest for
   rolling back.
