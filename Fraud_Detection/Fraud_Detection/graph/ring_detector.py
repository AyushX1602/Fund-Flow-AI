"""
FundFlow AI — Fraud Ring Detector
Finds cycles, communities, and suspicious clusters in the transaction graph.
"""
import networkx as nx
import pandas as pd
from datetime import timedelta
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def find_cycles(G: nx.MultiDiGraph, max_length: int = 6,
                time_window_hours: int = 48) -> list:
    """
    Find circular fund flow patterns (A→B→C→A).
    Filters cycles where all transactions occur within the time window.

    Returns list of ring dicts.
    """
    # Build a simple DiGraph for cycle detection (collapse multiedges)
    simple_G = nx.DiGraph()
    edge_map = {}
    for u, v, data in G.edges(data=True):
        simple_G.add_edge(u, v)
        if (u, v) not in edge_map:
            edge_map[(u, v)] = data

    rings = []
    for cycle in nx.simple_cycles(simple_G):
        if len(cycle) < 2 or len(cycle) > max_length:
            continue

        # Build ring edges
        ring_edges = []
        total_amount = 0.0
        timestamps = []

        valid = True
        for i in range(len(cycle)):
            u = cycle[i]
            v = cycle[(i + 1) % len(cycle)]
            if (u, v) not in edge_map:
                valid = False
                break
            e = edge_map[(u, v)]
            ring_edges.append({
                "from": u, "to": v,
                "amount": e['amount'],
                "timestamp": str(e['timestamp']),
                "txn_id": e['txn_id'],
            })
            total_amount += e['amount']
            timestamps.append(pd.to_datetime(e['timestamp']))

        if not valid or not timestamps:
            continue

        # Time window check
        time_span = (max(timestamps) - min(timestamps)).total_seconds() / 3600
        if time_span > time_window_hours:
            continue

        # Score the ring
        risk_score = _score_ring(cycle, ring_edges, time_span)

        rings.append({
            "ring_id":       f"RING_{len(rings):04d}",
            "accounts":      cycle,
            "ring_size":     len(cycle),
            "edges":         ring_edges,
            "total_amount":  round(total_amount, 2),
            "time_span_hrs": round(time_span, 2),
            "risk_score":    risk_score,
        })

    rings.sort(key=lambda r: r['risk_score'], reverse=True)
    return rings


def _score_ring(accounts: list, edges: list, time_span_hrs: float) -> float:
    """Score a ring based on suspiciousness factors."""
    score = 0.0
    score += 30.0  # Base: cycle exists

    if len(accounts) <= 3:
        score += 20.0  # Short cycle = tighter ring

    if time_span_hrs < 2:
        score += 25.0  # Very fast cycle
    elif time_span_hrs < 6:
        score += 10.0

    amounts = [e['amount'] for e in edges]
    if len(amounts) > 1:
        std = pd.Series(amounts).std()
        mean = pd.Series(amounts).mean()
        cv = std / mean if mean > 0 else 1.0
        if cv < 0.05:
            score += 15.0  # Near-identical amounts

    return min(score / 100.0, 1.0)


def find_suspicious_clusters(G: nx.MultiDiGraph, min_degree: int = 5) -> list:
    """
    Find hub accounts — nodes with unusually high connectivity.
    Star patterns (one account connected to many) are suspicious.
    """
    clusters = []
    for node in G.nodes():
        in_deg  = G.in_degree(node)
        out_deg = G.out_degree(node)
        total   = in_deg + out_deg
        if total < min_degree:
            continue

        # Star pattern: many connections but low reciprocity
        node_data = G.nodes[node]
        clusters.append({
            "account":       node,
            "in_degree":     in_deg,
            "out_degree":    out_deg,
            "total_degree":  total,
            "total_sent":    round(node_data.get('total_sent', 0), 2),
            "total_received": round(node_data.get('total_received', 0), 2),
            "max_fraud_prob": round(node_data.get('max_fraud_prob', 0), 4),
        })

    clusters.sort(key=lambda c: c['total_degree'], reverse=True)
    return clusters[:50]  # Top 50


def get_ring_summary(rings: list) -> dict:
    """Summarise all detected rings."""
    if not rings:
        return {"total_rings": 0, "high_risk_rings": 0, "total_exposure": 0.0}
    return {
        "total_rings":     len(rings),
        "high_risk_rings": sum(1 for r in rings if r['risk_score'] > 0.6),
        "total_exposure":  round(sum(r['total_amount'] for r in rings), 2),
        "avg_ring_size":   round(sum(r['ring_size'] for r in rings) / len(rings), 1),
    }
