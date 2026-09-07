'use client';

/**
 * FondConstellation — le décor animé des écrans publics (connexion, inscription).
 *
 * Des symboles scolaires (toque, livre, crayon, règle, fiole, globe, ampoule,
 * calculatrice, atome) et des symboles mathématiques flottent et se relient
 * entre eux, et s'écartent au passage du curseur. Posé sur des « auréoles »
 * lumineuses, l'ensemble donne une page vivante sans distraire du formulaire.
 *
 * Le décor est PUREMENT décoratif : `aria-hidden` et `pointer-events: none`
 * pour qu'il n'intercepte jamais un clic ni ne soit lu par un lecteur d'écran.
 *
 * L'animation respecte `prefers-reduced-motion` : une seule image est alors
 * dessinée, sans boucle.
 */
import { useEffect, useRef } from 'react';
import styles from './FondConstellation.module.css';

/** Symboles mathématiques dessinés en texte. */
const SYMBOLES = ['π', '∑', '√', '∞', '+', '÷', '×'];

/** Teintes claires, lisibles sur le bleu nuit du fond. */
const TEINTES = ['#bcd4ff', '#a9f0ff', '#b6f5da', '#c3c9ff'];

/** Tracés des icônes scolaires (style trait fin, 24x24). */
const ICONES = [
    // toque de diplômé
    '<path d="M21.42 10.42 12 15 2.58 10.42 12 5.83l9.42 4.59Z"/><path d="M6 12.5V17c0 1.1 2.7 2.5 6 2.5s6-1.4 6-2.5v-4.5"/><path d="M21.42 10.42V16"/>',
    // livre ouvert
    '<path d="M12 7v13"/><path d="M3 5.5A1.5 1.5 0 0 1 4.5 4H10a2 2 0 0 1 2 2 2 2 0 0 1 2-2h5.5A1.5 1.5 0 0 1 21 5.5v11a1.5 1.5 0 0 1-1.5 1.5H14a2 2 0 0 0-2 2 2 2 0 0 0-2-2H4.5A1.5 1.5 0 0 1 3 16.5Z"/>',
    // crayon
    '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    // règle
    '<path d="M21.3 15.3 8.7 2.7a1 1 0 0 0-1.4 0L2.7 7.3a1 1 0 0 0 0 1.4l12.6 12.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/>',
    // fiole
    '<path d="M10 2v6.3a2 2 0 0 1-.3 1L4.5 18a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3l-5.2-8.7a2 2 0 0 1-.3-1V2"/><path d="M8.5 2h7"/><path d="M6.8 15h10.4"/>',
    // globe
    '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z"/>',
    // ampoule
    '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M8.5 14c-.6-.9-.9-1.6-1.4-2.1a5 5 0 1 1 7.8 0c-.5.5-.8 1.2-1.4 2.1"/>',
    // calculatrice
    '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8"/><path d="M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h8"/>',
    // atome
    '<circle cx="12" cy="12" r="1"/><path d="M20.2 20.2c2-2 0-7.4-4.5-11.9C11.2 3.8 5.8 1.8 3.8 3.8s0 7.4 4.5 11.9c4.5 4.5 9.9 6.5 11.9 4.5Z"/><path d="M15.7 15.7c4.5-4.5 6.5-9.9 4.5-11.9s-7.4 0-11.9 4.5C3.8 12.8 1.8 18.2 3.8 20.2s7.4 0 11.9-4.5Z"/>',
];

interface Particule {
    x: number;
    y: number;
    vx: number;
    vy: number;
    genre: 'point' | 'icone' | 'symbole';
    symbole: string;
    icone: number;
    taille: number;
    teinte: string;
}

/** Construit une image à partir d'un tracé SVG (data URI, aucun réseau). */
function imageIcone(trace: string): HTMLImageElement {
    const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ' +
        'fill="none" stroke="#e6f0ff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
        trace + '</svg>';
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return img;
}

