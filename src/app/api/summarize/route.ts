import { summarizeLocally } from '@/lib/summarize';

const OPENAI_BASE_URL = process.env.AI_BASE_URL ?? 'https://api.openai.com/v1';
const OPENAI_MODEL = process.env.AI_MODEL ?? 'gpt-4o-mini';

type RequestBody = {
  text?: string;
  points?: number;
};

function parseBulletText(content: string): string[] {
  return content
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•\d.\s]+/, '').trim())
    .filter(Boolean);
}

async function runRemoteSummary(text: string, points: number): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return summarizeLocally(text, points);
  }

  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You summarize long text into concise key points. Return only a newline-separated list of bullets with no intro or closing line.',
        },
        {
          role: 'user',
          content: `Summarize the following text into ${points} concise key points:\n\n${text}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    return summarizeLocally(text, points);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
      };
    }>;
  };

  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    return summarizeLocally(text, points);
  }

  const bulletPoints = parseBulletText(content);
  return bulletPoints.length > 0 ? bulletPoints : summarizeLocally(text, points);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as RequestBody | null;
  const text = body?.text?.trim() ?? '';
  const requestedPoints = Math.max(3, Math.min(body?.points ?? 5, 8));

  if (!text) {
    return Response.json({ error: 'Please provide text to summarize.' }, { status: 400 });
  }

  if (text.length < 20) {
    return Response.json({ error: 'Please paste a longer passage to summarize.' }, { status: 400 });
  }

  try {
    const summary = await runRemoteSummary(text, requestedPoints);

    return Response.json({
      provider: process.env.OPENAI_API_KEY ? 'openai-compatible' : 'local-extractive',
      model: process.env.OPENAI_API_KEY ? OPENAI_MODEL : 'heuristic',
      summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to summarize text.';
    return Response.json({ error: message }, { status: 500 });
  }
}
