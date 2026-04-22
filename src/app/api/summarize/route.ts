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
  const cleaned = points
    .map((point) => point.replace(/^[•\-\s]+/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 5);

  if (cleaned.length === 0) {
    return 'No paragraph summary was generated.';
  }

  const first = `Overall, the text focuses on ${cleaned[0].charAt(0).toLowerCase()}${cleaned[0].slice(1)}.`;
  const middle = cleaned
    .slice(1, 4)
    .map((point, index) => {
      if (index === 0) {
        return `It also explains that ${point.charAt(0).toLowerCase()}${point.slice(1)}.`;
      }
      if (index === 1) {
        return `Another important takeaway is that ${point.charAt(0).toLowerCase()}${point.slice(1)}.`;
      }
      return `Finally, it underlines how ${point.charAt(0).toLowerCase()}${point.slice(1)}.`;
    })
    .join(' ');

  const closing =
    cleaned.length > 4
      ? `Taken together, these points show that ${cleaned[4].charAt(0).toLowerCase()}${cleaned[4].slice(1)}.`
      : 'Taken together, these ideas show the core message and why it matters.';

  return [first, middle, closing].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
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
            'You summarize long text in your own words. Avoid quoting the source directly unless essential. Return ONLY valid JSON with keys "keyPoints" (array of concise paraphrased strings, no copied sentences) and "paragraph" (a longer synthesized summary of 4-6 sentences that combines the key points).',
        },
        {
          role: 'user',
          content: `Summarize the following text into ${points} key points rewritten in your own words and one longer paragraph that synthesizes those key points:\n\n${text}`,
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
