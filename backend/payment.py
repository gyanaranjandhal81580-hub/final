from datetime import datetime, timedelta
import razorpay
from database import payments_col

RAZORPAY_KEY_ID = "rzp_test_SLj72bjD4is5HQ"
RAZORPAY_SECRET = "ljx0izInfaMTglrVJFs30kGM"

client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_SECRET))


def create_payment_order(email: str, amount: int):
    try:
        order = client.order.create({
            "amount": amount * 100,
            "currency": "INR",
            "payment_capture": 1
        })
        payments_col.insert_one({
            "email": email,
            "amount": amount,
            "status": "created",
            "payment_id": order["id"],
            "method": "razorpay",
            "time": datetime.utcnow()
        })
        return {
            "status": "success",
            "order_id": order["id"],
            "amount": order["amount"],
            "currency": order["currency"]
        }
    except Exception as e:
        return {"status": "failed", "error": str(e)}


def log_payment_result(email: str, amount: int, payment_id: str, status: str, ip_address: str = "unknown"):
    payments_col.insert_one({
        "email": email,
        "amount": amount,
        "status": status,
        "payment_id": payment_id,
        "method": "razorpay",
        "ip_address": ip_address,
        "time": datetime.utcnow()
    })
    return {"message": "Payment result logged"}