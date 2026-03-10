from datetime import datetime, timedelta
from passlib.context import CryptContext
from database import users_col, logins_col, payments_col

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# -----------------------------
# REGISTER USER
# -----------------------------
def register_user(data):
    existing = users_col.find_one({"email": data.email})
    if existing:
        return {"status": "failed", "message": "User already exists"}

    hashed_password = pwd_context.hash(data.password)
    users_col.insert_one({
        "email": data.email,
        "password": hashed_password,
        "role": data.role,
        "created_at": datetime.utcnow()
    })
    return {"status": "success", "message": "User registered successfully"}


# -----------------------------
# LOGIN USER
# -----------------------------
def login_user(data, ip_address):
    success = False
    message = "Invalid credentials"

    # Hardcoded admin account — not stored in MongoDB
    if data.role == "admin" and data.email == "admin@foodiepro.com":
        if data.password == "Admin123":
            success = True
            message = "Admin login successful"
    else:
        user = users_col.find_one({"email": data.email})
        if user:
            try:
                if pwd_context.verify(data.password, user["password"]):
                    success = True
                    message = "Login successful"
            except Exception:
                pass

    logins_col.insert_one({
        "email": data.email,
        "role": data.role,
        "success": success,
        "ip_address": ip_address,
        "time": datetime.utcnow()
    })

    if not success:
        return {"status": "failed", "message": "Wrong password or user not found"}
    return {"status": "success", "message": message}


# -----------------------------
# LOGIN ANOMALY DETECTION
# -----------------------------
def detect_login_anomalies():
    anomalies = []
    threshold = datetime.utcnow() - timedelta(hours=24)

    # Brute Force: 5+ failed attempts by same email in 24hrs
    brute_groups = list(logins_col.aggregate([
        {"$match": {"success": False, "time": {"$gte": threshold}}},
        {"$group": {
            "_id": "$email",
            "count": {"$sum": 1},
            "last_attempt": {"$max": "$time"},
            "ip": {"$last": "$ip_address"}
        }},
        {"$match": {"count": {"$gte": 5}}}
    ]))

    if brute_groups:
        anomalies.append({
            "type": "Brute Force Attack",
            "details": [{
                "email": g["_id"],
                "attempts": g["count"],
                "last_seen": g["last_attempt"].strftime("%Y-%m-%d %H:%M:%S") if g.get("last_attempt") else "N/A",
                "ip": g.get("ip", "unknown")
            } for g in brute_groups]
        })

    # Admin Targeted: 3+ failed admin login attempts in 24hrs
    admin_groups = list(logins_col.aggregate([
        {"$match": {"success": False, "role": "admin", "time": {"$gte": threshold}}},
        {"$group": {
            "_id": "$email",
            "count": {"$sum": 1},
            "last_attempt": {"$max": "$time"},
            "ip": {"$last": "$ip_address"}
        }},
        {"$match": {"count": {"$gte": 3}}}
    ]))

    if admin_groups:
        anomalies.append({
            "type": "Admin Targeted Attack",
            "details": [{
                "email": g["_id"],
                "attempts": g["count"],
                "last_seen": g["last_attempt"].strftime("%Y-%m-%d %H:%M:%S") if g.get("last_attempt") else "N/A",
                "ip": g.get("ip", "unknown")
            } for g in admin_groups]
        })

    return {"anomalies_detected": anomalies}


# -----------------------------
# LOG PAYMENT
# -----------------------------
def log_payment(data, ip_address):
    email = data.user_email or data.email or "unknown"
    payments_col.insert_one({
        "email": email,
        "amount": data.amount,
        "method": data.method,
        "status": data.status,
        "ip_address": ip_address,
        "time": datetime.utcnow()
    })


