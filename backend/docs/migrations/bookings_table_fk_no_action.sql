-- ON DELETE SET NULL let a table be deleted under paid bookings: the booking
-- stayed, its table was gone. NO ACTION refuses that delete. Deleting a whole
-- event still works: events -> event_tables and events -> bookings both cascade
-- and the check runs at the end of the statement.
alter table public.bookings drop constraint bookings_table_id_fkey;
alter table public.bookings add constraint bookings_table_id_fkey
  foreign key (table_id) references public.event_tables(id) on delete no action;
