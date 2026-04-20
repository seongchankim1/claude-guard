import subprocess
def run(argv: list[str]):
    return subprocess.run(argv, shell=False, check=True, capture_output=True)
