import os
import re

EMOJI_PATTERN = re.compile(
    "[\U0001F300-\U0001F9FF"
    "\U00002600-\U000027BF"
    "\U0000FE00-\U0000FE0F"
    "\U0001FA00-\U0001FA6F"
    "\U0001FA70-\U0001FAFF"
    "\u2300-\u23FF"
    "\u2B50-\u2B55"
    "\u231A-\u231B"
    "\u25AA-\u25FE"
    "\u2702-\u27B0"
    "\u00A9\u00AE"
    "]+",
    re.UNICODE
)

src_dir = r'c:\Users\hp\SMART_SCHOOL_FINAL\frontend\src'
results = []

for root, dirs, files in os.walk(src_dir):
    # Skip node_modules etc
    dirs[:] = [d for d in dirs if d not in ('node_modules', '.next', '__pycache__')]
    for filename in files:
        if filename.endswith(('.tsx', '.ts', '.jsx', '.js')):
            filepath = os.path.join(root, filename)
            try:
                content = open(filepath, encoding='utf-8').read()
                lines = content.split('\n')
                file_emojis = []
                for i, line in enumerate(lines, 1):
                    matches = EMOJI_PATTERN.findall(line)
                    if matches:
                        file_emojis.append((i, line.strip(), matches))
                if file_emojis:
                    rel_path = os.path.relpath(filepath, src_dir)
                    results.append((rel_path, file_emojis))
            except Exception as e:
                print(f"Error reading {filepath}: {e}")

print(f"\nTotal files with emojis: {len(results)}\n")
for rel_path, emojis in results:
    print(f"\n=== {rel_path} ===")
    for lineno, line, matches in emojis[:5]:  # limit to 5 per file
        print(f"  L{lineno}: {', '.join(matches)} | {line[:80]}")
    if len(emojis) > 5:
        print(f"  ... +{len(emojis)-5} more lines")
