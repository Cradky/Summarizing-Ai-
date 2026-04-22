import { summarizeLocally } from '@/lib/summarize';

const OPENAI_BASE_URL = process.env.AI_BASE_URL ?? 'https://api.openai.com/v1';
const OPENAI_MODEL = process.env.AI_MODEL ?? 'gpt-4o-mini';

type RequestBody = {
  text?: string;
  points?: number;
};

type SummaryResult = {
  keyPoints: string[];
  paragraph: string;
};

function parseBulletText(content: string): string[] {
  return content
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•\d.\s]+/, '').trim())
    .filter(Boolean);
}

function stripCodeFence(content: string): string {
  return content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

function paragraphFromPoints(points: string[]): string {
  const source = points
    .slice(0, 3)
    .map((point) => point.replace(/^[•\-\s]+/, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!source) {
    return 'No paragraph summary was generated.';
  }

  return source;
}

function parseJsonSummary(content: string): SummaryResult | null {
  try {
    const parsed = JSON.parse(stripCodeFence(content)) as {
      keyPoints?: unknown;
      paragraph?: unknown;
    };

    const keyPoints = Array.isArray(parsed.keyPoints)
      ? parsed.keyPoints.map((item) => String(item).trim()).filter(Boolean)
      : [];
    const paragraph = typeof parsed.paragraph === 'string' ? parsed.paragraph.trim() : '';

    if (keyPoints.length === 0 && !paragraph) {
      return null;
    }

    return {
      keyPoints,
      paragraph: paragraph || paragraphFromPoints(keyPoints),
    };
  } catch {
    return null;
  }
}

async function runRemoteSummary(text: string, points: number): Promise<SummaryResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const keyPoints = summarizeLocally(text, points);
    return {
      keyPoints,
      paragraph: paragraphFromPoints(keyPoints),
    };
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
            'You summarize long text. Return ONLY valid JSON with keys "keyPoints" (array of concise strings) and "paragraph" (short 2-3 sentence summary).',
        },
        {
          role: 'user',
          content: `Summarize the following text into ${points} concise key points and one short paragraph:\n\n${text}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const keyPoints = summarizeLocally(text, points);
    return {
      keyPoints,
      paragraph: paragraphFromPoints(keyPoints),
    };
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
    const keyPoints = summarizeLocally(text, points);
    return {
      keyPoints,
      paragraph: paragraphFromPoints(keyPoints),
    };
  }

  const parsedJson = parseJsonSummary(content);
  if (parsedJson) {
    return parsedJson;
  }

  const bulletPoints = parseBulletText(content);
  const keyPoints = bulletPoints.length > 0 ? bulletPoints : summarizeLocally(text, points);
  return {
    keyPoints,
    paragraph: paragraphFromPoints(keyPoints),
  };
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
    const result = await runRemoteSummary(text, requestedPoints);

    return Response.json({
      provider: process.env.OPENAI_API_KEY ? 'openai-compatible' : 'local-extractive',
      model: process.env.OPENAI_API_KEY ? OPENAI_MODEL : 'heuristic',
      keyPoints: result.keyPoints,
      paragraph: result.paragraph,
      summary: result.keyPoints,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to summarize text.';
    return Response.json({ error: message }, { status: 500 });
  }
}
