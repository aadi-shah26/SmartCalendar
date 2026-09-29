# Scheduler Backend

FastAPI server running the CP-SAT and greedy heuristic schedulers.

## Running the backend

From the `scheduler-backend/` directory:

```bash
venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The server starts at **http://localhost:8000**.  
Interactive API docs: **http://localhost:8000/docs**

## First-time setup

If `venv/` does not exist yet:

```bash
python3 -m venv venv
venv/bin/pip install -r requirements.txt
venv/bin/pip install ortools
```
