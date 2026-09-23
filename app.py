"""Vercel/FastAPI entrypoint.

The application itself lives in main.py. Keeping this tiny wrapper gives Vercel
an unambiguous ASGI entrypoint while preserving the existing local workflow.
"""
from main import app

__all__ = ["app"]
