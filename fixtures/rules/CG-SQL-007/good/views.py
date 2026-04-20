from django.db import models
class User(models.Model):
    pass

def find(email: str):
    return User.objects.raw("SELECT * FROM users WHERE email = %s", [email])
