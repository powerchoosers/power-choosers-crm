-- Enable Supabase Realtime broadcasting on the notifications table.
-- Without this, the postgres_changes subscription in GlobalSync never fires,
-- meaning RSVP accept/decline notifications are written to the DB correctly
-- but the CRM UI never receives them (no toast, no badge update).
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
