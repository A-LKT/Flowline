type Props = { size?: number };

export const PipelineIcon = ({ size = 18 }: Props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width={size} height={size} style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
    <rect width="32" height="32" rx="6" fill="#0d1117"/>
    <line x1="4" y1="16" x2="28" y2="16" stroke="#30363d" strokeWidth="2"/>
    <rect x="3" y="12" width="7" height="8" rx="2" fill="#388bfd" opacity="0.9"/>
    <rect x="12.5" y="12" width="7" height="8" rx="2" fill="#a371f7" opacity="0.9"/>
    <rect x="22" y="12" width="7" height="8" rx="2" fill="#3fb950" opacity="0.9"/>
    <polyline points="10,14.5 12.5,16 10,17.5" fill="none" stroke="#e6edf3" strokeWidth="1" strokeLinejoin="round"/>
    <polyline points="19.5,14.5 22,16 19.5,17.5" fill="none" stroke="#e6edf3" strokeWidth="1" strokeLinejoin="round"/>
  </svg>
);
