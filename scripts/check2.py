with open('frontend/src/app/portail-eleve/page.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

def check(text):
    stack = []
    i = 0
    in_str = False
    str_char = ''
    in_comment = False
    in_jsx_comment = False
    while i < len(text):
        c = text[i]
        
        if in_str:
            if c == '\\':
                i += 2
                continue
            if c == str_char:
                in_str = False
            i += 1
            continue
            
        if in_comment:
            if c == '*' and i+1 < len(text) and text[i+1] == '/':
                in_comment = False
                i += 2
                continue
            i += 1
            continue
            
        if in_jsx_comment:
            if text[i:i+3] == '*/}':
                in_jsx_comment = False
                i += 3
                continue
            i += 1
            continue
            
        if c == '/' and i+1 < len(text) and text[i+1] == '*':
            in_comment = True
            i += 2
            continue
            
        if text[i:i+4] == '{/* ':
            in_jsx_comment = True
            i += 4
            continue
            
        if c in ['"', "'", '`']:
            in_str = True
            str_char = c
            i += 1
            continue
            
        if c in '{(':
            stack.append((c, i))
        elif c in '})':
            if not stack:
                print(f'Extra {c} at offset {i}')
                return
            top, pos = stack.pop()
            expected = '}' if top == '{' else ')'
            if c != expected:
                line_c = text[:i].count('\n') + 1
                line_open = text[:pos].count('\n') + 1
                print(f'Mismatch at line {line_c}: expected {expected} but got {c}. Opened at line {line_open}')
                return
        i += 1

    print('Unclosed:', [(c, text[:pos].count('\n')+1) for c, pos in stack])

check(text)
