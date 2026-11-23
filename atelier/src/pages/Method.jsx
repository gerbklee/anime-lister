// How Atelier teaches, and why: each principle with what research says and
// what Atelier does with it. Honest about where the evidence is about drawing
// itself and where it comes from learning research in general.

const PRINCIPLES = [
  {
    title: 'Drawing what you see changes how you see',
    research:
      'Art students followed through a five-month foundational drawing course got better at drawing and at several visual skills (mental rotation, finding shapes inside complex figures, switching attention). Drawing errors come less from “seeing wrong” and more from where you put your attention and what you remember between looking and drawing.',
    atelier: 'Observation studies run through the whole path, with measuring, angles and negative shapes, not just “copy it”. The checking routine (flip, zoom out, grey) trains your attention to catch errors.',
    sources: [
      ['Chamberlain, Kozbelt, Drake & Wagemans (2021), Learning to see by learning to draw', 'https://research.gold.ac.uk/id/eprint/25885'],
      ['Chamberlain & Wagemans (2016), The genesis of errors in drawing', 'https://research.gold.ac.uk/id/eprint/20010/1/Chamberlain%20&%20Wagemans%20-%20Errors%20in%20drawing%20pre%20formatting%20.pdf'],
    ],
  },
  {
    title: 'Study, then draw it from memory',
    research:
      'Visual memory is one of the abilities linked to drawing skill, and retrieving something (rather than re-reading or re-copying it) is one of the most reliable ways to make learning last. Drawing from memory is hard, and that difficulty is the point.',
    atelier: 'Lessons pair a study with a from-memory drawing, then you compare. Lessons begin by recalling the last one. Reviews prefer the memory exercises.',
    sources: [
      ['Chamberlain (2018), The development of expertise in the visual arts', 'https://research.gold.ac.uk/id/eprint/21013/1/Chamberlain%20%282017%29%20Expertise%20in%20the%20Visual%20Arts.pdf'],
      ['Roediger & Karpicke (2006), Test-enhanced learning', 'https://doi.org/10.1111/j.1467-9280.2006.01693.x'],
    ],
  },
  {
    title: 'Copy freehand; check with an overlay',
    research:
      'Studies of handwriting and shape learning find freehand copying builds skill better than tracing, because tracing guides the hand without making the eye judge anything. (This comes from handwriting research, not art students, so it’s an informed extrapolation.)',
    atelier: 'Study files put the reference beside your canvas, or under it but hidden: you draw freehand, then show it to check. The overlay in your sketchbook shows where you drifted.',
    sources: [],
  },
  {
    title: 'Spread practice out, and come back',
    research: 'Practice spread over days is remembered far longer than the same practice crammed into one session: one of the most replicated findings in learning research.',
    atelier: 'Every finished lesson comes back as a short review: tomorrow, then after growing gaps (about 2½×, longer if it was easy, sooner if it was hard). A 90-minute day is split into blocks with breaks.',
    sources: [['Cepeda et al. (2006), Distributed practice in verbal recall tasks: a review', 'https://doi.org/10.1037/0033-2909.132.3.354']],
  },
  {
    title: 'Mix topics and styles',
    research:
      'People who saw paintings by different artists mixed together learned to recognise each artist’s style on new paintings much better (about 59% vs 36%) than those who saw one artist at a time, though most felt the blocked way had worked better. In motor learning, varied practice also transfers better than repeating one thing.',
    atelier: 'Daily reviews come from different skill areas, never the same one twice. The master-copy warm-up uses a different anime artist every time.',
    sources: [
      ['Kornell & Bjork (2008), Learning concepts and categories: is spacing the “enemy of induction”?', 'https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2016/07/Kornell_Bjork_2008_PsychScience.pdf'],
      ['Firth, Rivers & Boyle (2021), A systematic review of interleaving', 'https://strathprints.strath.ac.uk/75711/7/Firth_etal_RE_2021_A_systematic_review_of_interleaving.pdf'],
    ],
  },
  {
    title: 'One clear goal, specific feedback',
    research:
      'Deliberate practice means working on one specific thing just beyond what you can do, with feedback. Feedback helps most when it says where you’re going, how you’re doing and what to do next, about the work, not about you. Vague praise doesn’t help.',
    atelier: 'Every session shows one thing to work on (from your last critique or self-rating). Critiques give what works, the 2–3 fixes that matter most (pinned on your drawing) and one next step.',
    sources: [
      ['Hattie & Timperley (2007), The power of feedback', 'https://doi.org/10.3102/003465430298487'],
      ['Ericsson, Krampe & Tesch-Römer (1993), Deliberate practice', 'https://doi.org/10.1037/0033-295X.100.3.363'],
    ],
  },
  {
    title: 'Judge your own work first',
    research: 'Students who regularly assess their own work against clear criteria get better at judging it over time, especially when they compare their judgement with an expert’s.',
    atelier: 'You rate each drawing on the area’s criteria before any critique, and Progress shows how close your ratings are to the critiques (your “eye”).',
    sources: [['Boud, Lawson & Thompson (2013), Does student engagement in self-assessment calibrate their judgement over time?', 'https://opus.cloud1.lib.uts.edu.au/bitstream/10453/27692/4/B%2cL%26T%20AEHE%202013%20sa%20paper%20accepted.pdf']],
  },
  {
    title: 'Plans, weeks and fresh starts keep you going',
    research:
      'A concrete “when and where” plan roughly doubles follow-through. Habits take about two months to become automatic, and missing a single day doesn’t undo them. People start new goals more readily at “fresh starts” like Mondays and the first of the month.',
    atelier: 'Your plan sentence and reminder, a weekly target with grace days instead of a fragile daily streak, and a fresh-page review every Monday and month.',
    sources: [
      ['Gollwitzer & Sheeran (2006), Implementation intentions and goal achievement', 'https://doi.org/10.1016/S0065-2601(06)38002-1'],
      ['Lally et al. (2010), How are habits formed', 'https://doi.org/10.1002/ejsp.674'],
      ['Dai, Milkman & Riis (2014), The fresh start effect', 'https://doi.org/10.1287/mnsc.2014.1901'],
    ],
  },
];

