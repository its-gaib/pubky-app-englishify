[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/pubky/pubky-app)

# Pubky web app

## Englishify vibe

This fork adds an on-demand **Translate to English** action to non-English post
text. Language assessment runs locally in the browser with bounded script and
word heuristics, so simply viewing a feed never calls an AI service.

Translation is requested only after a click and uses OVHcloud's anonymous
Llama 3.3 endpoint directly from the browser. No account or API key is needed.
The selected post text and the visitor's IP address necessarily reach OVHcloud;
Pubky does not proxy or persist the translation. Model output is displayed as
plain text, never as links or executable Markdown.

## Prerequisites

- Node.js (see [.nvmrc](./.nvmrc) for the recommended version)

## Getting Started

First, install the dependencies and run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Environment Variables

Copy the example environment file and adjust the values as needed:

```bash
cp .env.example .env
```

See [docs/environment.md](./docs/environment.md) for more details.

## Common Workflows

- Check architecture and coding conventions: [docs/README.md](./docs/README.md)
- Run local code review workflow (Cursor): use `/review` (defined in `.cursor/skills/code-review/SKILL.md`)
- Follow commit message format: [docs/commit-message.md](./docs/commit-message.md)

## License

This project is licensed under the MIT License.  
See the [LICENSE](./LICENSE) file for more details.
