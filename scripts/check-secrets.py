"""Fail without printing secret material if likely credentials are in tracked/staged text."""
import re
import subprocess
from pathlib import Path

paths = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z']).decode().split('\0')
patterns = [
    re.compile(r'gh[pousr]_[A-Za-z0-9]{30,}'),
    re.compile(r'github_pat_[A-Za-z0-9_]{30,}'),
    re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    re.compile(r'AKIA[A-Z0-9]{16}'),
    re.compile(r'(?:client_secret|deployment_token)\s*[=:]\s*["\'][A-Za-z0-9+/=_-]{30,}["\']', re.I),
]
hits = []
for name in set(paths):
    path = Path(name)
    if not name or not path.is_file() or path.stat().st_size > 2_000_000:
        continue
    try:
        value = path.read_text()
    except (UnicodeError, OSError):
        continue
    if any(pattern.search(value) for pattern in patterns):
        hits.append(name)
if hits:
    print('Potential credentials detected in:', ', '.join(sorted(hits)))
    raise SystemExit(1)
print('No credential-pattern matches in tracked/nonignored project text. This is a heuristic, not a comprehensive secret scanner.')
