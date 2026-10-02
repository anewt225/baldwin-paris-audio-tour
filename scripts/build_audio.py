"""Render the tour narration to MP3 with a Microsoft neural voice (via edge-tts).

Reads stops.json, writes one MP3 per stop to audio/, plus audio/index.json with each
stop's file name, duration and paragraph start times (used for tap-to-seek and
paragraph highlighting). Stops whose text and voice haven't changed are skipped.

    uv run scripts/build_audio.py           # build changed stops
    uv run scripts/build_audio.py --force   # rebuild everything
"""

import asyncio
import hashlib
import json
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / "audio"
INDEX = AUDIO / "index.json"
BYTES_PER_SEC = 48_000 / 8  # edge-tts default: 24 kHz, 48 kbit/s CBR mono MP3


async def synth(text: str, voice: str) -> bytes:
    chunks = []
    async for msg in edge_tts.Communicate(text, voice).stream():
        if msg["type"] == "audio":
            chunks.append(msg["data"])
    return b"".join(chunks)


async def build_stop(stop: dict, voice: str) -> dict:
    parts, starts, t = [], [], 0.0
    for para in stop["text"]:
        mp3 = await synth(para, voice)
        starts.append(round(t, 2))
        t += len(mp3) / BYTES_PER_SEC
        parts.append(mp3)
    return {"data": b"".join(parts), "duration": round(t, 2), "starts": starts}


async def main(force: bool) -> None:
    tour = json.loads((ROOT / "stops.json").read_text(encoding="utf-8"))
    voice = tour["voice"]
    old = json.loads(INDEX.read_text(encoding="utf-8")) if INDEX.exists() else {}
    AUDIO.mkdir(exist_ok=True)
    index = {"voice": voice, "stops": {}}

    for stop in tour["stops"]:
        key = hashlib.sha256(json.dumps([voice, stop["text"]]).encode()).hexdigest()[:10]
        file = f"{stop['id']}.{key}.mp3"
        prev = old.get("stops", {}).get(stop["id"])
        if not force and prev and prev["file"] == file and (AUDIO / file).exists():
            index["stops"][stop["id"]] = prev
            print(f"  unchanged  {stop['id']}")
            continue
        built = await build_stop(stop, voice)
        (AUDIO / file).write_bytes(built["data"])
        index["stops"][stop["id"]] = {"file": file, "duration": built["duration"], "starts": built["starts"]}
        print(f"  built      {stop['id']}  {built['duration']:.0f}s")

    keep = {s["file"] for s in index["stops"].values()}
    for f in AUDIO.glob("*.mp3"):
        if f.name not in keep:
            f.unlink()
            print(f"  removed    {f.name}")

    INDEX.write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
    total = sum(s["duration"] for s in index["stops"].values())
    print(f"Done: {len(keep)} stops, {total / 60:.1f} min of narration")


if __name__ == "__main__":
    asyncio.run(main("--force" in sys.argv))
