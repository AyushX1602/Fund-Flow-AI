"""
FundFlow AI — Graph-Based Risk Propagation
Propagates fraud risk scores through the transaction graph.
Similar to PageRank but for fraud: fraudulent accounts contaminate their neighbors.
"""
import networkx as nx
import numpy as np
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def propagate_risk(G: nx.MultiDiGraph, initial_scores: dict,
                   decay: float = 0.5, iterations: int = 10) -> dict:
    """
    Propagate fraud risk scores from seed accounts to their neighbors.

    Args:
        G: Transaction graph.
        initial_scores: dict of {account: fraud_probability} from ML model.
        decay: Risk halves with each hop (default 0.5).
        iterations: Number of propagation rounds.

    Returns:
        dict of {account: graph_risk_score} for all nodes.
    """
    # Initialise with ML scores
    risk = {node: initial_scores.get(node, 0.0) for node in G.nodes()}

    for _ in range(iterations):
        new_risk = dict(risk)

        for node in G.nodes():
            if risk[node] < 0.01:
                continue  # Skip very low risk nodes (optimisation)

            # Get total outflow to weight propagation
            out_edges = list(G.out_edges(node, data=True))
            if not out_edges:
                continue

            total_outflow = sum(e[2]['amount'] for e in out_edges) or 1.0

            for _, neighbor, edge_data in out_edges:
                transfer_amount = edge_data['amount']
                # Risk propagated = node_risk * decay * (amount_share)
                propagated = risk[node] * decay * (transfer_amount / total_outflow)
                new_risk[neighbor] = min(1.0, new_risk.get(neighbor, 0.0) + propagated)

        # Check convergence
        delta = max(abs(new_risk.get(n, 0) - risk.get(n, 0)) for n in G.nodes())
        risk = new_risk
        if delta < 1e-6:
            break

    return {node: round(score, 4) for node, score in risk.items()}


def compute_centrality_scores(G: nx.MultiDiGraph) -> dict:
    """
    Compute betweenness centrality — accounts with high centrality
    are potential money laundering hubs (critical in fund flow chains).

    Returns dict of {account: centrality_score}
    """
    # Use a simple DiGraph for centrality (collapse multiedges)
    simple_G = nx.DiGraph()
    for u, v in G.edges():
        simple_G.add_edge(u, v)

    if simple_G.number_of_nodes() == 0:
        return {}

    # Approximate betweenness (faster for large graphs)
    centrality = nx.betweenness_centrality(simple_G, normalized=True, k=min(100, simple_G.number_of_nodes()))
    return {node: round(score, 6) for node, score in centrality.items()}
