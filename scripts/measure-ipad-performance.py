#!/usr/bin/env python3
"""Collect explicit Debug probe launches. Never installs, builds, or changes learner data."""
import argparse
import datetime
import hashlib
import json
import pathlib
import subprocess
import statistics
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
TAG = '[Replay Performance] '
BUNDLES = {'web': 'com.playbk.app', 'native': 'com.playbk.learn'}


def records(path):
    result = []
    for line in path.read_text(errors='replace').splitlines():
        if TAG in line:
            try:
                result.append(json.loads(line.split(TAG, 1)[1]))
            except json.JSONDecodeError:
                pass  # The writer may still be completing the last line.
    return result


def save_report(report, output):
    groups = {}
    for run in report['runs']:
        if not any(row.get('phase') == 'complete' for row in run['records']):
            continue
        key = (run['platform'], run['notes'], run['layout'])
        metrics = {}
        for record in run['records']:
            if record.get('phase') == 'playback':
                metrics.update({k: v for k, v in record.items() if isinstance(v, (int, float)) and not isinstance(v, bool)})
            elif record.get('phase') == 'tune-ready':
                metrics['tuneReadyMs'] = record['elapsedMs']
            elif record.get('phase') == 'audio-start':
                metrics['sceneToAudioMs'] = record['sceneToAudioMs']
        groups.setdefault(key, []).append(metrics)
    report['summary'] = [
        {'platform': key[0], 'notes': key[1], 'layout': key[2], 'samples': len(samples),
         'median': {metric: statistics.median(sample[metric] for sample in samples if metric in sample)
                    for metric in samples[0]},
         'worstFrameMs': max(sample['maxFrameMs'] for sample in samples)}
        for key, samples in groups.items()
    ]
    (output / 'measurements.json').write_text(json.dumps(report, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--device', required=True)
    parser.add_argument('--platform', choices=['web', 'native', 'both'], default='both')
    parser.add_argument('--notes', type=int, nargs='+', choices=[200, 1000, 5000], default=[200, 1000, 5000])
    parser.add_argument('--layouts', nargs='+', choices=['compact', 'full'], default=['compact', 'full'])
    parser.add_argument('--repeats', type=int, default=3)
    parser.add_argument('--seconds', type=int, choices=range(2, 21), default=8)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    if args.repeats < 1:
        parser.error('--repeats must be positive')
    args.output.mkdir(parents=True, exist_ok=True)
    git = lambda *cmd: subprocess.check_output(['git', *cmd], cwd=ROOT).decode().strip()
    report = {'schema': 2, 'collectedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'commit': git('rev-parse', 'HEAD'), 'status': git('status', '--short'),
              'trackedDiffSHA256': hashlib.sha256(subprocess.check_output(['git', 'diff', 'HEAD'], cwd=ROOT)).hexdigest(),
              'untrackedSHA256': {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in git('ls-files', '--others', '--exclude-standard').splitlines() if (ROOT / name).is_file()},
              'build': 'instrumented Debug, installed separately', 'runs': []}
    platforms = list(BUNDLES) if args.platform == 'both' else [args.platform]
    try:
        for platform in platforms:
            bundle = BUNDLES[platform]
            try:
                for notes in args.notes:
                    for layout in args.layouts:
                        for repeat in range(1, args.repeats + 1):
                            name = f'{platform}-{notes}-{layout}-{repeat}'
                            path = args.output / f'{name}.log'
                            cmd = ['xcrun', 'devicectl', 'device', 'process', 'launch', '--terminate-existing', '--console',
                                   '--device', args.device, bundle, '--replay-performance',
                                   f'--performance-notes={notes}', f'--performance-seconds={args.seconds}']
                            if layout == 'full':
                                cmd.append('--performance-full')
                            print(f'Measuring {name}', flush=True)
                            with path.open('w') as output:
                                process = subprocess.Popen(cmd, stdout=output, stderr=subprocess.STDOUT)
                                try:
                                    deadline = time.monotonic() + 100
                                    while time.monotonic() < deadline:
                                        rows = records(path)
                                        if any(row.get('phase') in ['complete', 'error'] for row in rows) or process.poll() is not None:
                                            break
                                        time.sleep(.2)
                                    rows = records(path)
                                finally:
                                    if process.poll() is None:
                                        process.terminate()
                                        try:
                                            process.wait(timeout=5)
                                        except subprocess.TimeoutExpired:
                                            process.kill(); process.wait()
                            report['runs'].append({'platform': platform, 'notes': notes, 'layout': layout, 'repeat': repeat, 'records': rows,
                                                   'noDrawableWarnings': path.read_text(errors='replace').count('no drawables available for rendering')})
                            save_report(report, args.output)
                            if not any(row.get('phase') == 'complete' for row in rows) or any(row.get('phase') == 'error' for row in rows):
                                raise RuntimeError(f'{name} failed; see {path}')
                            playback = next(row for row in rows if row.get('phase') == 'playback')
                            print(f"  {playback['fps']:.1f} fps, p95 {playback['frameP95Ms']:.2f} ms", flush=True)
            finally:
                # A normal launch restores the app, without fixtures or instrumentation.
                subprocess.run(['xcrun', 'devicectl', 'device', 'process', 'launch', '--terminate-existing',
                                '--device', args.device, bundle, '--timeout', '30'], check=True)
    finally:
        save_report(report, args.output)


if __name__ == '__main__':
    main()
