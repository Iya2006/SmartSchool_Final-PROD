import re

path = r'c:\Users\hp\SMART_SCHOOL_FINAL\backend\main.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add imports
imports = """from app.api.dg import router as dg_router
from app.api.directeur import router as directeur_router"""

content = content.replace("from app.api.dg import router as dg_router", imports)

# Add include_router
includes = """app.include_router(dg_router, dependencies=[Depends(get_current_user)])
app.include_router(directeur_router, dependencies=[Depends(get_current_user)])"""

content = content.replace("app.include_router(dg_router, dependencies=[Depends(get_current_user)])", includes)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated main.py with directeur")
