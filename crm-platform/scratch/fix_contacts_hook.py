import sys

file_path = 'src/hooks/useContacts.ts'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_block = """        let query = supabase
          .from('contacts')
          .select(CONTACT_LIST_SELECT);

        if (listId) {
          // Fetch targetIds from list_members first due to lack of FK for inner join
          const { data: memberData, error: memberError } = await supabase
            .from('list_members')
            .select('targetId')
            .eq('listId', listId)
            .in('targetType', ['people', 'contact', 'contacts']);

          if (memberError) {
            console.error("Error fetching list members:", memberError);
            return { contacts: [], nextCursor: null };
          }

          const targetIds = memberData?.map(m => m.targetId).filter(Boolean) || [];
          if (targetIds.length === 0) {
            return { contacts: [], nextCursor: null };
          }

          query = query.in('id', targetIds);
        }"""

new_block = """        let query;

        if (listId) {
          // Use RPC for large lists to avoid URL length limits in GET requests
          query = supabase
            .rpc('get_contacts_by_list', { p_list_id: listId })
            .select(CONTACT_LIST_SELECT);
        } else {
          query = supabase
            .from('contacts')
            .select(CONTACT_LIST_SELECT);
        }"""

# Try to find the block ignoring minor whitespace differences at ends of lines
import re
# Escape special characters in old_block for regex
pattern = re.escape(old_block).replace(r'\ ', r'\s+')
# Replace newlines with optional whitespace/newlines
pattern = pattern.replace(r'\n', r'\s*\n\s*')

new_content = re.sub(pattern, new_block, content, count=1)

if new_content == content:
    print("Failed to find block")
    sys.exit(1)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)
print("Successfully updated")
