def bad(cursor, email):
    cursor.execute(f"SELECT * FROM users WHERE email = '{email}'")
