import urllib.request
import json

req = urllib.request.urlopen('https://api.github.com/repos/Piergirec/Visione_Atlas/actions/runs')
data = json.loads(req.read())
for r in data['workflow_runs'][:5]:
    print(f"ID: {r['id']}, Status: {r['status']}, Conclusion: {r['conclusion']}")
    print(f"Message: {r['head_commit']['message']}")
    print("-" * 40)
