-- Study With Rameen · Attendance: rename "late" → "leave" (2026-07-23)
-- "Leave" is an excused absence — it should neither help nor hurt a
-- student's attendance %, so it's excluded from the calculation entirely
-- (both numerator and denominator), unlike the old "late" which counted
-- as attended. Any already-marked "late" rows are migrated to "leave" so
-- they don't violate the new check constraint or silently vanish.

update public.attendance set status = 'leave' where status = 'late';

alter table public.attendance drop constraint if exists attendance_status_check;
alter table public.attendance add constraint attendance_status_check
  check (status in ('present', 'absent', 'leave'));
