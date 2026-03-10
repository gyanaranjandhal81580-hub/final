# Quick diagnostic script — run this in your Backend folder
# python test_db.py

import os
from dotenv import load_dotenv
load_dotenv()

print("=== Step 1: Environment Variables ===")
print(f"MONGO_URL = {os.getenv('MONGO_URL')}")
print(f"DB_NAME   = {os.getenv('DB_NAME')}")

print("\n=== Step 2: MongoDB Connection ===")
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure
try:
    client = MongoClient(os.getenv("MONGO_URL", "mongodb://localhost:27017"), serverSelectionTimeoutMS=3000)
    client.admin.command("ping")
    print("✅ MongoDB connected!")
except Exception as e:
    print(f"❌ MongoDB failed: {e}")
    exit()

print("\n=== Step 3: Insert test user ===")
db = client[os.getenv("DB_NAME", "foodiepro")]
try:
    db["users"].insert_one({"email": "test@test.com", "test": True})
    print("✅ Insert successful!")
    db["users"].delete_one({"email": "test@test.com"})
    print("✅ Cleanup done!")
except Exception as e:
    print(f"❌ Insert failed: {e}")

print("\n=== Step 4: Test passlib ===")
try:
    from passlib.context import CryptContext
    ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
    h = ctx.hash("Test123")
    print(f"✅ Passlib works! Hash = {h[:20]}...")
except Exception as e:
    print(f"❌ Passlib failed: {e}")

print("\n=== All done ===")