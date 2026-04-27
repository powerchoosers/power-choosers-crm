import sys
import re

file_path = 'src/hooks/useContacts.ts'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update imports
import_old = r'normalizeSignalScore,'
import_new = 'normalizeSignalScore,\n  normalizePhoneKey,'
content = content.replace(import_old, import_new)

# 2. Update normalizeSignalCollection
# We want to replace line 340 (roughly) with normalizePhoneKey usage
old_normalize_entry = r'key:\s*kind\s*===\s*\'phone\'\s*\?\s*value\.replace\(/\\D/g,\s*\'\'\)\s*:\s*value\.toLowerCase\(\),'
new_normalize_entry = "key: kind === 'phone' ? normalizePhoneKey(value) : value.toLowerCase(),"

content = re.sub(old_normalize_entry, new_normalize_entry, content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully updated useContacts.ts")
