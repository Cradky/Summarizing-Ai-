'use client';

import { FormEvent, useRef, useState } from 'react';

type SummaryResponse = {
  summary?: string[];
  keyPoints?: string[];
  paragraph?: string;
  provider: string;
  model: string;
};

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

type TextRange = {
  start: number;
  end: number;
};

type SourceMatch = {
  snippet: string;
  start: number;
  end: number;
};

const COMMON_WORDS = new Set([
  'about',
  'after',
  'also',
  'because',
  'between',
  'could',
  'first',
  'from',
  'have',
  'into',
  'just',
  'more',
  'most',
  'other',
  'over',
  'same',
  'should',
  'some',
  'than',
  'that',
  'their',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'under',
  'very',
  'what',
  'when',
  'where',
  'which',
  'while',
  'with',
  'would',
]);

function termsFrom(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9']+/g) ?? []).filter(
    (word) => word.length > 3 && !COMMON_WORDS.has(word),
  );
}

function normalizeKeyPoint(point: string): string {
  return point
    .replace(/^(in simple terms,|another way to say this is|put differently,|in short,|the key idea is that|this also means that)\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSentenceRanges(text: string): TextRange[] {
  const ranges: TextRange[] = [];
  const regex = /[^.!?\n][^.!?\n]*[.!?]?/g;
  let match = regex.exec(text);

  while (match) {
    const segment = match[0].trim();
    if (segment.length >= 24) {
      const rawStart = match.index;
      const leadingWhitespace = match[0].search(/\S/);
      const start = leadingWhitespace >= 0 ? rawStart + leadingWhitespace : rawStart;
      const end = start + segment.length;
      ranges.push({ start, end });
    }
    match = regex.exec(text);
  }

  return ranges;
}

function overlapScore(haystack: string, terms: string[]): number {
  if (terms.length === 0) {
    return 0;
  }

  const words = new Set(termsFrom(haystack));
  let overlap = 0;
  for (const term of terms) {
    if (words.has(term)) {
      overlap += 1;
    }
  }

  return overlap + overlap / terms.length;
}

function findBestSourceRange(text: string, keyPoint: string): TextRange | null {
  const normalizedPoint = normalizeKeyPoint(keyPoint);
  const terms = termsFrom(normalizedPoint);
  if (terms.length === 0 || !text.trim()) {
    return null;
  }

  const ranges = buildSentenceRanges(text);
  if (ranges.length === 0) {
    return null;
  }

  let bestRange: TextRange | null = null;
  let bestScore = 0;

  for (const range of ranges) {
    const candidate = text.slice(range.start, range.end);
    const score = overlapScore(candidate, terms);
    if (score > bestScore) {
      bestScore = score;
      bestRange = range;
    }
  }

  if (!bestRange || bestScore <= 0) {
    return null;
  }

  return bestRange;
}

const starterText = `Paste any long article, report, meeting notes, or research draft here.

The app will turn it into short key points, with a simple chat-style experience.`;

export function SummarizerChat() {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const composerRef = useRef<HTMLFormElement | null>(null);
  const flashTimeoutRef = useRef<number | null>(null);
  const [input, setInput] = useState(starterText);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Drop in a long text and I will condense it into the most important points.',
    },
  ]);
  const [summary, setSummary] = useState<string[]>([]);
  const [paragraph, setParagraph] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<string>('waiting');
  const [sourceMessage, setSourceMessage] = useState<string>('');
  const [sourceMatch, setSourceMatch] = useState<SourceMatch | null>(null);

  function triggerSourceFlash(field: HTMLTextAreaElement) {
    field.classList.remove('source-active');
    void field.offsetWidth;
    field.classList.add('source-active');

    if (flashTimeoutRef.current) {
      window.clearTimeout(flashTimeoutRef.current);
    }

    flashTimeoutRef.current = window.setTimeout(() => {
      field.classList.remove('source-active');
    }, 1200);
  }

  function jumpToSource(point: string) {
    const range = findBestSourceRange(input, point);
    const field = inputRef.current;

    if (!range || !field) {
      setSourceMessage('Could not find a strong source match for this key point.');
      setSourceMatch(null);
      return;
    }

    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    window.setTimeout(() => {
      field.focus();
      field.setSelectionRange(range.start, range.end);
      triggerSourceFlash(field);
    }, 220);

    const preview = input.slice(range.start, range.end).replace(/\s+/g, ' ').trim();
    setSourceMessage(`Jumped to source: "${preview.slice(0, 120)}${preview.length > 120 ? '...' : ''}"`);
    setSourceMatch({
      snippet: preview,
      start: range.start,
      end: range.end,
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = input.trim();
    if (!trimmed || loading) {
      return;
    }

    setLoading(true);
    setError(null);
    setMessages((current) => [...current, { role: 'user', content: trimmed }]);

    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: trimmed }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? 'The summarizer could not process the text.');
      }

      const payload = (await response.json()) as SummaryResponse;
      const renderedPoints = payload.keyPoints ?? payload.summary ?? [];
      const rendered = renderedPoints.length > 0 ? renderedPoints : ['No summary was returned.'];
      const renderedParagraph =
        payload.paragraph?.trim() || rendered.slice(0, 2).join(' ').replace(/\s+/g, ' ').trim() || 'No paragraph summary was returned.';

      setEngine(`${payload.provider} • ${payload.model}`);
      setSummary(rendered);
      setParagraph(renderedParagraph);
      setSourceMessage('Click a key point to jump to where it appears in your original text.');
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: `${renderedParagraph}\n\n${rendered.map((point) => `• ${point}`).join('\n')}`,
        },
      ]);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Something went wrong.';
      setError(message);
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: message,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="brand-tag">KeyPoint AI</p>
          <h1>Workspace</h1>
          <p className="sidebar-note">Turn long reads into quick highlights.</p>
        </div>
        <nav className="menu">
          <button className="menu-item active" type="button">
            Summarizer
          </button>
          <button className="menu-item" type="button">
            Recent Runs
          </button>
          <button className="menu-item" type="button">
            Prompt Notes
          </button>
        </nav>
        <div className="sidebar-footer">
          <span>Status</span>
          <strong>{loading ? 'Generating summary...' : 'Ready'}</strong>
        </div>
      </aside>

      <div className="main-grid">
        <header className="topbar">
          <div>
            <p className="eyebrow">Clean Summary Chat</p>
            <h2>Paste your text. Get key points in seconds.</h2>
          </div>
          <div className="chip">{engine}</div>
        </header>

        <form className="composer card" ref={composerRef} onSubmit={handleSubmit}>
          <label htmlFor="input">Input text</label>
          <textarea
            id="input"
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Drop a long article, transcript, notes, or report here..."
            rows={15}
          />
          {sourceMatch ? (
            <div className="source-preview" aria-live="polite">
              <strong>Matched source segment</strong>
              <p>{sourceMatch.snippet}</p>
            </div>
          ) : null}
          <div className="composer-footer">
            <span>{input.trim().length.toLocaleString()} characters</span>
            <button type="submit" disabled={loading || !input.trim()}>
              {loading ? 'Summarizing...' : 'Create summary'}
            </button>
          </div>
        </form>

        <aside className="conversation card" aria-live="polite">
          <div className="conversation-header">
            <h3>Chat stream</h3>
            <span>{messages.length} messages</span>
          </div>

          <div className="messages">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`bubble ${message.role}`}>
                <strong>{message.role === 'user' ? 'You' : 'AI'}</strong>
                <p>{message.content}</p>
              </div>
            ))}
          </div>
        </aside>

        <section className="summary-card card">
          <div className="summary-card-header">
            <h3>Paragraph + key points</h3>
            {summary.length > 0 ? <span>{summary.length} items</span> : <span>Waiting for text</span>}
          </div>
          {error ? (
            <p className="error">{error}</p>
          ) : summary.length > 0 ? (
            <>
              <article className="paragraph-panel">
                <h4>Short paragraph</h4>
                <p>{paragraph}</p>
              </article>
              <h4 className="list-title">Key points</h4>
              {sourceMessage ? <p className="source-message">{sourceMessage}</p> : null}
              <ul>
                {summary.map((point, index) => (
                  <li key={`${point}-${index}`}>
                    <button className="keypoint-link" type="button" onClick={() => jumpToSource(point)}>
                      {point}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="placeholder">Run a summary and your paragraph + key takeaways will appear here.</p>
          )}
        </section>
      </div>
    </section>
  );
}
