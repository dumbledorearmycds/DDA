import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the SETS block
start_marker = 'const SETS = ['
end_marker = '];\n\n        // ─── CARD ART HELPER'

start_pos = content.find(start_marker)
end_pos = content.find(end_marker, start_pos)

if start_pos == -1 or end_pos == -1:
    print("Could not find SETS block!")
    exit(1)

sets_block = content[start_pos:end_pos + 2]
print(f"SETS block length: {len(sets_block)}")

# Count sets
set_names = re.findall(r'name:\s*"Set \d+ [–-] ([^"]+)"', sets_block)
print("Found sets:", len(set_names), set_names)

# Count total cards by matching name: "..." inside cards
card_names = re.findall(r'cards:\s*\[(.*?)\]\s*,\s*\}', sets_block, re.DOTALL)
print("Found card lists:", len(card_names))
for i, cl in enumerate(card_names):
    cards = re.findall(r'name:\s*"([^"]+)"', cl)
    print(f"Set {i+1} has {len(cards)} cards: {cards[:3]} ... {cards[-1:]}")
