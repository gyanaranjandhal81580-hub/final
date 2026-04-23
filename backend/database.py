import os
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get values from .env
MONGO_URL = os.getenv("MONGO_URL")
DB_NAME   = os.getenv("DB_NAME", "foodiepro")

print("🚀 Connecting to MongoDB...")
print("MONGO_URL USED:", MONGO_URL)

if not MONGO_URL:
    raise Exception("❌ MONGO_URL not found in .env file")

try:
    client = MongoClient(
        MONGO_URL,
        serverSelectionTimeoutMS=10000
    )
    client.admin.command("ping")
    print(f"✅ MongoDB connected — {DB_NAME}")
except ConnectionFailure as e:
    print(f"❌ MongoDB connection failed: {e}")
    raise

db = client[DB_NAME]

users_col    = db["users"]
logins_col   = db["login_attempts"]