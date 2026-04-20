import hashlib
import joblib

def load(path: str, expected_sha256: str):
    with open(path, "rb") as f:
        data = f.read()
    if hashlib.sha256(data).hexdigest() != expected_sha256:
        raise ValueError("hash mismatch")
    return joblib.load(path)
