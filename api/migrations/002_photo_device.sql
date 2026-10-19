-- Guest photo limits count per device (a random id the guest page keeps), not per typed name
ALTER TABLE $s.photos ADD COLUMN device_id text;
CREATE INDEX ON $s.photos (event_id, device_id);
