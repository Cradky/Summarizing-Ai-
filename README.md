# KeyPoint AI

A chat-style text summarizer built with Next.js. Paste long text into the app and get a concise set of key points back.

## Features

- Chat-like interface for entering long text
- Configurable OpenAI-compatible summarization API
- Local fallback summarizer when no API key is set
- Responsive layout with a focused reading experience

## Setup

1. Install dependencies.
2. Set your environment variables.
3. Run the development server.

## Environment variables

Create a `.env.local` file with:

```bash
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4o-mini
AI_BASE_URL=https://api.openai.com/v1
```

If `OPENAI_API_KEY` is not set, the app uses a local extractive summarizer so the UI still works.

## Scripts

- `npm run dev` starts the development server.
- `npm run build` creates a production build.
- `npm run start` starts the production server.
- `npm run lint` runs lint checks.

## Notes

This workspace was created without a local Node.js toolchain, so dependency installation and build verification still need to be run on a machine with Node.js installed.
