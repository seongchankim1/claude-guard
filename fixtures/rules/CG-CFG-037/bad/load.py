import joblib
from urllib.request import urlopen

def load(url: str):
    return joblib.load(urlopen(url))
