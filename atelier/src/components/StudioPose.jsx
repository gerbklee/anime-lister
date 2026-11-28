// One pose throughout so the learner can see exactly what each pass adds.
export default function Pose({ step }) {
  const guides = <g fill="none" stroke="#a85f47" strokeWidth="2" strokeDasharray="4 3">
    <ellipse cx="94" cy="40" rx="17" ry="20" />
    <path d="M94 60 Q86 88 90 119 M68 70 L110 66 M68 70 L58 96 51 117 M110 66 L124 89 133 100 M77 117 L101 122 M77 117 L80 161 80 202 M101 122 L114 158 128 196" />
  </g>;
  const body = <g stroke="#514f5a" strokeWidth="2.5" strokeLinejoin="round">
    <path fill="#f5d7bb" d="M77 40 Q76 19 96 20 Q116 23 111 43 Q106 59 94 61 Q80 57 77 40Z" />
    <path fill={step === 3 ? '#587d86' : '#eee9df'} d="M68 69 L86 61 100 61 112 66 119 80 108 85 104 106 78 106 74 86 62 83Z" />
    <path fill="#f5d7bb" d="M63 83 L73 86 64 99 55 119 48 116 56 94Z M109 85 L118 80 126 88 137 98 132 105 119 96Z" />
    <path fill={step === 3 ? '#586379' : '#e5dfd9'} d="M78 105 L104 105 108 124 120 157 132 194 122 199 109 164 93 133 86 160 85 201 74 201 74 157 75 123Z" />
    <path fill="#51505a" d="M74 200 L86 200 87 208 67 208Z M122 198 L132 193 141 199 126 206Z" />
  </g>;
  return <svg viewBox="24 7 135 210" width="180" height="265" role="img" aria-label={'Example standing figure, pass ' + (step + 1)}>
    {step > 0 && body}
    {step < 2 && guides}
    {step >= 2 && <g stroke="#514f5a" strokeWidth="2" strokeLinejoin="round">
      <path fill={step === 3 ? '#444252' : '#ece8e3'} d="M74 45 L72 31 78 19 75 15 87 16 98 10 108 17 117 18 114 27 117 40 111 50 106 35 98 41 100 29 87 39 87 32 78 48Z" />
      <path fill={step === 3 ? '#de795b' : '#e7dace'} d="M83 59 Q95 64 105 57 L110 64 98 72 82 67Z M103 69 Q123 63 131 53 L142 56 136 61 140 64 Q125 76 103 73Z" />
      <path fill="none" d="M84 45 l5 1 M98 45 l6 -2 M93 53 q3 2 5 0" />
    </g>}
  </svg>;
}
