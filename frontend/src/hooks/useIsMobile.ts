import { useEffect, useState } from 'react';

/**
 * Reserve a la logique JS ponctuelle (ex. fermer un tiroir apres un clic
 * de navigation) — jamais pour piloter la mise en page elle-meme, qui
 * reste geree en CSS (@media) dans tout ce chantier. Premiere
 * introduction de ce motif dans le projet ; SSR-safe (ne lit `window`
 * qu'apres montage).
 */
export function useIsMobile(breakpoint = 768) {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
        const update = () => setIsMobile(mql.matches);
        update();
        mql.addEventListener('change', update);
        return () => mql.removeEventListener('change', update);
    }, [breakpoint]);

    return isMobile;
}
