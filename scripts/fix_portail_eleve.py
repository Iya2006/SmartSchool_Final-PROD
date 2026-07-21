with open('frontend/src/app/portail-eleve/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

parts = content.split('                        {/* ══ DEVOIRS ══ */}')
if len(parts) == 3:
    # It was inserted twice!
    # The first part is everything before the first insertion.
    # The second part is the first insertion, down to the second insertion.
    # The third part is the second insertion, down to the end.
    
    # Let's rebuild without the second insertion.
    # We need to find where the second insertion ends. It ends with:
    # '                        )}' followed by '\n\n                    </AnimatePresence>'
    
    # Alternatively, just replace the second insertion with nothing.
    second_insertion = '                        {/* ══ DEVOIRS ══ */}' + parts[2]
    
    # Actually, parts[2] contains the second insertion AND the rest of the file.
    # We just need to split parts[2] by '</AnimatePresence>' and keep the second half.
    sub_parts = parts[2].split('</AnimatePresence>', 1)
    
    new_content = parts[0] + '                        {/* ══ DEVOIRS ══ */}' + parts[1] + '</AnimatePresence>' + sub_parts[1]
    
    with open('frontend/src/app/portail-eleve/page.tsx', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("FIXED")
else:
    print("NO DUPLICATE FOUND")
