import re
import subprocess
import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

target = sys.argv[1] if len(sys.argv) > 1 else 'index.html'

with open(target, 'r', encoding='utf-8') as f:
    content = f.read()

# Strip HTML comments before extracting script tags so comments mentioning <script> are ignored
html_no_comments = re.sub(r'<!--.*?-->', '', content, flags=re.DOTALL)

scripts = re.findall(r'<script([^>]*)>(.*?)</script>', html_no_comments, re.DOTALL)
print(f'Checking {target}: Total script tags found: {len(scripts)}')

all_ok = True
for idx, (attrs, code) in enumerate(scripts):
    if not code.strip():
        print(f'Script {idx} OK (empty or external src)')
        continue
    is_module = 'type="module"' in attrs or "type='module'" in attrs
    clean_code = code
    
    temp_file = f'_temp_check_{idx}.mjs' if is_module else f'_temp_check_{idx}.js'
    with open(temp_file, 'w', encoding='utf-8') as tf:
        tf.write(clean_code)
    
    node_cmd = ['node', '--check', temp_file]
    
    res = subprocess.run(node_cmd, capture_output=True, text=True)
    if os.path.exists(temp_file):
        os.remove(temp_file)
        
    if res.returncode != 0:
        all_ok = False
        print(f'Script {idx} FAILED (module={is_module}):')
        print(res.stderr[:400])
    else:
        print(f'Script {idx} OK (module={is_module}, {len(code)} chars)')

if all_ok:
    print(f'ALL {len(scripts)} SCRIPTS VALIDATED CLEAN! \u2705')
else:
    print('SOME SCRIPTS FAILED SYNTAX VALIDATION! \u274c')
    sys.exit(1)
