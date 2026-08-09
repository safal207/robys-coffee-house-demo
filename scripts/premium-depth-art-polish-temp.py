from pathlib import Path

path = Path("day-night-entry.js")
text = path.read_text(encoding="utf-8")

def replace_once(old: str, new: str):
    global text
    if old not in text:
        raise SystemExit(f"missing anchor:\n{old[:220]}")
    text = text.replace(old, new, 1)

replace_once('''    goldBorder: "2px solid rgba(255,230,187,.96)",''', '''    goldBorder: "1px solid rgba(255,230,187,.68)",''')
replace_once('''    specularPeak: .8,
    haloBlur: "blur(22px)",''', '''    specularPeak: .84,
    ribbonPeak: .78,
    goldArcPeak: .72,
    goldArcEnd: .24,
    haloBlur: "blur(22px)",''')

replace_once('''    goldBorder: "2px solid rgba(247,191,113,.72)",''', '''    goldBorder: "1px solid rgba(247,191,113,.46)",''')
replace_once(
'''    focus: "radial-gradient(ellipse at center, rgba(255,226,179,.88) 0%, rgba(242,191,126,.66) 28%, rgba(165,88,44,.34) 50%, rgba(55,19,12,.08) 72%, rgba(13,5,5,0) 84%)",''',
'''    focus: "radial-gradient(ellipse at center, rgba(255,231,190,.95) 0%, rgba(246,197,132,.73) 28%, rgba(172,92,46,.38) 50%, rgba(55,19,12,.08) 72%, rgba(13,5,5,0) 84%)",''')
replace_once('''    specularPeak: .62,
    haloBlur: "blur(24px)",''', '''    specularPeak: .68,
    ribbonPeak: .7,
    goldArcPeak: .58,
    goldArcEnd: .18,
    haloBlur: "blur(24px)",''')

replace_once(
'''        opacity: .98 * phase(t, .03, .28) * mix(1, .86, settle),''',
'''        opacity: theme.ribbonPeak * phase(t, .03, .28) * mix(1, .82, settle),''')
replace_once(
'''        opacity: peak(t, .05, .54, 1, .94, .42),''',
'''        opacity: peak(t, .05, .54, 1, theme.goldArcPeak, theme.goldArcEnd),''')

path.write_text(text, encoding="utf-8", newline="\n")
print("premium depth art polish applied")
