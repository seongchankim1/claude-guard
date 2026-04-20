def safe(cursor, email):
    cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
