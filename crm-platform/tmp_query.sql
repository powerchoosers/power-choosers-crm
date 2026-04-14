select id, name, status, ownerId, createdAt, updatedAt, jsonb_array_length(coalesce(steps,'[]'::jsonb)) as step_count,
       left(coalesce(description,''), 120) as description
from sequences
order by createdAt desc
limit 20;
