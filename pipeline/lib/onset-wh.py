import sys
from faster_whisper import WhisperModel
m=WhisperModel("small", device="cpu", compute_type="int8")
for f in sys.argv[1:]:
    segs,_=m.transcribe(f, language="ko", word_timestamps=True, vad_filter=False, beam_size=5)
    print("=====", f.split("/")[-1])
    for s in segs:
        for w in (s.words or []):
            print("  %6.3f - %6.3f  %s" % (w.start, w.end, w.word))
