import hashlib
def weak(pw: str) -> str:
    return hashlib.md5(pw.encode()).hexdigest()
