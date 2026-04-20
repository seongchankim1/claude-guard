import os
DEBUG = os.environ.get("DJANGO_DEBUG", "0") == "1"
SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]
