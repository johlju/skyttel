import { useEffect, useState } from 'react';

export function AssistantWorkTime() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span role="timer" className="assistant-work-time" aria-label="Tid för pågående arbete">
      {seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`}
    </span>
  );
}