# -----------------------------
# PAYMENT ANOMALY DETECTION
# -----------------------------
def detect_payment_anomalies():
    anomalies = []
    threshold = datetime.utcnow() - timedelta(hours=24)

    # 1️⃣ High amount payments above 5000 (last 24hrs)
    high_amount = list(payments_col.find(
        {"amount": {"$gte": 5000}, "time": {"$gte": threshold}},
        {"_id": 0, "email": 1, "amount": 1, "method": 1, "time": 1}
    ))
    if high_amount:
        anomalies.append({
            "type": "High Amount Payment",
            "details": [{
                "email": p.get("email", "unknown"),
                "amount": p.get("amount", 0),
                "method": p.get("method", "unknown"),
                "last_seen": p["time"].strftime("%Y-%m-%d %H:%M:%S") if p.get("time") else "N/A"
            } for p in high_amount]
        })

    # 2️⃣ Rapid payments: 3+ payments in 24 hours
    rapid = list(payments_col.aggregate([
        {"$match": {"time": {"$gte": threshold}}},
        {"$group": {
            "_id": "$email",
            "count": {"$sum": 1},
            "total": {"$sum": "$amount"},
            "last_attempt": {"$max": "$time"}
        }},
        {"$match": {"count": {"$gte": 3}}}
    ]))
    if rapid:
        anomalies.append({
            "type": "Multiple Payments in 24 Hours",
            "details": [{
                "email": r["_id"],
                "attempts": r["count"],
                "amount": round(r["total"], 2),
                "last_seen": r["last_attempt"].strftime("%Y-%m-%d %H:%M:%S") if r.get("last_attempt") else "N/A"
            } for r in rapid]
        })

    # 3️⃣ Repeated Failed Payments (last 24hrs)
    failed = list(payments_col.aggregate([
        {"$match": {"status": "failed", "time": {"$gte": threshold}}},
        {"$group": {
            "_id": "$email",
            "count": {"$sum": 1},
            "last_attempt": {"$max": "$time"},
            "ip": {"$last": "$ip_address"}
        }},
        {"$match": {"count": {"$gte": 3}}}
    ]))
    if failed:
        anomalies.append({
            "type": "Repeated Failed Payments",
            "details": [{
                "email": f["_id"],
                "attempts": f["count"],
                "ip": f.get("ip", "unknown"),
                "last_seen": f["last_attempt"].strftime("%Y-%m-%d %H:%M:%S") if f.get("last_attempt") else "N/A"
            } for f in failed]
        })

    # 4️⃣ Same Amount Repeated (possible card testing, last 24hrs)
    repeated_amount = list(payments_col.aggregate([
        {"$match": {"time": {"$gte": threshold}}},
        {"$group": {
            "_id": {"email": "$email", "amount": "$amount"},
            "count": {"$sum": 1},
            "last_attempt": {"$max": "$time"}
        }},
        {"$match": {"count": {"$gte": 4}}}
    ]))
    if repeated_amount:
        anomalies.append({
            "type": "Same Amount Repeated",
            "details": [{
                "email": r["_id"]["email"],
                "amount": r["_id"]["amount"],
                "attempts": r["count"],
                "last_seen": r["last_attempt"].strftime("%Y-%m-%d %H:%M:%S") if r.get("last_attempt") else "N/A"
            } for r in repeated_amount]
        })

    # 5️⃣ Multiple IP Payments
    multiple_ip = list(payments_col.aggregate([
        {"$group": {
            "_id": "$email",
            "ips": {"$addToSet": "$ip_address"},
            "last_attempt": {"$max": "$time"}
        }},
        {"$project": {
            "ip_count": {"$size": "$ips"},
            "ips": 1,
            "last_attempt": 1
        }},
        {"$match": {"ip_count": {"$gte": 3}}}
    ]))
    if multiple_ip:
        anomalies.append({
            "type": "Multiple IP Payments",
            "details": [{
                "email": m["_id"],
                "ip_count": m["ip_count"],
                "ips": m["ips"],
                "last_seen": m["last_attempt"].strftime("%Y-%m-%d %H:%M:%S") if m.get("last_attempt") else "N/A"
            } for m in multiple_ip]
        })

    return {"payment_anomalies_detected": anomalies}