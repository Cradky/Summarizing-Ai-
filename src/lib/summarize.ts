function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function isSubstantial(sentence: string): boolean {
  return sentence.trim().length >= 24;
}

function dedupeAndTrim(points: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const point of points) {
    const normalized = point.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function paragraphIdea(paragraph: string): string[] {
  const sentences = splitSentences(paragraph);
  if (sentences.length === 0) {
    return [];
  }

  const first = sentences[0];
  const last = sentences[sentences.length - 1];
  const picks = [first];

  if (sentences.length > 1 && last.trim().toLowerCase() !== first.trim().toLowerCase()) {
    picks.push(last);
  }

  return picks.filter(isSubstantial);
}

function buildParagraphAwarePoints(paragraphs: string[], requestedPoints: number): string[] {
  if (paragraphs.length === 0) {
    return [];
  }

  const firstParagraphPoints = paragraphIdea(paragraphs[0]);
  const lastParagraphPoints = paragraphs.length > 1 ? paragraphIdea(paragraphs[paragraphs.length - 1]) : [];
  const middleParagraphPoints = paragraphs
    .slice(1, -1)
    .flatMap((paragraph) => {
      const ideas = paragraphIdea(paragraph);
      return ideas.length > 0 ? [ideas[0]] : [];
    });

  const prioritized = dedupeAndTrim([
    ...firstParagraphPoints,
    ...middleParagraphPoints,
    ...lastParagraphPoints,
  ]);

  if (prioritized.length === 0) {
    return [];
  }

  const minimum = Math.min(3, prioritized.length);
  const maximum = Math.max(minimum, Math.min(Math.max(requestedPoints, 3), 12));
  return prioritized.slice(0, maximum);
}

export function summarizeLocally(text: string, requestedPoints = 5): string[] {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  const paragraphs = splitParagraphs(normalized);
  if (paragraphs.length === 0) {
    return [normalized.slice(0, 200).trim()];
  }

  const points = buildParagraphAwarePoints(paragraphs, requestedPoints);

  if (points.length > 0) {
    return points;
  }

  const fallbackSentences = splitSentences(normalized)
    .filter(isSubstantial)
    .slice(0, Math.max(3, Math.min(requestedPoints, 8)));

  if (fallbackSentences.length > 0) {
    return dedupeAndTrim(fallbackSentences);
  }

  return [normalized.slice(0, 200).trim()];
}
