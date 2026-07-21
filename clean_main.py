import re

with open('backend/main.py', 'r', encoding='utf-8') as f:
    content = f.read()

# remove imports
content = re.sub(r'from app\.api\.(fondateur|dg|directeur) import router as .*?\n', '', content)
# remove includes
content = re.sub(r'app\.include_router\((fondateur_router|dg_router|directeur_router).*?\)\n', '', content)

with open('backend/main.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("main.py cleaned")
