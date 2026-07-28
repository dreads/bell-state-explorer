# Local-dev-only image -- rehearse the integration test with the exact same
# Python/Qiskit versions CI uses, without touching host Python. The GitHub
# Actions workflows do NOT use this image; they install deps directly on
# ubuntu-latest, same as upstream qiskit-ibm-runtime's own CI. See
# CLAUDE.md's "Added: CI/CD (Qiskit Runtime integration)" section.
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "run_circuit.py"]
