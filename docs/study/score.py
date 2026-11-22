"""Score the SignBridge usability study:  python score.py results.csv
SUS (Brooke 1996): odd items -> answer-1, even items -> 5-answer, sum x 2.5 = 0..100."""
import csv
import statistics as st
import sys


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def sus(row):
    a = [num(row.get(f"sus{i}")) for i in range(1, 11)]
    if any(x is None or not 1 <= x <= 5 for x in a):
        return None
    return 2.5 * sum((x - 1) if i % 2 == 0 else (5 - x) for i, x in enumerate(a))


def band(s):
    return ("excellent" if s >= 80.3 else "good" if s >= 68 else "ok" if s >= 51 else "poor")


def main(path):
    rows = [r for r in csv.DictReader(open(newline="", file=path)) if r.get("participant")]
    if not rows:
        raise SystemExit("no participants in " + path)
    print("participant  signer  SUS")
    scores = []
    for r in rows:
        s = sus(r)
        print(f"{r['participant']:<12} {r.get('signer', ''):<7} {'incomplete' if s is None else s}")
        if s is not None:
            scores.append(s)
    lines = ["| Measure | Result |", "|---|---|", f"| Participants | {len(rows)} |"]
    if scores:
        sd = st.stdev(scores) if len(scores) > 1 else 0.0
        m = st.mean(scores)
        lines.append(f"| SUS (0-100) | **{m:.1f} ± {sd:.1f}** ({band(m)}; n = {len(scores)}) |")
    for t in range(1, 8):
        ok = [num(r.get(f"t{t}_success")) for r in rows]
        ok = [x for x in ok if x is not None]
        if not ok:
            continue
        secs = [x for x in (num(r.get(f"t{t}_seconds")) for r in rows) if x is not None]
        att = [x for x in (num(r.get(f"t{t}_attempts")) for r in rows) if x is not None]
        extra = (f", median {st.median(secs):.0f} s" if secs else "") + (f", {st.mean(att):.1f} attempts" if att else "")
        lines.append(f"| T{t} success | {100 * sum(ok) / len(ok):.0f} % ({int(sum(ok))}/{len(ok)}){extra} |")
    print("\n" + "\n".join(lines))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "results.csv")
