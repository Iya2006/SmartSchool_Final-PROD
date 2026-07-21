from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

print("Testing GET /api/personnel")
# By default get_current_user might raise 401. Let's see what it raises.
response = client.get("/api/personnel?etablissement_id=1")
print(response.status_code, response.text[:200])

print("Testing GET /api/personnel/stats")
response2 = client.get("/api/personnel/stats?etablissement_id=1")
print(response2.status_code, response2.text[:200])
