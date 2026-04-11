"""
FundFlow AI — Single Entry Point
Run the entire application from here.
"""
import uvicorn
from config import API_HOST, API_PORT


def main():
    """Start the FundFlow AI server."""
    print("=" * 60)
    print("  FundFlow AI — Real-Time Fraud Intelligence Platform")
    print("  PSBs Hackathon Series 2026")
    print("=" * 60)
    print(f"\n  Dashboard: http://{API_HOST}:{API_PORT}")
    print(f"  API Docs:  http://{API_HOST}:{API_PORT}/docs")
    print(f"  Live Feed: ws://{API_HOST}:{API_PORT}/ws/live-feed")
    print("\n" + "=" * 60)

    uvicorn.run(
        "api.main:app",
        host=API_HOST,
        port=API_PORT,
        reload=True,
        log_level="info",
    )


if __name__ == "__main__":
    main()