export default function Method() {
  return (
    <div style={{ maxWidth: 820, marginTop: 10 }}>
      <div className="kicker">The science behind it</div>
      <h1>How Atelier teaches</h1>
      <p className="muted">
        Atelier’s path takes you from basic forms to finished anime illustrations; how it teaches comes from research on learning. Where a finding comes from drawing itself, it says so; much of it comes from learning research in general, because studies of learning to draw are still few.
      </p>
      <div className="wash section">
        <div className="kicker">The loop of every exercise</div>
        <ol style={{ margin: '6px 0 0', paddingLeft: 20 }}>
          <li>
            <strong>One goal:</strong> the thing you’re working on today.
          </li>
          <li>
            <strong>Observe:</strong> study the reference, measure, look for the big shapes.
          </li>
          <li>
            <strong>Draw freehand</strong> in a focus block.
          </li>
          <li>
            <strong>Check:</strong> flip, zoom out, overlay; rate yourself.
          </li>
          <li>
            <strong>From memory:</strong> draw it again without looking, then compare.
          </li>
          <li>
            <strong>Feedback & review:</strong> a critique if you like, and the skill comes back in a few days.
          </li>
        </ol>
      </div>
      {PRINCIPLES.map((p) => (
        <section key={p.title} className="section card">
          <h3>{p.title}</h3>
          <p>
            <strong className="small">Research: </strong>
            {p.research}
          </p>
          <p>
            <strong className="small">In Atelier: </strong>
            {p.atelier}
          </p>
          {p.sources.length > 0 && (<ul className="tiny muted" style={{ margin: 0, paddingLeft: 18 }}>
            {p.sources.map(([t, u]) => (
              <li key={u}>
                <a href={u} target="_blank" rel="noreferrer">
                  {t}
                </a>
              </li>
            ))}
          </ul>)}
        </section>
      ))}
      <p className="small muted section">
        What research doesn’t settle: the best order of topics for anime specifically, or exact practice amounts. The path follows the order most art schools and teachers use (forms → figure → anatomy → faces → light → colour → composition → rendering), and you can always revisit anything.
      </p>
    </div>
  );
}
