from sqlalchemy import text
def get(session, email):
    return session.execute(text("SELECT * FROM users WHERE email = :email").bindparams(email=email))
