# Deployment

## Release Files

Each version tag (e.g., `0.2.0`) publishes:

- **A container image,** `ghcr.io/cmu-web/cmu-web-fencepost`, built for
  `linux/amd64`, with these tags:

  | Image Tag      | What                                      |
  | -------------- | ----------------------------------------- |
  | `X.Y.Z`        | The build of version tag `X.Y.Z`          |
  | `latest`       | The most recent version-tag build         |
  | `sha-<commit>` | A build identified by its short commit ID |

- **`fencepost-wordpress.zip`** on the tag's GitHub release: the WordPress
  plugin, FencePost Link Previews. See
  [its README](packages/wordpress/README.md).
- **The workflow action** at the same tag (e.g.,
  `cmu-web/cmu-web-fencepost@0.2.0`), which runs that release's image. See
  the [README](README.md#workflow-action).

## Install

FencePost runs as a container with no database or saved data. It captures
pages with the Chromium inside the image, over outbound HTTPS.

### In a Container

```sh
docker run -d --name fencepost \
  -p 127.0.0.1:3000:3000 \
  ghcr.io/cmu-web/cmu-web-fencepost:latest
```

Podman takes the same flags. For a deployment, pin the image by its digest,
so it's explicit, and keep the previous digest for rolling back:

```sh
docker pull ghcr.io/cmu-web/cmu-web-fencepost:latest
docker image inspect --format '{{index .RepoDigests 0}}' ghcr.io/cmu-web/cmu-web-fencepost:latest
```

Then run `ghcr.io/cmu-web/cmu-web-fencepost@sha256:...` in place of
`:latest`. The port binding exposes the service on the host's loopback
interface, for a reverse proxy in front of it.

### Configuration

Pass settings with `-e NAME=value` or `--env-file PATH`.
[`.env.example`](.env.example) is a starting point for an environment file.

| Variable      | Default                            | Purpose                                                                                                        |
| ------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `PORT`        | `3000`                             | Listening port inside the container                                                                            |
| `DNS_SERVERS` | `1.1.1.1,8.8.8.8`                  | Public resolvers for looking up the sites it captures, so names that exist only inside CMU's DNS don't resolve |
| `PUBLIC_URL`  | `https://fencepost.andrew.cmu.edu` | The public address, for links in the MCP guide                                                                 |

If you change `PORT`, change the container's side of the port mapping too.

### Build From Source

From the repository root:

```sh
docker build --target test .
docker build -t localhost/fencepost:latest .
```

With Podman, add `--format docker` to the second command, so the image keeps
the Dockerfile's health check. Use `localhost/fencepost:latest` in the run
command.

### Update

Pull the new release, record its digest and run it in place of the old one,
then check the service (below). If it fails, go back to the previous digest.

## Check the Service

```sh
curl --fail --show-error http://127.0.0.1:3000/healthz
```

`/healthz` returns `ok` once the server is listening. It doesn't capture a
page, so try a preview on the site too.

The Dockerfile's health check requests `/healthz` every 30 seconds, with a
five-second timeout and a 60-second grace period at startup, and follows
`PORT`. Docker runs it on its own;
`docker inspect --format '{{.State.Health.Status}}' fencepost` shows the
result. With Podman, `podman healthcheck run fencepost` runs it. A runtime
that ignores the Dockerfile's health check needs the same check set up
itself.

`docker logs --tail 100 fencepost` shows recent output.
