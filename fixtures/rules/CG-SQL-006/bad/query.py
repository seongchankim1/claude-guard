from sqlalchemy import text
def get(session, email):
    return session.execute(text(f"SELECT * FROM users WHERE email = '{email}'"))
