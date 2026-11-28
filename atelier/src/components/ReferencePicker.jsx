import { useEffect, useState } from 'react';
import { api, findReferences } from '../api.js';

export default function ReferencePicker({ onStart, onCancel }) {
  const [name, setName] = useState('');
  const [results, setResults] = useState(null);
  const [file, setFile] = useState(null);
  const [localUrl, setLocalUrl] = useState('');
  const [chosen, setChosen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!file) { setLocalUrl(''); return; }
    const url = URL.createObjectURL(file);
    setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function search() {
    setBusy(true); setError(''); setResults(null);
    try {
      const tag = name.trim().toLowerCase().replace(/\s+/g, '_');
      setResults(await findReferences([tag], { minEdge: 0 }));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function start() {
    setBusy(true); setError('');
    try {
      let picture = file;
      if (!picture) {
        const res = await fetch(chosen.preview);
        if (!res.ok) throw new Error('The picture could not be loaded. Choose another result or upload a picture.');
        picture = await res.blob();
      }
      onStart(await api.startStudio(name.trim(), picture, chosen?.postUrl));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <section className="section card">
    <h2>Choose your character and reference</h2>
    <p>Look for one standing figure with the head, hands and both feet visible. A front or three-quarter view makes the first sketch easier.</p>
    <fieldset disabled={busy} style={{border:0, padding:0, margin:0}}>
      <label className="field">Character name<input value={name} maxLength={100} onChange={e => {setName(e.target.value); setResults(null); setChosen(null);}} /></label>
      <div className="row section"><button className="btn" disabled={!name.trim()} onClick={search}>Find character pictures</button>
      <label className="field">Or upload your reference<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => {if(e.target.files[0]) {setFile(e.target.files[0]); setChosen(null);}}} /></label></div>
      {results && <div className="studio-gallery">{results.map((r,i) => <button type="button" className="btn" key={r.key} aria-label={'Choose reference '+(i+1)} aria-pressed={chosen?.key === r.key} onClick={() => {setChosen(r); setFile(null);}}>
        <img src={r.thumb || r.preview} alt="" loading="lazy" /></button>)}</div>}
      {results?.length === 0 && <p>No pictures found. Try the character’s catalog name, or upload an image.</p>}
      {(localUrl || chosen) && <figure><img className="studio-preview" src={chosen?.preview || localUrl} alt="Selected reference" /></figure>}
      <div className="row"><button className="btn primary" disabled={!name.trim() || (!file && !chosen)} onClick={start}>Start drawing</button>
      {onCancel && <button className="btn" onClick={onCancel}>Back to my study</button>}</div>
    </fieldset>
    {busy && <p role="status">Loading…</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
