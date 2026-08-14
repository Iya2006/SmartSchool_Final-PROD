// Symbole SmartSchool — 3 barres ascendantes (progression/pilotage des
// eleves), glyphe seul sans fond (a poser sur un badge existant), meme
// convention d'usage que les icones lucide-react (`size`/`color`/props SVG).
// Remplace ShieldCheck (icone generique) comme repli d'identite SmartSchool
// sur /login et /inscription — pas utilise dans la sidebar, qui affiche
// volontairement le logo de CHAQUE ecole, pas celui de SmartSchool.
export default function SmartSchoolMark({ size = 24, color = 'currentColor', ...props }: React.SVGProps<SVGSVGElement> & { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
            <rect x="3" y="13" width="4.5" height="7" rx="1.6" fill={color} />
            <rect x="9.75" y="8.5" width="4.5" height="11.5" rx="1.6" fill={color} />
            <rect x="16.5" y="4" width="4.5" height="16" rx="1.6" fill={color} />
        </svg>
    );
}
