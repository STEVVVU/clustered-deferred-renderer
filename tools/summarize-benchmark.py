"""Validate retained browser-native benchmark evidence and curate its rows."""
import argparse
import hashlib
import json
from pathlib import Path
import statistics
import subprocess


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('benchmark', type=Path)
    parser.add_argument('verification', type=Path)
    parser.add_argument('--output', type=Path, default=Path('docs/evidence/benchmark/metrics-summary.json'))
    args = parser.parse_args()
    raw = json.loads(args.benchmark.read_text())
    verification = json.loads(args.verification.read_text())
    if not raw['pass'] or not verification['pass'] or len(raw['results']) != 6:
        raise ValueError('Incomplete or failed browser evidence')
    rows = []
    for case in raw['results']:
        if len(case['sides']) != 4 or any(not check['pass'] for check in case['correctness']):
            raise ValueError('Missing side or failed quality check')
        for side in case['sides']:
            if len(side['repeats']) != 7 or len(side['wallFrameMs']['samples']) != 140:
                raise ValueError('Missing repetitions or frames')
            if {repeat['repeat'] for repeat in side['repeats']} != set(range(7)):
                raise ValueError('Duplicated or missing repetition')
            for repeat in side['repeats']:
                if repeat['offered'] != 20 or repeat['finished'] != 20 or repeat['failed'] != 0 or not repeat['correctness']['pass']:
                    raise ValueError('Failed or incomplete sampled frame')
            values = [repeat['wall']['p50'] for repeat in side['repeats']]
            gpu = [repeat['gpu']['p50'] for repeat in side['repeats'] if repeat['gpu'] is not None]
            rows.append({'workload': case['workload'], 'triangles': case['triangles'], 'side': side['name'], 'wallFrameMs': side['wallFrameMs'], 'gpuFrameMs': side['gpuFrameMs'], 'repeatWallP50Ms': values, 'repeatWallP50RangeMs': [min(values), max(values)], 'medianRepeatWallP50Ms': statistics.median(values), 'repeatGpuP50Ms': gpu, 'repeatGpuP50RangeMs': [min(gpu), max(gpu)] if gpu else None, 'quality': case['correctness'], 'logicalAllocation': side['logicalAllocation'], 'finalDiagnosticStagesMs': side['finalDiagnosticStagesMs']})
    sources = sorted(Path('sample/clusteredRendering').glob('*'))
    hashes = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in sources if path.is_file()}
    diff = subprocess.check_output(['git', 'diff', 'HEAD', '--', 'sample/clusteredRendering'])
    result = {'pass': True, 'adapter': raw['adapter'], 'userAgent': raw['userAgent'], 'timingScope': raw['timingScope'], 'warmupFramesPerSide': raw['warmupFramesPerSide'], 'repeatsPerSide': 7, 'framesPerRepeat': 20, 'sourceIdentityScope': 'Unchanged source snapshot after visible capture; source identity was not embedded in browser export', 'sourceSha': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(), 'sourceDiffSha256': hashlib.sha256(diff).hexdigest(), 'sourceFilesSha256': hashes, 'rawSha256': {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in (args.benchmark, args.verification)}, 'rows': rows}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(args.output)


if __name__ == '__main__':
    main()
