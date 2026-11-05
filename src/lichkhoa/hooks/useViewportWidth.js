import { useEffect, useState } from 'react';
import { readViewportWidth } from '../logic/uiMode';

/** Live CSS viewport width (handles resize / orientation / visualViewport). */
export function useViewportWidth() {
  const [width, setWidth] = useState(() => readViewportWidth());

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const update = () => setWidth(readViewportWidth());
    update();

    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
    }
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      if (vv) {
        vv.removeEventListener('resize', update);
        vv.removeEventListener('scroll', update);
      }
    };
  }, []);

  return width;
}
