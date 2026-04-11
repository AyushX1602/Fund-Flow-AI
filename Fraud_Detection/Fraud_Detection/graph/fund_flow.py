"""
FundFlow AI — Fund Flow Graph Engine
Builds a directed transaction graph and supports multi-hop fund flow tracing.
Nodes = accounts, Edges = transactions.
"""
import networkx as nx
import pandas as pd
from datetime import datetime, timedelta
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class FundFlowGraph:
    """
    Directed multigraph of financial transactions.
    Supports multi-hop fund flow tracing with causal ordering.
    """

    def __init__(self):
        self.G = nx.MultiDiGraph()

    def build_from_df(self, df: pd.DataFrame):
        """Build graph from transaction DataFrame."""
        df = df.copy()
        df['timestamp'] = pd.to_datetime(df['timestamp'])

        for _, row in df.iterrows():
            self.add_transaction(
                txn_id=row['txn_id'],
                sender=row['sender_account'],
                receiver=row['receiver_account'],
                amount=float(row['amount']),
                timestamp=row['timestamp'],
                fraud_prob=float(row.get('fraud_probability', 0.0)),
                is_fraud=int(row.get('is_fraud', 0)),
                txn_type=str(row.get('txn_type', '')),
            )
        return self

    def add_transaction(self, txn_id, sender, receiver, amount, timestamp,
                        fraud_prob=0.0, is_fraud=0, txn_type=''):
        """Add a single transaction as a directed edge."""
        if not self.G.has_node(sender):
            self.G.add_node(sender, total_sent=0.0, total_received=0.0,
                            txn_count=0, max_fraud_prob=0.0)
        if not self.G.has_node(receiver):
            self.G.add_node(receiver, total_sent=0.0, total_received=0.0,
                            txn_count=0, max_fraud_prob=0.0)

        self.G.add_edge(sender, receiver,
                        txn_id=txn_id,
                        amount=amount,
                        timestamp=timestamp,
                        fraud_prob=fraud_prob,
                        is_fraud=is_fraud,
                        txn_type=txn_type)

        # Update node stats
        self.G.nodes[sender]['total_sent']     += amount
        self.G.nodes[sender]['txn_count']      += 1
        self.G.nodes[receiver]['total_received'] += amount
        self.G.nodes[receiver]['txn_count']    += 1
        self.G.nodes[sender]['max_fraud_prob']  = max(
            self.G.nodes[sender]['max_fraud_prob'], fraud_prob)
        self.G.nodes[receiver]['max_fraud_prob'] = max(
            self.G.nodes[receiver]['max_fraud_prob'], fraud_prob)

    def trace_fund_flow(self, start_account: str, max_hops: int = 6,
                        time_window_hours: int = 24) -> dict:
        """
        Trace fund flow forward from start_account for up to max_hops.
        Uses causal ordering: only follows edges where outgoing timestamp
        is AFTER the incoming timestamp.

        Returns:
            dict with 'paths', 'nodes', 'edges', 'summary'
        """
        if start_account not in self.G:
            return {"paths": [], "nodes": [], "edges": [], "summary": {}}

        paths  = []
        nodes  = set([start_account])
        edges  = []
        visited_edges = set()

        def dfs(account, current_path, current_amount, last_timestamp, depth):
            if depth >= max_hops:
                return
            time_limit = last_timestamp + timedelta(hours=time_window_hours)

            for _, receiver, edge_data in self.G.out_edges(account, data=True):
                ts = edge_data['timestamp']
                if not isinstance(ts, datetime):
                    ts = pd.to_datetime(ts)
                # Causal ordering — receiver's outgoing must be AFTER incoming
                if ts < last_timestamp or ts > time_limit:
                    continue

                edge_key = edge_data['txn_id']
                if edge_key in visited_edges:
                    continue
                visited_edges.add(edge_key)

                nodes.add(receiver)
                edges.append({
                    "from": account,
                    "to":   receiver,
                    "txn_id": edge_data['txn_id'],
                    "amount": edge_data['amount'],
                    "timestamp": str(ts),
                    "fraud_prob": edge_data['fraud_prob'],
                    "is_fraud": edge_data['is_fraud'],
                    "txn_type": edge_data['txn_type'],
                    "hop": depth + 1,
                })

                new_path = current_path + [(receiver, edge_data['amount'], str(ts))]
                paths.append(new_path)
                dfs(receiver, new_path, edge_data['amount'], ts, depth + 1)

        # Seed with the most recent outgoing edge timestamp from start
        out_edges = list(self.G.out_edges(start_account, data=True))
        if not out_edges:
            return {"paths": [], "nodes": list(nodes), "edges": [], "summary": {}}

        earliest_ts = min(
            pd.to_datetime(e[2]['timestamp']) for e in out_edges
        )
        dfs(start_account, [(start_account, 0, str(earliest_ts))],
            0, earliest_ts, 0)

        # Summary
        total_amount = sum(e['amount'] for e in edges if e['hop'] == 1)
        max_hops_reached = max((e['hop'] for e in edges), default=0)
        time_span_min = 0
        if edges:
            timestamps = [pd.to_datetime(e['timestamp']) for e in edges]
            time_span_min = int((max(timestamps) - min(timestamps)).total_seconds() / 60)

        summary = {
            "start_account":   start_account,
            "total_hops":      max_hops_reached,
            "nodes_involved":  len(nodes),
            "total_amount":    round(total_amount, 2),
            "time_span_min":   time_span_min,
            "fraud_edges":     sum(1 for e in edges if e['is_fraud']),
        }

        return {
            "paths":   paths,
            "nodes":   list(nodes),
            "edges":   edges,
            "summary": summary,
        }

    def get_account_profile(self, account: str) -> dict:
        """Get summary statistics for an account node."""
        if account not in self.G:
            return {}
        node = self.G.nodes[account]
        in_deg  = self.G.in_degree(account)
        out_deg = self.G.out_degree(account)
        neighbors_in  = list(self.G.predecessors(account))
        neighbors_out = list(self.G.successors(account))

        return {
            "account":          account,
            "total_sent":       round(node.get('total_sent', 0), 2),
            "total_received":   round(node.get('total_received', 0), 2),
            "txn_count":        node.get('txn_count', 0),
            "in_degree":        in_deg,
            "out_degree":       out_deg,
            "unique_senders":   len(neighbors_in),
            "unique_receivers": len(neighbors_out),
            "max_fraud_prob":   round(node.get('max_fraud_prob', 0), 4),
            "net_flow":         round(node.get('total_received', 0) - node.get('total_sent', 0), 2),
        }

    def find_shortest_path(self, source: str, target: str) -> dict:
        """Check if money flowed from source to target, and via what path."""
        if source not in self.G or target not in self.G:
            return {"exists": False, "path": [], "hops": 0}
        try:
            path = nx.shortest_path(self.G, source, target)
            return {"exists": True, "path": path, "hops": len(path) - 1}
        except nx.NetworkXNoPath:
            return {"exists": False, "path": [], "hops": 0}

    def get_graph_stats(self) -> dict:
        """Overall graph statistics."""
        return {
            "total_nodes":  self.G.number_of_nodes(),
            "total_edges":  self.G.number_of_edges(),
            "is_connected": nx.is_weakly_connected(self.G) if self.G.number_of_nodes() > 0 else False,
        }
