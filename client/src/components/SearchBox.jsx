import { useEffect, useState } from 'react';
import { api } from '../api.js';

const MIN_CHARS = 2;
const DEBOUNCE_MS = 300;

function highlight(text, term) {
  const index = text.toLowerCase().indexOf(term.toLowerCase());
  if (!term || index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + term.length)}</mark>
      {text.slice(index + term.length)}
    </>
  );
}

export default function SearchBox({ existingIds, onAdd }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [adding, setAdding] = useState(null);

  const term = query.trim();

  // Debounced search-as-you-type; stale requests are aborted.
  useEffect(() => {
    if (term.length < MIN_CHARS) {
      setResults([]);
      setLoading(false);
      setError(null);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await api.search(term, controller.signal);
        setResults(data.results);
        setError(null);
        setActive(data.results.length ? 0 : -1);
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  const choose = async (result) => {
    if (!result || existingIds.has(result.anilistId) || adding) return;
    setAdding(result.anilistId);
    setError(null);
    try {
      await onAdd(result);
      setQuery('');
      setResults([]);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(null);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showDropdown = open && term.length >= MIN_CHARS;

  let content;
  if (error) {
    content = <li className="suggestion-msg error-text">{error}</li>;
  } else if (results.length) {
    content = results.map((r, i) => {
      const inList = existingIds.has(r.anilistId);
      return (
        <li
          key={r.anilistId}
          id={`suggestion-${i}`}
          role="option"
          aria-selected={i === active}
          aria-disabled={inList}
          className={`suggestion ${i === active ? 'active' : ''} ${inList ? 'disabled' : ''}`}
          onMouseDown={(e) => e.preventDefault()} // keep focus in the input
          onMouseEnter={() => setActive(i)}
          onClick={() => choose(r)}
        >
          {r.image ? <img src={r.image} alt="" loading="lazy" /> : <div className="img-placeholder small" />}
          <div className="suggestion-text">
            <div className="suggestion-name">{highlight(r.name, term)}</div>
            <div className="suggestion-series">
              {r.series[0] ?? 'Unknown series'}
              {r.series.length > 1 && <span className="muted"> +{r.series.length - 1} more</span>}
            </div>
          </div>
          <span className={`badge ${inList ? '' : 'add'}`}>
            {inList ? 'In list' : adding === r.anilistId ? 'Adding…' : '+ Add'}
          </span>
        </li>
      );
    });
  } else if (loading) {
    content = <li className="suggestion-msg muted">Searching…</li>;
  } else {
    content = <li className="suggestion-msg muted">No characters found</li>;
  }

  return (
    <div className="search">
      <span className="search-icon" aria-hidden="true">🔍</span>
      <input
        type="search"
        placeholder="Search for a character to add…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls="search-suggestions"
        aria-autocomplete="list"
        aria-activedescendant={showDropdown && active >= 0 ? `suggestion-${active}` : undefined}
      />
      {loading && <span className="spinner" aria-label="Searching" />}
      {showDropdown && (
        <ul id="search-suggestions" className="suggestions" role="listbox">
          {content}
        </ul>
      )}
    </div>
  );
}
