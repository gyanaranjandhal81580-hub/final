import os
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure
from dotenv import load_dotenv

load_dotenv()

# Fallback to localhost if .env is missing or incomplete
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME   = os.getenv("DB_NAME",   "foodiepro")

try:
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=3000)
    # Force a real connection check
    client.admin.command("ping")
    print(f"✅ MongoDB connected — {MONGO_URL} / {DB_NAME}")
except ConnectionFailure as e:
    print(f"❌ MongoDB connection failed: {e}")
    print("   Make sure MongoDB is running: mongod --dbpath <your-db-path>")
    raise

db = client[DB_NAME]

users_col    = db["users"]
logins_col   = db["login_attempts"]
payments_col = db["payments"]