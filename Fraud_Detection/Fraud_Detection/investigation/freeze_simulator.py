"""
FundFlow AI — Freeze Simulation
"What if we freeze this account?" — Impact analysis.
Shows which fund flow paths are disrupted, how much money is saved,
and whether any legitimate accounts are caught in the blast radius.
"""
import networkx as nx
import copy
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def simulate_freeze(G: nx.MultiDiGraph, account: str,
                    mule_scores: dict = None,
                    fraud_scores: dict = None) -> dict:
    """
    Simulate freezing an account and show the downstream impact.

    Args:
        G: The full transaction graph.
        account: Account ID to freeze.
        mule_scores: dict {account: mule_score} for collateral assessment.
        fraud_scores: dict {account: fraud_probability} for impact assessment.

    Returns:
        dict with disrupted_paths, money_saved, collateral_accounts, graph_diff
    """
    if account not in G:
        return {"error": f"Account {account} not found in graph"}

    fraud_scores  = fraud_scores  or {}
    mule_scores   = mule_scores   or {}

    # ── BEFORE freeze ──────────────────────────────────────────────────────────
    before_successors = set(_get_all_reachable(G, account, direction='forward'))
    before_predecessors = set(_get_all_reachable(G, account, direction='backward'))
    total_reachable_before = before_successors | before_predecessors

    # Compute money that would flow through this account outward
    out_edges = list(G.out_edges(account, data=True))
    money_saved = sum(e[2]['amount'] for e in out_edges)

    # ── AFTER freeze (remove node) ─────────────────────────────────────────────
    G_frozen = copy.deepcopy(G)
    G_frozen.remove_node(account)

    after_reachable = set()
    for node in G_frozen.nodes():
        if node in before_successors:
            after_reachable.add(node)

    # Disrupted = nodes that WERE reachable, now are NOT
    disrupted = before_successors - after_reachable

    # ── IMPACT ANALYSIS ───────────────────────────────────────────────────────
    disrupted_suspects = []
    collateral_legit   = []

    for node in disrupted:
        fraud_p = fraud_scores.get(node, 0.0)
        mule_s  = mule_scores.get(node, 0.0)
        combined = max(fraud_p, mule_s)

        entry = {
            "account":       node,
            "fraud_prob":    round(fraud_p, 4),
            "mule_score":    round(mule_s, 4),
            "is_suspicious": combined > 0.4,
        }
        if combined > 0.4:
            disrupted_suspects.append(entry)
        else:
            collateral_legit.append(entry)

    # ── GRAPH DIFF for visualisation ──────────────────────────────────────────
    # Before: frozen account + all connections shown
    before_nodes = [account] + list(G.predecessors(account)) + list(G.successors(account))
    before_edges = [
        {"from": u, "to": v, "amount": d['amount'], "txn_id": d['txn_id']}
        for u, v, d in G.edges(data=True)
        if u == account or v == account
    ]

    return {
        "frozen_account":      account,
        "money_saved":         round(money_saved, 2),
        "disrupted_accounts":  len(disrupted),
        "suspicious_disrupted": len(disrupted_suspects),
        "collateral_accounts": len(collateral_legit),
        "disrupted_suspects":  disrupted_suspects[:20],
        "collateral_legit":    collateral_legit[:10],
        "before": {
            "nodes": before_nodes,
            "edges": before_edges,
        },
        "summary": (
            f"Freezing {account} disrupts {len(disrupted)} downstream accounts, "
            f"traps {money_saved:,.0f} in outgoing transactions. "
            f"{len(disrupted_suspects)} suspected fraud accounts cut off. "
            f"{len(collateral_legit)} potentially legitimate accounts affected."
        ),
    }


def _get_all_reachable(G: nx.MultiDiGraph, start: str,
                        direction: str = 'forward', max_depth: int = 6) -> list:
    """BFS to get all reachable nodes from start."""
    visited = set()
    queue   = [start]
    depth   = {start: 0}

    while queue:
        node = queue.pop(0)
        if node in visited:
            continue
        visited.add(node)
        if depth[node] >= max_depth:
            continue

        if direction == 'forward':
            neighbors = list(G.successors(node))
        else:
            neighbors = list(G.predecessors(node))

        for nb in neighbors:
            if nb not in visited:
                depth[nb] = depth[node] + 1
                queue.append(nb)

    visited.discard(start)
    return list(visited)
