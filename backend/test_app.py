import sys
import traceback
try:
    from main import app
    print("App loaded successfully")
except Exception as e:
    print("App load failed:")
    traceback.print_exc()
