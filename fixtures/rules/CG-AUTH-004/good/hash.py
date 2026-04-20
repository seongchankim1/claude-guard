import argon2
def strong(pw: str) -> str:
    return argon2.PasswordHasher().hash(pw)
