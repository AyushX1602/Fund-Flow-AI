# FundFlow AI 🕵️‍♂️💸

**Real-Time Fraud Detection & Investigation Platform for Public Sector Banks**

Built for the **AI FinTech Hackathon 2026** — FundFlow AI combines a tuned XGBoost model (49 features, AUC-ROC 0.9666) with graph-based fraud ring detection to identify suspicious transactions, money mule accounts, and complex fraud networks in real-time.

![Dashboard](https://img.shields.io/badge/Status-Hackathon%20Ready-brightgreen) ![XGBoost](https://img.shields.io/badge/Model-XGBoost%20(AUC%200.97)-blue) ![License](https://img.shields.io/badge/License-MIT-yellow)

---

## 🏗️ Architecture

```
┌─────────────────┐     ┌────────────────────┐     ┌──────────────────────┐
│   React/Vite    │────▶│  Node.js/Express   │────▶│  FastAPI ML Service  │
│   (Port 5173)   │     │    (Port 5000)      │     │     (Port 8000)      │
│                 │     │                     │     │                      │
│ • Dashboard     │     │ • Prisma ORM        │     │ • XGBoost Inference  │
│ • Charts        │     │ • Socket.IO         │     │ • SHAP Explanations  │
│ • Network Graph │     │ • REST API          │     │ • Graph Engine       │
│ • Theme Toggle  │     │ • Alert Engine      │     │ • Ring Detection     │
└─────────────────┘     └────────┬───────────┘     └──────────────────────┘
                                 │
                        ┌────────▼───────────┐
                        │   PostgreSQL 16    │
                        │   (Docker/Local)   │
                        │   Port 5432        │
                        └────────────────────┘
```

---

## ⚡ Quick Start

### Prerequisites
- **Node.js** 18+
- **Python** 3.10+
- **Docker Desktop** (for PostgreSQL)

### 1. Clone & Install

```bash
git clone https://github.com/AyushX1602/Fund-Flow-AI.git
cd Fund-Flow-AI

# Install frontend dependencies
cd client && npm install && cd ..

# Install backend dependencies
cd server && npm install && cd ..
```

### 2. Start PostgreSQL (Docker)

```bash
docker run -d \
  --name fundflow-pg \
  -e POSTGRES_USER=fundflow \
  -e POSTGRES_PASSWORD=fundflow123 \
  -e POSTGRES_DB=fundflow_ai \
  -p 5432:5432 \
  postgres:16-alpine
```

### 3. Configure Environment

```bash
cd server
cp .env.example .env
# The defaults work out of the box — no changes needed
```

### 4. Initialize Database

```bash
cd server
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
```

### 5. Setup Python ML Service

```bash
cd Fraud_Detection/Fraud_Detection

# Create virtual environment
python -m venv venv

# Activate it
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

> **Note:** The trained XGBoost model (`models/saved/xgboost_fraud.pkl`) is included in the repo. No training required.
>
> For full graph features, download the [PaySim Dataset from Kaggle](https://www.kaggle.com/datasets/ealaxi/paysim1), rename to `paysim dataset.csv`, place in the `Fraud_Detection/Fraud_Detection/` root, and run:
> ```bash
> python kaggle_preprocess.py
> python scripts/generate_india_extras.py
> python -m features.graph_features
> python setup_and_run.py
> ```

### 6. Start All Services (3 terminals)

```bash
# Terminal 1: Python ML Service
cd Fraud_Detection/Fraud_Detection
venv\Scripts\python.exe run.py
# Runs on http://localhost:8000

# Terminal 2: Node.js Backend
cd server
npm run dev
# Runs on http://localhost:5000

# Terminal 3: React Frontend
cd client
npm run dev
# Runs on http://localhost:5173
```

### 7. Open Dashboard

👉 **http://localhost:5173**

The system runs in **Demo Mode** by default — no login required.

---

## 📸 Features

### Command Center Dashboard
- **Real-time metrics**: Total transactions, fraud count, active alerts, frozen accounts
- **Fraud Trend Chart**: 30-day fraud vs. legitimate transaction trends
- **Risk Distribution Histogram**: Visual breakdown by LOW/MEDIUM/HIGH/CRITICAL tiers
- **Channel Breakdown**: UPI/NEFT/IMPS/ATM donut chart
- **Live Transaction Feed**: WebSocket-powered real-time scoring

### Transaction Management
- Paginated transaction list with fraud score badges
- Per-transaction SHAP explanations
- Filter by risk tier, fraud status, type, channel

### Investigation Network
- **HiDPI Canvas Visualization**: Crisp fund flow graphs at any screen resolution
- **Directional Arrows**: Clear sender → receiver flow with amount labels
- **Animated Fund Tracing**: Step-by-step flow animation
- **Fraud Ring Detection**: Algorithmic cycle detection in transaction graphs
- **Account Freeze Simulation**: Impact analysis before freezing

### ML Model Dashboard
- Live XGBoost metrics: AUC-ROC, AUC-PR, Precision, Recall, F1
- Top 15 feature importance chart from trained model
- FastAPI service health monitoring
- Automatic fallback to rule-based scoring when ML service is offline

### Alerts & Investigations
- Auto-generated alerts when fraud score exceeds threshold
- Case management with status tracking
- Priority assignment and notes

---

## 🧠 ML Pipeline

| Component | Details |
|---|---|
| **Algorithm** | XGBoost (binary:logistic) |
| **Features** | 49 engineered features |
| **Training Data** | 399,356 transactions (PaySim) |
| **AUC-ROC** | 0.9666 |
| **AUC-PR** | 0.7224 |
| **Recall** | 0.8119 (at threshold 0.70) |
| **Top Features** | UPI type, Deposit type, Cross-bank UPI, NEFT, New receiver risk |

### Feature Categories
- **Transaction**: Amount, type, channel, time-of-day, weekend
- **Velocity**: 1h/24h transaction counts, unique receivers
- **Behavioral**: Amount deviation, passthrough ratio, round amounts
- **Graph**: Mule scores, ring involvement, in/out degree
- **India Stack**: KYC risk flags, CIBIL score flags

---

## 🇮🇳 India Stack Integration

- **UPI/NEFT/IMPS/ATM**: All transaction types mapped to Indian banking rails
- **KYC Tiers**: FULL_KYC, AADHAAR_BASED, OTP_BASED, MIN_KYC, VIDEO_KYC
- **CIBIL Risk**: Credit score-based risk flags
- **PMLA Thresholds**: ₹50,000 and ₹10,00,000 structuring detection
- **Branch Network**: 25 branches across 16 Indian cities

---

## 🔧 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite, Tailwind CSS v4, shadcn/ui, Recharts |
| **Backend** | Node.js, Express, Prisma ORM, Socket.IO |
| **ML Service** | FastAPI, XGBoost, scikit-learn, NetworkX, SHAP |
| **Database** | PostgreSQL 16 (Docker) |
| **State** | Zustand (4 stores) |
| **Real-time** | WebSocket (Socket.IO + FastAPI WS) |

---

## 📁 Project Structure

```
Fund-Flow-AI/
├── client/                    # React frontend
│   ├── src/
│   │   ├── components/        # UI components (dashboard, layout, ui)
│   │   ├── pages/             # 7 pages (Dashboard, Transactions, Alerts, etc.)
│   │   ├── stores/            # Zustand state (dashboard, transaction, alert, simulation, theme)
│   │   └── lib/               # API client, formatters, socket
│   └── package.json
│
├── server/                    # Node.js backend
│   ├── controllers/           # Route handlers
│   ├── services/              # Business logic (ML scoring, alerts, simulation)
│   ├── middleware/             # Auth, validation, rate limiting
│   ├── prisma/                # Schema & migrations
│   └── package.json
│
├── Fraud_Detection/           # Python ML service
│   └── Fraud_Detection/
│       ├── api/               # FastAPI routes
│       ├── models/            # XGBoost trainer & predictor
│       │   └── saved/         # Trained model (.pkl) + metadata
│       ├── features/          # Feature engineering (49 features)
│       ├── graph/             # Fund flow, ring detector, mule detector
│       ├── scoring/           # Risk engine (weighted composite scoring)
│       ├── investigation/     # Case manager, freeze simulator
│       └── requirements.txt
│
└── .gitignore
```

---

## 🤝 Team

Built by **Team Spirit** for the PSBs Hackathon Series 2026.

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
