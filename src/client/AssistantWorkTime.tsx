import { useEffect, useState } from 'react';

const elapsed = (started: number) => Math.max(0, Math.floor((Date.now() - started) / 1000));

export function AssistantWorkTime({ started }: { started: number }) {
  const [seconds, setSeconds] = useState(() => elapsed(started));
  useEffect(() => {
    setSeconds(elapsed(started));
    const timer = setInterval(() => setSeconds(elapsed(started)), 1000);
    return () => clearInterval(timer);
  }, [started]);
  return (
    <span role="timer" className="assistant-work-time" aria-label="Tid för pågående arbete">
      {seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`}
    </span>
  );
}
