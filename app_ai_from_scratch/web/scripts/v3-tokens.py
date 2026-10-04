#!/usr/bin/env python3
"""Real tokens for every string /v3 shows as a chip.

    uv run --with tiktoken python3 web/scripts/v3-tokens.py            # (re)writes web/src/data/v3-tokens.json
    uv run --with tiktoken python3 web/scripts/v3-tokens.py --check    # exit 1 if the committed file is not what this would write

The strings come from the page's own sources through web/scripts/v3-token-strings.mts (the list is src/aegis/token-strings.ts). Each is cut with the o200k_base
vocabulary (GPT-4o) by tiktoken: the file holds, per language and per string, its pieces and their ids. A token whose bytes are not a whole UTF-8 character on their own
(the vocabulary splits some accents and symbols into bytes) is joined with the next ones until it is, so the pieces always join back into the string.
The guard test (web/test/v3-guard.test.mts) fails when a string changes and this file does not; it cannot run tiktoken, so THIS script is what makes the pieces real.
"""
import importlib.metadata
import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
WEB = HERE.parent
OUT = WEB / "src" / "data" / "v3-tokens.json"
ENCODING = "o200k_base"


def pieces_of(enc, text: str):
    ids = enc.encode(text)
    assert enc.decode(ids) == text, f"tiktoken does not round-trip {text!r}"
    pieces, buf, got = [], b"", []
    for i in ids:
        buf += enc.decode_single_token_bytes(i)
        got.append(i)
        try:
            piece = buf.decode("utf-8")
        except UnicodeDecodeError:
            continue  # half a character: keep the bytes, take the next token
        pieces.append([piece, *got])
        buf, got = b"", []
    assert not buf, f"{text!r} ends in half a character"
    assert "".join(p[0] for p in pieces) == text, f"the pieces of {text!r} do not join back into it"
    return pieces


def render(strings, enc) -> str:
    lines = ["{", f'  "encoding": {json.dumps(ENCODING)},', f'  "library": {json.dumps("tiktoken " + importlib.metadata.version("tiktoken"))},']
    for n, lang in enumerate(("es", "en")):
        lines.append(f'  "{lang}": {{')
        seen = {}
        for item in strings[lang]:
            seen.setdefault(item["text"], pieces_of(enc, item["text"]))
        keys = list(seen)
        for k, text in enumerate(keys):
            lines.append(f"    {json.dumps(text, ensure_ascii=False)}: {json.dumps(seen[text], ensure_ascii=False, separators=(',', ':'))}{',' if k < len(keys) - 1 else ''}")
        lines.append("  }" + ("," if n == 0 else ""))
    lines.append("}")
    return "\n".join(lines) + "\n"


def main() -> int:
    import tiktoken

    raw = subprocess.run(
        ["node", "--experimental-strip-types", "--no-warnings", str(HERE / "v3-token-strings.mts")],
        cwd=WEB, capture_output=True, text=True, check=True,
    ).stdout
    strings = json.loads(raw)
    text = render(strings, tiktoken.get_encoding(ENCODING))
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
            print(f"{OUT} is not what the current strings give: run  uv run --with tiktoken python3 web/scripts/v3-tokens.py", file=sys.stderr)
            return 1
        print(f"{OUT.name}: up to date")
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8")
    n = {lang: len({i["text"] for i in strings[lang]}) for lang in ("es", "en")}
    print(f"wrote {OUT} ({n['es']} es + {n['en']} en strings, {ENCODING})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