export default function FondConstellation() {
    const toileRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const toile = toileRef.current;
        if (!toile) return;
        const ctx = toile.getContext('2d');
        if (!ctx) return;

        const images = ICONES.map(imageIcone);
        let particules: Particule[] = [];
        let largeur = 0;
        let hauteur = 0;
        let animation: number | null = null;
        const souris = { x: -9999, y: -9999 };

        const moinsDAnimation = window.matchMedia
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        const construire = () => {
            const nb = Math.round(Math.min(62, (largeur * hauteur) / 19000));
            particules = [];
            for (let i = 0; i < nb; i++) {
                const tirage = Math.random();
                const genre: Particule['genre'] =
                    tirage < 0.55 ? 'point' : tirage < 0.82 ? 'icone' : 'symbole';
                particules.push({
                    x: Math.random() * largeur,
                    y: Math.random() * hauteur,
                    vx: (Math.random() - 0.5) * 0.34,
                    vy: (Math.random() - 0.5) * 0.34,
                    genre,
                    symbole: SYMBOLES[(Math.random() * SYMBOLES.length) | 0],
                    icone: (Math.random() * images.length) | 0,
                    taille: 16 + Math.random() * 13,
                    teinte: TEINTES[i % TEINTES.length],
                });
            }
        };

        const redimensionner = () => {
            const densite = Math.min(window.devicePixelRatio || 1, 2);
            largeur = toile.clientWidth;
            hauteur = toile.clientHeight;
            toile.width = largeur * densite;
            toile.height = hauteur * densite;
            ctx.setTransform(densite, 0, 0, densite, 0, 0);
            construire();
        };

        const dessiner = () => {
            ctx.clearRect(0, 0, largeur, hauteur);

            // Les liens entre particules proches — la « constellation ».
            for (let a = 0; a < particules.length; a++) {
                for (let b = a + 1; b < particules.length; b++) {
                    const dx = particules[a].x - particules[b].x;
                    const dy = particules[a].y - particules[b].y;
                    const distance = Math.hypot(dx, dy);
                    if (distance < 125) {
                        ctx.globalAlpha = (1 - distance / 125) * 0.24;
                        ctx.strokeStyle = particules[a].teinte;
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(particules[a].x, particules[a].y);
                        ctx.lineTo(particules[b].x, particules[b].y);
                        ctx.stroke();
                    }
                }
            }

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            for (const p of particules) {
                p.x += p.vx;
                p.y += p.vy;
                if (p.x < 0 || p.x > largeur) p.vx *= -1;
                if (p.y < 0 || p.y > hauteur) p.vy *= -1;

                // Les particules s'écartent du curseur.
                const dx = p.x - souris.x;
                const dy = p.y - souris.y;
                const distance = Math.hypot(dx, dy);
                if (distance < 140 && distance > 0) {
                    const poussee = ((140 - distance) / 140) * 1.1;
                    p.x += (dx / distance) * poussee;
                    p.y += (dy / distance) * poussee;
                }

                if (p.genre === 'point') {
                    ctx.globalAlpha = 0.8;
                    ctx.fillStyle = p.teinte;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 1.7, 0, Math.PI * 2);
                    ctx.fill();
                } else if (p.genre === 'icone') {
                    const img = images[p.icone];
                    if (img && img.complete && img.naturalWidth) {
                        ctx.globalAlpha = 0.6;
                        ctx.drawImage(img, p.x - p.taille / 2, p.y - p.taille / 2, p.taille, p.taille);
                    }
                } else {
                    ctx.globalAlpha = 0.55;
                    ctx.fillStyle = p.teinte;
                    ctx.font = `600 ${p.taille}px 'Sora', sans-serif`;
                    ctx.fillText(p.symbole, p.x, p.y);
                }
            }

            ctx.globalAlpha = 1;
            animation = requestAnimationFrame(dessiner);
        };

        const surSouris = (e: MouseEvent) => {
            souris.x = e.clientX;
            souris.y = e.clientY;
        };
        const surSortie = () => {
            souris.x = -9999;
            souris.y = -9999;
        };

        redimensionner();
        let imageFixe: ReturnType<typeof setTimeout> | null = null;
        if (moinsDAnimation) {
            // Mouvement réduit demandé : une image fixe, aucune boucle. Le second
            // tracé laisse le temps aux icônes de finir de charger.
            dessinerUneFois(ctx, particules, images, largeur, hauteur);
            imageFixe = setTimeout(
                () => dessinerUneFois(ctx, particules, images, largeur, hauteur),
                300,
            );
        } else {
            animation = requestAnimationFrame(dessiner);
        }

        window.addEventListener('resize', redimensionner);
        window.addEventListener('mousemove', surSouris);
        window.addEventListener('mouseleave', surSortie);

        return () => {
            if (animation) cancelAnimationFrame(animation);
            if (imageFixe) clearTimeout(imageFixe);
            window.removeEventListener('resize', redimensionner);
            window.removeEventListener('mousemove', surSouris);
            window.removeEventListener('mouseleave', surSortie);
        };
    }, []);

    return (
        <>
            <div className={styles.fond} aria-hidden="true">
                <div className={`${styles.halo} ${styles.halo1}`} />
                <div className={`${styles.halo} ${styles.halo2}`} />
                <div className={`${styles.halo} ${styles.halo3}`} />
                <canvas ref={toileRef} className={styles.toile} />
            </div>
            <div className={styles.voile} aria-hidden="true" />
        </>
    );
}

/** Dessine une image fixe (mode « mouvement réduit »). */
function dessinerUneFois(
    ctx: CanvasRenderingContext2D,
    particules: Particule[],
    images: HTMLImageElement[],
    largeur: number,
    hauteur: number,
) {
    ctx.clearRect(0, 0, largeur, hauteur);
    for (let a = 0; a < particules.length; a++) {
        for (let b = a + 1; b < particules.length; b++) {
            const dx = particules[a].x - particules[b].x;
            const dy = particules[a].y - particules[b].y;
            const distance = Math.hypot(dx, dy);
            if (distance < 125) {
                ctx.globalAlpha = (1 - distance / 125) * 0.24;
                ctx.strokeStyle = particules[a].teinte;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(particules[a].x, particules[a].y);
                ctx.lineTo(particules[b].x, particules[b].y);
                ctx.stroke();
            }
        }
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of particules) {
        if (p.genre === 'point') {
            ctx.globalAlpha = 0.8;
            ctx.fillStyle = p.teinte;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.7, 0, Math.PI * 2);
            ctx.fill();
        } else if (p.genre === 'icone') {
            const img = images[p.icone];
            if (img && img.complete && img.naturalWidth) {
                ctx.globalAlpha = 0.6;
                ctx.drawImage(img, p.x - p.taille / 2, p.y - p.taille / 2, p.taille, p.taille);
            }
        } else {
            ctx.globalAlpha = 0.55;
            ctx.fillStyle = p.teinte;
            ctx.font = `600 ${p.taille}px 'Sora', sans-serif`;
            ctx.fillText(p.symbole, p.x, p.y);
        }
    }
    ctx.globalAlpha = 1;
}
