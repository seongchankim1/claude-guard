import subprocess
def run(cmd: str):
    return subprocess.run(cmd, shell=True, check=True, capture_output=True)
