/**
 * Les polices de l'application (src/fonts/polices.css), pour une fenêtre
 * d'impression ouverte à part (`window.open`) : elle n'hérite pas des feuilles
 * de styles de la page. Elle chargeait Inter depuis Google, ce qui échouait
 * hors-ligne ; on lui recopie plutôt les @font-face déjà chargées ici.
 *
 * Les adresses des fichiers sont rendues absolues : relatives à leur feuille de
 * styles, elles ne mèneraient nulle part depuis la fenêtre d'impression.
 */
export function reglesDesPolices(): string {
    return Array.from(document.styleSheets).flatMap((feuille) => {
        let regles: CSSRule[];
        try {
            regles = Array.from(feuille.cssRules);
        } catch {
            return []; // feuille d'une autre origine : illisible, et sans nos polices
        }
        const base = feuille.href || window.location.href;
        return regles
            .filter((regle): regle is CSSFontFaceRule => regle instanceof CSSFontFaceRule)
            .map((regle) => adressesAbsolues(regle.cssText, base));
    }).join('\n');
}

/** Les `url(...)` d'une règle CSS, rendues absolues par rapport à `base`. */
export function adressesAbsolues(css: string, base: string): string {
    return css.replace(
        /url\((["']?)([^"')]+)\1\)/g,
        (_, guillemet: string, adresse: string) => `url(${guillemet}${new URL(adresse, base).href}${guillemet})`,
    );
}
