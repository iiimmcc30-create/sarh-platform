import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(__file__)


def run(steps, metrics):
    with tempfile.TemporaryDirectory() as d:
        s, m = os.path.join(d, "s.csv"), os.path.join(d, "m.csv")
        open(s, "w").write(steps)
        open(m, "w").write(metrics)
        return subprocess.run(
            [sys.executable, os.path.join(HERE, "derive-limit.py"), s, m, "--port-mbps", "300"],
            capture_output=True, text=True,
        ).stdout


STEPS = (
    "mode,subscribers,start,end,tracks,bitrate,packet_loss_pct,errors,exit\n"
    "video,100,2026-01-01T00:00:00Z,2026-01-01T00:01:00Z,100/100,x,0.1,0,0\n"
    "video,200,2026-01-01T00:01:00Z,2026-01-01T00:02:00Z,200/200,x,0.2,0,0\n"
    "video,300,2026-01-01T00:02:00Z,2026-01-01T00:03:00Z,290/300,x,3.5,4,0\n"
    "video,400,2026-01-01T00:03:00Z,2026-01-01T00:04:00Z,300/400,x,0.0,0,0\n"
)
METRICS = (
    "ts,cpu_pct,load1,rx_mbps,tx_mbps,livekit_rss_mb\n"
    "2026-01-01T00:00:30Z,30,1,5,100,200\n"
    "2026-01-01T00:01:30Z,55,2,6,190,300\n"
    "2026-01-01T00:02:30Z,60,3,6,205,350\n"
    "2026-01-01T00:03:30Z,95,6,6,260,400\n"
)


def test_picks_highest_passing_step_with_headroom():
    out = run(STEPS, METRICS)
    assert "100" in out and "PASS" in out
    assert "FAIL: errors,loss" in out  # step 300
    assert "FAIL: cpu,nic" in out  # step 400
    assert "highest passing step: 200  ->  recommended cap: 140" in out


def test_no_passing_step():
    out = run(STEPS.replace(",0.1,0,0", ",9,0,0").replace(",0.2,0,0", ",9,0,0"), METRICS)
    assert "no step passed" in out


if __name__ == "__main__":
    test_picks_highest_passing_step_with_headroom()
    test_no_passing_step()
    print("ok")
