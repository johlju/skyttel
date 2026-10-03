import { useEffect, useState } from 'react';

/** One mode rule for conversation layout, focus and controls. Touch support
 * alone does not make a mouse-led laptop mobile: its primary pointer decides. */
function viewport() {
  const mobile = window.matchMedia('(pointer: coarse)').matches;
  const narrow = window.matchMedia('(max-width: 700px)').matches;
  const height = window.visualViewport?.height ?? window.innerHeight;
  return {
    mobile,
    narrow,
    computer: !mobile && !narrow,
    wideTouch: mobile && !narrow,
    short: (mobile || narrow) && height < 520,
    height,
    offset: window.visualViewport?.offsetTop ?? 0,
  };
}

export function useConversationViewport() {
  const [current, setCurrent] = useState(viewport);
  useEffect(() => {
    const pointer = window.matchMedia('(pointer: coarse)');
    const visual = window.visualViewport;
    const update = () => setCurrent(viewport());
    window.addEventListener('resize', update);
    pointer.addEventListener('change', update);
    visual?.addEventListener('resize', update);
    visual?.addEventListener('scroll', update);
    update();
    return () => {
      window.removeEventListener('resize', update);
      pointer.removeEventListener('change', update);
      visual?.removeEventListener('resize', update);
      visual?.removeEventListener('scroll', update);
    };
  }, []);
  return current;
}
