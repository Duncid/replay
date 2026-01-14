import sys
from pathlib import Path
from music21 import converter, tempo
try:
    import pretty_midi
except ImportError:
    pass

def check_structure(mxl_path, midi_path):
    print(f"Checking {mxl_path}")
    score = converter.parse(str(mxl_path))
    boundaries = []
    try:
        # Try unpacking 3
        for start, end, mark in score.metronomeMarkBoundaries():
             if isinstance(mark, tempo.MetronomeMark):
                bpm = mark.number or 120.0
                boundaries.append((float(start), float(bpm)))
    except ValueError:
        # Fallback to unpacking 2 (old music21 if environment is mixed, but we know it failed before)
        for offset, mark in score.metronomeMarkBoundaries():
             if isinstance(mark, tempo.MetronomeMark):
                bpm = mark.number or 120.0
                boundaries.append((float(offset), float(bpm)))
    
    print(f"XML Tempo Map: {boundaries}")

    if midi_path and Path(midi_path).exists():
        print(f"Checking {midi_path}")
        pm = pretty_midi.PrettyMIDI(str(midi_path))
        tempi, times = pm.get_tempo_changes()
        print(f"MIDI Tempos: {tempi}")
        print(f"MIDI Times: {times}")
        print(f"First note start: {pm.instruments[0].notes[0].start}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python debug_inputs.py <mxl_file> [midi_file]")
        sys.exit(1)
    check_structure(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
