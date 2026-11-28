import { useEffect, useState } from 'react';
import { api, psdUrl } from '../api.js';
import { useApp } from '../App.jsx';
import ReferencePicker from '../components/ReferencePicker.jsx';
import Pose from '../components/StudioPose.jsx';

const passes = [
  { name: 'Place the pose', look: 'Find the top of the head and the bottoms of the shoes. Look at the space above, below and between them.',
    marks: ['Open a blank portrait canvas in your drawing app, or open the study file below and select Sketch. Pick a pencil. Make two small marks for the top and bottom of your figure on the empty side.',
      'Draw a light oval for the head. Measure its height against the whole figure in your reference. Use that same fraction of the space between your marks.',
      'Mark the shoulders and hips with two short lines. Join their middles. Add sticks for arms and legs, bending each stick where you see an elbow or knee.'],
    check: 'Compare the tilt of the shoulders and the position of the feet. If the figure feels off balance, shift one foot until it sits under the same part of the body as in your reference.' },
  { name: 'Build the body', look: 'Find the widest part of the chest, the waist and the hips. Clothes can hide these shapes. Estimate where the body sits inside them.',
    marks: ['Draw a rounded box for the chest and a smaller one for the hips over your stick figure.',
      'Give each arm and leg two sides. Taper them toward the wrists and ankles. Use mittens for hands and wedges for shoes.'],
    check: 'Compare one gap between the arm and waist, or between the legs. If your gap is too narrow, move the edge of the limb before drawing clothes.' },
  { name: 'Show who it is', look: 'Imagine the character as a shadow. Pick the outer hair shape, the largest clothing shape and one feature you would recognize from across a room.',
    marks: ['Fade the Sketch layer using its opacity slider. Add a transparent layer above it for Lines. Draw the hair as a few large clumps.',
      'Follow the outside edge of the outfit around your body shapes. Place the eyes by comparing their height on the face with your picture. Add the one feature you picked.'],
    check: 'Zoom out. If a signature feature disappears, compare its width to the head and adjust it. Leave tiny decorations for another drawing.' },
  { name: 'Finish in colour', look: 'Find the two or three colours that take up the most space. Decide which area is lightest and which is darkest.',
    marks: ['Hide your sketch with its eye icon. Put a Colour layer below Lines and above the paper. Paint the largest colour areas with a solid brush.',
      'Save your editable file. Export a PNG of your drawing alone. If you used the side-by-side study file, crop an export copy to the drawing half.'],
    check: 'Look at both pictures at thumbnail size. Pick one thing you captured and one thing to practise in the next pose. Upload this version so you can compare later.' },
];

export default function Studio() {
  const { query } = useApp();
  const [studies,setStudies] = useState(null);
  const [pick,setPick] = useState(false);
  const [grid,setGrid] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [retry,setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    api.studioStudies().then(r => { if (active) setStudies(r.studies); })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  },[retry]);
  const id = Number(query.get('study'));
  const study = studies?.find(d => d.id === id) || studies?.find(d => !d.file) || studies?.[0];
  const step = study?.studioPass ?? 0;
  const pass = passes[step];
  function select(d) {
    setPick(false); setError(''); window.location.hash = '#/?study='+d.id;
  }
  async function move(i) {
    setError(''); setBusy(true);
    try {
      const updated = await api.updateDrawing(study.id,{studioPass:i});
      setStudies(all => all.map(d => d.id === updated.id ? updated : d));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function finish(file) {
    if (!file) return;
    setBusy(true); setError('');
    try { await api.uploadFor(study.id,file); window.location.hash = '#/drawing/'+study.id+'?new=1'; }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  if (!studies) return error ? <p role="alert">{error} <button onClick={() => {setError('');setRetry(v=>v+1);}}>Retry</button></p> : <p>Opening your studio…</p>;
  return <>
    <header className="section"><div className="kicker">First project · Full-body fan art</div><h1>{pick || !study ? 'Draw a character you love' : study.title}</h1></header>
    {pick || !study ? <ReferencePicker onCancel={study ? () => setPick(false) : null} onStart={d => {setStudies(all => [d,...all]);select(d);}} /> : <>
      <div className="row"><button disabled={busy} className="btn small" onClick={() => setPick(true)}>Choose a new reference</button>
        {studies.length > 1 && <label>My studies <select disabled={busy} value={study.id} onChange={e => select(studies.find(d => d.id === Number(e.target.value)))}>{studies.map(d => <option key={d.id} value={d.id}>{d.title} · {d.file ? 'finished' : 'pass '+(d.studioPass+1)}</option>)}</select></label>}
        {study.file && <a href={'#/drawing/'+study.id}>View finished drawing</a>}
      </div>
      <nav className="section row" aria-label="Drawing passes">{passes.map((p,i) => <button disabled={busy} key={p.name} aria-current={i === step ? 'step' : undefined} className={'btn small'+(i===step?' primary':'')} onClick={() => move(i)}>{i+1}. {p.name}</button>)}</nav>
      <section className="section card grid-2">
        <div><figure className="studio-reference"><span className={'studio-frame'+(grid ? ' measured' : '')}><img src={study.reference} alt={'Your reference for '+study.title}/></span><figcaption>Your reference</figcaption></figure>
          <label className="row small"><input type="checkbox" checked={grid} onChange={e => setGrid(e.target.checked)}/> Show measuring grid</label>
          {grid && <p className="small">Find the horizontal line closest to the hips. Use it to compare how much of the figure sits above and below that height.</p>}
          <a className="btn small" href={psdUrl({drawing:study.id,layout:'side'})}>Download side-by-side study file (.psd)</a>
          <details><summary>See a worked example of this pass</summary><div className="studio-example"><Pose step={step}/></div></details>
        </div>
        <div aria-live="polite"><div className="kicker">Pass {step+1} of 4</div><h2>{pass.name}</h2>
        <p><strong>Look at your reference.</strong> {pass.look}</p>
        <ol>{pass.marks.map(mark => <li key={mark}>{mark}</li>)}</ol><h3>Check one thing</h3><p>{pass.check}</p>
        {step < 3 ? <button disabled={busy} className="btn primary" onClick={() => move(step+1)}>Next · {passes[step+1].name}</button> :
          study.file ? <a className="btn primary" href={'#/drawing/'+study.id}>Compare in Sketchbook</a> :
          <label className="field">Save your finished drawing<input disabled={busy} type="file" accept="image/*,.clip" onChange={e => {const f=e.target.files[0];e.target.value='';finish(f);}}/></label>}
        {error && <p role="alert">{error}</p>}</div>
      </section></>}
  </>;
}
