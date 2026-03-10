from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime


class RegisterData(BaseModel):
    email: EmailStr
    password: str
    role: str = "user"  # default to "user" if not sent by frontend


class LoginData(BaseModel):
    email: EmailStr
    password: str
    role: str = "user"  # default to "user" if not sent by frontend


class PaymentData(BaseModel):
    email: EmailStr = None
    user_email: EmailStr = None  # frontend sends user_email, not email
    amount: float
    method: str
    status: str = "success"  # default status if not sent by frontend


class LoginLog(BaseModel):
    email: EmailStr
    role: str
    success: bool
    ip_address: Optional[str]
    time: datetime


class AnomalyResponse(BaseModel):
    type: str
    details: List