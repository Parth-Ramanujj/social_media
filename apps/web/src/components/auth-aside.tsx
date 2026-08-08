'use client';

import { PulseMark } from './icons';

export function AuthAside() {
  return (
    <div className="auth-aside">
      <span className="mark">
        <PulseMark size={26} />
      </span>
      <p className="auth-aside__title">
        Schedule, approve, publish. <em>One desk for every channel.</em>
      </p>
      <div className="auth-aside__foot">Pulse · social media operations</div>
    </div>
  );
}
