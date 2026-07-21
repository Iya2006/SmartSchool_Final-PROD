const fs = require('fs');

// === FIX portail-eleve ===
const elevePath = 'c:\\Users\\hp\\SMART_SCHOOL_FINAL\\frontend\\src\\app\\portail-eleve\\page.tsx';
let eleveLines = fs.readFileSync(elevePath, 'utf8').split('\n');

// Lines 1-60 are good (indices 0-59)
// Lines 61-142 are corrupted duplicate (indices 60-141)
// Lines 143+ are the rest of the file (index 142+)
const goodStart = eleveLines.slice(0, 60); // lines 1-60
const goodRest = eleveLines.slice(142);     // lines 143+

const missingStates = [
    "    const [msgSuccess, setMsgSuccess] = useState('');",
    "    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);",
    "",
    "    // Nouveaux états",
    "    const [devoirsData, setDevoirsData] = useState<any[]>([]);",
    "    const [devoirsLoading, setDevoirsLoading] = useState(false);",
    "    const [liens, setLiens] = useState<any[]>([]);",
    "    const [oldPwd, setOldPwd] = useState('');",
    "    const [newPwd, setNewPwd] = useState('');",
    "    const [confirmPwd, setConfirmPwd] = useState('');",
    "    const [pwdLoading, setPwdLoading] = useState(false);",
    "    const [pwdSuccess, setPwdSuccess] = useState('');",
    "    const [pwdError, setPwdError] = useState('');",
    "    const [photoUploading, setPhotoUploading] = useState(false);",
    "    const [photoSuccess, setPhotoSuccess] = useState('');",
    "    const [showProfileDropdown, setShowProfileDropdown] = useState(false);",
    "    const [pendingPhoto, setPendingPhoto] = useState<any>(null);",
    "    const dropdownRef = useRef<HTMLDivElement>(null);",
    "",
    "    // load liens from API",
    "    const loadLiens = useCallback(async () => {",
    "        if (!eleveId) return;",
    "        try {",
    "            const res = await api.get(`/api/portail-eleve/${eleveId}/ressources`);",
    "            setLiens(res.data);",
    "        } catch {}",
    "    }, [eleveId]);",
    "",
    "    // Handle click outside for dropdown",
    "    useEffect(() => {",
    "        const handleClickOutside = (event: MouseEvent) => {",
    "            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {",
    "                setShowProfileDropdown(false);",
    "            }",
    "        };",
    "        document.addEventListener('mousedown', handleClickOutside);",
    "        return () => document.removeEventListener('mousedown', handleClickOutside);",
    "    }, []);",
    "",
];

const fixedEleve = [...goodStart, ...missingStates, ...goodRest];
fs.writeFileSync(elevePath, fixedEleve.join('\n'));
console.log('portail-eleve FIXED. Total lines:', fixedEleve.length);


// === FIX portail-enseignant ===
const enseignantPath = 'c:\\Users\\hp\\SMART_SCHOOL_FINAL\\frontend\\src\\app\\portail-enseignant\\page.tsx';
let enseignantCode = fs.readFileSync(enseignantPath, 'utf8');

// Count braces to find imbalance
let openBraces = 0;
let closeBraces = 0;
for (const ch of enseignantCode) {
    if (ch === '{') openBraces++;
    if (ch === '}') closeBraces++;
}
console.log('portail-enseignant braces: open=' + openBraces + ' close=' + closeBraces + ' diff=' + (openBraces - closeBraces));

// The error is at line 2787 - unexpected closing brace. The patch script likely added an extra }
// Let's check the last few lines
let ensLines = enseignantCode.split('\n');
console.log('portail-enseignant total lines:', ensLines.length);
// Show lines around 2787
for (let i = Math.max(0, 2782); i < Math.min(ensLines.length, 2795); i++) {
    console.log(`ENS L${i+1}: ${ensLines[i]}`);
}


// === FIX portail-parent ===
const parentPath = 'c:\\Users\\hp\\SMART_SCHOOL_FINAL\\frontend\\src\\app\\portail-parent\\page.tsx';
let parentCode = fs.readFileSync(parentPath, 'utf8');

openBraces = 0;
closeBraces = 0;
for (const ch of parentCode) {
    if (ch === '{') openBraces++;
    if (ch === '}') closeBraces++;
}
console.log('portail-parent braces: open=' + openBraces + ' close=' + closeBraces + ' diff=' + (openBraces - closeBraces));

let parLines = parentCode.split('\n');
console.log('portail-parent total lines:', parLines.length);
// Show lines around 2158
for (let i = Math.max(0, 2153); i < Math.min(parLines.length, 2165); i++) {
    console.log(`PAR L${i+1}: ${parLines[i]}`);
}
