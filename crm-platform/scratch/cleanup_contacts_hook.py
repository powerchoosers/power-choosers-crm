import sys
import re

file_path = 'src/hooks/useContacts.ts'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace internal normalizePhoneDigits calls with normalizePhoneKey
content = content.replace('normalizePhoneDigits(value)', 'normalizePhoneKey(String(value ?? \'\'))')
content = content.replace('normalizePhoneDigits(cleanedNumber)', 'normalizePhoneKey(cleanedNumber)')

# Remove the internal normalizePhoneDigits function
content = re.sub(r'function normalizePhoneDigits\(value: unknown\) \{[\s\S]*?\}', '', content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully cleaned up useContacts.ts")
