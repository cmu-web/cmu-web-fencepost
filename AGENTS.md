# FencePost: Notes for AI Agents

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [DEVELOPMENT.md](DEVELOPMENT.md)
before changing anything. The rules agents most often break here:

- Pages use CMU's template and the Web Kilt, nothing else.
- Before writing markup, find the component: ask the Web Kilt MCP server
  (https://webkilt.andrew.cmu.edu/mcp) or browse the Components page
  (https://webkilt.andrew.cmu.edu/0/components.html).
- Use the template's classes first, then the Kilt's (cmu-).
  `docs/css/fencepost.css` holds the few styles the Kilt doesn't have yet;
  don't add to it or add other project classes. If the Kilt lacks something,
  say so and stop; it gets added to the Kilt.
- Never copy the template's CSS or values; pages load it from www.cmu.edu.
- Edit TypeScript in `src/`; `dist/` is generated and isn't committed.
- The version is in four places: `package.json`, the WordPress plugin's
  `Version` header, its `readme.txt` Stable tag and the `RELEASE_IMAGE:` line
  in `action.yml`. Change them together; `npm run check` fails until they
  match.
- After changing `domains.json`, run `npm run docs` to update the Approved
  Sites table. Contacts for each group never go in the repository.
- The everyday check never uses the network. Try real pages by hand, with
  the list in DEVELOPMENT.md.
- Made-up people only (e.g., Andrew Carnegie, ac00).
- Follow the Web Kilt's [writing conventions](https://webkilt.andrew.cmu.edu/0/conventions.html).
- Versions use semantic versioning as plain numbers (e.g., `0.1.0`).
