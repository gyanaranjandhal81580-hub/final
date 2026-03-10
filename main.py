import os
from fastapi import FastAPI, Request

from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel
from models import RegisterData, LoginData, PaymentData
from services import (
    register_user,
    login_user,
    detect_login_anomalies,
    log_payment,
    detect_payment_anomalies
)
from payment import create_payment_order, log_payment_result

load_dotenv()

APP_NAME = os.getenv("APP_NAME", "FoodiePro Backend")
app = FastAPI(title=APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CreateOrderRequest(BaseModel):
    email: str
    amount: int

class PaymentResultRequest(BaseModel):
    email: str
    amount: int
    payment_id: str
    status: str

@app.get("/")
def home():
    return {"message": "FoodiePro Backend Running"}

@app.post("/register")
def register(data: RegisterData):
    return register_user(data)

@app.post("/login")
def login(data: LoginData, request: Request):
    ip = request.client.host
    return login_user(data, ip)

@app.get("/login-anomalies")
def login_anomalies():
    return detect_login_anomalies()

@app.post("/payment")
def payment(data: PaymentData, request: Request):
    ip = request.client.host
    log_payment(data, ip)
    return {"message": "Payment logged successfully"}

@app.get("/payment-anomalies")
def payment_anomalies():
    return detect_payment_anomalies()



@app.post("/create-order")
def create_order(data: CreateOrderRequest):
    return create_payment_order(data.email, data.amount)

@app.post("/payment-result")
def payment_result(data: PaymentResultRequest, request: Request):
    ip = request.client.host
    return log_payment_result(data.email, data.amount, data.payment_id, data.status, ip)