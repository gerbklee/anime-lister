import { useState } from 'react';

// Renders AniList's light markdown: __bold__, [text](url) and ~!spoilers!~
// (blurred until tapped). Line breaks are kept.

function Spoiler({ children }) {
  const [shown, setShown] = useState(false);
  return shown ? (
    <span className="inline-spoiler shown">{children}</span>
  ) : (
    <button type="button" className="inline-spoiler" onClick={() => setShown(true)} title="Spoiler: tap to show">
      {children}
    </button>
  );
}

function inline(text, keyBase) {
  const out = [];
  // Links become plain text; bold is kept.
  const plain = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  plain.split(/(__[^_]+?__)/g).forEach((part, i) => {
    if (!part) return;
    if (part.startsWith('__') && part.endsWith('__') && part.length > 4) out.push(<b key={`${keyBase}-${i}`}>{part.slice(2, -2)}</b>);
    else out.push(part.replace(/\b_([^_]+)_\b/g, '$1'));
  });
  return out;
}

export function RichText({ text, className = '' }) {
  if (!text) return null;
  const parts = text.split(/(~![\s\S]*?!~)/g);
  return (
    <span className={`rich-text ${className}`}>
      {parts.map((part, i) =>
        part.startsWith('~!') && part.endsWith('!~') ? (
          <Spoiler key={i}>{inline(part.slice(2, -2).trim(), i)}</Spoiler>
        ) : (
          <span key={i}>{inline(part, i)}</span>
        ),
      )}
    </span>
  );
}

// Splits leading "__Label:__ value" lines (height, affiliation, …) off a
// character description into a list of facts.
export function splitFacts(text) {
  if (!text) return { facts: [], body: '' };
  const facts = [];
  const body = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*__([^_]{1,40}?):?__\s*:?\s*(.+)$/);
    if (m && m[2].length < 200) facts.push({ label: m[1].replace(/:$/, '').trim(), value: m[2].trim() });
    else body.push(line);
  }
  return { facts, body: body.join('\n').replace(/^\s+|\s+$/g, '') };
}
