import re

path_main = r'c:\Users\hp\SMART_SCHOOL_FINAL\backend\main.py'
with open(path_main, 'r', encoding='utf-8') as f:
    content_main = f.read()

content_main = content_main.replace("app.include_router(comptabilite_router)   # Login PIN comptable → son propre mécanisme", "app.include_router(comptabilite_router, dependencies=[Depends(get_current_user)])")

with open(path_main, 'w', encoding='utf-8') as f:
    f.write(content_main)

path_compta = r'c:\Users\hp\SMART_SCHOOL_FINAL\backend\app\api\comptabilite.py'
with open(path_compta, 'r', encoding='utf-8') as f:
    content_compta = f.read()

# Remove the /auth route completely
auth_route_pattern = re.compile(r'@router\.post\("/auth"\)\ndef auth_comptabilite.*?raise HTTPException\(status_code=401, detail="Code PIN incorrect"\)', re.DOTALL)
content_compta = auth_route_pattern.sub('', content_compta)

# Replace AuthRequest class
auth_req_pattern = re.compile(r'class AuthRequest\(BaseModel\):\n    pin: str\n\n')
content_compta = auth_req_pattern.sub('', content_compta)

with open(path_compta, 'w', encoding='utf-8') as f:
    f.write(content_compta)

print("Updated main.py and comptabilite.py")
