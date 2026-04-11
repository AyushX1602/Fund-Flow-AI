# FundFlow AI 🕵️‍♂️💸

FundFlow AI is a real-time, graph-enhanced fraud detection platform built for the **AI FinTech Hackathon**. It ingests high-velocity financial transactions, extracts 49 distinct data features (including graph topologies and synthetic Indian banking markers like CIBIL/KYC), and scores them in milliseconds using a tuned XGBoost architecture.

It goes beyond standard tabular ML by building an in-memory **Directed Graph** of all transactions to detect complex fraud rings and money mule accounts that single-transaction models miss.

---

## 📸 Dashboard Capabilities
- **Command Center:** Real-time replay simulator testing the model's throughput (< 100ms per inference) with live WebSocket streaming.
- **Fund Flow Explorer:** 3-hop interactive graph visualization of money movement between suspected accounts.
- **Mule Network Tracker:** Algorithmic identification of mule accounts based on passing-through volume, account age, and KYC status.
- **Investigation Workspace:** Deep-dive into specific account risk profiles, simulate RBI Account Aggregator pulls, and manually score single transactions.

---

## ⚙️ Installation & Setup

Since GitHub limits file sizes to 100MB, the massive raw dataset and generated caches are excluded from this repository. You must generate them locally.

### 1. Requirements
* Python 3.10 or higher
* Minimum 8GB RAM (16GB recommended due to graph overhead)

### 2. Download the Dataset
1. Download the [PaySim Dataset from Kaggle](https://www.kaggle.com/datasets/ealaxi/paysim1).
2. Extract the downloaded archive.
3. Rename the extracted CSV file to exactly `paysim dataset.csv`.
4. Place `paysim dataset.csv` in the root folder of this project.

### 3. Build Data & Caches
Open your terminal in the project root and run these commands to build the data pipeline:

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Preprocess Kaggle data (Remaps to Indian rails: UPI/NEFT/IMPS)
python kaggle_preprocess.py

# 3. Generate synthetic Indian banking markers (KYC, CIBIL, VPA)
python scripts/generate_india_extras.py

# 4. Precompute Graph Centrality features
python -m features.graph_features
```
*Note: The graph caching script may take 2–4 minutes depending on your CPU.*

### 4. Final Setup & Launch
Run the automated setup script. This script will automatically initialize the SQLite database, bulk-load the processed transactions, train the XGBoost model, populate initial fraud alerts, and then launch the dashboard.

```bash
python setup_and_run.py
```

Once you see `Application startup complete` in the terminal, open your browser to:
👉 **[http://127.0.0.1:8000](http://127.0.0.1:8000)**

---

## 🧠 Tech Stack
* **Core Machine Learning:** `xgboost`, `scikit-learn`, `shap`
* **Graph Modeling:** `networkx`
* **Backend:** `fastapi`, `uvicorn`, `sqlite3`
* **Real-time Comms:** WebSockets (`asyncio`)
* **Frontend:** Vanilla HTML/CSS/JS, `Chart.js`, `vis-network.js` (for interactive graphs)
