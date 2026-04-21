const STOP_WORDS = new Set([
  'a', 'about', 'after', 'again', 'all', 'also', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'because', 'been', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'done', 'for', 'from', 'had', 'has', 'have', 'he', 'her', 'hers', 'him', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'just', 'like', 'may', 'might', 'more', 'most', 'much', 'my', 'no', 'not', 'of', 'on', 'one', 'or', 'our', 'out', 'over', 'said', 'she', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those', 'to', 'too', 'up', 'use', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who', 'why', 'will', 'with', 'would', 'you', 'your', 'can', 'could', 'should', 'shall', 'may', 'might', 'must'
]);

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

function scoreSentences(sentences: string[]): Array<{ sentence: string; score: number; index: number }> {
  const wordFrequency = new Map<string, number>();

  for (const sentence of sentences) {
    for (const word of tokenize(sentence)) {
      if (STOP_WORDS.has(word) || word.length < 3) {
        continue;
      }

      wordFrequency.set(word, (wordFrequency.get(word) ?? 0) + 1);
    }
  }

  return sentences.map((sentence, index) => {
    const words = tokenize(sentence);
    if (words.length === 0) {
      return { sentence, score: 0, index };
    }

    const score = words.reduce((total, word) => total + (wordFrequency.get(word) ?? 0), 0) / words.length;

    return {
      sentence,
      score: Number(score.toFixed(4)),
      index,
    };
  });
}

function makeKeyPoints(sentences: string[], count: number): string[] {
  const scored = scoreSentences(sentences)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.min(count, sentences.length))
    .sort((left, right) => left.index - right.index);

  return scored.map(({ sentence }) => sentence.replace(/\s+/g, ' ').trim());
}

export function summarizeLocally(text: string, requestedPoints = 5): string[] {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  const sentences = splitSentences(normalized);
  if (sentences.length === 0) {
    return [normalized.slice(0, 200)];
  }

  const targetCount = Math.max(3, Math.min(requestedPoints, 8));
  const points = makeKeyPoints(sentences, targetCount);

  if (points.length > 0) {
    return points;
  }

  return sentences.slice(0, targetCount).map((sentence) => sentence.replace(/\s+/g, ' ').trim());
}
