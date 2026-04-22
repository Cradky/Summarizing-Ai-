'use client';

import { FormEvent, useState } from 'react';

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

const starterText = `Paste any long article, report, meeting notes, or research draft here.

The app will turn it into short key points, with a simple chat-style experience.`;

export function SummarizerChat() {
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

        <form className="composer card" onSubmit={handleSubmit}>
          <label htmlFor="input">Input text</label>
          <textarea
            id="input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Drop a long article, transcript, notes, or report here..."
            rows={15}
          />
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
              <ul>
                {summary.map((point, index) => (
                  <li key={`${point}-${index}`}>{point}</li>
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
