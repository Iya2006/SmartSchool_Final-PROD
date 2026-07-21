import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()
engine = create_engine(os.getenv("DATABASE_URL"))
with engine.connect() as conn:
    try:
        res = conn.execute(text("SELECT count(*) FROM ss_presences_agents"))
        print("Count:", res.scalar())
    except Exception as e:
        print("Error:", e)
