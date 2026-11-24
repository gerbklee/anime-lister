import { useState } from 'react';
import { api } from '../api.js';

// Critique in Claude.ai with your own subscription: Atelier prepares the same
// instructions and images it would send through the API; you paste them into
// Claude.ai and paste Claude's answer back.
const LEVELS = [
  { id: 'quick', name: 'Quick', text: 'The picture only, 1–2 fixes.' },
  { id: 'standard', name: 'Standard', text: 'Plus the reference and up to 3 layers.' },
  { id: 'full', name: 'Full', text: 'Plus up to 8 layers and your process.' },
];

async function toPng(url) {
  const blob = await (await fetch(url, { credentials: 'same-origin' })).blob();
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  canvas.getContext('2d').drawImage(bmp, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export default function ManualCritique({ drawing, defaultLevel, onSaved, toast }) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState(defaultLevel);
  const [pack, setPack] = useState(null);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(null);
  const [copied, setCopied] = useState({});
  const canCopyImages = typeof window !== 'undefined' && !!window.ClipboardItem && !!navigator.clipboard?.write;

  const prepare = async (lv = level) => {
    setBusy('prepare');
    try {
      setPack(await api.manualCritique(drawing.id, lv));
      setCopied({});
    } catch (e) {
      toast(e.message);
    }
    setBusy(null);
  };
  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(pack.prompt);
      setCopied((c) => ({ ...c, prompt: true }));
    } catch {
      toast('Copying isn’t allowed here: select the text in the box and copy it by hand.');
    }
  };
  const copyImage = async (img, i) => {
    try {
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': toPng(img.url) })]);
      setCopied((c) => ({ ...c, [i]: true }));
    } catch {
      toast('Copying images needs HTTPS (your Tailscale address). Use Download instead.');
    }
  };
  const save = async () => {
    setBusy('save');
    try {
      onSaved(await api.saveManualCritique(drawing.id, pack.level, answer));
      setAnswer('');
      setPack(null);
      setOpen(false);
      toast('Critique saved');
    } catch (e) {
      toast(e.message);
    }
    setBusy(null);
  };

  if (!open) {
    return (
      <div className="manual-critique">
        <button className="btn small" onClick={() => setOpen(true)}>
          Critique in Claude.ai (your subscription)
        </button>
      </div>
    );
  }
  return (
    <div className="manual-critique card" style={{ background: 'var(--paper)', padding: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>Critique in Claude.ai</strong>
        <button className="btn small ghost" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <p className="tiny muted" style={{ margin: '4px 0 10px' }}>
        Uses your Claude Pro plan instead of the API: free, takes about a minute of copying. The result shows here like any critique, with highlights on your drawing, but it doesn’t count as proof for your skill levels.
      </p>
      <div className="seg small" role="radiogroup" aria-label="Critique level" style={{ marginBottom: 12 }}>
        {LEVELS.map((l) => (
          <button
            key={l.id}
            role="radio"
            aria-checked={level === l.id}
            className={level === l.id ? 'active' : ''}
            title={l.text}
            onClick={() => {
              setLevel(l.id);
              if (pack) prepare(l.id);
            }}
          >
            {l.name}
          </button>
        ))}
      </div>
      {!pack ? (
        <button className="btn primary small" onClick={() => prepare()} disabled={busy === 'prepare'}>
          {busy === 'prepare' ? 'Preparing…' : 'Prepare prompt and images'}
        </button>
      ) : (
        <ol className="manual-steps">
          <li>
            <strong>Open a new chat</strong> in{' '}
            <a href="https://claude.ai/new" target="_blank" rel="noreferrer">
              Claude.ai ↗
            </a>{' '}
            (Opus is best for this).
          </li>
          <li>
            <strong>Attach {pack.images.length === 1 ? 'this image' : `these ${pack.images.length} images, in this order`}:</strong>
            <div className="manual-images">
              {pack.images.map((img, i) => (
                <figure key={img.url}>
                  <img src={img.url} alt={img.label} />
                  <figcaption className="tiny muted">
                    {i + 1}. {img.label}
                  </figcaption>
                  <span className="row" style={{ gap: 6 }}>
                    {canCopyImages && (
                      <button className="btn small" onClick={() => copyImage(img, i)}>
                        {copied[i] ? '✓ Copied' : 'Copy'}
                      </button>
                    )}
                    <a className="btn small ghost" href={img.url} download={img.name}>
                      Download
                    </a>
                  </span>
                </figure>
              ))}
            </div>
          </li>
          <li>
            <strong>Paste the prompt</strong> and send it.{' '}
            <button className="btn small" onClick={copyPrompt}>
              {copied.prompt ? '✓ Prompt copied' : 'Copy prompt'}
            </button>
            <details className="tiny" style={{ marginTop: 6 }}>
              <summary>Show the prompt</summary>
              <textarea readOnly value={pack.prompt} rows={8} style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.72rem' }} onFocus={(e) => e.target.select()} />
            </details>
          </li>
          <li>
            <strong>Copy Claude’s whole answer</strong> (the copy button under it) and paste it here:
            <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={6} placeholder='{"summary": "…", "fixes": […], …}' style={{ width: '100%', marginTop: 6, fontFamily: 'monospace', fontSize: '0.75rem' }} />
            <button className="btn primary small" onClick={save} disabled={!answer.trim() || busy === 'save'} style={{ marginTop: 6 }}>
              {busy === 'save' ? 'Reading it…' : 'Save critique'}
            </button>
          </li>
        </ol>
      )}
    </div>
  );
}
