#!/usr/bin/env python3
"""Derive a safe concurrent-viewer limit from a ramp run.

  python3 scripts/loadtest/derive-limit.py results/<run>/steps.csv metrics.csv \
      [--max-cpu 70] [--max-loss 1.0] [--port-mbps 300] [--max-nic 70] [--headroom 0.7]

A step PASSES when, during its time window: lk reported 0 errors and exit 0, packet loss <= --max-loss %,
peak CPU <= --max-cpu %, peak TX <= --max-nic % of --port-mbps. The recommended cap is the highest
passing step x --headroom (default 0.7), because a real audience is burstier than a ramp.
Use the result for LIVEKIT_MAX_VIEWERS_PER_ROOM / LIVEKIT_MAX_PARTICIPANTS_PER_NODE.
"""
import argparse
import csv
from datetime import datetime


def ts(s):
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("steps")
    ap.add_argument("metrics")
    ap.add_argument("--max-cpu", type=float, default=70.0)
    ap.add_argument("--max-loss", type=float, default=1.0)
    ap.add_argument("--port-mbps", type=float, default=300.0)
    ap.add_argument("--max-nic", type=float, default=70.0)
    ap.add_argument("--headroom", type=float, default=0.7)
    a = ap.parse_args()

    metrics = [
        (ts(r["ts"]), float(r["cpu_pct"]), float(r["tx_mbps"]))
        for r in csv.DictReader(open(a.metrics))
    ]
    best = 0
    print(f"{'subs':>6} {'cpu_peak':>9} {'tx_peak':>9} {'loss%':>6} {'errors':>6}  verdict")
    for r in csv.DictReader(open(a.steps)):
        n = int(r["subscribers"])
        t0, t1 = ts(r["start"]), ts(r["end"])
        win = [m for m in metrics if t0 <= m[0] <= t1]
        cpu = max((m[1] for m in win), default=float("nan"))
        tx = max((m[2] for m in win), default=float("nan"))
        loss = float(r["packet_loss_pct"] or 0)
        errors = int(r["errors"] or 0) if (r["errors"] or "").isdigit() else 0
        reasons = []
        if not win:
            reasons.append("no metrics in window")
        if r["exit"] != "0":
            reasons.append("lk exit != 0")
        if errors:
            reasons.append("errors")
        if loss > a.max_loss:
            reasons.append("loss")
        if cpu > a.max_cpu:
            reasons.append("cpu")
        if tx > a.port_mbps * a.max_nic / 100:
            reasons.append("nic")
        ok = not reasons
        if ok:
            best = max(best, n)
        print(f"{n:>6} {cpu:>9.1f} {tx:>9.1f} {loss:>6.2f} {errors:>6}  {'PASS' if ok else 'FAIL: ' + ','.join(reasons)}")
    print()
    if best:
        print(f"highest passing step: {best}  ->  recommended cap: {int(best * a.headroom)} (x{a.headroom} headroom)")
    else:
        print("no step passed: lower the first step or investigate the failures before setting a cap")


if __name__ == "__main__":
    main()
