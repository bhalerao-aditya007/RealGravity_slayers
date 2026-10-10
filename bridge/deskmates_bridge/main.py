"""
FastAPI application entry point for Deskmates Bridge & RealGravity Swarm Mode.
"""
from __future__ import annotations
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .swarm.api import api_router

app = FastAPI(title="RealGravity Deskmates Bridge & Swarm Mode API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health")
@app.get("/api/health")
def health_check():
    return {"status": "healthy", "service": "deskmates-bridge"}
