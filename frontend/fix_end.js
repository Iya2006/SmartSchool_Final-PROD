const fs = require('fs');
let txt = fs.readFileSync('src/app/portail-parent/page.tsx', 'utf8');
const lines = txt.split('\n');

// Find the last line with act.label <p> tag - that's the anchor
let anchorLine = -1;
for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('act.label') && lines[i].includes('<p style=')) {
        anchorLine = i;
        break;
    }
}

console.log('Anchor at line:', anchorLine + 1);

// Keep everything up to and including the anchor line
const kept = lines.slice(0, anchorLine + 1);

// The correct ending after the act.label <p> line:
// We need to close:
// - </div> for the Quick Action card (opened in map)
// - ))} for the .map
// - </div> for the grid container
// - </motion.div> for the right tabs motion.div (L762)
// - </div> for the grid layout (L650)  
// - )} for {child && ( (L649)
// - </div> for the flex:1 padding (L570)
// - </div> for the main content (L541)
// - </div> for the root (L458)

const ending = `                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                )}
            </div>
        </div>
    </div>
    );
}
`;

const result = kept.join('\n') + '\n' + ending;
fs.writeFileSync('src/app/portail-parent/page.tsx', result);
console.log('Written. Lines:', result.split('\n').length);
