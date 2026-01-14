from music21 import stream, tempo
s = stream.Score()
s.insert(0, tempo.MetronomeMark(number=120))
try:
    print(f"Boundaries: {s.metronomeMarkBoundaries()}")
    for item in s.metronomeMarkBoundaries():
        print(f"Item: {item}, Length: {len(item)}")
except Exception as e:
    print(f"Error: {e}")
