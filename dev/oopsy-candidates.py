"""Enemy abilities that are avoidable, from ACT logs: candidates for oopsy's "got hit" mistakes.

For each zone, every enemy ability cast (21/22 lines grouped by source, id and time) is counted
with how many players it hit with damage.  An ability that does hit players (in at least
--min-hit-casts casts) but hits nobody in at least --zero of at least --min-casts casts is
avoidable, so getting hit by it is a mistake.

python dev/oopsy-candidates.py "<logs glob>" --zones 4E9=r5s,52F=r12s [--names Action.csv]
    [--min-casts 30] [--zero 0.9] [--min-hit-casts 3] [--out candidates.txt]

--zones: zone ids (hex, as in 01 lines) and labels.  --names: an English Action.csv (exd dump) to
show English names next to the Korean ones from the log.
"""
import argparse
import collections
import csv
import glob
import sys

ATTACK = {'01', '03', '05', '06', '36'}
SHIFT = {'3E', '113', '213', '313'}


def low_byte(g):
    flags = g[8]
    if flags in SHIFT and len(g) > 10:
        flags = g[10]
    return flags[-2:].rjust(2, '0')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('logs', help='glob of Network_*.log files (recursive ** allowed)')
    ap.add_argument('--zones', required=True)
    ap.add_argument('--names')
    ap.add_argument('--min-casts', type=int, default=30)
    ap.add_argument('--zero', type=float, default=0.9)
    ap.add_argument('--min-hit-casts', type=int, default=3)
    ap.add_argument('--out')
    args = ap.parse_args()
    zones = dict(z.split('=') for z in args.zones.split(','))

    # casts[zone][id] = players hit per cast; names[zone][id] = name in the log
    casts = collections.defaultdict(lambda: collections.defaultdict(list))
    names = collections.defaultdict(dict)
    pulls = collections.Counter()
    for f in glob.glob(args.logs, recursive=True):
        zone = None
        cur = {}  # (source, id, time) -> players hit
        for line in open(f, encoding='utf-8', errors='replace'):
            g = line.split('|')
            t = g[0]
            if t == '01' and len(g) > 2:
                for k, v in cur.items():
                    casts[zone][k[1]].append(v)
                cur = {}
                zone = zones.get(g[2])
                continue
            if zone is None:
                continue
            if t == '260' and len(g) > 3 and g[3] == '1':
                pulls[zone] += 1
            if t not in ('21', '22') or len(g) < 10 or g[2][:1] != '4':
                continue
            key = (g[2], g[4], g[1])
            hit = g[6][:2] == '10' and low_byte(g) in ATTACK
            cur[key] = cur.get(key, 0) + (1 if hit else 0)
            names[zone][g[4]] = g[5]
            if len(cur) > 5000:
                for k, v in list(cur.items())[:2500]:
                    casts[zone][k[1]].append(v)
                    del cur[k]
        for k, v in cur.items():
            casts[zone][k[1]].append(v)

    en = {}
    if args.names:
        with open(args.names, encoding='utf-8') as fh:
            for row in csv.reader(fh):
                if row and row[0].isdigit():
                    en['%X' % int(row[0])] = row[1]

    out = []
    for zone in zones.values():
        out.append(f'===== {zone} pulls={pulls[zone]}')
        rows = []
        for aid, hits in casts[zone].items():
            n = len(hits)
            hitc = [h for h in hits if h > 0]
            if n < args.min_casts or len(hitc) < args.min_hit_casts:
                continue
            zero = 1 - len(hitc) / n
            if zero < args.zero:
                continue
            rows.append((zero, n, aid, sum(hitc) / len(hitc), max(hits), len(hitc)))
        rows.sort(reverse=True)
        for zero, n, aid, avg, mx, hc in rows:
            out.append(f'{aid:5} casts={n:5} hitCasts={hc:4} zero={zero:6.1%} avgHit={avg:4.1f} '
                       f'max={mx:2} {names[zone].get(aid, "")} / {en.get(aid, "")}')
    text = '\n'.join(out)
    if args.out:
        open(args.out, 'w', encoding='utf-8').write(text)
    else:
        sys.stdout.reconfigure(encoding='utf-8')
        print(text)


if __name__ == '__main__':
    main()
