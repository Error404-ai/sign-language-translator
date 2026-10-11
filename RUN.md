# Run SignBridge (3 terminals, repo root)
1. ML server   (venv active):  cd ml-server ; uvicorn main:app --port 8000
2. Backend:                    cd backend ; npm install ; npm start        # :5000
3. Frontend:                   cd frontend ; py -3.11 -m http.server 3000   # open http://localhost:3000

Retrain:   cd ml ; python collect_data.py hello thank_you idle ; python train.py --signs signs.txt
Append gitignore-additions.txt to your .gitignore.
